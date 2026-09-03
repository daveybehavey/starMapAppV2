/** Keep in sync with src/lib/printOrderAuthorityState.ts */

export const PRINTFUL_TERMINAL_FAILURE_WEBHOOK_TYPES = new Set(["order_failed", "order_canceled"]);

export function isPrintfulTerminalFailureWebhookType(eventType) {
  return PRINTFUL_TERMINAL_FAILURE_WEBHOOK_TYPES.has(eventType.trim());
}

export function normalizeAuthorityProviderOrderId(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

export function createUnboundAuthorityState(sessionId, now = Date.now()) {
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

function bump(state, patch, now) {
  return {
    ...state,
    ...patch,
    revision: state.revision + 1,
    updatedAt: now,
  };
}

export function applyPrintOrderAuthorityOp(state, op) {
  if (!state.sessionId?.trim()) {
    return { ok: false, state, reason: "invalid_session" };
  }
  switch (op.type) {
    case "seed_from_kv": {
      if (state.revision > 0 || state.seededFromKv || state.lifecycle !== "unbound") {
        return { ok: true, state, changed: false, reason: "already_initialized" };
      }
      const now = op.now ?? Date.now();
      const id = normalizeAuthorityProviderOrderId(op.printfulOrderId ?? null);
      if (op.kvStatus === "failed") {
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
        return { ok: true, changed: true, state: bump(state, { seededFromKv: true }, now) };
      }
      if (id && (op.kvStatus === "sent" || op.kvStatus === "pending")) {
        return {
          ok: true,
          changed: true,
          state: bump(state, { printfulOrderId: id, lifecycle: "bound", seededFromKv: true }, now),
        };
      }
      return { ok: true, changed: true, state: bump(state, { seededFromKv: true }, now) };
    }
    case "bind_provider_order_id": {
      const id = normalizeAuthorityProviderOrderId(op.printfulOrderId);
      if (!id) return { ok: false, state, reason: "invalid_provider_id" };
      if (state.lifecycle === "terminal_failed") {
        return { ok: false, state, reason: "terminal_blocks_bind" };
      }
      const now = op.now ?? Date.now();
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
    case "mark_terminal_failed": {
      const now = op.now ?? Date.now();
      const eventType = op.eventType.trim() || "order_failed";
      const reason =
        typeof op.reason === "string" && op.reason.trim() ? op.reason.trim().slice(0, 240) : null;
      const incoming = normalizeAuthorityProviderOrderId(op.printfulOrderId ?? null);
      const existing = normalizeAuthorityProviderOrderId(state.printfulOrderId);
      if (incoming && existing && incoming !== existing) {
        return { ok: false, state, reason: "conflicting_provider_id" };
      }
      const providerId = existing ?? incoming;
      if (state.lifecycle === "terminal_failed") {
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
    case "operator_recover": {
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
    case "operator_resolve": {
      const now = op.now ?? Date.now();
      const explicit = normalizeAuthorityProviderOrderId(op.explicitPrintfulOrderId ?? null);
      const bootstrap = normalizeAuthorityProviderOrderId(op.bootstrapPrintfulOrderId ?? null);
      const existing = normalizeAuthorityProviderOrderId(state.printfulOrderId);

      if (explicit && existing && explicit !== existing) {
        return { ok: false, state, reason: "conflicting_provider_id" };
      }

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
    default:
      return { ok: true, state, changed: false };
  }
}

export function applyPrintOrderAuthorityInterleaving(initial, ops) {
  let state = initial;
  const results = [];
  for (const op of ops) {
    const result = applyPrintOrderAuthorityOp(state, op);
    results.push(result);
    state = result.state;
  }
  return { final: state, results };
}

export function authorityLifecycleBlocksNonterminalMirror(lifecycle) {
  return lifecycle === "terminal_failed";
}

/** In-memory serialized authority — models DO single-threaded applies for concurrency proofs. */
export function createSerializedAuthorityStore() {
  const stores = new Map();
  const queues = new Map();

  async function withLock(sessionId, fn) {
    const prev = queues.get(sessionId) ?? Promise.resolve();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    queues.set(
      sessionId,
      prev.then(() => gate),
    );
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  return {
    async get(sessionId) {
      return stores.get(sessionId) ?? createUnboundAuthorityState(sessionId);
    },
    async apply(sessionId, op) {
      return withLock(sessionId, () => {
        const current = stores.get(sessionId) ?? createUnboundAuthorityState(sessionId);
        const result = applyPrintOrderAuthorityOp(current, op);
        if (result.ok && result.changed) stores.set(sessionId, result.state);
        return result;
      });
    },
  };
}
