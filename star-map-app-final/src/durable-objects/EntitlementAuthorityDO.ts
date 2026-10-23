/**
 * Thin per-entitlement SQLite Durable Object: the DL-1 entitlement
 * authority. Sole accounting authority for HD downloads (owned-files
 * ledger, legacy recovery decision, capability generation) — see
 * src/lib/entitlementAuthorityState.ts for the pure state machine and why
 * this cannot live in KV.
 *
 * One DO instance per Stripe checkout session id (`idFromName(sessionId)`),
 * so all accounting transitions for an entitlement are serialized inside a
 * single instance.
 *
 * Wiring status: Slice 2 shipped this object inert. Slice 3 wires the
 * first production callers — the legacy consume/compensate routes hold
 * its accounting lease across their KV mutations and refuse migrated
 * entitlements — and prepares the Stripe webhook's referral routing
 * (the lazy migration trigger), which stays gated off behind
 * DL1_AUTHORITY_ROUTING_ENABLED until the Slice 6 cutover gives
 * downloads an authority debit path (Codex P1, PR #367).
 *
 * Storage shape: the ledger state is genuinely nested (owned-files map,
 * baseline object), unlike the flat rows of the print/review precedents, so
 * it is stored as ONE JSON document row per entitlement. A mutation is a
 * single upsert statement of the fully computed next state — atomic by
 * construction, with no partial ledger/balance update possible. A corrupt
 * stored document fails closed (throws) rather than resetting to an empty
 * ledger, which would silently restore spent credits.
 */
import { DurableObject } from "cloudflare:workers";
import {
  applyEntitlementAuthorityOp,
  createEmptyEntitlementAuthorityState,
  isValidEntitlementAuthorityState,
  type EntitlementAuthorityApplyResult,
  type EntitlementAuthorityOp,
  type EntitlementAuthorityState,
} from "../lib/entitlementAuthorityState";

// The DO shell performs no accounting decisions: it reads state, runs
// the pure machine, and persists the result atomically. Under the
// cleared design (v3.8 §5.3) the shell is also where a grant op's
// ReferralDiscoveryDO registration leg runs — before the machine is
// invoked for the fold — with its outcome entering the op as the
// shell-attested `discoveryRegistration` command field, which the
// pure machine validates and decides on. The referral wrapper
// (referralRewardAuthority.ts) drives that leg for the webhook path.

type AuthorityRow = {
  session_id: string;
  state_json: string;
  updated_at: number;
};

