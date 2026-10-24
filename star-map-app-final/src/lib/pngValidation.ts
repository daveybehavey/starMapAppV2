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
 *   3. compressed-data validation: the concatenated IDAT payloads are
 *      FULLY inflated through a streaming decoder that verifies stream
 *      integrity by construction (zlib header + Adler-32 checked by the
 *      inflater), asserts the inflated length is EXACTLY
 *      height × (1 + width × bytesPerPixel), and asserts every row's
 *      filter byte ∈ {0,1,2,3,4} — discarding pixel rows as they decode;
 *   4. SHA-256 over the validated bytes → the intent digest.
 * Only after all four steps may the caller write staging, register an
 * intent, promote, or finalize (§5.10 step 5). Invalid bytes never exist
 * in storage in any form.
 *
 * Resource bound (W-2): the pipeline's incremental working set W is the
 * counted body buffer (≤ ARCHIVE_MAX_BYTES) + the concatenated-IDAT buffer
 * (≤ ARCHIVE_MAX_BYTES) + one row buffer (≤ 1 + 6000×4 bytes) + fixed
 * SHA-256 state. The decoder is node:zlib `createInflate` — a streaming
 * inflate with the format's fixed 32 KiB history window plus fixed
 * internal state; its declared documented workspace D and the measured
 * acceptance P ≤ B + W + D + H are recorded at §7 step 1 (see the PR).
 * The inflater never accumulates decoded output: rows are discarded as
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
export async function readCountedBody(
  source: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | Uint8Array,
  maxBytes: number,
): Promise<CountedBodyResult> {
  if (source instanceof Uint8Array) {
    return source.length > maxBytes
      ? { ok: false, reason: "too_large" }
      : { ok: true, bytes: source };
  }
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    const iterable = source as AsyncIterable<Uint8Array>;
    if (typeof iterable[Symbol.asyncIterator] === "function") {
      for await (const chunk of iterable) {
        total += chunk.length;
        if (total > maxBytes) return { ok: false, reason: "too_large" };
        chunks.push(Buffer.from(chunk));
      }
    } else {
      const reader = (source as ReadableStream<Uint8Array>).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.length;
          if (total > maxBytes) {
            await reader.cancel().catch(() => undefined);
            return { ok: false, reason: "too_large" };
          }
          chunks.push(Buffer.from(value));
        }
      }
    }
  } catch {
    return { ok: false, reason: "read_failed" };
  }
  return { ok: true, bytes: Buffer.concat(chunks, total) };
}

/* --------------------------- chunk structure ------------------------------ */

type PngStructure = {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  idatPayloads: Buffer[];
};

function parsePngStructure(bytes: Uint8Array): PngStructure | { error: string } {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buf.length < PNG_SIGNATURE.length || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { error: "bad_signature" };
  }
  let offset = 8;
  let ihdr: PngStructure | null = null;
  const idatPayloads: Buffer[] = [];
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
      ihdr = { width, height, bitDepth, colorType, idatPayloads };
    } else if (type === "IDAT") {
      idatPayloads.push(Buffer.from(data));
    } else if (type === "IEND") {
      sawIend = true;
      offset = dataEnd + 4;
      if (offset !== buf.length) return { error: "trailing_bytes_after_iend" };
      break;
    }
    offset = dataEnd + 4;
  }
  if (!ihdr) return { error: "missing_ihdr" };
  if (idatPayloads.length === 0) return { error: "missing_idat" };
  if (!sawIend) return { error: "missing_iend" };
  ihdr.idatPayloads = idatPayloads;
  return ihdr;
}

/* ------------------------- streaming inflate check ------------------------ */

/**
 * §5.10 step 3 — fully inflate the zlib stream, discarding rows as they
 * decode. Asserts the exact inflated length and every row's filter byte.
 * The inflater verifies stream integrity by construction (zlib header +
 * Adler-32); a stream that inflates short, long, corrupt, or with an
 * illegal filter byte is rejected.
 */
function validateInflatedData(
  idatConcatenated: Buffer,
  expectedInflatedLength: number,
  rowLength: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const inflater = createInflate();
    let leftover = Buffer.alloc(0);
    let total = 0;
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
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
    inflater.on("error", () => finish(false));
    inflater.on("end", () => finish(total === expectedInflatedLength && leftover.length === 0));
    inflater.end(idatConcatenated);
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
  const idatConcatenated = Buffer.concat(structure.idatPayloads);
  const inflatedOk = await validateInflatedData(
    idatConcatenated,
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
