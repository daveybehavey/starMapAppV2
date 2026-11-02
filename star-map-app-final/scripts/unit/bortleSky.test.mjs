import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";
register("./tsAliasLoader.mjs", import.meta.url);
const { renderStarMap, DEFAULT_RECIPE, computeSky, buildRecipeFromState, __testUtils } = await import("../../src/lib/renderSky.ts");
const { parchmentBackingAt, minAlphaForContrast, relativeLuminance, bortleWashOverlay, effectiveBortleClass } = __testUtils;

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
      if (style === "parchmentScroll" && value === 1) {
        // F1 exception, by design: at Bortle 1 the washed parchment
        // backing cannot reach the #412 3:1 criterion even at alpha 1,
        // so the compensation omits the stars instead of painting
        // sub-criterion specks — the remaining stream must differ
        // (fewer arcs), unlike every other style/value here.
        const arcs = (list) => list.filter(([name]) => name === "arc").length;
        assert.ok(arcs(result.commands) < arcs(baseline.commands), "parchment stars must be omitted at Bortle 1");
      } else {
        assert.deepEqual(result.commands, baseline.commands, "all remaining drawing, including star positions, sizes and alpha, must be identical");
      }
    }
  });
}

test("default drawing matches the pre-control main revision", () => {
  const round = (value) => Math.round(value * 1e6) / 1e6;
  const hash = createHash("sha256").update(JSON.stringify(render(undefined).commands, (_key, value) => {
    if (typeof value === "number") return round(value);
    // Gradient colors also contain calculated floating-point alpha values.
    if (typeof value === "string") return value.replace(/\d+\.\d+/g, (number) => String(round(Number(number))));
    return value;
  })).digest("hex");
  // Ignore sub-micro-pixel floating-point differences between Node/V8 versions.
  // Captured from main 54c8f533 before the Bortle control.
  assert.equal(hash, "42edc4b4a83e98551a39cfff4c409ae445a7a7f1e3a085b52f59ae804c3ffe90");
});

test("recipe rebuild preserves Bortle class", () => {
  const { recipe } = render(9);
  assert.equal(buildRecipeFromState({ ...recipe, dateTime: recipe.datetimeISO }).renderOptions.bortleClass, 9);
});

test("recipe rebuild clamps out-of-range and rejects non-finite Bortle classes (F3)", () => {
  const { recipe } = render(undefined);
  const rebuild = (bortleClass) =>
    buildRecipeFromState({
      ...recipe,
      dateTime: recipe.datetimeISO,
      renderOptions: { ...recipe.renderOptions, bortleClass },
    }).renderOptions.bortleClass;
  assert.equal(rebuild(9), 9);
  assert.equal(rebuild(12), 9);
  assert.equal(rebuild(100), 9);
  assert.equal(rebuild(0), 1);
  assert.equal(rebuild(-3), 1);
  assert.equal(rebuild(1), 1);
  assert.equal(rebuild(4.5), 4.5);
  assert.equal(rebuild(NaN), 4.5);
  assert.equal(rebuild(Infinity), 4.5);
  assert.equal(rebuild(-Infinity), 4.5);
  assert.equal(rebuild(undefined), 4.5);
});

// ── F1: the Bortle wash is part of the parchment backing model ──

const INK = { r: 0x3a, g: 0x2d, b: 0x1f };
const PAPER = { r: 0xe9, g: 0xd3, b: 0xa5 };
const compositeOver = (ink, backing, alpha) => ({
  r: ink.r * alpha + backing.r * (1 - alpha),
  g: ink.g * alpha + backing.g * (1 - alpha),
  b: ink.b * alpha + backing.b * (1 - alpha),
});
const contrastAgainst = (ink, backing, alpha) => {
  const comp = compositeOver(ink, backing, alpha);
  const [hi, lo] = [relativeLuminance(comp), relativeLuminance(backing)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
};

test("parchment backing: ≥3:1-or-omission across Bortle 1–9 against the washed backing", () => {
  const W = 600;
  const H = 600;
  // Centre (no warm wash) and a mid-disc point (partial warm wash).
  const points = [[W / 2, H / 2], [W / 2 + 0.45 * W, H / 2]];
  for (let bortle = 1; bortle <= 9; bortle += 0.5) {
    assert.equal(effectiveBortleClass({ bortleClass: bortle }), bortle);
    const overlay = bortleWashOverlay(bortle);
    if (bortle === 4.5) assert.equal(overlay, null, "default class paints no wash");
    for (const [x, y] of points) {
      const backing = parchmentBackingAt(PAPER, x, y, W, H, overlay ? [overlay] : []);
      const needed = minAlphaForContrast(INK, backing, 3);
      // The criterion at every point: either the compensated alpha
      // clears 3:1, or the star is omitted (needed === null is the
      // renderer's omission signal) — never painted below criterion.
      if (needed !== null) {
        const used = Math.max(0.575, needed); // the renderer's floor + raise
        assert.ok(contrastAgainst(INK, backing, used) >= 2.999, `Bortle ${bortle} at ${x},${y} must clear 3:1`);
      }
      // At the centre the gate measured the boundary exactly: 1–2 are
      // impossible even at alpha 1 (omission must happen), from 3 up
      // the criterion is reachable with a raised alpha.
      if (x === W / 2 && y === H / 2) {
        if (bortle <= 2) assert.equal(needed, null, `Bortle ${bortle} centre must be impossible (omission)`);
        else assert.ok(needed !== null, `Bortle ${bortle} centre must be reachable`);
      }
    }
  }
  // No overlay argument = the pre-fix model, unchanged.
  assert.deepEqual(parchmentBackingAt(PAPER, W / 2, H / 2, W, H), PAPER);
});

test("parchment renders: stars omitted at Bortle 1–2, all kept from Bortle 3 up", () => {
  const arcs = (commands) => commands.filter(([name]) => name === "arc").length;
  const baseline = arcs(render(undefined, "parchmentScroll").commands);
  assert.ok(arcs(render(1, "parchmentScroll").commands) < baseline);
  assert.ok(arcs(render(2, "parchmentScroll").commands) < baseline);
  for (const value of [3, 4, 5, 6, 7, 8, 9]) {
    assert.equal(arcs(render(value, "parchmentScroll").commands), baseline, `Bortle ${value} must keep every star`);
  }
});

test("hydration and draft restores pin bortleClass explicitly (F2, #406 shape)", () => {
  const editor = readFileSync(new URL("../../src/components/EditorExperience.tsx", import.meta.url), "utf8");
  assert.ok(editor.includes("bortleClass: recipe.renderOptions.bortleClass"), "hydration must pin the saved value");
  assert.ok(editor.includes("bortleClass: draft.renderOptions.bortleClass"), "draft restore must pin the draft value");
  const simplified = readFileSync(new URL("../../src/components/SimplifiedEditor/SimplifiedEditor.tsx", import.meta.url), "utf8");
  assert.ok(simplified.includes("bortleClass: draft.renderOptions.bortleClass"), "shared-draft restore must pin the draft value");
  assert.ok(simplified.includes("bortleClass: parsed.renderOptions.bortleClass"), "legacy private restore must pin the draft value");
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
