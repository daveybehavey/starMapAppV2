/**
 * Client for the thin PrintOrderAuthority Durable Object.
 *
 * Production: DO is authoritative; KV is a non-authoritative mirror.
 * Local/CI unit tests: in-memory serialized store (same pure state machine).
 * Missing DO in non-local environments → fail closed (authority unread).
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  applyPrintOrderAuthorityOp,
  authorityLifecycleBlocksNonterminalMirror,
  createUnboundAuthorityState,
  type PrintOrderAuthorityApplyResult,
  type PrintOrderAuthorityLifecycle,
  type PrintOrderAuthorityOp,
  type PrintOrderAuthorityState,
} from "@/lib/printOrderAuthorityState";
import type { PrintOrderRecord } from "@/lib/printOrders";

type AuthorityNamespace = {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): {
    getState(sessionId: string): Promise<PrintOrderAuthorityState>;
    apply(sessionId: string, op: PrintOrderAuthorityOp): Promise<PrintOrderAuthorityApplyResult>;
  };
};

const memoryStores = new Map<string, PrintOrderAuthorityState>();
const memoryLocks = new Map<string, Promise<void>>();

function isLocalAuthorityFallbackAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.STARMAP_PRINT_ORDER_AUTHORITY_LOCAL === "1") return true;
  if (env.CI === "1") return true;
  const nodeEnv = env.NODE_ENV?.trim();
  return nodeEnv === "development" || nodeEnv === "test";
}

async function withMemoryLock<T>(sessionId: string, fn: () => Promise<T> | T): Promise<T> {
  const prev = memoryLocks.get(sessionId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  memoryLocks.set(
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

function getMemoryState(sessionId: string): PrintOrderAuthorityState {
  return memoryStores.get(sessionId) ?? createUnboundAuthorityState(sessionId);
}

async function applyMemory(sessionId: string, op: PrintOrderAuthorityOp): Promise<PrintOrderAuthorityApplyResult> {
  return withMemoryLock(sessionId, () => {
    const current = getMemoryState(sessionId);
    const result = applyPrintOrderAuthorityOp(current, op);
    if (result.ok && result.changed) {
      memoryStores.set(sessionId, result.state);
    }
    return result;
  });
}

/** Test-only: reset in-memory authority (unit harnesses). */
export function __resetPrintOrderAuthorityMemoryForTests() {
  memoryStores.clear();
  memoryLocks.clear();
}

function tryGetAuthorityNamespace(): AuthorityNamespace | null {
  try {
    const { env } = getCloudflareContext();
    const binding = (env as CloudflareEnv & { PRINT_ORDER_AUTHORITY?: AuthorityNamespace }).PRINT_ORDER_AUTHORITY;
    return binding ?? null;
  } catch {
    return null;
  }
}

async function applyAuthority(
  sessionId: string,
  op: PrintOrderAuthorityOp,
): Promise<PrintOrderAuthorityApplyResult | { ok: false; reason: "authority_unread"; state: null }> {
  const trimmed = sessionId.trim();
  if (!trimmed) {
    return { ok: false, reason: "authority_unread", state: null };
  }
  const ns = tryGetAuthorityNamespace();
  if (ns) {
    try {
      const stub = ns.get(ns.idFromName(trimmed));
      return await stub.apply(trimmed, op);
    } catch {
      // Local Next/playwright often has a wrangler binding stub without an exported DO class.
      if (isLocalAuthorityFallbackAllowed()) {
        return applyMemory(trimmed, op);
      }
      return { ok: false, reason: "authority_unread", state: null };
    }
  }
  if (isLocalAuthorityFallbackAllowed()) {
    return applyMemory(trimmed, op);
  }
  return { ok: false, reason: "authority_unread", state: null };
}

export async function getPrintOrderAuthorityState(
  sessionId: string,
): Promise<PrintOrderAuthorityState | null> {
  const trimmed = sessionId.trim();
  if (!trimmed) return null;
  const ns = tryGetAuthorityNamespace();
  if (ns) {
    try {
      const stub = ns.get(ns.idFromName(trimmed));
      return await stub.getState(trimmed);
    } catch {
      if (isLocalAuthorityFallbackAllowed()) {
        return getMemoryState(trimmed);
      }
      return null;
    }
  }
  if (isLocalAuthorityFallbackAllowed()) {
    return getMemoryState(trimmed);
  }
  return null;
}

export async function seedPrintOrderAuthorityFromKv(
  sessionId: string,
  kvMirror: { status?: PrintOrderRecord["status"] | null; printfulOrderId?: string | number | null } | null,
): Promise<PrintOrderAuthorityApplyResult | { ok: false; reason: "authority_unread"; state: null }> {
  return applyAuthority(sessionId, {
    type: "seed_from_kv",
    kvStatus: kvMirror?.status ?? null,
    printfulOrderId: kvMirror?.printfulOrderId ?? null,
  });
}

export async function bindPrintProviderOrderId(
  sessionId: string,
  printfulOrderId: string | number,
): Promise<PrintOrderAuthorityApplyResult | { ok: false; reason: "authority_unread"; state: null }> {
  return applyAuthority(sessionId, { type: "bind_provider_order_id", printfulOrderId });
}

export async function markPrintOrderTerminalFailed(
  sessionId: string,
  input: { eventType: string; reason?: string | null },
): Promise<PrintOrderAuthorityApplyResult | { ok: false; reason: "authority_unread"; state: null }> {
  return applyAuthority(sessionId, {
    type: "mark_terminal_failed",
    eventType: input.eventType,
    reason: input.reason,
  });
}

export async function operatorRecoverPrintOrder(
  sessionId: string,
): Promise<PrintOrderAuthorityApplyResult | { ok: false; reason: "authority_unread"; state: null }> {
  return applyAuthority(sessionId, { type: "operator_recover" });
}

export async function readAuthorityLifecycleForMirrorGuard(
  sessionId: string,
): Promise<PrintOrderAuthorityLifecycle | null | "unread"> {
  const state = await getPrintOrderAuthorityState(sessionId);
  if (state) return state.lifecycle;
  // Production without a readable DO must fail closed. Local/CI may use memory.
  if (!isLocalAuthorityFallbackAllowed()) return "unread";
  return "unbound";
}

export function shouldRejectNonterminalKvMirror(
  lifecycle: PrintOrderAuthorityLifecycle | "unread" | null,
): boolean {
  if (lifecycle === "unread") {
    // Fail closed when authority cannot be read outside local/test fallbacks.
    return true;
  }
  return authorityLifecycleBlocksNonterminalMirror(lifecycle);
}
