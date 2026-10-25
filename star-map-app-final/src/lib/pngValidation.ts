/**
 * DL-1 Slice 4 — upload validation pipeline (brief v3 §5.10, as corrected
 * by amendment v3.3 clause W-2).
 *
 * Exact order for any request carrying bytes:
 *   1. counted read (the route aborts the moment the count exceeds
 *      ARCHIVE_MAX_BYTES — see `readCountedBody`);
 *   2. chunk-structure validation on the bounded in-memory body (PNG
 *      signature; chunk walk with per-chunk CRC; IHDR first; dimensions
 *      exactly the binding-derived expected values; bit depth 8; interlace
 *      0; color type in the pinned set; IDAT present and consecutive;
 *      IEND present; no trailing bytes after IEND);
 *   3. compressed-data validation: the IDAT payloads — held only as
 *      views into the counted body — are FULLY inflated through a
 *      streaming decoder that verifies stream integrity by construction
 *      (zlib header + Adler-32 checked by the inflater), asserts the
 *      inflated length is EXACTLY height × (1 + width × bytesPerPixel),
 *      and asserts every row's filter byte ∈ {0,1,2,3,4} — discarding
 *      pixel rows as they decode;
 *   4. SHA-256 over the validated bytes → the intent digest.
 * Only after all four steps may the caller write staging, register an
 * intent, promote, or finalize (§5.10 step 5). Invalid bytes never exist
 * in storage in any form.
 *
 * Resource bound (W-2, as restructured by conformance fix round 2,
 * area 8, and corrected by correction round 3 — G-dot re-check
 * verdicts 2026-10-24 and 2026-10-25): the pipeline's incremental
 * working set W is ONE counted body buffer (≤ ARCHIVE_MAX_BYTES: the
 * counted read assembles into a single preallocated buffer and never
 * retains chunk copies or a second concatenated body — the round-1
 * reader retained every chunk copy AND the concatenated buffer, a
 * ~two-body peak) + bounded IDAT feeder bookkeeping + one row buffer
 * (≤ 1 + 6000×4 bytes) + fixed SHA-256 state. No presented-chunk term
 * is charged: a presented chunk is the request's own residency (the
 * acceptance baseline B is measured with the body already resident),
 * it is consumed slice-by-slice before the next is pulled, and it is
 * never retained — the round-2 manifest's 1 MiB window allowance was
 * neither enforced nor evidenced and is removed (round-3 manifest).
 * The IDAT payload adds no payload term: no span list is retained —
 * the inflater is fed by a second structural walk over the counted
 * body, one live span view at a time; queued writes reference views
 * into the body and copy nothing. The decoder is node:zlib
 * `createInflate`; beyond the format's fixed 32 KiB history window
 * its output side carries a streaming transient that scales with the
 * pinned output chunk size (PNG_INFLATE_CHUNK_BYTES) — the round-3
 * diagnosis measured it and the corrected decoder allowance D is
 * derived from that pin. W, D, H and the measured acceptance
 * P ≤ B + W + D + H are recorded in the round-3 measurement manifest
 * (program record dl1-s4-r3-measurement-manifest-2026-10-25.md). The
 * inflater never accumulates decoded output: rows are discarded as
 * they decode, and the decoder aborts the byte the expected inflated
 * length is exceeded.
 */
import { createHash } from "node:crypto";
import { createInflate } from "node:zlib";

/** Hard body bound for archive uploads (§5.10 step 1; set by §7 step 1
 * measurement — the inherited 20 MiB was not a decision and does not
 * survive this slice). */
export const ARCHIVE_MAX_BYTES = 64 * 1024 * 1024;

/**
 * Pinned PNG feature set (§5.10): browser-canvas encoder output
 * (`canvasToPngBlob`). Step-1 evidence pins { (colorType 6, bitDepth 8) }
 * (RGBA) — extended only by step-1 evidence, with the bytes-per-pixel
 * table extended in the same edit. Anything outside is rejected.
 */
