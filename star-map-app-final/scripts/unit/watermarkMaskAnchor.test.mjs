/**
 * #413 (design SQ-55): the watermark moves from a croppable bottom-left
 * corner wordmark to a mask-anchored centre wordmark whose complete
 * painted bounds lie inside the artwork mask AND inside the canvas's
 * central 50% region, each with 0.02D clearance (D = the mask bbox's
 * shorter dimension). Font envelope 0.035D–0.045D, painted width capped
 * at 0.36D. Central-region containment is the crop guarantee: every 25%
 * crop (any edge, or any corner removing 25% of width AND height)
 * retains the central region, hence 100% of the mark.
 *
 * These tests drive the pure solver (src/lib/watermarkPlacement.ts)
 * against analytic masks that replicate buildShapeClip's geometry
 * exactly (rectangle = full canvas; circle = procedural arc of radius
 * 0.44 x minDim; heart/star/diamond = SHAPE_PATHS scaled non-uniformly,
 * the legacy transform), with a Cinzel-like measurer. Pixel-level
 * proofs (paid zero-diff, containment/crop on real renders, re-sync)
 * live in scripts/watermark-acceptance/run.mjs.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  WATERMARK_CLEARANCE_RATIO,
  WATERMARK_MAX_FONT_RATIO,
  WATERMARK_MAX_WIDTH_RATIO,
  WATERMARK_MIN_FONT_RATIO,
  resolveWatermarkPlacement,
} from "../../src/lib/watermarkPlacement.ts";
import { SHAPE_PATHS, SHAPE_CIRCLE_INSET_RATIO } from "../../src/lib/shapes/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "../..");
const read = (rel) => readFileSync(join(appRoot, rel), "utf8");

/* ------------------------------------------------------------------ */
/* Analytic masks replicating buildShapeClip                           */
/* ------------------------------------------------------------------ */

// Flatten an SVG path of M/L/C/Z commands (the SHAPE_PATHS dialect)
// into polygon points in viewBox coordinates.
function flattenPath(d) {
  const tokens = d.match(/[MLCZ]|-?\d*\.?\d+/g);
  const points = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let cmd = null;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[MLCZ]/.test(tokens[i])) {
      cmd = tokens[i++];
      if (cmd === "Z") break;
    }
    if (cmd === "M" || cmd === "L") {
      cx = num();
      cy = num();
      points.push([cx, cy]);
      cmd = "L";
    } else if (cmd === "C") {
      const [x1, y1, x2, y2, x3, y3] = [num(), num(), num(), num(), num(), num()];
      const [x0, y0] = [cx, cy];
      for (let s = 1; s <= 24; s++) {
        const t = s / 24;
        const u = 1 - t;
        points.push([
          u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
        ]);
      }
      cx = x3;
      cy = y3;
    } else {
      throw new Error(`unsupported path command ${cmd}`);
    }
  }
  return points;
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let a = 0, b = polygon.length - 1; a < polygon.length; b = a++) {
    const [ax, ay] = polygon[a];
    const [bx, by] = polygon[b];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) {
      inside = !inside;
    }
  }
  return inside;
}

