/**
 * PROD-SM W1-1 (issue #480) — Sky Elements controls in the live editor's
 * Advanced panel.
 *
 * Before this change the live AdvancedPanel exposed NO individual
 * controls for starIntensity, starGlow, showPlanets, planetEmphasis,
 * showMoon, or moonSize: buyers could only change them by switching an
 * entire render preset / look tier (the /simple-test SimplifiedEditor
 * had toggles, but that page is not a customer surface). All six fields
 * are real RenderOptions the renderer already honours, so this is UI
 * wiring only — no render behaviour changes.
 *
 * Pins:
 * - The panel carries a "Sky Elements" section writing each of the six
 *   fields through applyCustomRenderOptions (the panel's existing
 *   custom-options path, which stamps mapLookTier: "custom").
 * - The value sets offered match the RenderOptions unions in store.ts
 *   exactly (no invented values the renderer would ignore).
 * - The recipe builder round-trips the six fields (values the panel
 *   writes are the values the renderer receives), with the documented
 *   defaults when unset.
 * - Scope guard: the panel gains no pricing/SKU surface.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const { buildRecipeFromState } = await import("../../src/lib/renderSky.ts");

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const panel = read("../../src/components/AdvancedPanel.tsx");
const store = read("../../src/lib/store.ts");

test("AdvancedPanel has a Sky Elements section", () => {
  assert.match(panel, /Sky Elements/);
});

test("each sky-element field is written via applyCustomRenderOptions", () => {
  for (const key of [
    "starIntensity",
    "starGlow",
    "showPlanets",
    "planetEmphasis",
    "showMoon",
    "moonSize",
  ]) {
    assert.match(
      panel,
      new RegExp(`applyCustomRenderOptions\\(\\{[^}]*${key}:`),
      `AdvancedPanel must set ${key} through applyCustomRenderOptions`,
    );
  }
});

test("offered values match the RenderOptions unions in store.ts", () => {
  const unionMembers = (field) => {
    const match = store.match(new RegExp(`${field}:\\s*([^;]+);`));
    assert.ok(match, `store.ts must declare ${field}`);
    return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
  };
  const offered = (ids) => ids.sort();

  assert.deepEqual(offered(["subtle", "normal", "bold"]), unionMembers("starIntensity"));
  assert.deepEqual(offered(["normal", "highlighted"]), unionMembers("planetEmphasis"));
  assert.deepEqual(offered(["normal", "large"]), unionMembers("moonSize"));
});

test("recipe builder round-trips the six sky-element fields", () => {
  const base = {
    dateTime: "2026-11-02T21:00:00.000Z",
    location: { name: "Victoria", latitude: 48.4, longitude: -123.4, timezone: "UTC" },
    textBoxes: [],
    selectedStyle: "navyGold",
  };

  const explicit = buildRecipeFromState({
    ...base,
    renderOptions: {
      starIntensity: "subtle",
      starGlow: false,
      showPlanets: false,
      planetEmphasis: "normal",
      showMoon: false,
      moonSize: "normal",
    },
  });
  assert.equal(explicit.renderOptions.starIntensity, "subtle");
  assert.equal(explicit.renderOptions.starGlow, false);
  assert.equal(explicit.renderOptions.showPlanets, false);
  assert.equal(explicit.renderOptions.planetEmphasis, "normal");
  assert.equal(explicit.renderOptions.showMoon, false);
  assert.equal(explicit.renderOptions.moonSize, "normal");

  const defaults = buildRecipeFromState({ ...base, renderOptions: {} });
  assert.equal(defaults.renderOptions.starIntensity, "normal");
  assert.equal(defaults.renderOptions.starGlow, true);
  assert.equal(defaults.renderOptions.showPlanets, true);
  assert.equal(defaults.renderOptions.planetEmphasis, "highlighted");
  assert.equal(defaults.renderOptions.showMoon, true);
  assert.equal(defaults.renderOptions.moonSize, "large");
});

test("scope guard: the panel carries no pricing or SKU surface", () => {
  assert.doesNotMatch(panel, /formatPrice|amountCents|priceCents|PrintVariant/);
});
