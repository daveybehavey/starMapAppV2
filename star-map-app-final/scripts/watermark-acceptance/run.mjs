#!/usr/bin/env node
/**
 * #413 watermark acceptance harness (SQ-55 "Acceptance renders and
 * checks").
 *
 * Drives the REAL renderStarMap / renderStarMapTextLayer /
 * paintWatermark in a real Chromium against two trees:
 *
 *   --baseline   pre-change main (7decdb4d): renders every fixture
 *                with watermark:false and watermark:true and reports
 *                RGBA strip-tree hashes only.
 *   --candidate  this tree: same hashes plus the full SQ-55 checks.
 *
 * The paid-state fence proof is the cross-tree comparison: a candidate
 * render with watermark:false (what every paid/HD/print path produces)
 * must be BYTE-IDENTICAL to the baseline render of the same fixture —
 * code whose watermark stage cannot paint the new mark at all. The
 * baseline watermark:true hash must DIFFER from both (sanity that the
 * comparison can detect watermark paint).
 *
 * Candidate checks per SQ-55:
 *   - 80-composition matrix (5 shapes x 4 aspects x 4 styles),
 *     Santorini 2024-06-01 18:00 UTC, export quality, template-default
 *     text: placement exists; watermark-layer alpha lies wholly inside
 *     the renderer's own mask (recomputed from buildShapeClip) with
 *     0.02D clearance; wholly inside the central 50% region with
 *     clearance; all eight 25% crops retain 100% of the layer's
 *     nonzero alpha pixels.
 *   - Share-size subset (5 shapes, square, 1200px — the handleShareImage
 *     call shape): same containment/crop checks.
 *   - Composition order: a fixture whose customer text crosses the
 *     watermark position — the on/off diff is confined to the watermark
 *     layer's own pixels and is nonzero there (the mark paints ABOVE
 *     the text).
 *   - Editor composition: base (includeText:false, watermark:false) +
 *     text layer (watermark:true) stacked vs the single-canvas render —
 *     differences confined to text-layer-alpha pixels at ≤3 LSB (the
 *     overlay's premultiplied-alpha quantization; byte equality is not
 *     achievable across two-canvas compositing);
 *     entitlement re-sync: repainting the same text-layer canvas with
 *     watermark:false equals a fresh watermark:false layer exactly.
 *   - Resolution: normalized watermark bbox at pixelRatio 1 vs 2
 *     agrees within one output pixel.
 *   - Legibility fixtures exported as PNGs (360px wide, off|on side by
 *     side) to --legibility-dir for the two-reviewer transcription
 *     check recorded in the PR.
 *
 * Method mirrors scripts/frame-inset-print-invariance/run.mjs: a
 * temporary harness page is written into each tree, the tree's
 * production build runs (NEXT_DIST_DIR=.next-harness), `next start`
 * serves it, Playwright drives it, then the page and dist dir are
 * removed. The page is never committed.
 *
 * Usage:
 *   node scripts/watermark-acceptance/run.mjs \
 *     --baseline /path/to/baseline/star-map-app-final \
 *     --candidate /path/to/candidate/star-map-app-final \
 *     [--out results.json] [--legibility-dir dir]
 *
 * Exit 0 = every check passed. 1 = any failure.
 */
