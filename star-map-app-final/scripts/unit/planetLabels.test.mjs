/**
 * PROD-SM W2-2 (issue #489) — optional planet name labels.
 *
 * The renderer already places planets and already has an annotation
 * system (constellation labels). This change adds ONE sibling boolean,
 * `planetLabels` (default false, exactly like `constellationLabels`),
 * threaded through every place the sibling lives — store, style
 * defaults, render presets, editor drafts, the maps API sanitizer,
 * and the recipe builder — and paints planet names inside the
 * planetary layer using the constellation labels' typography and
 * collision rule (pure layout in src/lib/planetLabels.ts).
 *
 * Pins:
 * - Label style table mirrors drawConstellations' label constants
 *   (tier sizes floored pre-scale per S93-2 class 1, letter spacing,
 *   alpha rule, collision pads, Montserrat 500, uppercase).
 * - Placement: centred on the planet's rendered centre, below its
 *   rendered disc; overlapping labels are skipped in input order;
 *   non-finite positions and empty names never label.
 * - Recipe parity: buildRecipeFromState round-trips the flag and
 *   defaults it to false — preview, both editors, and download/export
 *   all build recipes through this one function, so parity is
 *   structural, not per-surface.
 * - Preset parity: every preset carries planetLabels: false, and a
 *   design with planetLabels on no longer matches any preset
 *   (PRESET_MATCH_KEYS membership).
 * - Draft parity: drafts round-trip the flag, and a non-boolean
 *   value invalidates the draft like every sibling boolean.
 * - UI wiring: AdvancedPanel (live editor) and the SimplifiedEditor
 *   options panel expose a "Planet Names" toggle writing the field.
 * - API parity: the maps route sanitizer allows the key.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const { buildRecipeFromState } = await import("../../src/lib/renderSky.ts");
const { resolvePlanetLabelPlacements, resolvePlanetLabelStyle } = await import(
  "../../src/lib/planetLabels.ts"
);
const { getRenderPresetOptions, resolveRenderPreset } = await import(
  "../../src/lib/renderPresets.ts"
);
const { normalizeEditorDraftData, readEditorDraft, writeEditorDraft } = await import(
  "../../src/lib/editorDraft.ts"
);

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

// ─── Style: the constellation-label system, unchanged ────────────────────────

test("label style mirrors the constellation label constants per tier", () => {
  const minimal = resolvePlanetLabelStyle("minimal", 1);
  assert.equal(minimal.fontSizePx, 8);
  assert.equal(minimal.letterSpacingPx, 0.2);
  assert.equal(minimal.alpha, 0.52);
  assert.equal(minimal.collisionPadX, 6);
  assert.equal(minimal.collisionPadY, 5);
  assert.equal(minimal.font, '500 8px "Montserrat", sans-serif');

  const polished = resolvePlanetLabelStyle("polished", 1);
  assert.equal(polished.fontSizePx, 9.5);
  assert.equal(polished.letterSpacingPx, 0.15);
  assert.equal(polished.alpha, 0.56);
  assert.equal(polished.collisionPadX, 5);
  assert.equal(polished.collisionPadY, 4);

  const custom = resolvePlanetLabelStyle("custom", 1);
  assert.equal(custom.fontSizePx, 9);
  assert.equal(custom.letterSpacingPx, 0.12);
  assert.equal(custom.alpha, 0.52);
});

test("label style scales with the canvas (minima floored pre-scale)", () => {
  const style = resolvePlanetLabelStyle("polished", 2);
  assert.equal(style.fontSizePx, 19);
  assert.equal(style.letterSpacingPx, 0.3);
  assert.equal(style.font, '500 19px "Montserrat", sans-serif');
});

// ─── Placement ───────────────────────────────────────────────────────────────

const measure = (text) => text.length * 6; // deterministic stand-in for ctx.measureText

test("placement centres the uppercase name below the rendered disc", () => {
  const style = resolvePlanetLabelStyle("custom", 1);
  const placements = resolvePlanetLabelPlacements(
    [{ name: "Mars", x: 100, y: 50, radius: 4 }],
    style,
    measure,
  );
  assert.equal(placements.length, 1);
  assert.equal(placements[0].name, "Mars");
  assert.equal(placements[0].text, "MARS");
  assert.equal(placements[0].x, 100);
  assert.equal(placements[0].y, 50 + 4 + style.fontSizePx * 0.85);
});

test("overlapping labels are skipped in input order; distant labels all paint", () => {
  const style = resolvePlanetLabelStyle("custom", 1);
  const crowded = resolvePlanetLabelPlacements(
    [
      { name: "Mars", x: 100, y: 50, radius: 4 },
      { name: "Venus", x: 104, y: 52, radius: 4 },
    ],
    style,
    measure,
  );
  assert.deepEqual(
    crowded.map((p) => p.name),
    ["Mars"],
  );

  const spread = resolvePlanetLabelPlacements(
    [
      { name: "Mars", x: 100, y: 50, radius: 4 },
      { name: "Venus", x: 400, y: 300, radius: 5 },
      { name: "Saturn", x: 700, y: 120, radius: 6 },
    ],
    style,
    measure,
  );
  assert.deepEqual(
    spread.map((p) => p.name),
    ["Mars", "Venus", "Saturn"],
  );
});

test("non-finite positions and empty names never produce a label", () => {
  const style = resolvePlanetLabelStyle("custom", 1);
  const placements = resolvePlanetLabelPlacements(
    [
      { name: "Mars", x: Number.NaN, y: 50, radius: 4 },
      { name: "Venus", x: 100, y: Number.POSITIVE_INFINITY, radius: 4 },
      { name: "", x: 100, y: 50, radius: 4 },
    ],
    style,
    measure,
  );
  assert.equal(placements.length, 0);
});

// ─── Recipe parity (the one render-options path) ─────────────────────────────

const recipeBase = {
  dateTime: "2026-11-02T21:00:00.000Z",
  location: { name: "Victoria", latitude: 48.4, longitude: -123.4, timezone: "UTC" },
  textBoxes: [],
  selectedStyle: "navyGold",
};

test("recipe builder round-trips planetLabels and defaults it to false", () => {
  const on = buildRecipeFromState({ ...recipeBase, renderOptions: { planetLabels: true } });
  assert.equal(on.renderOptions.planetLabels, true);

  const off = buildRecipeFromState({ ...recipeBase, renderOptions: { planetLabels: false } });
  assert.equal(off.renderOptions.planetLabels, false);

  const unset = buildRecipeFromState({ ...recipeBase, renderOptions: {} });
  assert.equal(unset.renderOptions.planetLabels, false);
});

test("renderer gates the label pass on the flag and paints inside the planetary layer", () => {
  const renderSky = read("../../src/lib/renderSky.ts");
  assert.match(renderSky, /planetLabels: input\.renderOptions\?\.planetLabels \?\? false/);
  assert.match(renderSky, /if \(renderOptions\?\.planetLabels \?\? false\)/);
  assert.match(renderSky, /resolvePlanetLabelPlacements/);
});

// ─── Defaults: off everywhere a sibling default lives ────────────────────────

test("planetLabels defaults to false in the store and every style default", () => {
  const store = read("../../src/lib/store.ts");
  assert.match(store, /planetLabels: boolean;/);
  assert.match(store, /planetLabels: false,/);

  const styleDefaults = read("../../src/lib/styleDefaults.ts");
  assert.equal([...styleDefaults.matchAll(/planetLabels: false,/g)].length, 4);
});

// ─── Preset parity ───────────────────────────────────────────────────────────

test("every preset carries planetLabels: false and the flag is a preset match key", () => {
  const fullBase = buildRecipeFromState({ ...recipeBase, renderOptions: {} }).renderOptions;
  for (const presetId of ["signature", "clean"]) {
    for (const styleId of ["navyGold", "vintageEngraving", "parchmentScroll", "midnightMinimal"]) {
      const presetOptions = getRenderPresetOptions(presetId, styleId);
      assert.equal(presetOptions.planetLabels, false, `${presetId}/${styleId}`);
      const design = { ...fullBase, ...presetOptions };
      assert.equal(resolveRenderPreset(design, styleId), presetId);
      assert.equal(
        resolveRenderPreset({ ...design, planetLabels: true }, styleId),
        null,
        `planetLabels on must break the ${presetId}/${styleId} match`,
      );
    }
  }
});

// ─── Draft parity ────────────────────────────────────────────────────────────

const makeDraft = (renderOptions) => ({
  version: 1,
  seed: "planet-labels-test",
  datetimeISO: "2024-06-15T20:30:00.000Z",
  location: { name: "Paris, France", latitude: 48.8566, longitude: 2.3522, timezone: "Europe/Paris" },
  textBoxes: [],
  selectedStyle: "navyGold",
  aspectRatio: "3:4",
  shape: "heart",
  renderOptions,
  selectedOccasion: "anniversary",
  sampleDesignLastAutoSynced: { subtitle: null, dedication: null },
  dateTimeIsUntouchedDefault: false,
});

const memoryStorage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test("drafts round-trip planetLabels both ways", () => {
  for (const flag of [true, false]) {
    const storage = memoryStorage();
    const write = writeEditorDraft(storage, makeDraft({ planetLabels: flag }));
    assert.equal(write.status, "saved");
    const readBack = readEditorDraft(storage);
    assert.equal(readBack.status, "restored");
    assert.equal(readBack.data.renderOptions.planetLabels, flag);
  }
});

test("a non-boolean planetLabels invalidates the draft like sibling booleans", () => {
  const valid = normalizeEditorDraftData(makeDraft({ planetLabels: true }));
  assert.equal(valid.ok, true);
  assert.equal(valid.value.renderOptions.planetLabels, true);

  const invalid = normalizeEditorDraftData(makeDraft({ planetLabels: "yes" }));
  assert.equal(invalid.ok, false);
  assert.equal(invalid.reason, "invalid_render_options");
});

// ─── UI + API wiring ─────────────────────────────────────────────────────────

test("AdvancedPanel exposes a Planet Names toggle writing planetLabels", () => {
  const panel = read("../../src/components/AdvancedPanel.tsx");
  assert.match(panel, /Planet Names/);
  assert.match(panel, /applyCustomRenderOptions\(\{ planetLabels: !renderOptions\.planetLabels \}\)/);
});

test("SimplifiedEditor options panel exposes a Planet Names toggle", () => {
  const panel = read("../../src/components/SimplifiedEditor/AdvancedOptionsPanel.tsx");
  assert.match(panel, /label="Planet Names"/);
  assert.match(panel, /setRenderOptions\(\{ planetLabels: val \}\)/);

  const simplified = read("../../src/components/SimplifiedEditor/SimplifiedEditor.tsx");
  assert.match(simplified, /planetLabels: false,/);
});

test("maps API sanitizer allows planetLabels", () => {
  const route = read("../../src/app/api/maps/route.ts");
  assert.match(route, /"planetLabels",/);
});
