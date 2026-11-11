/**
 * Editor render pipeline profiler (Node, mocked Canvas 2D).
 *
 * Measures draw-call counts by category and wall time for the dense
 * REFERENCE_SCENE across preview / text-layer / HD export paths.
 *
 * Usage (from star-map-app-final/, Node ≥ 22.18):
 *   TZ=UTC node scripts/editor-render-profile/profile.mjs
 */
import { execFileSync } from "node:child_process";
import { buildProfileInstants } from "./profileInstants.mjs";
import { captureCanvasDimensions } from "./canvasDimensions.mjs";
import { register } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { REFERENCE_SCENE } from "./referenceScene.mjs";

register("../unit/tsAliasLoader.mjs", import.meta.url);

globalThis.Path2D = class {
  constructor() {
    this.ops = [];
  }
  rect(...args) {
    this.ops.push(["rect", ...args]);
  }
  moveTo(...args) {
    this.ops.push(["moveTo", ...args]);
  }
  lineTo(...args) {
    this.ops.push(["lineTo", ...args]);
  }
  arc(...args) {
    this.ops.push(["arc", ...args]);
  }
  closePath() {
    this.ops.push(["closePath"]);
  }
};

const { buildRecipeFromState, renderStarMap, renderStarMapTextLayer, computeSky } =
  await import("../../src/lib/renderSky.ts");
const { computeVisibleStars } = await import("../../src/lib/astronomy.ts");

const DRAW_METHODS = new Set([
  "fill",
  "stroke",
  "fillRect",
  "clearRect",
  "fillText",
  "strokeText",
  "drawImage",
  "putImageData",
]);

function createInstrumentingCanvas(label, counters) {
  const state = {
    globalAlpha: 1,
    fillStyle: "#000",
    strokeStyle: "#000",
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    lineWidth: 1,
    shadowBlur: 0,
    shadowColor: "transparent",
    globalCompositeOperation: "source-over",
    lineCap: "butt",
    lineJoin: "miter",
    letterSpacing: "0px",
  };
  const stack = [];
  const pathOps = [];
  let lastPathHadArc = false;
  let lastPathHadLine = false;
  let lastPathHadMove = false;

  const bump = (key, n = 1) => {
    counters[key] = (counters[key] || 0) + n;
  };

  const classifyFill = () => {
    bump("fill");
    if (lastPathHadArc) bump("fill_arc");
    else if (lastPathHadLine) bump("fill_path");
    else bump("fill_other");
  };
  const classifyStroke = () => {
    bump("stroke");
    if (lastPathHadLine) bump("stroke_line");
    else if (lastPathHadArc) bump("stroke_arc");
    else bump("stroke_other");
  };

  const result = { width: 0, height: 0, style: {}, label };
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key === "canvas") return result;
      if (key in target) return target[key];
      if (key === "measureText") {
        return (text) => {
          bump("measureText");
          // Deterministic stand-in width (cinzel-ish).
          return { width: String(text).length * 10 };
        };
      }
      if (key === "getTransform") {
        return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      }
      if (key === "beginPath") {
        return () => {
          bump("beginPath");
          pathOps.length = 0;
          lastPathHadArc = false;
          lastPathHadLine = false;
          lastPathHadMove = false;
        };
      }
      if (key === "moveTo") {
        return (...args) => {
          bump("moveTo");
          lastPathHadMove = true;
          pathOps.push(["moveTo", ...args]);
        };
      }
      if (key === "lineTo") {
        return (...args) => {
          bump("lineTo");
          lastPathHadLine = true;
          pathOps.push(["lineTo", ...args]);
        };
      }
      if (key === "arc") {
        return (...args) => {
          bump("arc");
          lastPathHadArc = true;
          pathOps.push(["arc", ...args]);
        };
      }
      if (key === "closePath") {
        return () => {
          bump("closePath");
        };
      }
      if (key === "clip") {
        return () => {
          bump("clip");
        };
      }
      if (key === "setLineDash") {
        return () => {
          bump("setLineDash");
        };
      }
      if (key === "save") {
        return () => {
          bump("save");
          stack.push({ ...target });
        };
      }
      if (key === "restore") {
        return () => {
          bump("restore");
          const saved = stack.pop();
          if (saved) {
            for (const name of Object.keys(target)) delete target[name];
            Object.assign(target, saved);
          }
        };
      }
      if (key === "createLinearGradient" || key === "createRadialGradient") {
        return (...args) => {
          bump(key);
          return {
            addColorStop: () => {
              bump("addColorStop");
            },
            _args: args,
          };
        };
      }
      if (key === "createPattern") {
        return () => {
          bump("createPattern");
          return {};
        };
      }
      if (DRAW_METHODS.has(key)) {
        return (...args) => {
          if (key === "fill") classifyFill();
          else if (key === "stroke") classifyStroke();
          else if (key === "fillRect") bump("fillRect");
          else if (key === "clearRect") bump("clearRect");
          else if (key === "fillText") bump("fillText");
          else if (key === "strokeText") bump("strokeText");
          else if (key === "drawImage") bump("drawImage");
          else bump(key);
          bump("drawCalls");
          void args;
        };
      }
      return (...args) => {
        bump(String(key));
        void args;
      };
    },
    set(target, key, value) {
      bump(`set:${key}`);
      target[key] = value;
      return true;
    },
  });
  result.getContext = () => ctx;
  return result;
}