export const PINNED_PNG_FEATURE_SET: ReadonlyArray<{ colorType: number; bitDepth: number }> = [
  { colorType: 6, bitDepth: 8 },
];

const BYTES_PER_PIXEL: Readonly<Record<number, number>> = {
  6: 4, // RGBA, bit depth 8
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/* ------------------------------- CRC-32 ---------------------------------- */

const CRC_TABLE: Int32Array = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

/** PNG CRC-32 (IEEE, over chunk type + data). Exported for test vectors. */
export function pngCrc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/* ---------------------------- counted body read --------------------------- */

export type CountedBodyResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: "too_large" | "read_failed" };

/**
 * §5.10 step 1 — counted read: read the body counting bytes and abort the
 * moment the count exceeds `maxBytes` (→ 413 at the route). A
 * client-supplied Content-Length is never trusted; unknown-length bodies
 * are the normal case. Accepts a web ReadableStream (the route's
 * `req.body`), an async iterable, or a byte array (tests).
 */
/** Slice size for copying a presented chunk into the assembly buffer. */
export const COUNTED_READ_SLICE_BYTES = 64 * 1024;

export async function readCountedBody(
  source: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | Uint8Array,
  maxBytes: number,
): Promise<CountedBodyResult> {
  if (source instanceof Uint8Array) {
    return source.length > maxBytes
      ? { ok: false, reason: "too_large" }
      : { ok: true, bytes: source };
  }
  // Single-assembly counted read (conformance fix round 2, area 8):
  // exactly ONE body-sized allocation — a preallocated assembly buffer
  // bounded by maxBytes — into which each presented chunk is copied in
  // bounded slices. Presented chunks are never retained (the round-1
  // reader kept a copy of every chunk AND the final concatenated
  // buffer, peaking at ~two bodies plus per-chunk slack; the re-check
  // verdict named exactly that). An overflowing chunk is refused
  // BEFORE any of it is copied, and the source is not drained further
  // (the ReadableStream path cancels the reader, the iterable path
  // stops pulling).
  let assembly: Buffer | null = null;
  let total = 0;
  // The assembly is only ever assigned through this accessor: flow
  // analysis cannot narrow a variable assigned inside a closure at
  // outer-scope read sites (it collapses to never), so every read
  // goes through the accessor's Buffer return type.
  const assemblyOrAlloc = (): Buffer => {
    if (!assembly) assembly = Buffer.allocUnsafe(maxBytes);
    return assembly;
  };
  const append = (chunk: Uint8Array): boolean => {
    if (chunk.length === 0) return true;
    if (total + chunk.length > maxBytes) return false;
    const target = assemblyOrAlloc();
    let offset = 0;
    while (offset < chunk.length) {
      const n = Math.min(chunk.length - offset, COUNTED_READ_SLICE_BYTES);
      target.set(chunk.subarray(offset, offset + n), total);
      total += n;
      offset += n;
    }
    return true;
  };
  try {
    const iterable = source as AsyncIterable<Uint8Array>;
    if (typeof iterable[Symbol.asyncIterator] === "function") {
      for await (const chunk of iterable) {
        if (!append(chunk)) return { ok: false, reason: "too_large" };
      }
    } else {
      const reader = (source as ReadableStream<Uint8Array>).getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && !append(value)) {
            await reader.cancel().catch(() => undefined);
            return { ok: false, reason: "too_large" };
          }
        }
      } finally {
        reader.releaseLock?.();
      }
    }
  } catch {
    return { ok: false, reason: "read_failed" };
  }
  // total === 0 exactly when no non-empty chunk was ever appended,
  // i.e. the assembly was never allocated.
  if (total === 0) return { ok: true, bytes: Buffer.alloc(0) };
  return { ok: true, bytes: assemblyOrAlloc().subarray(0, total) };
}

/* --------------------------- chunk structure ------------------------------ */

