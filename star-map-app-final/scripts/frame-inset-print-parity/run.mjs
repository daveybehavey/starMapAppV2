#!/usr/bin/env node
/**
 * #409 option (ii) print-parity harness.
 *
 * Option (i) (#426) scaled the rectangle frame inset
 * max(legacy, minDim x 16/1200) for NON-print renders only, leaving
 * print at the legacy inset — so the delivered print's frame sat
 * closer to the edge than the preview the customer approved. Option
 * (ii) (owner-delegated decision, adopted 2026-10-27) applies the
 * same scaled inset to print renders too: resolveFrameInsetPx is now
 * purpose-independent.
 *
 * This harness proves the change is exactly that and nothing else.
 * It renders the #426 print fixture matrix (download ladder, both
 * editor ladders incl. low-memory, card ladder, non-square, controls)
 * through the REAL renderStarMap in a real Chromium, once against the
 * baseline tree (option (i) main) and once against the candidate
 * tree, at BOTH purposes, and requires:
 *
 * - preview purpose: every fixture byte-identical (option (ii) does
 *   not touch the preview path at all);
 * - print purpose, frame-off and circle controls: byte-identical
 *   (the inset feeds only the rectangle stroke and the frame-aware
 *   text-fit bound; with no rectangle frame neither consumer fires);
 * - print purpose, framed fixtures: the full frame MUST differ (the
 *   change actually landed), while two region hashes must match —
 *   EXTERIOR (everything outside both the old and new frame bands:
 *   the print-safe margin and page background) and INTERIOR (inside
 *   the new frame band, excluding generous fixed text-row bands: the
 *   sky, stars, and artwork). Together they confine every differing
 *   pixel to the frame band itself or to text rows;
 * - text geometry: the fitted glyph rects renderStarMap records are
 *   compared per fixture. Fixtures whose text fits under both bounds
 *   must be exactly equal; the long-title fixtures may only shrink
 *   (fit scale <= 1), and a shrunk line must land within the new
 *   bound — that is the second, and only other, permitted difference
 *   class (text refit inside the tightened bound);
 * - no-text variants (includeText: false) of representative framed
 *   fixtures: exterior AND full interior hashes match, so with text
 *   removed the frame band is provably the only difference;
 * - candidate integration: the print frame's strokeRect arguments in
 *   local artwork coordinates equal the preview's
 *   ([80, 80, 5840, 5840] at 6000 square) and the helper/fit numbers
 *   agree across purposes (inset 80, fit bound 5780 at 6000) — the
 *   print now matches the preview the customer approved.
 *
 * Method mirrors scripts/frame-inset-print-invariance/run.mjs: the
 * runner writes a temporary harness page into each tree, runs that
 * tree's production build + `next start`, drives it with the
 * candidate tree's pinned Chromium, then removes the page. The page
 * is never committed. Region geometry is computed from fixed
 * arithmetic in the page (never from the tree's own helpers), so both
 * trees hash exactly the same pixel classes.
 *
 * Usage:
 *   node scripts/frame-inset-print-parity/run.mjs \
 *     --baseline /path/to/baseline/star-map-app-final \
 *     --candidate /path/to/candidate/star-map-app-final \
 *     [--out results.json]
 *
 * Exit code 0 = every assertion above holds. A JSON report with the
 * per-fixture classification is written to --out (default:
 * ./frame-inset-print-parity-results.json in cwd).
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const PAGE_SOURCE = String.raw`"use client";
/**
 * Temporary harness page for the #409 option (ii) print-parity run.
 * Written into the tree by scripts/frame-inset-print-parity/run.mjs
 * and removed when the run ends.
 */
import { useEffect } from "react";
import { buildRecipeFromState, renderStarMap } from "@/lib/renderSky";
import { getExportDimensions } from "@/lib/aspectRatio";
import { getCard4x6ExportDimensions } from "@/lib/printCardExport";
import { resolveFrameInsetPx, resolveShapeTextAvailableWidth } from "@/lib/textFit";

declare global {
  interface Window {
    __FRAME_PARITY_RESULTS__?: unknown;
    __FRAME_PARITY_DONE__?: boolean;
  }
}

