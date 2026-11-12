import { buildRecipeFromState, renderStarMap } from "../../src/lib/renderSky.ts";
import { REFERENCE_SCENE } from "./referenceScene.mjs";
import { measureBrowserRender } from "./measureBrowserRender.mjs";

export { REFERENCE_SCENE };

export function runProfile(scene = REFERENCE_SCENE) {
  const recipe = buildRecipeFromState(scene);
  const timings = {};
  for (const [name, size, premium] of [
    ["preview_900", scene.previewSize.width, false],
    ["preview_export_1200", scene.previewExportWidth, false],
    ["hd_6000", scene.hdWidth, true],
  ]) {
    const canvas = document.createElement("canvas");
    let counts;
    const originals = new Map();
    // Count real calls on main AND offscreen contexts, without replacing drawing.
    const proto = CanvasRenderingContext2D.prototype;
    for (const method of ["arc", "fill", "stroke", "fillText", "fillRect", "clearRect", "drawImage", "createRadialGradient"]) {
      const original = proto[method];
      originals.set(method, original);
      proto[method] = function (...args) {
        counts[method] = (counts[method] || 0) + 1;
        return original.apply(this, args);
      };
    }
    try {
      const samples = [];
      for (let i = 0; i < 9; i++) {
        counts = {};
        const measurement = measureBrowserRender(canvas, () => renderStarMap({
          recipe, canvas, width: size, height: size, pixelRatio: 1,
          quality: "export", premium, watermark: !premium, includeText: true,
        }));
        samples.push({ ...measurement, drawCalls: { ...counts } });
      }
      timings[name] = { size, first: samples[0], warm: samples.slice(1) };
    } finally {
      for (const [method, original] of originals) proto[method] = original;
    }
  }
  return {
    referenceSceneId: scene.id,
    renderer: "src/lib/renderSky.ts:renderStarMap",
    metric: "render_plus_full_readback_ms",
    note: "Production renderer and astronomy. Wall time includes JS, raster completion and full RGBA readback, plus draw-call instrumentation; not isolated GPU/Skia cost or UI latency. First means first per size in this process. Browser fallback fonts are used.",
    timings,
  };
}
