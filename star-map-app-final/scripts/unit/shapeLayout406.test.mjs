/**
 * #406 (SQ-02 Option A): uniform shape-mask scaling, versioned.
 *
 * Pins:
 *  1. the version resolver — only the exact value 2 selects the
 *     uniform layout; absent/1/anything else is legacy, so every
 *     design saved before the field existed renders as it always did;
 *  2. the clip transform — legacy reproduces the historical
 *     independent X/Y factors exactly; uniform is SQ-02's contain map
 *     (one scale, centred footprint), and the silhouette it produces
 *     keeps the path's own proportions at every canvas aspect while
 *     the legacy map's proportions track the canvas aspect (the
 *     defect itself, pinned so it can never pass for fixed);
 *  3. the footprint helper the diamond text geometry consumes;
 *  4. the diamond fit + drag clamp — legacy results byte-for-byte the
 *     pre-#406 numbers; uniform results evaluated in footprint space
 *     (a row above the footprint has NO mask width, where the legacy
 *     geometry still saw the stretched diamond);
 *  5. persistence wiring — buildRecipeFromState carries the version
 *     verbatim (including undefined), the maps-API sanitizer and the
 *     editor-draft normalizer keep it, and new designs are stamped 2
 *     at creation.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const {
  SHAPE_LAYOUT_VERSION_LEGACY,
  SHAPE_LAYOUT_VERSION_UNIFORM,
  resolveShapeLayoutVersion,
  resolveShapeClipTransform,
  resolveShapeMaskFootprint,
} = await import("../../src/lib/shapeLayout.ts");
const {
  resolveDiamondHalfWidthAt,
  resolveShapeTextAvailableWidth,
  clampTextCenterToShape,
} = await import("../../src/lib/textFit.ts");
const { buildRecipeFromState } = await import("../../src/lib/renderSky.ts");
const { SHAPE_PATHS } = await import("../../src/lib/shapes/index.ts");

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "../..");
const read = (rel) => readFileSync(join(appRoot, rel), "utf8");

const approx = (actual, expected, eps = 1e-9) =>
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `expected ${actual} ≈ ${expected} (±${eps})`,
  );

const HEART_VB = SHAPE_PATHS.heart.viewBox; // [0, 0, 100, 100]
// The heart path's control-point extent (the silhouette's bounding
// box up to curve overshoot): x 8..92, y 10..88.
const HEART_EXTENT = { minX: 8, minY: 10, maxX: 92, maxY: 88 };

function extentRatio(transform) {
  const w = (HEART_EXTENT.maxX - HEART_EXTENT.minX) * transform.scaleX;
  const h = (HEART_EXTENT.maxY - HEART_EXTENT.minY) * transform.scaleY;
  return w / h;
}

/* 1 — version resolution ------------------------------------------- */

test("only the exact value 2 selects the uniform layout", () => {
  assert.equal(SHAPE_LAYOUT_VERSION_UNIFORM, 2);
  assert.equal(SHAPE_LAYOUT_VERSION_LEGACY, 1);
  assert.equal(resolveShapeLayoutVersion(2), 2);
  for (const legacy of [undefined, null, 1, 0, 3, "2", Number.NaN, true]) {
    assert.equal(resolveShapeLayoutVersion(legacy), 1, `value ${String(legacy)}`);
  }
});

/* 2 — clip transform ------------------------------------------------ */

test("legacy transform reproduces the historical independent factors", () => {
  const t = resolveShapeClipTransform(HEART_VB, 1200, 1800, undefined);
  assert.deepEqual(t, { scaleX: 12, scaleY: 18, translateX: 0, translateY: 0 });
  const v1 = resolveShapeClipTransform(HEART_VB, 1200, 1800, 1);
  assert.deepEqual(v1, t);
  const square = resolveShapeClipTransform(HEART_VB, 1200, 1200, undefined);
  assert.deepEqual(square, { scaleX: 12, scaleY: 12, translateX: 0, translateY: 0 });
});

