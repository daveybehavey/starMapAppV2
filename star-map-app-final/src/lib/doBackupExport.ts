/**
 * Slice-3 Durable Object backup export helpers (read-only).
 *
 * Minimal shared surface for ReferralDiscoveryDO, ConsistencyCoordinatorDO,
 * ReviewRequestLedgerDO, and ReviewRequestSuppressionDO. Slices 1–2 may
 * later extend the same class registry / ops route; this module deliberately
 * does not include EntitlementAuthorityDO, GiftCertificateGrantDO, or
 * PrintOrderAuthorityDO.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const DO_BACKUP_SLICE3_CLASSES = [
  "ReferralDiscoveryDO",
  "ConsistencyCoordinatorDO",
  "ReviewRequestLedgerDO",
  "ReviewRequestSuppressionDO",
] as const;

export type DoBackupSlice3Class = (typeof DO_BACKUP_SLICE3_CLASSES)[number];

export const DO_BACKUP_BINDING_BY_CLASS: Record<DoBackupSlice3Class, string> = {
  ReferralDiscoveryDO: "REFERRAL_DISCOVERY",
  ConsistencyCoordinatorDO: "CONSISTENCY_COORDINATOR",
  ReviewRequestLedgerDO: "REVIEW_REQUEST_LEDGER",
  ReviewRequestSuppressionDO: "REVIEW_REQUEST_SUPPRESSION",
};

export function isDoBackupSlice3Class(value: unknown): value is DoBackupSlice3Class {
  return (
    typeof value === "string" &&
    (DO_BACKUP_SLICE3_CLASSES as readonly string[]).includes(value)
  );
}

type ExportStateResult = {
  instanceId: string;
  instanceName: string | null;
  state: unknown;
};

type DurableObjectStubLike = {
  exportState(): Promise<ExportStateResult>;
};

type DurableObjectNamespaceLike = {
  idFromName(name: string): DurableObjectId;
  idFromString(id: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStubLike;
};

function namespaceFromEnv(env: unknown, binding: string): DurableObjectNamespaceLike | null {
  if (!env || typeof env !== "object") return null;
  const value = (env as Record<string, unknown>)[binding];
  if (!value || typeof value !== "object") return null;
  return value as DurableObjectNamespaceLike;
}

function resolveEnv(explicitEnv?: unknown): unknown {
  if (explicitEnv !== undefined) return explicitEnv;
  try {
    return getCloudflareContext().env;
  } catch {
    return null;
  }
}

/**
 * Invoke exportState() on one Durable Object instance. Prefer instanceId
 * (platform-API census hex id) when available; fall back to instanceName
 * (idFromName). Fail closed when the binding is missing.
 */
export async function exportDoBackupState(input: {
  className: DoBackupSlice3Class;
  instanceId?: string | null;
  instanceName?: string | null;
  env?: unknown;
}): Promise<ExportStateResult | null> {
  const binding = DO_BACKUP_BINDING_BY_CLASS[input.className];
  const ns = namespaceFromEnv(resolveEnv(input.env), binding);
  if (!ns) return null;

  const trimmedId = input.instanceId?.trim() || "";
  const trimmedName = input.instanceName?.trim() || "";
  if (!trimmedId && !trimmedName) return null;

  try {
    const id = trimmedId ? ns.idFromString(trimmedId) : ns.idFromName(trimmedName);
    const stub = ns.get(id);
    return await stub.exportState();
  } catch {
    return null;
  }
}
