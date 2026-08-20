import { createHash, randomBytes } from "node:crypto";

/**
 * Pure coordination state machine for per-print-order terminal failure + failure alerts.
 * Durable Object / in-memory stores apply these transitions inside short atomic steps.
 * Provider network I/O must stay outside these transitions.
 */

export const PRINT_ORDER_COORDINATOR_STATE_VERSION = 1 as const;

/** Resend retains Idempotency-Key records for 24 hours. */
export const RESEND_IDEMPOTENCY_KEY_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Safety margin inside Resend retention (matches checkout-recovery pattern). */
export const PRINT_FAILURE_ALERT_IDEMPOTENCY_SAFETY_MARGIN_MS = 4 * 60 * 60 * 1000;

/** Safe provider-dispatch window from first terminal-failure recording (ms). Target ≤20h. */
export const PRINT_FAILURE_ALERT_SAFE_PROVIDER_RETRY_WINDOW_MS =
  RESEND_IDEMPOTENCY_KEY_RETENTION_MS - PRINT_FAILURE_ALERT_IDEMPOTENCY_SAFETY_MARGIN_MS;

export const PRINT_ORDER_FAILURE_ALERT_PROVIDER_POLICY = "resend_only" as const;

export type PrintOrderAuthorityStatus =
  | "uninitialized"
  | "pending_files"
  | "healthy"
  | "failed"
  | "operator_resolved";

export type PrintOrderFailureAlertPhase =
  | "none"
  | "needed"
  | "claimed"
  | "delivered"
  | "retryable_error"
  | "operator_action_required";

export type PrintOrderCoordinatorFailureSource =
  | "printful_webhook"
  | "post_submit_files"
  | "retry"
  | "bootstrap_kv"
  | "other";

export type PrintOrderFailureAlertState = {
  phase: PrintOrderFailureAlertPhase;
  /** Opaque deterministic Resend Idempotency-Key for this logical failure alert. */
  idempotencyKey: string;
  claimOwner?: string;
  claimedAt?: number;
  deliveredAt?: number;
  provider?: string;
  error?: string;
  /** Wall-clock when terminal failure was first recorded (safe-window origin). */
  failureRecordedAt?: number;
};

export type PrintOrderCoordinatorState = {
  version: typeof PRINT_ORDER_COORDINATOR_STATE_VERSION;
  /** Opaque object identity material (never customer PII). */
  opaqueOrderKey: string;
  /** Checkout session id — internal coordination only; not used as DO name. */
  sessionId: string;
  authorityStatus: PrintOrderAuthorityStatus;
  error?: string;
  source?: PrintOrderCoordinatorFailureSource;
  printfulOrderId?: string;
  pendingFilesAt?: number;
  operatorResolvedAt?: number;
  operatorResolvedNote?: string;
  failureAlert: PrintOrderFailureAlertState;
  updatedAt: number;
};

export type PrintOrderCoordinatorReadResult =
  | { ok: true; state: PrintOrderCoordinatorState }
  | { ok: false; unavailable: true; error: string };

export type BeginFailureAlertClaimResult =
  | {
      ok: true;
      claimed: true;
      state: PrintOrderCoordinatorState;
      idempotencyKey: string;
      claimOwner: string;
    }
  | {
      ok: true;
      claimed: false;
      state: PrintOrderCoordinatorState;
      reason: "already_delivered" | "operator_action_required" | "not_failed" | "safe_window_elapsed";
    }
  | { ok: false; unavailable: true; error: string };

/**
 * Opaque Durable Object name derived from session id.
 * Never embeds raw session id, email, or other PII in the object name string.
 */
export function buildPrintOrderCoordinatorObjectName(sessionId: string): string {
  const digest = createHash("sha256")
    .update(`starmapco:print-order-coordinator:v1:${sessionId.trim()}`)
    .digest("hex");
  return `poc_${digest.slice(0, 48)}`;
}

/** Deterministic opaque Resend Idempotency-Key for a print-order failure alert. */
export function buildPrintOrderFailureAlertResendIdempotencyKey(sessionId: string): string {
  const digest = createHash("sha256")
    .update(`starmapco:print-order-failure-alert:v1:${sessionId.trim()}`)
    .digest("hex");
  return `pfa_${digest.slice(0, 48)}`;
}

