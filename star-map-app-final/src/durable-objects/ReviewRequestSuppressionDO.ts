/**
 * Per-recipient review-request suppression record + dispatch coordinator.
 *
 * One instance per HMAC-keyed recipient name (see
 * deriveReviewSuppressionName — the raw email never names an instance).
 * The instance holds the authoritative suppression flag for review
 * requests, and its `dispatch` RPC is the ONLY component that may call the
 * email provider for a review request (T-T1 revised design): the final
 * suppression check, the ledger's dispatch commit, the deadline re-check
 * at the point of invocation, the single provider call with the frozen
 * payload, and the outcome recording all happen behind this one door, so
 * no other code path can send around the gate.
 */
import { DurableObject } from "cloudflare:workers";
import { createReviewLedgerClient } from "../lib/reviewRequestLedger";
import {
  executeReviewDispatch,
  type ReviewDispatchOutcome,
  type ReviewSendInput,
  type ReviewSendResult,
} from "../lib/reviewRequestSuppression";
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

  async check(): Promise<{ suppressed: boolean }> {
    return { suppressed: (this.readRow()?.suppressed ?? 0) === 1 };
  }

  async record(input: { source: string; now: number }): Promise<{ suppressed: boolean }> {
    this.writeRow({
      suppressed: 1,
      source: input.source,
      suppressed_at: input.now,
      updated_at: input.now,
    });
    return { suppressed: true };
  }

  async clear(input: { now: number }): Promise<{ suppressed: boolean }> {
    this.writeRow({ suppressed: 0, source: null, suppressed_at: null, updated_at: input.now });
    return { suppressed: false };
  }

  async erase(): Promise<{ suppressed: boolean }> {
    this.ctx.storage.sql.exec("DELETE FROM review_suppression WHERE id = 1");
    return { suppressed: false };
  }

  /**
   * The single provider-call path. The ledger client is built from this
   * DO's own env (explicit bindings — no request context exists here).
   */
  async dispatch(input: { sessionId: string; claimId: string }): Promise<ReviewDispatchOutcome> {
    const ledger = createReviewLedgerClient(this.env);
    return executeReviewDispatch(input, {
      ledger,
      isSuppressed: async () => (await this.check()).suppressed,
      send: sendViaResend,
    });
  }
}