test("uniform transform is SQ-02's contain map: one scale, centred footprint", () => {
  // 2:3 portrait: scale from the width, footprint centred vertically.
  assert.deepEqual(resolveShapeClipTransform(HEART_VB, 1200, 1800, 2), {
    scaleX: 12,
    scaleY: 12,
    translateX: 0,
    translateY: 300,
  });
  // 4:5 portrait.
  assert.deepEqual(resolveShapeClipTransform(HEART_VB, 1200, 1500, 2), {
    scaleX: 12,
    scaleY: 12,
    translateX: 0,
    translateY: 150,
  });
  // 3:2 landscape (design proof only): scale from the height.
  assert.deepEqual(resolveShapeClipTransform(HEART_VB, 1800, 1200, 2), {
    scaleX: 12,
    scaleY: 12,
    translateX: 300,
    translateY: 0,
  });
  // Square: uniform and legacy coincide exactly — square designs are
  // byte-identical under either version.
  assert.deepEqual(
    resolveShapeClipTransform(HEART_VB, 1200, 1200, 2),
    resolveShapeClipTransform(HEART_VB, 1200, 1200, undefined),
  );
  // A non-zero viewBox origin rides through both maps.
  const vb = [10, 20, 100, 100];
  assert.deepEqual(resolveShapeClipTransform(vb, 1200, 1800, undefined), {
    scaleX: 12,
    scaleY: 18,
    translateX: -10,
    translateY: -20,
  });
  assert.deepEqual(resolveShapeClipTransform(vb, 1200, 1800, 2), {
    scaleX: 12,
    scaleY: 12,
    // x: the footprint fills the width exactly (offset 0), then the
    // viewBox origin shifts by -s * minX. y: centred offset 300 first.
    translateX: -120,
    translateY: 300 - 240,
  });
});

test("uniform keeps the silhouette's proportions at every aspect; legacy tracks the canvas", () => {
  const pathRatio = (HEART_EXTENT.maxX - HEART_EXTENT.minX) / (HEART_EXTENT.maxY - HEART_EXTENT.minY);
  for (const [w, h] of [[1200, 1200], [1200, 1500], [1200, 1800], [1800, 1200]]) {
    approx(extentRatio(resolveShapeClipTransform(HEART_VB, w, h, 2)), pathRatio, 1e-12);
    approx(
      extentRatio(resolveShapeClipTransform(HEART_VB, w, h, undefined)),
      pathRatio * (w / h),
      1e-12,
    );
  }
});

/* 3 — footprint ------------------------------------------------------ */

test("footprint: null for legacy, the centred square for uniform", () => {
  assert.equal(resolveShapeMaskFootprint(1200, 1800, undefined), null);
  assert.equal(resolveShapeMaskFootprint(1200, 1800, 1), null);
  assert.deepEqual(resolveShapeMaskFootprint(1200, 1800, 2), {
    size: 1200,
    offsetX: 0,
    offsetY: 300,
  });
  assert.deepEqual(resolveShapeMaskFootprint(1800, 1200, 2), {
    size: 1200,
    offsetX: 300,
    offsetY: 0,
  });
  assert.deepEqual(resolveShapeMaskFootprint(1200, 1200, 2), {
    size: 1200,
    offsetX: 0,
    offsetY: 0,
  });
  assert.equal(resolveShapeMaskFootprint(0, 1800, 2), null);
  assert.equal(resolveShapeMaskFootprint(1200, Number.NaN, 2), null);
});

/* 4 — diamond fit + clamp -------------------------------------------- */

const FIT_BASE = { shape: "diamond", frameEnabled: true, width: 1200, height: 1800 };

test("diamond fit: legacy numbers are the pre-#406 numbers, absent == explicit null footprint", () => {
  const input = { ...FIT_BASE, centerYNorm: 0.5, lineHeightPx: 60 };
  const expected =
    Math.min(
      resolveDiamondHalfWidthAt(0.5 - 30 / 1800),
      resolveDiamondHalfWidthAt(0.5 + 30 / 1800),
    ) *
    2 *
    1200;
  approx(expected, 1016, 1e-6); // hand-computed tent value at the middle row
  approx(resolveShapeTextAvailableWidth(input), expected, 1e-9);
  approx(
    resolveShapeTextAvailableWidth({ ...input, shapeMaskFootprint: null }),
    expected,
    1e-9,
  );
  // The legacy footprint resolver itself returns null for v1/absent.
  assert.equal(resolveShapeMaskFootprint(1200, 1800, 1), null);
});

test("diamond fit: uniform evaluates the tent in footprint space", () => {
  const footprint = resolveShapeMaskFootprint(1200, 1800, 2);
  const input = { ...FIT_BASE, centerYNorm: 0.5, lineHeightPx: 60, shapeMaskFootprint: footprint };
  // Footprint: size 1200, top at y=300. Centre row 900px -> 0.5 in
  // mask space; span ±30px -> ±0.025.
  const expected =
    Math.min(resolveDiamondHalfWidthAt(0.475), resolveDiamondHalfWidthAt(0.525)) *
    2 *
    1200;
  approx(expected, 996, 1e-6);
  approx(resolveShapeTextAvailableWidth(input), expected, 1e-9);
  // Above the footprint there is no mask at all: the row a legacy
  // design's title sits on (y=0.10) still has stretched-diamond width
  // under the legacy geometry but zero width under the uniform one.
  const above = { ...FIT_BASE, centerYNorm: 0.1, lineHeightPx: 60 };
  assert.ok(resolveShapeTextAvailableWidth(above) > 1);
  assert.equal(resolveShapeTextAvailableWidth({ ...above, shapeMaskFootprint: footprint }), 1);
  // Square canvas: footprint == canvas, so uniform == legacy.
  const square = { shape: "diamond", frameEnabled: true, width: 1200, height: 1200, centerYNorm: 0.42, lineHeightPx: 60 };
  approx(
    resolveShapeTextAvailableWidth({
      ...square,
      shapeMaskFootprint: resolveShapeMaskFootprint(1200, 1200, 2),
    }),
    resolveShapeTextAvailableWidth(square),
    1e-9,
  );
});

