/**
 * mapId.ts + aspectRatio.ts — validation and export-dimension contracts.
 *
 * Regression targets:
 * - isValidMapId / parseMapIdParam accept RFC-4122 UUID versions 1–8 only
 * - getExportDimensions derives height from the design aspect (never a
 *   square viewBox assumption) and clamps height to at least 1
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const { isValidMapId, parseMapIdParam } = await import("../../src/lib/mapId.ts");
const { aspectRatioToNumber, getExportDimensions } = await import(
  "../../src/lib/aspectRatio.ts"
);

test("isValidMapId accepts RFC-4122 UUIDs (versions 1–8) and rejects near-misses", () => {
  assert.equal(isValidMapId("550e8400-e29b-41d4-a716-446655440000"), true);
  assert.equal(isValidMapId("550e8400-e29b-81d4-a716-446655440000"), true); // version 8
  assert.equal(isValidMapId(" 550e8400-e29b-41d4-a716-446655440000 "), true);
  assert.equal(isValidMapId("550e8400-e29b-91d4-a716-446655440000"), false); // version 9
  assert.equal(isValidMapId("550e8400-e29b-41d4-c716-446655440000"), false); // bad variant
  assert.equal(isValidMapId("not-a-uuid"), false);
  assert.equal(isValidMapId(null), false);
  assert.equal(isValidMapId(42), false);
});

test("parseMapIdParam trims and returns null for invalid input", () => {
  assert.equal(
    parseMapIdParam("550e8400-e29b-41d4-a716-446655440000"),
    "550e8400-e29b-41d4-a716-446655440000",
  );
  assert.equal(parseMapIdParam(" 550e8400-e29b-41d4-a716-446655440000 "), "550e8400-e29b-41d4-a716-446655440000");
  assert.equal(parseMapIdParam(""), null);
  assert.equal(parseMapIdParam(null), null);
  assert.equal(parseMapIdParam("abc"), null);
});

test("aspectRatioToNumber and getExportDimensions keep canvas aspect = design aspect", () => {
  assert.equal(aspectRatioToNumber("square"), 1);
  assert.equal(aspectRatioToNumber("3:4"), 0.75);
  assert.equal(aspectRatioToNumber("2:3"), 2 / 3);
  assert.equal(aspectRatioToNumber("4:5"), 0.8);

  assert.deepEqual(getExportDimensions(1000, "square"), { width: 1000, height: 1000 });
  assert.deepEqual(getExportDimensions(1000, "3:4"), { width: 1000, height: 1333 });
  assert.deepEqual(getExportDimensions(1000, "2:3"), { width: 1000, height: 1500 });
  assert.deepEqual(getExportDimensions(1000, "4:5"), { width: 1000, height: 1250 });
  // Tiny width still yields height ≥ 1
  assert.deepEqual(getExportDimensions(1, "2:3"), { width: 1, height: 2 });
});
