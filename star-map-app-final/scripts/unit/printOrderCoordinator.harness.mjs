/**
 * Pure helpers re-exported for print-order coordinator unit tests.
 * Mirrors production transitions without Durable Object / network I/O.
 */
import { createHash } from "node:crypto";

export const PRINT_ORDER_COORDINATOR_STATE_VERSION = 1;
export const RESEND_IDEMPOTENCY_KEY_RETENTION_MS = 24 * 60 * 60 * 1000;
export const PRINT_FAILURE_ALERT_IDEMPOTENCY_SAFETY_MARGIN_MS = 4 * 60 * 60 * 1000;
export const PRINT_FAILURE_ALERT_SAFE_PROVIDER_RETRY_WINDOW_MS =
  RESEND_IDEMPOTENCY_KEY_RETENTION_MS - PRINT_FAILURE_ALERT_IDEMPOTENCY_SAFETY_MARGIN_MS;

export function buildPrintOrderCoordinatorObjectName(sessionId) {
  const digest = createHash("sha256")
    .update(`starmapco:print-order-coordinator:v1:${sessionId.trim()}`)
    .digest("hex");
  return `poc_${digest.slice(0, 48)}`;
}

export function buildPrintOrderFailureAlertResendIdempotencyKey(sessionId) {
  const digest = createHash("sha256")
    .update(`starmapco:print-order-failure-alert:v1:${sessionId.trim()}`)
    .digest("hex");
  return `pfa_${digest.slice(0, 48)}`;
}

export function createUninitializedCoordinatorState(sessionId, nowMs = Date.now()) {
  const trimmed = sessionId.trim();
  return {
    version: PRINT_ORDER_COORDINATOR_STATE_VERSION,
    opaqueOrderKey: buildPrintOrderCoordinatorObjectName(trimmed),
    sessionId: trimmed,
    authorityStatus: "uninitialized",
    failureAlert: {
      phase: "none",
      idempotencyKey: buildPrintOrderFailureAlertResendIdempotencyKey(trimmed),
    },
    updatedAt: nowMs,
  };
}

export function bootstrapCoordinatorFromKvMirror(input) {
  const nowMs = input.nowMs ?? Date.now();
  const base = createUninitializedCoordinatorState(input.sessionId, nowMs);
  const printfulOrderId =
    input.printfulOrderId === null || input.printfulOrderId === undefined
      ? undefined
      : String(input.printfulOrderId);

  if (input.kvStatus === "failed") {
    const delivered = typeof input.operatorFailureAlertedAt === "number" && input.operatorFailureAlertedAt > 0;
    return {
      ...base,
      authorityStatus: "failed",
      error: input.kvError?.trim() || "print_order_failed",
      source: "bootstrap_kv",
      printfulOrderId,
      failureAlert: {
        phase: delivered ? "delivered" : "needed",
        idempotencyKey: base.failureAlert.idempotencyKey,
        failureRecordedAt: nowMs,
        deliveredAt: delivered ? input.operatorFailureAlertedAt : undefined,
        provider: input.operatorFailureAlertProvider?.trim() || undefined,
        error: delivered ? undefined : input.operatorFailureAlertError?.trim() || undefined,
      },
      updatedAt: nowMs,
    };
  }

  if (typeof input.printfulFileReviewPendingAt === "number" && input.printfulFileReviewPendingAt > 0) {
    return {
      ...base,
      authorityStatus: "pending_files",
      printfulOrderId,
      pendingFilesAt: input.printfulFileReviewPendingAt,
      updatedAt: nowMs,
    };
  }

  if (input.kvStatus === "sent") {
    return {
      ...base,
      authorityStatus: "healthy",
      printfulOrderId,
      updatedAt: nowMs,
    };
  }

  return { ...base, printfulOrderId, updatedAt: nowMs };
}