function emptyCounters() {
  return {
    drawCalls: 0,
    fill: 0,
    fill_arc: 0,
    fill_path: 0,
    fill_other: 0,
    stroke: 0,
    stroke_line: 0,
    stroke_arc: 0,
    stroke_other: 0,
    fillRect: 0,
    clearRect: 0,
    fillText: 0,
    strokeText: 0,
    drawImage: 0,
    beginPath: 0,
    arc: 0,
    moveTo: 0,
    lineTo: 0,
    createRadialGradient: 0,
    createLinearGradient: 0,
    addColorStop: 0,
    measureText: 0,
    save: 0,
    restore: 0,
    clip: 0,
  };
}

function summarizeCategories(c) {
  return {
    drawCalls_total: c.drawCalls,
    stars_and_discs_fill_arc: c.fill_arc,
    constellation_line_strokes: c.stroke_line,
    fillText_labels_and_captions: c.fillText,
    fillRect_background_overlays: c.fillRect,
    clearRect: c.clearRect,
    radial_gradients: c.createRadialGradient,
    linear_gradients: c.createLinearGradient,
    measureText: c.measureText,
    beginPath: c.beginPath,
    arc: c.arc,
    drawImage_offscreen_composites: c.drawImage,
    save_restore_pairs: Math.min(c.save, c.restore),
  };
}

function buildRecipe(overrides = {}) {
  return buildRecipeFromState({
    dateTime: REFERENCE_SCENE.dateTime,
    location: REFERENCE_SCENE.location,
    textBoxes: overrides.textBoxes ?? REFERENCE_SCENE.textBoxes,
    selectedStyle: overrides.selectedStyle ?? REFERENCE_SCENE.selectedStyle,
    aspectRatio: REFERENCE_SCENE.aspectRatio,
    shape: REFERENCE_SCENE.shape,
    renderOptions: { ...REFERENCE_SCENE.renderOptions, ...overrides.renderOptions },
    seed: REFERENCE_SCENE.seed,
  });
}

