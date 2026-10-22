/**
 * E-3 (Codex pass E, verified 2026-10-21): PreviewCanvas's drag and
 * nudge paths work in glyph-CENTRE space — the pointer grabs the
 * glyph by its centre (hitTestText returns the rendered rect's
 * centre), the drag preview position is that centre, and both
 * clamps (clampPositionToCanvas + clampTextCenterToShape via
 * clampDragCenter) consume and return centres. But the store's
 * position.x is the renderer's alignment ANCHOR: drawText
 * (renderSky.ts) fills at (position.x x canvas width) with
 * ctx.textAlign = box.align, so a left-aligned glyph spans
 * [anchor, anchor + width] and a right-aligned one
 * [anchor - width, anchor]. Three persistence points stored the
 * centre verbatim as the anchor:
 *
 *   1. effectiveTextBoxes substituted dragPreviewPosition (a
 *      centre) as box.position for rendering, so even mid-drag a
 *      left-aligned glyph drew half a width right of the pointer;
 *   2. the pointer-up commit stored clampDragCenter's centre via
 *      updateTextBox unconverted;
 *   3. the keyboard nudge stored its clamped centre the same way
 *      (and its no-rect fallback read the stored ANCHOR as if it
 *      were a centre, compounding the conflation).
 *
 * Effect: on drag-end or nudge, left-aligned text sat half its
 * rendered width RIGHT of where the user put it, right-aligned
 * half a width LEFT; centre-aligned boxes were unaffected (their
 * anchor IS their centre). The post-render recheck could not
 * repair it: it converts the stored value anchor -> centre ->
 * clamp -> anchor, which is the identity on a wrongly stored
 * centre, because the bounds it checks were rendered from that
 * same wrong position.
 *
 * Fix (write-path only; the render/read path is untouched, so
 * existing saved designs render identically): each of the three
 * points converts centre -> anchor with the existing
 * resolveTextCenterToAnchorX (src/lib/textFit.ts) using the box's
 * align and its rendered rect width — the exact inverse of the
 * anchor -> centre mapping the recheck already uses — and the
 * nudge fallback derives its starting centre from the stored
 * anchor via resolveTextAnchorToCenterX. The conversion helpers
 * themselves pre-date this fix and are pinned in
 * textDragClamp.test.mjs; what was missing — and what this file
 * pins — is that the persist paths actually call them.
 *
 * The behavioural tests compose the persist step exactly as the
 * component now runs it and assert the user-visible contract: the
 * stored anchor makes the GLYPH land centred on the drop point
 * for every alignment, centre-aligned storage is byte-for-byte
 * what the pre-fix code stored, and degenerate widths (no
 * rendered rect yet) store the centre unchanged rather than NaN.
 * The wiring tests pin the three call sites in PreviewCanvas
 * source (same style as textDragClamp.test.mjs's recheck pins);
 * they FAIL against the pre-fix source, which is the pre-fix
 * failure demonstration for a defect whose essence was an absent
 * call.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  resolveTextAnchorToCenterX,
  resolveTextCenterToAnchorX,
} from "../../src/lib/textFit.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const W = 1200; // BASE_CANVAS_WIDTH, square canvas
const RECT_W = 240; // a 240px-wide glyph on the 1200px canvas (0.2 normalized)

const near = (actual, expected, label) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-6,
    `${label}: expected ~${expected}, got ${actual}`,
  );

// The glyph's horizontal span for a stored anchor, per drawText:
// left [anchor, anchor + w], centre [anchor - w/2, anchor + w/2],
// right [anchor - w, anchor].
const glyphSpanX = (anchorX, align, rectWidthPx, canvasWidthPx) => {
  const rw = rectWidthPx / canvasWidthPx;
  if (align === "left") return [anchorX, anchorX + rw];
  if (align === "right") return [anchorX - rw, anchorX];
  return [anchorX - rw / 2, anchorX + rw / 2];
};
const glyphCentreX = (anchorX, align, rectWidthPx, canvasWidthPx) => {
  const [l, r] = glyphSpanX(anchorX, align, rectWidthPx, canvasWidthPx);
  return (l + r) / 2;
};

// The persist step, composed exactly as all three PreviewCanvas
// paths now run it: the clamped glyph centre the interaction
// produced, converted to the stored alignment anchor with the
// box's align and rendered width.
const persistCentre = (centreX, align, rectWidthPx, canvasWidthPx) =>
  resolveTextCenterToAnchorX(centreX, align, rectWidthPx, canvasWidthPx);

test("persist: a drop at centre 0.5 stores the anchor that renders the glyph centred on 0.5 — every alignment", () => {
  // Left: anchor = centre - half width = 0.5 - 0.1 = 0.4; the glyph
  // spans [0.4, 0.6]. (Pre-fix the centre 0.5 was stored verbatim:
  // span [0.5, 0.7], glyph centre 0.6 — half a width right.)
  const leftAnchor = persistCentre(0.5, "left", RECT_W, W);
  near(leftAnchor, 0.4, "left stored anchor");
  near(glyphCentreX(leftAnchor, "left", RECT_W, W), 0.5, "left glyph lands on the drop point");
  near(glyphCentreX(0.5, "left", RECT_W, W), 0.6, "pre-fix verbatim store displaced the glyph by +half width");

  // Right: mirrored — anchor = centre + half width = 0.6; the
  // glyph spans [0.4, 0.6]. (Pre-fix: span [0.3, 0.5], centre 0.4.)
  const rightAnchor = persistCentre(0.5, "right", RECT_W, W);
  near(rightAnchor, 0.6, "right stored anchor");
  near(glyphCentreX(rightAnchor, "right", RECT_W, W), 0.5, "right glyph lands on the drop point");
  near(glyphCentreX(0.5, "right", RECT_W, W), 0.4, "pre-fix verbatim store displaced the glyph by -half width");
});

test("persist: centre-aligned (and undefined) storage is identical to the pre-fix verbatim store", () => {
  // The anchor IS the centre for these boxes, so the conversion is
  // the identity and behaviour is unchanged — the regression guard
  // for every designed default, which is centre-aligned.
  for (const centre of [0.1, 0.35, 0.5, 0.9]) {
    assert.equal(persistCentre(centre, "center", RECT_W, W), centre);
    assert.equal(persistCentre(centre, undefined, RECT_W, W), centre);
  }
});

test("persist: the stored anchor round-trips back to the drop centre (what the recheck reads)", () => {
  // The post-render recheck converts stored anchor -> centre
  // before clamping; a correctly persisted position must come
  // back as the centre the user dropped at, for every alignment,
  // so the recheck sees the box where it was actually put.
  for (const align of ["left", "center", "right"]) {
    const stored = persistCentre(0.37, align, RECT_W, W);
    near(
      resolveTextAnchorToCenterX(stored, align, RECT_W, W),
      0.37,
      `${align} persisted anchor reads back as the drop centre`,
    );
  }
});

test("persist: degenerate width (no rendered rect yet) stores the centre unchanged, never NaN", () => {
  // Call sites pass rect?.width ?? 0 before the first render has
  // recorded a rect; the conversion must degrade to the identity
  // (textFit's degenerate-input contract), not shift or NaN.
  for (const align of ["left", "center", "right"]) {
    assert.equal(persistCentre(0.42, align, 0, W), 0.42);
    assert.equal(persistCentre(0.42, align, RECT_W, 0), 0.42);
  }
});

/* ------------------------------------------------------------------ */
/* Wiring pins: the three persist points convert before storing      */
/* ------------------------------------------------------------------ */

