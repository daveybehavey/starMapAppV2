import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
register("./tsAliasLoader.mjs", import.meta.url);
const { resolveFixedStarColor } = await import("../../src/lib/starColorMode.ts");
const { buildRecipeFromState } = await import("../../src/lib/renderSky.ts");
const { stableMapRecipeFingerprint } = await import("../../src/lib/mapRecipeFingerprint.ts");
const { normalizeEditorDraftData } = await import("../../src/lib/editorDraft.ts");

test("absent and malformed modes retain historical ordinary and premium color choices", () => {
  for (const mode of [undefined, null, "invalid", 1]) {
    for (const historical of [true, false]) assert.equal(resolveFixedStarColor(mode, historical), historical);
  }
});

test("draft validation preserves valid color modes and absence; rejects malformed choices", () => {
  const draft = { datetimeISO:"2026-11-03T21:00:00.000Z", location:{name:"Victoria",latitude:48.4,longitude:-123.4,timezone:"UTC"}, textBoxes:[], selectedStyle:"navyGold" };
  for (const mode of [undefined, "fixed", "spectral"]) {
    const result = normalizeEditorDraftData({ ...draft, renderOptions:mode === undefined ? {} : { starColorMode:mode } });
    assert.equal(result.ok, true);
    assert.equal(result.value.renderOptions.starColorMode, mode);
    if (mode === undefined) assert.equal(Object.hasOwn(result.value.renderOptions,"starColorMode"), false);
  }
  for (const mode of ["unknown", null, 1]) assert.equal(normalizeEditorDraftData({ ...draft, renderOptions:{starColorMode:mode} }).ok, false);
});
test("explicit fixed and spectral apply independently of style and premium defaults", () => {
  for (const historical of [true, false]) {
    assert.equal(resolveFixedStarColor("fixed", historical), true);
    assert.equal(resolveFixedStarColor("spectral", historical), false);
  }
});
test("parchment always retains contrast-qualified dark ink", () => {
  for (const mode of [undefined, "fixed", "spectral"]) assert.equal(resolveFixedStarColor(mode, false, true), true);
});
test("new choices round trip into the recipe binding while absent remains absent", () => {
  const base = { dateTime: "2026-11-03T21:00:00.000Z", location: { name:"Victoria",latitude:48.4,longitude:-123.4,timezone:"UTC" }, selectedStyle:"navyGold",textBoxes:[], renderOptions:{} };
  const legacy = buildRecipeFromState(base);
  assert.equal(Object.hasOwn(legacy.renderOptions, "starColorMode"), false);
  const fingerprint = stableMapRecipeFingerprint(legacy);
  for (const mode of ["fixed", "spectral"]) {
    const recipe = buildRecipeFromState({ ...base, renderOptions:{starColorMode:mode} });
    assert.equal(recipe.renderOptions.starColorMode, mode);
    assert.notEqual(stableMapRecipeFingerprint(recipe), fingerprint);
  }
});
