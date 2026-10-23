/**
 * Client for the ReviewRequestLedger Durable Object.
 *
 * REVISED (T-T1): storage modes are explicit — "live" | "dry_run" | "test"
 * (option, then STARMAP_REVIEW_LEDGER_MODE, default live). The old client
 * silently fell back to process memory whenever the DO was missing or
 * errored in CI/local-looking environments; on the activated path that
 * would have sent mail with no durable claim. Now:
 *
 *   - live:    the DO is authoritative. Missing/unavailable DO → null
 *              (fail closed — the engine skips the record), NEVER memory,
 *              even with CI=1 / STARMAP_*_LOCAL=1 / NODE_ENV=development set.
 *   - dry_run: reads pass through to the DO when bound; writes are refused
 *              (null) so a proof can never claim or mutate.
 *   - test:    the in-memory serialized store over the same pure state
 *              machine — only via this explicit mode (unit tests).
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

export type ReviewLedgerMode = "live" | "dry_run" | "test";

type LedgerNamespace = {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): {
    getState(sessionId: string): Promise<ReviewLedgerState>;
    apply(sessionId: string, op: ReviewLedgerOp): Promise<ReviewLedgerApplyResult>;
  };
};

const memoryStores = new Map<string, ReviewLedgerState>();
const memoryLocks = new Map<string, Promise<void>>();

async function withMemoryLock<T>(sessionId: string, fn: () => Promise<T> | T): Promise<T> {
  const prev = memoryLocks.get(sessionId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  memoryLocks.set(
    sessionId,
    prev.then(() => gate)
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

export function resolveReviewLedgerMode(env: NodeJS.ProcessEnv = process.env): ReviewLedgerMode {
  const raw = env.STARMAP_REVIEW_LEDGER_MODE?.trim().toLowerCase();
  // "test" is deliberately NOT selectable from the environment: the memory
  // store may only be reached through an explicit code-level option, so no
  // deployed env combination can route the live path to process memory.
  if (raw === "dry_run" || raw === "live") return raw;
  return "live";
}

/**
 * Build a ledger client. Pass the Worker handler's env explicitly from the
 * scheduled entry (bindings come from the handler argument, not from a
 * request context); route handlers may omit it and resolve via the
 * OpenNext Cloudflare context.
 */
export function createReviewLedgerClient(
  explicitEnv?: unknown,
  options?: { mode?: ReviewLedgerMode }
): ReviewLedgerClient {
  const mode = options?.mode ?? resolveReviewLedgerMode();

  if (mode === "test") {
    return {
      async getState(sessionId: string) {
        const trimmed = sessionId.trim();
        if (!trimmed) return null;
        return getMemoryState(trimmed);
      },
      async apply(sessionId: string, op: ReviewLedgerOp) {
        const trimmed = sessionId.trim();
        if (!trimmed) return null;
        return applyMemory(trimmed, op);
      },
    };
  }

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
      if (!ns) return null;
      try {
        const stub = ns.get(ns.idFromName(trimmed));
        return await stub.getState(trimmed);
      } catch {
        // Live and dry-run reads fail closed: an unreadable ledger means
        // the record is skipped, never guessed at from process memory.
        return null;
      }
    },
    async apply(sessionId: string, op: ReviewLedgerOp): Promise<ReviewLedgerApplyResult | null> {
      const trimmed = sessionId.trim();
      if (!trimmed) return null;
      if (mode === "dry_run") return null;
      const ns = resolveNamespace();
      if (!ns) return null;
      try {
        const stub = ns.get(ns.idFromName(trimmed));
        return await stub.apply(trimmed, op);
      } catch {
        return null;
      }
    },
  };
}