function withDocument(offscreenFactory, fn) {
  const previous = globalThis.document;
  globalThis.document = {
    createElement: (tag) => {
      if (tag === "canvas") return offscreenFactory();
      return {};
    },
  };
  try {
    return fn();
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

function timed(fn) {
  const t0 = performance.now();
  const value = fn();
  return { ms: performance.now() - t0, value };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return {
    n: samples.length,
    min_ms: +sorted[0].toFixed(3),
    p50_ms: +percentile(sorted, 50).toFixed(3),
    p95_ms: +percentile(sorted, 95).toFixed(3),
    max_ms: +sorted[sorted.length - 1].toFixed(3),
    mean_ms: +mean.toFixed(3),
  };
}

function runRender({
  width,
  height,
  recipe,
  includeText,
  watermark,
  quality,
  premium,
  skyOverride,
  skipSkyCompute,
  textOnly,
}) {
  const counters = emptyCounters();
  const offscreenCounters = emptyCounters();
  const main = createInstrumentingCanvas("main", counters);
  const makeOffscreen = () => createInstrumentingCanvas("offscreen", offscreenCounters);

  return withDocument(makeOffscreen, () => {
    const wall = timed(() => {
      if (textOnly) {
        renderStarMapTextLayer({
          canvas: main,
          width,
          height,
          textBoxes: recipe.textBoxes,
          pixelRatio: 1,
          shape: recipe.shape,
          frameEnabled: recipe.renderOptions?.frameEnabled ?? true,
          watermark,
          shapeLayoutVersion: recipe.renderOptions?.shapeLayoutVersion,
        });
      } else {
        renderStarMap({
          recipe,
          canvas: main,
          width,
          height,
          watermark,
          quality,
          premium,
          pixelRatio: 1,
          skyOverride,
          skipSkyCompute,
          includeText,
        });
      }
    });
    return {
      ms: wall.ms,
      categories: summarizeCategories(counters),
      raw: counters,
      offscreen: summarizeCategories(offscreenCounters),
    };
  });
}

function commandStreamHash(width, height, recipe, sky) {
  const commands = [];
  let id = 0;
  function canvas(label) {
    const state = { globalAlpha: 1 };
    const stack = [];
    const result = captureCanvasDimensions({ width, height }, label, commands);
    const ctx = new Proxy(state, {
      get(target, key) {
        if (key === "canvas") return result;
        if (key in target) return target[key];
        if (key === "measureText") return (t) => ({ width: String(t).length * 10 });
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
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
  return createHash("sha256").update(JSON.stringify(commands)).digest("hex");
}

// ─── Run profile ───────────────────────────────────────────────────────────

const dateChangeInstants = buildProfileInstants(); // Fail before any timings.
const recipeFull = buildRecipe();
const recipeBase = buildRecipe({ textBoxes: [] });
const { width: previewW, height: previewH } = REFERENCE_SCENE.previewSize;
const hdW = REFERENCE_SCENE.hdWidth;
const hdH = hdW; // square

console.log("=== Editor render profile ===");
console.log("Reference scene:", REFERENCE_SCENE.id);
console.log("Date/location:", recipeFull.datetimeISO, recipeFull.location.name);

const coldSky = timed(() =>
  computeVisibleStars(
    {
      datetimeISO: recipeFull.datetimeISO,
      lat: recipeFull.location.latitude,
      lon: recipeFull.location.longitude,
      bortle: 4.5,
      showConstellations: true,
    },
    previewW,
    previewH,
  ),
);
const sky = coldSky.value;
console.log("Sky inventory:", {
  stars: sky.stars.length,
  planets: sky.planets.map((p) => p.name),
  moon: Boolean(sky.moon),
  constellations: sky.constellations.length,
  lines: sky.constellations.reduce((n, c) => n + c.lines.length, 0),
  computeVisibleStars_cold_ms: +coldSky.ms.toFixed(3),
});

const warmSkySamples = [];
for (let i = 0; i < 20; i++) {
  warmSkySamples.push(
    timed(() =>
      computeVisibleStars(
        {
          datetimeISO: recipeFull.datetimeISO,
          lat: recipeFull.location.latitude,
          lon: recipeFull.location.longitude,
          bortle: 4.5,
          showConstellations: true,
        },
        previewW,
        previewH,
      ),
    ).ms,
  );
}

// Clear skyCache by computing at unique sizes then restore — measure computeSky cold vs warm via recipe cache
const computeSkyCold = timed(() => computeSky(recipeFull, previewW, previewH));
const computeSkyWarmSamples = [];
for (let i = 0; i < 20; i++) {
  computeSkyWarmSamples.push(timed(() => computeSky(recipeFull, previewW, previewH)).ms);
}

const scenarios = [
  {
    name: "preview_full_single_canvas",
    desc: "Full preview-sized render including text (export quality) — single canvas like SimplifiedEditor first paint",
    width: previewW,
    height: previewH,
    recipe: recipeFull,
    includeText: true,
    watermark: true,
    quality: "export",
    premium: false,
    skyOverride: sky,
    skipSkyCompute: true,
    textOnly: false,
  },
  {
    name: "preview_base_sky_only",
    desc: "Editor base canvas: sky only (includeText:false) — PreviewCanvas base path",
    width: previewW,
    height: previewH,
    recipe: recipeBase,
    includeText: false,
    watermark: false,
    quality: "export",
    premium: false,
    skyOverride: sky,
    skipSkyCompute: true,
    textOnly: false,
  },
  {
    name: "preview_text_layer_only",
    desc: "Editor overlay canvas: text + watermark — PreviewCanvas text path",
    width: previewW,
    height: previewH,
    recipe: recipeFull,
    includeText: true,
    watermark: true,
    quality: "export",
    premium: false,
    skyOverride: null,
    skipSkyCompute: true,
    textOnly: true,
  },
  {
    name: "preview_export_1200",
    desc: "Paid-preview PNG export at 1200px",
    width: REFERENCE_SCENE.previewExportWidth,
    height: REFERENCE_SCENE.previewExportWidth,
    recipe: recipeFull,
    includeText: true,
    watermark: true,
    quality: "export",
    premium: false,
    skyOverride: null,
    skipSkyCompute: false,
    textOnly: false,
  },
  {
    name: "hd_export_6000",
    desc: "HD export at 6000px (paid path)",
    width: hdW,
    height: hdH,
    recipe: recipeFull,
    includeText: true,
    watermark: false,
    quality: "export",
    premium: true,
    skyOverride: null,
    skipSkyCompute: false,
    textOnly: false,
  },
];

const results = {};
for (const scenario of scenarios) {
  // Cold
  const cold = runRender(scenario);
  // Warm (identical inputs — sky cache / text metrics warm)
  const warmSamples = [];
  let lastWarm = cold;
  for (let i = 0; i < 12; i++) {
    lastWarm = runRender(scenario);
    warmSamples.push(lastWarm.ms);
  }
  results[scenario.name] = {
    desc: scenario.desc,
    size: { width: scenario.width, height: scenario.height },
    cold_ms: +cold.ms.toFixed(3),
    warm: stats(warmSamples),
    draw_categories: lastWarm.categories,
    offscreen_categories: lastWarm.offscreen,
  };
  console.log(`\n[${scenario.name}] cold=${cold.ms.toFixed(2)}ms warm_p50=${stats(warmSamples).p50_ms}ms drawCalls=${lastWarm.categories.drawCalls_total}`);
  console.log("  categories:", JSON.stringify(lastWarm.categories));
}

// Trigger-class re-render costs (editor dual-canvas model)
const triggerClasses = {};
{
  // Style colour change → full base sky redraw (skyOverride reused — astronomy not recomputed)
  const styleRecipe = buildRecipe({
    renderOptions: {
      ...REFERENCE_SCENE.renderOptions,
      constellationColor: "#ff5080",
    },
    textBoxes: [],
  });
  const samples = [];
  for (let i = 0; i < 12; i++) {
    samples.push(
      runRender({
        width: previewW,
        height: previewH,
        recipe: styleRecipe,
        includeText: false,
        watermark: false,
        quality: "export",
        premium: false,
        skyOverride: sky,
        skipSkyCompute: true,
        textOnly: false,
      }).ms,
    );
  }
  triggerClasses.style_or_colour_change_full_base = {
    effect: "full base-sky redraw; astronomy reused via skyOverride",
    ...stats(samples),
  };
}
{
  // Parent/external-recipe update: PreviewCanvas base effect + text overlay.
  // Measures production render work, excluding React scheduling/input latency.
  const samples = [];
  const baseSamples = [];
  const textSamples = [];
  let base;
  let text;
  for (let i = 0; i < 12; i++) {
    const boxes = REFERENCE_SCENE.textBoxes.map((b, idx) =>
      idx === 0 ? { ...b, text: `The Night We Became One${"!".repeat(i % 5)}` } : b,
    );
    const common = {
      width: previewW, height: previewH,
      recipe: buildRecipe({ textBoxes: boxes }),
      quality: "export", premium: false, skyOverride: sky, skipSkyCompute: true,
    };
    base = runRender({ ...common, includeText: false, watermark: false, textOnly: false });
    text = runRender({ ...common, includeText: true, watermark: true, textOnly: true });
    baseSamples.push(base.ms);
    textSamples.push(text.ms);
    samples.push(base.ms + text.ms);
  }
  triggerClasses.text_keystroke_base_plus_text = {
    effect: "production base-sky redraw + text overlay on parent/external-recipe update; worker sky reused; excludes React scheduling",
    ...stats(samples),
    base_ms: stats(baseSamples),
    text_overlay_ms: stats(textSamples),
    base_draw_categories: base.categories,
    text_draw_categories: text.categories,
  };
}
{
  // Text drag → text layer only (position change)
  const samples = [];
  for (let i = 0; i < 12; i++) {
    const boxes = REFERENCE_SCENE.textBoxes.map((b, idx) =>
      idx === 0 ? { ...b, position: { x: 0.5, y: 0.12 + i * 0.002 } } : b,
    );
    samples.push(
      runRender({
        width: previewW,
        height: previewH,
        recipe: buildRecipe({ textBoxes: boxes }),
        includeText: true,
        watermark: true,
        quality: "export",
        premium: false,
        skyOverride: null,
        skipSkyCompute: true,
        textOnly: true,
      }).ms,
    );
  }
  triggerClasses.text_drag_text_layer_only = {
    effect: "text-layer only",
    ...stats(samples),
  };
}
{
  // Date change → astronomy recompute + full base (cold astronomy each unique instant)
  const samples = [];
  for (const iso of dateChangeInstants) {
    const r = buildRecipeFromState({
      dateTime: iso,
      location: REFERENCE_SCENE.location,
      textBoxes: [],
      selectedStyle: REFERENCE_SCENE.selectedStyle,
      aspectRatio: REFERENCE_SCENE.aspectRatio,
      shape: REFERENCE_SCENE.shape,
      renderOptions: REFERENCE_SCENE.renderOptions,
      seed: REFERENCE_SCENE.seed,
    });
    const skyT = timed(() =>
      computeVisibleStars(
        {
          datetimeISO: iso,
          lat: r.location.latitude,
          lon: r.location.longitude,
          bortle: 4.5,
          showConstellations: true,
        },
        previewW,
        previewH,
      ),
    );
    const paint = runRender({
      width: previewW,
      height: previewH,
      recipe: r,
      includeText: false,
      watermark: false,
      quality: "export",
      premium: false,
      skyOverride: skyT.value,
      skipSkyCompute: true,
      textOnly: false,
    });
    samples.push({ astronomy_ms: skyT.ms, paint_ms: paint.ms, total_ms: skyT.ms + paint.ms });
  }
  triggerClasses.date_change_astronomy_plus_base = {
    effect: "cold astronomy per unique runtime-clock instant + base redraw with supplied sky; not location changes",
    instants: dateChangeInstants,
    astronomy_ms: stats(samples.map((s) => s.astronomy_ms)),
    paint_ms: stats(samples.map((s) => s.paint_ms)),
    total_ms: stats(samples.map((s) => s.total_ms)),
  };
}

// Identical recomputation across warm identical renders
const recompute = {
  computeVisibleStars_cold_ms: +coldSky.ms.toFixed(3),
  computeVisibleStars_warm_cached: stats(warmSkySamples),
  computeSky_cold_ms: +computeSkyCold.ms.toFixed(3),
  computeSky_warm_cached: stats(computeSkyWarmSamples),
  note:
    "Warm identical renders hit astronomyCache (LRU 50) and skyCache (LRU 10). Text metrics LRU 100. Preview path already skips astronomy when worker sky is ready.",
};

// Preview vs HD path split: this key was warmed by hd_export_6000 above.
const hdSkyWarm = timed(() =>
  computeVisibleStars(
    {
      datetimeISO: recipeFull.datetimeISO,
      lat: recipeFull.location.latitude,
      lon: recipeFull.location.longitude,
      bortle: 4.5,
      showConstellations: true,
    },
    hdW,
    hdH,
  ),
);

const equivalenceHash = commandStreamHash(previewW, previewH, recipeFull, sky);
const equivalenceHash2 = commandStreamHash(previewW, previewH, recipeFull, sky);

const report = {
  generatedAt: new Date().toISOString(),
  gitSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  baseHeadNote: "Harness source committed before run; results committed separately.",
  referenceScene: {
    ...REFERENCE_SCENE,
    measuredSkyAtPreview: {
      stars: sky.stars.length,
      planets: sky.planets.map((p) => p.name),
      moon: Boolean(sky.moon),
      constellations: sky.constellations.length,
      lines: sky.constellations.reduce((n, c) => n + c.lines.length, 0),
    },
  },
  pipelineFiles: [
    "src/lib/renderSky.ts — renderStarMap, renderStarMapTextLayer, computeSky, drawSky, drawStarLayer, drawConstellations, drawText",
    "src/components/PreviewCanvas.tsx — dual-canvas editor preview (base sky + text overlay)",
    "src/components/EditorExperience.tsx — handleExport / renderExportFile HD entry (6000px)",
    "src/components/SimplifiedEditor/SimplifiedEditor.tsx — exportImage parallel HD entry",
    "src/lib/astronomy.ts — computeVisibleStars",
    "src/hooks/useAstronomyWorker.ts + src/workers/astronomy.worker.ts — off-main-thread sky",
  ],
  scenarios: results,
  triggerClasses,
  recompute,
  previewVsHd: {
    sharedOrchestrator: "renderStarMap",
    previewEditor: "dual canvas: base includeText:false + text layer",
    hdExport: "single canvas 6000px quality:export",
    astronomyProjectionDependsOnCanvasSize: true,
    hd_astronomy_post_export_warm_ms: +hdSkyWarm.ms.toFixed(3),
    hd_stars: hdSkyWarm.value.stars.length,
    note: "Sky positions are projected into canvas pixel space, so preview and HD cannot share the same VisibleSky object. This late probe reuses the HD key warmed by export; it does not measure cold astronomy.",
  },
  commandStreamEquivalencePin: {
    algorithm: "sha256 of mocked Canvas command stream (same approach as milkyWay.test.mjs)",
    scene: REFERENCE_SCENE.id,
    size: { width: previewW, height: previewH },
    hash: equivalenceHash,
    repeatIdentical: equivalenceHash === equivalenceHash2,
  },
};

const outDir = process.env.PROFILE_OUTPUT_DIR || dirname(fileURLToPath(import.meta.url));
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "profile-results.json");
writeFileSync(outPath, JSON.stringify(report, null, 2));
const artifactDir = process.env.PROFILE_ARTIFACT_DIR;
try {
  if (artifactDir) mkdirSync(artifactDir, { recursive: true });
  if (artifactDir) writeFileSync(join(artifactDir, "editor-render-profile-results.json"), JSON.stringify(report, null, 2));
} catch {
  /* artifact dir may be unavailable outside the agent VM */
}

console.log("\n=== Trigger classes ===");
console.log(JSON.stringify(triggerClasses, null, 2));
console.log("\n=== Recompute ===");
console.log(JSON.stringify(recompute, null, 2));
console.log("\nWrote", outPath);
console.log("Equivalence pin hash:", equivalenceHash, "stable:", equivalenceHash === equivalenceHash2);
