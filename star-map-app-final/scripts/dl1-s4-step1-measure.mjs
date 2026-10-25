/** DL-1 S4 §7 step 1 — server-peak acceptance run (amendment v3.3, W-2.2).
 * Declared BEFORE the original run (program record
 * dl1-s4-step1-declarations-2026-10-24.md): decoder node:zlib
 * createInflate; D = 40,960; ARCHIVE_MAX_BYTES = 67,108,864;
 * W = 134,242,753; H = 33,554,432. Acceptance: P <= B + W + D + H.
 *
 * FIX ROUND (conformance area 8 — G-dot verdict 2026-10-24): the
 * original harness measured a DIRECT validatePngBytes call on a
 * preloaded fixture, which is not the serving pipeline. This harness
 * now measures the counted-read serving pipeline exactly as the route
 * runs it (§5.10 steps 1–4): the fixture is streamed in chunks through
 * readCountedBody (the counted read the route performs on req.body),
 * then validatePngBytes over the counted body. W is re-declared for
 * the post-fix pipeline: counted body buffer (≤ ARCHIVE_MAX_BYTES) +
 * one row buffer + fixed SHA-256 state — the IDAT term is ZERO because
 * the pipeline consumes IDAT as views into the body and never copies
 * or concatenates it (pngValidation.ts, area 8 fix). D and H are the
 * unchanged declared constants.
 * Usage: node --expose-gc scripts/dl1-s4-step1-measure.mjs <png-path> */
import { register } from "node:module";
import { readFileSync } from "node:fs";

register("./unit/tsAliasLoader.mjs", import.meta.url);

const { readCountedBody, validatePngBytes, ARCHIVE_MAX_BYTES } = await import("../src/lib/pngValidation.ts");

const file = process.argv[2];
const fixture = readFileSync(file);

// Baseline B: modules loaded, pipeline NOT exercised.
if (global.gc) global.gc();
const B = process.resourceUsage().maxRSS * 1024;

// The counted-read serving pipeline: chunk the fixture like a request
// body stream (64 KiB chunks), count it through readCountedBody under
// the production cap, then validate the counted body.
async function* chunkStream(bytes, chunkSize = 64 * 1024) {
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    yield bytes.subarray(offset, offset + chunkSize);
  }
}

const t0 = process.cpuUsage();
const wall0 = Date.now();
const counted = await readCountedBody(chunkStream(fixture), ARCHIVE_MAX_BYTES);
if (!counted.ok) {
  console.log(JSON.stringify({ file, countedReadOk: false, reason: counted.reason }, null, 2));
  process.exit(1);
}
const result = await validatePngBytes(counted.bytes, { expectedWidth: 6000, expectedHeight: 9000 });
const wallMs = Date.now() - wall0;
const cpu = process.cpuUsage(t0);
const P = process.resourceUsage().maxRSS * 1024;

const W = ARCHIVE_MAX_BYTES + (1 + 6000 * 4) + 1024;
const D = 40960;
const H = 33554432;
console.log(JSON.stringify({
  file,
  fileBytes: fixture.length,
  pipeline: "counted-read serving pipeline (readCountedBody -> validatePngBytes)",
  archiveMaxBytes: ARCHIVE_MAX_BYTES,
  countedBytes: counted.bytes.length,
  validationOk: result.ok,
  digest: result.ok ? result.digest : null,
  reason: result.ok ? null : result.reason,
  B, P, W, D, H,
  bound: B + W + D + H,
  acceptance: P <= B + W + D + H,
  incremental: P - B,
  wallMs,
  cpuUserMs: Math.round(cpu.user / 1000),
  cpuSystemMs: Math.round(cpu.system / 1000),
}, null, 2));