const canvas = read("src/components/PreviewCanvas.tsx");
const sliceBetween = (src, startMarker, endMarker) => {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `start marker not found: ${startMarker}`);
  const end = src.indexOf(endMarker, start);
  assert.ok(end >= 0, `end marker not found: ${endMarker}`);
  return src.slice(start, end);
};

test("wiring: the drag-preview substitution converts the preview centre to the box's anchor", () => {
  const block = sliceBetween(canvas, "const effectiveTextBoxes", "[dragPreviewPosition, textBoxes");
  assert.match(
    block,
    /resolveTextCenterToAnchorX\(\s*dragPreviewPosition\.x,\s*box\.align,/,
  );
  // The verbatim substitution is gone.
  assert.doesNotMatch(block, /position: \{ x: dragPreviewPosition\.x, y: dragPreviewPosition\.y \}/);
});

test("wiring: the pointer-up commit converts the clamped centre before updateTextBox", () => {
  const block = sliceBetween(
    canvas,
    "const committed = clampDragCenter(preview, commitRect, commitBounds);",
    "pendingShapeRecheckRef.current = dragRef.current.id;",
  );
  assert.match(block, /resolveTextCenterToAnchorX\(\s*committed\.x,/);
  assert.match(block, /updateTextBox\(dragRef\.current\.id,/);
  // The pre-fix verbatim store is gone.
  assert.doesNotMatch(block, /position: \{ x: committed\.x, y: committed\.y \}/);
});

test("wiring: the keyboard nudge derives its fallback centre from the anchor and converts before storing", () => {
  const block = sliceBetween(canvas, "const nudgeActiveTextBox", "}, [activeBox, readOnly, textBoxes, updateTextBox]);");
  // Fallback: the stored ANCHOR is converted to the centre the
  // nudge math works in, instead of being read as a centre.
  assert.match(block, /resolveTextAnchorToCenterX\(\s*currentBox\.position\?\.x \?\? 0\.5,\s*currentBox\.align,/);
  // Persist: the clamped centre converts to the anchor.
  assert.match(block, /resolveTextCenterToAnchorX\(\s*x,\s*currentBox\.align,/);
  assert.match(block, /updateTextBox\(activeBox,/);
  // The pre-fix verbatim store is gone.
  assert.doesNotMatch(block, /updateTextBox\(activeBox, \{ position: \{ x, y \} \}\)/);
});
