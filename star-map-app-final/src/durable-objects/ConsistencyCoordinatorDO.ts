/**
 * Consistency Coordinator (T-SM-KVRACE): one SQLite Durable Object per
 * token / email, holding the authoritative state for three flows whose
 * KV check-then-write sequences were racy (A2-1 magic-token claim,
 * A2-2 account email session index, A2-3 promotions subscribe/delivery).
 * The pure transition machines live in
 * src/lib/consistencyCoordinatorState.ts; this class is the thin shell.
 *
 * Object identity (idFromName, derived by the client):
 *   magic:v1:<sha256(token)>          one object per magic token
 *   account:v1:<existing email hash>  one object per account email
 *   promotion:v1:<email hash>         one object per promotion email
 *
 * Storage shape follows the entitlement/review precedents: ONE JSON
 * document row per object. Every mutation is computed by the pure state
 * machine and persisted with a single upsert, and every method body is
 * synchronous between read and write, so a transition is atomic by
 * construction — no partial update is possible and no transaction is
 * ever held open across a KV or provider call (the coordinator never
 * touches KV; legacy import facts are gathered by the client and passed
 * in, and provider calls happen in the claim→deliver→complete sequence
 * with the claim committed first).
 *
 * A corrupt or kind-mismatched stored document fails closed (throws):
 * silently resetting e.g. a consumed token or a subscription record
 * would resurrect exactly the races this object exists to close.
 */
import { DurableObject } from "cloudflare:workers";
import {
  applyClaimPromotionJob,
  applyCompletePromotionJob,
  applyConsumeMagicToken,
  applyPromotionAlarm,
  applyReadAccountSessions,
  applyRegisterMagicToken,
  applySubscribePromotion,
  applyUnsubscribePromotion,
  applyUpsertAccountSession,
  isValidAccountIndexState,
  isValidMagicTokenState,
  isValidPromotionState,
  nextPromotionAlarmAt,
  type AccountIndexCoordinatorState,
  type AccountSessionsView,
  type ClaimPromotionJobResult,
  type ConsumeMagicTokenResult,
  type LegacyMagicLinkRecord,
  type MagicTokenCoordinatorState,
  type PromotionCoordinatorState,
  type PromotionJobKind,
  type PromotionJobPayload,
  type PromotionLegacyFacts,
  type PromotionSendOutcome,
} from "../lib/consistencyCoordinatorState";
import type { AccountLiteSessionIndexItem } from "../lib/accountLite";
import { evaluatePromotionDispatchPermission } from "../lib/promotionDispatchGuard";
import {
  deliverPromotionSend,
  getPromotionFollowupDelaySeconds,
  preparePromotionFollowupPayload,
  selectPromotionProvider,
  type PromotionDeliveryOutcome,
} from "../lib/promotions";

type CoordinatorRow = {
  object_id: string;
  state_json: string;
  updated_at: number;
};

type AnyCoordinatorState =
  | MagicTokenCoordinatorState
  | AccountIndexCoordinatorState
  | PromotionCoordinatorState;

function outcomeToCoordinator(outcome: PromotionDeliveryOutcome): PromotionSendOutcome {
  if (outcome.outcome === "accepted") {
    return {
      type: "accepted",
      provider: outcome.provider,
      providerMessageId: outcome.providerMessageId ?? null,
    };
  }
  if (outcome.outcome === "definitive_failure") {
    return { type: "definitive_failure", provider: outcome.provider, error: outcome.error };
  }
  if (outcome.outcome === "ambiguous") {
    return {
      type: "ambiguous",
      provider: outcome.provider,
      error: outcome.error,
      idempotencyGuaranteed: outcome.idempotencyGuaranteed,
    };
  }
  if (outcome.outcome === "refused") {
    // Dispatch fence refusal (gate-1 fencing build): no provider was
    // attempted; completion uses the no-attempt semantics (claim
    // restored, or cancelled when the refusal was a committed
    // unsubscribe) — see promotionCoordinator.ts's identical mapping.
    return { type: "unconfigured" };
  }
  return { type: "unconfigured" };
}