test("diamond clamp: legacy result is the pre-#406 result", () => {
  const layout = { shape: "diamond", frameEnabled: true, rectWidthPx: 200, rectHeightPx: 40, width: 1200, height: 1800 };
  const out = clampTextCenterToShape({ x: 0.5, y: 0.05 }, layout);
  // Hand-computed from the shipped algorithm: maxRowOffset =
  // 0.44 * (1 - (1/12) / 0.44); minY = 0.5 - maxRowOffset + 1/90.
  const maxRowOffset = 0.44 * (1 - (1 / 12) / 0.44);
  approx(out.y, 0.5 - maxRowOffset + 1 / 90, 1e-12);
  approx(out.x, 0.5, 1e-12);
  assert.deepEqual(clampTextCenterToShape({ x: 0.5, y: 0.05 }, { ...layout, shapeMaskFootprint: null }), out);
});

test("diamond clamp: uniform clamps against the footprint, not the canvas", () => {
  const layout = {
    shape: "diamond",
    frameEnabled: true,
    shapeMaskFootprint: resolveShapeMaskFootprint(1200, 1800, 2),
    rectWidthPx: 200,
    rectHeightPx: 40,
    width: 1200,
    height: 1800,
  };
  const out = clampTextCenterToShape({ x: 0.5, y: 0.05 }, layout);
  // Mask space: centre row (90 - 300) / 1200 = -0.175 clamps to
  // minY = 0.5 - maxRowOffset + 1/60 (half-height 40 / 2400); back to
  // canvas: (300 + maskY * 1200) / 1800.
  const maxRowOffset = 0.44 * (1 - (1 / 12) / 0.44);
  const maskY = 0.5 - maxRowOffset + 1 / 60;
  approx(out.y, (300 + maskY * 1200) / 1800, 1e-12);
  approx(out.x, 0.5, 1e-12);
  // An interior centre is (numerically) untouched.
  const inside = clampTextCenterToShape({ x: 0.5, y: 0.5 }, layout);
  approx(inside.x, 0.5, 1e-12);
  approx(inside.y, 0.5, 1e-12);
});

/* 5 — persistence wiring ---------------------------------------------- */

const RECIPE_INPUT = {
  dateTime: "2024-06-01T18:00:00.000Z",
  location: { name: "Santorini, Greece", latitude: 36.3932, longitude: 25.4615, timezone: "Europe/Athens" },
  textBoxes: [],
  selectedStyle: "navyGold",
  aspectRatio: "2:3",
  shape: "heart",
};

test("buildRecipeFromState carries the layout version verbatim — including absent", () => {
  const v2 = buildRecipeFromState({
    ...RECIPE_INPUT,
    renderOptions: { shapeLayoutVersion: 2 },
  });
  assert.equal(v2.renderOptions.shapeLayoutVersion, 2);
  const legacy = buildRecipeFromState({ ...RECIPE_INPUT, renderOptions: {} });
  assert.equal(legacy.renderOptions.shapeLayoutVersion, undefined);
  const bare = buildRecipeFromState({ ...RECIPE_INPUT });
  assert.equal(bare.renderOptions.shapeLayoutVersion, undefined);
});

test("wiring: sanitizer, draft normalizer and creation stamps keep the version", () => {
  const route = read("src/app/api/maps/route.ts");
  assert.match(route, /"shapeLayoutVersion",/);
  const draft = read("src/lib/editorDraft.ts");
  assert.match(draft, /value\.shapeLayoutVersion/);
  assert.match(draft, /normalized\.shapeLayoutVersion = version/);
  const store = read("src/lib/store.ts");
  assert.match(store, /shapeLayoutVersion: 2,/);
  const simplified = read("src/components/SimplifiedEditor/SimplifiedEditor.tsx");
  assert.match(simplified, /shapeLayoutVersion: 2,/);
  // Hydration paths set the version explicitly (a merge alone would
  // inherit the fresh-session stamp and silently convert legacy
  // designs).
  const experience = read("src/components/EditorExperience.tsx");
  assert.match(experience, /shapeLayoutVersion: draft\.renderOptions\.shapeLayoutVersion/);
  assert.match(experience, /shapeLayoutVersion: recipe\.renderOptions\.shapeLayoutVersion/);
  assert.match(simplified, /shapeLayoutVersion: parsed\.renderOptions\.shapeLayoutVersion/);
});
