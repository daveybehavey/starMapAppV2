import { getCloudflareContext } from "@opennextjs/cloudflare";
import fs from "node:fs/promises";
import path from "node:path";
import type { PrintOrderRecord } from "@/lib/printOrders";
import { printOrderKey } from "@/lib/printOrders";
import { isLocalKvFallbackAllowed, kv } from "@/lib/kv";

/** Dedicated R2 binding — must not reuse NEXT_INC_CACHE_R2_BUCKET. */
export const PRINT_ORDER_STATE_R2_BINDING = "PRINT_ORDER_STATE_R2";

export const PRINT_ORDER_TERMINAL_STATE_VERSION = 1 as const;

export type PrintOrderTerminalFailureSource =
  | "printful_webhook"
  | "post_submit_files"
  | "retry"
  | "other";

/**
 * Authoritative monotonic terminal failure record.
 * Keyed by checkout session id only — no customer PII in key or body.
 */
export type PrintOrderTerminalState = {
  version: typeof PRINT_ORDER_TERMINAL_STATE_VERSION;
  sessionId: string;
  status: "failed";
  error: string;
  source: PrintOrderTerminalFailureSource;
  recordedAt: number;
  operatorFailureAlertedAt?: number;
  operatorFailureAlertProvider?: string;
  operatorFailureAlertError?: string;
};

export type PrintOrderTerminalReadResult =
  | { ok: true; state: PrintOrderTerminalState | null; etag: string | null }
  | { ok: false; unavailable: true; error: string };

export type PrintOrderTerminalWriteResult =
  | { ok: true; state: PrintOrderTerminalState; etag: string; created: boolean }
  | { ok: false; unavailable: true; error: string }
  | { ok: false; conflict: true; state: PrintOrderTerminalState; etag: string };

type R2LikeObject = {
  body?: ReadableStream | null;
  text?: () => Promise<string>;
  etag?: string;
  httpEtag?: string;
};

type R2LikeBucket = {
  get(key: string): Promise<R2LikeObject | null>;
  put(
    key: string,
    value: string,
    options?: { onlyIf?: Headers | { etagMatches?: string; etagDoesNotMatch?: string } },
  ): Promise<{ etag?: string; httpEtag?: string } | null>;
};

export type PrintOrderTerminalStore = {
  get(key: string): Promise<{ body: string; etag: string } | null>;
  /** Conditional put. Returns null when precondition fails. */
  put(key: string, body: string, onlyIf?: { etagMatches?: string; createOnly?: boolean }): Promise<{ etag: string } | null>;
};

const memoryStore: Map<string, { body: string; etag: string; generation: number }> =
  (globalThis as typeof globalThis & { __starmapPrintOrderTerminal?: Map<string, { body: string; etag: string; generation: number }> })
    .__starmapPrintOrderTerminal ?? new Map();

if (
  !(globalThis as typeof globalThis & { __starmapPrintOrderTerminal?: Map<string, { body: string; etag: string; generation: number }> })
    .__starmapPrintOrderTerminal
) {
  (
    globalThis as typeof globalThis & {
      __starmapPrintOrderTerminal?: Map<string, { body: string; etag: string; generation: number }>;
    }
  ).__starmapPrintOrderTerminal = memoryStore;
}

const fallbackDir =
  process.env.STARMAP_PRINT_ORDER_TERMINAL_DIR?.trim() ||
  path.join(process.cwd(), ".tmp", "print-order-terminal");

function fallbackFilePath(key: string) {
  const encoded = Buffer.from(key, "utf8").toString("base64url");
  return path.join(fallbackDir, `${encoded}.json`);
}

export function printOrderTerminalObjectKey(sessionId: string): string {
  return `print-order-terminal/${sessionId.trim()}`;
}

export function isPrintOrderTerminalState(value: unknown): value is PrintOrderTerminalState {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    row.version === PRINT_ORDER_TERMINAL_STATE_VERSION &&
    typeof row.sessionId === "string" &&
    row.status === "failed" &&
    typeof row.error === "string" &&
    typeof row.source === "string" &&
    typeof row.recordedAt === "number"
  );
}

/** Monotonic merge: terminal failure never clears; alert markers never regress. */
export function mergePrintOrderTerminalState(
  existing: PrintOrderTerminalState | null,
  input: {
    sessionId: string;
    error: string;
    source: PrintOrderTerminalFailureSource;
    operatorFailureAlertedAt?: number;
    operatorFailureAlertProvider?: string;
    operatorFailureAlertError?: string;
    recordedAt?: number;
  },
): PrintOrderTerminalState {
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

export function overlayPrintOrderTerminalState(
  order: PrintOrderRecord | null | undefined,
  terminal: PrintOrderTerminalState | null | undefined,
): PrintOrderRecord | null {
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

function nextMemoryEtag(generation: number): string {
  return `"term-${generation}"`;
}

export function createMemoryPrintOrderTerminalStore(
  seed?: Map<string, { body: string; etag: string; generation: number }>,
): PrintOrderTerminalStore {
  const store = seed ?? new Map<string, { body: string; etag: string; generation: number }>();
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
      const etag = nextMemoryEtag(generation);
      store.set(key, { body, etag, generation });
      return { etag };
    },
  };
}