export function newPrintOrderFailureAlertClaimOwner(): string {
  return `claim_${randomBytes(12).toString("hex")}`;
}

export function createUninitializedCoordinatorState(
  sessionId: string,
  nowMs: number = Date.now(),
): PrintOrderCoordinatorState {
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

export function isPrintOrderTerminalFailed(
  state: Pick<PrintOrderCoordinatorState, "authorityStatus"> | null | undefined,
): boolean {
  return state?.authorityStatus === "failed";
}

export function computePrintFailureAlertDispatchDeadlineMs(failureRecordedAtMs: number): number {
  return failureRecordedAtMs + PRINT_FAILURE_ALERT_SAFE_PROVIDER_RETRY_WINDOW_MS;
}

export type PrintFailureAlertDispatchGate = {
  allowed: boolean;
  deadlineMs: number | null;
  errorCode?: "missing_failure_recorded_at" | "idempotency_safe_window_elapsed";
};

export function evaluatePrintFailureAlertDispatchGate(input: {
  failureRecordedAtMs: number | null | undefined;
  nowMs: number;
}): PrintFailureAlertDispatchGate {
  if (
    typeof input.failureRecordedAtMs !== "number" ||
    !Number.isFinite(input.failureRecordedAtMs) ||
    input.failureRecordedAtMs <= 0
  ) {
    return { allowed: false, deadlineMs: null, errorCode: "missing_failure_recorded_at" };
  }
  if (!Number.isFinite(input.nowMs)) {
    return { allowed: false, deadlineMs: null, errorCode: "missing_failure_recorded_at" };
  }
  const deadlineMs = computePrintFailureAlertDispatchDeadlineMs(input.failureRecordedAtMs);
  if (input.nowMs >= deadlineMs) {
    return { allowed: false, deadlineMs, errorCode: "idempotency_safe_window_elapsed" };
  }
  return { allowed: true, deadlineMs };
}

/**
 * Bootstrap coordinator from an existing KV mirror when DO storage is empty.
 * Never invents healthy authority over an already-known KV `failed` record.
 */
export function bootstrapCoordinatorFromKvMirror(input: {
  sessionId: string;
  kvStatus?: "pending" | "sent" | "failed" | null;
  kvError?: string | null;
  printfulOrderId?: string | number | null;
  operatorFailureAlertedAt?: number | null;
  operatorFailureAlertProvider?: string | null;
  operatorFailureAlertError?: string | null;
  printfulFileReviewPendingAt?: number | null;
  operatorResolvedAt?: number | null;
  nowMs?: number;
}): PrintOrderCoordinatorState {
  const nowMs = input.nowMs ?? Date.now();
  const base = createUninitializedCoordinatorState(input.sessionId, nowMs);
  const printfulOrderId =
    input.printfulOrderId === null || input.printfulOrderId === undefined
      ? undefined
      : String(input.printfulOrderId);

  if (input.kvStatus === "failed") {
    const failureRecordedAt = nowMs;
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
        failureRecordedAt,
        deliveredAt: delivered ? input.operatorFailureAlertedAt! : undefined,
        provider: input.operatorFailureAlertProvider?.trim() || undefined,
        error: delivered ? undefined : input.operatorFailureAlertError?.trim() || undefined,
      },
      updatedAt: nowMs,
    };
  }

  if (typeof input.operatorResolvedAt === "number" && input.operatorResolvedAt > 0) {
    return {
      ...base,
      authorityStatus: "operator_resolved",
      printfulOrderId,
      operatorResolvedAt: input.operatorResolvedAt,
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

  return {
    ...base,
    printfulOrderId,
    updatedAt: nowMs,
  };
}

/** Monotonic terminal failure — never cleared by later healthy/pending events. */
export function applyTerminalFailureTransition(
  state: PrintOrderCoordinatorState,
  input: {
    error: string;
    source: PrintOrderCoordinatorFailureSource;
    printfulOrderId?: string | number | null;
    nowMs?: number;
  },
): PrintOrderCoordinatorState {
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

  const idempotencyKey = state.failureAlert.idempotencyKey || buildPrintOrderFailureAlertResendIdempotencyKey(state.sessionId);
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
      claimOwner: undefined,
      claimedAt: undefined,
    },
    updatedAt: nowMs,
  };
}

