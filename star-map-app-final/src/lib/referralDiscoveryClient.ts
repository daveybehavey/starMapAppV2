/**
 * Client for the ReferralDiscovery Durable Object (DL-1 v3.8 §5.2).
 *
 * Mirrors the EntitlementAuthority client pattern: production resolves
 * the REFERRAL_DISCOVERY binding; local unit tests / dev servers use an
 * in-memory serialized store over the same pure machine, gated by the
 * same explicit local opt-in. A missing DO in a non-local environment
 * fails closed (null): a non-answer from the discovery authority is
 * outcome 3 in the lineage — it finalizes NOTHING (v3.8 §5.4).
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  createEmptyReferralDiscoveryRow,
  recordTerminalNegative,
  registerDiscovery,
  type RecordTerminalNegativeOutcome,
  type ReferralDiscoveryRow,
  type RegisterDiscoveryOutcome,
} from "@/lib/referralDiscovery";
import { isLocalAuthorityFallbackAllowed } from "@/lib/entitlementAuthority";

type DiscoveryNamespace = {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): {
    getAssociation(referredSessionId: string): Promise<ReferralDiscoveryRow>;
    register(
      referredSessionId: string,
      input: { referrerSessionId: string; grantId: string; now: number },
    ): Promise<{ row: ReferralDiscoveryRow; outcome: RegisterDiscoveryOutcome }>;
    recordTerminalNegative(
      referredSessionId: string,
      input: { lineageRef: string; now: number },
    ): Promise<{ row: ReferralDiscoveryRow; outcome: RecordTerminalNegativeOutcome }>;
  };
};

export type ReferralDiscoveryClient = {
  getAssociation(referredSessionId: string): Promise<ReferralDiscoveryRow | null>;
  register(
    referredSessionId: string,
    input: { referrerSessionId: string; grantId: string; now: number },
  ): Promise<{ row: ReferralDiscoveryRow; outcome: RegisterDiscoveryOutcome } | null>;
  recordTerminalNegative(
    referredSessionId: string,
    input: { lineageRef: string; now: number },
  ): Promise<{ row: ReferralDiscoveryRow; outcome: RecordTerminalNegativeOutcome } | null>;
};

const memoryRows = new Map<string, ReferralDiscoveryRow>();
const memoryLocks = new Map<string, Promise<void>>();

async function withMemoryLock<T>(key: string, fn: () => T): Promise<T> {
  const prev = memoryLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  memoryLocks.set(
    key,
    prev.then(() => gate),
  );
  await prev;
  try {
    return fn();
  } finally {
    release();
  }
}

/** Test-only: reset the in-memory discovery store (unit harnesses). */
export function __resetReferralDiscoveryMemoryForTests() {
  memoryRows.clear();
  memoryLocks.clear();
}

function namespaceFromEnvRecord(env: unknown): DiscoveryNamespace | null {
  if (!env || typeof env !== "object") return null;
  const binding = (env as { REFERRAL_DISCOVERY?: DiscoveryNamespace }).REFERRAL_DISCOVERY;
  return binding ?? null;
}

export function createReferralDiscoveryClient(
  explicitEnv?: unknown,
): ReferralDiscoveryClient {
  const resolveNamespace = (): DiscoveryNamespace | null => {
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
    async getAssociation(referredSessionId) {
      const trimmed = referredSessionId.trim();
      if (!trimmed) return null;
      const ns = resolveNamespace();
      if (ns) {
        try {
          const stub = ns.get(ns.idFromName(trimmed));
          return await stub.getAssociation(trimmed);
        } catch {
          if (isLocalAuthorityFallbackAllowed()) {
            return memoryRows.get(trimmed) ?? createEmptyReferralDiscoveryRow(trimmed);
          }
          return null;
        }
      }
      if (isLocalAuthorityFallbackAllowed()) {
        return memoryRows.get(trimmed) ?? createEmptyReferralDiscoveryRow(trimmed);
      }
      return null;
    },
    async register(referredSessionId, input) {
      const trimmed = referredSessionId.trim();
      if (!trimmed) return null;
      const ns = resolveNamespace();
      if (ns) {
        try {
          const stub = ns.get(ns.idFromName(trimmed));
          return await stub.register(trimmed, input);
        } catch {
          if (!isLocalAuthorityFallbackAllowed()) return null;
        }
      }
      if (!isLocalAuthorityFallbackAllowed()) return null;
      return withMemoryLock(trimmed, () => {
        const current =
          memoryRows.get(trimmed) ?? createEmptyReferralDiscoveryRow(trimmed);
        const result = registerDiscovery(current, input);
        if (result.row !== current) memoryRows.set(trimmed, result.row);
        return result;
      });
    },
    async recordTerminalNegative(referredSessionId, input) {
      const trimmed = referredSessionId.trim();
      if (!trimmed) return null;
      const ns = resolveNamespace();
      if (ns) {
        try {
          const stub = ns.get(ns.idFromName(trimmed));
          return await stub.recordTerminalNegative(trimmed, input);
        } catch {
          if (!isLocalAuthorityFallbackAllowed()) return null;
        }
      }
      if (!isLocalAuthorityFallbackAllowed()) return null;
      return withMemoryLock(trimmed, () => {
        const current =
          memoryRows.get(trimmed) ?? createEmptyReferralDiscoveryRow(trimmed);
        const result = recordTerminalNegative(current, input);
        if (result.row !== current) memoryRows.set(trimmed, result.row);
        return result;
      });
    },
  };
}