const LOCATION = {
  name: "Victoria, British Columbia",
  latitude: 48.4284,
  longitude: -123.3656,
  timezone: "America/Vancouver",
};
const DATETIME = "2026-12-25T05:00:00.000Z";

function boxes(title, subtitle, dedication) {
  return [
    { id: "title", label: "Title", text: title, fontFamily: "cinzel", color: "#d7b56c", size: 48, align: "center", position: { x: 0.5, y: 0.1 } },
    { id: "subtitle", label: "Subtitle", text: subtitle, fontFamily: "raleway", color: "#c8a662", size: 26, align: "center", position: { x: 0.5, y: 0.165 } },
    { id: "dedication", label: "Dedication", text: dedication, fontFamily: "parisienne", color: "#b98a3d", size: 28, align: "center", position: { x: 0.5, y: 0.91 } },
  ];
}

function recipe(overrides) {
  const o = overrides || {};
  return buildRecipeFromState({
    dateTime: DATETIME,
    location: LOCATION,
    textBoxes: o.textBoxes || boxes("The Night We Met", "Victoria, BC - December 24, 2026", "Under this exact sky."),
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
    seed: "frame-inset-harness-v1",
  });
}

const SHORT = recipe({});
const LONG_TITLE = recipe({
  textBoxes: boxes(
    "The Extraordinarily Long-Named Gathering Beneath a Magnificent and Unforgettable Sky",
    "Somewhere With an Equally Long and Winding Place Name, December 24, 2026",
    "A dedication long enough to matter at the fit floor of the design.",
  ),
});
const FRAME_OFF = recipe({ renderOptions: { frameEnabled: false } });
const CIRCLE = recipe({ shape: "circle" });
const TRANSPARENT_MAT = recipe({ renderOptions: { transparentBackground: true } });
const PARCHMENT = recipe({ style: "parchmentScroll", renderOptions: { backgroundColor: "#f3e3d7" } });
const MINIMAL = recipe({ style: "midnightMinimal" });

// kind: which fixed text-band set the region classifier uses.
function dims(width, aspect) {
  return getExportDimensions(width, aspect || "square");
}
function fixture(id, r, width, aspect, kind) {
  const d = dims(width, aspect);
  return { id, recipe: r, width: d.width, height: d.height, kind: kind || "short" };
}
function cardFixture(id, baseWidth) {
  const d = getCard4x6ExportDimensions(baseWidth);
  return { id, recipe: SHORT, width: d.width, height: d.height, kind: "short" };
}

const FIXTURES = [];
for (const w of [6000, 5400, 5000, 4600, 4200]) FIXTURES.push(fixture("DL-" + w + "-SQ", SHORT, w));
for (const w of [4200, 3800, 3400, 3000, 2600]) FIXTURES.push(fixture("ED-FRAMED-" + w + "-SQ", SHORT, w));
for (const w of [3200, 2800, 2400, 2000, 1700]) FIXTURES.push(fixture("ED-FRAMED-LOMEM-" + w + "-SQ", SHORT, w));
for (const w of [5400, 5000, 4600, 4200, 3800, 3400]) FIXTURES.push(fixture("ED-UNFRAMED-" + w + "-SQ", SHORT, w));
for (const w of [3600, 3200, 2800, 2400, 2000, 1700]) FIXTURES.push(fixture("ED-UNFRAMED-LOMEM-" + w + "-SQ", SHORT, w));
FIXTURES.push(fixture("DL-6000-45", SHORT, 6000, "4:5"));
FIXTURES.push(fixture("DL-4200-45", SHORT, 4200, "4:5"));
FIXTURES.push(fixture("ED-FRAMED-4200-45", SHORT, 4200, "4:5"));
FIXTURES.push(fixture("ED-FRAMED-2600-45", SHORT, 2600, "4:5"));
FIXTURES.push(fixture("ED-UNFRAMED-5400-45", SHORT, 5400, "4:5"));
FIXTURES.push(fixture("ED-UNFRAMED-3400-45", SHORT, 3400, "4:5"));
for (const b of [2700, 2400, 2100, 1800, 1500]) FIXTURES.push(cardFixture("CARD-" + b, b));
FIXTURES.push(fixture("CTL-FRAMEOFF-4200", FRAME_OFF, 4200));
FIXTURES.push(fixture("CTL-CIRCLE-4200", CIRCLE, 4200));
FIXTURES.push(fixture("CTL-TRANSPARENT-4200", TRANSPARENT_MAT, 4200));
FIXTURES.push(fixture("CTL-PARCHMENT-4200", PARCHMENT, 4200));
FIXTURES.push(fixture("CTL-MINIMAL-4200", MINIMAL, 4200));
FIXTURES.push(fixture("CTL-LONGTITLE-6000", LONG_TITLE, 6000, "square", "long"));
FIXTURES.push(fixture("CTL-LONGTITLE-4200", LONG_TITLE, 4200, "square", "long"));
FIXTURES.push(fixture("CTL-LONGTITLE-2000", LONG_TITLE, 2000, "square", "long"));
FIXTURES.push(fixture("DL-6000-SQ-REPEAT", SHORT, 6000));

