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
import { createReadStream } from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { isLocalAuthorityFallbackAllowed } from "@/lib/entitlementAuthority";

/** Provenance metadata written by promotion (§5.8): exactly four
 * fixed-shape fields (§5.5 trust rules). Publication is NOT atomic
 * as a body/metadata pair on every backend: the R2 put carries body
 * and metadata in one conditional write, but the local backend links
 * the body into place and renames the sidecar immediately after, so
 * a metadata failure leaves the body standing without its sidecar
 * (see promoteCreateOnlyLocal). Metadata is therefore provenance
 * evidence, never proof of the body — the finalize observation
 * hashes the body itself (see observeArtifactObject). */
export type ArtifactObjectMetadata = {
  protocol: string;
  artifactKey: string;
  digest: string;
  bindingDigest: string;
};

/** Resolved per call (not captured at module load) so the directory
 * override behaves like the route's own local fallback and stays
 * test-addressable. */
function localArchiveDir(): string {
  return (
    process.env.STARMAP_DOWNLOAD_ARCHIVE_DIR?.trim() ||
    path.join(process.cwd(), ".tmp", "download-archive")
  );
}

/**
 * Canonical local key → path mapping (conformance fix round 2, area 6 —
 * G-dot re-check verdict 2026-10-24). The round-1 mapping base64url-
 * encoded the ENTIRE key into one filename component; valid keys
 * (final keys embed session + map + fingerprint) exceed the 255-byte
 * filesystem component limit once the metadata/temp suffixes are added,
 * and publication fails with ENAMETOOLONG. The mapping is now a fixed-
 * length hash: the file name is the key's SHA-256 hex (64 bytes), in a
 * two-hex-char shard directory. Every component is bounded by
 * construction — 2 (shard) / 64 (name) / 74 (name + ".meta.json") /
 * 86 + pid digits (body temp: name + ".tmp-" + pid + "-" + 16 hex;
 * ≤ 93 at the 7-digit pid ceiling) / 96 + pid digits (metadata temp:
 * name + ".meta.json" + ".tmp-" + pid + "-" + 16 hex; ≤ 103 at the
 * same ceiling) bytes — for
 * keys of ANY length or content (no key byte reaches a path, so keys
 * containing "/" or ".." are equally safe). The hash is collision-
 * resistant and the mapping is injective for every practical purpose;
 * metadata sidecars carry the key's provenance (§5.5 trust rules never
 * read a key back out of a path). (Correction round 3, area 6: the
 * round-2 text's "≤ 99" figure covered only the body temp name and
 * omitted the longer metadata-temp suffix; the bounds stated above
 * are the exact ones — G-dot re-check verdict 2026-10-25.)
 *
 * This ONE mapping serves every local operation — head, get, staging
 * write, promotion (source temps and destination) — with no per-call-
 * site variation. Compatibility policy: there is NO legacy-layout read
 * fallback. The local backend is a test/local seam only (production
 * resolves the R2 binding and fails closed without it), so artifacts
 * written under the pre-round-2 layout in a local directory are simply
 * not carried over.
 */
function localFilePathForKey(key: string): string {
  const hash = createHash("sha256").update(key, "utf8").digest("hex");
  return path.join(localArchiveDir(), hash.slice(0, 2), hash);
}

function localMetaPathForKey(key: string): string {
  return `${localFilePathForKey(key)}.meta.json`;
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
    const raw = await fs.readFile(localMetaPathForKey(key), "utf8");
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
    const raw = await fs.readFile(localMetaPathForKey(key), "utf8");
    metadata = artifactMetadataFromCustom(JSON.parse(raw) as Record<string, string>);
  } catch {
    metadata = null;
  }
  return { bytes, metadata };
}

/** The streaming-observation read window (correction round 3 — Codex
 * P2-1): an observed body is hashed in chunks of at most this size,
 * so the finalize observation never holds more than one window of
 * the body beyond the digest state. The W-2 manifest charges the
 * observation this window. */
export const ARCHIVE_OBSERVE_CHUNK_BYTES = 64 * 1024;

export type ArtifactObservation = {
  metadata: ArtifactObjectMetadata | null;
  /** SHA-256 hex of the body, computed incrementally. */
  bodyDigest: string;
};

async function hashWebBodyStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const hash = createHash("sha256");
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) hash.update(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  return hash.digest("hex");
}

/**
 * Observe an artifact object for finalization (§5.8): presence,
 * trusted-shape metadata, and the SHA-256 of the body — computed by
 * STREAMING the body, never materialising it (correction round 3 —
 * Codex P2-1, sustained by the G-dot re-check verdict 2026-10-25:
 * the finalize observation previously read the whole object via
 * getArtifactObject while the counted body was still referenced,
 * holding a second full body on a path the area-8 harness never
 * measured). Returns null only for a genuine not-found; storage
 * errors and mid-stream read errors THROW (errors are never
 * absence, §5.5). Exported with an explicit bucket so tests can
 * drive a faithful fake.
 */