type PngStructure = {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  /** IDAT accounting ONLY — chunk count and total payload bytes.
   * No span list is retained (conformance fix round 2, area 8: the
   * round-1 pipeline kept a view object per IDAT chunk, O(chunks)
   * bookkeeping the re-check verdict named as unbounded for the
   * many-empty-IDAT shape). The inflater is fed by a second
   * structural walk over the counted body (see `idatSpanWalk`),
   * and its totals must reproduce these exactly. */
  idatChunkCount: number;
  idatTotalBytes: number;
};

/**
 * The critical chunk types this pipeline admits (correction round 3 —
 * Codex P2-2 on the round-2 head, sustained by the G-dot re-check
 * verdict 2026-10-25): the PNG standard's core set. A chunk type is
 * CRITICAL when its first byte is an uppercase ASCII letter (the PNG
 * specification's critical bit). An unknown critical chunk is fatal
 * to decoders: the step-1 reproduction showed a CRC-valid unknown
 * critical chunk ("ABCD") passing this validation while a real
 * decoder (Sharp) rejects the file, so an artifact carrying one could
 * be permanently finalized yet undecodable. Such chunks are therefore
 * refused here, before anything is staged. Ancillary chunks
 * (lowercase first byte) pass through untouched, exactly as before;
 * PLTE is admitted as a standard critical type decoders handle (a
 * palette image still fails the pinned feature set in
 * `validatePngBytes`) — but its payload is shape-checked below
 * (`bad_plte`): admission without validation let a CRC-valid PLTE
 * with a malformed payload (e.g. one byte) pass while Sharp rejects
 * the file ("invalid chunk length"), the same finalize-an-
 * undecodable-artifact defect class as the unknown-critical case.
 */
const SUPPORTED_CRITICAL_CHUNK_TYPES = new Set(["IHDR", "PLTE", "IDAT", "IEND"]);

function isUnsupportedCriticalChunk(type: string): boolean {
  const firstByte = type.charCodeAt(0);
  const critical = firstByte >= 0x41 && firstByte <= 0x5a; // 'A'..'Z'
  return critical && !SUPPORTED_CRITICAL_CHUNK_TYPES.has(type);
}