// No-text variants: includeText false, region-classified with no
// text bands, so the interior hash covers the whole artwork.
const NT_FIXTURES = [];
function ntFixture(id, r, width, aspect) {
  const d = dims(width, aspect);
  return { id, recipe: r, width: d.width, height: d.height, kind: "none" };
}
NT_FIXTURES.push(ntFixture("NT-6000-SQ", SHORT, 6000));
NT_FIXTURES.push(ntFixture("NT-4200-SQ", SHORT, 4200));
NT_FIXTURES.push(ntFixture("NT-6000-45", SHORT, 6000, "4:5"));
NT_FIXTURES.push({ id: "NT-CARD-2700", recipe: SHORT, kind: "none", ...(() => { const d = getCard4x6ExportDimensions(2700); return { width: d.width, height: d.height }; })() });
NT_FIXTURES.push(ntFixture("NT-PARCHMENT-4200", PARCHMENT, 4200));
NT_FIXTURES.push(ntFixture("NT-MINIMAL-4200", MINIMAL, 4200));

// Fixtures whose print render also gets region hashes + text bounds.
const REGION_IDS = new Set([
  "DL-6000-SQ", "DL-4200-SQ", "DL-6000-45",
  "ED-FRAMED-2600-SQ", "ED-UNFRAMED-5400-45",
  "CARD-2700", "CARD-1500",
  "CTL-PARCHMENT-4200", "CTL-MINIMAL-4200",
  "CTL-LONGTITLE-6000", "CTL-LONGTITLE-2000",
]);

async function sha256Hex(data) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// SHA-256 strip-tree over the decoded RGBA bytes (same scheme as the
// #426 invariance harness): byte equality <=> tree equality.
async function hashCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  const stripRows = 128;
  const stripHashes = [];
  for (let y = 0; y < canvas.height; y += stripRows) {
    const h = Math.min(stripRows, canvas.height - y);
    const img = ctx.getImageData(0, y, canvas.width, h);
    stripHashes.push(await sha256Hex(img.data.buffer));
  }
  return sha256Hex(new TextEncoder().encode(stripHashes.join(":")));
}

// Fixed region geometry (identical in both trees by construction —
// pure arithmetic, never the tree's own helpers). Local artwork
// coordinates: the print-safe transform maps local (x, y) to canvas
// (psi + x*sx, psi + y*sy). A pixel's class is decided by its centre's
// distance to the local canvas edge: EXTERIOR beyond the old frame
// band, INTERIOR inside the new frame band (and outside the fixed
// text-row bands), BAND anywhere in between (never hashed).
function regionGeometry(W, H, kind) {
  const minDim = Math.min(W, H);
  const legacy = Math.max(8, Math.min(16, Math.floor(minDim * 0.03)));
  const scaled = Math.max(legacy, minDim * (16 / 1200));
  const psi = Math.max(16, Math.floor(minDim * 0.04));
  const sx = (W - 2 * psi) / W;
  const sy = (H - 2 * psi) / H;
  const lw = 3 * (W / 1200);
  const M = 4;
  const dIn = scaled + lw / 2 + M;
  const dOut = legacy - lw / 2 - M;
  let bands = [];
  if (kind === "short") {
    const scale = W / 1200;
    bands = [
      [0.1 * H - 48 * scale * 0.9, 0.1 * H + 48 * scale * 0.9],
      [0.165 * H - 26 * scale * 0.9, 0.165 * H + 26 * scale * 0.9],
      [0.91 * H - 28 * scale * 0.9, 0.91 * H + 28 * scale * 0.9],
    ];
  } else if (kind === "long") {
    bands = [
      [0.02 * H, 0.27 * H],
      [0.8 * H, 0.99 * H],
    ];
  }
  return { psi, sx, sy, dIn, dOut, bands };
}

