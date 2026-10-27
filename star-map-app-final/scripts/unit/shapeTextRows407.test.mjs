/**
 * #407 (SQ-03): shape-aware text rows, fit bound, and drag clamp for
 * heart and star.
 *
 * The diamond got designed default rows, a row-dependent fit bound,
 * and a drag clamp in the fleet waves; heart/star deliberately
 * returned the full canvas width and no clamp, and their designed
 * boxes used the standard rows — which land in the heart's cleft, on
 * the star's top point, and in the star's bottom notch (the shipped
 * example renders show the title crossing the outline). SQ-03 is the
 * design of record: HEART/STAR row sets in the diamond pattern with
 * per-row mask-width arithmetic, a generalised fit bound + drag
 * clamp over the mask's interior intervals, and four-set
 * shape-switch semantics.
 *
 * The geometry is derived from SHAPE_PATHS — the exact entries
 * buildShapeClip renders — via lib/shapeTextGeometry.ts; the pixel
 * figures pinned below are SQ-03's hand-derived table, reproduced by
 * the production functions (canvas 1200x1200, line height = fontSize
 * x 1.2, spans measured with the unfitted height, as drawText does).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SHAPE_PATHS } from "../../src/lib/shapes/index.ts";
import { buildShapeTextProfile } from "../../src/lib/shapeTextGeometry.ts";
import {
  DIAMOND_TEXT_BOX_ROWS,
  HEART_TEXT_BOX_ROWS,
  MIN_TEXT_FIT_SCALE,
  STANDARD_TEXT_BOX_ROWS,
  STAR_TEXT_BOX_ROWS,
  applyDefaultTextRowsForShape,
  clampTextCenterToShape,
  remapDefaultTextRowsForFootprintChange,
  resolveDefaultTextBoxRows,
  resolveShapeTextAvailableWidth,
  resolveTextAnchorToCenterX,
  resolveTextCenterToAnchorX,
  resolveTextFitScale,
} from "../../src/lib/textFit.ts";
import { resolveShapeMaskFootprint } from "../../src/lib/shapeLayout.ts";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "../..");
const read = (rel) => readFileSync(join(appRoot, rel), "utf8");

const heartProfile = buildShapeTextProfile("heart", SHAPE_PATHS.heart.d, SHAPE_PATHS.heart.viewBox);
const starProfile = buildShapeTextProfile("star", SHAPE_PATHS.star.d, SHAPE_PATHS.star.viewBox);
const profileFor = (shape) => (shape === "heart" ? heartProfile : starProfile);

/* ------------------------------------------------------------------ */
/* Interior geometry: SQ-03's boundary analysis, from the real paths  */
/* ------------------------------------------------------------------ */

test("heart interior: cleft, tip, and the wide band at Y=34", () => {
  // Above the cleft's bottom (0.20) the centre is OUTSIDE the mask:
  // the cross-section is two disjoint lobes.
  assert.equal(heartProfile.centeredHalfWidthAt(0.12), 0);
  assert.equal(heartProfile.centeredHalfWidthAt(0.15), 0);
  const lobes = heartProfile.intervalsAt(0.15);
  assert.equal(lobes.length, 2);
  assert.ok(lobes[0][1] < 0.5 && lobes[1][0] > 0.5, "lobes straddle the centre gap");
  // Below the bottom tip (0.88) there is no mask at the centre.
  assert.equal(heartProfile.centeredHalfWidthAt(0.9), 0);
  // Widest row: X_L = 8 viewBox units -> half-width 0.42.
  assert.ok(Math.abs(heartProfile.centeredHalfWidthAt(0.34) - 0.42) < 1e-9);
});

test("star interior: top point, widest row, bottom notch", () => {
  // Title row 0.12 sits in the top point: XR = 50 + 11.8*(12-4)/31.1.
  const expected = (11.8 * 8) / 31.1 / 100;
  assert.ok(Math.abs(starProfile.centeredHalfWidthAt(0.12) - expected) < 1e-3);
  // Widest cross-section at Y=38.2 spans X=5..95.
  assert.ok(Math.abs(starProfile.centeredHalfWidthAt(0.382) - 0.45) < 1e-9);
  // Below the notch (0.745) the centre is outside the mask.
  assert.equal(starProfile.centeredHalfWidthAt(0.9), 0);
  assert.equal(starProfile.centeredHalfWidthAt(0.8), 0);
});

