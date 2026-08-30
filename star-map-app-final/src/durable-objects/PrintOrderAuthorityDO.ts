/**
 * Thin per-logical-order SQLite Durable Object.
 * Authoritative for: bind provider id, monotonic terminal failure, operator recover.
 * Alerts / file review / shipping stay outside (hard cut vs rejected #244 coordinator).
 */
import { DurableObject } from "cloudflare:workers";
import {
  applyPrintOrderAuthorityOp,
  createUnboundAuthorityState,
  type PrintOrderAuthorityOp,
  type PrintOrderAuthorityState,
} from "../lib/printOrderAuthorityState";

type AuthorityRow = {
  session_id: string;
  printful_order_id: string | null;
  lifecycle: string;
  terminal_reason: string | null;
  terminal_event_type: string | null;
  revision: number;
  updated_at: number;
  seeded_from_kv: number;
};

function rowToState(row: AuthorityRow): PrintOrderAuthorityState {
  return {
    sessionId: row.session_id,
    printfulOrderId: row.printful_order_id,
    lifecycle: row.lifecycle as PrintOrderAuthorityState["lifecycle"],
    terminalReason: row.terminal_reason,
    terminalEventType: row.terminal_event_type,
    revision: row.revision,
    updatedAt: row.updated_at,
    seededFromKv: row.seeded_from_kv === 1,
  };
}

export class PrintOrderAuthorityDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: CloudflareEnv) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS print_order_authority (
          session_id TEXT PRIMARY KEY,
          printful_order_id TEXT,
          lifecycle TEXT NOT NULL,
          terminal_reason TEXT,
          terminal_event_type TEXT,
          revision INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          seeded_from_kv INTEGER NOT NULL DEFAULT 0
        )
      `);
    });
  }

  private readState(sessionId: string): PrintOrderAuthorityState {
    const trimmed = sessionId.trim();
    const rows = this.ctx.storage.sql
      .exec<AuthorityRow>("SELECT * FROM print_order_authority WHERE session_id = ? LIMIT 1", trimmed)
      .toArray();
    if (rows.length === 0) {
      return createUnboundAuthorityState(trimmed);
    }
    return rowToState(rows[0]);
  }

  private writeState(state: PrintOrderAuthorityState): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO print_order_authority (
          session_id, printful_order_id, lifecycle, terminal_reason, terminal_event_type,
          revision, updated_at, seeded_from_kv
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          printful_order_id = excluded.printful_order_id,
          lifecycle = excluded.lifecycle,
          terminal_reason = excluded.terminal_reason,
          terminal_event_type = excluded.terminal_event_type,
          revision = excluded.revision,
          updated_at = excluded.updated_at,
          seeded_from_kv = excluded.seeded_from_kv
      `,
      state.sessionId,
      state.printfulOrderId,
      state.lifecycle,
      state.terminalReason,
      state.terminalEventType,
      state.revision,
      state.updatedAt,
      state.seededFromKv ? 1 : 0,
    );
  }

  async getState(sessionId: string): Promise<PrintOrderAuthorityState> {
    return this.readState(sessionId);
  }

  async apply(sessionId: string, op: PrintOrderAuthorityOp) {
    const current = this.readState(sessionId);
    const result = applyPrintOrderAuthorityOp(current, op);
    if (result.ok && result.changed) {
      this.writeState(result.state);
    }
    return result;
  }

  async bindProviderOrderId(sessionId: string, printfulOrderId: string | number) {
    return this.apply(sessionId, { type: "bind_provider_order_id", printfulOrderId });
  }

  async markTerminalFailed(sessionId: string, eventType: string, reason?: string | null) {
    return this.apply(sessionId, { type: "mark_terminal_failed", eventType, reason });
  }

  async operatorRecover(sessionId: string) {
    return this.apply(sessionId, { type: "operator_recover" });
  }

  async seedFromKv(
    sessionId: string,
    input: { kvStatus?: "pending" | "sent" | "failed" | null; printfulOrderId?: string | number | null },
  ) {
    return this.apply(sessionId, {
      type: "seed_from_kv",
      kvStatus: input.kvStatus ?? null,
      printfulOrderId: input.printfulOrderId ?? null,
    });
  }
}