async function hashRegions(canvas, kind) {
  const W = canvas.width;
  const H = canvas.height;
  const g = regionGeometry(W, H, kind);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  // Integer pixel-cut for a canvas-coordinate threshold t: pixels
  // whose centre lies below t.
  const cut = (t) => Math.max(0, Math.min(W, Math.ceil(t - 0.5)));
  const stripRows = 128;
  const acc = {
    exterior: { strips: [], bytes: 0 },
    interior: { strips: [], bytes: 0 },
  };
  for (let y0 = 0; y0 < H; y0 += stripRows) {
    const h = Math.min(stripRows, H - y0);
    const img = ctx.getImageData(0, y0, W, h);
    const data = img.data;
    const chunks = { exterior: [], interior: [] };
    const counts = { exterior: 0, interior: 0 };
    const push = (cls, row, xStart, xEnd) => {
      if (xEnd <= xStart) return;
      const off = (row * W + xStart) * 4;
      chunks[cls].push(data.subarray(off, off + (xEnd - xStart) * 4));
      counts[cls] += (xEnd - xStart) * 4;
    };
    for (let r = 0; r < h; r++) {
      const cy = y0 + r + 0.5;
      const ly = (cy - g.psi) / g.sy;
      const rowD = Math.min(ly, H - ly);
      const inBand = g.bands.some(([b0, b1]) => ly >= b0 && ly <= b1);
      if (rowD < g.dOut) {
        push("exterior", r, 0, W);
        continue;
      }
      const xA = cut(g.psi + g.dOut * g.sx);
      const xB = cut(g.psi + g.dIn * g.sx);
      const xC = cut(g.psi + (W - g.dIn) * g.sx);
      const xD = cut(g.psi + (W - g.dOut) * g.sx);
      push("exterior", r, 0, xA);
      push("exterior", r, xD, W);
      if (rowD > g.dIn && !inBand) {
        push("interior", r, xB, xC);
      }
    }
    for (const cls of ["exterior", "interior"]) {
      const total = counts[cls];
      const buf = new Uint8Array(total);
      let off = 0;
      for (const c of chunks[cls]) {
        buf.set(c, off);
        off += c.byteLength;
      }
      acc[cls].strips.push(await sha256Hex(buf.buffer));
      acc[cls].bytes += total;
    }
  }
  const out = {};
  for (const cls of ["exterior", "interior"]) {
    out[cls] = await sha256Hex(
      new TextEncoder().encode(acc[cls].strips.join(":") + "|" + acc[cls].bytes),
    );
    out[cls + "Bytes"] = acc[cls].bytes;
  }
  return out;
}

function renderFixture(f, matPurpose, opts) {
  const o = opts || {};
  const canvas = document.createElement("canvas");
  renderStarMap({
    recipe: f.recipe,
    canvas,
    width: f.width,
    height: f.height,
    watermark: false,
    quality: "export",
    premium: true,
    pixelRatio: 1,
    matPurpose,
    includeText: o.includeText !== false,
    textBounds: o.bounds,
  });
  return canvas;
}