function parsePngStructure(bytes: Uint8Array): PngStructure | { error: string } {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buf.length < PNG_SIGNATURE.length || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { error: "bad_signature" };
  }
  let offset = 8;
  let ihdr: Omit<PngStructure, "idatChunkCount" | "idatTotalBytes"> | null = null;
  let idatChunkCount = 0;
  let idatTotalBytes = 0;
  let idatRunEnded = false;
  let sawPlte = false;
  let sawIend = false;
  let first = true;
  while (offset < buf.length) {
    if (offset + 8 > buf.length) return { error: "truncated_chunk" };
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buf.length) return { error: "truncated_chunk" };
    const storedCrc = buf.readUInt32BE(dataEnd);
    const computedCrc = pngCrc32(buf.subarray(offset + 4, dataEnd));
    if (storedCrc !== computedCrc) return { error: "bad_crc" };
    const data = buf.subarray(dataStart, dataEnd);
    if (first && type !== "IHDR") return { error: "ihdr_not_first" };
    first = false;
    // IDAT consecutiveness (Codex P2 on the correction-round-3
    // head): the PNG specification requires IDAT chunks to appear
    // consecutively — the image data is one zlib stream carried by
    // a single uninterrupted run of IDAT chunks. Real decoders
    // (libspng, hence Sharp) reject a file whose IDAT run is
    // broken by another chunk ("pngload_buffer: libspng read
    // error"), while this walk — counting every IDAT payload,
    // with the inflate pass concatenating them in file order —
    // would accept it, so an undecodable artifact could be
    // permanently finalized and corrected bytes would then
    // conflict with the finalized digest. Once any non-IDAT chunk
    // follows the first IDAT, the run has ended; a further IDAT
    // is refused here, before anything is staged.
    if (type !== "IDAT" && idatChunkCount > 0) idatRunEnded = true;
    if (type === "IHDR") {
      if (ihdr) return { error: "duplicate_ihdr" };
      if (length !== 13) return { error: "bad_ihdr" };
      const width = data.readUInt32BE(0);
      const height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      const compression = data[10];
      const filter = data[11];
      const interlace = data[12];
      if (width === 0 || height === 0) return { error: "bad_dimensions" };
      if (compression !== 0 || filter !== 0) return { error: "bad_ihdr_methods" };
      if (interlace !== 0) return { error: "interlace_not_supported" };
      ihdr = { width, height, bitDepth, colorType };
    } else if (type === "PLTE") {
      // PLTE payload shape, per the PNG specification (Codex P2 on
      // the correction-round-3 head): the payload is a palette of
      // RGB triples — 1 to 256 entries, so its length is a multiple
      // of 3 between 3 and 768 bytes; at most one PLTE chunk may
      // appear, and it must precede the first IDAT. Presence rules
      // by colour type: required for palette images (3), optional
      // (a suggested palette) for truecolour (2) and RGBA (6),
      // forbidden for greyscale (0) and greyscale+alpha (4); for
      // palette images the entry count must not exceed 2^bitDepth.
      // IHDR is always the first chunk (enforced above), so its
      // colour type and bit depth are known here.
      if (sawPlte || idatChunkCount > 0) return { error: "bad_plte" };
      if (length < 3 || length > 768 || length % 3 !== 0) return { error: "bad_plte" };
      if (ihdr && (ihdr.colorType === 0 || ihdr.colorType === 4)) {
        return { error: "bad_plte" };
      }
      if (ihdr && ihdr.colorType === 3 && length / 3 > 2 ** ihdr.bitDepth) {
        return { error: "bad_plte" };
      }
      sawPlte = true;
    } else if (type === "IDAT") {
      if (idatRunEnded) return { error: "nonconsecutive_idat" };
      idatChunkCount++;
      idatTotalBytes += length;
    } else if (isUnsupportedCriticalChunk(type)) {
      return { error: "unsupported_critical_chunk" };
    } else if (type === "IEND") {
      sawIend = true;
      offset = dataEnd + 4;
      if (offset !== buf.length) return { error: "trailing_bytes_after_iend" };
      break;
    }
    offset = dataEnd + 4;
  }
  if (!ihdr) return { error: "missing_ihdr" };
  if (idatChunkCount === 0) return { error: "missing_idat" };
  if (!sawIend) return { error: "missing_iend" };
  // A palette image (colour type 3) without PLTE is incomplete per
  // the specification (PLTE is required there); reject it here
  // rather than letting it surface as a feature-set mismatch.
  if (ihdr.colorType === 3 && !sawPlte) return { error: "bad_plte" };
  return { ...ihdr, idatChunkCount, idatTotalBytes };
}

/* ------------------------- streaming inflate check ------------------------ */

/**
 * The bounded IDAT feeder bound (conformance fix round 2, area 8;
 * restructured in correction round 3): at most this many inflater
 * writes are un-drained at any moment — the feeder writes bounded
 * slices and waits for the stream to drain before writing more, so
 * queued input is O(1) regardless of IDAT segmentation. The W-2
 * working-set manifest charges the feeder a fixed bookkeeping
 * allowance derived from this constant and
 * PNG_INFLATE_FEED_SLICE_BYTES.
 */
export const PNG_INFLATE_MAX_OUTSTANDING_WRITES = 1;

/** The inflater's output chunk size, pinned (correction round 3,
 * area 8). The round-2 re-check diagnosis (program record
 * dl1-s4-r3-measurement-manifest-2026-10-25.md) attributed the
 * area-8 peak excess to the decoder's output-side transient on the
 * pinned maximum inflated workload: with flowing consumption the
 * zlib output pipeline runs ahead of the consumer and its residency
 * scales with the output chunk size (~48 MB at the default 16 KiB
 * with the round-2 pump; ~59 MB measured end-to-end). Consumption is
 * now pull-based (async iteration) at this pinned 8 KiB chunk size,
 * which measured a ~17 MB transient across repeated diagnostic runs
 * at the maximum workload. The decoder allowance D in the manifest
 * is derived from this pin. */
