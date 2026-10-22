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
 * INERT (DL-1 Slice 2): no route calls this yet. The legacy consume /
 * compensate routes remain the live accounting writers until later slices
 * fence them; this object changes no production behaviour.
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
  type EntitlementAuthorityApplyResult,
  type EntitlementAuthorityOp,
  type EntitlementAuthorityState,
} from "../lib/entitlementAuthorityState";

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
}
