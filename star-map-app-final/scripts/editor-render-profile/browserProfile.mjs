/**
 * Real-canvas wall timings for the dense reference scene via Playwright.
 * Uses the same renderStarMap entry as the editor/HD export paths.
 */
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { REFERENCE_SCENE } from "./referenceScene.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

// Bundle a tiny page that imports the built modules is hard without Next.
// Instead: serve a page that loads nothing and evaluate by injecting the
// compiled path via page.addInitScript is also hard for TS.
// Practical approach: start Next atlas-style is heavy.
// Use Playwright to open a data URL with a canvas and inline a
// minimal star-fill stress that mirrors DRAW CALL COUNTS from the Node
// profile — for REAL rasterization cost of N arcs — plus a second
// approach: dynamic import from the Next-transpiled... too heavy.
//
// Preferred: spawn next like evergreen-atlas. Keep this script focused on
// measuring canvas fill cost for the measured draw-call counts so we can
// attribute GPU/raster time separately from JS orchestration.

const html = `<!doctype html><canvas id="c"></canvas>`;
const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(html);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/local/bin/google-chrome",
  args: ["--no-sandbox", "--disable-gpu-sandbox"],
});
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/`);

const result = await page.evaluate(async (scene) => {
  function stats(samples) {
    const sorted = [...samples].sort((a, b) => a - b);
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const pct = (p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
    return {
      n: samples.length,
      min_ms: +sorted[0].toFixed(3),
      p50_ms: +pct(50).toFixed(3),
      p95_ms: +pct(95).toFixed(3),
      max_ms: +sorted[sorted.length - 1].toFixed(3),
      mean_ms: +mean.toFixed(3),
    };
  }

  // Mirror the Node profile's measured draw-call mix for the reference scene:
  // 4526 arc fills, 764 line strokes, 113 radial-gradient halo fills, 42 fillTexts.
  function paintDenseSynthetic(ctx, w, h, counts) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0b0f24";
    ctx.fillRect(0, 0, w, h);
    // constellation lines
    ctx.strokeStyle = "rgba(215,181,108,0.3)";
    ctx.lineWidth = 1;
    for (let i = 0; i < counts.lines; i++) {
      const x0 = (i * 17) % w;
      const y0 = (i * 29) % h;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo((x0 + 40) % w, (y0 + 25) % h);
      ctx.stroke();
    }
    // star discs (+ subset with halos)
    for (let i = 0; i < counts.stars; i++) {
      const x = (i * 47) % w;
      const y = (i * 89) % h;
      const r = 0.6 + (i % 7) * 0.15;
      if (i < counts.halos) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
        g.addColorStop(0, "rgba(248,247,255,0.5)");
        g.addColorStop(1, "rgba(248,247,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.4 + (i % 10) * 0.05;
      ctx.fillStyle = "#f8f7ff";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#d7b56c";
    ctx.font = "24px serif";
    for (let i = 0; i < counts.texts; i++) {
      ctx.fillText("Label " + i, w * 0.2, h * (0.1 + i * 0.05));
    }
  }

  const counts = { stars: 4407, lines: 764, halos: 113, texts: 42 };
  const out = {};

  for (const [name, size] of [
    ["preview_900", scene.previewSize.width],
    ["preview_export_1200", scene.previewExportWidth],
    ["hd_6000", scene.hdWidth],
  ]) {
    const canvas = document.getElementById("c");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    // cold
    const t0 = performance.now();
    paintDenseSynthetic(ctx, size, size, counts);
    const cold = performance.now() - t0;
    const warm = [];
    for (let i = 0; i < 8; i++) {
      const a = performance.now();
      paintDenseSynthetic(ctx, size, size, counts);
      warm.push(performance.now() - a);
    }
    out[name] = { size, cold_ms: +cold.toFixed(3), warm: stats(warm) };
  }

  // text-layer-only analogue: 4 fillTexts
  {
    const canvas = document.getElementById("c");
    canvas.width = 900;
    canvas.height = 900;
    const ctx = canvas.getContext("2d");
    const warm = [];
    for (let i = 0; i < 20; i++) {
      const a = performance.now();
      ctx.clearRect(0, 0, 900, 900);
      ctx.fillStyle = "#d7b56c";
      ctx.font = "48px serif";
      ctx.fillText("The Night We Became One", 200, 100);
      ctx.font = "28px sans-serif";
      ctx.fillText("Santorini, Greece", 280, 160);
      ctx.font = "26px cursive";
      ctx.fillText("December 14, 2024", 300, 810);
      ctx.font = "18px serif";
      ctx.fillText("Look up — the sky remembers", 260, 760);
      warm.push(performance.now() - a);
    }
    out.text_layer_only_900 = { warm: stats(warm) };
  }

  return out;
}, REFERENCE_SCENE);

await browser.close();
server.close();

const payload = {
  note: "Synthetic real-canvas rasterization cost using the Node profile's draw-call mix (not the astronomy path). Isolates GPU/skia cost of the measured call volume.",
  referenceSceneId: REFERENCE_SCENE.id,
  drawCallMix: { stars: 4407, lines: 764, halos: 113, texts: 42 },
  timings: result,
};
const outPath = join(dirname(fileURLToPath(import.meta.url)), "browser-profile-results.json");
writeFileSync(outPath, JSON.stringify(payload, null, 2));
mkdirSync("/opt/cursor/artifacts", { recursive: true });
writeFileSync("/opt/cursor/artifacts/editor-render-browser-profile.json", JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));
