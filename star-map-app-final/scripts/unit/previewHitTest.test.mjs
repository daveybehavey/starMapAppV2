/**
 * Fleet observation A (coordination PR #17): on mobile, pressing the
 * visible TITLE on Diamond dragged the SUBTITLE (3/3 repro, mouse and
 * touch emulation; desktop correct).
 *
 * Root cause: PreviewCanvas's hit test expanded every text rect by a
 * fixed 18 CSS px and returned the first match in REVERSE insertion
 * order, so wherever padded rects overlapped the last-drawn box always
 * won. The Diamond rows are only 0.065 apart (title 0.42 / subtitle
 * 0.485 since PR #339); at a 332 CSS px mobile preview the subtitle's
 * padded rect reaches y=137.0, above the title's centre at 139.4 — the
 * press on the title's own glyphs selected the subtitle. The padding is
 * fixed while text rects shrink with the canvas, so the same mis-hit
 * exists on rectangle's close rows (0.12 / 0.18) at mobile sizes too;
 * on a 520px desktop preview the subtitle's padded top (224.8) stays
 * below the title centre (218.4), which is why desktop was correct.
 * (All three statements verified by running the pre-fix algorithm
 * against the bounds built below.)
 *
 * The bounds built here replicate drawText in src/lib/renderSky.ts:
 * scale = canvasCssWidth / 1200; fontSize = max(10, size * scale)
 * (fit scale is 1 for every line below — each line's fitted width is
 * well inside its available width at these sizes); rect height =
 * fontSize * 1.2; rect width = the line's measured width at its base
 * size, scaled linearly (the same pinned measurements as
 * personaSweepU14DiamondFix.test.mjs, from the fonts' own binaries);
 * centre = position * canvas size. Insertion order matches drawText's
 * iteration: title, subtitle, dedication. The mobile title width this
 * produces (172.9 CSS px) matches the fleet's capture (518/3 = 172.7).
 *
 * Pinned selection rule (src/lib/textHitTest.ts):
 *  1. A press inside a box's EXACT glyph rect selects that box — exact
 *     hits beat padded ones.
 *  2. Within a tier, the nearest rect centre wins.
 *  3. Padded-only presses still select (touch target preserved).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  TEXT_HIT_PADDING_PX,
  hitTestText,
} from "../../src/lib/textHitTest.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function rectFor(canvasSize, { size, baseWidth, pos }) {
  const scale = canvasSize / 1200;
  const fontSize = Math.max(10, size * scale);
  const width = baseWidth * (fontSize / size);
  const height = fontSize * 1.2;
  return {
    x: pos.x * canvasSize - width / 2,
    y: pos.y * canvasSize - height / 2,
    width,
    height,
  };
}

function boundsFor(canvasSize, boxes) {
  const bounds = new Map();
  for (const box of boxes) bounds.set(box.id, rectFor(canvasSize, box));
  return bounds;
}

const centre = (rect) => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
});

// "Try a sample moment" text on Diamond rows (PR #339).
const SAMPLE_DIAMOND = [
  { id: "title", size: 52, baseWidth: 624.77, pos: { x: 0.5, y: 0.42 } },
  { id: "subtitle", size: 36, baseWidth: 349.1, pos: { x: 0.5, y: 0.485 } },
  { id: "dedication", size: 32, baseWidth: 138.27, pos: { x: 0.5, y: 0.64 } },
];
// Store defaults on the standard rows (rectangle 0.12 / 0.18 / 0.90).
const STORE_STANDARD = [
  { id: "title", size: 48, baseWidth: 373.97, pos: { x: 0.5, y: 0.12 } },
  { id: "subtitle", size: 28, baseWidth: 308.48, pos: { x: 0.5, y: 0.18 } },
  { id: "dedication", size: 26, baseWidth: 307.27, pos: { x: 0.5, y: 0.9 } },
];

test("mobile diamond: pressing the visible title centre selects the title (fleet A repro)", () => {
  const bounds = boundsFor(332, SAMPLE_DIAMOND);
  const title = bounds.get("title");
  const subtitle = bounds.get("subtitle");
  const press = centre(title);
  // The overlap that caused the bug is real: the press point is inside
  // the subtitle's PADDED rect (and the title's exact rect).
  assert.ok(press.y >= subtitle.y - TEXT_HIT_PADDING_PX);
  assert.ok(press.y >= title.y && press.y <= title.y + title.height);
  const hit = hitTestText(bounds, press.x, press.y);
  assert.equal(hit?.id, "title");
  // The drag offsets are computed from the returned centre — it must be
  // the winning box's own centre.
  assert.ok(Math.abs(hit.centerX - press.x) < 1e-9);
  assert.ok(Math.abs(hit.centerY - press.y) < 1e-9);
});

test("mobile diamond: subtitle and dedication centres select themselves", () => {
  const bounds = boundsFor(332, SAMPLE_DIAMOND);
  // The subtitle centre also sits inside the title's padded rect
  // (title padded bottom 166.1 > subtitle centre 161.0); the exact
  // glyph hit must still win.
  const sub = centre(bounds.get("subtitle"));
  assert.equal(hitTestText(bounds, sub.x, sub.y)?.id, "subtitle");
  const ded = centre(bounds.get("dedication"));
  assert.equal(hitTestText(bounds, ded.x, ded.y)?.id, "dedication");
});

test("mobile diamond: padded-only presses resolve by nearest centre", () => {
  const bounds = boundsFor(332, SAMPLE_DIAMOND);
  const title = bounds.get("title");
  const subtitle = bounds.get("subtitle");
  // In the gap between the two glyph rects both padded rects overlap;
  // 1px below the title's glyphs is nearer the title centre, 1px above
  // the subtitle's glyphs is nearer the subtitle centre.
  const nearTitle = title.y + title.height + 1;
  assert.equal(hitTestText(bounds, 166, nearTitle)?.id, "title");
  const nearSubtitle = subtitle.y - 1;
  assert.equal(hitTestText(bounds, 166, nearSubtitle)?.id, "subtitle");
  // Below the subtitle's glyphs, inside its padding only: the generous
  // touch target still grabs the subtitle.
  const belowSubtitle = subtitle.y + subtitle.height + 10;
  assert.equal(hitTestText(bounds, 166, belowSubtitle)?.id, "subtitle");
});

test("mobile diamond: a press far from every box selects nothing", () => {
  const bounds = boundsFor(332, SAMPLE_DIAMOND);
  assert.equal(hitTestText(bounds, 8, 324), null);
});

test("desktop diamond behaviour is unchanged (520px preview)", () => {
  const bounds = boundsFor(520, SAMPLE_DIAMOND);
  const title = centre(bounds.get("title"));
  assert.equal(hitTestText(bounds, title.x, title.y)?.id, "title");
  const sub = centre(bounds.get("subtitle"));
  assert.equal(hitTestText(bounds, sub.x, sub.y)?.id, "subtitle");
});

test("mobile rectangle: the same mis-hit is fixed on the standard rows", () => {
  const bounds = boundsFor(332, STORE_STANDARD);
  const title = centre(bounds.get("title"));
  assert.equal(hitTestText(bounds, title.x, title.y)?.id, "title");
  const sub = centre(bounds.get("subtitle"));
  assert.equal(hitTestText(bounds, sub.x, sub.y)?.id, "subtitle");
  const ded = centre(bounds.get("dedication"));
  assert.equal(hitTestText(bounds, ded.x, ded.y)?.id, "dedication");
});

test("overlapping glyph rects (user-dragged boxes): nearest centre wins within exact hits", () => {
  const bounds = new Map([
    ["title", { x: 60, y: 100, width: 200, height: 20 }],
    ["subtitle", { x: 60, y: 106, width: 200, height: 20 }],
  ]);
  // Both exact rects contain both points; the centres are y=110 / 116.
  assert.equal(hitTestText(bounds, 160, 111)?.id, "title");
  assert.equal(hitTestText(bounds, 160, 115)?.id, "subtitle");
});

test("desktop padded overlap: gap presses resolve by nearest centre, not insertion order", () => {
  // At 520px the glyph rects do not overlap (title bottom 231.9,
  // subtitle top 242.8) but the padded rects do. Under the pre-fix
  // rule both presses below selected the subtitle (last inserted);
  // nearest-centre is the intended behaviour at every canvas size.
  const bounds = boundsFor(520, SAMPLE_DIAMOND);
  assert.equal(hitTestText(bounds, 260, 233)?.id, "title");
  assert.equal(hitTestText(bounds, 260, 237)?.id, "subtitle");
});

test("exact tie (boxes dragged to identical centres): first-inserted box wins", () => {
  const rect = { x: 60, y: 100, width: 200, height: 20 };
  const bounds = new Map([
    ["title", { ...rect }],
    ["subtitle", { ...rect }],
  ]);
  assert.equal(hitTestText(bounds, 160, 110)?.id, "title");
});

test("wiring: PreviewCanvas uses the shared hit test; padding unchanged", () => {
  const canvas = read("src/components/PreviewCanvas.tsx");
  assert.match(canvas, /import \{ hitTestText \} from "@\/lib\/textHitTest";/);
  assert.doesNotMatch(canvas, /function hitTestText\(/);
  assert.equal(TEXT_HIT_PADDING_PX, 18);
});
