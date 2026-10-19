/**
 * Fleet PR #17, finding B: an off-centre user-dragged text box can
 * spill outside the Diamond, because the render fit
 * (resolveShapeTextAvailableWidth) sizes a line for a CENTRED
 * position — its available width is the mask's width across the
 * line's own span — while a dragged box keeps that fitted size
 * wherever it is dropped. David's decision (2026-10-19): CONSTRAIN —
 * dragged text stays inside the design/print-safe area, with free
 * movement inside it.
 *
 * The fix is a second clamp stage in the editor's drag pipeline.
 * Position writes map (verified from source): the ONLY interactive
 * position writers are PreviewCanvas's pointer drag (rAF preview,
 * committed on pointerup) and its keyboard nudge, and both already
 * funnel through clampPositionToCanvas with the dragged box's
 * rendered glyph rect in hand. Every other updateTextBox call writes
 * text/font/size/colour/align/shadow, never position; setTextBoxes
 * writes are authored content (presets, samples, shape changes,
 * hydration). The store setters are generic and hold no render
 * geometry (no canvas, no font metrics), so the clamp lives where
 * the rect exists: clampTextCenterToShape (src/lib/textFit.ts — the
 * same module, and the same resolveDiamondHalfWidthAt /
 * frame-inset geometry, the fit bounds against), applied in
 * PreviewCanvas right after clampPositionToCanvas, and once more at
 * commit against the rect as rendered at the preview position. The
 * clamped position is what gets stored, so preview and export —
 * both render the stored position through the same drawText — stay
 * in parity by construction.
 *
 * Scope, from the same source evidence: the fit bounds ONLY the
 * diamond (mask width at the line's row) and the framed rectangle
 * (frame inner bounds); every other shape is deliberately bounded
 * by the full canvas, and their designed layouts place text outside
 * the sky shape's chord (the circle default title row, y=0.12, sits
 * above the disc's narrow top — its corners extend past the chord
 * by design). The clamp mirrors the fit's scope exactly: diamond +
 * framed rectangle are contained; circle/heart/star and frameless
 * rectangles pass through unchanged (pinned below).
 *
 * Rects below are the RENDERED glyph rects drawText records (fitted
 * width x fitted fontSize * 1.2) at fit scale 1, from the measurement
 * table pinned in personaSweepU14DiamondFix.test.mjs (the fonts' own
 * binaries): sample title 624.77 @52, sample subtitle 349.10 @36,
 * sample dedication 138.27 @32, store title 373.97 @48, store
 * subtitle 308.48 @28, store dedication 307.27 @26 — on the 1200px
 * base canvas.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DIAMOND_APEX_BOTTOM,
  DIAMOND_APEX_TOP,
  DIAMOND_TEXT_BOX_ROWS,
  STANDARD_TEXT_BOX_ROWS,
  clampTextCenterToShape,
  resolveDiamondHalfWidthAt,
  resolveFrameInsetPx,
  resolveFrameTextFitPaddingPx,
} from "../../src/lib/textFit.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const W = 1200; // BASE_CANVAS_WIDTH, square canvas
const clampDiamond = (center, rectWidthPx, rectHeightPx) =>
  clampTextCenterToShape(center, {
    shape: "diamond",
    frameEnabled: true,
    rectWidthPx,
    rectHeightPx,
    width: W,
    height: W,
  });

const near = (actual, expected, label) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-6,
    `${label}: expected ~${expected}, got ${actual}`,
  );

// The rect at `center` is fully inside the diamond mask: its rows
// stay between the apexes and, at both end rows (the tent function's
// extremes over the span), its edges stay inside the mask width.
const assertDiamondContained = (center, rectWidthPx, rectHeightPx) => {
  const hw = rectWidthPx / (W * 2);
  const hh = rectHeightPx / (W * 2);
  const top = center.y - hh;
  const bottom = center.y + hh;
  assert.ok(top >= DIAMOND_APEX_TOP - 1e-9, `top row ${top} above the top apex`);
  assert.ok(bottom <= DIAMOND_APEX_BOTTOM + 1e-9, `bottom row ${bottom} below the bottom apex`);
  for (const row of [top, bottom]) {
    const half = resolveDiamondHalfWidthAt(row);
    assert.ok(center.x - hw >= 0.5 - half - 1e-9, `left edge spills at row ${row}`);
    assert.ok(center.x + hw <= 0.5 + half + 1e-9, `right edge spills at row ${row}`);
  }
};

const SAMPLE = {
  title: { rectWidthPx: 624.77, rectHeightPx: 52 * 1.2 },
  subtitle: { rectWidthPx: 349.1, rectHeightPx: 36 * 1.2 },
  dedication: { rectWidthPx: 138.27, rectHeightPx: 32 * 1.2 },
};
const STORE = {
  title: { rectWidthPx: 373.97, rectHeightPx: 48 * 1.2 },
  subtitle: { rectWidthPx: 308.48, rectHeightPx: 28 * 1.2 },
  dedication: { rectWidthPx: 307.27, rectHeightPx: 26 * 1.2 },
};

test("diamond: dragging the title toward the apex clamps at the mask edge (fleet B repro)", () => {
  const { rectWidthPx, rectHeightPx } = SAMPLE.title;
  // Pre-fix behaviour being pinned against: at y=0.10 the mask
  // half-width is ~0.04 — the 624.77px title spilled far outside.
  const result = clampDiamond({ x: 0.85, y: 0.1 }, rectWidthPx, rectHeightPx);
  // The centre relocates to the nearest containable row band: for
  // hw=0.26032 the end rows must stay within 0.44-hw of the middle,
  // so minY = 0.5 - (0.44 - hw) + hh = 0.34632, where the mask across
  // the span is exactly the rect's width — zero horizontal slack,
  // so x is centred too.
  near(result.y, 0.34632, "apex drag y");
  near(result.x, 0.5, "apex drag x");
  assertDiamondContained(result, rectWidthPx, rectHeightPx);
});

test("diamond: a wide box dragged to a narrow row relocates to the nearest containable row", () => {
  const { rectWidthPx, rectHeightPx } = SAMPLE.title;
  // y=0.20: the mask there is ~336px wide, narrower than the title.
  // The clamp does not shrink or clip the box — it moves the centre
  // to the first row band where the mask fits the rect, centred.
  const result = clampDiamond({ x: 0.5, y: 0.2 }, rectWidthPx, rectHeightPx);
  near(result.y, 0.34632, "narrow-row y");
  near(result.x, 0.5, "narrow-row x");
  assertDiamondContained(result, rectWidthPx, rectHeightPx);
});

test("diamond: side drag at a mid row clamps x at the mask edge and leaves y alone (slides)", () => {
  const { rectWidthPx, rectHeightPx } = SAMPLE.subtitle;
  const result = clampDiamond({ x: 0.98, y: DIAMOND_TEXT_BOX_ROWS.subtitle }, rectWidthPx, rectHeightPx);
  // Band across the subtitle's span at its own row: narrower end row
  // 0.467 -> half-width 0.407; slack = 0.407 - 0.14546 = 0.26154167.
  near(result.x, 0.76154167, "side drag x");
  assert.equal(result.y, DIAMOND_TEXT_BOX_ROWS.subtitle);
  assertDiamondContained(result, rectWidthPx, rectHeightPx);
});

test("diamond: a rect wider than the mask's widest row is centred (no position contains it)", () => {
  // 1100px wide on a 1200px canvas: half-width 0.4583 > the mask max
  // 0.44. Reported behaviour: the clamp centres the box on both
  // axes; the spill that remains is the fit floor's pre-existing
  // bounded spill class, not something a position can fix.
  const result = clampDiamond({ x: 0.2, y: 0.15 }, 1100, 52 * 1.2);
  assert.equal(result.x, 0.5);
  assert.equal(result.y, 0.5);
});

test("diamond: interior drags are unclamped, exact values out", () => {
  const { rectWidthPx, rectHeightPx } = SAMPLE.subtitle;
  const result = clampDiamond({ x: 0.62, y: 0.55 }, rectWidthPx, rectHeightPx);
  assert.equal(result.x, 0.62);
  assert.equal(result.y, 0.55);
});

test("diamond: every designed default position passes through byte-for-byte", () => {
  for (const set of [SAMPLE, STORE]) {
    for (const [id, rect] of Object.entries(set)) {
      const position = { x: 0.5, y: DIAMOND_TEXT_BOX_ROWS[id] };
      const result = clampDiamond(position, rect.rectWidthPx, rect.rectHeightPx);
      assert.equal(result.x, position.x, `${id} x moved`);
      assert.equal(result.y, position.y, `${id} y moved`);
    }
  }
});

test("rectangle (framed): drags clamp at the frame's inner bound plus padding, both axes", () => {
  const { rectWidthPx, rectHeightPx } = SAMPLE.title;
  const insetPx = resolveFrameInsetPx(W, W) + resolveFrameTextFitPaddingPx(W);
  assert.equal(insetPx, 22); // 16 frame inset + 6 padding on the 1200px canvas
  const clampRect = (center) =>
    clampTextCenterToShape(center, {
      shape: "rectangle",
      frameEnabled: true,
      rectWidthPx,
      rectHeightPx,
      width: W,
      height: W,
    });
  const low = clampRect({ x: 0.02, y: 0.01 });
  near(low.x, (insetPx + rectWidthPx / 2) / W, "frame low x");
  near(low.y, (insetPx + rectHeightPx / 2) / W, "frame low y");
  // The glyph edge lands exactly on the safe bound, not past it.
  near((low.x - rectWidthPx / (W * 2)) * W, insetPx, "frame left edge");
  const high = clampRect({ x: 0.99, y: 0.99 });
  near(high.x, 1 - (insetPx + rectWidthPx / 2) / W, "frame high x");
  near(high.y, 1 - (insetPx + rectHeightPx / 2) / W, "frame high y");
});

test("rectangle: frameless passes through; undefined shape with a frame clamps like rectangle", () => {
  const { rectWidthPx, rectHeightPx } = SAMPLE.title;
  const dragged = { x: 0.02, y: 0.01 };
  const frameless = clampTextCenterToShape(dragged, {
    shape: "rectangle",
    frameEnabled: false,
    rectWidthPx,
    rectHeightPx,
    width: W,
    height: W,
  });
  assert.equal(frameless.x, dragged.x);
  assert.equal(frameless.y, dragged.y);
  const undef = clampTextCenterToShape(dragged, {
    shape: undefined,
    frameEnabled: true,
    rectWidthPx,
    rectHeightPx,
    width: W,
    height: W,
  });
  assert.ok(undef.x > dragged.x && undef.y > dragged.y, "undefined shape should frame-clamp");
});

test("rectangle (framed): every designed default position passes through byte-for-byte", () => {
  for (const set of [SAMPLE, STORE]) {
    for (const [id, rect] of Object.entries(set)) {
      const position = { x: 0.5, y: STANDARD_TEXT_BOX_ROWS[id] };
      const result = clampTextCenterToShape(position, {
        shape: "rectangle",
        frameEnabled: true,
        rectWidthPx: rect.rectWidthPx,
        rectHeightPx: rect.rectHeightPx,
        width: W,
        height: W,
      });
      assert.equal(result.x, position.x, `${id} x moved`);
      assert.equal(result.y, position.y, `${id} y moved`);
    }
  }
});

test("circle / heart / star: pass-through — the fit bounds these shapes by the canvas only", () => {
  const { rectWidthPx, rectHeightPx } = SAMPLE.title;
  // Includes the circle default title position itself (0.5, 0.12):
  // its corners extend past the disc's chord by design, and a drag
  // there must not yank the box toward the centre.
  for (const shape of ["circle", "heart", "star"]) {
    for (const position of [
      { x: 0.5, y: STANDARD_TEXT_BOX_ROWS.title },
      { x: 0.9, y: 0.85 },
    ]) {
      const result = clampTextCenterToShape(position, {
        shape,
        frameEnabled: true,
        rectWidthPx,
        rectHeightPx,
        width: W,
        height: W,
      });
      assert.equal(result.x, position.x, `${shape} x moved`);
      assert.equal(result.y, position.y, `${shape} y moved`);
    }
  }
});

test("wiring: PreviewCanvas applies the shape clamp after the canvas clamp — drag, commit, nudge", () => {
  const canvas = read("src/components/PreviewCanvas.tsx");
  assert.match(canvas, /import \{ clampTextCenterToShape \} from "@\/lib\/textFit";/);
  // Drag preview (rAF): canvas clamp first, shape clamp second.
  assert.match(
    canvas,
    /clampDragCenter\(\s*clampPositionToCanvas\(centerX, centerY, dragBounds, rect\)/,
  );
  // Keyboard nudge: same two-stage clamp.
  assert.match(
    canvas,
    /clampDragCenter\(\s*clampPositionToCanvas\(centerX \+ deltaX, centerY \+ deltaY, bounds, rect\)/,
  );
  // Commit re-clamps against the rect rendered at the preview position.
  assert.match(canvas, /const committed = clampDragCenter\(preview, commitRect, commitBounds\);/);
  // The clamp's shape/frame inputs sync from the same derivation the
  // text layer renders with.
  assert.match(
    canvas,
    /dragShapeLayoutRef\.current = \{\s*shape: effectiveShape,\s*frameEnabled: resolveTextFitFrameEnabled\("preview", baseRecipe\?\.renderOptions\),\s*\};/,
  );
  // The position PreviewCanvas commits still comes only from the
  // clamped pipeline (no second position writer appeared).
  assert.match(canvas, /updateTextBox\(dragRef\.current\.id, \{\s*position: \{ x: committed\.x, y: committed\.y \},\s*\}\);/);
});

test("geometry: the clamp reuses the fit's own diamond/frame sources, not a second implementation", () => {
  const fit = read("src/lib/textFit.ts");
  assert.match(fit, /resolveDiamondHalfWidthAt\(y - halfHeightNorm\)/);
  assert.match(fit, /resolveDiamondHalfWidthAt\(y \+ halfHeightNorm\)/);
  assert.match(fit, /resolveFrameInsetPx\(width, height\) \+ resolveFrameTextFitPaddingPx\(width\)/);
});