async function getPrintOrderStateR2Bucket(): Promise<R2LikeBucket | null> {
  const timeoutMs = 120;
  try {
    const ctx = await Promise.race([
      getCloudflareContext({ async: true }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    const env = (ctx as { env?: unknown } | null)?.env as Record<string, unknown> | undefined;
    const bucket = env?.[PRINT_ORDER_STATE_R2_BINDING] as R2LikeBucket | undefined;
    return bucket ?? null;
  } catch {
    return null;
  }
}

function createR2PrintOrderTerminalStore(bucket: R2LikeBucket): PrintOrderTerminalStore {
  return {
    async get(key) {
      const object = await bucket.get(key);
      if (!object) return null;
      const body =
        typeof object.text === "function"
          ? await object.text()
          : typeof object.body === "string"
            ? object.body
            : "";
      const etag = object.httpEtag || object.etag || `"missing"`;
      return { body, etag };
    },
    async put(key, body, onlyIf) {
      let conditional: Headers | { etagMatches?: string; etagDoesNotMatch?: string } | undefined;
      if (onlyIf?.createOnly) {
        conditional = new Headers({ "if-none-match": "*" });
      } else if (onlyIf?.etagMatches) {
        conditional = { etagMatches: onlyIf.etagMatches };
      }
      const result = await bucket.put(key, body, conditional ? { onlyIf: conditional } : undefined);
      if (!result) return null;
      return { etag: result.httpEtag || result.etag || `"written"` };
    },
  };
}

function createFallbackPrintOrderTerminalStore(): PrintOrderTerminalStore {
  return {
    async get(key) {
      if (memoryStore.has(key)) {
        const row = memoryStore.get(key)!;
        return { body: row.body, etag: row.etag };
      }
      try {
        const raw = await fs.readFile(fallbackFilePath(key), "utf8");
        const parsed = JSON.parse(raw) as { body: string; etag: string; generation: number };
        memoryStore.set(key, parsed);
        return { body: parsed.body, etag: parsed.etag };
      } catch {
        return null;
      }
    },
    async put(key, body, onlyIf) {
      const current = await this.get(key);
      if (onlyIf?.createOnly && current) return null;
      if (onlyIf?.etagMatches && (!current || current.etag !== onlyIf.etagMatches)) return null;
      const generation =
        (memoryStore.get(key)?.generation ??
          (current ? Number.parseInt(String(current.etag).replace(/\D/g, ""), 10) || 0 : 0)) + 1;
      const etag = nextMemoryEtag(generation);
      const row = { body, etag, generation };
      memoryStore.set(key, row);
      await fs.mkdir(fallbackDir, { recursive: true });
      await fs.writeFile(fallbackFilePath(key), JSON.stringify(row), "utf8");
      return { etag };
    },
  };
}

export type ResolvePrintOrderTerminalStoreResult =
  | { ok: true; store: PrintOrderTerminalStore; mode: "r2" | "local_fallback" }
  | { ok: false; unavailable: true; error: string };

export async function resolvePrintOrderTerminalStore(deps?: {
  store?: PrintOrderTerminalStore;
  getBucket?: () => Promise<R2LikeBucket | null>;
  allowLocalFallback?: boolean;
}): Promise<ResolvePrintOrderTerminalStoreResult> {
  if (deps?.store) return { ok: true, store: deps.store, mode: "local_fallback" };

  const bucket = deps?.getBucket ? await deps.getBucket() : await getPrintOrderStateR2Bucket();
  if (bucket) return { ok: true, store: createR2PrintOrderTerminalStore(bucket), mode: "r2" };

  const allowLocal = deps?.allowLocalFallback ?? isLocalKvFallbackAllowed();
  if (allowLocal) {
    return { ok: true, store: createFallbackPrintOrderTerminalStore(), mode: "local_fallback" };
  }

  return {
    ok: false,
    unavailable: true,
    error: "print_order_terminal_store_unavailable",
  };
}

function parseTerminalBody(body: string): PrintOrderTerminalState | null {
  try {
    const parsed = JSON.parse(body) as unknown;
    return isPrintOrderTerminalState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function readPrintOrderTerminalState(
  sessionId: string,
  deps?: { store?: PrintOrderTerminalStore; getBucket?: () => Promise<R2LikeBucket | null> },
): Promise<PrintOrderTerminalReadResult> {
  const resolved = await resolvePrintOrderTerminalStore(deps);
  if (!resolved.ok) return resolved;

  try {
    const key = printOrderTerminalObjectKey(sessionId);
    const row = await resolved.store.get(key);
    if (!row) return { ok: true, state: null, etag: null };
    const state = parseTerminalBody(row.body);
    if (!state) return { ok: true, state: null, etag: row.etag };
    return { ok: true, state, etag: row.etag };
  } catch {
    return { ok: false, unavailable: true, error: "print_order_terminal_read_failed" };
  }
}

const MAX_CAS_ATTEMPTS = 5;

/**
 * Record or strengthen terminal failure. Conditional create/update; never clears alert markers.
 * Provider I/O must stay outside this function.
 */
export async function recordPrintOrderTerminalFailure(
  input: {
    sessionId: string;
    error: string;
    source: PrintOrderTerminalFailureSource;
    operatorFailureAlertedAt?: number;
    operatorFailureAlertProvider?: string;
    operatorFailureAlertError?: string;
  },
  deps?: { store?: PrintOrderTerminalStore; getBucket?: () => Promise<R2LikeBucket | null> },
): Promise<PrintOrderTerminalWriteResult> {
  const resolved = await resolvePrintOrderTerminalStore(deps);
  if (!resolved.ok) return resolved;

  const key = printOrderTerminalObjectKey(input.sessionId);
  const store = resolved.store;

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    try {
      const current = await store.get(key);
      if (!current) {
        const created = mergePrintOrderTerminalState(null, input);
        const put = await store.put(key, JSON.stringify(created), { createOnly: true });
        if (put) return { ok: true, state: created, etag: put.etag, created: true };
        continue;
      }

      const existing = parseTerminalBody(current.body);
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

/**
 * Effective order view: R2 terminal overlays KV. Fail-closed when store is required but unavailable.
 */
export async function getEffectivePrintOrderRecord(
  sessionId: string,
  kvRecord: PrintOrderRecord | null,
  deps?: {
    store?: PrintOrderTerminalStore;
    requireTerminalReadable?: boolean;
  },
): Promise<
  | { ok: true; order: PrintOrderRecord | null; terminal: PrintOrderTerminalState | null }
  | { ok: false; unavailable: true; error: string }
> {
  const terminalRead = await readPrintOrderTerminalState(sessionId, deps);
  if (!terminalRead.ok) {
    if (deps?.requireTerminalReadable) return terminalRead;
    // Best-effort overlay skip when not required (legacy reads), but dangerous gates must require.
    return { ok: true, order: kvRecord, terminal: null };
  }
  return {
    ok: true,
    order: overlayPrintOrderTerminalState(kvRecord, terminalRead.state),
    terminal: terminalRead.state,
  };
}

/**
 * Persist a KV mirror after checking authoritative terminal state.
 * A later stale non-terminal KV write cannot make effective state healthy because reads overlay R2.
 */
export async function persistPrintOrderKvMirror(
  sessionId: string,
  candidate: PrintOrderRecord,
  deps?: {
    store?: PrintOrderTerminalStore;
    kvSet?: (key: string, value: PrintOrderRecord) => Promise<unknown>;
    printOrderKeyFn?: (sessionId: string) => string;
    requireTerminalReadable?: boolean;
  },
): Promise<
  | { ok: true; order: PrintOrderRecord; terminal: PrintOrderTerminalState | null; wroteKv: boolean }
  | { ok: false; unavailable: true; error: string }
> {
  const keyFn = deps?.printOrderKeyFn ?? printOrderKey;
  const setFn = deps?.kvSet ?? ((key: string, value: PrintOrderRecord) => kv.set(key, value));

  const effective = await getEffectivePrintOrderRecord(sessionId, candidate, {
    store: deps?.store,
    requireTerminalReadable: deps?.requireTerminalReadable,
  });
  if (!effective.ok) return effective;

  const toWrite = effective.order ?? candidate;
  await setFn(keyFn(sessionId), toWrite);
  return {
    ok: true,
    order: toWrite,
    terminal: effective.terminal,
    wroteKv: true,
  };
}

/** Approval/retry gates: refuse to treat order as healthy when terminal store cannot be read. */
export function mustFailClosedForHealthyAction(terminalRead: PrintOrderTerminalReadResult): boolean {
  return !terminalRead.ok;
}

export function isEffectivelyFailedPrintOrder(
  order: PrintOrderRecord | null | undefined,
  terminal: PrintOrderTerminalState | null | undefined,
): boolean {
  if (terminal?.status === "failed") return true;
  return order?.status === "failed";
}