/** Pending file review — refused when terminal failure already recorded. */
export function applyPendingFilesTransition(
  state: PrintOrderCoordinatorState,
  input: { printfulOrderId?: string | number | null; nowMs?: number } = {},
): { ok: true; state: PrintOrderCoordinatorState } | { ok: false; reason: "terminal_failed" | "operator_resolved"; state: PrintOrderCoordinatorState } {
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
      authorityStatus: "pending_files",
      pendingFilesAt: state.pendingFilesAt ?? nowMs,
      printfulOrderId:
        input.printfulOrderId != null ? String(input.printfulOrderId) : state.printfulOrderId,
      updatedAt: nowMs,
    },
  };
}

/**
 * Healthy / accepted transition.
 * Refused when terminal failure is already authoritative.
 */
export function applyHealthyTransition(
  state: PrintOrderCoordinatorState,
  input: { printfulOrderId?: string | number | null; nowMs?: number } = {},
): { ok: true; state: PrintOrderCoordinatorState } | { ok: false; reason: "terminal_failed" | "operator_resolved"; state: PrintOrderCoordinatorState } {
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

export function applyOperatorResolvedTransition(
  state: PrintOrderCoordinatorState,
  input: {
    printfulOrderId?: string | number | null;
    note?: string;
    nowMs?: number;
  } = {},
): PrintOrderCoordinatorState {
  const nowMs = input.nowMs ?? Date.now();
  return {
    ...state,
    authorityStatus: "operator_resolved",
    pendingFilesAt: undefined,
    error: undefined,
    printfulOrderId:
      input.printfulOrderId != null ? String(input.printfulOrderId) : state.printfulOrderId,
    operatorResolvedAt: nowMs,
    operatorResolvedNote: input.note?.trim() || state.operatorResolvedNote,
    updatedAt: nowMs,
  };
}

/**
 * Claim (or re-claim) failure-alert send. Recoverable after crash-before-send:
 * claimed / retryable_error both re-enter with the same deterministic idempotency key.
 */
export function beginFailureAlertClaimTransition(
  state: PrintOrderCoordinatorState,
  input: { claimOwner: string; nowMs?: number },
): BeginFailureAlertClaimResult {
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
    const next: PrintOrderCoordinatorState = {
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
  const next: PrintOrderCoordinatorState = {
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
  return {
    ok: true,
    claimed: true,
    state: next,
    idempotencyKey,
    claimOwner: input.claimOwner,
  };
}

/**
 * Mark failure alert delivered. Monotonic: once delivered, stays delivered.
 * Optional claimOwner is recorded for observability; provider success always upgrades to delivered.
 */
export function completeFailureAlertDeliveredTransition(
  state: PrintOrderCoordinatorState,
  input: { provider: string; claimOwner?: string; nowMs?: number },
): PrintOrderCoordinatorState {
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

/**
 * Record a retryable provider failure. Never regresses an already-delivered alert
 * (guards the overlapping success-vs-409 completion race).
 */
export function completeFailureAlertRetryableErrorTransition(
  state: PrintOrderCoordinatorState,
  input: { provider?: string; error?: string; claimOwner?: string; nowMs?: number },
): PrintOrderCoordinatorState {
  const nowMs = input.nowMs ?? Date.now();
  if (state.failureAlert.phase === "delivered") {
    return state;
  }
  if (state.failureAlert.phase === "operator_action_required") {
    return state;
  }
  // Claim-scoped completion: ignore stale completions from a superseded claim owner.
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

/**
 * Terminal / not-configured alert outcomes → explicit operator action.
 * Never regresses delivered.
 */
export function completeFailureAlertTerminalTransition(
  state: PrintOrderCoordinatorState,
  input: { provider?: string; error?: string; claimOwner?: string; nowMs?: number },
): PrintOrderCoordinatorState {
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

/**
 * Explicit admin-authorized recovery after a successful operator retry create/re-establish.
 * This is the only transition that clears terminal `failed` outside the resolve route.
 */
export function applyOperatorAuthorizedRecoveryTransition(
  state: PrintOrderCoordinatorState,
  input: {
    printfulOrderId?: string | number | null;
    note?: string;
    nowMs?: number;
  } = {},
): PrintOrderCoordinatorState {
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

const AUTHORITY_STATUSES = new Set([
  "uninitialized",
  "pending_files",
  "healthy",
  "failed",
  "operator_resolved",
]);

const ALERT_PHASES = new Set([
  "none",
  "needed",
  "claimed",
  "delivered",
  "retryable_error",
  "operator_action_required",
]);

const FAILURE_SOURCES = new Set([
  "printful_webhook",
  "post_submit_files",
  "retry",
  "bootstrap_kv",
  "other",
]);

/**
 * Validate a persisted coordinator row/state. Invalid → unavailable/corrupt (fail closed).
 */
export function parseCoordinatorStateOrCorrupt(
  raw: unknown,
  expectedSessionId?: string,
):
  | { ok: true; state: PrintOrderCoordinatorState }
  | { ok: false; corrupt: true; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_empty" };
  }
  const row = raw as Record<string, unknown>;
  const version = row.version;
  if (version !== PRINT_ORDER_COORDINATOR_STATE_VERSION && version !== 1) {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_version" };
  }
  const sessionId = typeof row.sessionId === "string" ? row.sessionId.trim() : "";
  if (!sessionId) {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_session" };
  }
  if (expectedSessionId && sessionId !== expectedSessionId.trim()) {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_session_mismatch" };
  }
  const opaqueOrderKey = typeof row.opaqueOrderKey === "string" ? row.opaqueOrderKey.trim() : "";
  if (!opaqueOrderKey || !opaqueOrderKey.startsWith("poc_")) {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_opaque_key" };
  }
  const expectedOpaque = buildPrintOrderCoordinatorObjectName(sessionId);
  if (opaqueOrderKey !== expectedOpaque) {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_opaque_mismatch" };
  }
  const authorityStatus = typeof row.authorityStatus === "string" ? row.authorityStatus : "";
  if (!AUTHORITY_STATUSES.has(authorityStatus)) {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_authority" };
  }
  const updatedAt = row.updatedAt;
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt) || updatedAt <= 0) {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_updated_at" };
  }
  const failureAlert = row.failureAlert;
  if (!failureAlert || typeof failureAlert !== "object") {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_alert" };
  }
  const alert = failureAlert as Record<string, unknown>;
  const phase = typeof alert.phase === "string" ? alert.phase : "";
  if (!ALERT_PHASES.has(phase)) {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_alert_phase" };
  }
  const idempotencyKey = typeof alert.idempotencyKey === "string" ? alert.idempotencyKey.trim() : "";
  if (!idempotencyKey || !idempotencyKey.startsWith("pfa_")) {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_alert_key" };
  }
  const expectedKey = buildPrintOrderFailureAlertResendIdempotencyKey(sessionId);
  if (idempotencyKey !== expectedKey) {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_alert_key_mismatch" };
  }
  const source = row.source;
  if (source != null && (typeof source !== "string" || !FAILURE_SOURCES.has(source))) {
    return { ok: false, corrupt: true, error: "print_order_coordinator_corrupt_source" };
  }
  for (const tsField of ["pendingFilesAt", "operatorResolvedAt"] as const) {
    const v = row[tsField];
    if (v != null && (typeof v !== "number" || !Number.isFinite(v) || v <= 0)) {
      return { ok: false, corrupt: true, error: `print_order_coordinator_corrupt_${tsField}` };
    }
  }
  for (const tsField of ["claimedAt", "deliveredAt", "failureRecordedAt"] as const) {
    const v = alert[tsField];
    if (v != null && (typeof v !== "number" || !Number.isFinite(v) || v <= 0)) {
      return { ok: false, corrupt: true, error: `print_order_coordinator_corrupt_alert_${tsField}` };
    }
  }

  return {
    ok: true,
    state: {
      version: PRINT_ORDER_COORDINATOR_STATE_VERSION,
      opaqueOrderKey,
      sessionId,
      authorityStatus: authorityStatus as PrintOrderCoordinatorState["authorityStatus"],
      error: typeof row.error === "string" ? row.error : undefined,
      source: typeof source === "string" ? (source as PrintOrderCoordinatorFailureSource) : undefined,
      printfulOrderId: typeof row.printfulOrderId === "string" ? row.printfulOrderId : undefined,
      pendingFilesAt: typeof row.pendingFilesAt === "number" ? row.pendingFilesAt : undefined,
      operatorResolvedAt: typeof row.operatorResolvedAt === "number" ? row.operatorResolvedAt : undefined,
      operatorResolvedNote:
        typeof row.operatorResolvedNote === "string" ? row.operatorResolvedNote : undefined,
      failureAlert: {
        phase: phase as PrintOrderFailureAlertState["phase"],
        idempotencyKey,
        claimOwner: typeof alert.claimOwner === "string" ? alert.claimOwner : undefined,
        claimedAt: typeof alert.claimedAt === "number" ? alert.claimedAt : undefined,
        deliveredAt: typeof alert.deliveredAt === "number" ? alert.deliveredAt : undefined,
        provider: typeof alert.provider === "string" ? alert.provider : undefined,
        error: typeof alert.error === "string" ? alert.error : undefined,
        failureRecordedAt:
          typeof alert.failureRecordedAt === "number" ? alert.failureRecordedAt : undefined,
      },
      updatedAt,
    },
  };
}

/** Overlay coordinator authority onto a KV mirror record (DO wins for terminal failure). */
export function overlayCoordinatorOntoPrintOrderRecord<T extends {
  status: "pending" | "sent" | "failed";
  error?: string;
  printfulOrderId?: string | number;
  operatorFailureAlertedAt?: number;
  operatorFailureAlertProvider?: string;
  operatorFailureAlertError?: string;
  printfulFileReviewPendingAt?: number;
  operatorResolvedAt?: number;
  operatorResolvedNote?: string;
  operatorResolvedProvider?: "manual_printful" | "manual_other";
}>(
  record: T,
  state: PrintOrderCoordinatorState | null | undefined,
): T {
  if (!state || state.authorityStatus === "uninitialized") {
    return record;
  }

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
      operatorFailureAlertProvider:
        state.failureAlert.provider || record.operatorFailureAlertProvider,
      operatorFailureAlertError:
        state.failureAlert.phase === "delivered"
          ? undefined
          : state.failureAlert.error || record.operatorFailureAlertError,
    };
  }

  if (state.authorityStatus === "pending_files") {
    return {
      ...record,
      status: record.status === "failed" ? "sent" : record.status,
      printfulFileReviewPendingAt: state.pendingFilesAt ?? record.printfulFileReviewPendingAt ?? Date.now(),
      printfulOrderId: state.printfulOrderId || record.printfulOrderId,
    };
  }

  if (state.authorityStatus === "operator_resolved") {
    return {
      ...record,
      status: "sent",
      error: undefined,
      printfulFileReviewPendingAt: undefined,
      printfulOrderId: state.printfulOrderId || record.printfulOrderId,
      operatorResolvedAt: state.operatorResolvedAt ?? record.operatorResolvedAt,
      operatorResolvedNote: state.operatorResolvedNote || record.operatorResolvedNote,
      operatorResolvedProvider: record.operatorResolvedProvider ?? "manual_printful",
    };
  }

  if (state.authorityStatus === "healthy") {
    // Never let a stale KV failed wipe DO healthy after operator... actually DO healthy
    // must not override KV failed without bootstrap — callers bootstrap first.
    // If DO says healthy, clear pending marker.
    return {
      ...record,
      printfulFileReviewPendingAt: undefined,
      printfulOrderId: state.printfulOrderId || record.printfulOrderId,
    };
  }

  return record;
}

/**
 * Whether a KV write that would present as healthy/sent is allowed.
 * Terminal DO failure always blocks; unavailable coordinator fails closed when required.
 */
export function shouldBlockHealthyKvMirrorWrite(input: {
  coordinator: PrintOrderCoordinatorReadResult;
  requireCoordinatorReadable: boolean;
}): { allow: boolean; error?: string; state?: PrintOrderCoordinatorState } {
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