export const PNG_INFLATE_CHUNK_BYTES = 8192;

/** The feeder's input slice bound (correction round 3, area 8):
 * IDAT spans are written to the inflater in slices of at most this
 * many bytes — views into the counted body, copying nothing — with
 * at most PNG_INFLATE_MAX_OUTSTANDING_WRITES un-drained at a time. */
export const PNG_INFLATE_FEED_SLICE_BYTES = 16 * 1024;

/**
 * Second structural walk over the counted body, yielding each
 * non-empty IDAT payload as a live view, one at a time (fix round 2,
 * area 8: replaces the retained span list — O(1) state instead of
 * O(chunks)). CRCs are not re-verified here; pass 1
 * (`parsePngStructure`) already validated every chunk. The walk's
 * IDAT accounting is accumulated into `stats` and must reproduce
 * pass 1's totals exactly.
 */
async function* idatSpanWalk(
  buf: Buffer,
  stats: { chunks: number; totalBytes: number },
): AsyncGenerator<Buffer> {
  let offset = 8;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buf.length) return; // unreachable post-validation
    if (type === "IDAT") {
      stats.chunks++;
      stats.totalBytes += length;
      if (length > 0) yield buf.subarray(dataStart, dataEnd);
    }
    if (type === "IEND") return;
    offset = dataEnd + 4;
  }
}

/**
 * §5.10 step 3 — fully inflate the zlib stream, discarding rows as they
 * decode. Asserts the exact inflated length and every row's filter byte.
 * The inflater verifies stream integrity by construction (zlib header +
 * Adler-32); a stream that inflates short, long, corrupt, or with an
 * illegal filter byte is rejected.
 *
 * Feeding is bounded (fix round 2, area 8; consumption restructured in
 * correction round 3): spans are produced by `idatSpanWalk` one at a
 * time and written in slices of at most PNG_INFLATE_FEED_SLICE_BYTES
 * with at most PNG_INFLATE_MAX_OUTSTANDING_WRITES un-drained write at
 * any moment. Decoded output is PULLED by the consumer (async
 * iteration over an inflater created with the pinned
 * PNG_INFLATE_CHUNK_BYTES) instead of pushed by a flowing 'data'
 * handler — the round-3 diagnosis showed the flowing pipeline's
 * output-side transient, not any retained allocation, was the area-8
 * peak excess (see PNG_INFLATE_CHUNK_BYTES). Rows are discarded as
 * they decode and the decoder aborts the byte the expected inflated
 * length is exceeded. Observable verdicts are unchanged from the
 * pump: exact-length equality, filter-byte legality, stream errors,
 * and post-stream IDAT bytes tolerated exactly as before (the feeder
 * writes every span; the zlib stream's own end decides the output).
 */
