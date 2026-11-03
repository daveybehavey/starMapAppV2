import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";
register("./tsAliasLoader.mjs", import.meta.url);
const { applyStyleDefaults, getStyleTextDefaults } = await import("../../src/lib/styleDefaults.ts");
const { applyMapLookTier, applyTierTypographyProtected } = await import("../../src/lib/mapLookTiers.ts");
const { normalizeEditorDraftData } = await import("../../src/lib/editorDraft.ts");
const { proPresets } = await import("../../src/lib/proPresets.ts");
const { useStore } = await import("../../src/lib/store.ts");
const { buildRecipeFromState } = await import("../../src/lib/renderSky.ts");
const { cloneTextBoxWithNormalizedBinding, cloneTextBoxWithExplicitBinding } =
  await import("../../src/lib/textStyleBinding.ts");
const preset = proPresets.find((p) => p.id === "evergreenAtlas-signature");
const fixture = JSON.parse(readFileSync(new URL("../evergreen-atlas/fixture.json", import.meta.url)));

test("Evergreen defaults do not author layout, frame style or Bortle; new rows inherit free typography", () => {
  const defaults = applyStyleDefaults("evergreenAtlas", []).renderOptions;
  for (const key of ["shapeLayoutVersion", "frameStyle", "bortleClass"])
    assert.equal(Object.hasOwn(defaults, key), false);
  assert.equal(defaults.showTechnicalRing, false);
  assert.equal(defaults.transparentBackground, false);
  assert.equal(defaults.starGlow, false);
  assert.equal(useStore.getState().selectedStyle, "navyGold");
  assert.deepEqual(getStyleTextDefaults("evergreenAtlas"), { fontFamily: "cormorant", color: "#C8D8BB" });
  assert.equal(applyMapLookTier("polished", "evergreenAtlas").visualMode, "enhanced");
});

test("Automatic rows follow minimal/polished typography without repositioning; authored and custom survive", () => {
  for (const tier of ["minimal", "polished"]) {
    const automatic = preset.textBoxes
      .map(cloneTextBoxWithNormalizedBinding)
      .map((b) => ({ ...b, position: { x: 0.3, y: 0.4 } }));
    const result = applyTierTypographyProtected(
      tier,
      "evergreenAtlas",
      applyStyleDefaults("evergreenAtlas", automatic).textBoxes
    );
    assert.deepEqual(
      result.map((b) => b.size),
      tier === "minimal" ? [44, 18, 20] : [48, 20, 22]
    );
    assert.deepEqual(
      result.map((b) => b.fontFamily),
      ["cormorant", "montserrat", "cormorant"]
    );
    assert.deepEqual(
      result.map((b) => b.fontWeight),
      [600, 400, 400]
    );
    assert.ok(
      result.every((b) => b.position.x === 0.3 && b.position.y === 0.4 && !b.textGlow && !b.textShadow)
    );
    const authored = automatic
      .map(cloneTextBoxWithExplicitBinding)
      .map((b) => ({ ...b, color: "#123456", fontFamily: "lora", fontWeight: 700 }));
    const protectedRows = applyTierTypographyProtected(
      tier,
      "evergreenAtlas",
      applyStyleDefaults("evergreenAtlas", authored).textBoxes
    );
    assert.ok(
      protectedRows.every((b) => b.color === "#123456" && b.fontFamily === "lora" && b.fontWeight === 700)
    );
    assert.equal(applyTierTypographyProtected("custom", "evergreenAtlas", authored), authored);
  }
});

test("Evergreen recipe and typography bindings round-trip drafts with legacy/v2 layout semantics", () => {
  for (const version of [undefined, 2]) {
    const renderOptions = { ...preset.renderOptions, ...(version ? { shapeLayoutVersion: version } : {}) };
    const recipe = buildRecipeFromState({ ...fixture, renderOptions, textBoxes: preset.textBoxes });
    const parsed = normalizeEditorDraftData(JSON.parse(JSON.stringify(recipe)));
    assert.equal(parsed.ok, true);
    assert.equal(parsed.value.selectedStyle, "evergreenAtlas");
    assert.equal(parsed.value.renderOptions.shapeLayoutVersion, version);
    assert.deepEqual(
      parsed.value.textBoxes.map((b) => b.textStyleBinding),
      preset.textBoxes.map((b) => b.textStyleBinding)
    );
  }
  const recipe = buildRecipeFromState({
    ...fixture,
    renderOptions: preset.renderOptions,
    textBoxes: preset.textBoxes,
  });
  delete recipe.selectedStyle;
  assert.equal(normalizeEditorDraftData(recipe).value.selectedStyle, "navyGold");
});
