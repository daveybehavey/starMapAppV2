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

export function isPrintOrderTerminalWritePending(record) {
  return (
    record.status === "failed" &&
    typeof record.printOrderTerminalWritePendingAt === "number" &&
    record.printOrderTerminalWritePendingAt > 0
  );
}

export function mergePrintOrderTerminalState(existing, input) {
  const recordedAt = existing?.recordedAt ?? input.recordedAt ?? Date.now();
  const claimedAt = existing?.operatorFailureAlertClaimedAt ?? input.operatorFailureAlertClaimedAt;
  const alertedAt = existing?.operatorFailureAlertedAt ?? input.operatorFailureAlertedAt;
  return {
    version: PRINT_ORDER_TERMINAL_STATE_VERSION,
    sessionId: existing?.sessionId ?? input.sessionId,
    status: "failed",
    error: existing?.error || input.error,
    source: existing?.source ?? input.source,
    recordedAt,
    operatorFailureAlertClaimedAt: claimedAt,
    operatorFailureAlertClaimOwner:
      existing?.operatorFailureAlertClaimOwner ?? input.operatorFailureAlertClaimOwner,
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
    printOrderTerminalWritePendingAt: undefined,
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

/** Store that rejects all writes (simulates R2 outage after readable empty/corrupt). */
export function createUnavailableWriteTerminalStore(readStore) {
  return {
    async get(key) {
      return readStore ? readStore.get(key) : null;
    },
    async put() {
      throw new Error("print_order_terminal_write_failed");
    },
    _store: readStore?._store,
  };
}

export function createAlwaysUnavailableTerminalStore() {
  return {
    async get() {
      throw new Error("print_order_terminal_read_failed");
    },
    async put() {
      throw new Error("print_order_terminal_write_failed");
    },
  };
}

export async function readPrintOrderTerminalState(sessionId, deps = {}) {
  const store = deps.store;
  if (!store) return { ok: false, unavailable: true, error: "print_order_terminal_store_unavailable" };
  try {
    const key = printOrderTerminalObjectKey(sessionId);
    const row = await store.get(key);
    if (!row) return { ok: true, state: null, etag: null };
    let parsed;
    try {
      parsed = JSON.parse(row.body);
    } catch {
      return { ok: false, unavailable: true, error: "print_order_terminal_corrupt" };
    }
    if (!isPrintOrderTerminalState(parsed)) {
      return { ok: false, unavailable: true, error: "print_order_terminal_corrupt" };
    }
    return { ok: true, state: parsed, etag: row.etag };
  } catch {
    return { ok: false, unavailable: true, error: "print_order_terminal_read_failed" };
  }
}

export async function recordPrintOrderTerminalFailure(input, deps = {}) {
  const store = deps.store;
  if (!store) return { ok: false, unavailable: true, error: "print_order_terminal_store_unavailable" };
  const key = printOrderTerminalObjectKey(input.sessionId);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
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
    } catch {
      return { ok: false, unavailable: true, error: "print_order_terminal_write_failed" };
    }
  }

  const latest = await readPrintOrderTerminalState(input.sessionId, deps);
  if (latest.ok && latest.state) {
    return { ok: false, conflict: true, state: latest.state, etag: latest.etag || `"unknown"` };
  }
  return { ok: false, unavailable: true, error: "print_order_terminal_cas_exhausted" };
}

export async function claimPrintOrderFailureAlertDelivery(input, deps = {}) {
  const store = deps.store;
  if (!store) return { ok: false, unavailable: true, error: "print_order_terminal_store_unavailable" };
  const key = printOrderTerminalObjectKey(input.sessionId);
  const claimOwner = (input.claimOwner || "").trim() || `claim_${Date.now()}`;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const current = await store.get(key);
      if (!current) {
        const created = mergePrintOrderTerminalState(null, {
          sessionId: input.sessionId,
          error: input.error,
          source: input.source,
          operatorFailureAlertClaimedAt: Date.now(),
          operatorFailureAlertClaimOwner: claimOwner,
        });
        const put = await store.put(key, JSON.stringify(created), { createOnly: true });
        if (put) return { ok: true, claimed: true, state: created, etag: put.etag };
        continue;
      }
      let existing = null;
      try {
        const parsed = JSON.parse(current.body);
        existing = isPrintOrderTerminalState(parsed) ? parsed : null;
      } catch {
        existing = null;
      }
      if (!existing) {
        const repaired = mergePrintOrderTerminalState(null, {
          sessionId: input.sessionId,
          error: input.error,
          source: input.source,
          operatorFailureAlertClaimedAt: Date.now(),
          operatorFailureAlertClaimOwner: claimOwner,
        });
        const put = await store.put(key, JSON.stringify(repaired), { etagMatches: current.etag });
        if (put) return { ok: true, claimed: true, state: repaired, etag: put.etag };
        continue;
      }
      if (existing.operatorFailureAlertedAt) {
        return { ok: true, claimed: false, state: existing, reason: "already_delivered" };
      }
      if (existing.operatorFailureAlertClaimedAt) {
        return { ok: true, claimed: false, state: existing, reason: "already_claimed" };
      }
      const claimed = mergePrintOrderTerminalState(existing, {
        sessionId: input.sessionId,
        error: input.error,
        source: input.source,
        operatorFailureAlertClaimedAt: Date.now(),
        operatorFailureAlertClaimOwner: claimOwner,
      });
      const put = await store.put(key, JSON.stringify(claimed), { etagMatches: current.etag });
      if (put) return { ok: true, claimed: true, state: claimed, etag: put.etag };
    } catch {
      return { ok: false, unavailable: true, error: "print_order_terminal_claim_failed" };
    }
  }

  const latest = await readPrintOrderTerminalState(input.sessionId, deps);
  if (latest.ok && latest.state) {
    if (latest.state.operatorFailureAlertedAt) {
      return { ok: true, claimed: false, state: latest.state, reason: "already_delivered" };
    }
    if (latest.state.operatorFailureAlertClaimedAt) {
      return { ok: true, claimed: false, state: latest.state, reason: "already_claimed" };
    }
  }
  return { ok: false, unavailable: true, error: "print_order_terminal_claim_exhausted" };
}

export async function ensurePrintOrderTerminalFromKvFailure(record, deps = {}) {
  return recordPrintOrderTerminalFailure(
    {
      sessionId: record.sessionId,
      error: record.error || "print_order_failed",
      source: deps.source ?? "retry",
      operatorFailureAlertedAt: record.operatorFailureAlertedAt,
      operatorFailureAlertProvider: record.operatorFailureAlertProvider,
      operatorFailureAlertError: record.operatorFailureAlertError,
    },
    { store: deps.store },
  );
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

export function newPrintOrderFailureAlertClaimOwner() {
  return `claim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