function validateInflatedData(
  buf: Buffer,
  expectedIdat: { chunks: number; totalBytes: number },
  expectedInflatedLength: number,
  rowLength: number,
): Promise<boolean> {
  const inflater = createInflate({ chunkSize: PNG_INFLATE_CHUNK_BYTES });
  let settled = false;
  let settle!: (value: boolean) => void;
  const done = new Promise<boolean>((resolve) => {
    settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
  });
  // Consumer: pull the decoded stream. Exiting the iteration early
  // (overlong output, illegal filter byte) destroys the inflater via
  // the finally below; a stream error rejects the iteration and is
  // mapped to the same invalid verdict the pump's error path gave.
  void (async () => {
    let leftover: Buffer = Buffer.alloc(0);
    let total = 0;
    try {
      for await (const chunk of inflater) {
        const data = chunk as Buffer;
        total += data.length;
        if (total > expectedInflatedLength) {
          settle(false);
          return;
        }
        leftover = leftover.length === 0 ? data : Buffer.concat([leftover, data]);
        while (leftover.length >= rowLength) {
          const filterByte = leftover[0];
          if (filterByte > 4) {
            settle(false);
            return;
          }
          leftover = leftover.subarray(rowLength);
        }
      }
      settle(total === expectedInflatedLength && leftover.length === 0);
    } catch {
      settle(false);
    } finally {
      inflater.destroy();
    }
  })();
  // Feeder: a drain wait also wakes when the consumer settles, so the
  // feeder can never deadlock against a stream the consumer has
  // already finished or destroyed (an errored stream may never drain).
  void (async () => {
    const stats = { chunks: 0, totalBytes: 0 };
    try {
      for await (const span of idatSpanWalk(buf, stats)) {
        let offset = 0;
        while (offset < span.length) {
          if (settled) return;
          const slice = span.subarray(offset, offset + PNG_INFLATE_FEED_SLICE_BYTES);
          offset += slice.length;
          let accepted: boolean;
          try {
            accepted = inflater.write(slice);
          } catch {
            return; // destroyed/ended stream: the consumer settles the verdict
          }
          if (!accepted && !settled) {
            await Promise.race([
              new Promise<void>((wake) => {
                inflater.once("drain", wake);
              }),
              done.then(() => undefined),
            ]);
          }
        }
      }
      // The feeder must reproduce pass 1's IDAT accounting exactly.
      // The body is an immutable counted buffer, so a mismatch is a
      // hard structural failure, never a data race.
      if (stats.chunks !== expectedIdat.chunks || stats.totalBytes !== expectedIdat.totalBytes) {
        inflater.destroy();
        settle(false);
        return;
      }
      if (!settled) inflater.end();
    } catch {
      inflater.destroy();
      settle(false);
    }
  })();
  return done;
}

/* ------------------------------ the pipeline ------------------------------ */

export type PngValidationResult =
  | {
      ok: true;
      digest: string;
      width: number;
      height: number;
      colorType: number;
      bitDepth: number;
    }
  | { ok: false; reason: string };

/**
 * §5.10 steps 2–4 over an already-counted body. `expectedWidth` /
 * `expectedHeight` are the intent's binding-derived dimensions (§5.1);
 * the PNG must match them EXACTLY.
 */
export async function validatePngBytes(
  bytes: Uint8Array,
  expected: { expectedWidth: number; expectedHeight: number },
): Promise<PngValidationResult> {
  const structure = parsePngStructure(bytes);
  if ("error" in structure) return { ok: false, reason: structure.error };
  if (structure.width !== expected.expectedWidth || structure.height !== expected.expectedHeight) {
    return { ok: false, reason: "dimension_mismatch" };
  }
  const pinned = PINNED_PNG_FEATURE_SET.some(
    (f) => f.colorType === structure.colorType && f.bitDepth === structure.bitDepth,
  );
  if (!pinned) return { ok: false, reason: "unpinned_png_feature_set" };
  const bytesPerPixel = BYTES_PER_PIXEL[structure.colorType];
  if (!bytesPerPixel) return { ok: false, reason: "unpinned_png_feature_set" };
  const rowLength = 1 + structure.width * bytesPerPixel;
  const expectedInflatedLength = structure.height * rowLength;
  const inflatedOk = await validateInflatedData(
    Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes),
    { chunks: structure.idatChunkCount, totalBytes: structure.idatTotalBytes },
    expectedInflatedLength,
    rowLength,
  );
  if (!inflatedOk) return { ok: false, reason: "inflated_data_invalid" };
  const digest = createHash("sha256").update(bytes).digest("hex");
  return {
    ok: true,
    digest,
    width: structure.width,
    height: structure.height,
    colorType: structure.colorType,
    bitDepth: structure.bitDepth,
  };
}
