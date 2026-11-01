/**
 * S93-2 classes 2 + 3 — alignment anchors and destination-aware fitting.
 *
 * Class 2: a stored text position's x is the renderer's drawing
 * ANCHOR (drawText paints at position.x with ctx.textAlign =
 * box.align), but the renderer clamped it as though it were the
 * glyph CENTRE — a valid left anchor at 0 was shifted half a line
 * inward, and a left anchor at .9 painted 120px past the canvas
 * edge. resolveTextLineLayout converts anchor -> centre with the
 * box's alignment, clamps the centre, and converts back.
 *
 * Class 3: the fit bound offered the shape's CENTRED width to a
 * line placed anywhere. The resolver now derives the available
 * width from the line's own anchor against the shape's safe
 * interval at its own rows (frame inset / diamond tent / heart-star
 * interior intervals, never bridged across a cleft or notch).
 *
 * The legacy oracle below replicates the pre-fix drawText pipeline
 * (centred bound + centre-clamp of the anchor) so the identity
 * controls are behavioural, not asserted by fiat: centre-aligned
 * fixtures and contained aligned fixtures must resolve IDENTICALLY
 * through both pipelines; the fixtures the old pipeline mishandled
 * must differ in exactly the corrected direction.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SHAPE_PATHS } from "../../src/lib/shapes/index.ts";
import {
  buildShapeTextProfile,
  shapeSpanSampleRows,
} from "../../src/lib/shapeTextGeometry.ts";
import {
  resolveShapeTextAvailableWidth,
  resolveTextFitScale,
  resolveTextLineLayout,
  resolveTextSpanSampleRows,
} from "../../src/lib/textFit.ts";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "../..");
const read = (rel) => readFileSync(join(appRoot, rel), "utf8");

const heartProfile = buildShapeTextProfile("heart", SHAPE_PATHS.heart.d, SHAPE_PATHS.heart.viewBox);
const starProfile = buildShapeTextProfile("star", SHAPE_PATHS.star.d, SHAPE_PATHS.star.viewBox);

const approx = (actual, expected, eps = 1e-9) =>
  Math.abs(actual - expected) <= eps * Math.max(1, Math.abs(expected));

function assertApprox(actual, expected, label, eps) {
  assert.ok(approx(actual, expected, eps), `${label}: expected ~${expected}, got ${actual}`);
}

/* ------------------------------------------------------------------ */
/* The pre-fix pipeline, replicated as the identity oracle            */
/* ------------------------------------------------------------------ */

const clampNum = (v, min, max) => Math.min(max, Math.max(min, v));

function legacyCenterNormalized(position, index, textWidth, textHeight, width, height) {
  const scale = width / 1200;
  const lineGapNorm = (28 * scale) / height;
  const rawX = clampNum(position?.x ?? 0.5, 0, 1);
  const rawY = clampNum(position?.y ?? 0.72 + index * lineGapNorm, 0, 1);
  const halfWidth = textWidth / (width * 2);
  const halfHeight = textHeight / (height * 2);
  const minX = clampNum(halfWidth, 0, 0.5);
  const maxX = clampNum(1 - halfWidth, 0.5, 1);
  const minY = clampNum(halfHeight, 0, 0.5);
  const maxY = clampNum(1 - halfHeight, 0.5, 1);
  return { x: clampNum(rawX, minX, maxX), y: clampNum(rawY, minY, maxY) };
}

function legacyLayout(args) {
  const {
    shape, frameEnabled = true, footprint = null, profile = null,
    position, index = 0, align = "center",
    measuredWidth, baseFontSize, width, height,
  } = args;
  const provisional = legacyCenterNormalized(position, index, measuredWidth, baseFontSize * 1.2, width, height);
  const available = resolveShapeTextAvailableWidth({
    shape, frameEnabled,
    shapeMaskFootprint: footprint, shapeTextProfile: profile,
    centerYNorm: provisional.y, lineHeightPx: baseFontSize * 1.2,
    width, height,
  });
  const fitScale = resolveTextFitScale(measuredWidth, available);
  const fontSize = baseFontSize * fitScale;
  const textWidth = measuredWidth * fitScale;
  const textHeight = fontSize * 1.2;
  const final = legacyCenterNormalized(position, index, textWidth, textHeight, width, height);
  const px = final.x * width;
  const py = final.y * height;
  let left = px;
  if (align === "center") left = px - textWidth / 2;
  if (align === "right") left = px - textWidth;
  return {
    fitScale, fontSize, anchorX: final.x, centerY: final.y,
    bounds: { x: left, y: py - textHeight / 2, width: textWidth, height: textHeight },
  };
}