export class ConsistencyCoordinatorDO extends DurableObject {
  private readonly objectId: string;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.objectId = ctx.id.name ?? "";
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS consistency_state (
          object_id TEXT PRIMARY KEY,
          state_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
    });
  }

  private readDocument(): AnyCoordinatorState | null {
    const rows = this.ctx.storage.sql
      .exec<CoordinatorRow>(
        "SELECT object_id, state_json, updated_at FROM consistency_state WHERE object_id = ? LIMIT 1",
        this.objectId,
      )
      .toArray();
    if (rows.length === 0) return null;
    const parsed = JSON.parse(rows[0].state_json) as AnyCoordinatorState;
    if (
      !isValidMagicTokenState(parsed) &&
      !isValidAccountIndexState(parsed) &&
      !isValidPromotionState(parsed)
    ) {
      throw new Error(`consistency coordinator state malformed for ${this.objectId}`);
    }
    return parsed;
  }

  private writeDocument(state: AnyCoordinatorState): void {
    const serialised = JSON.stringify(state);
    // updated_at is bookkeeping only; domain timestamps live in the
    // document itself. Date.now() at write time is close enough.
    const now = Date.now();
    this.ctx.storage.sql.exec(
      `INSERT INTO consistency_state (object_id, state_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(object_id) DO UPDATE SET
          state_json = excluded.state_json,
          updated_at = excluded.updated_at
      `,
      this.objectId,
      serialised,
      now,
    );
  }

  private readKind<K extends AnyCoordinatorState["kind"]>(
    kind: K,
  ): Extract<AnyCoordinatorState, { kind: K }> | null {
    const doc = this.readDocument();
    if (doc === null) return null;
    if (doc.kind !== kind) {
      throw new Error(
        `consistency coordinator kind mismatch for ${this.objectId}: expected ${kind}, found ${doc.kind}`,
      );
    }
    return doc as Extract<AnyCoordinatorState, { kind: K }>;
  }

  /* ---------------- A2-1: magic token ---------------- */

  async registerMagicToken(input: {
    email: string;
    emailHash: string;
    expiresAt: number;
    now: number;
  }): Promise<{ registered: boolean }> {
    const current = this.readKind("magic");
    const result = applyRegisterMagicToken(current, input);
    if (result.changed) this.writeDocument(result.state);
    return { registered: true };
  }

  async consumeMagicToken(input: {
    legacyRecord: LegacyMagicLinkRecord | null;
    legacyTtlMs: number;
    now: number;
  }): Promise<ConsumeMagicTokenResult> {
    const current = this.readKind("magic");
    const result = applyConsumeMagicToken(current, input);
    if (result.changed && result.state) this.writeDocument(result.state);
    return result.result;
  }

  /* ---------------- A2-2: account email index ---------------- */

  async upsertAccountSession(input: {
    emailHash: string;
    session: AccountLiteSessionIndexItem;
    legacySessions: AccountLiteSessionIndexItem[] | null;
    legacyUpdatedAt: number | null;
    now: number;
  }): Promise<{ view: AccountSessionsView | null }> {
    const current = this.readKind("account");
    const result = applyUpsertAccountSession(current, input);
    if (result.changed) this.writeDocument(result.state);
    return { view: result.view };
  }

  async getAccountSessions(input: {
    emailHash: string;
    legacySessions: AccountLiteSessionIndexItem[] | null;
    legacyUpdatedAt: number | null;
  }): Promise<{ view: AccountSessionsView | null }> {
    const current = this.readKind("account");
    const result = applyReadAccountSessions(current, input);
    if (result.changed && result.state) this.writeDocument(result.state);
    return { view: result.view };
  }

  /* ---------------- A2-3: promotions ---------------- */

  async subscribePromotion(input: {
    emailHash: string;
    source: string;
    now: number;
    facts: PromotionLegacyFacts;
    couponPayload: PromotionJobPayload;
    followupPayload?: PromotionJobPayload;
  }): Promise<{ isNewSubscriber: boolean; state: PromotionCoordinatorState }> {
    const current = this.readKind("promotion");
    const result = applySubscribePromotion(current, input);
    if (result.changed) this.writeDocument(result.state);
    await this.syncAlarm(result.state);
    return { isNewSubscriber: result.isNewSubscriber, state: result.state };
  }

  async unsubscribePromotion(input: {
    emailHash: string;
    now: number;
    reason: string;
    facts: PromotionLegacyFacts;
  }): Promise<{ wasAlreadyUnsubscribed: boolean; state: PromotionCoordinatorState }> {
    const current = this.readKind("promotion");
    const result = applyUnsubscribePromotion(current, input);
    if (result.changed) this.writeDocument(result.state);
    await this.syncAlarm(result.state);
    return { wasAlreadyUnsubscribed: result.wasAlreadyUnsubscribed, state: result.state };
  }

  async claimPromotionJob(input: {
    kind: PromotionJobKind;
    now: number;
    attemptProvider?: string | null;
    attemptIdempotencyGuaranteed?: boolean | null;
  }): Promise<{ claim: ClaimPromotionJobResult }> {
    const current = this.readKind("promotion");
    if (!current) return { claim: null };
    // The claim commits the provider selection that will cover the
    // attempt BEFORE the driver calls the provider. Callers may pass
    // their own selection; otherwise this object's env decides (same
    // worker env the delivery chain reads).
    const selection = selectPromotionProvider();
    const result = applyClaimPromotionJob(current, {
      kind: input.kind,
      now: input.now,
      attemptProvider: input.attemptProvider ?? selection?.provider ?? null,
      attemptIdempotencyGuaranteed:
        input.attemptIdempotencyGuaranteed ?? selection?.idempotencyGuaranteed ?? null,
    });
    if (result.changed) {
      this.writeDocument(result.state);
      await this.syncAlarm(result.state);
    }
    return { claim: result.claim };
  }

  async completePromotionJob(input: {
    kind: PromotionJobKind;
    outcome: PromotionSendOutcome;
    now: number;
    followupPayload?: PromotionJobPayload;
  }): Promise<{ state: PromotionCoordinatorState | null }> {
    const current = this.readKind("promotion");
    if (!current) return { state: null };
    const result = applyCompletePromotionJob(current, input);
    if (result.changed) {
      this.writeDocument(result.state);
      await this.syncAlarm(result.state);
    }
    return { state: result.state };
  }

  async getPromotionState(): Promise<PromotionCoordinatorState | null> {
    return this.readKind("promotion");
  }

  /* ---------------- alarm: durable promotion retries ---------------- */

  private async syncAlarm(state: PromotionCoordinatorState): Promise<void> {
    const target = nextPromotionAlarmAt(state, Date.now());
    const current = await this.ctx.storage.getAlarm();
    if (target === null) {
      if (current !== null) await this.ctx.storage.deleteAlarm();
      return;
    }
    if (current === null || current !== target) {
      await this.ctx.storage.setAlarm(target);
    }
  }

  /**
   * Drives due promotion jobs for THIS object: reclaim stale claims,
   * then claim → deliver → complete for each due kind, in order, so a
   * coupon acceptance creates (and immediately attempts) the followup
   * in the same pass, exactly as the subscribe route does inline.
   * Each completion is persisted before the next provider call, so a
   * crash mid-pass resumes from committed state. Delivery awaits the
   * provider, so each completion is applied to a freshly re-read
   * document — never to this pass's pre-send snapshot, which a
   * concurrent RPC may have superseded.
   */
  async alarm(): Promise<void> {
    const initial = this.readKind("promotion");
    if (!initial) return;
    const now = Date.now();
    const alarmed = applyPromotionAlarm(initial, { now });
    let state = alarmed.state;
    if (alarmed.changed) this.writeDocument(state);

    // Attempt every kind in driver order (coupon before followup, so a
    // coupon acceptance can create and immediately attempt the
    // followup). The claim op itself enforces due-ness — kinds that
    // are not due return no claim.
    const selection = selectPromotionProvider();
    for (const kind of ["coupon", "followup"] as const) {
      const claimed = applyClaimPromotionJob(state, {
        kind,
        now: Date.now(),
        attemptProvider: selection?.provider ?? null,
        attemptIdempotencyGuaranteed: selection?.idempotencyGuaranteed ?? null,
      });
      if (!claimed.claim) {
        state = claimed.state;
        if (claimed.changed) this.writeDocument(state);
        continue;
      }
      state = claimed.state;
      this.writeDocument(state);

      let outcome: PromotionSendOutcome;
      try {
        const delivery = await deliverPromotionSend(
          claimed.claim.payload,
          claimed.claim.providerIdempotencyKey,
          {
            // Dispatch fence (gate-1 fencing build): the authority for
            // this object is THIS document — evaluate it directly,
            // re-read at dispatch time. (No client/RPC: an alarm has no
            // request context, and a self-RPC would add a failure mode
            // without adding authority.) Legacy facts are already
            // folded into the document's own fields by the import.
            checkDispatchPermission: async () =>
              evaluatePromotionDispatchPermission({
                coordinatorState: this.readKind("promotion"),
                legacyState: null,
                legacyListMember: false,
              }),
          },
        );
        outcome = outcomeToCoordinator(delivery);
      } catch (error) {
        outcome = {
          type: "ambiguous",
          provider: "none",
          error: error instanceof Error ? error.message.slice(0, 200) : "alarm_delivery_failed",
          // A throw outside the classified delivery path carries no
          // provider guarantee; the job blocks rather than risking a
          // duplicate. (deliverPromotionSend classifies its own legs,
          // so this branch is defensive only.)
          idempotencyGuaranteed: false,
        };
      }

      // The provider call above is an external await: RPCs (an
      // unsubscribe, a resubscribe) may have committed newer state
      // while it was in flight. Re-read the document and apply the
      // completion to the CURRENT state — completing against this
      // pass's pre-send snapshot would overwrite those commits with
      // stale subscription fields.
      const fresh = this.readKind("promotion");
      if (!fresh) return;
      const completedAt = Date.now();
      const completed = applyCompletePromotionJob(fresh, {
        kind,
        outcome,
        now: completedAt,
        // Followup creation stays atomic with coupon acceptance on
        // every path: its frozen payload is prepared here, scheduled
        // from the acceptance instant, from the coupon payload's own
        // frozen email + coupon code.
        followupPayload:
          kind === "coupon"
            ? preparePromotionFollowupPayload(
                claimed.claim.payload.email,
                claimed.claim.payload.couponCode,
                new Date(completedAt + getPromotionFollowupDelaySeconds() * 1000).toISOString(),
              )
            : undefined,
      });
      state = completed.state;
      if (completed.changed) this.writeDocument(state);
    }

    await this.syncAlarm(state);
  }
}
