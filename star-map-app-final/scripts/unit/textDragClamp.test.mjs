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
 * Freshness round (independent gate P1 on this PR): every clamp
 * above consumes a rect rendered at the box's PREVIOUS row, and the
 * diamond fit is row-dependent — a box moved toward the wider
 * middle re-renders wider than the rect its destination was clamped
 * with, so the stored position can spill for its true rect. The
 * keyboard nudge had no re-clamp at all; the pointer-up commit
 * re-clamped, but with bounds that predate the commit's own row
 * whenever the clamp itself moved the box (or the final preview
 * frame had not rendered). The close is a post-render recheck:
 * PreviewCanvas flags the box at both commit paths, and the
 * text-layer effect — the first render whose bounds describe the
 * STORED position — re-clamps it against those bounds, exactly one
 * corrective pass per commit (the flag clears before the write).
 * The simulation test at the bottom reproduces the stale-rect
 * sequence against the fit's own geometry and pins the correction
 * as a fixed point. Authored positions (presets, samples,
 * hydration) never set the flag and are never re-clamped.
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
  resolveShapeTextAvailableWidth,
  resolveTextFitScale,
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

/* ------------------------------------------------------------------ */
/* Freshness round: the stale-rect sequence (gate P1)                  */
/* ------------------------------------------------------------------ */

// Boolean twin of assertDiamondContained: the stale-rect test needs
// to assert that a position DOES spill (the bug) as well as that
// the corrected one does not.
const diamondContained = (center, rectWidthPx, rectHeightPx) => {
  const hw = rectWidthPx / (W * 2);
  const hh = rectHeightPx / (W * 2);
  const top = center.y - hh;
  const bottom = center.y + hh;
  if (top < DIAMOND_APEX_TOP - 1e-9 || bottom > DIAMOND_APEX_BOTTOM + 1e-9) return false;
  for (const row of [top, bottom]) {
    const half = resolveDiamondHalfWidthAt(row);
    if (center.x - hw < 0.5 - half - 1e-9) return false;
    if (center.x + hw > 0.5 + half + 1e-9) return false;
  }
  return true;
};

// drawText's fitted rect at a centre row, recomputed with the fit's
// own functions in the same composition renderSky.ts uses: the
// available width at the row (span measured with the UNfitted line
// height), the fit scale against the measured width, and the
// recorded rect = measured width x scale by fitted size x 1.2.
const fittedRectAtRow = (centerYNorm, measuredWidthPx, baseFontSizePx) => {
  const availableWidth = resolveShapeTextAvailableWidth({
    shape: "diamond",
    frameEnabled: true,
    centerYNorm,
    lineHeightPx: baseFontSizePx * 1.2,
    width: W,
    height: W,
  });
  const scale = resolveTextFitScale(measuredWidthPx, availableWidth);
  return {
    scale,
    rectWidthPx: measuredWidthPx * scale,
    rectHeightPx: baseFontSizePx * 1.2 * scale,
  };
};