function newLayout(args) {
  const {
    shape, frameEnabled = true, footprint = null, profile = null,
    position, index = 0, align = "center",
    measuredWidth, baseFontSize, width, height,
  } = args;
  const scale = width / 1200;
  return resolveTextLineLayout({
    shape, frameEnabled,
    shapeMaskFootprint: footprint, shapeTextProfile: profile,
    position,
    defaultX: 0.5,
    defaultY: 0.72 + index * ((28 * scale) / height),
    align,
    measuredWidthPx: measuredWidth,
    baseFontSizePx: baseFontSize,
    width, height,
  });
}

function assertMatchesLegacy(args, label) {
  const legacy = legacyLayout(args);
  const next = newLayout(args);
  assertApprox(next.fitScale, legacy.fitScale, `${label} fitScale`, 1e-9);
  assertApprox(next.fontSizePx, legacy.fontSize, `${label} fontSize`, 1e-9);
  assertApprox(next.anchorX, legacy.anchorX, `${label} anchorX`, 1e-9);
  assertApprox(next.centerY, legacy.centerY, `${label} centerY`, 1e-9);
  assertApprox(next.bounds.x, legacy.bounds.x, `${label} bounds.x`, 1e-6);
  assertApprox(next.bounds.y, legacy.bounds.y, `${label} bounds.y`, 1e-6);
  assertApprox(next.bounds.width, legacy.bounds.width, `${label} bounds.width`, 1e-6);
  assertApprox(next.bounds.height, legacy.bounds.height, `${label} bounds.height`, 1e-9);
  return next;
}

/* ------------------------------------------------------------------ */
/* Class 2: the design's anchor fixtures (width 1200, 240px line)     */
/* ------------------------------------------------------------------ */

const anchorFixture = (align, x) => ({
  shape: "circle", // full-canvas interval: isolates the anchor math
  align,
  position: { x, y: 0.5 },
  measuredWidth: 240,
  baseFontSize: 28,
  width: 1200,
  height: 1200,
});

test("class 2: left anchor at 0 remains anchor 0 (legacy shifted it to .1)", () => {
  const next = newLayout(anchorFixture("left", 0));
  assertApprox(next.anchorX, 0, "anchorX");
  assertApprox(next.bounds.x, 0, "bounds.x", 1e-6);
  const legacy = legacyLayout(anchorFixture("left", 0));
  assertApprox(legacy.anchorX, 0.1, "legacy oracle anchorX (the defect)");
});

test("class 2: left anchor at .9 — the composed fixes fit the line at its anchor instead of spilling", () => {
  // Composition note: the design's per-class fixture ("left x=.9
  // resolves to anchor .8") presumes the class-2 clamp acting on
  // the UNFITTED line under the old centred fit bound. Landed
  // together (as here), the class-3 fit runs first — the design's
  // own sequence: fit once at the stored anchor, then clamp with
  // the final dimensions — and a 240px line at a .9 anchor has only
  // 120px of anchor capacity, so it fits to the floor and the
  // fitted line is contained at its ORIGINAL anchor. Both
  // compositions honour the class-2 invariants (the glyph never
  // spills, the anchor is never treated as a centre, bounds agree
  // with the painted anchor); wherever the fit does not engage, the
  // resolutions are the design's fixture values (x=0 -> 0 and
  // x=1 -> 1 below, and the contained-fixture identity test).
  const next = newLayout(anchorFixture("left", 0.9));
  assertApprox(next.fitScale, 0.5, "fit floored by the anchor capacity");
  assertApprox(next.anchorX, 0.9, "fitted line stays at its anchor");
  assertApprox(next.bounds.x, 1080, "bounds.x", 1e-6);
  assertApprox(next.bounds.x + next.bounds.width, 1200, "glyph right edge at the canvas edge", 1e-6);
  assert.equal(next.overflow, false);
  const legacy = legacyLayout(anchorFixture("left", 0.9));
  assertApprox(legacy.bounds.x + legacy.bounds.width, 1320, "legacy oracle spills to 1320 (the defect)", 1e-6);
});

