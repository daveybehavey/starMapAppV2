/**
 * S93-2 class 1 — typography proportion vs render resolution.
 *
 * The legibility minima (10px for text boxes, 7.5/8.5/8px for
 * constellation labels) are REFERENCE-canvas minima: they floor the
 * configured size before scaling, so a design renders at the same
 * proportion of the canvas at every render size. The pre-fix code
 * floored the SCALED size — Math.max(10, size * scale) — so at a
 * 300px preview a size-28 box rendered at 10px instead of the
 * proportional 7px (43% oversized relative to the canvas), while a
 * 6000px export rendered it at exactly 140px: preview and print
 * disagreed about the design's proportions.
 *
 * Numeric-identity boundary (the byte-discipline contract): for
 * configured sizes >= 10 at scales >= 1 the new expression is
 * numerically identical to the legacy one, so paid renders at
 * 1200px+ whose floors did not bind are unchanged. Below that
 * boundary the difference IS the fix, and these tests pin both
 * sides of the boundary.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBaseTextFontSizePx } from "../../src/lib/textFit.ts";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "../..");
const read = (rel) => readFileSync(join(appRoot, rel), "utf8");

/** The pre-fix expression, kept here as the negative-control oracle. */
const legacyBaseFontSize = (size, scale) => Math.max(10, (size ?? 28) * scale);

test("size 28 produces base sizes 7 / 28 / 140 at widths 300 / 1200 / 6000", () => {
  // scale = width / 1200 (the renderer's reference canvas width).
  assert.equal(resolveBaseTextFontSizePx(28, 300 / 1200), 7);
  assert.equal(resolveBaseTextFontSizePx(28, 1200 / 1200), 28);
  assert.equal(resolveBaseTextFontSizePx(28, 6000 / 1200), 140);
  // The legacy expression fails the 300px assertion (it answers 10).
  assert.equal(legacyBaseFontSize(28, 300 / 1200), 10);
});

test("the floor no longer binds below the reference size at small scales", () => {
  // Size 10 at width 300: proportional size is 2.5px; the legacy
  // floor inflated it to 10px (4x the designed proportion).
  assert.equal(resolveBaseTextFontSizePx(10, 300 / 1200), 2.5);
  assert.equal(resolveBaseTextFontSizePx(12, 600 / 1200), 6);
  // A configured size below the reference minimum is floored in
  // reference space, then scaled: size 6 renders as 10 * scale.
  assert.equal(resolveBaseTextFontSizePx(6, 300 / 1200), 2.5);
  assert.equal(resolveBaseTextFontSizePx(6, 1200 / 1200), 10);
});

test("numeric identity at and above the boundary (sizes >= 10, scales >= 1)", () => {
  for (const size of [10, 12, 16, 28, 36, 52, 60]) {
    for (const scale of [1, 1.5, 2.5, 5]) {
      assert.equal(
        resolveBaseTextFontSizePx(size, scale),
        legacyBaseFontSize(size, scale),
        `size ${size} at scale ${scale} must be identical to the legacy expression`,
      );
    }
  }
  // The default size (28) is inside the identity region at scale 1.
  assert.equal(resolveBaseTextFontSizePx(undefined, 1), 28);
  assert.equal(resolveBaseTextFontSizePx(undefined, 300 / 1200), 7);
});

test("wiring: drawText resolves its base size through the reference-minimum helper", () => {
  const source = read("src/lib/renderSky.ts");
  assert.match(source, /resolveBaseTextFontSizePx\(box\.size, scale\)/);
  assert.doesNotMatch(source, /Math\.max\(10, \(box\.size \?\? 28\) \* scale\)/);
});

test("wiring: constellation label minima floor the unscaled tier size", () => {
  const source = read("src/lib/renderSky.ts");
  // Reference-canvas form: Math.max(7.5, 8) * scale etc. — the
  // effective tier sizes are 8 / 9.5 / 9 times scale.
  assert.match(source, /Math\.max\(7\.5, 8\) \* scale/);
  assert.match(source, /Math\.max\(8\.5, 9\.5\) \* scale/);
  assert.match(source, /Math\.max\(8, 9\) \* scale/);
  assert.doesNotMatch(source, /Math\.max\(7\.5, 8 \* scale\)/);
  assert.doesNotMatch(source, /Math\.max\(8\.5, 9\.5 \* scale\)/);
  assert.doesNotMatch(source, /Math\.max\(8, 9 \* scale\)/);
});
