import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isLocalKvFallbackAllowed } from "@/lib/kv";
import type { PrintOrderRecord } from "@/lib/printOrders";
import {
  applyHealthyTransition,
  applyOperatorAuthorizedRecoveryTransition,
  applyOperatorResolvedTransition,
  applyPendingFilesTransition,
  applyTerminalFailureTransition,
  beginFailureAlertClaimTransition,
  bootstrapCoordinatorFromKvMirror,
  buildPrintOrderCoordinatorObjectName,
  completeFailureAlertDeliveredTransition,
  completeFailureAlertRetryableErrorTransition,
  completeFailureAlertTerminalTransition,
  createUninitializedCoordinatorState,
  newPrintOrderFailureAlertClaimOwner,
  overlayCoordinatorOntoPrintOrderRecord,
  parseCoordinatorStateOrCorrupt,
  shouldBlockHealthyKvMirrorWrite,
  type BeginFailureAlertClaimResult,
  type PrintOrderCoordinatorFailureSource,
  type PrintOrderCoordinatorReadResult,
  type PrintOrderCoordinatorState,
} from "@/lib/printOrderCoordinatorState";

export const PRINT_ORDER_COORDINATOR_BINDING = "PRINT_ORDER_COORDINATOR";

export type PrintOrderCoordinatorStore = {
  get(sessionId: string, nowMs?: number): Promise<PrintOrderCoordinatorReadResult>;
  bootstrapFromKv(
    sessionId: string,
    kv: Partial<PrintOrderRecord> & { status?: PrintOrderRecord["status"] },
    nowMs?: number,
  ): Promise<PrintOrderCoordinatorReadResult>;
  recordTerminalFailure(input: {
    sessionId: string;
    error: string;
    source: PrintOrderCoordinatorFailureSource;
    printfulOrderId?: string | number | null;
    nowMs?: number;
  }): Promise<PrintOrderCoordinatorReadResult>;
  recordPendingFiles(input: {
    sessionId: string;
    printfulOrderId?: string | number | null;
    nowMs?: number;
  }): Promise<PrintOrderCoordinatorReadResult & { reason?: string }>;
  recordHealthy(input: {
    sessionId: string;
    printfulOrderId?: string | number | null;
    nowMs?: number;
  }): Promise<PrintOrderCoordinatorReadResult & { reason?: string }>;
  operatorResolve(input: {
    sessionId: string;
    printfulOrderId?: string | number | null;
    note?: string;
    nowMs?: number;
  }): Promise<PrintOrderCoordinatorReadResult>;
  /** Explicit admin-authorized recovery after successful operator retry create. */
  operatorAuthorizedRecovery(input: {
    sessionId: string;
    printfulOrderId?: string | number | null;
    note?: string;
    nowMs?: number;
  }): Promise<PrintOrderCoordinatorReadResult>;
  beginFailureAlertClaim(input: {
    sessionId: string;
    claimOwner: string;
    nowMs?: number;
  }): Promise<BeginFailureAlertClaimResult>;
  completeFailureAlertDelivered(input: {
    sessionId: string;
    provider: string;
    claimOwner?: string;
    nowMs?: number;
  }): Promise<PrintOrderCoordinatorReadResult>;
  completeFailureAlertRetryableError(input: {
    sessionId: string;
    provider?: string;
    error?: string;
    claimOwner?: string;
    nowMs?: number;
  }): Promise<PrintOrderCoordinatorReadResult>;
  completeFailureAlertTerminal(input: {
    sessionId: string;
    provider?: string;
    error?: string;
    claimOwner?: string;
    nowMs?: number;
  }): Promise<PrintOrderCoordinatorReadResult>;
};

type MemoryBag = Map<string, PrintOrderCoordinatorState>;

const globalMemory: MemoryBag =
  (globalThis as typeof globalThis & { __starmapPrintOrderCoordinator?: MemoryBag })
    .__starmapPrintOrderCoordinator ?? new Map();