async function runAll() {
  const results = { fixtures: [], regions: {}, bounds: {}, integration: {}, numeric: {}, error: null };
  try {
    await document.fonts.ready;
    const families = ["48px Cinzel", "26px Raleway", "28px Parisienne", "40px Montserrat", "40px Lora", "40px Playfair Display", "40px Cormorant Garamond"];
    for (const f of families) {
      try {
        await document.fonts.load(f);
      } catch {
        /* identical fallback in both revisions is acceptable */
      }
    }
    await document.fonts.ready;

    results.numeric = {
      insetPreview6000: resolveFrameInsetPx(6000, 6000, "preview"),
      insetPrint6000: resolveFrameInsetPx(6000, 6000, "print"),
      insetOmitted6000: resolveFrameInsetPx(6000, 6000),
      fitPreview6000: resolveShapeTextAvailableWidth({ shape: "rectangle", frameEnabled: true, matPurpose: "preview", centerYNorm: 0.5, lineHeightPx: 40, width: 6000, height: 6000 }),
      fitPrint6000: resolveShapeTextAvailableWidth({ shape: "rectangle", frameEnabled: true, matPurpose: "print", centerYNorm: 0.5, lineHeightPx: 40, width: 6000, height: 6000 }),
    };

    const proto = CanvasRenderingContext2D.prototype;
    const original = proto.strokeRect;
    for (const purpose of ["preview", "print"]) {
      const calls = [];
      proto.strokeRect = function (...args) {
        calls.push(Array.from(args));
        return original.apply(this, args);
      };
      try {
        const canvas = renderFixture({ id: "INT", recipe: SHORT, width: 6000, height: 6000 }, purpose);
        results.integration[purpose] = calls;
        canvas.width = 0;
      } finally {
        proto.strokeRect = original;
      }
    }

    for (const f of FIXTURES) {
      const bounds = new Map();
      const printCanvas = renderFixture(f, "print", { bounds });
      const printSha = await hashCanvas(printCanvas);
      if (REGION_IDS.has(f.id)) {
        results.regions[f.id] = await hashRegions(printCanvas, f.kind);
      }
      printCanvas.width = 0;
      const b = {};
      for (const [k, v] of bounds) b[k] = v;
      results.bounds[f.id] = b;
      const previewCanvas = renderFixture(f, "preview");
      const previewSha = await hashCanvas(previewCanvas);
      previewCanvas.width = 0;
      results.fixtures.push({ id: f.id, width: f.width, height: f.height, printSha, previewSha });
    }

    for (const f of NT_FIXTURES) {
      const canvas = renderFixture(f, "print", { includeText: false });
      const printSha = await hashCanvas(canvas);
      results.regions[f.id] = await hashRegions(canvas, "none");
      canvas.width = 0;
      results.fixtures.push({ id: f.id, width: f.width, height: f.height, printSha, previewSha: null });
    }
  } catch (err) {
    results.error = String((err && err.stack) || err);
  }
  window.__FRAME_PARITY_RESULTS__ = results;
  window.__FRAME_PARITY_DONE__ = true;
}

export default function FrameParityHarnessPage() {
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

async function runTree({ label, appDir, port, chromium }) {
  const harnessDir = join(appDir, "src", "app", "frame-parity-harness");
  mkdirSync(harnessDir, { recursive: true });
  writeFileSync(join(harnessDir, "page.tsx"), PAGE_SOURCE);
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
  });
  try {
    const url = `http://127.0.0.1:${port}/frame-parity-harness`;
    await waitForServer(url);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
      await page.waitForFunction(() => window.__FRAME_PARITY_DONE__ === true, null, {
        timeout: 30 * 60 * 1000,
      });
      const results = await page.evaluate(() => window.__FRAME_PARITY_RESULTS__);
      return { label, results };
    } finally {
      await browser.close();
    }
  } finally {
    server.kill("SIGTERM");
    await wait(1500);
    try {
      server.kill("SIGKILL");
    } catch {
      /* already gone */
    }
    if (existsSync(harnessDir)) rmSync(harnessDir, { recursive: true, force: true });
    const distDir = join(appDir, ".next-harness");
    if (existsSync(distDir)) rmSync(distDir, { recursive: true, force: true });
  }
}

const IDENTICAL_PRINT = new Set(["CTL-FRAMEOFF-4200", "CTL-CIRCLE-4200"]);
const LONG_IDS = new Set(["CTL-LONGTITLE-6000", "CTL-LONGTITLE-4200", "CTL-LONGTITLE-2000"]);

function newFitBound(W, H) {
  const minDim = Math.min(W, H);
  const legacy = Math.max(8, Math.min(16, Math.floor(minDim * 0.03)));
  const scaled = Math.max(legacy, minDim * (16 / 1200));
  const padding = Math.max(2, Math.round(W * 0.005));
  return Math.max(1, W - 2 * (scaled + padding));
}

