/**
 * shapeUtils.getAspectFromViewBox — pure aspect classification (no SVG I/O).
 *
 * Regression targets:
 * - known ratios map to square / 3:4 / 2:3 / 4:5 within epsilon
 * - zero height falls back to square
 * - unknown ratios fall back to square
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const { getAspectFromViewBox } = await import("../../src/lib/shapeUtils.ts");

test("getAspectFromViewBox classifies known ratios and falls back safely", () => {
  assert.equal(getAspectFromViewBox({ width: 100, height: 100 }), "square");
  assert.equal(getAspectFromViewBox({ width: 75, height: 100 }), "3:4");
  assert.equal(getAspectFromViewBox({ width: 66.666, height: 100 }), "2:3");
  assert.equal(getAspectFromViewBox({ width: 80, height: 100 }), "4:5");
  assert.equal(getAspectFromViewBox({ width: 100, height: 0 }), "square");
  assert.equal(getAspectFromViewBox({ width: 16, height: 9 }), "square");
});