export function applyTerminalFailureTransition(state, input) {
  const nowMs = input.nowMs ?? Date.now();
  if (state.authorityStatus === "failed") {
    return {
      ...state,
      error: state.error || input.error,
      printfulOrderId:
        state.printfulOrderId ||
        (input.printfulOrderId != null ? String(input.printfulOrderId) : undefined),
      updatedAt: nowMs,
    };
  }
  if (state.authorityStatus === "operator_resolved") {
    return { ...state, updatedAt: nowMs };
  }
  const idempotencyKey =
    state.failureAlert.idempotencyKey || buildPrintOrderFailureAlertResendIdempotencyKey(state.sessionId);
  return {
    ...state,
    authorityStatus: "failed",
    error: input.error.trim() || "print_order_failed",
    source: input.source,
    printfulOrderId:
      input.printfulOrderId != null ? String(input.printfulOrderId) : state.printfulOrderId,
    pendingFilesAt: undefined,
    failureAlert: {
      phase: state.failureAlert.phase === "delivered" ? "delivered" : "needed",
      idempotencyKey,
      failureRecordedAt: nowMs,
      deliveredAt: state.failureAlert.deliveredAt,
      provider: state.failureAlert.provider,
      error: state.failureAlert.phase === "delivered" ? undefined : state.failureAlert.error,
    },
    updatedAt: nowMs,
  };
}

export function applyHealthyTransition(state, input = {}) {
  if (state.authorityStatus === "failed") {
    return { ok: false, reason: "terminal_failed", state };
  }
  if (state.authorityStatus === "operator_resolved") {
    return { ok: false, reason: "operator_resolved", state };
  }
  const nowMs = input.nowMs ?? Date.now();
  return {
    ok: true,
    state: {
      ...state,
      authorityStatus: "healthy",
      pendingFilesAt: undefined,
      error: undefined,
      printfulOrderId:
        input.printfulOrderId != null ? String(input.printfulOrderId) : state.printfulOrderId,
      updatedAt: nowMs,
    },
  };
}

export function applyPendingFilesTransition(state, input = {}) {
  if (state.authorityStatus === "failed") {
    return { ok: false, reason: "terminal_failed", state };
  }
  const nowMs = input.nowMs ?? Date.now();
  return {
    ok: true,
    state: {
      ...state,
      authorityStatus: "pending_files",
      pendingFilesAt: state.pendingFilesAt ?? nowMs,
      printfulOrderId:
        input.printfulOrderId != null ? String(input.printfulOrderId) : state.printfulOrderId,
      updatedAt: nowMs,
    },
  };
}

export function evaluatePrintFailureAlertDispatchGate(input) {
  if (
    typeof input.failureRecordedAtMs !== "number" ||
    !Number.isFinite(input.failureRecordedAtMs) ||
    input.failureRecordedAtMs <= 0
  ) {
    return { allowed: false, deadlineMs: null, errorCode: "missing_failure_recorded_at" };
  }
  const deadlineMs = input.failureRecordedAtMs + PRINT_FAILURE_ALERT_SAFE_PROVIDER_RETRY_WINDOW_MS;
  if (input.nowMs >= deadlineMs) {
    return { allowed: false, deadlineMs, errorCode: "idempotency_safe_window_elapsed" };
  }
  return { allowed: true, deadlineMs };
}

export function beginFailureAlertClaimTransition(state, input) {
  const nowMs = input.nowMs ?? Date.now();
  if (state.authorityStatus !== "failed") {
    return { ok: true, claimed: false, state, reason: "not_failed" };
  }
  if (state.failureAlert.phase === "delivered") {
    return { ok: true, claimed: false, state, reason: "already_delivered" };
  }
  if (state.failureAlert.phase === "operator_action_required") {
    return { ok: true, claimed: false, state, reason: "operator_action_required" };
  }
  const failureRecordedAt = state.failureAlert.failureRecordedAt ?? state.updatedAt;
  const gate = evaluatePrintFailureAlertDispatchGate({
    failureRecordedAtMs: failureRecordedAt,
    nowMs,
  });
  if (!gate.allowed) {
    const next = {
      ...state,
      failureAlert: {
        ...state.failureAlert,
        phase: "operator_action_required",
        failureRecordedAt,
        error: gate.errorCode || "idempotency_safe_window_elapsed",
        claimOwner: undefined,
        claimedAt: undefined,
      },
      updatedAt: nowMs,
    };
    return { ok: true, claimed: false, state: next, reason: "safe_window_elapsed" };
  }
  const idempotencyKey =
    state.failureAlert.idempotencyKey || buildPrintOrderFailureAlertResendIdempotencyKey(state.sessionId);
  const next = {
    ...state,
    failureAlert: {
      ...state.failureAlert,
      phase: "claimed",
      idempotencyKey,
      claimOwner: input.claimOwner,
      claimedAt: nowMs,
      failureRecordedAt,
      error: undefined,
    },
    updatedAt: nowMs,
  };
  return { ok: true, claimed: true, state: next, idempotencyKey, claimOwner: input.claimOwner };
}

