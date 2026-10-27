/**
 * #409: the rectangle frame inset scales with canvas size for EVERY
 * render. Option (i) (#426, SQ-67) gated the scaled inset
 * max(legacy, minDim x 16/1200) on matPurpose === "preview" and kept
 * print at the legacy inset; option (ii) — the owner's delegated
 * decision, adopted 2026-10-27 — removed the gate so the delivered
 * print matches the preview the customer approved.
 * resolveFrameInsetPx is now purpose-independent: one calculation of
 * (width, height), with the legacy inset as the floor (bit-for-bit
 * legacy at minDim <= 1200).
 *
 * These tests pin: the helper numeric table (square + non-square),
 * the fit-bound/stroke consistency through
 * resolveShapeTextAvailableWidth, drag-clamp parity with the
 * pre-#426 implementation at editor sizes (minDim <= 1200), the
 * clamp's scaled-inset contract above 1200, and the render-path
 * wiring in renderSky.ts / textFit.ts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  clampTextCenterToShape,
  resolveFrameInsetPx,
  resolveFrameTextFitPaddingPx,
  resolveShapeTextAvailableWidth,
} from "../../src/lib/textFit.ts";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "../..");
const read = (rel) => readFileSync(join(appRoot, rel), "utf8");

/* ------------------------------------------------------------------ */
/* Helper numeric table (SQ-67 section 5 values, now for all renders)  */
/* ------------------------------------------------------------------ */

const SQUARE_TABLE = [
  // [minDim, inset]
  [100, 8],
  [266, 8],
  [267, 8],
  [533, 15],
  [534, 16],
  [1040, 16],
  [1200, 16],
  [2000, 2000 * (16 / 1200)],
  [3000, 40],
  [4500, 4500 * (16 / 1200)],
  [6000, 80],
];

test("frame inset: square table — legacy floor at <=1200, scaled above, for every render", () => {
  for (const [minDim, expected] of SQUARE_TABLE) {
    assert.equal(resolveFrameInsetPx(minDim, minDim), expected, `${minDim}`);
  }
});

const NON_SQUARE_TABLE = [
  // [width, height, inset]
  [100, 6000, 8],
  [533, 6000, 15],
  [1040, 6000, 16],
  [1200, 6000, 16],
  [2000, 3000, 2000 * (16 / 1200)],
  [3000, 4500, 40],
  [4500, 6000, 4500 * (16 / 1200)],
];

test("frame inset: non-square inputs use the minimum dimension, both orientations", () => {
  for (const [w, h, expected] of NON_SQUARE_TABLE) {
    for (const [width, height] of [
      [w, h],
      [h, w],
    ]) {
      assert.equal(resolveFrameInsetPx(width, height), expected, `${width}x${height}`);
    }
  }
});

test("frame inset: purpose no longer reaches the helper (option (ii) removed the gate)", () => {
  // The helper takes (width, height) only; a stray runtime third
  // argument — any purpose value, valid or not — cannot change the
  // result. Print and preview compute the same inset by construction.
  assert.equal(resolveFrameInsetPx(6000, 6000, "print"), 80);
  assert.equal(resolveFrameInsetPx(6000, 6000, "preview"), 80);
  assert.equal(resolveFrameInsetPx(6000, 6000, "PRINT"), 80);
  assert.equal(resolveFrameInsetPx(6000, 6000, undefined), 80);
});

/* ------------------------------------------------------------------ */
/* Fit-bound consistency (the fit uses the same inset as the stroke)   */
/* ------------------------------------------------------------------ */

function frameBound(width, height) {
  return resolveShapeTextAvailableWidth({
    shape: "rectangle",
    frameEnabled: true,
    centerYNorm: 0.5,
    lineHeightPx: 40,
    width,
    height,
  });
}