test("diamond: nudge toward the middle re-fits wider — the stale-rect commit spills, the post-render recheck fixes it in one pass (gate P1)", () => {
  // Sample subtitle (Cinzel 600 @36, measured 349.10px on the
  // 1200px base canvas — the pinned measurement table in the header).
  const measuredWidthPx = 349.1;
  const baseFontSizePx = 36;

  // Row A: a narrow row where the subtitle sits in the shrink
  // regime (0.5 < fit scale < 1), parked at its lateral limit.
  const yA = 0.21;
  const rectA = fittedRectAtRow(yA, measuredWidthPx, baseFontSizePx);
  assert.ok(
    rectA.scale > 0.5 && rectA.scale < 1,
    `row A must be in the shrink regime, got scale ${rectA.scale}`,
  );
  const atLimit = clampDiamond({ x: 0.99, y: yA }, rectA.rectWidthPx, rectA.rectHeightPx);
  assert.ok(atLimit.x > 0.5, "the box starts off-centre, at its lateral limit");
  assert.ok(
    diamondContained(atLimit, rectA.rectWidthPx, rectA.rectHeightPx),
    "the stored position starts contained for its own rect",
  );

  // Shift+ArrowDown: 10px toward the wider middle. (The canvas
  // clamp stage of the nudge is the identity for this candidate, so
  // the shape clamp below IS the pre-fix nudge composition.) The
  // pre-fix path clamped the destination with row A's rect and
  // committed it immediately — no re-clamp ever ran.
  const candidate = { x: atLimit.x, y: yA + 10 / W };
  const staleCommit = clampDiamond(candidate, rectA.rectWidthPx, rectA.rectHeightPx);

  // At the destination row the fit is wider, so the stale rect
  // understates the box — and the committed position spills for the
  // rect it actually renders with. This is the P1, reproduced
  // against the fit's own geometry.
  const rectB = fittedRectAtRow(staleCommit.y, measuredWidthPx, baseFontSizePx);
  assert.ok(rectB.rectWidthPx > rectA.rectWidthPx, "the destination row must re-fit wider");
  assert.ok(
    !diamondContained(staleCommit, rectB.rectWidthPx, rectB.rectHeightPx),
    "the stale-rect commit must spill for the destination rect (the bug)",
  );

  // The fixed mechanism: once the text layer has rendered the
  // stored position, the effect re-clamps it against the bounds
  // that render recorded (rectB).
  const corrected = clampDiamond(staleCommit, rectB.rectWidthPx, rectB.rectHeightPx);
  // The re-fit at the corrected row is what preview and export draw.
  const rectC = fittedRectAtRow(corrected.y, measuredWidthPx, baseFontSizePx);
  assert.ok(
    diamondContained(corrected, rectC.rectWidthPx, rectC.rectHeightPx),
    "the corrected position must be contained for the rect at its final row",
  );
  // Convergence: the correction is a clamp fixed point for its own
  // rect, so a second recheck pass changes nothing — one
  // corrective pass per commit suffices and no clamp/render loop
  // can form. (In this scenario the correction is lateral only:
  // the row, and therefore the rect, is unchanged by it.)
  assert.equal(corrected.y, staleCommit.y, "the shrink-regime correction keeps the row");
  const secondPass = clampDiamond(corrected, rectC.rectWidthPx, rectC.rectHeightPx);
  assert.deepEqual(secondPass, corrected, "the corrected position must be a clamp fixed point");
});

test("wiring: both commit paths flag the box and the text-layer effect re-clamps it post-render (gate P1)", () => {
  const canvas = read("src/components/PreviewCanvas.tsx");
  // The pointer-up commit and the keyboard nudge both flag the
  // committed box for the freshness recheck.
  assert.match(canvas, /pendingShapeRecheckRef\.current = dragRef\.current\.id;/);
  assert.match(canvas, /pendingShapeRecheckRef\.current = activeBox;/);
  // The recheck consumes the flag in the text-layer effect (the
  // render that writes fresh bounds for the stored position)...
  const recheckStart = canvas.indexOf("const recheckId = pendingShapeRecheckRef.current;");
  assert.ok(recheckStart >= 0, "the text-layer effect must consume the recheck flag");
  // ...only corrects when what rendered IS the stored position...
  assert.match(canvas, /rendered\.position\.x === stored\.position\.x/);
  assert.match(canvas, /rendered\.position\.y === stored\.position\.y/);
  // ...and writes the correction through the store.
  assert.match(canvas, /updateTextBox\(recheckId, \{ position: corrected \}\);/);
  // One corrective pass per commit: in the corrective branch the
  // flag is cleared BEFORE the write, so the re-render the write
  // triggers cannot re-enter the recheck.
  const freshRectIndex = canvas.indexOf(
    "const freshRect = textBoundsRef.current.get(recheckId);",
    recheckStart,
  );
  const clearIndex = canvas.lastIndexOf("pendingShapeRecheckRef.current = null;", freshRectIndex);
  const writeIndex = canvas.indexOf("updateTextBox(recheckId, { position: corrected });", recheckStart);
  assert.ok(
    freshRectIndex > recheckStart && clearIndex > recheckStart && writeIndex > freshRectIndex,
    "the corrective branch must clear the flag before its write",
  );
});
