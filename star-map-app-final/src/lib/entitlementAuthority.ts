/**
 * Client for the EntitlementAuthority Durable Object (DL-1 Slice 2, inert:
 * no route calls this yet).
 *
 * Production: the DO is the sole accounting authority for HD downloads.
 * Local/CI unit tests: in-memory serialized store over the same pure state
 * machine. Missing DO in a non-local environment → fail closed (null), so
 * callers skip the entitlement instead of accounting against a fallback.
 *
 * Every successful mutation also republishes the KV read projection
 * (non-authoritative, display only — v3 §2.2). A failed projection write
 * never fails or alters the accounting result; the projection is rebuilt
 * from authoritative state on the next mutation.
 *
 * Mirrors the ReviewRequestLedger client pattern (reviewRequestLedger.ts).
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  applyEntitlementAuthorityOp,
  buildEntitlementAuthorityProjection,
  createEmptyEntitlementAuthorityState,
  type EntitlementAuthorityApplyResult,
  type EntitlementAuthorityOp,
  type EntitlementAuthorityState,
} from "@/lib/entitlementAuthorityState";
import { kv } from "@/lib/kv";

/** KV key of the non-authoritative read projection for one entitlement. */
export const ENTITLEMENT_AUTHORITY_PROJECTION_KV_KEY = (sessionId: string) =>
  `entitlement:authority:${sessionId}`;

type AuthorityNamespace = {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): {
    getState(sessionId: string): Promise<EntitlementAuthorityState>;
    apply(
      sessionId: string,
      op: EntitlementAuthorityOp,
    ): Promise<EntitlementAuthorityApplyResult>;
  };
};

export type EntitlementAuthorityClient = {
  getState(sessionId: string): Promise<EntitlementAuthorityState | null>;
  apply(
    sessionId: string,
    op: EntitlementAuthorityOp,
  ): Promise<EntitlementAuthorityApplyResult | null>;
};

const memoryStores = new Map<string, EntitlementAuthorityState>();
const memoryLocks = new Map<string, Promise<void>>();

function isLocalAuthorityFallbackAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.STARMAP_ENTITLEMENT_AUTHORITY_LOCAL === "1") return true;
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

function applyMemory(
  sessionId: string,
  op: EntitlementAuthorityOp,
): Promise<EntitlementAuthorityApplyResult> {
  return withMemoryLock(sessionId, () => {
    const current = memoryStores.get(sessionId) ?? createEmptyEntitlementAuthorityState(sessionId);
    const result = applyEntitlementAuthorityOp(current, op);
    if (result.changed) {
      memoryStores.set(sessionId, result.state);
    }
    return result;
  });
}

function getMemoryState(sessionId: string): EntitlementAuthorityState {
  return memoryStores.get(sessionId) ?? createEmptyEntitlementAuthorityState(sessionId);
}

/** Test-only: reset the in-memory authority (unit harnesses). */
export function __resetEntitlementAuthorityMemoryForTests() {
  memoryStores.clear();
  memoryLocks.clear();
}

function namespaceFromEnvRecord(env: unknown): AuthorityNamespace | null {
  if (!env || typeof env !== "object") return null;
  const binding = (env as { ENTITLEMENT_AUTHORITY?: AuthorityNamespace }).ENTITLEMENT_AUTHORITY;
  return binding ?? null;
}

async function publishProjection(state: EntitlementAuthorityState): Promise<void> {
  try {
    await kv.set(
      ENTITLEMENT_AUTHORITY_PROJECTION_KV_KEY(state.sessionId),
      buildEntitlementAuthorityProjection(state),
    );
  } catch {
    // Non-authoritative display projection: a failed write must never fail
    // or alter the accounting result (v3 §2.2). It is rebuilt from
    // authoritative state on the next mutation.
  }
}

/**
 * Build an authority client. Pass the Worker handler's env explicitly from
 * non-request entry points (bindings come from the handler argument, not
 * from a request context); route handlers may omit it and resolve via the
 * OpenNext Cloudflare context.
 */
export function createEntitlementAuthorityClient(explicitEnv?: unknown): EntitlementAuthorityClient {
  const resolveNamespace = (): AuthorityNamespace | null => {
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
    async getState(sessionId: string): Promise<EntitlementAuthorityState | null> {
      const trimmed = sessionId.trim();
      if (!trimmed) return null;
      const ns = resolveNamespace();
      if (ns) {
        try {
          const stub = ns.get(ns.idFromName(trimmed));
          return await stub.getState(trimmed);
        } catch {
          if (isLocalAuthorityFallbackAllowed()) return getMemoryState(trimmed);
          return null;
        }
      }
      if (isLocalAuthorityFallbackAllowed()) return getMemoryState(trimmed);
      return null;
    },
    async apply(
      sessionId: string,
      op: EntitlementAuthorityOp,
    ): Promise<EntitlementAuthorityApplyResult | null> {
      const trimmed = sessionId.trim();
      if (!trimmed) return null;
      const ns = resolveNamespace();
      let result: EntitlementAuthorityApplyResult | null = null;
      if (ns) {
        try {
          const stub = ns.get(ns.idFromName(trimmed));
          result = await stub.apply(trimmed, op);
        } catch {
          if (!isLocalAuthorityFallbackAllowed()) return null;
          result = await applyMemory(trimmed, op);
        }
      } else if (isLocalAuthorityFallbackAllowed()) {
        result = await applyMemory(trimmed, op);
      }
      if (!result) return null;
      if (result.changed) {
        await publishProjection(result.state);
      }
      return result;
    },
  };
}
