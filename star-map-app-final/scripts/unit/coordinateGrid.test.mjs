/**
 * PROD-SM W1-3 (issue #482) — coordinate grid overlay (showGrid).
 *
 * RenderOptions.showGrid was plumbed through the store, both render
 * presets, style defaults, draft persistence and API validation, but
 * renderSky never drew a grid — the option was dead. This change
 * implements the overlay in the renderer's own polar projection and
 * (in AdvancedPanel) the buyer toggle.
 *
 * The geometry helper is the exact inverse of the star projection in
 * astronomy.computeVisibleStars:
 *   centre = (w/2, h/2); R = min(w,h) × 0.45;
 *   altitude a → radius ((90 − a)/90) × R;
 *   azimuth θ → (cx + R·sinθ, cy − R·cosθ)  (north up, east right).
 * These pins lock that correspondence numerically so the grid can
 * never drift away from the stars it charts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const { computeCoordinateGridGeometry } = await import("../../src/lib/renderSky.ts");

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const renderSky = read("../../src/lib/renderSky.ts");
const panel = read("../../src/components/AdvancedPanel.tsx");

test("grid geometry for a square canvas matches the star projection", () => {
  const geo = computeCoordinateGridGeometry(1200, 1200);
  assert.equal(geo.centerX, 600);
  assert.equal(geo.centerY, 600);
  assert.equal(geo.radius, 540); // 0.45 × 1200, the horizon circle

  const byAltitude = Object.fromEntries(geo.altitudeCircles.map((c) => [c.altitudeDeg, c.radius]));
  assert.deepEqual(byAltitude, { 15: 450, 30: 360, 45: 270, 60: 180, 75: 90 });
});

test("azimuth spokes point north/east/south/west in screen space", () => {
  const geo = computeCoordinateGridGeometry(1200, 1200);
  assert.equal(geo.azimuthSpokes.length, 12);
  const byAzimuth = Object.fromEntries(geo.azimuthSpokes.map((s) => [s.azimuthDeg, s]));
  assert.deepEqual([byAzimuth[0].endX, byAzimuth[0].endY], [600, 60]); // north = top
  assert.deepEqual([byAzimuth[90].endX, byAzimuth[90].endY], [1140, 600]); // east = right
  assert.deepEqual([byAzimuth[180].endX, byAzimuth[180].endY], [600, 1140]); // south = bottom
  assert.deepEqual([byAzimuth[270].endX, byAzimuth[270].endY], [60, 600]); // west = left
});

test("grid geometry uses the smaller dimension for non-square canvases", () => {
  const geo = computeCoordinateGridGeometry(1000, 800);
  assert.equal(geo.centerX, 500);
  assert.equal(geo.centerY, 400);
  assert.equal(geo.radius, 360); // 0.45 × 800
});

test("drawSky draws the grid only when showGrid is set, under the sky layers", () => {
  const gridCall = renderSky.indexOf("drawCoordinateGrid(ctx, width, height, palette.accent, scale)");
  assert.ok(gridCall > 0, "drawSky must call drawCoordinateGrid");
  assert.match(renderSky, /if \(renderOptions\?\.showGrid\) \{\s*drawCoordinateGrid/);
  // Grid precedes the constellation layer invocation in drawSky.
  const constellationCall = renderSky.indexOf("drawParchmentFadedLayer(ctx, width, height, drawConstellations)");
  assert.ok(gridCall < constellationCall, "grid must render beneath constellations/stars");
});

test("AdvancedPanel exposes the grid toggle through the custom-options path", () => {
  assert.match(panel, /applyCustomRenderOptions\(\{ showGrid: !renderOptions\.showGrid \}\)/);
});
