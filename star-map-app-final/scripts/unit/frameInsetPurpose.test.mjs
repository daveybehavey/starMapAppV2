/**
 * #409: the rectangle frame inset scales with canvas size for NON-print
 * renders only. SQ-67 re-spec (option (i)): the scaled inset
 * max(legacy, minDim x 16/1200) is gated on matPurpose === "preview";
 * print renders — and every caller that omits purpose at the shared
 * helper / layout boundary — keep the legacy inset bit-for-bit, so the
 * shipped physical product cannot change geometry by accident.
 *
 * These tests pin: the helper numeric table (square + non-square), the
 * fit-bound/stroke consistency through resolveShapeTextAvailableWidth,
 * drag-clamp parity with the pre-change implementation at editor sizes
 * (minDim <= 1200), the clamp's explicit preview contract above 1200,
 * and the render-path wiring in renderSky.ts.
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
/* Helper numeric table (SQ-67 section 5)                              */
/* ------------------------------------------------------------------ */

const SQUARE_TABLE = [
  // [minDim, legacy/print/omitted, preview]
  [100, 8, 8],
  [266, 8, 8],
  [267, 8, 8],
  [533, 15, 15],
  [534, 16, 16],
  [1040, 16, 16],
  [1200, 16, 16],
  [2000, 16, 2000 * (16 / 1200)],
  [3000, 16, 40],
  [4500, 16, 4500 * (16 / 1200)],
  [6000, 16, 80],
];

test("frame inset: square table — print and omitted purpose stay legacy at every size", () => {
  for (const [minDim, legacy] of SQUARE_TABLE) {
    assert.equal(resolveFrameInsetPx(minDim, minDim, "print"), legacy, `print ${minDim}`);
    assert.equal(resolveFrameInsetPx(minDim, minDim), legacy, `omitted ${minDim}`);
  }
});

test("frame inset: square table — preview scales above the 1200px reference", () => {
  for (const [minDim, , preview] of SQUARE_TABLE) {
    assert.equal(resolveFrameInsetPx(minDim, minDim, "preview"), preview, `preview ${minDim}`);
  }
});

const NON_SQUARE_TABLE = [
  // [width, height, legacy/print/omitted, preview]
  [100, 6000, 8, 8],
  [533, 6000, 15, 15],
  [1040, 6000, 16, 16],
  [1200, 6000, 16, 16],
  [2000, 3000, 16, 2000 * (16 / 1200)],
  [3000, 4500, 16, 40],
  [4500, 6000, 16, 4500 * (16 / 1200)],
];

test("frame inset: non-square inputs use the minimum dimension, both orientations", () => {
  for (const [w, h, legacy, preview] of NON_SQUARE_TABLE) {
    for (const [width, height] of [
      [w, h],
      [h, w],
    ]) {
      assert.equal(resolveFrameInsetPx(width, height, "print"), legacy, `print ${width}x${height}`);
      assert.equal(resolveFrameInsetPx(width, height), legacy, `omitted ${width}x${height}`);
      assert.equal(resolveFrameInsetPx(width, height, "preview"), preview, `preview ${width}x${height}`);
    }
  }
});

test("frame inset: a runtime purpose other than preview falls back to legacy", () => {
  // The helper's contract is fail-safe: only the exact "preview" purpose
  // scales. (A wrong-typed runtime value must not move print geometry.)
  assert.equal(resolveFrameInsetPx(6000, 6000, "PRINT"), 16);
  assert.equal(resolveFrameInsetPx(6000, 6000, ""), 16);
  assert.equal(resolveFrameInsetPx(6000, 6000, undefined), 16);
});

/* ------------------------------------------------------------------ */
/* Fit-bound consistency (the fit uses the same inset as the stroke)   */
/* ------------------------------------------------------------------ */

function frameBound(width, height, matPurpose) {
  return resolveShapeTextAvailableWidth({
    shape: "rectangle",
    frameEnabled: true,
    matPurpose,
    centerYNorm: 0.5,
    lineHeightPx: 40,
    width,
    height,
  });
}

test("fit bound: available width = width - 2 x (inset + padding) for both purposes", () => {
  for (const size of [100, 533, 1040, 1200, 2000, 3000, 4500, 6000]) {
    for (const purpose of ["print", "preview", undefined]) {
      const inset = resolveFrameInsetPx(size, size, purpose);
      const padding = resolveFrameTextFitPaddingPx(size);
      const expected = Math.max(1, size - 2 * (inset + padding));
      assert.equal(frameBound(size, size, purpose), expected, `${purpose} ${size}`);
    }
  }
});