test("class 2: right anchor at 1 remains anchor 1; right anchor at .1 fits at its anchor", () => {
  const atEdge = newLayout(anchorFixture("right", 1));
  assertApprox(atEdge.anchorX, 1, "anchorX at 1");
  assertApprox(atEdge.bounds.x, 960, "bounds.x at 1", 1e-6);
  // Same composition as the left case: 120px of capacity at a .1
  // right anchor fits the 240px line to the floor in place
  // (the class-2-only resolution would move it to anchor .2 at
  // full size under the old centred bound).
  const near = newLayout(anchorFixture("right", 0.1));
  assertApprox(near.fitScale, 0.5, "fit floored by the anchor capacity");
  assertApprox(near.anchorX, 0.1, "fitted line stays at its anchor");
  assertApprox(near.bounds.x, 0, "bounds.x at .1", 1e-6);
  assertApprox(near.bounds.x + near.bounds.width, 120, "glyph right edge at the anchor", 1e-6);
  assert.equal(near.overflow, false);
});

test("class 2: recorded bounds and the painted anchor agree for every alignment", () => {
  for (const [align, x] of [["left", 0.3], ["center", 0.5], ["right", 0.7]]) {
    const next = newLayout(anchorFixture(align, x));
    const anchorPx = next.anchorX * 1200;
    const expectedLeft =
      align === "left" ? anchorPx : align === "right" ? anchorPx - 240 : anchorPx - 120;
    assertApprox(next.bounds.x, expectedLeft, `${align} bounds left`, 1e-6);
    assertApprox(next.bounds.x + next.bounds.width / 2, next.centerX * 1200, `${align} centre`, 1e-6);
  }
});

test("class 2: contained aligned fixtures the old clamp left unchanged stay identical", () => {
  // Left x=.1 with a 240px line: the old centre-clamp [.1, .9] left
  // the anchor at .1, so the whole resolution must match legacy.
  const left = { ...anchorFixture("left", 0.1) };
  const legacyLeft = legacyLayout(left);
  const nextLeft = newLayout(left);
  assertApprox(nextLeft.anchorX, legacyLeft.anchorX, "left anchor");
  assertApprox(nextLeft.bounds.x, legacyLeft.bounds.x, "left bounds.x", 1e-6);
  const right = { ...anchorFixture("right", 0.9) };
  const legacyRight = legacyLayout(right);
  const nextRight = newLayout(right);
  assertApprox(nextRight.anchorX, legacyRight.anchorX, "right anchor");
  assertApprox(nextRight.bounds.x, legacyRight.bounds.x, "right bounds.x", 1e-6);
});

/* ------------------------------------------------------------------ */
/* Identity controls: centre-aligned fixtures resolve as legacy       */
/* ------------------------------------------------------------------ */