export function completeFailureAlertDeliveredTransition(state, input) {
  const nowMs = input.nowMs ?? Date.now();
  if (state.failureAlert.phase === "delivered") {
    return {
      ...state,
      failureAlert: {
        ...state.failureAlert,
        provider: state.failureAlert.provider || input.provider,
        deliveredAt: state.failureAlert.deliveredAt ?? nowMs,
        error: undefined,
        claimOwner: undefined,
        claimedAt: undefined,
      },
      updatedAt: nowMs,
    };
  }
  return {
    ...state,
    failureAlert: {
      ...state.failureAlert,
      phase: "delivered",
      deliveredAt: nowMs,
      provider: input.provider,
      error: undefined,
      claimOwner: undefined,
      claimedAt: undefined,
    },
    updatedAt: nowMs,
  };
}

export function completeFailureAlertRetryableErrorTransition(state, input) {
  const nowMs = input.nowMs ?? Date.now();
  if (state.failureAlert.phase === "delivered") {
    return state;
  }
  if (state.failureAlert.phase === "operator_action_required") {
    return state;
  }
  if (
    input.claimOwner &&
    state.failureAlert.phase === "claimed" &&
    state.failureAlert.claimOwner &&
    state.failureAlert.claimOwner !== input.claimOwner
  ) {
    return state;
  }
  return {
    ...state,
    failureAlert: {
      ...state.failureAlert,
      phase: "retryable_error",
      provider: input.provider || state.failureAlert.provider,
      error: input.error?.slice(0, 280) || "print_failure_alert_retryable",
      claimOwner: undefined,
      claimedAt: undefined,
    },
    updatedAt: nowMs,
  };
}

export function completeFailureAlertTerminalTransition(state, input) {
  const nowMs = input.nowMs ?? Date.now();
  if (state.failureAlert.phase === "delivered") {
    return state;
  }
  if (
    input.claimOwner &&
    state.failureAlert.phase === "claimed" &&
    state.failureAlert.claimOwner &&
    state.failureAlert.claimOwner !== input.claimOwner
  ) {
    return state;
  }
  return {
    ...state,
    failureAlert: {
      ...state.failureAlert,
      phase: "operator_action_required",
      provider: input.provider || state.failureAlert.provider,
      error: input.error?.slice(0, 280) || "print_failure_alert_terminal",
      claimOwner: undefined,
      claimedAt: undefined,
    },
    updatedAt: nowMs,
  };
}

export function applyOperatorAuthorizedRecoveryTransition(state, input = {}) {
  const nowMs = input.nowMs ?? Date.now();
  return {
    ...state,
    authorityStatus: "healthy",
    error: undefined,
    pendingFilesAt: undefined,
    source: undefined,
    printfulOrderId:
      input.printfulOrderId != null ? String(input.printfulOrderId) : state.printfulOrderId,
    operatorResolvedAt: nowMs,
    operatorResolvedNote:
      input.note?.trim() || state.operatorResolvedNote || "operator_authorized_retry_recovery",
    failureAlert: {
      phase: "none",
      idempotencyKey: state.failureAlert.idempotencyKey,
    },
    updatedAt: nowMs,
  };
}

