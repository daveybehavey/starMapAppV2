#!/usr/bin/env node

// Only storefront room photography. Keep originals for unchanged consumers and
// prove that modern-format copies preserve every decoded pixel (no resampling).
import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const assets = [
  "gallery-living-room-framed",
  "gallery-star-poster",
  "offer-framed-print",
];

for (const name of assets) {
  const original = fileURLToPath(new URL(`../public/home-mockups/${name}.png`, import.meta.url));
  const optimized = original.replace(/\.png$/, ".webp");
  if (process.argv.includes("--write")) {
    await sharp(original).webp({ lossless: true, effort: 6 }).toFile(optimized);
  }
  const before = await sharp(original).raw().toBuffer({ resolveWithObject: true });
  const after = await sharp(optimized).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual(after.info, before.info, `${name}: dimensions/channels changed`);
  assert.ok(after.data.equals(before.data), `${name}: decoded pixels changed`);
  const beforeBytes = (await stat(original)).size;
  const afterBytes = (await stat(optimized)).size;
  assert.ok(afterBytes < beforeBytes, `${name}: no byte saving`);
  console.log(`${name}: ${beforeBytes} -> ${afterBytes} bytes; ${before.info.width}x${before.info.height}; identical pixels`);
}