/* ------------------------------------------------------------------ */
/* Fit bound: SQ-03's available-width table at the proposed rows      */
/* ------------------------------------------------------------------ */

// [shape, rowSet, boxId, fontSize, sq03AvailablePx]
const SQ03_TABLE = [
  ["heart", HEART_TEXT_BOX_ROWS, "title", 52, 991],
  ["heart", HEART_TEXT_BOX_ROWS, "subtitle", 36, 935],
  ["heart", HEART_TEXT_BOX_ROWS, "dedication", 32, 620],
  ["star", STAR_TEXT_BOX_ROWS, "title", 52, 867],
  ["star", STAR_TEXT_BOX_ROWS, "subtitle", 36, 689],
  ["star", STAR_TEXT_BOX_ROWS, "dedication", 32, 479],
];

test("fit bound reproduces SQ-03's available widths at the designed rows", () => {
  for (const [shape, rows, id, fontSize, expectedPx] of SQ03_TABLE) {
    const available = resolveShapeTextAvailableWidth({
      shape,
      shapeTextProfile: profileFor(shape),
      centerYNorm: rows[id],
      lineHeightPx: fontSize * 1.2,
      width: 1200,
      height: 1200,
    });
    assert.ok(
      Math.abs(available - expectedPx) <= 3,
      `${shape} ${id}: expected ~${expectedPx}px (SQ-03), got ${available}`,
    );
  }
});

test("both default text sets fit at scale 1 at the designed rows (SQ-03 claim)", () => {
  // SQ-03's supplied sample widths: title ~625px, subtitle ~349px,
  // dedication ~138px — all under every bound in the table above.
  for (const [shape, rows, id, fontSize, expectedPx] of SQ03_TABLE) {
    const sampleWidth = id === "title" ? 625 : id === "subtitle" ? 349 : 138;
    const available = resolveShapeTextAvailableWidth({
      shape,
      shapeTextProfile: profileFor(shape),
      centerYNorm: rows[id],
      lineHeightPx: fontSize * 1.2,
      width: 1200,
      height: 1200,
    });
    assert.equal(resolveTextFitScale(sampleWidth, available), 1, `${shape} ${id}`);
    assert.ok(expectedPx > sampleWidth);
  }
});

test("fit bound: the old standard rows on heart/star hit the shrink floor", () => {
  // Title at the standard 0.12 row: heart centre is in the cleft and
  // the star's point is ~73px wide — the bound collapses to the 1px
  // floor, so the fit lands on MIN_TEXT_FIT_SCALE (bounded spill,
  // the pre-existing floor contract), never full size.
  for (const shape of ["heart", "star"]) {
    const available = resolveShapeTextAvailableWidth({
      shape,
      shapeTextProfile: profileFor(shape),
      centerYNorm: STANDARD_TEXT_BOX_ROWS.title,
      lineHeightPx: 52 * 1.2,
      width: 1200,
      height: 1200,
    });
    if (shape === "heart") assert.equal(available, 1);
    else assert.ok(available < 100, `star point bound, got ${available}`);
    assert.equal(resolveTextFitScale(625, available), MIN_TEXT_FIT_SCALE);
  }
  // Dedication at the standard 0.90 row: outside both masks.
  for (const shape of ["heart", "star"]) {
    const available = resolveShapeTextAvailableWidth({
      shape,
      shapeTextProfile: profileFor(shape),
      centerYNorm: STANDARD_TEXT_BOX_ROWS.dedication,
      lineHeightPx: 32 * 1.2,
      width: 1200,
      height: 1200,
    });
    assert.equal(available, 1, `${shape} dedication below the mask`);
  }
});