export function parseCoordinatorStateOrCorrupt(raw, expectedSessionId) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_empty" };
  }
  const AUTHORITY = new Set(["uninitialized", "pending_files", "healthy", "failed", "operator_resolved"]);
  const PHASES = new Set([
    "none",
    "needed",
    "claimed",
    "delivered",
    "retryable_error",
    "operator_action_required",
  ]);
  if (raw.version !== 1) {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_version" };
  }
  const sessionId = typeof raw.sessionId === "string" ? raw.sessionId.trim() : "";
  if (!sessionId) {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_session" };
  }
  if (expectedSessionId && sessionId !== expectedSessionId.trim()) {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_session_mismatch" };
  }
  const opaqueOrderKey = typeof raw.opaqueOrderKey === "string" ? raw.opaqueOrderKey.trim() : "";
  if (!opaqueOrderKey.startsWith("poc_")) {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_opaque_key" };
  }
  if (opaqueOrderKey !== buildPrintOrderCoordinatorObjectName(sessionId)) {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_opaque_mismatch" };
  }
  if (!AUTHORITY.has(raw.authorityStatus)) {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_authority" };
  }
  if (typeof raw.updatedAt !== "number" || !Number.isFinite(raw.updatedAt) || raw.updatedAt <= 0) {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_updated_at" };
  }
  const alert = raw.failureAlert;
  if (!alert || typeof alert !== "object") {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_alert" };
  }
  if (!PHASES.has(alert.phase)) {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_alert_phase" };
  }
  if (typeof alert.idempotencyKey !== "string" || !alert.idempotencyKey.startsWith("pfa_")) {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_alert_key" };
  }
  if (alert.idempotencyKey !== buildPrintOrderFailureAlertResendIdempotencyKey(sessionId)) {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_alert_key_mismatch" };
  }
  return { ok: true, state: raw };
}

export function overlayCoordinatorOntoPrintOrderRecord(record, state) {
  if (!state || state.authorityStatus === "uninitialized") return record;
  if (state.authorityStatus === "failed") {
    return {
      ...record,
      status: "failed",
      error: state.error || record.error || "print_order_failed",
      printfulOrderId: state.printfulOrderId || record.printfulOrderId,
      printfulFileReviewPendingAt: undefined,
      operatorFailureAlertedAt:
        state.failureAlert.phase === "delivered"
          ? state.failureAlert.deliveredAt ?? record.operatorFailureAlertedAt
          : record.operatorFailureAlertedAt,
      operatorFailureAlertProvider: state.failureAlert.provider || record.operatorFailureAlertProvider,
      operatorFailureAlertError:
        state.failureAlert.phase === "delivered"
          ? undefined
          : state.failureAlert.error || record.operatorFailureAlertError,
    };
  }
  return record;
}

export function shouldBlockHealthyKvMirrorWrite(input) {
  if (!input.coordinator.ok) {
    if (input.requireCoordinatorReadable) {
      return { allow: false, error: input.coordinator.error || "print_order_coordinator_unavailable" };
    }
    return { allow: true };
  }
  if (input.coordinator.state.authorityStatus === "failed") {
    return {
      allow: false,
      error: input.coordinator.state.error || "print_order_terminal_failed",
      state: input.coordinator.state,
    };
  }
  return { allow: true, state: input.coordinator.state };
}

export function classifyPrintFailureAlertHttpResult(status, bodySnippet) {
  if (status >= 200 && status < 300) {
    return { delivered: true, status, retryability: "delivered" };
  }
  if (status === 409) {
    let errorName = null;
    try {
      const parsed = JSON.parse(bodySnippet || "");
      errorName = typeof parsed?.name === "string" ? parsed.name.trim() : null;
    } catch {
      errorName = null;
    }
    if (errorName === "concurrent_idempotent_requests") {
      return {
        delivered: false,
        status,
        retryability: "retryable",
        errorCode: "concurrent_idempotent_requests",
      };
    }
    return { delivered: false, status, retryability: "terminal", errorCode: "provider_conflict" };
  }
  if (status === 429 || status >= 500) {
    return {
      delivered: false,
      status,
      retryability: "retryable",
      errorCode: status === 429 ? "provider_rate_limited" : "provider_server_error",
    };
  }
  return { delivered: false, status, retryability: "terminal", errorCode: "provider_client_error" };
}
