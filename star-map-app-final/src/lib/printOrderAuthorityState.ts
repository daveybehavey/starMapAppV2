/**
 * Pure authority state machine for one logical print order (Stripe session).
 * Used by the SQLite Durable Object and by deterministic concurrency tests.
 *
 * Scope (intentionally thin — not #244/#245 orchestration):
 * - bindProviderOrderId
 * - markTerminalFailed (order_failed / order_canceled only)
 * - operatorRecover (explicit clear of terminal)
 * - seedFromKvMirror (lazy bootstrap; no production data mutation required)
 */

export type PrintOrderAuthorityLifecycle =
  | "unbound"
  | "bound"
  | "terminal_failed"
  | "operator_recovered";

export type PrintOrderAuthorityState = {
  sessionId: string;
  printfulOrderId: string | null;
  lifecycle: PrintOrderAuthorityLifecycle;
  terminalReason: string | null;
  terminalEventType: string | null;
  revision: number;
  updatedAt: number;
  seededFromKv: boolean;
};

export type PrintOrderAuthorityOp =
  | {
      type: "seed_from_kv";
      kvStatus?: "pending" | "sent" | "failed" | null;
      printfulOrderId?: string | number | null;
      now?: number;
    }
  | {
      type: "bind_provider_order_id";
      printfulOrderId: string | number;
      now?: number;
    }
  | {
      type: "mark_terminal_failed";
      eventType: string;
      reason?: string | null;
      now?: number;
    }
  | {
      type: "operator_recover";
      now?: number;
    };

export type PrintOrderAuthorityApplyResult =
  | {
      ok: true;
      state: PrintOrderAuthorityState;
      changed: boolean;
      reason?: string;
    }
  | {
      ok: false;
      state: PrintOrderAuthorityState;
      reason:
        | "terminal_blocks_bind"
        | "conflicting_provider_id"
        | "invalid_provider_id"
        | "operator_recover_not_terminal"
        | "invalid_session";
    };

export const PRINTFUL_TERMINAL_FAILURE_WEBHOOK_TYPES = new Set(["order_failed", "order_canceled"]);

export function isPrintfulTerminalFailureWebhookType(eventType: string): boolean {
  return PRINTFUL_TERMINAL_FAILURE_WEBHOOK_TYPES.has(eventType.trim());
}

export function normalizeAuthorityProviderOrderId(value: string | number | null | undefined): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

export function createUnboundAuthorityState(sessionId: string, now = Date.now()): PrintOrderAuthorityState {
  return {
    sessionId: sessionId.trim(),
    printfulOrderId: null,
    lifecycle: "unbound",
    terminalReason: null,
    terminalEventType: null,
    revision: 0,
    updatedAt: now,
    seededFromKv: false,
  };
}

function bump(
  state: PrintOrderAuthorityState,
  patch: Partial<PrintOrderAuthorityState>,
  now: number,
): PrintOrderAuthorityState {
  return {
    ...state,
    ...patch,
    revision: state.revision + 1,
    updatedAt: now,
  };
}

function applySeedFromKv(
  state: PrintOrderAuthorityState,
  op: Extract<PrintOrderAuthorityOp, { type: "seed_from_kv" }>,
): PrintOrderAuthorityApplyResult {
  if (state.revision > 0 || state.seededFromKv || state.lifecycle !== "unbound") {
    return { ok: true, state, changed: false, reason: "already_initialized" };
  }
  const now = op.now ?? Date.now();
  const id = normalizeAuthorityProviderOrderId(op.printfulOrderId ?? null);
  if (op.kvStatus === "failed") {
    return {
      ok: true,
      changed: true,
      state: bump(
        state,
        {
          printfulOrderId: id,
          lifecycle: "terminal_failed",
          terminalReason: "seeded_from_kv_failed",
          terminalEventType: "kv_seed",
          seededFromKv: true,
        },
        now,
      ),
    };
  }
  if (id && (op.kvStatus === "sent" || op.kvStatus === "pending")) {
    return {
      ok: true,
      changed: true,
      state: bump(
        state,
        {
          printfulOrderId: id,
          lifecycle: "bound",
          seededFromKv: true,
        },
        now,
      ),
    };
  }
  return {
    ok: true,
    changed: true,
    state: bump(state, { seededFromKv: true }, now),
  };
}