test("identity: centre-aligned fixtures match the legacy pipeline across shapes", () => {
  assertMatchesLegacy(
    { shape: "rectangle", position: { x: 0.5, y: 0.12 }, measuredWidth: 625, baseFontSize: 52, width: 1200, height: 1500 },
    "framed rectangle title",
  );
  assertMatchesLegacy(
    { shape: "rectangle", position: { x: 0.5, y: 0.18 }, measuredWidth: 2000, baseFontSize: 36, width: 1200, height: 1500 },
    "framed rectangle shrunk line",
  );
  assertMatchesLegacy(
    { shape: "diamond", position: { x: 0.5, y: 0.485 }, measuredWidth: 349, baseFontSize: 36, width: 1200, height: 1200 },
    "diamond subtitle",
  );
  assertMatchesLegacy(
    { shape: "diamond", position: { x: 0.5, y: 0.42 }, measuredWidth: 900, baseFontSize: 52, width: 1200, height: 1200 },
    "diamond floored title",
  );
  assertMatchesLegacy(
    { shape: "heart", profile: heartProfile, position: { x: 0.5, y: 0.38 }, measuredWidth: 700, baseFontSize: 52, width: 1200, height: 1200 },
    "heart title",
  );
  assertMatchesLegacy(
    { shape: "star", profile: starProfile, position: { x: 0.5, y: 0.43 }, measuredWidth: 800, baseFontSize: 52, width: 1200, height: 1200 },
    "star title",
  );
  assertMatchesLegacy(
    { shape: "circle", position: { x: 0.5, y: 0.9 }, measuredWidth: 500, baseFontSize: 28, width: 1200, height: 1200 },
    "circle dedication",
  );
  assertMatchesLegacy(
    { shape: "rectangle", frameEnabled: false, position: { x: 0.5, y: 0.5 }, measuredWidth: 5000, baseFontSize: 40, width: 1200, height: 1200 },
    "oversized line (centre pinned by the fallback)",
  );
  assertMatchesLegacy(
    { shape: "rectangle", position: undefined, index: 1, measuredWidth: 400, baseFontSize: 28, width: 1200, height: 1200 },
    "default-position box",
  );
});

/* ------------------------------------------------------------------ */
/* Class 3: destination-aware fitting                                 */
/* ------------------------------------------------------------------ */

test("class 3: off-centre framed-rectangle line fits its own interval, not the centred width", () => {
  // Frame interval at 1200x1200 is [22, 1178]. A left-anchored line
  // at x=.9 has 98px of capacity; legacy offered the centred 1156px.
  const args = {
    shape: "rectangle", align: "left",
    position: { x: 0.9, y: 0.5 },
    measuredWidth: 300, baseFontSize: 28, width: 1200, height: 1200,
  };
  const legacy = legacyLayout(args);
  assertApprox(legacy.fitScale, 1, "legacy offered the centred width (the defect)");
  const next = newLayout(args);
  assertApprox(next.fitScale, 0.5, "fit floored by the anchor's own capacity");
  assertApprox(next.fontSizePx, 14, "fontSize");
  // The centre clamp then seats the floored line inside the frame.
  assertApprox(next.bounds.x, 1028, "bounds.x", 1e-6);
  assertApprox(next.bounds.x + next.bounds.width, 1178, "bounds right edge at the frame", 1e-6);
  assert.equal(next.overflow, false);
});

test("class 3: mirrored right-aligned case seats against the left frame edge", () => {
  const next = newLayout({
    shape: "rectangle", align: "right",
    position: { x: 0.1, y: 0.5 },
    measuredWidth: 300, baseFontSize: 28, width: 1200, height: 1200,
  });
  assertApprox(next.fitScale, 0.5, "fitScale");
  assertApprox(next.bounds.x, 22, "bounds.x at the frame", 1e-6);
  assert.equal(next.overflow, false);
});

test("class 3: diamond capacity collapses for an off-centre anchor at a narrow row", () => {
  const base = {
    shape: "diamond", align: "center",
    position: { x: 0.5, y: 0.2 },
    measuredWidth: 200, baseFontSize: 36, width: 1200, height: 1200,
  };
  const centred = newLayout(base);
  assertApprox(centred.fitScale, 1, "centred anchor fits at the narrow row");
  const offCentre = newLayout({ ...base, position: { x: 0.65, y: 0.2 } });
  assertApprox(offCentre.fitScale, 0.5, "off-centre anchor has no capacity at that row");
  assert.equal(offCentre.overflow, true);
});

