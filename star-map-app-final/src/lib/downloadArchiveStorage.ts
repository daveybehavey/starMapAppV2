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

/* ================= DL-1 Slice 4 storage layer (brief §5.8) =================
 * Staging puts, artifact head/get through the binding, and the create-only
 * promotion wrapper with the §5.8 outcome taxonomy (object / null / throw).
 * Errors are NEVER collapsed to absence in this surface (§5.5): a storage
 * read error throws; only a genuine not-found reports absence.
 *
 * The local filesystem fallback carries equivalent create-only semantics
 * (exclusive-create, no overwrite) and is reachable ONLY in explicitly
 * local environments (the same test as the authority fallback,
 * `isLocalAuthorityFallbackAllowed`). In production a null bucket fails
 * closed — never a local write.
 *
 * A1–A3 verification (step 4, recorded on the PR): the bucket is
 * NEXT_INC_CACHE_R2_BUCKET, shared with the Next.js incremental cache.
 * A1: no bucket lifecycle rule targeting the `download-archive/` prefix
 * was found in the account's R2 lifecycle configuration read at build
 * time. A2/A3: no code path in this repo deletes or overwrites under
 * `download-archive/` — the writer inventory below is the complete set of
 * S4 writers, enforced by the §8 source pins; Next.js cache revalidation
 * writes only its own cache keys, never this prefix.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { isLocalAuthorityFallbackAllowed } from "@/lib/entitlementAuthority";

/** Provenance metadata written atomically with the body by promotion
 * (§5.8): exactly four fixed-shape fields (§5.5 trust rules). */
export type ArtifactObjectMetadata = {
  protocol: string;
  artifactKey: string;
  digest: string;
  bindingDigest: string;
};

const LOCAL_ARCHIVE_DIR =
  process.env.STARMAP_DOWNLOAD_ARCHIVE_DIR?.trim() ||
  path.join(process.cwd(), ".tmp", "download-archive");

function localFilePathForKey(key: string): string {
  return path.join(LOCAL_ARCHIVE_DIR, Buffer.from(key, "utf8").toString("base64url"));
}

function artifactMetadataFromCustom(
  custom: Record<string, string> | undefined,
): ArtifactObjectMetadata | null {
  if (!custom) return null;
  const { protocol, artifactKey, digest, bindingDigest } = custom;
  if (
    typeof protocol !== "string" ||
    typeof artifactKey !== "string" ||
    typeof digest !== "string" ||
    typeof bindingDigest !== "string"
  ) {
    return null;
  }
  return { protocol, artifactKey, digest, bindingDigest };
}

export type ArtifactHead =
  | { present: true; metadata: ArtifactObjectMetadata | null }
  | { present: false; metadata: null };

/**
 * Head an artifact/staging key through the binding. Throws on storage
 * errors (errors are never absence); returns present:false only for a
 * genuine not-found.
 */
export async function headArtifactObject(key: string): Promise<ArtifactHead> {
  const bucket = await getDownloadArchiveR2Bucket();
  if (bucket) {
    const head = await bucket.head(key);
    if (!head) return { present: false, metadata: null };
    return { present: true, metadata: artifactMetadataFromCustom(head.customMetadata) };
  }
  if (!isLocalAuthorityFallbackAllowed()) {
    throw new Error("archive_storage_unavailable");
  }
  try {
    await fs.access(localFilePathForKey(key));
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return { present: false, metadata: null };
    }
    throw err;
  }
  let metadata: ArtifactObjectMetadata | null = null;
  try {
    const raw = await fs.readFile(`${localFilePathForKey(key)}.meta.json`, "utf8");
    metadata = artifactMetadataFromCustom(JSON.parse(raw) as Record<string, string>);
  } catch {
    metadata = null;
  }
  return { present: true, metadata };
}

/** Read an artifact object's body + metadata through the binding.
 * Returns null only for a genuine not-found; throws on storage errors. */
export async function getArtifactObject(
  key: string,
): Promise<{ bytes: Uint8Array; metadata: ArtifactObjectMetadata | null } | null> {
  const bucket = await getDownloadArchiveR2Bucket();
  if (bucket) {
    const object = await bucket.get(key);
    if (!object) return null;
    const bytes = new Uint8Array(await object.arrayBuffer());
    return { bytes, metadata: artifactMetadataFromCustom(object.customMetadata) };
  }
  if (!isLocalAuthorityFallbackAllowed()) {
    throw new Error("archive_storage_unavailable");
  }
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(localFilePathForKey(key));
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw err;
  }
  let metadata: ArtifactObjectMetadata | null = null;
  try {
    const raw = await fs.readFile(`${localFilePathForKey(key)}.meta.json`, "utf8");
    metadata = artifactMetadataFromCustom(JSON.parse(raw) as Record<string, string>);
  } catch {
    metadata = null;
  }
  return { bytes, metadata };
}

