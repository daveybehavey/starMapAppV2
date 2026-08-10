/** Keep in sync with src/lib/printOrderTerminalState.ts core helpers (testable without CF). */

export const PRINT_ORDER_TERMINAL_STATE_VERSION = 1;

export function printOrderTerminalObjectKey(sessionId) {
  return `print-order-terminal/${sessionId.trim()}`;
}

export function isPrintOrderTerminalState(value) {
  if (!value || typeof value !== "object") return false;
  return (
    value.version === PRINT_ORDER_TERMINAL_STATE_VERSION &&
    typeof value.sessionId === "string" &&
    value.status === "failed" &&
    typeof value.error === "string" &&
    typeof value.source === "string" &&
    typeof value.recordedAt === "number"
  );
}

export function mergePrintOrderTerminalState(existing, input) {
  const recordedAt = existing?.recordedAt ?? input.recordedAt ?? Date.now();
  const alertedAt = existing?.operatorFailureAlertedAt ?? input.operatorFailureAlertedAt;
  return {
    version: PRINT_ORDER_TERMINAL_STATE_VERSION,
    sessionId: existing?.sessionId ?? input.sessionId,
    status: "failed",
    error: existing?.error || input.error,
    source: existing?.source ?? input.source,
    recordedAt,
    operatorFailureAlertedAt: alertedAt,
    operatorFailureAlertProvider:
      existing?.operatorFailureAlertProvider ?? input.operatorFailureAlertProvider,
    operatorFailureAlertError:
      alertedAt !== undefined
        ? existing?.operatorFailureAlertError ?? input.operatorFailureAlertError
        : input.operatorFailureAlertError ?? existing?.operatorFailureAlertError,
  };
}

export function overlayPrintOrderTerminalState(order, terminal) {
  if (!order) return null;
  if (!terminal) return order;
  return {
    ...order,
    status: "failed",
    error: terminal.error || order.error,
    printfulFileReviewPendingAt: undefined,
    operatorFailureAlertedAt: terminal.operatorFailureAlertedAt ?? order.operatorFailureAlertedAt,
    operatorFailureAlertProvider:
      terminal.operatorFailureAlertProvider ?? order.operatorFailureAlertProvider,
    operatorFailureAlertError: terminal.operatorFailureAlertError ?? order.operatorFailureAlertError,
  };
}

export function createMemoryPrintOrderTerminalStore(seed) {
  const store = seed ?? new Map();
  return {
    async get(key) {
      const row = store.get(key);
      return row ? { body: row.body, etag: row.etag } : null;
    },
    async put(key, body, onlyIf) {
      const current = store.get(key);
      if (onlyIf?.createOnly) {
        if (current) return null;
      } else if (onlyIf?.etagMatches) {
        if (!current || current.etag !== onlyIf.etagMatches) return null;
      }
      const generation = (current?.generation ?? 0) + 1;
      const etag = `"term-${generation}"`;
      store.set(key, { body, etag, generation });
      return { etag };
    },
    /** Test helper: inspect raw map */
    _store: store,
  };
}

export async function readPrintOrderTerminalState(sessionId, deps = {}) {
  const store = deps.store;
  if (!store) return { ok: false, unavailable: true, error: "print_order_terminal_store_unavailable" };
  const key = printOrderTerminalObjectKey(sessionId);
  const row = await store.get(key);
  if (!row) return { ok: true, state: null, etag: null };
  try {
    const parsed = JSON.parse(row.body);
    return {
      ok: true,
      state: isPrintOrderTerminalState(parsed) ? parsed : null,
      etag: row.etag,
    };
  } catch {
    return { ok: true, state: null, etag: row.etag };
  }
}

export async function recordPrintOrderTerminalFailure(input, deps = {}) {
  const store = deps.store;
  if (!store) return { ok: false, unavailable: true, error: "print_order_terminal_store_unavailable" };
  const key = printOrderTerminalObjectKey(input.sessionId);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await store.get(key);
    if (!current) {
      const created = mergePrintOrderTerminalState(null, input);
      const put = await store.put(key, JSON.stringify(created), { createOnly: true });
      if (put) return { ok: true, state: created, etag: put.etag, created: true };
      continue;
    }
    let existing = null;
    try {
      const parsed = JSON.parse(current.body);
      existing = isPrintOrderTerminalState(parsed) ? parsed : null;
    } catch {
      existing = null;
    }
    const merged = mergePrintOrderTerminalState(existing, input);
    const put = await store.put(key, JSON.stringify(merged), { etagMatches: current.etag });
    if (put) return { ok: true, state: merged, etag: put.etag, created: false };
  }

  const latest = await readPrintOrderTerminalState(input.sessionId, deps);
  if (latest.ok && latest.state) {
    return { ok: false, conflict: true, state: latest.state, etag: latest.etag || `"unknown"` };
  }
  return { ok: false, unavailable: true, error: "print_order_terminal_cas_exhausted" };
}

export async function getEffectivePrintOrderRecord(sessionId, kvRecord, deps = {}) {
  const terminalRead = await readPrintOrderTerminalState(sessionId, deps);
  if (!terminalRead.ok) {
    if (deps.requireTerminalReadable) return terminalRead;
    return { ok: true, order: kvRecord, terminal: null };
  }
  return {
    ok: true,
    order: overlayPrintOrderTerminalState(kvRecord, terminalRead.state),
    terminal: terminalRead.state,
  };
}

export async function persistPrintOrderKvMirror(sessionId, candidate, deps = {}) {
  const kv = deps.kvStore ?? new Map();
  const key = `print:order:${sessionId}`;
  const effective = await getEffectivePrintOrderRecord(sessionId, candidate, {
    store: deps.store,
    requireTerminalReadable: deps.requireTerminalReadable,
  });
  if (!effective.ok) return effective;
  const toWrite = effective.order ?? candidate;
  kv.set(key, toWrite);
  return { ok: true, order: toWrite, terminal: effective.terminal, wroteKv: true, kv };
}