test("fit bound: 6000 square — preview 5780, print/omitted 5908; 1200 square — 1156 for all", () => {
  assert.equal(frameBound(6000, 6000, "preview"), 5780);
  assert.equal(frameBound(6000, 6000, "print"), 5908);
  assert.equal(frameBound(6000, 6000, undefined), 5908);
  assert.equal(frameBound(1200, 1200, "preview"), 1156);
  assert.equal(frameBound(1200, 1200, "print"), 1156);
  assert.equal(frameBound(1200, 1200, undefined), 1156);
});

test("fit bound: undefined shape behaves like rectangle; frame-off and other shapes unchanged", () => {
  const base = { centerYNorm: 0.5, lineHeightPx: 40, width: 6000, height: 6000 };
  assert.equal(
    resolveShapeTextAvailableWidth({ ...base, shape: undefined, frameEnabled: true, matPurpose: "preview" }),
    5780,
  );
  assert.equal(
    resolveShapeTextAvailableWidth({ ...base, shape: "rectangle", frameEnabled: false, matPurpose: "preview" }),
    6000,
  );
  assert.equal(
    resolveShapeTextAvailableWidth({ ...base, shape: "circle", frameEnabled: true, matPurpose: "preview" }),
    6000,
  );
  assert.equal(
    resolveShapeTextAvailableWidth({ ...base, shape: "circle", frameEnabled: true, matPurpose: "print" }),
    6000,
  );
});

/* ------------------------------------------------------------------ */
/* Drag-clamp parity at editor sizes + preview contract above 1200     */
/* ------------------------------------------------------------------ */

// The pre-change clamp bound: legacy inset + the same padding helper.
// At minDim <= 1200 the preview inset IS the legacy inset, so the clamp
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

test("drag clamp: above 1200 CSS px the clamp uses the preview-scaled inset (contract)", () => {
  // 2000x2000, rect 100x40, centre hard against the left edge.
  // Preview inset = 2000 * 16/1200 = 26.666..., padding = 10, so the
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
/* Wiring pins (repo style: the render path must thread the purpose)   */
/* ------------------------------------------------------------------ */

test("wiring: textFit helper is purpose-gated with a legacy fail-safe default", () => {
  const source = read("src/lib/textFit.ts");
  assert.match(source, /matPurpose: ExportMatPurpose = "print"/);
  assert.match(source, /if \(matPurpose !== "preview"\) return legacyInset;/);
  assert.match(source, /Math\.max\(legacyInset, minDim \* \(16 \/ 1200\)\)/);
  // The drag clamp pins the editor-preview purpose explicitly.
  assert.match(source, /resolveFrameInsetPx\(width, height, "preview"\)/);
  // The fit forwards the layout's purpose (omission -> helper default).
  assert.match(source, /resolveFrameInsetPx\(width, height, layout\.matPurpose\)/);
});

test("wiring: renderSky threads renderStarMap's resolved purpose to stroke and fit", () => {
  const source = read("src/lib/renderSky.ts");
  // drawBackground takes the purpose with the fail-safe default and uses it.
  assert.match(source, /matPurpose: ExportMatPurpose = "print",?\n\)/);
  assert.match(source, /resolveFrameInsetPx\(width, height, matPurpose\)/);
  // renderStarMap forwards its resolved purpose to drawBackground.
  assert.match(source, /recipe\.renderOptions,\n\s+matPurpose,\n\s+\)/);
  // drawText's layout Pick carries the purpose and forwards it to the fit.
  assert.match(source, /Pick<TextFitLayout, "shape" \| "frameEnabled" \| "matPurpose">/);
  assert.match(source, /matPurpose: textLayout\?\.matPurpose,/);
  // renderStarMap's own drawText layout carries the resolved purpose.
  assert.match(source, /frameEnabled: resolveTextFitFrameEnabled\(matPurpose, recipe\.renderOptions\),\n\s+matPurpose,\n\s+\}\)/);
  // The live-preview text overlay is a preview surface: purpose defaults
  // to "preview" there and is forwarded into its drawText layout.
  assert.match(source, /matPurpose = "preview",\n\}: \{\n\s+canvas: CanvasLike;/);
  assert.match(source, /drawText\(ctx, width, height, textBoxes, textBounds, scale, \{ shape, frameEnabled, matPurpose \}\)/);
});