test("fit bound under the uniform layout converts the span into the footprint", () => {
  // 2:3 canvas, v2: footprint 1200x1200 at offsetY 300. The stored
  // canvas row for the heart title default is (300 + 0.38*1200)/1800.
  const footprint = resolveShapeMaskFootprint(1200, 1800, 2);
  assert.deepEqual(footprint, { size: 1200, offsetX: 0, offsetY: 300 });
  const available = resolveShapeTextAvailableWidth({
    shape: "heart",
    shapeTextProfile: heartProfile,
    shapeMaskFootprint: footprint,
    centerYNorm: (300 + HEART_TEXT_BOX_ROWS.title * 1200) / 1800,
    lineHeightPx: 52 * 1.2,
    width: 1200,
    height: 1800,
  });
  assert.ok(Math.abs(available - 991) <= 3, `expected the legacy ~991px bound, got ${available}`);
});

test("fit bound: no profile threaded keeps the historical full-canvas bound", () => {
  for (const shape of ["heart", "star"]) {
    assert.equal(
      resolveShapeTextAvailableWidth({
        shape,
        centerYNorm: 0.12,
        lineHeightPx: 62.4,
        width: 1200,
        height: 1200,
      }),
      1200,
    );
  }
  // Circle is not mask-bound for text (designed rows sit outside the
  // disc's chord on purpose) — unchanged even though it has a mask.
  assert.equal(
    resolveShapeTextAvailableWidth({
      shape: "circle",
      centerYNorm: 0.12,
      lineHeightPx: 62.4,
      width: 1200,
      height: 1200,
    }),
    1200,
  );
});

/* ------------------------------------------------------------------ */
/* Default rows + four-set shape-switch semantics (SQ-03 section 4)   */
/* ------------------------------------------------------------------ */

test("row sets resolve per shape; heart/star rows are mask-authored", () => {
  assert.deepEqual(resolveDefaultTextBoxRows("heart"), HEART_TEXT_BOX_ROWS);
  assert.deepEqual(resolveDefaultTextBoxRows("star"), STAR_TEXT_BOX_ROWS);
  assert.deepEqual(resolveDefaultTextBoxRows("diamond"), DIAMOND_TEXT_BOX_ROWS);
  assert.deepEqual(resolveDefaultTextBoxRows("circle"), STANDARD_TEXT_BOX_ROWS);
  assert.deepEqual(resolveDefaultTextBoxRows("rectangle"), STANDARD_TEXT_BOX_ROWS);
  assert.deepEqual(resolveDefaultTextBoxRows(undefined), STANDARD_TEXT_BOX_ROWS);
  // Diamond rows are canvas-authored: a footprint does NOT convert them.
  const footprint = resolveShapeMaskFootprint(1200, 1800, 2);
  assert.deepEqual(
    resolveDefaultTextBoxRows("diamond", footprint, 1800),
    DIAMOND_TEXT_BOX_ROWS,
  );
  // Heart rows convert through the footprint: (300 + 0.38*1200)/1800.
  const heartCanvas = resolveDefaultTextBoxRows("heart", footprint, 1800);
  assert.ok(Math.abs(heartCanvas.title - 0.42) < 1e-12);
  assert.ok(Math.abs(heartCanvas.dedication - 0.6) < 1e-12);
});

const boxesAt = (rows) => [
  { id: "title", position: { x: 0.5, y: rows.title } },
  { id: "subtitle", position: { x: 0.5, y: rows.subtitle } },
  { id: "dedication", position: { x: 0.5, y: rows.dedication } },
];
const rowsOf = (boxes) => boxes.map((b) => b.position.y);

test("migration: every recognised set moves to the target set (SQ-03 table)", () => {
  const sets = {
    S: STANDARD_TEXT_BOX_ROWS,
    D: DIAMOND_TEXT_BOX_ROWS,
    H: HEART_TEXT_BOX_ROWS,
    T: STAR_TEXT_BOX_ROWS,
  };
  const targetShape = { S: "rectangle", D: "diamond", H: "heart", T: "star" };
  for (const [fromName, fromRows] of Object.entries(sets)) {
    for (const [toName, toRows] of Object.entries(sets)) {
      const result = applyDefaultTextRowsForShape(boxesAt(fromRows), targetShape[toName]);
      assert.deepEqual(rowsOf(result), rowsOf(boxesAt(toRows)), `${fromName} -> ${toName}`);
    }
  }
});