import { createRequire } from "node:module";import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const PAGE_SOURCE = String.raw`"use client";
/**
 * Temporary harness page for the #413 watermark acceptance run.
 * Written into the tree by scripts/watermark-acceptance/run.mjs and
 * removed when the run ends. MODE is substituted by the runner:
 * "baseline" trees only hash renders; "candidate" trees run the full
 * SQ-55 check suite.
 */
import { useEffect } from "react";
import {
  buildRecipeFromState,
  renderStarMap,
  renderStarMapTextLayer,
} from "@/lib/renderSky";
import * as renderSkyModule from "@/lib/renderSky";
import { getExportDimensions } from "@/lib/aspectRatio";

// buildShapeClip / paintWatermark are candidate-only exports (they do
// not exist in the baseline tree). They are read through the module
// namespace so the baseline bundle links cleanly; every call site is
// inside a candidate-only branch.
const buildShapeClip = renderSkyModule.buildShapeClip;
const paintWatermark = renderSkyModule.paintWatermark;

declare global {
  interface Window {
    __WM_RESULTS__?: unknown;
    __WM_DONE__?: boolean;
    __WM_LEGIBILITY__?: Record<string, string>;
  }
}

const MODE = "__MODE__";

// SQ-55 acceptance fixture: Santorini, 2024-06-01 18:00 UTC.
const LOCATION = { name: "Santorini, Greece", latitude: 36.4618, longitude: 25.3753, timezone: "Europe/Athens" };
const DATETIME = "2024-06-01T18:00:00.000Z";

function defaultBoxes() {
  return [
    { id: "title", label: "Title", text: "Our Night Sky", fontFamily: "cinzel", color: "#d7b56c", size: 48, align: "center", position: { x: 0.5, y: 0.12 } },
    { id: "subtitle", label: "Subtitle", text: "Under the vintage stars", fontFamily: "raleway", color: "#c8a662", size: 28, align: "center", position: { x: 0.5, y: 0.18 } },
    { id: "dedication", label: "Dedication", text: "Celebrating our constellation of moments.", fontFamily: "parisienne", color: "#b98a3d", size: 26, align: "center", position: { x: 0.5, y: 0.9 } },
  ];
}

function recipe(overrides) {
  const o = overrides || {};
  return buildRecipeFromState({
    dateTime: DATETIME,
    location: LOCATION,
    textBoxes: o.textBoxes || defaultBoxes(),
    selectedStyle: o.style || "navyGold",
    aspectRatio: o.aspectRatio || "square",
    shape: o.shape || "rectangle",
    renderOptions: Object.assign(
      {
        visualMode: "illustrated",
        starIntensity: "normal",
        starGlow: true,
        constellationLines: "thin",
        constellationLabels: false,
        showGrid: false,
        showPlanets: true,
        premiumStars: "subtle",
        premiumPlanets: "realistic",
        planetEmphasis: "highlighted",
        showMoon: true,
        moonSize: "large",
        frameEnabled: true,
        backgroundColor: "",
        shapeMask: o.shape || "rectangle",
      },
      o.renderOptions || {},
    ),
    seed: "watermark-acceptance-v1",
  });
}

function mkCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function renderFixture(r, w, h, watermark, extra) {
  const canvas = mkCanvas(w, h);
  renderStarMap(Object.assign({ recipe: r, canvas, width: w, height: h, watermark, quality: "export", premium: false, pixelRatio: 1 }, extra || {}));
  return canvas;
}

async function sha256Hex(data) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  const stripRows = 128;
  const stripHashes = [];
  for (let y = 0; y < canvas.height; y += stripRows) {
    const hh = Math.min(stripRows, canvas.height - y);
    const img = ctx.getImageData(0, y, canvas.width, hh);
    stripHashes.push(await sha256Hex(img.data.buffer));
  }
  return sha256Hex(new TextEncoder().encode(stripHashes.join(":")));
}

function imageData(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// Alpha scan of a canvas: nonzero-alpha pixel count + bbox.
function alphaScan(canvas) {
  const img = imageData(canvas);
  const d = img.data;
  let count = 0;
  let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (d[(y * canvas.width + x) * 4 + 3] > 0) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { count, bbox: count ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null, data: d };
}

// The watermark layer alone on a transparent canvas, painted through
// the production paintWatermark (same code path as the renders).
function layerCanvas(r, w, h) {
  const canvas = mkCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  const placement = paintWatermark(ctx, { width: w, height: h, clipPath: buildShapeClip(r.shape, w, h), maskKey: r.shape, pixelRatio: 1 });
  return { canvas, placement };
}

// The renderer's own mask, rasterized from the same clip path.
function maskCanvas(r, w, h) {
  const canvas = mkCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.fillStyle = "#ffffff";
  const path = buildShapeClip(r.shape, w, h);
  if (path) ctx.fill(path, "nonzero");
  return canvas;
}

function diffCount(a, b) {
  const da = imageData(a).data;
  const db = imageData(b).data;
  let n = 0;
  for (let i = 0; i < da.length; i += 4) {
    if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2] || da[i + 3] !== db[i + 3]) n++;
  }
  return n;
}

const SHAPES = ["rectangle", "circle", "heart", "star", "diamond"];
const STYLES = ["navyGold", "midnightMinimal", "vintageEngraving", "parchmentScroll"];
const ASPECTS = [
  ["square", "square", 600, null],
  ["4:5", "4:5", 600, null],
  ["2:3", "2:3", 600, null],
  ["3:2", "square", 900, 600], // renderer-only landscape proof: explicit dims
];

function fixtureDims(aspectEntry, widthOverride) {
  const width = widthOverride || aspectEntry[2];
  if (aspectEntry[3]) {
    const scale = width / aspectEntry[2];
    return { width, height: Math.round(aspectEntry[3] * scale) };
  }
  return getExportDimensions(width, aspectEntry[1]);
}

function checkFixtureLayer(r, w, h, id, checks) {
  const layer = layerCanvas(r, w, h);
  const mask = maskCanvas(r, w, h);
  const maskScan = alphaScan(mask);
  const layerScan = alphaScan(layer.canvas);
  const push = (name, pass, detail) => checks.push({ id: id + ":" + name, pass, detail });
  if (!layer.placement) {
    push("placement", false, "paintWatermark returned null");
    return;
  }
  push("placement", true, "fontSize=" + layer.placement.fontSize.toFixed(2) + " centre=" + layer.placement.centerX.toFixed(1) + "," + layer.placement.centerY.toFixed(1));
  if (!maskScan.bbox || !layerScan.bbox) {
    push("layer-nonempty", false, "empty mask or layer");
    return;
  }
  const D = Math.min(maskScan.bbox.width, maskScan.bbox.height);
  const clearance = 0.02 * D;
  // Containment + clearance against the renderer's own mask.
  const md = maskScan.data;
  const ld = layerScan.data;
  const maskAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : md[(y * w + x) * 4 + 3]);
  let outside = 0;
  let clearanceViolations = 0;
  const c = Math.max(1, Math.round(clearance));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (ld[(y * w + x) * 4 + 3] === 0) continue;
      if (maskAt(x, y) === 0) {
        outside++;
        continue;
      }
      const probes = [[c, 0], [-c, 0], [0, c], [0, -c], [c, c], [c, -c], [-c, c], [-c, -c]];
      for (const [dx, dy] of probes) {
        if (maskAt(x + dx, y + dy) === 0) {
          clearanceViolations++;
          break;
        }
      }
    }
  }
  push("containment", outside === 0, "outsidePixels=" + outside);
  push("clearance", clearanceViolations === 0, "violations=" + clearanceViolations + " clearancePx=" + clearance.toFixed(1));
  // Central region with clearance (1px raster tolerance).
  const b = layerScan.bbox;
  const inRegion =
    b.x >= 0.25 * w + clearance - 1 &&
    b.y >= 0.25 * h + clearance - 1 &&
    b.x + b.width <= 0.75 * w - clearance + 1 &&
    b.y + b.height <= 0.75 * h - clearance + 1;
  push("central-region", inRegion, "bbox=" + JSON.stringify(b));
  // All eight 25% crops retain 100% of the layer's nonzero alpha.
  const crops = [
    [0, 0, 0.75 * w, h], [0.25 * w, 0, w, h], [0, 0, w, 0.75 * h], [0, 0.25 * h, w, h],
    [0, 0, 0.75 * w, 0.75 * h], [0.25 * w, 0, w, 0.75 * h], [0, 0.25 * h, 0.75 * w, h], [0.25 * w, 0.25 * h, w, h],
  ];
  let cropFail = "";
  crops.forEach(([x0, y0, x1, y1], idx) => {
    let retained = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (ld[(y * w + x) * 4 + 3] > 0 && x >= x0 && x < x1 && y >= y0 && y < y1) retained++;
      }
    }
    if (retained !== layerScan.count) cropFail += " crop" + idx + "=" + retained + "/" + layerScan.count;
  });
  push("crops", cropFail === "", cropFail || "all 8 crops retain " + layerScan.count + " px");
}

async function runAll() {
  const results = { mode: MODE, hashes: {}, checks: [], error: null };
  const legibility = {};
  try {
    await document.fonts.ready;
    const families = ["48px Cinzel", "28px Raleway", "26px Parisienne", "40px Montserrat", "40px Lora", "40px Playfair Display", "40px Cormorant Garamond", "700 40px Cinzel"];
    for (const f of families) {
      try { await document.fonts.load(f); } catch { /* fallbacks identical across trees */ }
    }
    await document.fonts.ready;

    // Matrix + share-size subset hashes (both modes) and layer checks
    // (candidate only).
    for (const shape of SHAPES) {
      for (const aspect of ASPECTS) {
        for (const style of STYLES) {
          const dims = fixtureDims(aspect);
          const r = recipe({ shape, style, aspectRatio: aspect[1] });
          const id = shape + "-" + aspect[0] + "-" + style;
          const off = renderFixture(r, dims.width, dims.height, false);
          const on = renderFixture(r, dims.width, dims.height, true);
          results.hashes[id] = { off: await hashCanvas(off), on: await hashCanvas(on), width: dims.width, height: dims.height };
          if (MODE === "candidate") checkFixtureLayer(r, dims.width, dims.height, id, results.checks);
        }
      }
      // Share-size (1200px, handleShareImage call shape), navyGold.
      const dims = fixtureDims(ASPECTS[0], 1200);
      const r = recipe({ shape, style: "navyGold", aspectRatio: "square" });
      const id = shape + "-share1200";
      const off = renderFixture(r, dims.width, dims.height, false);
      const on = renderFixture(r, dims.width, dims.height, true);
      results.hashes[id] = { off: await hashCanvas(off), on: await hashCanvas(on), width: dims.width, height: dims.height };
      if (MODE === "candidate") checkFixtureLayer(r, dims.width, dims.height, id, results.checks);
    }

    if (MODE === "candidate") {
      const checks = results.checks;
      const push = (id, pass, detail) => checks.push({ id, pass, detail });

      // Composition order: customer text crossing the watermark.
      {
        const boxes = defaultBoxes().concat([
          { id: "crossing", label: "Crossing", text: "Written in the Stars", fontFamily: "cinzel", color: "#d7b56c", size: 40, align: "center", position: { x: 0.5, y: 0.5 } },
        ]);
        const r = recipe({ shape: "heart", style: "navyGold", textBoxes: boxes });
        const w = 600, h = 600;
        const on = renderFixture(r, w, h, true);
        const off = renderFixture(r, w, h, false);
        const layer = layerCanvas(r, w, h);
        const ld = alphaScan(layer.canvas).data;
        const da = imageData(on).data;
        const db = imageData(off).data;
        let diffOutside = 0;
        let diffInside = 0;
        for (let i = 0; i < da.length; i += 4) {
          const differs = da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2] || da[i + 3] !== db[i + 3];
          if (!differs) continue;
          if (ld[i + 3] > 0) diffInside++;
          else diffOutside++;
        }
        push("crossing:diff-confined-to-layer", diffOutside === 0, "outside=" + diffOutside);
        push("crossing:mark-visible-above-text", diffInside > 0, "inside=" + diffInside);
      }

      // Editor composition + entitlement re-sync.
      {
        const r = recipe({ shape: "heart", style: "navyGold" });
        const w = 600, h = 600;
        const base = renderFixture(r, w, h, false, { includeText: false });
        const layerOn = mkCanvas(w, h);
        renderStarMapTextLayer({ canvas: layerOn, width: w, height: h, textBoxes: r.textBoxes, pixelRatio: 1, shape: "heart", frameEnabled: true, watermark: true });
        const stacked = mkCanvas(w, h);
        const sctx = stacked.getContext("2d");
        if (!sctx) throw new Error("no 2d context");
        sctx.drawImage(base, 0, 0);
        sctx.drawImage(layerOn, 0, 0);
        const single = renderFixture(r, w, h, true);
        // Byte equality is not achievable between the two compositions:
        // the overlay path quantizes the text layer's premultiplied
        // alpha to 8 bits before blending, the single render blends in
        // one step. The faithful assertions are confinement + size:
        // every differing pixel must sit under text-layer alpha (text
        // or watermark paint) and differ by at most a few LSB (the
        // double-rounding), never by a geometry/order error.
        const sd = imageData(stacked).data;
        const gd = imageData(single).data;
        const ld2 = imageData(layerOn).data;
        let stackOutside = 0;
        let stackMaxDelta = 0;
        let stackDiff = 0;
        for (let i = 0; i < sd.length; i += 4) {
          let delta = 0;
          for (let ch = 0; ch < 4; ch++) delta = Math.max(delta, Math.abs(sd[i + ch] - gd[i + ch]));
          if (delta > 0) {
            stackDiff++;
            if (delta > stackMaxDelta) stackMaxDelta = delta;
            if (ld2[i + 3] === 0) stackOutside++;
          }
        }
        push("editor:stack-matches-single", stackOutside === 0 && stackMaxDelta <= 3 && stackDiff > 0, "diffPx=" + stackDiff + " outsideLayer=" + stackOutside + " maxDelta=" + stackMaxDelta);
        // Re-sync: repaint the SAME canvas unpaid -> paid, compare to a
        // fresh paid layer; then back to unpaid and compare to fresh.
        const freshOff = mkCanvas(w, h);
        renderStarMapTextLayer({ canvas: freshOff, width: w, height: h, textBoxes: r.textBoxes, pixelRatio: 1, shape: "heart", frameEnabled: true, watermark: false });
        renderStarMapTextLayer({ canvas: layerOn, width: w, height: h, textBoxes: r.textBoxes, pixelRatio: 1, shape: "heart", frameEnabled: true, watermark: false });
        push("editor:resync-to-paid-clean", (await hashCanvas(layerOn)) === (await hashCanvas(freshOff)), "repaint after paid resolves == fresh watermark-free layer");
        const freshOn = mkCanvas(w, h);
        renderStarMapTextLayer({ canvas: freshOn, width: w, height: h, textBoxes: r.textBoxes, pixelRatio: 1, shape: "heart", frameEnabled: true, watermark: true });
        renderStarMapTextLayer({ canvas: layerOn, width: w, height: h, textBoxes: r.textBoxes, pixelRatio: 1, shape: "heart", frameEnabled: true, watermark: true });
        push("editor:resync-to-unpaid-clean", (await hashCanvas(layerOn)) === (await hashCanvas(freshOn)), "repaint after unpaid resolves == fresh watermarked layer");
        push("editor:paid-layer-differs", (await hashCanvas(freshOn)) !== (await hashCanvas(freshOff)), "watermark flag changes the layer");
      }

      // Resolution agreement: pixelRatio 1 vs 2 at the same logical
      // size — normalized layer bbox within one output pixel.
      {
        const r = recipe({ shape: "heart", style: "navyGold" });
        const w = 600, h = 600;
        const l1 = layerCanvas(r, w, h);
        const big = mkCanvas(w * 2, h * 2);
        const bctx = big.getContext("2d");
        if (!bctx) throw new Error("no 2d context");
        bctx.scale(2, 2);
        paintWatermark(bctx, { width: w, height: h, clipPath: buildShapeClip("heart", w, h), maskKey: "heart", pixelRatio: 2 });
        const s1 = alphaScan(l1.canvas).bbox;
        const s2raw = alphaScan(big).bbox;
        const s2 = s2raw ? { x: s2raw.x / 2, y: s2raw.y / 2, width: s2raw.width / 2, height: s2raw.height / 2 } : null;
        // Per-edge agreement within one output pixel (position AND
        // size): comparing width/height alone would double-count two
        // edges' antialiasing fringe; each edge is the measurable.
        const edges = (bb) => (bb ? [bb.x, bb.y, bb.x + bb.width, bb.y + bb.height] : null);
        const e1 = edges(s1);
        const e2 = edges(s2);
        const agree = !!e1 && !!e2 && e1.every((v, i) => Math.abs(v - e2[i]) <= 1);
        push("resolution:pr1-vs-pr2-bbox", agree, JSON.stringify({ s1, s2 }));
      }

      // Legibility fixtures: 360px wide, off | on side by side.
      for (const style of STYLES) {
        for (const shape of ["rectangle", "heart"]) {
          const r = recipe({ shape, style });
          const w = 360, h = 360;
          const off = renderFixture(r, w, h, false);
          const on = renderFixture(r, w, h, true);
          const pair = mkCanvas(w * 2, h);
          const pctx = pair.getContext("2d");
          if (!pctx) throw new Error("no 2d context");
          pctx.fillStyle = "#ffffff";
          pctx.fillRect(0, 0, w * 2, h);
          pctx.drawImage(off, 0, 0);
          pctx.drawImage(on, w, 0);
          legibility[style + "-" + shape + "-360"] = pair.toDataURL("image/png");
        }
      }
      {
        const boxes = defaultBoxes().concat([
          { id: "crossing", label: "Crossing", text: "Written in the Stars", fontFamily: "cinzel", color: "#d7b56c", size: 40, align: "center", position: { x: 0.5, y: 0.5 } },
        ]);
        const r = recipe({ shape: "heart", style: "navyGold", textBoxes: boxes });
        const w = 360, h = 360;
        const off = renderFixture(r, w, h, false);
        const on = renderFixture(r, w, h, true);
        const pair = mkCanvas(w * 2, h);
        const pctx = pair.getContext("2d");
        if (!pctx) throw new Error("no 2d context");
        pctx.fillStyle = "#ffffff";
        pctx.fillRect(0, 0, w * 2, h);
        pctx.drawImage(off, 0, 0);
        pctx.drawImage(on, w, 0);
        legibility["crossing-heart-360"] = pair.toDataURL("image/png");
      }
    }
  } catch (err) {
    results.error = String((err && err.stack) || err);
  }
  window.__WM_LEGIBILITY__ = legibility;
  window.__WM_RESULTS__ = results;
  window.__WM_DONE__ = true;
}

export default function WatermarkHarnessPage() {
  useEffect(() => {
    void runAll();
  }, []);
  return null;
}
`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url, attempts = 240) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await wait(1000);
  }
  throw new Error(`server did not come up: ${url}`);
}

