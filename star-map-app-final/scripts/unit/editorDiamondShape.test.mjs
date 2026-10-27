import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { SHAPE_PATHS, getShapeGeometry } from "../../src/lib/shapes/index.ts";
import { resolveRecipeShape } from "../../src/lib/mapRecipeHydration.ts";
import { parseEditorDraft, writeEditorDraft } from "../../src/lib/editorDraft.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const configSource = fs.readFileSync(path.join(ROOT, "src/lib/config.ts"), "utf8");

// src/lib/config.ts re-exports extensionless modules, so plain Node cannot
// import it; assert the picker list from source (same style as the
// checkoutRecoveryTrustChristmas source assertions).
function sourceBlock(startMarker, endMarker) {
  const start = configSource.indexOf(startMarker);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  const end = configSource.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing ${endMarker} after ${startMarker}`);
  return configSource.slice(start, end);
}

test("shape picker offers diamond, after star, with a label", () => {
  const block = sourceBlock("export const shapes", "];");
  const ids = [...block.matchAll(/\{\s*id: "(\w+)", label: "(\w+)" \}/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(ids, [
    ["rectangle", "Rectangle"],
    ["heart", "Heart"],
    ["circle", "Circle"],
    ["star", "Star"],
    ["diamond", "Diamond"],
  ]);
});

test("picker support covers diamond via the shared mask geometry (#415)", () => {
  // The unicode symbol/scale records were removed by #415 — picker icons
  // are SVGs of the actual mask geometry now. Diamond's support record
  // is getShapeGeometry passing the renderer's path through verbatim.
  assert.ok(!configSource.includes("export const shapeSymbols"));
  assert.ok(!configSource.includes("export const shapeSymbolScale"));
  assert.equal(getShapeGeometry("diamond").d, SHAPE_PATHS.diamond.d);
  assert.deepEqual(getShapeGeometry("diamond").viewBox, [0, 0, 100, 100]);
});

test("renderer has a real clip path for diamond and every picker shape", () => {
  for (const id of ["rectangle", "heart", "circle", "star", "diamond"]) {
    assert.ok(SHAPE_PATHS[id], `SHAPE_PATHS missing ${id}`);
    assert.deepEqual(SHAPE_PATHS[id].viewBox, [0, 0, 100, 100]);
  }
  // Rectangle is drawn procedurally (empty path); diamond must carry a real path.
  assert.equal(SHAPE_PATHS.rectangle.d, "");
  assert.equal(SHAPE_PATHS.diamond.d, "M50 6 L94 50 L50 94 L6 50 Z");
});

test("recipe hydration resolves diamond from shape and from legacy shapeMask", () => {
  assert.equal(resolveRecipeShape({ shape: "diamond" }), "diamond");
  assert.equal(resolveRecipeShape({ renderOptions: { shapeMask: "diamond" } }), "diamond");
  assert.equal(resolveRecipeShape({ shape: "hexagon" }), null);
});

const makeDiamondDraft = () => ({
  version: 1,
  seed: "diamond-test",
  datetimeISO: "2024-06-15T20:30:00.000Z",
  location: {
    name: "Paris, France",
    latitude: 48.8566,
    longitude: 2.3522,
    timezone: "Europe/Paris",
  },
  textBoxes: [
    {
      id: "title",
      label: "Title",
      text: "Our Paris Night",
      fontFamily: "cinzel",
      color: "#d7b56c",
      size: 48,
      fontWeight: 600,
      align: "center",
      textShadow: true,
      textGlow: false,
      position: { x: 0.5, y: 0.12 },
    },
  ],
  selectedStyle: "navyGold",
  aspectRatio: "3:4",
  shape: "diamond",
  renderOptions: {
    mapLookTier: "polished",
    visualMode: "enhanced",
    starIntensity: "bold",
    starGlow: true,
    constellationLines: "thin",
    constellationLabels: true,
    showGrid: false,
    showPlanets: true,
    premiumStars: "subtle",
    premiumPlanets: "realistic",
    planetEmphasis: "highlighted",
    showMoon: true,
    moonSize: "large",
    shapeMask: "diamond",
    frameEnabled: true,
    backgroundColor: "#070b1b",
    constellationColor: "#ffffff",
    constellationLineScale: 1.2,
    transparentBackground: false,
    showTechnicalRing: true,
  },
  selectedOccasion: "anniversary",
  sampleDesignLastAutoSynced: { subtitle: null, dedication: null },
});

test("editor draft with shape=diamond writes and round-trips unchanged", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  const write = writeEditorDraft(storage, makeDiamondDraft(), {
    now: () => new Date("2026-10-18T18:00:00.000Z"),
  });
  assert.equal(write.status, "saved");

  const raw = [...values.values()][0];
  const parsed = parseEditorDraft(raw);
  assert.equal(parsed.status, "restored");
  assert.equal(parsed.data.shape, "diamond");
  assert.equal(parsed.data.renderOptions.shapeMask, "diamond");
});
