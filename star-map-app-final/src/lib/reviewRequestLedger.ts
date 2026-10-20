/**
 * Client for the ReviewRequestLedger Durable Object.
 *
 * Production: the DO is authoritative for the claim machine.
 * Local/CI unit tests: in-memory serialized store over the same pure state
 * machine. Missing DO in a non-local environment → fail closed (null), so
 * the engine skips the record instead of sending without a claim.
 *
 * Mirrors the PrintOrderAuthority client pattern (printOrderAuthority.ts).
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  applyReviewLedgerOp,
  createEmptyReviewLedgerState,
  type ReviewLedgerApplyResult,
  type ReviewLedgerOp,
  type ReviewLedgerState,
} from "@/lib/reviewRequestLedgerState";
import type { ReviewLedgerClient } from "@/lib/reviewRequests";

type LedgerNamespace = {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): {
    getState(sessionId: string): Promise<ReviewLedgerState>;
    apply(sessionId: string, op: ReviewLedgerOp): Promise<ReviewLedgerApplyResult>;
  };
};

const memoryStores = new Map<string, ReviewLedgerState>();
const memoryLocks = new Map<string, Promise<void>>();

function isLocalLedgerFallbackAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.STARMAP_REVIEW_REQUEST_LEDGER_LOCAL === "1") return true;
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

function applyMemory(sessionId: string, op: ReviewLedgerOp): Promise<ReviewLedgerApplyResult> {
  return withMemoryLock(sessionId, () => {
    const current = memoryStores.get(sessionId) ?? createEmptyReviewLedgerState(sessionId);
    const result = applyReviewLedgerOp(current, op);
    if (result.changed) {
      memoryStores.set(sessionId, result.state);
    }
    return result;
  });
}

function getMemoryState(sessionId: string): ReviewLedgerState {
  return memoryStores.get(sessionId) ?? createEmptyReviewLedgerState(sessionId);
}

/** Test-only: reset the in-memory ledger (unit harnesses). */
export function __resetReviewLedgerMemoryForTests() {
  memoryStores.clear();
  memoryLocks.clear();
}

function namespaceFromEnvRecord(env: unknown): LedgerNamespace | null {
  if (!env || typeof env !== "object") return null;
  const binding = (env as { REVIEW_REQUEST_LEDGER?: LedgerNamespace }).REVIEW_REQUEST_LEDGER;
  return binding ?? null;
}

/**
 * Build a ledger client. Pass the Worker handler's env explicitly from the
 * scheduled entry (bindings come from the handler argument, not from a
 * request context); route handlers may omit it and resolve via the
 * OpenNext Cloudflare context.
 */
export function createReviewLedgerClient(explicitEnv?: unknown): ReviewLedgerClient {
  const resolveNamespace = (): LedgerNamespace | null => {
    const fromExplicit = namespaceFromEnvRecord(explicitEnv);
    if (fromExplicit) return fromExplicit;
    try {
      const { env } = getCloudflareContext();
      return namespaceFromEnvRecord(env);
    } catch {
      return null;
    }
  };

  return {
    async getState(sessionId: string): Promise<ReviewLedgerState | null> {
      const trimmed = sessionId.trim();
      if (!trimmed) return null;
      const ns = resolveNamespace();
      if (ns) {
        try {
          const stub = ns.get(ns.idFromName(trimmed));
          return await stub.getState(trimmed);
        } catch {
          if (isLocalLedgerFallbackAllowed()) return getMemoryState(trimmed);
          return null;
        }
      }
      if (isLocalLedgerFallbackAllowed()) return getMemoryState(trimmed);
      return null;
    },
    async apply(
      sessionId: string,
      op: ReviewLedgerOp,
    ): Promise<ReviewLedgerApplyResult | null> {
      const trimmed = sessionId.trim();
      if (!trimmed) return null;
      const ns = resolveNamespace();
      if (ns) {
        try {
          const stub = ns.get(ns.idFromName(trimmed));
          return await stub.apply(trimmed, op);
        } catch {
          if (isLocalLedgerFallbackAllowed()) return applyMemory(trimmed, op);
          return null;
        }
      }
      if (isLocalLedgerFallbackAllowed()) return applyMemory(trimmed, op);
      return null;
    },
  };
}
