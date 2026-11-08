/**
 * Dense-scene command-stream equivalence pin for the editor render pipeline.
 *
 * Pins the mocked Canvas 2D command stream for REFERENCE_SCENE
 * (editor-render-perf-dense-v1) so optimizations must stay byte-identical
 * at the draw-command level (same approach as milkyWay.test.mjs).
 *
 * Coverage note: existing goldens (milkyWay / bortleSky / map-tier snaps)
 * do not cover this dense polished Santorini winter scene. This harness
 * closes that gap cheaply without Playwright OS baselines.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";
import { REFERENCE_SCENE } from "../editor-render-profile/referenceScene.mjs";

register("./tsAliasLoader.mjs", import.meta.url);

globalThis.Path2D = class {
  rect(...args) {
    this.rectArgs = args;
  }
};

const { buildRecipeFromState, renderStarMap, renderStarMapTextLayer } =
  await import("../../src/lib/renderSky.ts");
const { computeVisibleStars } = await import("../../src/lib/astronomy.ts");

const fixtureUrl = new URL("./fixtures/editor-render-dense-v1.json", import.meta.url);

function captureCommands(run) {
  const commands = [];
  let id = 0;
  function canvas(label) {
    const state = { globalAlpha: 1 };
    const stack = [];
    const result = { width: 0, height: 0, style: {} };
    const ctx = new Proxy(state, {
      get(target, key) {
        if (key === "canvas") return result;
        if (key in target) return target[key];
        if (key === "measureText") return (text) => ({ width: String(text).length * 10 });
        if (key === "getTransform") return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        return (...args) => {
          commands.push([label, key, ...args]);
          if (key === "save") stack.push({ ...target });
          if (key === "restore") {
            const saved = stack.pop();
            for (const name of Object.keys(target)) delete target[name];
            Object.assign(target, saved);
          }
          if (key === "createLinearGradient" || key === "createRadialGradient") {
            const gradientId = ++id;
            return {
              id: gradientId,
              addColorStop: (...stop) => commands.push([label, "stop", gradientId, ...stop]),
            };
          }
        };
      },
      set(target, key, value) {
        commands.push([label, "set", key, value]);
        target[key] = value;
        return true;
      },
    });
    result.getContext = () => ctx;
    return result;
  }

  const previous = globalThis.document;
  globalThis.document = { createElement: () => canvas("fade") };
  try {
    run(canvas);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
  return commands;
}

function hashCommands(commands) {
  return createHash("sha256").update(JSON.stringify(commands)).digest("hex");
}

const recipe = buildRecipeFromState({
  dateTime: REFERENCE_SCENE.dateTime,
  location: REFERENCE_SCENE.location,
  textBoxes: REFERENCE_SCENE.textBoxes,
  selectedStyle: REFERENCE_SCENE.selectedStyle,
  aspectRatio: REFERENCE_SCENE.aspectRatio,
  shape: REFERENCE_SCENE.shape,
  renderOptions: REFERENCE_SCENE.renderOptions,
  seed: REFERENCE_SCENE.seed,
});

const { width, height } = REFERENCE_SCENE.previewSize;
const sky = computeVisibleStars(
  {
    datetimeISO: recipe.datetimeISO,
    lat: recipe.location.latitude,
    lon: recipe.location.longitude,
    bortle: 4.5,
    showConstellations: true,
  },
  width,
  height,
);

// watermark:false — the watermark mask LRU changes the command stream on
// warm runs (mask build vs cache hit). Watermark painting has its own
// unit coverage; this harness pins the dense sky + caption draw path.
const cases = {
  full_single_canvas: () =>
    captureCommands((canvas) => {
      renderStarMap({
        recipe,
        canvas: canvas("main"),
        width,
        height,
        watermark: false,
        quality: "export",
        premium: false,
        includeText: true,
        skyOverride: sky,
        skipSkyCompute: true,
      });
    }),
  base_sky_only: () =>
    captureCommands((canvas) => {
      renderStarMap({
        recipe: { ...recipe, textBoxes: [] },
        canvas: canvas("main"),
        width,
        height,
        watermark: false,
        quality: "export",
        premium: false,
        includeText: false,
        skyOverride: sky,
        skipSkyCompute: true,
      });
    }),
  text_layer_only: () =>
    captureCommands((canvas) => {
      renderStarMapTextLayer({
        canvas: canvas("main"),
        width,
        height,
        textBoxes: recipe.textBoxes,
        shape: recipe.shape,
        frameEnabled: true,
        watermark: false,
      });
    }),
};

/**
 * Pin the WARM command stream: textMetricsCache (and similar LRUs) omit
 * measureText / font sets on cache hits, so cold vs warm streams differ.
 * Warm-then-capture is stable and matches the editor's steady-state path.
 */
function warmThenCapture(fn) {
  fn(); // populate caches
  const commands = fn();
  return {
    hash: hashCommands(commands),
    commandCount: commands.length,
  };
}

const outputs = Object.fromEntries(
  Object.entries(cases).map(([key, fn]) => [key, warmThenCapture(fn)]),
);

test("dense reference scene sky inventory stays pinned", () => {
  assert.equal(sky.stars.length, 4407);
  assert.deepEqual(
    sky.planets.map((p) => p.name),
    ["Mars", "Jupiter"],
  );
  assert.ok(sky.moon);
  assert.equal(sky.constellations.length, 41);
  assert.equal(
    sky.constellations.reduce((n, c) => n + c.lines.length, 0),
    376,
  );
});

test("dense reference scene Canvas streams stay byte-identical across full/base/text paths", () => {
  const baseline = JSON.parse(readFileSync(fixtureUrl, "utf8"));
  assert.deepEqual(outputs, baseline);
});

test("dense reference scene warm streams are stable across repeated captures", () => {
  for (const [key, fn] of Object.entries(cases)) {
    assert.equal(warmThenCapture(fn).hash, outputs[key].hash, key);
  }
});
