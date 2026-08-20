import { DurableObject } from "cloudflare:workers";
import {
  applyHealthyTransition,
  applyOperatorAuthorizedRecoveryTransition,
  applyOperatorResolvedTransition,
  applyPendingFilesTransition,
  applyTerminalFailureTransition,
  beginFailureAlertClaimTransition,
  bootstrapCoordinatorFromKvMirror,
  completeFailureAlertDeliveredTransition,
  completeFailureAlertRetryableErrorTransition,
  completeFailureAlertTerminalTransition,
  createUninitializedCoordinatorState,
  parseCoordinatorStateOrCorrupt,
  type PrintOrderCoordinatorFailureSource,
  type PrintOrderCoordinatorState,
} from "../lib/printOrderCoordinatorState";

type CoordinatorRow = {
  opaque_order_key: string;
  session_id: string;
  authority_status: string;
  error: string | null;
  source: string | null;
  printful_order_id: string | null;
  pending_files_at: number | null;
  operator_resolved_at: number | null;
  operator_resolved_note: string | null;
  alert_phase: string;
  alert_idempotency_key: string;
  alert_claim_owner: string | null;
  alert_claimed_at: number | null;
  alert_delivered_at: number | null;
  alert_provider: string | null;
  alert_error: string | null;
  alert_failure_recorded_at: number | null;
  updated_at: number;
  version: number;
};

function rowToRawCandidate(row: CoordinatorRow) {
  return {
    version: row.version,
    opaqueOrderKey: row.opaque_order_key,
    sessionId: row.session_id,
    authorityStatus: row.authority_status,
    error: row.error || undefined,
    source: row.source || undefined,
    printfulOrderId: row.printful_order_id || undefined,
    pendingFilesAt: row.pending_files_at ?? undefined,
    operatorResolvedAt: row.operator_resolved_at ?? undefined,
    operatorResolvedNote: row.operator_resolved_note || undefined,
    failureAlert: {
      phase: row.alert_phase,
      idempotencyKey: row.alert_idempotency_key,
      claimOwner: row.alert_claim_owner || undefined,
      claimedAt: row.alert_claimed_at ?? undefined,
      deliveredAt: row.alert_delivered_at ?? undefined,
      provider: row.alert_provider || undefined,
      error: row.alert_error || undefined,
      failureRecordedAt: row.alert_failure_recorded_at ?? undefined,
    },
    updatedAt: row.updated_at,
  };
}

/**
 * Per-logical-print-order SQLite Durable Object.
 * Single-threaded coordination for terminal failure + failure-alert workflow.
 * No Printful / Resend network I/O inside this class.
 */
export class PrintOrderCoordinator extends DurableObject {
  #ready = false;

