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
      /**
       * Only when this is a true terminal provider event (`order_failed` /
       * `order_canceled`) may a KV `failed` mirror seed `terminal_failed`.
       * Ordinary pre-provider / local validation failures must omit this.
       */
      terminalEventType?: string | null;
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
      /** Optional provider id captured atomically with the terminal transition. */
      printfulOrderId?: string | number | null;
      now?: number;
    }
  | {
      type: "operator_recover";
      now?: number;
    }
  | {
      type: "operator_resolve";
      /** Explicit operator-supplied provider id (conflict-checked before lifecycle change). */
      explicitPrintfulOrderId?: string | number | null;
      /** KV bootstrap id — used only when authority has no provider id. */
      bootstrapPrintfulOrderId?: string | number | null;
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
    // AG-081: only true terminal provider evidence may seed terminal_failed.
    // Bare status:"failed" (retry/local validation) must remain retryable.
    const terminalEventType =
      typeof op.terminalEventType === "string" ? op.terminalEventType.trim() : "";
    if (isPrintfulTerminalFailureWebhookType(terminalEventType)) {
      return {
        ok: true,
        changed: true,
        state: bump(
          state,
          {
            printfulOrderId: id,
            lifecycle: "terminal_failed",
            terminalReason: "seeded_from_kv_failed",
            terminalEventType,
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
  // Bound and operator_recovered both hold an authoritative provider id when set.
  if (
    (state.lifecycle === "bound" || state.lifecycle === "operator_recovered") &&
    state.printfulOrderId
  ) {
    if (state.printfulOrderId === id) {
      if (state.lifecycle === "operator_recovered") {
        return {
          ok: true,
          changed: true,
          state: bump(
            state,
            {
              lifecycle: "bound",
              terminalReason: null,
              terminalEventType: null,
            },
            now,
          ),
          reason: "idempotent_bind",
        };
      }
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
  const incoming = normalizeAuthorityProviderOrderId(op.printfulOrderId ?? null);
  const existing = normalizeAuthorityProviderOrderId(state.printfulOrderId);

  // Fail closed on provider-id conflict — never mark terminal for the wrong identity.
  if (incoming && existing && incoming !== existing) {
    return { ok: false, state, reason: "conflicting_provider_id" };
  }

  const providerId = existing ?? incoming;

  if (state.lifecycle === "terminal_failed") {
    // Idempotent terminal: still allow capturing a missing provider id onto authority.
    if (incoming && !existing) {
      return {
        ok: true,
        changed: true,
        state: bump(
          state,
          {
            printfulOrderId: incoming,
            terminalEventType: eventType,
            terminalReason: reason ?? state.terminalReason,
          },
          now,
        ),
      };
    }
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
        printfulOrderId: providerId,
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
 * Atomic operator resolve: validate explicit id, recover terminal, and bind/return
 * the authoritative provider id in one serialized transition.
 */
function applyOperatorResolve(
  state: PrintOrderAuthorityState,
  op: Extract<PrintOrderAuthorityOp, { type: "operator_resolve" }>,
): PrintOrderAuthorityApplyResult {
  const now = op.now ?? Date.now();
  const explicit = normalizeAuthorityProviderOrderId(op.explicitPrintfulOrderId ?? null);
  const bootstrap = normalizeAuthorityProviderOrderId(op.bootstrapPrintfulOrderId ?? null);
  const existing = normalizeAuthorityProviderOrderId(state.printfulOrderId);

  // Conflict-check BEFORE any lifecycle change.
  if (explicit && existing && explicit !== existing) {
    return { ok: false, state, reason: "conflicting_provider_id" };
  }

  // Preserve authoritative id when present; otherwise explicit, else KV bootstrap.
  const targetId = existing ?? explicit ?? bootstrap;

  let next = state;
  let changed = false;

  if (next.lifecycle === "terminal_failed") {
    next = bump(
      next,
      {
        lifecycle: "operator_recovered",
        terminalReason: null,
        terminalEventType: null,
      },
      now,
    );
    changed = true;
  }

  if (targetId) {
    if (next.printfulOrderId === targetId && next.lifecycle === "bound") {
      return {
        ok: true,
        state: next,
        changed,
        reason: changed ? undefined : "idempotent_operator_resolve",
      };
    }
    // End state matches historical recover-then-bind: bound with authoritative id.
    next = bump(
      next,
      {
        printfulOrderId: targetId,
        lifecycle: "bound",
        terminalReason: null,
        terminalEventType: null,
      },
      now,
    );
    changed = true;
  }

  if (!changed) {
    return { ok: true, state: next, changed: false, reason: "idempotent_operator_resolve" };
  }
  return { ok: true, state: next, changed: true };
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
    case "operator_resolve":
      return applyOperatorResolve(state, op);
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
