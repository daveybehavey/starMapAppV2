/**
 * Thin per-entitlement-session SQLite Durable Object serializing
 * gift-certificate grant initialization (Tier C review condition 1).
 * The state machine and the soundness argument live in
 * src/lib/giftCertificateGrantState.ts; this shell only persists the
 * row as one JSON document, mirroring EntitlementAuthorityDO.
 *
 * One instance per gift-certificate entitlement session id
 * (`idFromName(entitlementSessionId)`), so every grant pass for a
 * certificate is serialized inside a single instance across all
 * isolates. RPC failures surface as thrown errors; the client maps
 * them to a retryable failure (fail closed) — never to an in-isolate
 * fallback decision in production.
 */
import { DurableObject } from "cloudflare:workers";
import {
  confirmGiftCertificateGrantPublished,
  createEmptyGiftCertificateGrantRow,
  initializeGiftCertificateGrant,
  isValidGiftCertificateGrantRow,
  type ConfirmGiftCertificateGrantResult,
  type GiftCertificateGrantRow,
  type GiftCertificateGrantTerms,
  type InitializeGiftCertificateGrantResult,
} from "../lib/giftCertificateGrantState";

type GrantRow = {
  session_id: string;
  state_json: string;
  updated_at: number;
};

export class GiftCertificateGrantDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS gift_certificate_grant_state (
          session_id TEXT PRIMARY KEY,
          state_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
    });
  }

  private readRow(entitlementSessionId: string): GiftCertificateGrantRow {
    const trimmed = entitlementSessionId.trim();
    const rows = this.ctx.storage.sql
      .exec<GrantRow>(
        "SELECT session_id, state_json, updated_at FROM gift_certificate_grant_state WHERE session_id = ? LIMIT 1",
        trimmed,
      )
      .toArray();
    if (rows.length === 0) {
      return createEmptyGiftCertificateGrantRow(trimmed);
    }
    const parsed = JSON.parse(rows[0].state_json) as GiftCertificateGrantRow;
    if (!parsed || parsed.entitlementSessionId !== trimmed) {
      throw new Error(`gift certificate grant state mismatch for ${trimmed}`);
    }
    if (!isValidGiftCertificateGrantRow(parsed)) {
      throw new Error(`gift certificate grant state malformed for ${trimmed}`);
    }
    return parsed;
  }

  private writeRow(row: GiftCertificateGrantRow, now: number): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO gift_certificate_grant_state (session_id, state_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          state_json = excluded.state_json,
          updated_at = excluded.updated_at
      `,
      row.entitlementSessionId,
      JSON.stringify(row),
      now,
    );
  }

  async getRow(entitlementSessionId: string): Promise<GiftCertificateGrantRow> {
    return this.readRow(entitlementSessionId);
  }

  async initialize(
    entitlementSessionId: string,
    input: { terms: GiftCertificateGrantTerms; now: number },
  ): Promise<InitializeGiftCertificateGrantResult> {
    const current = this.readRow(entitlementSessionId);
    const result = initializeGiftCertificateGrant(current, input);
    if (result.changed) {
      this.writeRow(result.row, input.now);
    }
    return result;
  }

  async confirmPublished(
    entitlementSessionId: string,
    input: { now: number },
  ): Promise<ConfirmGiftCertificateGrantResult> {
    const current = this.readRow(entitlementSessionId);
    const result = confirmGiftCertificateGrantPublished(current, input);
    if (result.changed) {
      this.writeRow(result.row, input.now);
    }
    return result;
  }
}