if (
  !(globalThis as typeof globalThis & { __starmapPrintOrderCoordinator?: MemoryBag })
    .__starmapPrintOrderCoordinator
) {
  (
    globalThis as typeof globalThis & {
      __starmapPrintOrderCoordinator?: MemoryBag;
    }
  ).__starmapPrintOrderCoordinator = globalMemory;
}

function memoryKey(sessionId: string) {
  return buildPrintOrderCoordinatorObjectName(sessionId);
}

/** Deterministic in-process store for unit tests and local fallback. */
export function createMemoryPrintOrderCoordinatorStore(
  map: MemoryBag = new Map(),
): PrintOrderCoordinatorStore {
  const load = (sessionId: string, nowMs: number) => {
    const key = memoryKey(sessionId);
    let state = map.get(key);
    if (!state) {
      state = createUninitializedCoordinatorState(sessionId, nowMs);
      map.set(key, state);
    }
    return state;
  };

  return {
    async get(sessionId, nowMs = Date.now()) {
      const key = memoryKey(sessionId);
      const state = map.get(key) ?? createUninitializedCoordinatorState(sessionId, nowMs);
      return { ok: true, state };
    },
    async bootstrapFromKv(sessionId, kv, nowMs = Date.now()) {
      const key = memoryKey(sessionId);
      let state = map.get(key);
      if (!state || state.authorityStatus === "uninitialized") {
        state = bootstrapCoordinatorFromKvMirror({
          sessionId,
          kvStatus: kv.status,
          kvError: kv.error,
          printfulOrderId: kv.printfulOrderId,
          operatorFailureAlertedAt: kv.operatorFailureAlertedAt,
          operatorFailureAlertProvider: kv.operatorFailureAlertProvider,
          operatorFailureAlertError: kv.operatorFailureAlertError,
          printfulFileReviewPendingAt: kv.printfulFileReviewPendingAt,
          operatorResolvedAt: kv.operatorResolvedAt,
          nowMs,
        });
        map.set(key, state);
      }
      return { ok: true, state };
    },
    async recordTerminalFailure(input) {
      const nowMs = input.nowMs ?? Date.now();
      let state = load(input.sessionId, nowMs);
      state = applyTerminalFailureTransition(state, {
        error: input.error,
        source: input.source,
        printfulOrderId: input.printfulOrderId,
        nowMs,
      });
      map.set(memoryKey(input.sessionId), state);
      return { ok: true, state };
    },
    async recordPendingFiles(input) {
      const nowMs = input.nowMs ?? Date.now();
      const state = load(input.sessionId, nowMs);
      const result = applyPendingFilesTransition(state, {
        printfulOrderId: input.printfulOrderId,
        nowMs,
      });
      map.set(memoryKey(input.sessionId), result.state);
      if (!result.ok) {
        return { ok: true, state: result.state, reason: result.reason };
      }
      return { ok: true, state: result.state };
    },
    async recordHealthy(input) {
      const nowMs = input.nowMs ?? Date.now();
      const state = load(input.sessionId, nowMs);
      const result = applyHealthyTransition(state, {
        printfulOrderId: input.printfulOrderId,
        nowMs,
      });
      map.set(memoryKey(input.sessionId), result.state);
      if (!result.ok) {
        return { ok: true, state: result.state, reason: result.reason };
      }
      return { ok: true, state: result.state };
    },
    async operatorResolve(input) {
      const nowMs = input.nowMs ?? Date.now();
      let state = load(input.sessionId, nowMs);
      state = applyOperatorResolvedTransition(state, {
        printfulOrderId: input.printfulOrderId,
        note: input.note,
        nowMs,
      });
      map.set(memoryKey(input.sessionId), state);
      return { ok: true, state };
    },
    async operatorAuthorizedRecovery(input) {
      const nowMs = input.nowMs ?? Date.now();
      let state = load(input.sessionId, nowMs);
      state = applyOperatorAuthorizedRecoveryTransition(state, {
        printfulOrderId: input.printfulOrderId,
        note: input.note,
        nowMs,
      });
      map.set(memoryKey(input.sessionId), state);
      return { ok: true, state };
    },
    async beginFailureAlertClaim(input) {
      const nowMs = input.nowMs ?? Date.now();
      const state = load(input.sessionId, nowMs);
      const result = beginFailureAlertClaimTransition(state, {
        claimOwner: input.claimOwner,
        nowMs,
      });
      if (result.ok) {
        map.set(memoryKey(input.sessionId), result.state);
      }
      return result;
    },
    async completeFailureAlertDelivered(input) {
      const nowMs = input.nowMs ?? Date.now();
      let state = load(input.sessionId, nowMs);
      state = completeFailureAlertDeliveredTransition(state, {
        provider: input.provider,
        claimOwner: input.claimOwner,
        nowMs,
      });
      map.set(memoryKey(input.sessionId), state);
      return { ok: true, state };
    },
    async completeFailureAlertRetryableError(input) {
      const nowMs = input.nowMs ?? Date.now();
      let state = load(input.sessionId, nowMs);
      state = completeFailureAlertRetryableErrorTransition(state, {
        provider: input.provider,
        error: input.error,
        claimOwner: input.claimOwner,
        nowMs,
      });
      map.set(memoryKey(input.sessionId), state);
      return { ok: true, state };
    },
    async completeFailureAlertTerminal(input) {
      const nowMs = input.nowMs ?? Date.now();
      let state = load(input.sessionId, nowMs);
      state = completeFailureAlertTerminalTransition(state, {
        provider: input.provider,
        error: input.error,
        claimOwner: input.claimOwner,
        nowMs,
      });
      map.set(memoryKey(input.sessionId), state);
      return { ok: true, state };
    },
  };
}

