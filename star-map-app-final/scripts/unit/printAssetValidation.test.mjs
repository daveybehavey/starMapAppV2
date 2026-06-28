import assert from "node:assert/strict";
import test from "node:test";
import { parseImageDimensions, validatePrintAssetBytes } from "./printAssetValidation.harness.mjs";

function pngBuffer(width, height) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes[16] = (width >>> 24) & 0xff;
  bytes[17] = (width >>> 16) & 0xff;
  bytes[18] = (width >>> 8) & 0xff;
  bytes[19] = width & 0xff;
  bytes[20] = (height >>> 24) & 0xff;
  bytes[21] = (height >>> 16) & 0xff;
  bytes[22] = (height >>> 8) & 0xff;
  bytes[23] = height & 0xff;
  return bytes;
}

test("parseImageDimensions reads PNG IHDR", () => {
  const dims = parseImageDimensions(pngBuffer(1200, 900));
  assert.deepEqual(dims, { width: 1200, height: 900 });
});

test("validatePrintAssetBytes rejects tiny payloads", () => {
  const tiny = pngBuffer(800, 800);
  const result = validatePrintAssetBytes(tiny, { minBytes: 20_000, minWidth: 800, minHeight: 800 });
  assert.equal(result.ok, false);
  assert.equal(result.code, "print_asset_too_small");
});

test("validatePrintAssetBytes rejects low resolution", () => {
  const bytes = new Uint8Array(25_000);
  bytes.set(pngBuffer(400, 400));
  const result = validatePrintAssetBytes(bytes, { minBytes: 20_000, minWidth: 800, minHeight: 800 });
  assert.equal(result.ok, false);
  assert.equal(result.code, "print_asset_resolution_too_low");
});

test("validatePrintAssetBytes accepts valid PNG header + size", () => {
  const bytes = new Uint8Array(25_000);
  bytes.set(pngBuffer(1200, 1200));
  const result = validatePrintAssetBytes(bytes, { minBytes: 20_000, minWidth: 800, minHeight: 800 });
  assert.equal(result.ok, true);
  assert.equal(result.width, 1200);
  assert.equal(result.height, 1200);
});
