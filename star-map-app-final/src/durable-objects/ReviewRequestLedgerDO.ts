/**
 * Thin per-session SQLite Durable Object holding the review-request ledger.
 * Authoritative for the claim/dispatch state machine (see
 * src/lib/reviewRequestLedgerState.ts for why the ledger is NOT in KV).
 * One DO instance per checkout session id (`idFromName(sessionId)`), so all
 * transitions for a session are serialized inside a single instance.
 *
 * REVISED (T-T1): the row carries the frozen provider payload, the absolute
 * retry deadline, and the PII-lifecycle timestamps. Three alarm duties:
 *  - a `dispatching` row whose resolution never arrives (worker crash
 *    between the provider call and its recording) is settled as terminal
 *    `uncertain` after a grace window — never reclaimed, never resent;
 *  - a `claimed` row whose claimant died before dispatching (worker
 *    eviction between claim and dispatch/release) is expired back to a
 *    due retry after the stale-claim window — no provider call can have
 *    started from `claimed`, so the ask and its payload survive;
 *  - an `uncertain` row's retained recipient is redacted within 15 minutes.
 * Rows written by the PR #348 machine are migrated on load (legacy
 * `sending`/payload-less `retry` rows quarantined as `uncertain`, legacy
 * terminal rows stripped of PII) — never reset to empty.
 */
import { DurableObject } from "cloudflare:workers";
import {
  applyReviewLedgerOp,
  createEmptyReviewLedgerState,
  migrateLegacyReviewLedgerState,
  REVIEW_REQUEST_CLAIM_STALE_MS,
  type FrozenReviewPayload,
  type ReviewLedgerApplyResult,
  type ReviewLedgerOp,
  type ReviewLedgerState,
} from "../lib/reviewRequestLedgerState";

/** Grace window for a committed dispatch to record its resolution. */
export const REVIEW_DISPATCH_RESOLUTION_GRACE_MS = 5 * 60 * 1000;
/** Redaction deadline for an `uncertain` row's retained recipient. */
export const REVIEW_UNCERTAIN_REDACTION_MS = 15 * 60 * 1000;

type LedgerRow = {
  session_id: string;
  status: string | null;
  kind: string | null;
  email: string | null;
  anchor_at: number | null;
  due_at: number | null;
  eligibility_ends_at: number | null;
  first_dispatch_at: number | null;
  retry_deadline_at: number | null;
  payload_json: string | null;
  attempts: number;
  claim_id: string | null;
  claimed_at: number | null;
  next_attempt_at: number | null;
  last_error: string | null;
  sent_at: number | null;
  provider_id: string | null;
  redacted_at: number | null;
  erased_at: number | null;
  created_at: number | null;
  updated_at: number | null;
};

const ADDED_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "eligibility_ends_at", ddl: "eligibility_ends_at INTEGER" },
  { name: "first_dispatch_at", ddl: "first_dispatch_at INTEGER" },
  { name: "retry_deadline_at", ddl: "retry_deadline_at INTEGER" },
  { name: "payload_json", ddl: "payload_json TEXT" },
  { name: "redacted_at", ddl: "redacted_at INTEGER" },
  { name: "erased_at", ddl: "erased_at INTEGER" },
];

function parsePayload(raw: string | null): FrozenReviewPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as FrozenReviewPayload;
    if (!parsed || typeof parsed !== "object" || typeof parsed.to !== "string") return null;
    return parsed;
  } catch {
    // A corrupt frozen payload must fail closed (begin_dispatch quarantines
    // a payload-less claim) — never partially reconstructed.
    return null;
  }
}

