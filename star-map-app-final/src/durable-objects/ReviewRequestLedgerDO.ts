/**
 * Thin per-session SQLite Durable Object holding the review-request ledger.
 * Authoritative for the claim/send state machine (see
 * src/lib/reviewRequestLedgerState.ts for why the ledger is NOT in KV).
 * One DO instance per checkout session id (`idFromName(sessionId)`), so all
 * transitions for a session are serialized inside a single instance.
 */
import { DurableObject } from "cloudflare:workers";
import {
  applyReviewLedgerOp,
  createEmptyReviewLedgerState,
  type ReviewLedgerApplyResult,
  type ReviewLedgerOp,
  type ReviewLedgerState,
} from "../lib/reviewRequestLedgerState";

type LedgerRow = {
  session_id: string;
  status: string | null;
  kind: string | null;
  email: string | null;
  anchor_at: number | null;
  due_at: number | null;
  attempts: number;
  claim_id: string | null;
  claimed_at: number | null;
  next_attempt_at: number | null;
  last_error: string | null;
  sent_at: number | null;
  provider_id: string | null;
  created_at: number | null;
  updated_at: number | null;
};

function rowToState(row: LedgerRow): ReviewLedgerState {
  return {
    sessionId: row.session_id,
    status: row.status as ReviewLedgerState["status"],
    kind: row.kind as ReviewLedgerState["kind"],
    email: row.email,
    anchorAt: row.anchor_at,
    dueAt: row.due_at,
    attempts: row.attempts,
    claimId: row.claim_id,
    claimedAt: row.claimed_at,
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error,
    sentAt: row.sent_at,
    providerId: row.provider_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ReviewRequestLedgerDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS review_request_ledger (
          session_id TEXT PRIMARY KEY,
          status TEXT,
          kind TEXT,
          email TEXT,
          anchor_at INTEGER,
          due_at INTEGER,
          attempts INTEGER NOT NULL DEFAULT 0,
          claim_id TEXT,
          claimed_at INTEGER,
          next_attempt_at INTEGER,
          last_error TEXT,
          sent_at INTEGER,
          provider_id TEXT,
          created_at INTEGER,
          updated_at INTEGER
        )
      `);
    });
  }

  private readState(sessionId: string): ReviewLedgerState {
    const trimmed = sessionId.trim();
    const rows = this.ctx.storage.sql
      .exec<LedgerRow>("SELECT * FROM review_request_ledger WHERE session_id = ? LIMIT 1", trimmed)
      .toArray();
    if (rows.length === 0) {
      return createEmptyReviewLedgerState(trimmed);
    }
    return rowToState(rows[0]);
  }

  private writeState(state: ReviewLedgerState): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO review_request_ledger (
          session_id, status, kind, email, anchor_at, due_at, attempts, claim_id,
          claimed_at, next_attempt_at, last_error, sent_at, provider_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          status = excluded.status,
          kind = excluded.kind,
          email = excluded.email,
          anchor_at = excluded.anchor_at,
          due_at = excluded.due_at,
          attempts = excluded.attempts,
          claim_id = excluded.claim_id,
          claimed_at = excluded.claimed_at,
          next_attempt_at = excluded.next_attempt_at,
          last_error = excluded.last_error,
          sent_at = excluded.sent_at,
          provider_id = excluded.provider_id,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `,
      state.sessionId,
      state.status,
      state.kind,
      state.email,
      state.anchorAt,
      state.dueAt,
      state.attempts,
      state.claimId,
      state.claimedAt,
      state.nextAttemptAt,
      state.lastError,
      state.sentAt,
      state.providerId,
      state.createdAt,
      state.updatedAt,
    );
  }

  async getState(sessionId: string): Promise<ReviewLedgerState> {
    return this.readState(sessionId);
  }

  async apply(sessionId: string, op: ReviewLedgerOp): Promise<ReviewLedgerApplyResult> {
    const current = this.readState(sessionId);
    const result = applyReviewLedgerOp(current, op);
    if (result.changed) {
      this.writeState(result.state);
    }
    return result;
  }
}
