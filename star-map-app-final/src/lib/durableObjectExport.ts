/**
 * Read-only Durable Object state export helpers for the ops backup route.
 * Slice-2 classes only (GiftCertificateGrantDO + PrintOrderAuthorityDO).
 * Never logs or persists snapshot contents here — callers own transport.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { GiftCertificateGrantRow } from "@/lib/giftCertificateGrantState";
import type { PrintOrderAuthorityState } from "@/lib/printOrderAuthorityState";

export const DO_EXPORT_CLASSES = Object.freeze({
  GiftCertificateGrantDO: "GIFT_CERTIFICATE_GRANT",
  PrintOrderAuthorityDO: "PRINT_ORDER_AUTHORITY",
} as const);

export type DoExportClassName = keyof typeof DO_EXPORT_CLASSES;

export type DoExportStub = {
  exportState(): Promise<{ state: GiftCertificateGrantRow | PrintOrderAuthorityState | null }>;
};

export type DoExportNamespace = {
  idFromString(id: string): DurableObjectId;
  get(id: DurableObjectId): DoExportStub;
};

export function isDoExportClassName(value: string): value is DoExportClassName {
  return Object.prototype.hasOwnProperty.call(DO_EXPORT_CLASSES, value);
}

export function namespaceFromEnv(
  className: DoExportClassName,
  env: unknown,
): DoExportNamespace | null {
  if (!env || typeof env !== "object") return null;
  const binding = DO_EXPORT_CLASSES[className];
  const ns = (env as Record<string, DoExportNamespace | undefined>)[binding];
  return ns ?? null;
}

export function resolveDoExportNamespace(className: DoExportClassName): DoExportNamespace | null {
  try {
    const { env } = getCloudflareContext();
    return namespaceFromEnv(className, env);
  } catch {
    return null;
  }
}

export async function exportDurableObjectInstance(
  namespace: DoExportNamespace,
  instanceId: string,
): Promise<{ state: GiftCertificateGrantRow | PrintOrderAuthorityState | null }> {
  const trimmed = instanceId.trim();
  if (!trimmed) {
    throw new Error("instanceId required");
  }
  const stub = namespace.get(namespace.idFromString(trimmed));
  return stub.exportState();
}
