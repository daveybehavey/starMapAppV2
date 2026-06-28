import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ENTITLEMENT_R2 } from "@/lib/entitlementsStore";

const R2_BUCKET_BINDING = "NEXT_INC_CACHE_R2_BUCKET";

export async function getDownloadArchiveR2Bucket(): Promise<R2Bucket | null> {
  const timeoutMs = 120;
  try {
    const ctx = await Promise.race([
      getCloudflareContext({ async: true }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    const env = (ctx as { env?: unknown } | null)?.env as Record<string, unknown> | undefined;
    const bucket = env?.[R2_BUCKET_BINDING] as R2Bucket | undefined;
    return bucket ?? null;
  } catch {
    return null;
  }
}

export async function hdArchiveObjectExists(sessionId: string): Promise<boolean> {
  const bucket = await getDownloadArchiveR2Bucket();
  if (!bucket) return false;
  try {
    const object = await bucket.head(ENTITLEMENT_R2.hdArchiveKey(sessionId));
    return Boolean(object);
  } catch {
    return false;
  }
}

export function buildHdArchiveDownloadUrl(siteOrigin: string, claimToken: string): string {
  const base = siteOrigin.replace(/\/+$/, "");
  return `${base}/api/download/archive?token=${encodeURIComponent(claimToken)}`;
}
