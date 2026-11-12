/**
 * colorUtils.ts — hex/rgb parse + adjust/toRgba contracts.
 *
 * Regression targets:
 * - 3-digit and 6-digit hex parse; non-hex / missing # return null
 * - rgb/rgba parse clamps out-of-range channels; malformed strings return null
 * - toRgba falls back to white when the color cannot be parsed
 * - adjustColor lightens/darkens by fraction-of-255 and clamps to 0..255
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const { adjustColor, parseHexColor, parseRgbColor, toRgba } = await import(
  "../../src/lib/colorUtils.ts"
);

test("parseHexColor: 3-digit expands; 6-digit parses; invalid forms return null", () => {
  assert.deepEqual(parseHexColor("#fff"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseHexColor("  #0a1B2c  "), { r: 10, g: 27, b: 44 });
  assert.equal(parseHexColor("fff"), null);
  assert.equal(parseHexColor("#gg0000"), null);
  assert.equal(parseHexColor("#12345"), null);
  assert.equal(parseHexColor(""), null);
});

test("parseRgbColor: accepts rgb/rgba, clamps channels, rejects malformed input", () => {
  assert.deepEqual(parseRgbColor("rgb(10, 20, 30)"), { r: 10, g: 20, b: 30 });
  assert.deepEqual(parseRgbColor("rgba(300, -4, 12.4, 0.5)"), { r: 255, g: 0, b: 12 });
  assert.equal(parseRgbColor("rgb(1,2)"), null);
  assert.equal(parseRgbColor("not-a-color"), null);
});

test("toRgba: known colors keep channels; unknown colors fall back to white", () => {
  assert.equal(toRgba("#00ff00", 0.4), "rgba(0,255,0,0.4)");
  assert.equal(toRgba("nope", 0.25), "rgba(255,255,255,0.25)");
});

test("adjustColor: positive amount lightens, negative darkens, clamps at edges", () => {
  assert.equal(adjustColor("#808080", 0), "rgb(128,128,128)");
  // Math.round(255 * 0.5) === 128 → white; Math.round(255 * -0.5) === -127
  // (JS half-away-from-zero toward +∞ for .5 negatives), so 128-127 = 1.
  assert.equal(adjustColor("#808080", 0.5), "rgb(255,255,255)");
  assert.equal(adjustColor("#808080", -0.5), "rgb(1,1,1)");
  assert.equal(adjustColor("#000000", -1), "rgb(0,0,0)");
  assert.equal(adjustColor("not-a-color", 0.2), "not-a-color");
});