test("migration: idempotent, reference-stable, and custom positions never move", () => {
  const heartBoxes = boxesAt(HEART_TEXT_BOX_ROWS);
  assert.equal(applyDefaultTextRowsForShape(heartBoxes, "heart"), heartBoxes);
  const custom = [
    { id: "title", position: { x: 0.5, y: 0.33 } },
    { id: "subtitle", position: { x: 0.4, y: STANDARD_TEXT_BOX_ROWS.subtitle } },
    { id: "dedication", position: { x: 0.5, y: 0.77 } },
    { id: "custom-1", position: { x: 0.5, y: STANDARD_TEXT_BOX_ROWS.title } },
  ];
  for (const shape of ["heart", "star", "diamond", "rectangle"]) {
    assert.equal(applyDefaultTextRowsForShape(custom, shape), custom, shape);
  }
});

test("migration under the uniform layout round-trips through the footprint", () => {
  const footprint = resolveShapeMaskFootprint(3, 4, 2);
  // Standard rows -> heart at 3:4 v2: canvas rows are the converted
  // mask rows ((0.5 + r*3)/4 with footprint size 3, offsetY 0.5).
  const toHeart = applyDefaultTextRowsForShape(boxesAt(STANDARD_TEXT_BOX_ROWS), "heart", footprint, 4);
  assert.deepEqual(rowsOf(toHeart), [
    (0.5 + HEART_TEXT_BOX_ROWS.title * 3) / 4,
    (0.5 + HEART_TEXT_BOX_ROWS.subtitle * 3) / 4,
    (0.5 + HEART_TEXT_BOX_ROWS.dedication * 3) / 4,
  ]);
  // ...and back to standard rows when the shape switches away (the
  // stored canvas rows are recognised via the inverse conversion).
  const back = applyDefaultTextRowsForShape(toHeart, "rectangle", footprint, 4);
  assert.deepEqual(rowsOf(back), rowsOf(boxesAt(STANDARD_TEXT_BOX_ROWS)));
  // Heart -> star at the same layout: the shared dedication row
  // (0.65 mask) converts to the same canvas row, so it does not move.
  const toStar = applyDefaultTextRowsForShape(toHeart, "star", footprint, 4);
  assert.equal(toStar[2].position.y, toHeart[2].position.y);
  assert.notEqual(toStar[0].position.y, toHeart[0].position.y);
});

test("aspect-change remap: untouched v2 heart defaults survive an aspect change (Codex P2 repro)", () => {
  // Codex's repro on PR #432: v2 heart at 2:3, aspect -> square,
  // shape -> rectangle must restore the standard rows; without the
  // remap the subtitle/dedication strand at their 2:3-converted
  // canvas rows (0.47333 / 0.60) as if they were custom positions.
  const from23 = resolveShapeMaskFootprint(2, 3, 2);
  const heartAt23 = applyDefaultTextRowsForShape(boxesAt(STANDARD_TEXT_BOX_ROWS), "heart", from23, 3);
  assert.deepEqual(rowsOf(heartAt23), [0.42, (0.5 + 0.46 * 2) / 3, 0.6]);
  const square = resolveShapeMaskFootprint(1, 1, 2);
  const remapped = remapDefaultTextRowsForFootprintChange(heartAt23, "heart", from23, square, 3, 1);
  assert.deepEqual(rowsOf(remapped), [
    HEART_TEXT_BOX_ROWS.title,
    HEART_TEXT_BOX_ROWS.subtitle,
    HEART_TEXT_BOX_ROWS.dedication,
  ]);
  const backToRectangle = applyDefaultTextRowsForShape(remapped, "rectangle", square, 1);
  assert.deepEqual(rowsOf(backToRectangle), rowsOf(boxesAt(STANDARD_TEXT_BOX_ROWS)));
});

