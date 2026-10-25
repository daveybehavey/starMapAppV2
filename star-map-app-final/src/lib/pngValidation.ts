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
 *      0; color type in the pinned set; IDAT present; IEND present; no
 *      trailing bytes after IEND);
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
 * area 8 — G-dot re-check verdict 2026-10-24): the pipeline's
 * incremental working set W is ONE counted body buffer
 * (≤ ARCHIVE_MAX_BYTES: the counted read assembles into a single
 * preallocated buffer and never retains chunk copies or a second
 * concatenated body — the round-1 reader retained every chunk copy
 * AND the concatenated buffer, a ~two-body peak) + a presented-chunk
 * window allowance + bounded IDAT pump bookkeeping + one row buffer
 * (≤ 1 + 6000×4 bytes) + fixed SHA-256 state. The IDAT payload adds no
 * payload term: no span list is retained — the inflater is fed by a
 * second structural walk over the counted body, one live span view at
 * a time, with at most PNG_INFLATE_MAX_OUTSTANDING_WRITES write
 * callbacks outstanding; queued writes reference views into the body
 * and copy nothing. The decoder is node:zlib `createInflate` — a
 * streaming inflate with the format's fixed 32 KiB history window
 * plus fixed internal state; its declared documented workspace D and
 * the measured acceptance P ≤ B + W + D + H are recorded in the
 * round-2 measurement manifest + addendum (program records). The
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
  const append = (chunk: Uint8Array): boolean => {
    if (chunk.length === 0) return true;
    if (total + chunk.length > maxBytes) return false;
    if (!assembly) assembly = Buffer.allocUnsafe(maxBytes);
    let offset = 0;
    while (offset < chunk.length) {
      const n = Math.min(chunk.length - offset, COUNTED_READ_SLICE_BYTES);
      assembly.set(chunk.subarray(offset, offset + n), total);
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
  if (!assembly) return { ok: true, bytes: Buffer.alloc(0) };
  return { ok: true, bytes: assembly.subarray(0, total) };
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

function parsePngStructure(bytes: Uint8Array): PngStructure | { error: string } {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buf.length < PNG_SIGNATURE.length || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { error: "bad_signature" };
  }
  let offset = 8;
  let ihdr: Omit<PngStructure, "idatChunkCount" | "idatTotalBytes"> | null = null;
  let idatChunkCount = 0;
  let idatTotalBytes = 0;
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
    } else if (type === "IDAT") {
      idatChunkCount++;
      idatTotalBytes += length;
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
  return { ...ihdr, idatChunkCount, idatTotalBytes };
}

/* ------------------------- streaming inflate check ------------------------ */

/**
 * The bounded IDAT pump bound (conformance fix round 2, area 8): at
 * most this many inflater write callbacks are outstanding at any
 * moment, so queued writes — views into the counted body, copying
 * nothing — are O(1) in count regardless of IDAT segmentation. The
 * W-2 working-set manifest charges the pump a fixed bookkeeping
 * allowance (per-callback closure + stream bookkeeping) derived from
 * this constant.
 */
export const PNG_INFLATE_MAX_OUTSTANDING_WRITES = 64;

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
 * Feeding is a bounded pump (fix round 2, area 8): spans are produced
 * by `idatSpanWalk` one at a time and written with at most
 * PNG_INFLATE_MAX_OUTSTANDING_WRITES callbacks outstanding — the
 * round-1 loop issued one write per IDAT chunk with no flow control,
 * so inflater-queued work grew with the chunk count. Decoded output
 * is handled as before: rows are discarded as they decode and the
 * decoder aborts the byte the expected inflated length is exceeded.
 */
function validateInflatedData(
  buf: Buffer,
  expectedIdat: { chunks: number; totalBytes: number },
  expectedInflatedLength: number,
  rowLength: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const inflater = createInflate();
    let leftover: Buffer = Buffer.alloc(0);
    let total = 0;
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    // Pump progress signalling: any write callback, error, or close
    // wakes a parked feeder, so the pump can never deadlock waiting
    // for callbacks a failed stream will not deliver (a failed
    // stream's outstanding write callbacks fire with the error).
    let waiters: Array<() => void> = [];
    const noteProgress = () => {
      const pending = waiters;
      waiters = [];
      for (const wake of pending) wake();
    };
    const waitProgress = () =>
      new Promise<void>((wake) => {
        waiters.push(wake);
      });
    inflater.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > expectedInflatedLength) {
        inflater.destroy();
        finish(false);
        return;
      }
      leftover = leftover.length === 0 ? chunk : Buffer.concat([leftover, chunk]);
      while (leftover.length >= rowLength) {
        const filterByte = leftover[0];
        if (filterByte > 4) {
          inflater.destroy();
          finish(false);
          return;
        }
        leftover = leftover.subarray(rowLength);
      }
    });
    inflater.on("error", () => {
      noteProgress();
      finish(false);
    });
    inflater.on("close", () => noteProgress());
    inflater.on("end", () => finish(total === expectedInflatedLength && leftover.length === 0));
    void (async () => {
      const stats = { chunks: 0, totalBytes: 0 };
      let outstanding = 0;
      try {
        for await (const span of idatSpanWalk(buf, stats)) {
          while (!settled && outstanding >= PNG_INFLATE_MAX_OUTSTANDING_WRITES) {
            await waitProgress();
          }
          if (settled) return;
          outstanding++;
          try {
            inflater.write(span, () => {
              outstanding--;
              noteProgress();
            });
          } catch {
            outstanding--;
            finish(false);
            return;
          }
        }
        // The feeder must reproduce pass 1's IDAT accounting exactly.
        // The body is an immutable counted buffer, so a mismatch is a
        // hard structural failure, never a data race.
        if (stats.chunks !== expectedIdat.chunks || stats.totalBytes !== expectedIdat.totalBytes) {
          inflater.destroy();
          finish(false);
          return;
        }
        if (!settled) inflater.end();
      } catch {
        inflater.destroy();
        finish(false);
      }
    })();
  });
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
