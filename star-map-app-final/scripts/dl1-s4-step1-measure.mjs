/** DL-1 S4 §7 step 1 — server-peak acceptance run (amendment v3.3, W-2.2).
 * Declared BEFORE the run (program record
 * dl1-s4-step1-declarations-2026-10-24.md): decoder node:zlib
 * createInflate; D = 40,960; ARCHIVE_MAX_BYTES = 67,108,864;
 * W = 134,242,753; H = 33,554,432. Acceptance: P <= B + W + D + H.
 * Usage: node --expose-gc scripts/dl1-s4-step1-measure.mjs <png-path> */
import { register } from "node:module";
import { readFileSync } from "node:fs";

register("./unit/tsAliasLoader.mjs", import.meta.url);

const { validatePngBytes, ARCHIVE_MAX_BYTES } = await import("../src/lib/pngValidation.ts");

const file = process.argv[2];
const bytes = readFileSync(file);

// Baseline B: modules loaded, pipeline NOT exercised.
if (global.gc) global.gc();
const B = process.resourceUsage().maxRSS * 1024;

const t0 = process.cpuUsage();
const wall0 = Date.now();
const result = await validatePngBytes(bytes, { expectedWidth: 6000, expectedHeight: 9000 });
const wallMs = Date.now() - wall0;
const cpu = process.cpuUsage(t0);
const P = process.resourceUsage().maxRSS * 1024;

const W = ARCHIVE_MAX_BYTES + ARCHIVE_MAX_BYTES + (1 + 6000 * 4) + 1024;
const D = 40960;
const H = 33554432;
console.log(JSON.stringify({
  file,
  fileBytes: bytes.length,
  archiveMaxBytes: ARCHIVE_MAX_BYTES,
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