test("aspect-change remap: reference-stable, custom rows untouched, legacy is a no-op", () => {
  const from23 = resolveShapeMaskFootprint(2, 3, 2);
  const square = resolveShapeMaskFootprint(1, 1, 2);
  const custom = [
    { id: "title", position: { x: 0.5, y: 0.31 } },
    { id: "subtitle", position: { x: 0.4, y: (0.5 + 0.46 * 2) / 3 } },
  ];
  assert.equal(remapDefaultTextRowsForFootprintChange(custom, "heart", from23, square, 3, 1), custom);
  const heartAt23 = applyDefaultTextRowsForShape(boxesAt(STANDARD_TEXT_BOX_ROWS), "heart", from23, 3);
  // Same footprint on both sides -> nothing to rewrite.
  assert.equal(remapDefaultTextRowsForFootprintChange(heartAt23, "heart", from23, from23, 3, 3), heartAt23);
  // Legacy designs (null footprints) store mask rows as canvas rows.
  assert.equal(remapDefaultTextRowsForFootprintChange(heartAt23, "heart", null, null, 3, 1), heartAt23);
  // Non-mask-row shapes never remap.
  assert.equal(remapDefaultTextRowsForFootprintChange(heartAt23, "diamond", from23, square, 3, 1), heartAt23);
});

/* ------------------------------------------------------------------ */
/* Drag clamp                                                          */
/* ------------------------------------------------------------------ */

const clampHeart = (center, rectW, rectH, footprint = null, w = 1200, h = 1200) =>
  clampTextCenterToShape(center, {
    shape: "heart",
    shapeTextProfile: heartProfile,
    shapeMaskFootprint: footprint,
    rectWidthPx: rectW,
    rectHeightPx: rectH,
    width: w,
    height: h,
  });
const clampStar = (center, rectW, rectH, footprint = null, w = 1200, h = 1200) =>
  clampTextCenterToShape(center, {
    shape: "star",
    shapeTextProfile: starProfile,
    shapeMaskFootprint: footprint,
    rectWidthPx: rectW,
    rectHeightPx: rectH,
    width: w,
    height: h,
  });

function contained(profile, center, rectW, rectH, footprint = null, w = 1200, h = 1200) {
  const xScale = footprint ? footprint.size : w;
  const yScale = footprint ? footprint.size : h;
  const mx = (center.x * w - (footprint ? footprint.offsetX : 0)) / xScale;
  const my = (center.y * h - (footprint ? footprint.offsetY : 0)) / yScale;
  return profile.rectContainedAt(mx, my, rectW / (xScale * 2), rectH / (yScale * 2));
}

test("clamp: a contained centre is returned exactly", () => {
  const center = { x: 0.5, y: 0.42 };
  assert.equal(clampHeart(center, 400, 60), center);
  const starCenter = { x: 0.5, y: 0.46 };
  assert.equal(clampStar(starCenter, 300, 50), starCenter);
});

test("clamp: drags into the cleft, the point, and the notch are pulled inside", () => {
  const cleft = clampHeart({ x: 0.5, y: 0.12 }, 400, 60);
  assert.ok(contained(heartProfile, cleft, 400, 60), JSON.stringify(cleft));
  // (No row assertion: since the Codex P2 fix the nearest feasible
  // row may legitimately be a lobe row above the cleft's bottom —
  // containment is the invariant.)

  const point = clampStar({ x: 0.5, y: 0.1 }, 300, 50);
  assert.ok(contained(starProfile, point, 300, 50), JSON.stringify(point));

  const notch = clampStar({ x: 0.5, y: 0.85 }, 300, 50);
  assert.ok(contained(starProfile, notch, 300, 50), JSON.stringify(notch));
  assert.ok(notch.y < 0.85, "pulled up out of the notch");

  const side = clampHeart({ x: 0.85, y: 0.42 }, 400, 60);
  assert.ok(contained(heartProfile, side, 400, 60), JSON.stringify(side));
  assert.ok(side.x < 0.85);
});

test("clamp: a rect that only fits off-centre keeps its row (Codex P2, PR #432)", () => {
  // 100x20px rect dragged to (0.45, 0.15) — inside the heart's left
  // lobe band, above the cleft. The centred half-width at that row
  // is 0, but the rect fits off-centre at ~(0.415, 0.15); the clamp
  // must stop at the lobe, not jump below the cleft.
  const result = clampHeart({ x: 0.45, y: 0.15 }, 100, 20);
  assert.equal(result.y, 0.15);
  assert.ok(Math.abs(result.x - 0.415) < 0.01, `expected x near 0.415, got ${result.x}`);
  assert.ok(contained(heartProfile, result, 100, 20));
});