function analyticMask(shape, width, height) {
  if (shape === "rectangle") {
    return {
      bbox: { x: 0, y: 0, width, height },
      contains: (x, y) => x >= 0 && y >= 0 && x <= width && y <= height,
    };
  }
  if (shape === "circle") {
    // buildShapeClip's procedural arc — NOT the SHAPE_PATHS circle.
    const minDim = Math.min(width, height);
    const radius = minDim / 2 - minDim * SHAPE_CIRCLE_INSET_RATIO;
    const cx = width / 2;
    const cy = height / 2;
    return {
      bbox: { x: cx - radius, y: cy - radius, width: radius * 2, height: radius * 2 },
      contains: (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2,
    };
  }
  const entry = SHAPE_PATHS[shape];
  const [minX, minY, vbWidth, vbHeight] = entry.viewBox;
  const polygon = flattenPath(entry.d).map(([px, py]) => [
    (px - minX) * (width / vbWidth),
    (py - minY) * (height / vbHeight),
  ]);
  const xs = polygon.map(([x]) => x);
  const ys = polygon.map(([, y]) => y);
  const bbox = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
  return { bbox, contains: (x, y) => pointInPolygon(x, y, polygon) };
}

/* ------------------------------------------------------------------ */
/* Cinzel-like measurer: "StarMapCo" advances ~5.2em in bold Cinzel,   */
/* glyph bounds ~0.72em ascent / 0.08em descent (cap height, no        */
/* descenders in the wordmark).                                        */
/* ------------------------------------------------------------------ */

const cinzelMeasure = (fontSize) => ({
  left: 2.6 * fontSize,
  right: 2.6 * fontSize,
  ascent: 0.72 * fontSize,
  descent: 0.08 * fontSize,
});

/* ------------------------------------------------------------------ */
/* Independent containment re-check (does not reuse solver internals)  */
/* ------------------------------------------------------------------ */

function assertContained(placement, mask, width, height) {
  const D = Math.min(mask.bbox.width, mask.bbox.height);
  const clearance = WATERMARK_CLEARANCE_RATIO * D;
  const b = placement.bounds;
  // Central region with clearance.
  assert.ok(b.x >= 0.25 * width + clearance - 1e-9, `left ${b.x} vs ${0.25 * width + clearance}`);
  assert.ok(b.y >= 0.25 * height + clearance - 1e-9, "top inside central region");
  assert.ok(b.x + b.width <= 0.75 * width - clearance + 1e-9, "right inside central region");
  assert.ok(b.y + b.height <= 0.75 * height - clearance + 1e-9, "bottom inside central region");
  // Mask with clearance: dense grid over the dilated bounds.
  const x0 = b.x - clearance;
  const x1 = b.x + b.width + clearance;
  const y0 = b.y - clearance;
  const y1 = b.y + b.height + clearance;
  for (let x = x0; x <= x1; x += 1.5) {
    for (let y = y0; y <= y1; y += 1.5) {
      assert.ok(mask.contains(x, y), `dilated bounds point (${x}, ${y}) outside mask`);
    }
  }
  // Crop survival: every 25% crop's retained rectangle contains the
  // complete painted bounds (analytic form of the pixel crop test).
  const crops = [
    [0, 0, 0.75 * width, height], // right edge removed
    [0.25 * width, 0, width, height], // left edge removed
    [0, 0, width, 0.75 * height], // bottom edge removed
    [0, 0.25 * height, width, height], // top edge removed
    [0, 0, 0.75 * width, 0.75 * height], // corner crops (4)
    [0.25 * width, 0, width, 0.75 * height],
    [0, 0.25 * height, 0.75 * width, height],
    [0.25 * width, 0.25 * height, width, height],
  ];
  for (const [cx0, cy0, cx1, cy1] of crops) {
    assert.ok(
      b.x >= cx0 && b.y >= cy0 && b.x + b.width <= cx1 && b.y + b.height <= cy1,
      `bounds survive crop [${cx0},${cy0},${cx1},${cy1}]`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Acceptance matrix: shapes x aspects (SQ-55)                         */
/* ------------------------------------------------------------------ */

const SHAPES = ["rectangle", "circle", "heart", "star", "diamond"];
const ASPECTS = [
  ["square", 1200, 1200],
  ["4:5", 1200, 1500],
  ["2:3", 1200, 1800],
  ["3:2 landscape (renderer-only)", 1800, 1200],
];

for (const shape of SHAPES) {
  for (const [aspect, width, height] of ASPECTS) {
    test(`placement: ${shape} @ ${aspect} — contained, in envelope, crop-proof`, () => {
      const mask = analyticMask(shape, width, height);
      const placement = resolveWatermarkPlacement({ width, height, mask, measure: cinzelMeasure });
      assert.ok(placement, `${shape} @ ${aspect} must have a valid placement`);
      const D = Math.min(mask.bbox.width, mask.bbox.height);
      assert.ok(placement.fontSize >= WATERMARK_MIN_FONT_RATIO * D - 1e-9, "font at/above floor");
      assert.ok(placement.fontSize <= WATERMARK_MAX_FONT_RATIO * D + 1e-9, "font at/below start");
      assert.ok(
        placement.bounds.width <= WATERMARK_MAX_WIDTH_RATIO * D + 1e-6,
        `painted width ${placement.bounds.width} <= ${WATERMARK_MAX_WIDTH_RATIO * D}`,
      );
      assertContained(placement, mask, width, height);
    });
  }
}

test("placement: rectangle starts at the mask centre with the full 0.045D font", () => {
  const mask = analyticMask("rectangle", 1200, 1200);
  const placement = resolveWatermarkPlacement({ width: 1200, height: 1200, mask, measure: cinzelMeasure });
  assert.equal(placement.centerX, 600);
  assert.equal(placement.centerY, 600);
  assert.equal(placement.fontSize, WATERMARK_MAX_FONT_RATIO * 1200);
});

/* ------------------------------------------------------------------ */
/* Font envelope: width-cap reduction and the floor                    */
/* ------------------------------------------------------------------ */

test("envelope: an over-wide wordmark is reduced toward the floor to honour the 0.36D cap", () => {
  const wideMeasure = (fontSize) => ({
    left: 4.5 * fontSize,
    right: 4.5 * fontSize,
    ascent: 0.72 * fontSize,
    descent: 0.08 * fontSize,
  });
  const mask = analyticMask("rectangle", 1200, 1200);
  const placement = resolveWatermarkPlacement({ width: 1200, height: 1200, mask, measure: wideMeasure });
  assert.ok(placement);
  // Unreduced width would be (9 + 0.025) x 0.045D = 0.406D > cap.
  assert.ok(placement.fontSize < WATERMARK_MAX_FONT_RATIO * 1200);
  assert.ok(placement.fontSize >= WATERMARK_MIN_FONT_RATIO * 1200);
  assert.ok(placement.bounds.width <= WATERMARK_MAX_WIDTH_RATIO * 1200 + 1e-6);
});

test("envelope: a wordmark that cannot fit the cap at the floor has NO placement", () => {
  const hugeMeasure = (fontSize) => ({
    left: 6 * fontSize,
    right: 6 * fontSize,
    ascent: 0.72 * fontSize,
    descent: 0.08 * fontSize,
  });
  const mask = analyticMask("rectangle", 1200, 1200);
  assert.equal(
    resolveWatermarkPlacement({ width: 1200, height: 1200, mask, measure: hugeMeasure }),
    null,
  );
});

/* ------------------------------------------------------------------ */
/* Nearest-valid-position search                                       */
/* ------------------------------------------------------------------ */

function rectMaskWithHole(hole) {
  return {
    bbox: { x: 0, y: 0, width: 1200, height: 1200 },
    contains: (x, y) =>
      x >= 0 && y >= 0 && x <= 1200 && y <= 1200 &&
      !(x > hole.x && x < hole.x + hole.width && y > hole.y && y < hole.y + hole.height),
  };
}

test("search: a centre hole pushes the mark to the NEAREST valid position (vertical wins)", () => {
  const mask = rectMaskWithHole({ x: 550, y: 585, width: 100, height: 30 });
  const placement = resolveWatermarkPlacement({ width: 1200, height: 1200, mask, measure: cinzelMeasure });
  assert.ok(placement);
  // Centre (600,600) is invalid: the dilated bounds overlap the hole.
  // A horizontal escape needs |dx| >= 50 + 141 + 24 = 215; a vertical
  // one only has to clear the hole with the glyph bounds' near edge —
  // upward, the bounds bottom sits at centerY + descent + lw/2 =
  // centerY + 5, so |dy| >= 15 + 5 + 24 = 44, i.e. 48 on the 12px
  // search grid. The solver must take exactly that short vertical move
  // and stay on the centre column.
  assert.equal(placement.centerX, 600);
  assert.equal(placement.centerY, 552);
  assertContained(placement, mask, 1200, 1200);
});

test("search: equal-distance escapes resolve by the SQ-55 tie-breaks", () => {
  // Symmetric glyph bounds (ascent == descent) make the up and down
  // escapes from a centred hole exactly equidistant, with equal |dx|:
  // the tie-break (smaller |dy|, then smaller |dx|, then up/left) must
  // pick the upward one, deterministically.
  const symmetricMeasure = (fontSize) => ({
    left: 2.6 * fontSize,
    right: 2.6 * fontSize,
    ascent: 0.4 * fontSize,
    descent: 0.4 * fontSize,
  });
  const mask = rectMaskWithHole({ x: 550, y: 585, width: 100, height: 30 });
  const placement = resolveWatermarkPlacement({ width: 1200, height: 1200, mask, measure: symmetricMeasure });
  assert.ok(placement);
  // Bounds half-height = 0.4 x 54 + 0.675 = 22.275; escape needs
  // |dy| >= 15 + 22.275 + 24 = 61.3 -> 72 on the grid, either way.
  assert.equal(placement.centerX, 600);
  assert.equal(placement.centerY, 528);
  assertContained(placement, mask, 1200, 1200);
});

test("search: a vertical slit pushes the mark horizontally; the left escape wins the tie", () => {
  // Narrow wordmark (painted ~109px) so a sideways escape exists at
  // all inside the central region: it needs |dx| >= 15 + 54.7 + 24 =
  // 93.7 -> 96 on the grid, while a vertical escape needs ~247. Left
  // and right are equidistant with equal |dy| and |dx|; the
  // deterministic final tie-break takes the negative direction.
  const narrowMeasure = (fontSize) => ({
    left: 1.0 * fontSize,
    right: 1.0 * fontSize,
    ascent: 0.4 * fontSize,
    descent: 0.4 * fontSize,
  });
  const mask = rectMaskWithHole({ x: 585, y: 400, width: 30, height: 400 });
  const placement = resolveWatermarkPlacement({ width: 1200, height: 1200, mask, measure: narrowMeasure });
  assert.ok(placement);
  assert.equal(placement.centerY, 600);
  assert.equal(placement.centerX, 504);
  assertContained(placement, mask, 1200, 1200);
});

test("search: a mask with no valid interior returns null (never paints on the mat)", () => {
  // A 4px-wide diagonal thread inside a large bbox: plenty of bbox,
  // nowhere a 0.36D-wide mark can sit with clearance.
  const mask = {
    bbox: { x: 300, y: 300, width: 600, height: 600 },
    contains: (x, y) => Math.abs(y - x) <= 2 && x >= 300 && x <= 900,
  };
  assert.equal(
    resolveWatermarkPlacement({ width: 1200, height: 1200, mask, measure: cinzelMeasure }),
    null,
  );
});

/* ------------------------------------------------------------------ */
/* Paid-state fence + composition wiring (source pins)                 */
/*                                                                     */
/* The behavioural half of the fence — paid render byte-identical to   */
/* the watermark-bypassed render, and the entitlement re-sync repaint  */
/* — is proven on real pixels in scripts/watermark-acceptance. These   */
/* pins lock the wiring those proofs rely on.                          */
/* ------------------------------------------------------------------ */

test("fence: drawWatermark's early return precedes any measurement, allocation, or painting", () => {
  const source = read("src/lib/renderSky.ts");
  const start = source.indexOf("function drawWatermark(");
  assert.notEqual(start, -1);
  const body = source.slice(start, source.indexOf("\n}", start));
  const guard = body.indexOf("if (!args.show) return;");
  const paint = body.indexOf("paintWatermark(ctx, args);");
  assert.notEqual(guard, -1, "early return guard present");
  assert.notEqual(paint, -1, "painting delegated after the guard");
  assert.ok(guard < paint, "guard runs before painting");
  // Nothing but the guard and the delegation may run in the wrapper
  // body (the signature's type annotation precedes the opening brace).
  const statements = body
    .slice(body.indexOf(") {") + 3)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//"));
  assert.deepEqual(statements, ["if (!args.show) return;", "paintWatermark(ctx, args);"]);
});

test("fence: PreviewCanvas keeps watermark: !paid — on the text-layer pass, above the text", () => {
  const source = read("src/components/PreviewCanvas.tsx");
  // The base render no longer paints the mark (the overlay above it
  // would cover it); the text-layer call carries the !paid wiring.
  const baseCall = source.slice(source.indexOf("renderStarMap({"), source.indexOf("renderStarMapTextLayer({"));
  assert.match(baseCall, /watermark: false,/);
  assert.ok(!/watermark: !paid/.test(baseCall), "base render must not paint the mark");
  const layerCall = source.slice(source.indexOf("renderStarMapTextLayer({"));
  assert.match(layerCall, /watermark: !paid,/);
  // The entitlement re-sync repaint: `paid` is a dependency of the
  // text-layer effect, so resolving paid repaints without the mark.
  const deps = layerCall.slice(layerCall.indexOf("}, ["));
  assert.match(deps, /\bpaid,\n  \]\);/);
});

test("fence: paid/HD/print callers still pass watermark: false; the share image keeps watermark: true", () => {
  const download = read("src/app/download/DownloadClient.tsx");
  assert.equal((download.match(/watermark: false/g) ?? []).length, 3);
  const editor = read("src/components/EditorExperience.tsx");
  // Print + card checkout renders stay watermark-free.
  assert.ok((editor.match(/watermark: false,/g) ?? []).length >= 2);
  // The public share image keeps its existing always-watermarked
  // policy (SQ-55: no entitlement-policy change in this issue).
  const share = editor.slice(editor.indexOf("const handleShareImage"));
  assert.match(share, /watermark: true,/);
  // Free preview exports watermark, HD exports do not (both editors).
  assert.match(editor, /const watermark = mode !== "hd";/);
  const simplified = read("src/components/SimplifiedEditor/SimplifiedEditor.tsx");
  assert.match(simplified, /const watermark = mode !== "hd";/);
});

test("composition: renderStarMap draws the watermark AFTER the text layer content", () => {
  const source = read("src/lib/renderSky.ts");
  const main = source.slice(source.indexOf("export function renderStarMap({"), source.indexOf("export function renderStarMapTextLayer"));
  assert.ok(main.indexOf("drawText(ctx, width, targetHeight") < main.indexOf("drawWatermark(ctx, {"));
  const layer = source.slice(
    source.indexOf("export function renderStarMapTextLayer"),
    source.indexOf("import { LRUCache }"),
  );
  assert.ok(layer.indexOf("drawText(ctx, width, height") < layer.indexOf("drawWatermark(ctx, {"));
});

test("composition: the renderer consumes the SAME clip path for the sky and the watermark", () => {
  const source = read("src/lib/renderSky.ts");
  const main = source.slice(source.indexOf("export function renderStarMap({"), source.indexOf("export function renderStarMapTextLayer"));
  assert.match(main, /const clipPath = buildShapeClip\(shapeName, width, targetHeight, shapeLayoutVersion\);/);
  assert.match(main, /drawWatermark\(ctx, \{\n\s+width,\n\s+height: targetHeight,\n\s+show: watermark,\n\s+clipPath,/);
  // The harness-facing surface the acceptance run drives.
  assert.match(source, /export function paintWatermark\(/);
  assert.match(source, /export function buildShapeClip\(/);
});
