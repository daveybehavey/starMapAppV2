/**
 * P01 fit-to-width: canvas text lines wider than the canvas shrink to fit
 * (floored) instead of spilling symmetrically off both edges of the print.
 * drawText in renderSky.ts applies resolveTextFitScale per text box; these
 * tests lock the sizing decision itself.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MIN_TEXT_FIT_SCALE,
  resolveFittedFontSize,
  resolveTextFitScale,
} from "../../src/lib/textFit.ts";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "../..");
const read = (rel) => readFileSync(join(appRoot, rel), "utf8");

test("lines that already fit keep scale exactly 1 and the same font size", () => {
  assert.equal(resolveTextFitScale(600, 1200), 1);
  assert.equal(resolveTextFitScale(1200, 1200), 1);
  assert.equal(resolveTextFitScale(1, 1200), 1);
  assert.equal(resolveFittedFontSize(28, 600, 1200), 28);
  assert.equal(resolveFittedFontSize(48, 1200, 1200), 48);
});

test("a long line scales down so its rendered width fits the canvas", () => {
  // Simulates a 30px line measuring 1800 wide on a 1200 canvas (canvas
  // measureText scales linearly with font size for the same font).
  const fit = resolveTextFitScale(1800, 1200);
  assert.ok(Math.abs(fit - 2 / 3) < 1e-12);
  const fittedSize = resolveFittedFontSize(30, 1800, 1200);
  assert.equal(fittedSize, 20);
  // At the fitted size the line measures exactly the canvas width.
  assert.equal((fittedSize / 30) * 1800, 1200);
});

test("shrinking stops at the floor for pathological lines", () => {
  assert.equal(MIN_TEXT_FIT_SCALE, 0.5);
  assert.equal(resolveTextFitScale(10000, 1200), MIN_TEXT_FIT_SCALE);
  assert.equal(resolveFittedFontSize(40, 10000, 1200), 20);
  // Floor behaviour, locked on purpose: at the floor the line is drawn at
  // half size and may still overflow (centred, as before) rather than being
  // clipped or truncated — 20/40 * 10000 = 5000 > 1200.
  assert.ok((20 / 40) * 10000 > 1200);
});

test("degenerate measurements never scale", () => {
  assert.equal(resolveTextFitScale(0, 1200), 1);
  assert.equal(resolveTextFitScale(-5, 1200), 1);
  assert.equal(resolveTextFitScale(1200, 0), 1);
  assert.equal(resolveTextFitScale(Number.NaN, 1200), 1);
  assert.equal(resolveTextFitScale(1200, Number.NaN), 1);
  assert.equal(resolveFittedFontSize(0, 1800, 1200), 0);
});

test("wiring: drawText fits each box against the shape-aware available width", () => {
  const source = read("src/lib/renderSky.ts");
  assert.match(source, /from "\.\/textFit"/);
  // Wave D (U06/U14): the fit bound is no longer the raw canvas width —
  // it is the shape-aware bound (frame inset / diamond mask), asserted
  // behaviourally in personaSweepWaveD.test.mjs. S93-2 (classes 2+3):
  // the bound is now resolved per line by resolveTextLineLayout from
  // the box's own anchor and alignment (the centred-only
  // resolveShapeTextAvailableWidth call is superseded in the render
  // path; the helper itself remains for the drag-clamp model and is
  // asserted in textDragClamp / shapeTextRows407).
  assert.match(source, /resolveTextLineLayout\(\{/);
});