/** Staging write (§5.8): a plain put to the staging key — staging is
 * untrusted scratch; only promotion is conditional. */
export async function putStagingObject(key: string, bytes: Uint8Array): Promise<void> {
  const bucket = await getDownloadArchiveR2Bucket();
  if (bucket) {
    await bucket.put(key, bytes, {
      httpMetadata: { contentType: "image/png" },
    });
    return;
  }
  if (!isLocalAuthorityFallbackAllowed()) {
    throw new Error("archive_storage_unavailable");
  }
  await fs.mkdir(LOCAL_ARCHIVE_DIR, { recursive: true });
  await fs.writeFile(localFilePathForKey(key), bytes);
}

export type PromotionOutcome =
  | { outcome: "created" }
  | { outcome: "existed" }
  | { outcome: "error"; error: unknown };

const PROMOTION_MAX_ATTEMPTS = 3;

/**
 * Create-only promotion against an explicit bucket (§5.8) — the shape the
 * R2 verification memo proved: `onlyIf: { etagDoesNotMatch: "*" }`.
 * written !== null → this call created the object (winner);
 * written === null → precondition failed (the key existed at commit);
 * a throw → outcome UNKNOWN (incl. R2's same-key 1-write/sec 429, error
 * 10058): reconciled by RETRYING the create-only put (bounded), never by
 * a head alone — a head miss never proves an unknown write failed.
 * Exported with an explicit bucket so tests can drive a faithful fake.
 */
export async function promoteCreateOnlyWithBucket(
  bucket: R2Bucket,
  key: string,
  bytes: Uint8Array,
  metadata: ArtifactObjectMetadata,
  digestArrayBuffer: ArrayBuffer,
): Promise<PromotionOutcome> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < PROMOTION_MAX_ATTEMPTS; attempt++) {
    try {
      const written = await bucket.put(key, bytes, {
        onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: { contentType: "image/png" },
        customMetadata: { ...metadata },
        sha256: digestArrayBuffer,
      });
      return written !== null ? { outcome: "created" } : { outcome: "existed" };
    } catch (err) {
      lastError = err;
    }
  }
  return { outcome: "error", error: lastError };
}

/** Local exclusive-create promotion (test/local only, fenced as above). */
export async function promoteCreateOnlyLocal(
  key: string,
  bytes: Uint8Array,
  metadata: ArtifactObjectMetadata,
): Promise<PromotionOutcome> {
  await fs.mkdir(LOCAL_ARCHIVE_DIR, { recursive: true });
  const filePath = localFilePathForKey(key);
  let handle: fs.FileHandle;
  try {
    handle = await fs.open(filePath, "wx");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "EEXIST") return { outcome: "existed" };
    return { outcome: "error", error: err };
  }
  try {
    await handle.writeFile(bytes);
    await handle.close();
    await fs.writeFile(`${filePath}.meta.json`, JSON.stringify(metadata));
    return { outcome: "created" };
  } catch (err) {
    return { outcome: "error", error: err };
  }
}

/**
 * The promotion wrapper the route calls (§5.8): resolves the binding,
 * converts the hex digest to the ArrayBuffer the put carries, and fails
 * closed in production when no bucket resolves.
 */
export async function promoteArtifactCreateOnly(
  key: string,
  bytes: Uint8Array,
  metadata: ArtifactObjectMetadata,
): Promise<PromotionOutcome> {
  const bucket = await getDownloadArchiveR2Bucket();
  if (!bucket) {
    if (!isLocalAuthorityFallbackAllowed()) {
      return { outcome: "error", error: new Error("archive_storage_unavailable") };
    }
    return promoteCreateOnlyLocal(key, bytes, metadata);
  }
  const digestBytes = Buffer.from(metadata.digest, "hex");
  const digestArrayBuffer = digestBytes.buffer.slice(
    digestBytes.byteOffset,
    digestBytes.byteOffset + digestBytes.byteLength,
  ) as ArrayBuffer;
  return promoteCreateOnlyWithBucket(bucket, key, bytes, metadata, digestArrayBuffer);
}