async function main() {
  const args = process.argv.slice(2);
  const get = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : null;
  };
  const baselineDir = get("--baseline");
  const candidateDir = get("--candidate");
  const outPath = resolve(get("--out") || "frame-inset-print-parity-results.json");
  if (!baselineDir || !candidateDir) {
    console.error("usage: run.mjs --baseline <appDir> --candidate <appDir> [--out results.json]");
    process.exit(2);
  }
  const require = createRequire(join(resolve(candidateDir), "package.json"));
  const { chromium } = require("@playwright/test");

  const baseline = await runTree({ label: "baseline", appDir: resolve(baselineDir), port: 3119, chromium });
  console.log(`baseline done: ${baseline.results.fixtures?.length ?? 0} fixtures, error=${baseline.results.error}`);
  const candidate = await runTree({ label: "candidate", appDir: resolve(candidateDir), port: 3120, chromium });
  console.log(`candidate done: ${candidate.results.fixtures?.length ?? 0} fixtures, error=${candidate.results.error}`);

  const failures = [];
  if (baseline.results.error) failures.push(`baseline error: ${baseline.results.error}`);
  if (candidate.results.error) failures.push(`candidate error: ${candidate.results.error}`);

  const byId = (list) => new Map((list || []).map((f) => [f.id, f]));
  const bMap = byId(baseline.results.fixtures);
  const cMap = byId(candidate.results.fixtures);
  for (const id of bMap.keys()) if (!cMap.has(id)) failures.push(`${id}: missing in candidate`);
  for (const id of cMap.keys()) if (!bMap.has(id)) failures.push(`${id}: missing in baseline`);

  const classification = {};
  for (const [id, b] of bMap) {
    const c = cMap.get(id);
    if (!c) continue;
    if (b.width !== c.width || b.height !== c.height) {
      failures.push(`${id}: dimensions differ baseline ${b.width}x${b.height} vs candidate ${c.width}x${c.height}`);
      continue;
    }
    // Preview purpose must be untouched by option (ii).
    if (b.previewSha !== null && b.previewSha !== c.previewSha) {
      failures.push(`${id}: PREVIEW render differs (option (ii) must not touch preview)`);
    }
    if (IDENTICAL_PRINT.has(id)) {
      if (b.printSha !== c.printSha) failures.push(`${id}: print control must be byte-identical but differs`);
      classification[id] = "identical (control)";
      continue;
    }
    if (b.printSha === c.printSha) {
      failures.push(`${id}: framed print render is byte-identical — the scaled inset did not land`);
      classification[id] = "identical (UNEXPECTED)";
      continue;
    }
    classification[id] = "frame band moved (text bounds compared separately)";
  }

  // Determinism self-check inside each tree (print purpose).
  for (const [label, res] of [
    ["baseline", baseline.results],
    ["candidate", candidate.results],
  ]) {
    const m = byId(res.fixtures);
    const a = m.get("DL-6000-SQ");
    const r = m.get("DL-6000-SQ-REPEAT");
    if (!a || !r || a.printSha !== r.printSha) {
      failures.push(`${label}: determinism self-check failed (DL-6000-SQ vs REPEAT)`);
    }
  }

  // Region confinement: exterior + interior hashes must match for
  // every region-classified fixture (text fixtures and no-text).
  const bReg = baseline.results.regions || {};
  const cReg = candidate.results.regions || {};
  for (const id of Object.keys(bReg)) {
    const br = bReg[id];
    const cr = cReg[id];
    if (!cr) {
      failures.push(`${id}: regions missing in candidate`);
      continue;
    }
    if (br.exterior !== cr.exterior) failures.push(`${id}: EXTERIOR region differs (outside both frame bands)`);
    if (br.interior !== cr.interior) failures.push(`${id}: INTERIOR region differs (inside new frame, outside text bands)`);
  }
  for (const id of Object.keys(cReg)) if (!bReg[id]) failures.push(`${id}: regions missing in baseline`);

  // Text geometry: exact for fitting text, shrink-only within the new
  // bound for the long-title fixtures.
  const bBounds = baseline.results.bounds || {};
  const cBounds = candidate.results.bounds || {};
  for (const id of Object.keys(bBounds)) {
    const bb = bBounds[id];
    const cb = cBounds[id];
    if (!cb) {
      failures.push(`${id}: text bounds missing in candidate`);
      continue;
    }
    const f = bMap.get(id);
    let refit = false;
    for (const boxId of Object.keys(bb)) {
      const x = bb[boxId];
      const y = cb[boxId];
      if (!y) {
        failures.push(`${id}/${boxId}: bounds missing in candidate`);
        continue;
      }
      const dw = Math.abs(y.width - x.width);
      const dh = Math.abs(y.height - x.height);
      const dx = Math.abs(y.x - x.x);
      const dy = Math.abs(y.y - x.y);
      if (dw < 0.01 && dh < 0.01 && dx < 0.01 && dy < 0.01) continue;
      refit = true;
      if (!LONG_IDS.has(id)) {
        failures.push(`${id}/${boxId}: text bounds changed outside the long-title fixtures (${JSON.stringify(x)} -> ${JSON.stringify(y)})`);
        continue;
      }
      if (y.width > x.width + 0.01 || y.height > x.height + 0.01) {
        failures.push(`${id}/${boxId}: refit GREW the text (${JSON.stringify(x)} -> ${JSON.stringify(y)})`);
      }
      const bound = newFitBound(f.width, f.height);
      if (y.width < x.width - 0.01 && y.width > bound + 1.5) {
        failures.push(`${id}/${boxId}: refit width ${y.width} exceeds the new fit bound ${bound}`);
      }
      // Centre must hold for centred text (x + width/2 invariant).
      if (Math.abs(y.x + y.width / 2 - (x.x + x.width / 2)) > 0.51) {
        failures.push(`${id}/${boxId}: refit moved the line centre (${x.x + x.width / 2} -> ${y.x + y.width / 2})`);
      }
    }
    if (refit && classification[id]) classification[id] = "frame band moved + text refit within new bound";
  }

  // Integration + numeric: baseline sanity (option (i) state), then
  // the candidate's parity assertions.
  const expectRectIn = (res, purpose, rect, label) => {
    const calls = (res.integration || {})[purpose] || [];
    const found = calls.some(
      (c) => c.length === 4 && c.every((v, i) => Math.abs(v - rect[i]) < 1e-9),
    );
    if (!found) failures.push(`${label} integration ${purpose}: expected strokeRect ${JSON.stringify(rect)} in ${JSON.stringify(calls)}`);
  };
  expectRectIn(baseline.results, "print", [16, 16, 5968, 5968], "baseline");
  expectRectIn(baseline.results, "preview", [80, 80, 5840, 5840], "baseline");
  expectRectIn(candidate.results, "print", [80, 80, 5840, 5840], "candidate");
  expectRectIn(candidate.results, "preview", [80, 80, 5840, 5840], "candidate");

  const expectNumeric = (res, key, value, label) => {
    const actual = (res.numeric || {})[key];
    if (actual !== value) failures.push(`${label} numeric ${key}: expected ${value}, got ${actual}`);
  };
  expectNumeric(baseline.results, "insetPrint6000", 16, "baseline");
  expectNumeric(baseline.results, "fitPrint6000", 5908, "baseline");
  expectNumeric(candidate.results, "insetPreview6000", 80, "candidate");
  expectNumeric(candidate.results, "insetPrint6000", 80, "candidate");
  expectNumeric(candidate.results, "insetOmitted6000", 80, "candidate");
  expectNumeric(candidate.results, "fitPreview6000", 5780, "candidate");
  expectNumeric(candidate.results, "fitPrint6000", 5780, "candidate");

  const report = {
    generatedAt: new Date().toISOString(),
    fixtureCount: bMap.size,
    failures,
    classification,
    baseline: baseline.results,
    candidate: candidate.results,
  };
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`report: ${outPath}`);
  console.log("REPORT_JSON_BEGIN");
  console.log(JSON.stringify(report));
  console.log("REPORT_JSON_END");
  if (failures.length) {
    console.error(`FAIL (${failures.length}):\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`PASS: ${bMap.size} fixtures — preview byte-identical; print differences confined to the frame band + bounded text refit.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
