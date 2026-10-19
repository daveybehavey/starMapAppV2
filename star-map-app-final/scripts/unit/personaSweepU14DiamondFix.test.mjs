/**
 * Persona sweep U14 follow-up (fleet PR #16): the DIAMOND default text
 * rows. PR #337 made the render fit each line to the diamond mask's
 * width at its own row, but the default rows themselves sat in the
 * apex zones (title y=0.12, dedication y=0.90), where the mask is
 * 8–23% of the canvas wide — the fleet's live re-check measured the
 * DEFAULT sample title at ~538px across a ~120px mask row, with the
 * 0.5x fit floor already binding. David's call (2026-10-19): move the
 * default rows into the mask's wide middle band; the fit stays as the
 * backstop for user text.
 *
 * Measured text widths (the measurement table)
 * --------------------------------------------
 * Canvas measureText has no Node equivalent in this repo (no canvas
 * dependency), so the default strings were measured once against the
 * real font binaries and are pinned here as constants; source pins
 * below lock the strings, fonts, and base sizes they were measured
 * from, so a change to any of them fails this file and forces a
 * re-measure. Method (2026-10-19): the fonts' own TTFs from the
 * google/fonts repo (Playfair Display and Cinzel as variable instances
 * at wght 600 — the drawText default weight — Great Vibes and Raleway
 * likewise), shaped with HarfBuzz (Pillow/libraqm getlength), which
 * is the same shaping engine and the same font files the browser
 * canvas measures with. Widths are linear in font size; values are
 * at the boxes' base sizes on the 1200px base canvas.
 *
 *   sample title       "The Night We Became One"   Playfair 600 @52  624.77
 *   sample subtitle    "Santorini, Greece"         Cinzel   600 @36  349.10
 *   sample subtitle UC "SANTORINI, GREECE"         Cinzel   600 @36  375.64
 *   sample dedication  "June 1, 2024"              Great Vibes @32   138.27
 *   long title (fleet) "The Night We Became One Forever And Always
 *                       Under These Stars"         Playfair 600 @52 1547.36
 *   store title        "Our Night Sky"             Cinzel   600 @48  373.97
 *   store subtitle     "Under the vintage stars"   Raleway  600 @28  308.48
 *   store dedication   "Celebrating our constellation of moments."
 *                                                  Great Vibes @26   307.27
 *
 * Behaviour runs against the real textFit lib; data/wiring is pinned
 * from source, per repo convention (the store cannot be imported by
 * the Node runner — extensionless imports).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DIAMOND_TEXT_BOX_ROWS,
  MIN_TEXT_FIT_SCALE,
  STANDARD_TEXT_BOX_ROWS,
  applyDefaultTextRowsForShape,
  resolveDefaultTextBoxRows,
  resolveFrameInsetPx,
  resolveFrameTextFitPaddingPx,
  resolveShapeTextAvailableWidth,
  resolveTextFitScale,
} from "../../src/lib/textFit.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const W = 1200; // BASE_CANVAS_WIDTH, square canvas
const diamondAvail = (centerYNorm, size) =>
  resolveShapeTextAvailableWidth({
    shape: "diamond",
    frameEnabled: true,
    centerYNorm,
    lineHeightPx: size * 1.2, // drawText measures the span with the unfitted height
    width: W,
    height: W,
  });

/* ---------- The measurement basis is locked to source ---------- */

test("U14-fix: sample + store default texts, fonts, sizes and standard rows match the measured basis", () => {
  const presets = read("src/lib/occasionPresets.ts");
  // The wedding sample (the "Try a sample moment" design).
  assert.match(presets, /text: "The Night We Became One"/);
  assert.match(presets, /text: "Santorini, Greece"/);
  assert.match(presets, /text: "June 1, 2024"/);
  // baseText: the sizes/fonts the widths were measured at.
  assert.match(presets, /fontFamily: "playfair" as const,[\s\S]*?size: 52,/);
  assert.match(presets, /fontFamily: "cinzel" as const,[\s\S]*?size: 36,/);
  assert.match(presets, /fontFamily: "script" as const,[\s\S]*?size: 32,/);
  // baseText rows are the standard rows (the sample installs standard
  // rows; the shape-aware relocation moves them when diamond applies).
  for (const y of [STANDARD_TEXT_BOX_ROWS.title, STANDARD_TEXT_BOX_ROWS.subtitle, STANDARD_TEXT_BOX_ROWS.dedication]) {
    assert.ok(presets.includes(`position: { x: 0.5, y: ${y} }`), `preset base row ${y}`);
  }
  const sync = read("src/lib/sampleDesignTextSync.ts");
  assert.match(sync, /SAMPLE_DESIGN_TITLE = "The Night We Became One"/);
  assert.match(sync, /SAMPLE_DESIGN_PLACE = "Santorini, Greece"/);
  assert.match(sync, /SAMPLE_DESIGN_DATE = "June 1, 2024"/);

  const store = read("src/lib/store.ts");
  assert.match(store, /text: "Our Night Sky",[\s\S]*?size: 48,[\s\S]*?position: \{ x: 0\.5, y: 0\.12 \}/);
  assert.match(store, /text: "Under the vintage stars",[\s\S]*?size: 28,[\s\S]*?position: \{ x: 0\.5, y: 0\.18 \}/);
  assert.match(store, /text: "Celebrating our constellation of moments\.",[\s\S]*?size: 26,[\s\S]*?position: \{ x: 0\.5, y: 0\.9 \}/);
});