test("clamp: an impossible rect falls back deterministically to the widest band", () => {
  // 1300px wide on a 1200px canvas: wider than the heart's maximum
  // centred width (0.42 half -> 1008px). No centre contains it; the
  // fallback is the widest band's row (NOT the canvas middle — the
  // heart is not vertically symmetric), centred horizontally.
  const result = clampHeart({ x: 0.5, y: 0.12 }, 1300, 60);
  assert.equal(result.x, 0.5);
  assert.ok(result.y > 0.28 && result.y < 0.42, `widest-band row, got ${result.y}`);
  assert.deepEqual(clampHeart({ x: 0.5, y: 0.12 }, 1300, 60), result);
});

test("clamp under the uniform layout works in footprint space", () => {
  const footprint = resolveShapeMaskFootprint(1200, 1800, 2);
  const result = clampHeart({ x: 0.5, y: 0.3 }, 400, 60, footprint, 1200, 1800);
  assert.ok(contained(heartProfile, result, 400, 60, footprint, 1200, 1800), JSON.stringify(result));
});

test("clamp: alignment seam — anchors convert to centres before the clamp", () => {
  // The clamp consumes glyph CENTRES; stored positions are anchors.
  // For each alignment, place a box whose glyph centre sits in the
  // heart's cleft, run the PreviewCanvas seam (anchor -> centre ->
  // clamp -> anchor), and require the resulting glyph rect contained.
  for (const align of ["left", "center", "right"]) {
    const rectW = 400;
    const rectH = 60;
    const centre = { x: 0.5, y: 0.12 };
    const anchorX = resolveTextCenterToAnchorX(centre.x, align, rectW, 1200);
    const backToCentre = resolveTextAnchorToCenterX(anchorX, align, rectW, 1200);
    assert.ok(Math.abs(backToCentre - centre.x) < 1e-12);
    const clamped = clampHeart({ x: backToCentre, y: centre.y }, rectW, rectH);
    const finalAnchor = resolveTextCenterToAnchorX(clamped.x, align, rectW, 1200);
    const finalCentre = resolveTextAnchorToCenterX(finalAnchor, align, rectW, 1200);
    assert.ok(
      contained(heartProfile, { x: finalCentre, y: clamped.y }, rectW, rectH),
      `${align}: glyph rect contained after the seam`,
    );
  }
});

test("clamp: shapes without a profile keep the historical pass-through", () => {
  const center = { x: 0.5, y: 0.12 };
  assert.equal(
    clampTextCenterToShape(center, {
      shape: "heart",
      rectWidthPx: 400,
      rectHeightPx: 60,
      width: 1200,
      height: 1200,
    }),
    center,
  );
});

/* ------------------------------------------------------------------ */
/* Wiring pins                                                         */
/* ------------------------------------------------------------------ */

test("wiring: render paths thread the interior profile into the fit", () => {
  const renderSky = read("src/lib/renderSky.ts");
  assert.match(renderSky, /shapeTextProfile: resolveShapeTextProfile\(shapeName\)/);
  assert.match(renderSky, /shapeTextProfile: resolveShapeTextProfile\(shape\)/);
  assert.match(renderSky, /shapeTextProfile: textLayout\?\.shapeTextProfile/);
  const preview = read("src/components/PreviewCanvas.tsx");
  assert.match(preview, /shapeTextProfile: resolveShapeTextProfile\(dragShapeLayoutRef\.current\.shape\)/);
  const store = read("src/lib/store.ts");
  assert.match(store, /applyDefaultTextRowsForShape\(\s*state\.textBoxes,\s*shape,\s*resolveShapeMaskFootprint\(/);
  assert.match(store, /remapDefaultTextRowsForFootprintChange\(\s*state\.textBoxes,\s*state\.shape,\s*resolveShapeMaskFootprint\(fromW, fromH, version\),\s*resolveShapeMaskFootprint\(toW, toH, version\),/);
});
