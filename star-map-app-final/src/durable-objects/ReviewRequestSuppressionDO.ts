/**
 * Per-recipient review-request suppression record + dispatch coordinator.
 *
 * One instance per HMAC-keyed recipient name (see
 * deriveReviewSuppressionName — the raw email never names an instance).
 * The instance holds the authoritative suppression flag for review
 * requests, and its `dispatch` RPC is the ONLY component that may call the
 * email provider for a review request (T-T1 revised design): the final
 * suppression check, the ledger's dispatch commit, the post-commit
 * eligibility re-check against fresh source records, the deadline
 * re-check at the point of invocation, the single provider call with the
 * frozen payload, and the outcome recording all happen behind this one
 * door, so no other code path can send around the gate.
 *
 * Retention (S54-5 design (a)): the suppression flag is permanent, but
 * its optional metadata (source, timestamps) is minimized at the
 * 13-month boundary by a DO alarm armed when the metadata is recorded;
 * minimization never touches the flag itself.
 */
import { DurableObject } from "cloudflare:workers";
import { createReviewLedgerClient } from "../lib/reviewRequestLedger";
import { createReviewDispatchEligibilityChecker } from "../lib/reviewRequests";
import {
  executeReviewDispatch,
  isReviewSuppressionMinimized,
  reviewRetentionDeadlineMs,
  reviewSuppressionMinimizationDue,
  sanitizeReviewSuppressionSource,
  type ReviewDispatchOutcome,
  type ReviewSendInput,
  type ReviewSendResult,
} from "../lib/reviewRequestSuppression";
import { ENTITLEMENT_KV, type StripeSessionEntitlement } from "../lib/entitlementsStore";
import { printOrderKey, type PrintOrderRecord } from "../lib/printOrders";
import { sendResendEmail } from "../lib/resend";

type SuppressionRow = {
  suppressed: number;
  source: string | null;
  suppressed_at: number | null;
  updated_at: number | null;
};

async function sendViaResend(input: ReviewSendInput): Promise<ReviewSendResult> {
  // From and Reply-To come from the FROZEN payload (frozen at first
  // claim), never re-derived from the environment per attempt — a config
  // change between attempts must not diverge a retry from the first send.
  // A payload frozen before the freeze covered these fields carries
  // `undefined`: pass that through so the adapter's env default applies,
  // exactly as it did when the payload was frozen.
  const result = await sendResendEmail({
    to: input.to,
    from: input.from || undefined,
    replyTo: input.replyTo,
    subject: input.subject,
    html: input.html,
    text: input.text,
    headers: input.headers,
    idempotencyKey: input.idempotencyKey,
    tags: input.tags,
  });
  if (result.ok) {
    return { ok: true, id: result.id || null };
  }
  return { ok: false, error: result.error };
}

export class ReviewRequestSuppressionDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS review_suppression (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          suppressed INTEGER NOT NULL DEFAULT 0,
          source TEXT,
          suppressed_at INTEGER,
          updated_at INTEGER
        )
      `);
    });
  }

  private readRow(): SuppressionRow | null {
    const rows = this.ctx.storage.sql
      .exec<SuppressionRow>(
        "SELECT suppressed, source, suppressed_at, updated_at FROM review_suppression WHERE id = 1 LIMIT 1"
      )
      .toArray();
    return rows.length === 0 ? null : rows[0];
  }

  private writeRow(row: SuppressionRow): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO review_suppression (id, suppressed, source, suppressed_at, updated_at)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         suppressed = excluded.suppressed,
         source = excluded.source,
         suppressed_at = excluded.suppressed_at,
         updated_at = excluded.updated_at`,
      row.suppressed,
      row.source,
      row.suppressed_at,
      row.updated_at
    );
  }

  /**
   * Retention minimization (S54-5 design (a)): strip the optional
   * metadata (source + event timestamps) and keep ONLY the suppression
   * flag. This is the one retention write the DO ever makes on its own —
   * it must never clear or erase the suppression itself, and it rereads
   * nothing stale: callers pass the row they just read, and the write
   * touches metadata fields only.
   */
  private minimize(): void {
    this.writeRow({ suppressed: 1, source: null, suppressed_at: null, updated_at: null });
  }

  async check(): Promise<{ suppressed: boolean }> {
    const row = this.readRow();
    if (row && reviewSuppressionMinimizationDue(row, Date.now())) {
      // Lazy repair alongside the alarm: a record whose alarm was lost
      // still minimizes at its boundary on the next read. The answer is
      // unaffected — minimization never changes the suppression flag.
      this.minimize();
      await this.ctx.storage.deleteAlarm();
      return { suppressed: true };
    }
    return { suppressed: (row?.suppressed ?? 0) === 1 };
  }

  async record(input: { source: string; now: number }): Promise<{ suppressed: boolean }> {
    const existing = this.readRow();
    if (existing && existing.suppressed === 1) {
      if (isReviewSuppressionMinimized(existing)) {
        // Already minimized: stays minimized. A repeated opt-out never
        // resurrects metadata or restarts the retention clock.
        return { suppressed: true };
      }
      // The EARLIEST known opt-out owns the metadata deadline. The
      // incoming opt-out time can PREDATE this record's own timestamp:
      // the retention sweep migrates legacy rows with their ORIGINAL
      // optedOutAt (S54-5B), and a legacy opt-out may be older than the
      // moment this DO record was established (the recipient opted out
      // again through the current route after the legacy one). The
      // anchor is therefore the earlier of the stored timestamp and the
      // incoming one: an earlier incoming time pulls the stored anchor
      // BACK, a later one never moves it forward — arming the cleanup
      // alarm from the later timestamp alone would retain the metadata
      // past its original 13-month deadline.
      const anchor = Math.min(existing.suppressed_at ?? input.now, input.now);
      // Arm the cleanup obligation before mutating the retained
      // metadata (the establish path's ordering below): an alarm armed
      // for a write that then failed is a harmless no-op when it fires,
      // because the handler rereads current state. When the anchor is
      // already past its deadline the alarm fires immediately and the
      // alarm()/check() paths minimize on that touch.
      await this.ctx.storage.setAlarm(reviewRetentionDeadlineMs(anchor));
      if (existing.suppressed_at !== null && anchor < existing.suppressed_at) {
        this.writeRow({ ...existing, suppressed_at: anchor });
      }
      return { suppressed: true };
    }
    // Establish the durable cleanup obligation BEFORE committing the
    // retained metadata (design ordering); the alarm handler and the
    // check() repair path reread current state, so an alarm armed for a
    // write that then failed is a harmless no-op when it fires.
    await this.ctx.storage.setAlarm(reviewRetentionDeadlineMs(input.now));
    this.writeRow({
      suppressed: 1,
      source: sanitizeReviewSuppressionSource(input.source),
      suppressed_at: input.now,
      updated_at: input.now,
    });
    return { suppressed: true };
  }

  /**
   * Retention alarm: minimize this record's metadata at its 13-month
   * boundary. Rereads current state and modifies ONLY metadata — the
   * suppression bit is never replaced from a snapshot. An early firing
   * re-arms for the real deadline.
   */
  async alarm(): Promise<void> {
    const row = this.readRow();
    if (!row || row.suppressed !== 1 || row.suppressed_at === null) return;
    if (reviewSuppressionMinimizationDue(row, Date.now())) {
      this.minimize();
      return;
    }
    await this.ctx.storage.setAlarm(reviewRetentionDeadlineMs(row.suppressed_at));
  }

  async clear(input: { now: number }): Promise<{ suppressed: boolean }> {
    this.writeRow({ suppressed: 0, source: null, suppressed_at: null, updated_at: input.now });
    await this.ctx.storage.deleteAlarm();
    return { suppressed: false };
  }

  async erase(): Promise<{ suppressed: boolean }> {
    this.ctx.storage.sql.exec("DELETE FROM review_suppression WHERE id = 1");
    await this.ctx.storage.deleteAlarm();
    return { suppressed: false };
  }

  /**
   * The single provider-call path. The ledger client is built from this
   * DO's own env (explicit bindings — no request context exists here).
   * The eligibility checker is wired HERE, inside the coordinator
   * (S54-5 design (b) as revised): it reads the entitlement and print
   * records fresh from this worker's KV binding at dispatch time. A
   * missing binding makes its readers throw, which the coordinator
   * treats as an unavailable authority — no send.
   */
  async dispatch(input: { sessionId: string; claimId: string }): Promise<ReviewDispatchOutcome> {
    const ledger = createReviewLedgerClient(this.env);
    const kv = kvFromEnv(this.env);
    const checkEligibility = createReviewDispatchEligibilityChecker({
      getEntitlement: async (sessionId) => {
        if (!kv) throw new Error("eligibility_kv_unavailable");
        return kv.get<StripeSessionEntitlement>(ENTITLEMENT_KV.stripeSession(sessionId), "json");
      },
      getPrintRecord: async (sessionId) => {
        if (!kv) throw new Error("eligibility_kv_unavailable");
        return kv.get<PrintOrderRecord>(printOrderKey(sessionId), "json");
      },
      physicalEnabled:
        envString(this.env, "REVIEW_REQUESTS_PHYSICAL_ENABLED")?.trim() === "true",
    });
    return executeReviewDispatch(input, {
      ledger,
      isSuppressed: async () => (await this.check()).suppressed,
      checkEligibility,
      send: sendViaResend,
    });
  }
}

type KvJsonReader = {
  get<T>(key: string, type: "json"): Promise<T | null>;
};

function kvFromEnv(env: unknown): KvJsonReader | null {
  if (!env || typeof env !== "object") return null;
  return (env as { STAR_MAP_KV?: KvJsonReader }).STAR_MAP_KV ?? null;
}

function envString(env: unknown, key: string): string | undefined {
  if (env && typeof env === "object") {
    const value = (env as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return process.env[key];
}