/* ---------- The old rows floor the default title (the bug) ---------- */

test("U14-fix: at the standard rows on diamond, the default sample title hits the floor and still spills", () => {
  const titleAvail = diamondAvail(STANDARD_TEXT_BOX_ROWS.title, 52);
  const scale = resolveTextFitScale(624.77, titleAvail);
  assert.equal(scale, MIN_TEXT_FIT_SCALE); // floor binds even for the default title
  assert.ok(624.77 * scale > titleAvail, "floored title still wider than the mask row");
  const dedAvail = diamondAvail(STANDARD_TEXT_BOX_ROWS.dedication, 32);
  assert.equal(resolveTextFitScale(138.27, dedAvail), MIN_TEXT_FIT_SCALE);
  assert.ok(138.27 * MIN_TEXT_FIT_SCALE > dedAvail, "floored dedication still spills");
});

/* ---------- The new diamond rows fit the defaults at full size ---------- */

test("U14-fix: sample defaults fit at scale 1 on the diamond rows (no floor, no shrink)", () => {
  const cases = [
    ["title", "sample title", 624.77, 52],
    ["subtitle", "sample subtitle", 349.1, 36],
    ["subtitle", "sample subtitle (upper-case render)", 375.64, 36],
    ["dedication", "sample dedication", 138.27, 32],
  ];
  for (const [id, label, textWidth, size] of cases) {
    const avail = diamondAvail(DIAMOND_TEXT_BOX_ROWS[id], size);
    const scale = resolveTextFitScale(textWidth, avail);
    assert.ok(scale > 0.9, `${label}: scale ${scale} must clear 0.9`);
    assert.equal(scale, 1, `${label}: ${textWidth}px must fit the ${avail.toFixed(1)}px mask row at base size`);
  }
});

test("U14-fix: store defaults also fit at scale 1 on the diamond rows", () => {
  const cases = [
    ["title", 373.97, 48],
    ["subtitle", 308.48, 28],
    ["dedication", 307.27, 26],
  ];
  for (const [id, textWidth, size] of cases) {
    const avail = diamondAvail(DIAMOND_TEXT_BOX_ROWS[id], size);
    assert.equal(
      resolveTextFitScale(textWidth, avail),
      1,
      `store ${id}: ${textWidth}px must fit the ${avail.toFixed(1)}px mask row at base size`,
    );
  }
});

test("U14-fix: the fleet's long title is contained by the fit at the diamond title row", () => {
  const avail = diamondAvail(DIAMOND_TEXT_BOX_ROWS.title, 52);
  const scale = resolveTextFitScale(1547.36, avail);
  assert.ok(scale > MIN_TEXT_FIT_SCALE, `scale ${scale} must stay above the floor`);
  assert.ok(1547.36 * scale <= avail + 1e-9, "fitted extent stays inside the mask row");
});

test("U14-fix: diamond rows sit in the wide middle band, clear of both apex zones", () => {
  // Title just above centre, subtitle beneath it, dedication in the
  // lower-middle — every row's mask width is at least half the canvas.
  assert.ok(DIAMOND_TEXT_BOX_ROWS.title < 0.5);
  assert.ok(DIAMOND_TEXT_BOX_ROWS.subtitle > DIAMOND_TEXT_BOX_ROWS.title);
  assert.ok(DIAMOND_TEXT_BOX_ROWS.dedication > 0.5 && DIAMOND_TEXT_BOX_ROWS.dedication < 0.75);
  for (const [id, size] of [["title", 52], ["subtitle", 36], ["dedication", 32]]) {
    assert.ok(diamondAvail(DIAMOND_TEXT_BOX_ROWS[id], size) > W / 2, `${id} row must be in the wide band`);
  }
  assert.equal(resolveDefaultTextBoxRows("diamond"), DIAMOND_TEXT_BOX_ROWS);
  assert.equal(resolveDefaultTextBoxRows("rectangle"), STANDARD_TEXT_BOX_ROWS);
  assert.equal(resolveDefaultTextBoxRows("circle"), STANDARD_TEXT_BOX_ROWS);
  assert.equal(resolveDefaultTextBoxRows(undefined), STANDARD_TEXT_BOX_ROWS);
});

/* ---------- Relocation: defaults follow the shape, user rows never move ---------- */

const box = (id, y, extra = {}) => ({ id, text: id, position: { x: 0.5, y }, ...extra });