function applyBind(
  state: PrintOrderAuthorityState,
  op: Extract<PrintOrderAuthorityOp, { type: "bind_provider_order_id" }>,
): PrintOrderAuthorityApplyResult {
  const id = normalizeAuthorityProviderOrderId(op.printfulOrderId);
  if (!id) {
    return { ok: false, state, reason: "invalid_provider_id" };
  }
  if (state.lifecycle === "terminal_failed") {
    return { ok: false, state, reason: "terminal_blocks_bind" };
  }
  const now = op.now ?? Date.now();
  if (state.lifecycle === "bound" && state.printfulOrderId) {
    if (state.printfulOrderId === id) {
      return { ok: true, state, changed: false, reason: "idempotent_bind" };
    }
    return { ok: false, state, reason: "conflicting_provider_id" };
  }
  return {
    ok: true,
    changed: true,
    state: bump(
      state,
      {
        printfulOrderId: id,
        lifecycle: "bound",
        terminalReason: null,
        terminalEventType: null,
      },
      now,
    ),
  };
}

function applyMarkTerminalFailed(
  state: PrintOrderAuthorityState,
  op: Extract<PrintOrderAuthorityOp, { type: "mark_terminal_failed" }>,
): PrintOrderAuthorityApplyResult {
  const now = op.now ?? Date.now();
  const eventType = op.eventType.trim() || "order_failed";
  const reason = typeof op.reason === "string" && op.reason.trim() ? op.reason.trim().slice(0, 240) : null;
  if (state.lifecycle === "terminal_failed") {
    return { ok: true, state, changed: false, reason: "already_terminal" };
  }
  return {
    ok: true,
    changed: true,
    state: bump(
      state,
      {
        lifecycle: "terminal_failed",
        terminalEventType: eventType,
        terminalReason: reason,
      },
      now,
    ),
  };
}

function applyOperatorRecover(
  state: PrintOrderAuthorityState,
  op: Extract<PrintOrderAuthorityOp, { type: "operator_recover" }>,
): PrintOrderAuthorityApplyResult {
  if (state.lifecycle !== "terminal_failed") {
    return { ok: false, state, reason: "operator_recover_not_terminal" };
  }
  const now = op.now ?? Date.now();
  return {
    ok: true,
    changed: true,
    state: bump(
      state,
      {
        lifecycle: "operator_recovered",
        terminalReason: null,
        terminalEventType: null,
      },
      now,
    ),
  };
}

/**
 * Apply one authority operation. Deterministic and side-effect free.
 * Callers that need strong consistency must serialize applies (DO single-thread / mutex).
 */
export function applyPrintOrderAuthorityOp(
  state: PrintOrderAuthorityState,
  op: PrintOrderAuthorityOp,
): PrintOrderAuthorityApplyResult {
  if (!state.sessionId?.trim()) {
    return { ok: false, state, reason: "invalid_session" };
  }
  switch (op.type) {
    case "seed_from_kv":
      return applySeedFromKv(state, op);
    case "bind_provider_order_id":
      return applyBind(state, op);
    case "mark_terminal_failed":
      return applyMarkTerminalFailed(state, op);
    case "operator_recover":
      return applyOperatorRecover(state, op);
    default: {
      const _exhaustive: never = op;
      void _exhaustive;
      return { ok: true, state, changed: false };
    }
  }
}

/**
 * Simulate concurrent writers by applying a fixed interleaving through a single
 * serialized queue (models Durable Object single-threaded storage).
 */
export function applyPrintOrderAuthorityInterleaving(
  initial: PrintOrderAuthorityState,
  ops: PrintOrderAuthorityOp[],
): { final: PrintOrderAuthorityState; results: PrintOrderAuthorityApplyResult[] } {
  let state = initial;
  const results: PrintOrderAuthorityApplyResult[] = [];
  for (const op of ops) {
    const result = applyPrintOrderAuthorityOp(state, op);
    results.push(result);
    state = result.state;
  }
  return { final: state, results };
}

export function authorityLifecycleBlocksNonterminalMirror(
  lifecycle: PrintOrderAuthorityLifecycle | null | undefined,
): boolean {
  return lifecycle === "terminal_failed";
}
