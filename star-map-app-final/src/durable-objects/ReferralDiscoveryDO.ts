/**
 * Thin per-referred-session SQLite Durable Object: the DL-1 referral
 * discovery authority (v3.8 §5.2, binding REFERRAL_DISCOVERY, migration
 * tag v4-referral-discovery). One instance per referred checkout
 * session id (`idFromName(referredSessionId)`), so registration and
 * terminal-negative recording for a session are serialized inside a
 * single instance — the property the discovery contract spends.
 *
 * Storage mirrors the EntitlementAuthorityDO pattern: one JSON
 * document row per referred session; a mutation is a single upsert of
 * the fully computed next row. A corrupt stored document fails closed
 * (throws) rather than reading as absence — absence is an answer this
 * authority gives deliberately (typed absence), never by accident.
 */
import { DurableObject } from "cloudflare:workers";
import {
  createEmptyReferralDiscoveryRow,
  isValidReferralDiscoveryRow,
  recordTerminalNegative,
  registerDiscovery,
  type RecordTerminalNegativeOutcome,
  type ReferralDiscoveryRow,
  type RegisterDiscoveryOutcome,
} from "../lib/referralDiscovery";

type DiscoveryRowRecord = {
  referred_session_id: string;
  state_json: string;
  updated_at: number;
};

export class ReferralDiscoveryDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS referral_discovery_state (
          referred_session_id TEXT PRIMARY KEY,
          state_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
    });
  }

  private readRow(referredSessionId: string): ReferralDiscoveryRow {
    const trimmed = referredSessionId.trim();
    const rows = this.ctx.storage.sql
      .exec<DiscoveryRowRecord>(
        "SELECT referred_session_id, state_json, updated_at FROM referral_discovery_state WHERE referred_session_id = ? LIMIT 1",
        trimmed,
      )
      .toArray();
    if (rows.length === 0) {
      return createEmptyReferralDiscoveryRow(trimmed);
    }
    const parsed = JSON.parse(rows[0].state_json) as ReferralDiscoveryRow;
    if (!parsed || parsed.referredSessionId !== trimmed) {
      throw new Error(`referral discovery state mismatch for ${trimmed}`);
    }
    if (!isValidReferralDiscoveryRow(parsed)) {
      throw new Error(`referral discovery state malformed for ${trimmed}`);
    }
    return parsed;
  }

  private writeRow(row: ReferralDiscoveryRow, now: number): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO referral_discovery_state (referred_session_id, state_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(referred_session_id) DO UPDATE SET
          state_json = excluded.state_json,
          updated_at = excluded.updated_at
      `,
      row.referredSessionId,
      JSON.stringify(row),
      now,
    );
  }

  /** The full row, terminal record included; typed absence = empty row. */
  async getAssociation(referredSessionId: string): Promise<ReferralDiscoveryRow> {
    return this.readRow(referredSessionId);
  }

  async register(
    referredSessionId: string,
    input: { referrerSessionId: string; grantId: string; now: number },
  ): Promise<{ row: ReferralDiscoveryRow; outcome: RegisterDiscoveryOutcome }> {
    const current = this.readRow(referredSessionId);
    const result = registerDiscovery(current, input);
    if (result.row !== current) {
      this.writeRow(result.row, input.now);
    }
    return result;
  }

  async recordTerminalNegative(
    referredSessionId: string,
    input: { lineageRef: string; now: number },
  ): Promise<{ row: ReferralDiscoveryRow; outcome: RecordTerminalNegativeOutcome }> {
    const current = this.readRow(referredSessionId);
    const result = recordTerminalNegative(current, input);
    if (result.row !== current) {
      this.writeRow(result.row, input.now);
    }
    return result;
  }
}