test("U14-fix: boxes on standard rows move to the diamond rows when diamond applies", () => {
  const boxes = [box("title", 0.12), box("subtitle", 0.18), box("dedication", 0.9)];
  const next = applyDefaultTextRowsForShape(boxes, "diamond");
  assert.deepEqual(
    next.map((b) => b.position.y),
    [DIAMOND_TEXT_BOX_ROWS.title, DIAMOND_TEXT_BOX_ROWS.subtitle, DIAMOND_TEXT_BOX_ROWS.dedication],
  );
  // Originals are not mutated.
  assert.deepEqual(boxes.map((b) => b.position.y), [0.12, 0.18, 0.9]);
});

test("U14-fix: boxes on diamond rows move back to the standard rows for other shapes", () => {
  const boxes = [
    box("title", DIAMOND_TEXT_BOX_ROWS.title),
    box("subtitle", DIAMOND_TEXT_BOX_ROWS.subtitle),
    box("dedication", DIAMOND_TEXT_BOX_ROWS.dedication),
  ];
  for (const shape of ["rectangle", "circle", "heart", "star"]) {
    assert.deepEqual(
      applyDefaultTextRowsForShape(boxes, shape).map((b) => b.position.y),
      [0.12, 0.18, 0.9],
      shape,
    );
  }
});

test("U14-fix: user-moved, off-centre, custom and position-less boxes are never relocated", () => {
  const boxes = [
    box("title", 0.3), // dragged
    box("subtitle", 0.18, { position: { x: 0.4, y: 0.18 } }), // off-centre
    box("custom-123", 0.12), // not a designed box
    { id: "dedication", text: "x" }, // no position (drawText fallback rows)
    box("dedication", 0.88), // a preset's own authored row, not a default row
  ];
  const next = applyDefaultTextRowsForShape(boxes, "diamond");
  assert.equal(next, boxes); // same reference: nothing moved
});

test("U14-fix: relocation is idempotent and a no-op (same reference) when rows already fit the shape", () => {
  const diamondBoxes = [
    box("title", DIAMOND_TEXT_BOX_ROWS.title),
    box("subtitle", DIAMOND_TEXT_BOX_ROWS.subtitle),
    box("dedication", DIAMOND_TEXT_BOX_ROWS.dedication),
  ];
  assert.equal(applyDefaultTextRowsForShape(diamondBoxes, "diamond"), diamondBoxes);
  const standardBoxes = [box("title", 0.12), box("subtitle", 0.18), box("dedication", 0.9)];
  assert.equal(applyDefaultTextRowsForShape(standardBoxes, "rectangle"), standardBoxes);
});

test("U14-fix: wiring — setShape relocates, and the SimplifiedEditor sample fallback resolves rows per shape", () => {
  const store = read("src/lib/store.ts");
  assert.match(store, /textBoxes: applyDefaultTextRowsForShape\(state\.textBoxes, shape\)/);
  const simplified = read("src/components/SimplifiedEditor/SimplifiedEditor.tsx");
  assert.match(simplified, /applyDefaultTextRowsForShape\(SAMPLE_RECIPE\.textBoxes, shape\)/);
});

/* ---------- Rider: framed-rectangle fit padding (fleet PR #16 nit) ---------- */

test("rider: the framed-rectangle bound now leaves padding inside the frame line", () => {
  assert.equal(resolveFrameTextFitPaddingPx(1200), 6);
  assert.equal(resolveFrameTextFitPaddingPx(1040), 5);
  assert.equal(resolveFrameTextFitPaddingPx(400), 2);
  assert.equal(resolveFrameTextFitPaddingPx(Number.NaN), 0);

  const layout = { shape: "rectangle", frameEnabled: true, centerYNorm: 0.12, lineHeightPx: 62.4, width: 1200, height: 1200 };
  const available = resolveShapeTextAvailableWidth(layout);
  assert.equal(available, 1200 - (resolveFrameInsetPx(1200, 1200) + resolveFrameTextFitPaddingPx(1200)) * 2);
  // A max-length line fitted to the bound is centred, so its glyph edge
  // sits (inset + padding) from the canvas edge: the clearance between
  // the glyphs and the frame line (drawn at the inset) is the padding.
  const clearance = (1200 - available) / 2 - resolveFrameInsetPx(1200, 1200);
  assert.equal(clearance, resolveFrameTextFitPaddingPx(1200));
  assert.ok(clearance >= 5, "clearance reads as a real gap at preview scale");
  // The fleet's long title still fits by shrinking — now to the padded bound.
  const scale = resolveTextFitScale(1547.36, available);
  assert.ok(Math.abs(1547.36 * scale - available) < 1e-9);
  // Unframed and non-rectangle bounds are unchanged.
  assert.equal(resolveShapeTextAvailableWidth({ ...layout, frameEnabled: false }), 1200);
  assert.equal(resolveShapeTextAvailableWidth({ ...layout, shape: "heart" }), 1200);
});