  #ensureSchema(): void {
    if (this.#ready) return;
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS print_order_coordinator (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        opaque_order_key TEXT NOT NULL,
        session_id TEXT NOT NULL,
        authority_status TEXT NOT NULL,
        error TEXT,
        source TEXT,
        printful_order_id TEXT,
        pending_files_at INTEGER,
        operator_resolved_at INTEGER,
        operator_resolved_note TEXT,
        alert_phase TEXT NOT NULL,
        alert_idempotency_key TEXT NOT NULL,
        alert_claim_owner TEXT,
        alert_claimed_at INTEGER,
        alert_delivered_at INTEGER,
        alert_provider TEXT,
        alert_error TEXT,
        alert_failure_recorded_at INTEGER,
        updated_at INTEGER NOT NULL,
        version INTEGER NOT NULL
      );
    `);
    this.#ready = true;
  }

  #readValidated(
    sessionId: string,
  ):
    | { ok: true; state: PrintOrderCoordinatorState | null }
    | { ok: false; corrupt: true; error: string } {
    this.#ensureSchema();
    const cursor = this.ctx.storage.sql.exec<CoordinatorRow>(
      `SELECT * FROM print_order_coordinator WHERE id = 1 LIMIT 1`,
    );
    const row = cursor.toArray()[0];
    if (!row) return { ok: true, state: null };
    return parseCoordinatorStateOrCorrupt(rowToRawCandidate(row), sessionId);
  }

  #writeState(state: PrintOrderCoordinatorState): void {
    this.#ensureSchema();
    this.ctx.storage.sql.exec(
      `INSERT INTO print_order_coordinator (
        id, opaque_order_key, session_id, authority_status, error, source, printful_order_id,
        pending_files_at, operator_resolved_at, operator_resolved_note,
        alert_phase, alert_idempotency_key, alert_claim_owner, alert_claimed_at,
        alert_delivered_at, alert_provider, alert_error, alert_failure_recorded_at,
        updated_at, version
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        opaque_order_key = excluded.opaque_order_key,
        session_id = excluded.session_id,
        authority_status = excluded.authority_status,
        error = excluded.error,
        source = excluded.source,
        printful_order_id = excluded.printful_order_id,
        pending_files_at = excluded.pending_files_at,
        operator_resolved_at = excluded.operator_resolved_at,
        operator_resolved_note = excluded.operator_resolved_note,
        alert_phase = excluded.alert_phase,
        alert_idempotency_key = excluded.alert_idempotency_key,
        alert_claim_owner = excluded.alert_claim_owner,
        alert_claimed_at = excluded.alert_claimed_at,
        alert_delivered_at = excluded.alert_delivered_at,
        alert_provider = excluded.alert_provider,
        alert_error = excluded.alert_error,
        alert_failure_recorded_at = excluded.alert_failure_recorded_at,
        updated_at = excluded.updated_at,
        version = excluded.version
      `,
      state.opaqueOrderKey,
      state.sessionId,
      state.authorityStatus,
      state.error ?? null,
      state.source ?? null,
      state.printfulOrderId ?? null,
      state.pendingFilesAt ?? null,
      state.operatorResolvedAt ?? null,
      state.operatorResolvedNote ?? null,
      state.failureAlert.phase,
      state.failureAlert.idempotencyKey,
      state.failureAlert.claimOwner ?? null,
      state.failureAlert.claimedAt ?? null,
      state.failureAlert.deliveredAt ?? null,
      state.failureAlert.provider ?? null,
      state.failureAlert.error ?? null,
      state.failureAlert.failureRecordedAt ?? null,
      state.updatedAt,
      state.version,
    );
  }

  #loadOrInit(
    sessionId: string,
    nowMs: number,
  ):
    | { ok: true; state: PrintOrderCoordinatorState }
    | { ok: false; corrupt: true; error: string } {
    const read = this.#readValidated(sessionId);
    if (!read.ok) return read;
    if (read.state) return { ok: true, state: read.state };
    const created = createUninitializedCoordinatorState(sessionId, nowMs);
    this.#writeState(created);
    return { ok: true, state: created };
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const body = (await request.json()) as Record<string, unknown>;
      const action = typeof body.action === "string" ? body.action : "";
      const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
      const nowMs = typeof body.nowMs === "number" && Number.isFinite(body.nowMs) ? body.nowMs : Date.now();

      if (!sessionId) {
        return Response.json({ ok: false, error: "sessionId_required" }, { status: 400 });
      }

      const corruptResponse = (error: string) =>
        Response.json({ ok: false, unavailable: true, error }, { status: 500 });

      switch (action) {
        case "get": {
          const read = this.#readValidated(sessionId);
          if (!read.ok) return corruptResponse(read.error);
          const state = read.state ?? createUninitializedCoordinatorState(sessionId, nowMs);
          return Response.json({ ok: true, state });
        }
        case "bootstrap_from_kv": {
          const read = this.#readValidated(sessionId);
          if (!read.ok) return corruptResponse(read.error);
          let state = read.state;
          if (!state || state.authorityStatus === "uninitialized") {
            state = bootstrapCoordinatorFromKvMirror({
              sessionId,
              kvStatus: body.kvStatus as "pending" | "sent" | "failed" | null | undefined,
              kvError: typeof body.kvError === "string" ? body.kvError : null,
              printfulOrderId: body.printfulOrderId as string | number | null | undefined,
              operatorFailureAlertedAt:
                typeof body.operatorFailureAlertedAt === "number" ? body.operatorFailureAlertedAt : null,
              operatorFailureAlertProvider:
                typeof body.operatorFailureAlertProvider === "string"
                  ? body.operatorFailureAlertProvider
                  : null,
              operatorFailureAlertError:
                typeof body.operatorFailureAlertError === "string" ? body.operatorFailureAlertError : null,
              printfulFileReviewPendingAt:
                typeof body.printfulFileReviewPendingAt === "number"
                  ? body.printfulFileReviewPendingAt
                  : null,
              operatorResolvedAt:
                typeof body.operatorResolvedAt === "number" ? body.operatorResolvedAt : null,
              nowMs,
            });
            this.#writeState(state);
          }
          return Response.json({ ok: true, state });
        }
        case "record_terminal_failure": {
          const loaded = this.#loadOrInit(sessionId, nowMs);
          if (!loaded.ok) return corruptResponse(loaded.error);
          const error = typeof body.error === "string" ? body.error : "print_order_failed";
          const source = (typeof body.source === "string" ? body.source : "other") as PrintOrderCoordinatorFailureSource;
          const state = applyTerminalFailureTransition(loaded.state, {
            error,
            source,
            printfulOrderId: body.printfulOrderId as string | number | null | undefined,
            nowMs,
          });
          this.#writeState(state);
          return Response.json({ ok: true, state });
        }
        case "record_pending_files": {
          const loaded = this.#loadOrInit(sessionId, nowMs);
          if (!loaded.ok) return corruptResponse(loaded.error);
          const result = applyPendingFilesTransition(loaded.state, {
            printfulOrderId: body.printfulOrderId as string | number | null | undefined,
            nowMs,
          });
          this.#writeState(result.state);
          return Response.json({
            ok: result.ok,
            state: result.state,
            reason: result.ok ? undefined : result.reason,
          });
        }
        case "record_healthy": {
          const loaded = this.#loadOrInit(sessionId, nowMs);
          if (!loaded.ok) return corruptResponse(loaded.error);
          const result = applyHealthyTransition(loaded.state, {
            printfulOrderId: body.printfulOrderId as string | number | null | undefined,
            nowMs,
          });
          this.#writeState(result.state);
          return Response.json({
            ok: result.ok,
            state: result.state,
            reason: result.ok ? undefined : result.reason,
          });
        }
        case "operator_resolve": {
          const loaded = this.#loadOrInit(sessionId, nowMs);
          if (!loaded.ok) return corruptResponse(loaded.error);
          const state = applyOperatorResolvedTransition(loaded.state, {
            printfulOrderId: body.printfulOrderId as string | number | null | undefined,
            note: typeof body.note === "string" ? body.note : undefined,
            nowMs,
          });
          this.#writeState(state);
          return Response.json({ ok: true, state });
        }
        case "operator_authorized_recovery": {
          const loaded = this.#loadOrInit(sessionId, nowMs);
          if (!loaded.ok) return corruptResponse(loaded.error);
          const state = applyOperatorAuthorizedRecoveryTransition(loaded.state, {
            printfulOrderId: body.printfulOrderId as string | number | null | undefined,
            note: typeof body.note === "string" ? body.note : undefined,
            nowMs,
          });
          this.#writeState(state);
          return Response.json({ ok: true, state });
        }
        case "begin_failure_alert_claim": {
          const claimOwner =
            typeof body.claimOwner === "string" && body.claimOwner.trim()
              ? body.claimOwner.trim()
              : `claim_${nowMs}`;
          const loaded = this.#loadOrInit(sessionId, nowMs);
          if (!loaded.ok) return corruptResponse(loaded.error);
          const result = beginFailureAlertClaimTransition(loaded.state, { claimOwner, nowMs });
          if (result.ok) {
            this.#writeState(result.state);
          }
          return Response.json(result);
        }
        case "complete_failure_alert_delivered": {
          const loaded = this.#loadOrInit(sessionId, nowMs);
          if (!loaded.ok) return corruptResponse(loaded.error);
          const provider = typeof body.provider === "string" ? body.provider : "resend";
          const state = completeFailureAlertDeliveredTransition(loaded.state, {
            provider,
            claimOwner: typeof body.claimOwner === "string" ? body.claimOwner : undefined,
            nowMs,
          });
          this.#writeState(state);
          return Response.json({ ok: true, state });
        }
        case "complete_failure_alert_retryable_error": {
          const loaded = this.#loadOrInit(sessionId, nowMs);
          if (!loaded.ok) return corruptResponse(loaded.error);
          const state = completeFailureAlertRetryableErrorTransition(loaded.state, {
            provider: typeof body.provider === "string" ? body.provider : undefined,
            error: typeof body.error === "string" ? body.error : undefined,
            claimOwner: typeof body.claimOwner === "string" ? body.claimOwner : undefined,
            nowMs,
          });
          this.#writeState(state);
          return Response.json({ ok: true, state });
        }
        case "complete_failure_alert_terminal": {
          const loaded = this.#loadOrInit(sessionId, nowMs);
          if (!loaded.ok) return corruptResponse(loaded.error);
          const state = completeFailureAlertTerminalTransition(loaded.state, {
            provider: typeof body.provider === "string" ? body.provider : undefined,
            error: typeof body.error === "string" ? body.error : undefined,
            claimOwner: typeof body.claimOwner === "string" ? body.claimOwner : undefined,
            nowMs,
          });
          this.#writeState(state);
          return Response.json({ ok: true, state });
        }
        default:
          return Response.json({ ok: false, error: "unknown_action" }, { status: 400 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 280) : "coordinator_error";
      return Response.json({ ok: false, unavailable: true, error: message }, { status: 500 });
    }
  }
}