export async function observeArtifactObjectWithBucket(
  bucket: R2Bucket,
  key: string,
): Promise<ArtifactObservation | null> {
  const object = await bucket.get(key);
  if (!object) return null;
  const metadata = artifactMetadataFromCustom(object.customMetadata);
  let bodyDigest: string;
  if (object.body) {
    bodyDigest = await hashWebBodyStream(object.body as ReadableStream<Uint8Array>);
  } else {
    // A runtime that offers no body stream: fall back to the
    // buffered read for this object only (the digest must be over
    // the real bytes; correctness never depends on which of the
    // two reads a runtime offers).
    bodyDigest = createHash("sha256").update(new Uint8Array(await object.arrayBuffer())).digest("hex");
  }
  return { metadata, bodyDigest };
}

/** Observe through the binding (or the local seam) — the semantics
 * are observeArtifactObjectWithBucket's; the local backend streams
 * the file in ARCHIVE_OBSERVE_CHUNK_BYTES windows and treats only
 * ENOENT as absence. */
export async function observeArtifactObject(key: string): Promise<ArtifactObservation | null> {
  const bucket = await getDownloadArchiveR2Bucket();
  if (bucket) return observeArtifactObjectWithBucket(bucket, key);
  if (!isLocalAuthorityFallbackAllowed()) {
    throw new Error("archive_storage_unavailable");
  }
  const filePath = localFilePathForKey(key);
  const hash = createHash("sha256");
  try {
    const stream = createReadStream(filePath, { highWaterMark: ARCHIVE_OBSERVE_CHUNK_BYTES });
    for await (const chunk of stream) {
      hash.update(chunk as Buffer);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw err;
  }
  let metadata: ArtifactObjectMetadata | null = null;
  try {
    const raw = await fs.readFile(localMetaPathForKey(key), "utf8");
    metadata = artifactMetadataFromCustom(JSON.parse(raw) as Record<string, string>);
  } catch {
    metadata = null;
  }
  return { metadata, bodyDigest: hash.digest("hex") };
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
  const filePath = localFilePathForKey(key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, bytes);
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

/** Local exclusive-create promotion (test/local only, fenced as above).
 * Publication guarantees, stated exactly (conformance fix rounds, area
 * 6 — G-dot verdict + re-check verdict 2026-10-24): the BODY is atomic —
 * written to a unique temp file in the same directory and LINKED into
 * the final path, so the final file is never observable empty or
 * partial; it appears complete, or not at all. link(2) fails with
 * EEXIST when the key is taken, preserving the create-only semantics
 * exactly (no overwrite, ever). The metadata sidecar is staged in its
 * own temp file and renamed into place immediately after the body
 * link. Body and metadata are NOT published atomically as a pair: if
 * the metadata rename fails, the body stands published without its
 * sidecar and the outcome is "error". Temp debris is removed on every
 * settled path, INCLUDING the metadata-rename failure (the round-1
 * code removed only the body temp there and leaked the meta temp);
 * a cleanup failure or process termination can still leave debris —
 * no path claims otherwise. */
export async function promoteCreateOnlyLocal(
  key: string,
  bytes: Uint8Array,
  metadata: ArtifactObjectMetadata,
): Promise<PromotionOutcome> {
  const filePath = localFilePathForKey(key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const unique = `${process.pid}-${randomBytes(8).toString("hex")}`;
  const bodyTmp = `${filePath}.tmp-${unique}`;
  const metaTmp = `${filePath}.meta.json.tmp-${unique}`;
  const cleanup = async () => {
    await fs.rm(bodyTmp, { force: true }).catch(() => undefined);
    await fs.rm(metaTmp, { force: true }).catch(() => undefined);
  };
  try {
    await fs.writeFile(bodyTmp, bytes, { flag: "wx" });
    await fs.writeFile(metaTmp, JSON.stringify(metadata), { flag: "wx" });
  } catch (err) {
    await cleanup();
    return { outcome: "error", error: err };
  }
  try {
    await fs.link(bodyTmp, filePath);
  } catch (err) {
    await cleanup();
    if ((err as NodeJS.ErrnoException)?.code === "EEXIST") return { outcome: "existed" };
    return { outcome: "error", error: err };
  }
  // The body is now visible, complete. Publish the metadata sidecar
  // beside it; the linked temp body is debris from here. A rename
  // failure runs the SAME cleanup as every other failure path — the
  // meta temp must not survive it (re-check verdict, area 6).
  try {
    await fs.rename(metaTmp, `${filePath}.meta.json`);
  } catch (err) {
    await cleanup();
    return { outcome: "error", error: err };
  }
  await fs.rm(bodyTmp, { force: true }).catch(() => undefined);
  return { outcome: "created" };
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