function rowToState(row: LedgerRow): ReviewLedgerState {
  return {
    sessionId: row.session_id,
    status: row.status as ReviewLedgerState["status"],
    kind: row.kind as ReviewLedgerState["kind"],
    email: row.email,
    anchorAt: row.anchor_at,
    dueAt: row.due_at,
    eligibilityEndsAt: row.eligibility_ends_at,
    firstDispatchAt: row.first_dispatch_at,
    retryDeadlineAt: row.retry_deadline_at,
    payload: parsePayload(row.payload_json),
    attempts: row.attempts,
    claimId: row.claim_id,
    claimedAt: row.claimed_at,
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error,
    sentAt: row.sent_at,
    providerId: row.provider_id,
    redactedAt: row.redacted_at,
    erasedAt: row.erased_at,
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
      // T-T1 columns, added idempotently (SQLite has no ADD COLUMN IF NOT
      // EXISTS; PRAGMA table_info is the check).
      const existing = new Set(
        this.ctx.storage.sql
          .exec<{ name: string }>("PRAGMA table_info(review_request_ledger)")
          .toArray()
          .map((column) => column.name)
      );
      for (const column of ADDED_COLUMNS) {
        if (!existing.has(column.name)) {
          this.ctx.storage.sql.exec(`ALTER TABLE review_request_ledger ADD COLUMN ${column.ddl}`);
        }
      }
    });
  }

  private readRawState(sessionId: string): ReviewLedgerState {
    const trimmed = sessionId.trim();
    const rows = this.ctx.storage.sql
      .exec<LedgerRow>("SELECT * FROM review_request_ledger WHERE session_id = ? LIMIT 1", trimmed)
      .toArray();
    if (rows.length === 0) {
      return createEmptyReviewLedgerState(trimmed);
    }
    return rowToState(rows[0]);
  }

  /** Read + legacy-migrate (persisting the migration) — the only read path. */
  private loadState(sessionId: string): ReviewLedgerState {
    const raw = this.readRawState(sessionId);
    const migrated = migrateLegacyReviewLedgerState(raw, Date.now());
    if (migrated.changed) {
      this.writeState(migrated.state);
      return migrated.state;
    }
    return raw;
  }

  private writeState(state: ReviewLedgerState): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO review_request_ledger (
          session_id, status, kind, email, anchor_at, due_at, eligibility_ends_at,
          first_dispatch_at, retry_deadline_at, payload_json, attempts, claim_id,
          claimed_at, next_attempt_at, last_error, sent_at, provider_id,
          redacted_at, erased_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          status = excluded.status,
          kind = excluded.kind,
          email = excluded.email,
          anchor_at = excluded.anchor_at,
          due_at = excluded.due_at,
          eligibility_ends_at = excluded.eligibility_ends_at,
          first_dispatch_at = excluded.first_dispatch_at,
          retry_deadline_at = excluded.retry_deadline_at,
          payload_json = excluded.payload_json,
          attempts = excluded.attempts,
          claim_id = excluded.claim_id,
          claimed_at = excluded.claimed_at,
          next_attempt_at = excluded.next_attempt_at,
          last_error = excluded.last_error,
          sent_at = excluded.sent_at,
          provider_id = excluded.provider_id,
          redacted_at = excluded.redacted_at,
          erased_at = excluded.erased_at,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `,
      state.sessionId,
      state.status,
      state.kind,
      state.email,
      state.anchorAt,
      state.dueAt,
      state.eligibilityEndsAt,
      state.firstDispatchAt,
      state.retryDeadlineAt,
      state.payload ? JSON.stringify(state.payload) : null,
      state.attempts,
      state.claimId,
      state.claimedAt,
      state.nextAttemptAt,
      state.lastError,
      state.sentAt,
      state.providerId,
      state.redactedAt,
      state.erasedAt,
      state.createdAt,
      state.updatedAt
    );
  }

  /** Keep at most one alarm armed, for whichever duty is outstanding. */
  private async syncAlarm(state: ReviewLedgerState): Promise<void> {
    let target: number | null = null;
    if (state.status === "dispatching") {
      target = (state.updatedAt ?? Date.now()) + REVIEW_DISPATCH_RESOLUTION_GRACE_MS;
    } else if (state.status === "claimed") {
      target = (state.claimedAt ?? state.updatedAt ?? Date.now()) + REVIEW_REQUEST_CLAIM_STALE_MS;
    } else if (
      state.status === "uncertain" &&
      state.redactedAt === null &&
      (state.email !== null || state.providerId !== null)
    ) {
      target = (state.updatedAt ?? Date.now()) + REVIEW_UNCERTAIN_REDACTION_MS;
    }
    const current = await this.ctx.storage.getAlarm();
    if (target === null) {
      if (current !== null) await this.ctx.storage.deleteAlarm();
      return;
    }
    if (current === null || current !== target) {
      await this.ctx.storage.setAlarm(target);
    }
  }

  async alarm(): Promise<void> {
    // One row per instance: find it (the instance is named by session id,
    // but the row is the authority).
    const rows = this.ctx.storage.sql
      .exec<LedgerRow>("SELECT * FROM review_request_ledger LIMIT 1")
      .toArray();
    if (rows.length === 0) return;
    const state = this.loadState(rows[0].session_id);
    const now = Date.now();
    if (state.status === "claimed") {
      const result = applyReviewLedgerOp(state, { type: "expire_claim", now });
      if (result.changed) this.writeState(result.state);
      await this.syncAlarm(result.state);
      return;
    }
    if (state.status === "dispatching" && state.claimId) {
      const result = applyReviewLedgerOp(state, {
        type: "expire_dispatch",
        claimId: state.claimId,
        now,
      });
      if (result.changed) this.writeState(result.state);
      await this.syncAlarm(result.state);
      return;
    }
    if (state.status === "uncertain") {
      const result = applyReviewLedgerOp(state, { type: "redact", now });
      if (result.changed) this.writeState(result.state);
      await this.syncAlarm(result.state);
    }
  }

  async getState(sessionId: string): Promise<ReviewLedgerState> {
    const state = this.loadState(sessionId);
    await this.syncAlarm(state);
    return state;
  }

  async apply(sessionId: string, op: ReviewLedgerOp): Promise<ReviewLedgerApplyResult> {
    const current = this.loadState(sessionId);
    const result = applyReviewLedgerOp(current, op);
    if (result.changed) {
      this.writeState(result.state);
    }
    await this.syncAlarm(result.state);
    return result;
  }
}