test("fit bound: available width = width - 2 x (inset + padding) at every size", () => {
  for (const size of [100, 533, 1040, 1200, 2000, 3000, 4500, 6000]) {
    const inset = resolveFrameInsetPx(size, size);
    const padding = resolveFrameTextFitPaddingPx(size);
    const expected = Math.max(1, size - 2 * (inset + padding));
    assert.equal(frameBound(size, size), expected, `${size}`);
  }
});

test("fit bound: 6000 square — 5780 for print and preview alike; 1200 square — 1156", () => {
  assert.equal(frameBound(6000, 6000), 5780);
  assert.equal(frameBound(1200, 1200), 1156);
});

test("fit bound: undefined shape behaves like rectangle; frame-off and other shapes unchanged", () => {
  const base = { centerYNorm: 0.5, lineHeightPx: 40, width: 6000, height: 6000 };
  assert.equal(
    resolveShapeTextAvailableWidth({ ...base, shape: undefined, frameEnabled: true }),
    5780,
  );
  assert.equal(
    resolveShapeTextAvailableWidth({ ...base, shape: "rectangle", frameEnabled: false }),
    6000,
  );
  assert.equal(
    resolveShapeTextAvailableWidth({ ...base, shape: "circle", frameEnabled: true }),
    6000,
  );
});

/* ------------------------------------------------------------------ */
/* Drag-clamp parity at editor sizes + scaled contract above 1200      */
/* ------------------------------------------------------------------ */

// The pre-change clamp bound: legacy inset + the same padding helper.
// At minDim <= 1200 the scaled inset IS the legacy inset, so the clamp
// must reproduce the old outputs exactly.
function legacyClampAxis(value, rectPx, sizePx, width, height) {
  const legacyInset = Math.max(8, Math.min(16, Math.floor(Math.min(width, height) * 0.03)));
  const insetPx = legacyInset + resolveFrameTextFitPaddingPx(width);
  const min = (insetPx + rectPx / 2) / sizePx;
  const max = 1 - min;
  if (min > max) return 0.5;
  return Math.min(max, Math.max(min, value));
}

test("drag clamp: exact parity with the pre-change clamp at minDim <= 1200", () => {
  const sizes = [
    [600, 600],
    [800, 1000],
    [1040, 1040],
    [1200, 1200],
    [1040, 1200],
    [1200, 1040],
    [300, 1200],
  ];
  const rects = [
    [0, 0],
    [100, 40],
    [400, 60],
    [900, 200],
    [2000, 1500],
  ];
  const centres = [
    { x: 0.5, y: 0.5 },
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 0.02, y: 0.98 },
    { x: 0.98, y: 0.02 },
    { x: 0.5, y: 0 },
    { x: 0, y: 0.5 },
    { x: 0.25, y: 0.75 },
  ];
  for (const [width, height] of sizes) {
    for (const shape of ["rectangle", undefined]) {
      for (const frameEnabled of [true, false]) {
        for (const [rectWidthPx, rectHeightPx] of rects) {
          for (const centre of centres) {
            const actual = clampTextCenterToShape(centre, {
              shape,
              frameEnabled,
              rectWidthPx,
              rectHeightPx,
              width,
              height,
            });
            let expected = centre;
            if ((shape === undefined || shape === "rectangle") && frameEnabled) {
              expected = {
                x: legacyClampAxis(centre.x, rectWidthPx, width, width, height),
                y: legacyClampAxis(centre.y, rectHeightPx, height, width, height),
              };
            }
            assert.deepEqual(
              actual,
              expected,
              `${width}x${height} shape=${shape} frame=${frameEnabled} rect=${rectWidthPx}x${rectHeightPx} centre=${centre.x},${centre.y}`,
            );
          }
        }
      }
    }
  }
});