/** Shared process memory store (tests / local without DO binding). */
export const memoryPrintOrderCoordinatorStore = createMemoryPrintOrderCoordinatorStore(globalMemory);

export function resetMemoryPrintOrderCoordinatorStoreForTests() {
  globalMemory.clear();
}

type DurableObjectNamespaceLike = {
  idFromName(name: string): { toString(): string };
  get(id: { toString(): string }): { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
};

async function getCoordinatorNamespace(): Promise<DurableObjectNamespaceLike | null> {
  const timeoutMs = 120;
  try {
    const cloudflareContext = await Promise.race([
      getCloudflareContext({ async: true }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!cloudflareContext) return null;
    const bindings = cloudflareContext.env as unknown as Record<string, unknown>;
    const ns = bindings?.[PRINT_ORDER_COORDINATOR_BINDING];
    if (!ns || typeof ns !== "object") return null;
    const candidate = ns as DurableObjectNamespaceLike;
    if (typeof candidate.idFromName !== "function" || typeof candidate.get !== "function") return null;
    return candidate;
  } catch {
    return null;
  }
}

async function callDurableCoordinator(
  ns: DurableObjectNamespaceLike,
  sessionId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const name = buildPrintOrderCoordinatorObjectName(sessionId);
  const id = ns.idFromName(name);
  const stub = ns.get(id);
  const response = await stub.fetch("https://print-order-coordinator/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, sessionId }),
  });
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!json || typeof json !== "object") {
    return { ok: false, unavailable: true, error: `coordinator_http_${response.status}` };
  }
  if (!response.ok && json.unavailable) {
    return json;
  }
  return json;
}

function asReadResult(json: Record<string, unknown>, sessionId?: string): PrintOrderCoordinatorReadResult {
  if (json.ok === true && json.state && typeof json.state === "object") {
    const parsed = parseCoordinatorStateOrCorrupt(json.state, sessionId);
    if (!parsed.ok) {
      return { ok: false, unavailable: true, error: parsed.error };
    }
    return { ok: true, state: parsed.state };
  }
  return {
    ok: false,
    unavailable: true,
    error: typeof json.error === "string" ? json.error : "print_order_coordinator_unavailable",
  };
}

function createDurablePrintOrderCoordinatorStore(ns: DurableObjectNamespaceLike): PrintOrderCoordinatorStore {
  return {
    async get(sessionId, nowMs) {
      return asReadResult(await callDurableCoordinator(ns, sessionId, { action: "get", nowMs }), sessionId);
    },
    async bootstrapFromKv(sessionId, kv, nowMs) {
      return asReadResult(
        await callDurableCoordinator(ns, sessionId, {
          action: "bootstrap_from_kv",
          nowMs,
          kvStatus: kv.status,
          kvError: kv.error,
          printfulOrderId: kv.printfulOrderId,
          operatorFailureAlertedAt: kv.operatorFailureAlertedAt,
          operatorFailureAlertProvider: kv.operatorFailureAlertProvider,
          operatorFailureAlertError: kv.operatorFailureAlertError,
          printfulFileReviewPendingAt: kv.printfulFileReviewPendingAt,
          operatorResolvedAt: kv.operatorResolvedAt,
        }),
        sessionId,
      );
    },
    async recordTerminalFailure(input) {
      return asReadResult(
        await callDurableCoordinator(ns, input.sessionId, {
          action: "record_terminal_failure",
          error: input.error,
          source: input.source,
          printfulOrderId: input.printfulOrderId,
          nowMs: input.nowMs,
        }),
        input.sessionId,
      );
    },
    async recordPendingFiles(input) {
      const json = await callDurableCoordinator(ns, input.sessionId, {
        action: "record_pending_files",
        printfulOrderId: input.printfulOrderId,
        nowMs: input.nowMs,
      });
      const read = asReadResult(json, input.sessionId);
      return { ...read, reason: typeof json.reason === "string" ? json.reason : undefined };
    },
    async recordHealthy(input) {
      const json = await callDurableCoordinator(ns, input.sessionId, {
        action: "record_healthy",
        printfulOrderId: input.printfulOrderId,
        nowMs: input.nowMs,
      });
      if (json.state && typeof json.state === "object") {
        const parsed = parseCoordinatorStateOrCorrupt(json.state, input.sessionId);
        if (!parsed.ok) {
          return { ok: false, unavailable: true, error: parsed.error, reason: parsed.error };
        }
        return {
          ok: true,
          state: parsed.state,
          reason: typeof json.reason === "string" ? json.reason : undefined,
        };
      }
      return { ...asReadResult(json, input.sessionId), reason: typeof json.reason === "string" ? json.reason : undefined };
    },
    async operatorResolve(input) {
      return asReadResult(
        await callDurableCoordinator(ns, input.sessionId, {
          action: "operator_resolve",
          printfulOrderId: input.printfulOrderId,
          note: input.note,
          nowMs: input.nowMs,
        }),
        input.sessionId,
      );
    },
    async operatorAuthorizedRecovery(input) {
      return asReadResult(
        await callDurableCoordinator(ns, input.sessionId, {
          action: "operator_authorized_recovery",
          printfulOrderId: input.printfulOrderId,
          note: input.note,
          nowMs: input.nowMs,
        }),
        input.sessionId,
      );
    },
    async beginFailureAlertClaim(input) {
      const json = await callDurableCoordinator(ns, input.sessionId, {
        action: "begin_failure_alert_claim",
        claimOwner: input.claimOwner,
        nowMs: input.nowMs,
      });
      if (json.unavailable) {
        return {
          ok: false,
          unavailable: true,
          error: typeof json.error === "string" ? json.error : "print_order_coordinator_unavailable",
        };
      }
      if (json.state && typeof json.state === "object") {
        const parsed = parseCoordinatorStateOrCorrupt(json.state, input.sessionId);
        if (!parsed.ok) {
          return { ok: false, unavailable: true, error: parsed.error };
        }
        return { ...json, state: parsed.state } as BeginFailureAlertClaimResult;
      }
      return json as BeginFailureAlertClaimResult;
    },
    async completeFailureAlertDelivered(input) {
      return asReadResult(
        await callDurableCoordinator(ns, input.sessionId, {
          action: "complete_failure_alert_delivered",
          provider: input.provider,
          claimOwner: input.claimOwner,
          nowMs: input.nowMs,
        }),
        input.sessionId,
      );
    },
    async completeFailureAlertRetryableError(input) {
      return asReadResult(
        await callDurableCoordinator(ns, input.sessionId, {
          action: "complete_failure_alert_retryable_error",
          provider: input.provider,
          error: input.error,
          claimOwner: input.claimOwner,
          nowMs: input.nowMs,
        }),
        input.sessionId,
      );
    },
    async completeFailureAlertTerminal(input) {
      return asReadResult(
        await callDurableCoordinator(ns, input.sessionId, {
          action: "complete_failure_alert_terminal",
          provider: input.provider,
          error: input.error,
          claimOwner: input.claimOwner,
          nowMs: input.nowMs,
        }),
        input.sessionId,
      );
    },
  };
}

export type UnavailablePrintOrderCoordinatorStore = PrintOrderCoordinatorStore & {
  readonly unavailable: true;
};

/** Fail-closed store when DO binding is required but missing. */
export function createUnavailablePrintOrderCoordinatorStore(
  error = "print_order_coordinator_unavailable",
): UnavailablePrintOrderCoordinatorStore {
  const fail = async (): Promise<PrintOrderCoordinatorReadResult> => ({
    ok: false,
    unavailable: true,
    error,
  });
  return {
    unavailable: true,
    get: fail,
    bootstrapFromKv: fail,
    recordTerminalFailure: fail,
    recordPendingFiles: fail,
    recordHealthy: fail,
    operatorResolve: fail,
    operatorAuthorizedRecovery: fail,
    async beginFailureAlertClaim() {
      return { ok: false, unavailable: true, error };
    },
    completeFailureAlertDelivered: fail,
    completeFailureAlertRetryableError: fail,
    completeFailureAlertTerminal: fail,
  };
}

let injectedStore: PrintOrderCoordinatorStore | null = null;

/** Test seam: inject a coordinator store (memory / fake). */
export function setPrintOrderCoordinatorStoreForTests(store: PrintOrderCoordinatorStore | null) {
  injectedStore = store;
}

export async function getPrintOrderCoordinatorStore(): Promise<PrintOrderCoordinatorStore> {
  if (injectedStore) return injectedStore;
  const ns = await getCoordinatorNamespace();
  if (ns) return createDurablePrintOrderCoordinatorStore(ns);
  if (isLocalKvFallbackAllowed()) return memoryPrintOrderCoordinatorStore;
  return createUnavailablePrintOrderCoordinatorStore();
}

export async function readPrintOrderCoordinatorState(
  sessionId: string,
  store?: PrintOrderCoordinatorStore,
): Promise<PrintOrderCoordinatorReadResult> {
  const coordinator = store ?? (await getPrintOrderCoordinatorStore());
  return coordinator.get(sessionId);
}

export async function ensurePrintOrderCoordinatorBootstrapped(
  sessionId: string,
  kvRecord: PrintOrderRecord | null | undefined,
  store?: PrintOrderCoordinatorStore,
): Promise<PrintOrderCoordinatorReadResult> {
  const coordinator = store ?? (await getPrintOrderCoordinatorStore());
  if (!kvRecord) return coordinator.get(sessionId);
  return coordinator.bootstrapFromKv(sessionId, kvRecord);
}

/**
 * Merge KV mirror with authoritative coordinator state.
 * Fail-closed when coordinator is unavailable and `requireReadable` is true.
 */
export async function getEffectivePrintOrderRecord(
  sessionId: string,
  kvRecord: PrintOrderRecord,
  opts?: { store?: PrintOrderCoordinatorStore; requireReadable?: boolean },
): Promise<
  | { ok: true; order: PrintOrderRecord; state: PrintOrderCoordinatorState | null }
  | { ok: false; error: string; order: PrintOrderRecord }
> {
  const store = opts?.store ?? (await getPrintOrderCoordinatorStore());
  const bootstrapped = await ensurePrintOrderCoordinatorBootstrapped(sessionId, kvRecord, store);
  if (!bootstrapped.ok) {
    if (opts?.requireReadable !== false) {
      return {
        ok: false,
        error: bootstrapped.error,
        order: {
          ...kvRecord,
          // Fail closed: do not present a clean healthy/sent mirror while authority is unresolved.
          status: kvRecord.status === "failed" ? "failed" : kvRecord.status,
          operatorAlertedAt: undefined,
          operatorAlertProvider: undefined,
          operatorAlertError: undefined,
          printfulFileReviewPendingAt: kvRecord.printfulFileReviewPendingAt ?? Date.now(),
          error: kvRecord.error || bootstrapped.error,
        },
      };
    }
    return { ok: true, order: kvRecord, state: null };
  }
  return {
    ok: true,
    order: overlayCoordinatorOntoPrintOrderRecord(kvRecord, bootstrapped.state),
    state: bootstrapped.state,
  };
}

/**
 * Persist a KV mirror write that must not erase terminal DO failure.
 * Healthy / sent presentations require a readable coordinator that is not failed.
 */
export async function persistPrintOrderKvMirror(
  sessionId: string,
  candidate: PrintOrderRecord,
  deps: {
    kvSet: (key: string, value: PrintOrderRecord) => Promise<void>;
    printOrderKey: (sessionId: string) => string;
    store?: PrintOrderCoordinatorStore;
    requireCoordinatorReadable?: boolean;
  },
): Promise<{ ok: true; order: PrintOrderRecord } | { ok: false; order: PrintOrderRecord; error: string }> {
  const store = deps.store ?? (await getPrintOrderCoordinatorStore());
  const bootstrapped = await ensurePrintOrderCoordinatorBootstrapped(sessionId, candidate, store);
  const looksHealthyPresentation =
    candidate.status === "sent" &&
    !candidate.error?.startsWith("printful_files_failed:") &&
    !(typeof candidate.printfulFileReviewPendingAt === "number" && candidate.printfulFileReviewPendingAt > 0);

  if (looksHealthyPresentation || candidate.status !== "failed") {
    const gate = shouldBlockHealthyKvMirrorWrite({
      coordinator: bootstrapped,
      requireCoordinatorReadable: deps.requireCoordinatorReadable !== false,
    });
    if (!gate.allow) {
      const blocked = gate.state
        ? overlayCoordinatorOntoPrintOrderRecord(candidate, gate.state)
        : {
            ...candidate,
            status: "sent" as const,
            operatorAlertedAt: undefined,
            operatorAlertProvider: undefined,
            operatorAlertError: undefined,
            printfulFileReviewPendingAt: candidate.printfulFileReviewPendingAt ?? Date.now(),
            error: candidate.error || gate.error,
          };
      await deps.kvSet(deps.printOrderKey(sessionId), blocked);
      return { ok: false, order: blocked, error: gate.error || "print_order_coordinator_blocked_healthy" };
    }
  }

  const order = bootstrapped.ok
    ? overlayCoordinatorOntoPrintOrderRecord(candidate, bootstrapped.state)
    : candidate;
  await deps.kvSet(deps.printOrderKey(sessionId), order);
  return { ok: true, order };
}

/**
 * Record terminal failure in the coordinator, then attempt recoverable failure-alert delivery.
 * Provider I/O stays outside coordinator transactions.
 */
export async function recordTerminalFailureAndDeliverAlert(input: {
  record: PrintOrderRecord;
  error: string;
  source: PrintOrderCoordinatorFailureSource;
  sendFailureAlert: (
    order: PrintOrderRecord,
    opts: { idempotencyKey: string },
  ) => Promise<{
    delivered: boolean;
    provider: string;
    error?: string;
    retryability?: string;
    errorCode?: string;
    idempotencyKey?: string;
  }>;
  store?: PrintOrderCoordinatorStore;
  claimOwner?: string;
  nowMs?: number;
}): Promise<PrintOrderRecord> {
  const store = input.store ?? (await getPrintOrderCoordinatorStore());
  const nowMs = input.nowMs ?? Date.now();
  const recorded = await store.recordTerminalFailure({
    sessionId: input.record.sessionId,
    error: input.error,
    source: input.source,
    printfulOrderId: input.record.printfulOrderId,
    nowMs,
  });

  let base: PrintOrderRecord = {
    ...input.record,
    status: "failed",
    error: input.error,
  };
  if (recorded.ok) {
    base = overlayCoordinatorOntoPrintOrderRecord(base, recorded.state);
  } else {
    return {
      ...base,
      operatorFailureAlertError: recorded.error,
    };
  }

  if (base.operatorFailureAlertedAt || recorded.state.failureAlert.phase === "delivered") {
    return overlayCoordinatorOntoPrintOrderRecord(base, recorded.state);
  }

  const claimOwner = input.claimOwner ?? newPrintOrderFailureAlertClaimOwner();
  const claim = await store.beginFailureAlertClaim({
    sessionId: input.record.sessionId,
    claimOwner,
    nowMs,
  });

  if (!claim.ok) {
    return {
      ...base,
      operatorFailureAlertError: claim.error,
    };
  }

  if (!claim.claimed) {
    const withState = overlayCoordinatorOntoPrintOrderRecord(base, claim.state);
    if (claim.reason === "already_delivered") {
      return {
        ...withState,
        operatorFailureAlertedAt: claim.state.failureAlert.deliveredAt ?? Date.now(),
        operatorFailureAlertProvider: claim.state.failureAlert.provider,
        operatorFailureAlertError: undefined,
      };
    }
    if (claim.reason === "safe_window_elapsed" || claim.reason === "operator_action_required") {
      return {
        ...withState,
        operatorFailureAlertError:
          claim.state.failureAlert.error || "idempotency_safe_window_elapsed",
        operatorFailureAlertProvider: "none",
      };
    }
    return withState;
  }

  // Provider I/O outside the claim transaction.
  const alertResult = await input.sendFailureAlert(
    { ...base, error: input.error },
    { idempotencyKey: claim.idempotencyKey },
  );

  if (alertResult.delivered) {
    const completed = await store.completeFailureAlertDelivered({
      sessionId: input.record.sessionId,
      provider: alertResult.provider,
      claimOwner,
      nowMs: Date.now(),
    });
    const next: PrintOrderRecord = {
      ...base,
      operatorFailureAlertedAt: Date.now(),
      operatorFailureAlertProvider: alertResult.provider,
      operatorFailureAlertError: undefined,
    };
    return completed.ok ? overlayCoordinatorOntoPrintOrderRecord(next, completed.state) : next;
  }

  const retryability = alertResult.retryability;
  const isTerminalAlert =
    retryability === "terminal" ||
    retryability === "not_configured" ||
    alertResult.errorCode === "invalid_idempotent_request" ||
    alertResult.errorCode === "print_failure_alert_resend_required" ||
    alertResult.errorCode === "print_alert_not_configured";

  if (isTerminalAlert) {
    const terminal = await store.completeFailureAlertTerminal({
      sessionId: input.record.sessionId,
      provider: alertResult.provider,
      error: alertResult.errorCode || alertResult.error || "print_failure_alert_terminal",
      claimOwner,
      nowMs: Date.now(),
    });
    const next: PrintOrderRecord = {
      ...base,
      operatorFailureAlertProvider: alertResult.provider,
      operatorFailureAlertError: alertResult.errorCode || alertResult.error,
    };
    return terminal.ok ? overlayCoordinatorOntoPrintOrderRecord(next, terminal.state) : next;
  }

  const retryable = await store.completeFailureAlertRetryableError({
    sessionId: input.record.sessionId,
    provider: alertResult.provider,
    error: alertResult.errorCode || alertResult.error || "print_failure_alert_retryable",
    claimOwner,
    nowMs: Date.now(),
  });
  const next: PrintOrderRecord = {
    ...base,
    operatorFailureAlertProvider: alertResult.provider,
    operatorFailureAlertError: alertResult.errorCode || alertResult.error,
  };
  return retryable.ok ? overlayCoordinatorOntoPrintOrderRecord(next, retryable.state) : next;
}

export { newPrintOrderFailureAlertClaimOwner, overlayCoordinatorOntoPrintOrderRecord };