async function runTree({ label, appDir, port, chromium, mode, legibilityDir }) {
  const harnessDir = join(appDir, "src", "app", "watermark-harness");
  mkdirSync(harnessDir, { recursive: true });
  writeFileSync(join(harnessDir, "page.tsx"), PAGE_SOURCE.replace("__MODE__", mode));
  const serverEnv = {
    ...process.env,
    STRIPE_SECRET_KEY: "sk_test_playwright_dummy",
    STRIPE_WEBHOOK_SECRET: "whsec_playwright_dummy",
    NEXT_PUBLIC_DISABLE_PROMO_POPUP: "true",
    STARMAP_ENTITLEMENT_AUTHORITY_LOCAL: "1",
    NEXT_DIST_DIR: ".next-harness",
  };
  await new Promise((resolveBuild, rejectBuild) => {
    const build = spawn("npm", ["run", "build"], {
      cwd: appDir,
      stdio: "inherit",
      env: serverEnv,
    });
    build.on("error", rejectBuild);
    build.on("exit", (code) =>
      code === 0 ? resolveBuild() : rejectBuild(new Error(`${label}: production build exited ${code}`)),
    );
  });
  const server = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: appDir,
    stdio: "inherit",
    env: serverEnv,
    // Own process group: `next start` spawns a next-server child that
    // survives killing the npx wrapper (and would hold the caller's
    // stdout pipe open forever). Kill the group instead.
    detached: true,
  });
  try {
    const url = `http://127.0.0.1:${port}/watermark-harness`;
    await waitForServer(url);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
      await page.waitForFunction(() => window.__WM_DONE__ === true, null, {
        timeout: 20 * 60 * 1000,
      });
      const results = await page.evaluate(() => window.__WM_RESULTS__);
      if (mode === "candidate" && legibilityDir) {
        const legibility = await page.evaluate(() => window.__WM_LEGIBILITY__);
        mkdirSync(legibilityDir, { recursive: true });
        for (const [name, dataUrl] of Object.entries(legibility || {})) {
          const base64 = String(dataUrl).split(",")[1];
          writeFileSync(join(legibilityDir, name + ".png"), Buffer.from(base64, "base64"));
        }
      }
      return { label, results };
    } finally {
      await browser.close();
    }
  } finally {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      server.kill("SIGTERM");
    }
    await wait(1500);
    try {
      process.kill(-server.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
    if (existsSync(harnessDir)) rmSync(harnessDir, { recursive: true, force: true });
    const distDir = join(appDir, ".next-harness");
    if (existsSync(distDir)) rmSync(distDir, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const get = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : null;
  };
  const baselineDir = get("--baseline");
  const candidateDir = get("--candidate");
  const outPath = resolve(get("--out") || "watermark-acceptance-results.json");
  const legibilityDir = get("--legibility-dir") ? resolve(get("--legibility-dir")) : null;
  if (!baselineDir || !candidateDir) {
    console.error("usage: run.mjs --baseline <appDir> --candidate <appDir> [--out results.json] [--legibility-dir dir]");
    process.exit(2);
  }
  const require = createRequire(join(resolve(candidateDir), "package.json"));
  const { chromium } = require("@playwright/test");

  const baseline = await runTree({ label: "baseline", appDir: resolve(baselineDir), port: 3112, chromium, mode: "baseline" });
  console.log(`baseline done: ${Object.keys(baseline.results.hashes || {}).length} fixtures, error=${baseline.results.error}`);
  const candidate = await runTree({ label: "candidate", appDir: resolve(candidateDir), port: 3113, chromium, mode: "candidate", legibilityDir });
  console.log(`candidate done: ${Object.keys(candidate.results.hashes || {}).length} fixtures, ${(candidate.results.checks || []).length} checks, error=${candidate.results.error}`);

  const failures = [];
  if (baseline.results.error) failures.push(`baseline error: ${baseline.results.error}`);
  if (candidate.results.error) failures.push(`candidate error: ${candidate.results.error}`);

  const bHashes = baseline.results.hashes || {};
  const cHashes = candidate.results.hashes || {};
  for (const [id, b] of Object.entries(bHashes)) {
    const c = cHashes[id];
    if (!c) {
      failures.push(`${id}: missing in candidate`);
      continue;
    }
    if (b.width !== c.width || b.height !== c.height) {
      failures.push(`${id}: dimensions differ baseline ${b.width}x${b.height} vs candidate ${c.width}x${c.height}`);
      continue;
    }
    // PAID FENCE: candidate watermark:false must equal baseline
    // watermark:false byte-for-byte (pre-change code cannot paint the
    // new mark at all).
    if (c.off !== b.off) failures.push(`${id}: PAID ZERO-DIFF FAILED — candidate watermark:false render differs from baseline`);
    // The mark must actually paint when unpaid.
    if (c.on === c.off) failures.push(`${id}: candidate watermark:true render is identical to watermark:false — mark did not paint`);
    // Sanity: the comparison can detect watermark paint (the baseline's
    // own corner mark changes its render).
    if (b.on === b.off) failures.push(`${id}: baseline watermark:true equals watermark:false — comparison is insensitive`);
  }
  for (const id of Object.keys(cHashes)) {
    if (!bHashes[id]) failures.push(`${id}: missing in baseline`);
  }
  for (const check of candidate.results.checks || []) {
    if (!check.pass) failures.push(`check ${check.id}: ${check.detail}`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    fixtureCount: Object.keys(bHashes).length,
    candidateCheckCount: (candidate.results.checks || []).length,
    failures,
    baseline: baseline.results,
    candidate: candidate.results,
  };
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`report: ${outPath}`);
  if (failures.length) {
    console.error(`FAIL (${failures.length}):\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  console.log(
    `PASS: ${report.fixtureCount} fixtures — paid renders byte-identical to pre-change code; ` +
      `${report.candidateCheckCount} candidate checks green.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