test("class 3: heart cleft — a centred anchor has no capacity, a lobe anchor fits", () => {
  // Rows .14–.16 sit above the cleft's bottom (.20): the centre is
  // OUTSIDE the mask there; the cross-section is two lobes.
  const base = {
    shape: "heart", profile: heartProfile, align: "left",
    measuredWidth: 100, baseFontSize: 20, width: 1200, height: 1200,
  };
  const centred = newLayout({ ...base, align: "center", position: { x: 0.5, y: 0.15 } });
  assertApprox(centred.fitScale, 0.5, "centred anchor in the cleft floors");
  assert.equal(centred.overflow, true);
  const legacyCentred = legacyLayout({ ...base, align: "center", position: { x: 0.5, y: 0.15 }, profile: heartProfile });
  assertApprox(legacyCentred.fitScale, 0.5, "legacy also floors the centred cleft line (1px bound)");

  const lobe = newLayout({ ...base, position: { x: 0.3, y: 0.15 } });
  assertApprox(lobe.fitScale, 1, "lobe-anchored line fits at full size");
  assert.equal(lobe.overflow, false);
  assert.ok(lobe.bounds.x + lobe.bounds.width <= 600, "lobe line stays in the left half (no cleft bridging)");
});

test("class 3: star bottom notch — a centred anchor below the notch has no capacity", () => {
  const next = newLayout({
    shape: "star", profile: starProfile, align: "center",
    position: { x: 0.5, y: 0.8 },
    measuredWidth: 100, baseFontSize: 20, width: 1200, height: 1200,
  });
  assertApprox(next.fitScale, 0.5, "fitScale");
  assert.equal(next.overflow, true);
});

test("class 3: a line wider than every interval at the floor reports overflow and stays put", () => {
  const next = newLayout({
    shape: "rectangle", align: "left",
    position: { x: 0, y: 0.5 },
    measuredWidth: 2000, baseFontSize: 28, width: 1200, height: 1200,
  });
  assert.equal(next.overflow, true);
  assertApprox(next.bounds.x, 0, "anchor left unmoved when no interval can hold the line", 1e-6);
});

test("class 3: the fit runs once, before the centre clamps (no refit at the moved position)", () => {
  const source = read("src/lib/textFit.ts");
  const start = source.indexOf("export function resolveTextLineLayout");
  const end = source.indexOf("Default text-box rows", start);
  const body = source.slice(start, end === -1 ? undefined : end);
  const fitAt = body.indexOf("resolveTextFitScale(");
  const clampAt = body.indexOf("clampCenterIntoIntervalsPx(");
  assert.ok(fitAt !== -1 && clampAt !== -1 && fitAt < clampAt, "fit precedes the centre clamps");
  assert.equal(body.split("resolveTextFitScale(").length - 1, 1, "exactly one fit computation");
});

test("resolver is deterministic and does not mutate its input", () => {
  const input = {
    shape: "heart",
    frameEnabled: true,
    shapeMaskFootprint: null,
    shapeTextProfile: heartProfile,
    position: { x: 0.3, y: 0.15 },
    defaultX: 0.5,
    defaultY: 0.72,
    align: "left",
    measuredWidthPx: 100,
    baseFontSizePx: 20,
    width: 1200,
    height: 1200,
  };
  const snapshot = JSON.stringify({ ...input, shapeTextProfile: undefined });
  const first = resolveTextLineLayout(input);
  const second = resolveTextLineLayout(input);
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify({ ...input, shapeTextProfile: undefined }), snapshot);
});

test("the span sampler in textFit matches shapeTextGeometry's exactly", () => {
  // textFit.ts mirrors shapeSpanSampleRows over the profile's
  // public criticalRows to stay free of runtime imports; pin the
  // two to identical outputs so they can never drift apart.
  for (const profile of [heartProfile, starProfile]) {
    for (const [vTop, vBottom] of [[0, 1], [0.14, 0.16], [0.35, 0.41], [0.8, 0.84], [0.5, 0.5], [-0.1, 1.2]]) {
      assert.deepEqual(
        resolveTextSpanSampleRows(profile, vTop, vBottom),
        shapeSpanSampleRows(profile, vTop, vBottom),
        `${profile.shape} span ${vTop}..${vBottom}`,
      );
    }
  }
});

test("wiring: the editor recheck reads the centre from the rendered rectangle", () => {
  const source = read("src/components/PreviewCanvas.tsx");
  assert.match(source, /\(freshRect\.x \+ freshRect\.width \/ 2\) \/ width/);
  assert.match(source, /\(freshRect\.y \+ freshRect\.height \/ 2\) \/ height/);
});