export class EntitlementAuthorityDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS entitlement_authority_state (
          session_id TEXT PRIMARY KEY,
          state_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
    });
  }

  private readState(sessionId: string): EntitlementAuthorityState {
    const trimmed = sessionId.trim();
    const rows = this.ctx.storage.sql
      .exec<AuthorityRow>(
        "SELECT session_id, state_json, updated_at FROM entitlement_authority_state WHERE session_id = ? LIMIT 1",
        trimmed,
      )
      .toArray();
    if (rows.length === 0) {
      return createEmptyEntitlementAuthorityState(trimmed);
    }
    const parsed = JSON.parse(rows[0].state_json) as EntitlementAuthorityState;
    if (!parsed || parsed.sessionId !== trimmed) {
      throw new Error(`entitlement authority state mismatch for ${trimmed}`);
    }
    // Structural validation, not just syntax + identity: a well-formed
    // JSON document with a missing count field or an invalid enum would
    // otherwise flow into the accounting as NaN balances and phantom
    // credits. Malformed persisted state fails closed (G-dot P2, #362).
    if (!isValidEntitlementAuthorityState(parsed)) {
      throw new Error(`entitlement authority state malformed for ${trimmed}`);
    }
    return parsed;
  }

  private writeState(state: EntitlementAuthorityState): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO entitlement_authority_state (session_id, state_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          state_json = excluded.state_json,
          updated_at = excluded.updated_at
      `,
      state.sessionId,
      JSON.stringify(state),
      state.updatedAt ?? 0,
    );
  }

  async getState(sessionId: string): Promise<EntitlementAuthorityState> {
    return this.readState(sessionId);
  }

  async apply(
    sessionId: string,
    op: EntitlementAuthorityOp,
  ): Promise<EntitlementAuthorityApplyResult> {
    const current = this.readState(sessionId);
    const result = applyEntitlementAuthorityOp(current, op);
    if (result.changed) {
      this.writeState(result.state);
    }
    return result;
  }

  /** Explicit commit of a prepared, finalized artifact (the debit moment). */
  async commit(
    sessionId: string,
    input: {
      artifactId: string;
      mapId: string;
      fingerprint: string;
      finalized: boolean;
      now: number;
    },
  ): Promise<EntitlementAuthorityApplyResult> {
    return this.apply(sessionId, { type: "commit", ...input });
  }

  /** One-time legacy grant against an unresolved baseline consume. */
  async grant(
    sessionId: string,
    input: {
      artifactId: string;
      mapId: string;
      fingerprint: string;
      finalized: boolean;
      now: number;
    },
  ): Promise<EntitlementAuthorityApplyResult> {
    return this.apply(sessionId, { type: "grant", ...input });
  }

  /** Legacy-only compensate: restores one baseline credit, once per token. */
  async compensate(
    sessionId: string,
    input: { consumeToken: string; now: number },
  ): Promise<EntitlementAuthorityApplyResult> {
    return this.apply(sessionId, { type: "compensate", ...input });
  }

  /** Atomically increment the capability generation (claim-token rotation). */
  async rotateCapability(
    sessionId: string,
    now: number,
  ): Promise<EntitlementAuthorityApplyResult> {
    return this.apply(sessionId, { type: "rotate_capability", now });
  }

  /** Grant referral reward credits into the separate reward bucket (R1-A). */
  async grantReward(
    sessionId: string,
    input: Extract<EntitlementAuthorityOp, { type: "grant_reward" }>,
  ): Promise<EntitlementAuthorityApplyResult> {
    return this.apply(sessionId, input);
  }

  /**
   * Reverse a referral reward grant: removes only that grant's unspent
   * reward-bucket credits — never purchased credits, owned files, or a
   * negative balance (R1-A).
   */
  async reverseReward(
    sessionId: string,
    input: Extract<EntitlementAuthorityOp, { type: "reverse_reward" }>,
  ): Promise<EntitlementAuthorityApplyResult> {
    return this.apply(sessionId, input);
  }

  /** Compensate one journal debit by its consume token (v3.5 §2.4). */
  async compensateDebit(
    sessionId: string,
    input: { consumeToken: string; now: number },
  ): Promise<EntitlementAuthorityApplyResult> {
    return this.apply(sessionId, { type: "compensate_debit", ...input });
  }

  /** Own-purchase grant (W1/W5 grant_fact; v3.7 §2.2/§2.4, v3.8 §3). */
  async purchaseGrant(
    sessionId: string,
    input: Extract<EntitlementAuthorityOp, { type: "purchase_grant" }>,
  ): Promise<EntitlementAuthorityApplyResult> {
    return this.apply(sessionId, input);
  }

  /** Installation: record the attested verified opening (v3.6 §3). */
  async recordCheckpoint(
    sessionId: string,
    input: Extract<EntitlementAuthorityOp, { type: "record_checkpoint" }>,
  ): Promise<EntitlementAuthorityApplyResult> {
    return this.apply(sessionId, input);
  }

  /** Settle a pending grant's inclusion classification (v3.7 §2.3). */
  async resolveGrantInclusion(
    sessionId: string,
    input: Extract<EntitlementAuthorityOp, { type: "resolve_grant_inclusion" }>,
  ): Promise<EntitlementAuthorityApplyResult> {
    return this.apply(sessionId, input);
  }
}