test("drag clamp: above 1200 CSS px the clamp uses the scaled inset (contract)", () => {
  // 2000x2000, rect 100x40, centre hard against the left edge.
  // Scaled inset = 2000 * 16/1200 = 26.666..., padding = 10, so the
  // centre clamps to (26.666... + 10 + 50) / 2000. The legacy inset (16)
  // would give (16 + 10 + 50) / 2000 = 0.038 — the clamp must NOT use it.
  const actual = clampTextCenterToShape(
    { x: 0, y: 0.5 },
    { shape: "rectangle", frameEnabled: true, rectWidthPx: 100, rectHeightPx: 40, width: 2000, height: 2000 },
  );
  const expectedX = (2000 * (16 / 1200) + resolveFrameTextFitPaddingPx(2000) + 50) / 2000;
  assert.equal(actual.x, expectedX);
  assert.notEqual(actual.x, 0.038);
  assert.equal(actual.y, 0.5);
});

/* ------------------------------------------------------------------ */
/* Wiring pins (repo style: one purpose-independent calculation)       */
/* ------------------------------------------------------------------ */

test("wiring: textFit helper is purpose-independent; fit and clamp call it with (width, height)", () => {
  const source = read("src/lib/textFit.ts");
  assert.match(source, /export function resolveFrameInsetPx\(width: number, height: number\): number/);
  assert.match(source, /return Math\.max\(legacyInset, minDim \* \(16 \/ 1200\)\);/);
  // The option (i) purpose gate and the purpose threading into the
  // helper are gone (option (ii)).
  assert.doesNotMatch(source, /matPurpose !== "preview"/);
  assert.doesNotMatch(source, /layout\.matPurpose/);
  assert.doesNotMatch(source, /resolveFrameInsetPx\(width, height, "preview"\)/);
  // The fit and the drag clamp both use the two-argument helper.
  assert.match(source, /resolveFrameInsetPx\(width, height\) \+\s+resolveFrameTextFitPaddingPx\(width\)/);
  assert.match(source, /resolveFrameInsetPx\(width, height\) \+ resolveFrameTextFitPaddingPx\(width\)/);
});

test("wiring: renderSky stroke and fit share the helper; purpose stays with the mat resolvers", () => {
  const source = read("src/lib/renderSky.ts");
  // drawBackground no longer takes a purpose; the stroke uses the
  // two-argument helper.
  assert.doesNotMatch(source, /matPurpose: ExportMatPurpose = "print"/);
  assert.match(source, /const inset = resolveFrameInsetPx\(width, height\);/);
  // renderStarMap still resolves its purpose for the print-safe wrap
  // and transparent-mat rules, and derives the fit's frame flag from it.
  assert.match(source, /frameEnabled: resolveTextFitFrameEnabled\(matPurpose, recipe\.renderOptions\),/);
  // drawText's layout Pick no longer carries a purpose, and drawText
  // does not forward one into the fit.
  assert.match(source, /Pick<TextFitLayout, "shape" \| "frameEnabled" \| "shapeMaskFootprint" \| "shapeTextProfile">/);
  assert.doesNotMatch(source, /matPurpose: textLayout\?\.matPurpose,/);
  // The renderStarMap drawText layout goes straight from the frame
  // flag to the #406 footprint (no purpose line between).
  assert.match(source, /frameEnabled: resolveTextFitFrameEnabled\(matPurpose, recipe\.renderOptions\),\n\s+\/\/ #406:[\s\S]*?shapeMaskFootprint: resolveShapeMaskFootprint\(width, targetHeight, shapeLayoutVersion\),\n\s+\/\/ #407:[\s\S]*?shapeTextProfile: resolveShapeTextProfile\(shapeName\),\n\s+\}\)/);
  // The live-preview text overlay takes no purpose either; its
  // drawText layout goes straight from frameEnabled to the footprint.
  assert.match(source, /drawText\(ctx, width, height, textBoxes, textBounds, scale, \{\n\s+shape,\n\s+frameEnabled,\n\s+shapeMaskFootprint: resolveShapeMaskFootprint\(width, height, resolvedShapeLayoutVersion\),\n\s+\/\/ #407:[\s\S]*?shapeTextProfile: resolveShapeTextProfile\(shape\),\n\s+\}\);/);
});
