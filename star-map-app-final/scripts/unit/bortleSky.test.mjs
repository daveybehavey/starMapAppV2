import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { register } from "node:module";
import test from "node:test";
register("./tsAliasLoader.mjs", import.meta.url);
const { renderStarMap, DEFAULT_RECIPE, computeSky, buildRecipeFromState } = await import("../../src/lib/renderSky.ts");

// Record the real renderer's canvas commands, including every star arc and
// radius, without depending on platform-specific font rasterization.
globalThis.Path2D = class { rect() {} arc() {} };
function render(bortleClass, selectedStyle = "navyGold") {
  const commands = [];
  const ctx = new Proxy({}, {
    set(target, key, value) {
      commands.push(["set", key, value]);
      target[key] = value;
      return true;
    },
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        commands.push([key, ...args]);
        if (key === "measureText") return { width: 30 };
        if (key.startsWith("create")) return { addColorStop: (...stops) => commands.push(["stop", ...stops]) };
      };
    },
  });
  const recipe = {
    ...DEFAULT_RECIPE,
    datetimeISO: "2024-06-01T21:00:00.000Z",
    location: { name: "London", latitude: 51.5, longitude: -0.12, timezone: "Europe/London" },
    selectedStyle,
    renderOptions: { ...DEFAULT_RECIPE.renderOptions, bortleClass },
  };
  renderStarMap({ recipe, canvas: { getContext: () => ctx }, width: 600, height: 600, quality: "export", watermark: false });
  return { commands: JSON.parse(JSON.stringify(commands)), recipe };
}

for (const style of ["navyGold", "midnightMinimal", "parchmentScroll", "vintageEngraving"]) {
  test(`${style}: default matches historical canvas commands; only background changes at 1 and 9`, () => {
    const baseline = render(undefined, style);
    assert.deepEqual(render(4.5, style).commands, baseline.commands);
    assert.ok(baseline.commands.filter(([name]) => name === "arc").length > 50, "must exercise the actual star field");
    for (const value of [1, 9]) {
      const result = render(value, style);
      assert.deepEqual(computeSky(result.recipe, 600, 600), computeSky(baseline.recipe, 600, 600));
      const index = result.commands.findIndex((command) => command[0] === "set" && command[1] === "fillStyle" && command[2] === (value === 1 ? "#000000" : "#ffffff"));
      assert.ok(index > 0);
      assert.deepEqual(result.commands.slice(index - 1, index + 5), [
        ["save"], ["set", "fillStyle", value === 1 ? "#000000" : "#ffffff"],
        ["set", "globalAlpha", value === 1 ? 0.75 : 0.28],
        ["fillRect", 0, 0, 600, 600], ["restore"],
        baseline.commands[index - 1],
      ]);
      result.commands.splice(index - 1, 5);
      assert.deepEqual(result.commands, baseline.commands, "all remaining drawing, including star positions, sizes and alpha, must be identical");
    }
  });
}

test("default drawing matches the pre-control main revision", () => {
  const hash = createHash("sha256").update(JSON.stringify(render(undefined).commands)).digest("hex");
  // Captured from main 54c8f533 before the Bortle control.
  assert.equal(hash, "258cb2b492803e53fa52d90a00bdf6a7aa49dc6a8a4689f0b23a18ea4966cb6a");
});

test("recipe rebuild preserves Bortle class", () => {
  const { recipe } = render(9);
  assert.equal(buildRecipeFromState({ ...recipe, dateTime: recipe.datetimeISO }).renderOptions.bortleClass, 9);
});

test("draft recovery preserves the setting and clamps untrusted numeric values", async () => {
  const { normalizeEditorDraftData } = await import("../../src/lib/editorDraft.ts");
  for (const [input, expected] of [[1, 1], [4.5, 4.5], [9, 9], [-2, 1], [12, 9]]) {
    const { recipe } = render(input);
    const result = normalizeEditorDraftData(recipe);
    assert.equal(result.ok, true);
    assert.equal(result.value.renderOptions.bortleClass, expected);
  }
  const { recipe } = render(NaN);
  assert.equal(normalizeEditorDraftData(recipe).ok, false);
});
