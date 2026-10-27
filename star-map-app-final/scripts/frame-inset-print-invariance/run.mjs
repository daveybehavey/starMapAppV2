#!/usr/bin/env node
/**
 * #409 print-invariance harness (SQ-67 section 5, "Print invariance:
 * actual pixel proof").
 *
 * Renders the full print fixture matrix — every width in the download
 * print ladder, both editor print ladders (framed / unframed, incl.
 * low-memory variants), the card ladder via getCard4x6ExportDimensions,
 * non-square outputs, and controls — through the REAL renderStarMap at
 * matPurpose "print" in a real Chromium, once against the baseline tree
 * (pre-change main) and once against the candidate tree, and requires
 * the decoded canvas RGBA bytes to be identical for every fixture
 * (compared as a SHA-256 strip-tree over the raw bytes; see page code).
 *
 * Method: the runner writes a temporary harness page
 * (src/app/frame-inset-harness/page.tsx) into each tree, runs that
 * tree's production build and `next start`, drives it with the
 * candidate tree's @playwright/test Chromium (same pinned browser for
 * both revisions), collects per-fixture {dimensions, sha256}, then
 * removes the page and stops the server. The page is never committed.
 *
 * Baseline compatibility: the page calls the purpose-aware helper
 * signatures (e.g. resolveFrameInsetPx(w, h, "preview")) even in the
 * baseline tree, whose helpers predate them. That build still succeeds
 * because the app's next.config sets typescript.ignoreBuildErrors, and
 * at runtime the extra argument is ignored — the baseline helpers
 * exhibit exactly the legacy behaviour being measured. The numeric
 * and integration assertions are evaluated against the CANDIDATE
 * results only.
 *
 * Usage:
 *   node scripts/frame-inset-print-invariance/run.mjs \
 *     --baseline /path/to/baseline/star-map-app-final \
 *     --candidate /path/to/candidate/star-map-app-final \
 *     [--out results.json] [--keep-servers]
 *
 * Exit code 0 = every print fixture byte-identical AND the candidate's
 * integration assertions (frame strokeRect geometry + helper numbers)
 * hold. 1 = any mismatch/failure. A JSON report is written to --out
 * (default: ./frame-inset-print-invariance-results.json in cwd).
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const PAGE_SOURCE = String.raw`"use client";
/**
 * Temporary harness page for the #409 print-invariance run.
 * Written into the tree by scripts/frame-inset-print-invariance/run.mjs
 * and removed when the run ends. Renders the print fixture matrix with
 * the app's real renderStarMap at matPurpose "print" and reports a
 * SHA-256 strip-tree hash of the decoded RGBA bytes per fixture, plus
 * strokeRect integration records for the preview/print frame geometry.
 */
import { useEffect } from "react";
import { buildRecipeFromState, renderStarMap } from "@/lib/renderSky";
import { getExportDimensions } from "@/lib/aspectRatio";
import { getCard4x6ExportDimensions } from "@/lib/printCardExport";
import { resolveFrameInsetPx, resolveShapeTextAvailableWidth } from "@/lib/textFit";

declare global {
  interface Window {
    __FRAME_HARNESS_RESULTS__?: unknown;
    __FRAME_HARNESS_DONE__?: boolean;
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

// [id, recipe, width, height] — heights derived from the same helpers
// the shipping paths use.
function dims(width, aspect) {
  return getExportDimensions(width, aspect || "square");
}
function fixture(id, r, width, aspect) {
  const d = dims(width, aspect);
  return { id, recipe: r, width: d.width, height: d.height };
}
function cardFixture(id, baseWidth) {
  const d = getCard4x6ExportDimensions(baseWidth);
  return { id, recipe: SHORT, width: d.width, height: d.height };
}

const FIXTURES = [];
// Download print ladder (DownloadClient): 6000..4200, square.
for (const w of [6000, 5400, 5000, 4600, 4200]) FIXTURES.push(fixture("DL-" + w + "-SQ", SHORT, w));
// Editor framed ladder + low-memory ladder.
for (const w of [4200, 3800, 3400, 3000, 2600]) FIXTURES.push(fixture("ED-FRAMED-" + w + "-SQ", SHORT, w));
for (const w of [3200, 2800, 2400, 2000, 1700]) FIXTURES.push(fixture("ED-FRAMED-LOMEM-" + w + "-SQ", SHORT, w));
// Editor unframed ladder + low-memory ladder.
for (const w of [5400, 5000, 4600, 4200, 3800, 3400]) FIXTURES.push(fixture("ED-UNFRAMED-" + w + "-SQ", SHORT, w));
for (const w of [3600, 3200, 2800, 2400, 2000, 1700]) FIXTURES.push(fixture("ED-UNFRAMED-LOMEM-" + w + "-SQ", SHORT, w));
// Non-square (4:5) subset across ladders.
FIXTURES.push(fixture("DL-6000-45", SHORT, 6000, "4:5"));
FIXTURES.push(fixture("DL-4200-45", SHORT, 4200, "4:5"));
FIXTURES.push(fixture("ED-FRAMED-4200-45", SHORT, 4200, "4:5"));
FIXTURES.push(fixture("ED-FRAMED-2600-45", SHORT, 2600, "4:5"));
FIXTURES.push(fixture("ED-UNFRAMED-5400-45", SHORT, 5400, "4:5"));
FIXTURES.push(fixture("ED-UNFRAMED-3400-45", SHORT, 3400, "4:5"));
// Card ladder via getCard4x6ExportDimensions (base widths incl. low-mem).
for (const b of [2700, 2400, 2100, 1800, 1500]) FIXTURES.push(cardFixture("CARD-" + b, b));
// Controls.
FIXTURES.push(fixture("CTL-FRAMEOFF-4200", FRAME_OFF, 4200));
FIXTURES.push(fixture("CTL-CIRCLE-4200", CIRCLE, 4200));
FIXTURES.push(fixture("CTL-TRANSPARENT-4200", TRANSPARENT_MAT, 4200));
FIXTURES.push(fixture("CTL-PARCHMENT-4200", PARCHMENT, 4200));
FIXTURES.push(fixture("CTL-MINIMAL-4200", MINIMAL, 4200));
FIXTURES.push(fixture("CTL-LONGTITLE-6000", LONG_TITLE, 6000));
FIXTURES.push(fixture("CTL-LONGTITLE-4200", LONG_TITLE, 4200));
FIXTURES.push(fixture("CTL-LONGTITLE-2000", LONG_TITLE, 2000));
// Determinism self-check: the first fixture rendered a second time.
FIXTURES.push(fixture("DL-6000-SQ-REPEAT", SHORT, 6000));

async function sha256Hex(data) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// SHA-256 strip-tree over the decoded RGBA bytes: hash 128-row strips,
// then hash the joined strip hashes. Byte equality <=> tree equality
// (up to SHA-256 collision resistance), without holding two full-frame
// copies in memory.
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
  const root = await sha256Hex(new TextEncoder().encode(stripHashes.join(":")));
  return root;
}

function renderFixture(f, matPurpose) {
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
  });
  return canvas;
}

async function runAll() {
  const results = { fixtures: [], integration: {}, numeric: {}, error: null };
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

    // Integration: record strokeRect args for one 6000 square render per
    // purpose (local coordinates — what drawBackground strokes).
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
      const canvas = renderFixture(f, "print");
      const sha256 = await hashCanvas(canvas);
      results.fixtures.push({ id: f.id, width: canvas.width, height: canvas.height, sha256 });
      canvas.width = 0;
    }
  } catch (err) {
    results.error = String((err && err.stack) || err);
  }
  window.__FRAME_HARNESS_RESULTS__ = results;
  window.__FRAME_HARNESS_DONE__ = true;
}

export default function FrameInsetHarnessPage() {
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
  const harnessDir = join(appDir, "src", "app", "frame-inset-harness");
  mkdirSync(harnessDir, { recursive: true });
  writeFileSync(join(harnessDir, "page.tsx"), PAGE_SOURCE);
  // Production build + `next start`, not `next dev`: Turbopack dev refuses a
  // symlinked node_modules ("points out of the filesystem root") when the app
  // tree borrows another tree's install; the production build/server handle
  // it. Env mirrors playwright.config.ts's webServer block (dummy values).
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
    const url = `http://127.0.0.1:${port}/frame-inset-harness`;
    await waitForServer(url);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
      await page.waitForFunction(() => window.__FRAME_HARNESS_DONE__ === true, null, {
        timeout: 20 * 60 * 1000,
      });
      const results = await page.evaluate(() => window.__FRAME_HARNESS_RESULTS__);
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

async function main() {
  const args = process.argv.slice(2);
  const get = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : null;
  };
  const baselineDir = get("--baseline");
  const candidateDir = get("--candidate");
  const outPath = resolve(get("--out") || "frame-inset-print-invariance-results.json");
  if (!baselineDir || !candidateDir) {
    console.error("usage: run.mjs --baseline <appDir> --candidate <appDir> [--out results.json]");
    process.exit(2);
  }
  const require = createRequire(join(resolve(candidateDir), "package.json"));
  const { chromium } = require("@playwright/test");

  const baseline = await runTree({ label: "baseline", appDir: resolve(baselineDir), port: 3109, chromium });
  console.log(`baseline done: ${baseline.results.fixtures?.length ?? 0} fixtures, error=${baseline.results.error}`);
  const candidate = await runTree({ label: "candidate", appDir: resolve(candidateDir), port: 3110, chromium });
  console.log(`candidate done: ${candidate.results.fixtures?.length ?? 0} fixtures, error=${candidate.results.error}`);

  const failures = [];
  if (baseline.results.error) failures.push(`baseline error: ${baseline.results.error}`);
  if (candidate.results.error) failures.push(`candidate error: ${candidate.results.error}`);

  const byId = (list) => new Map((list || []).map((f) => [f.id, f]));
  const bMap = byId(baseline.results.fixtures);
  const cMap = byId(candidate.results.fixtures);
  for (const [id, b] of bMap) {
    const c = cMap.get(id);
    if (!c) {
      failures.push(`${id}: missing in candidate`);
      continue;
    }
    if (b.width !== c.width || b.height !== c.height) {
      failures.push(`${id}: dimensions differ baseline ${b.width}x${b.height} vs candidate ${c.width}x${c.height}`);
    } else if (b.sha256 !== c.sha256) {
      failures.push(`${id}: RGBA hash differs (${b.width}x${b.height})`);
    }
  }
  for (const id of cMap.keys()) {
    if (!bMap.has(id)) failures.push(`${id}: missing in baseline`);
  }
  // Determinism self-check inside each tree.
  for (const [label, res] of [
    ["baseline", baseline.results],
    ["candidate", candidate.results],
  ]) {
    const m = byId(res.fixtures);
    const a = m.get("DL-6000-SQ");
    const b = m.get("DL-6000-SQ-REPEAT");
    if (!a || !b || a.sha256 !== b.sha256) {
      failures.push(`${label}: determinism self-check failed (DL-6000-SQ vs REPEAT)`);
    }
  }
  // Candidate integration assertions (SQ-67 section 5).
  const integ = candidate.results.integration || {};
  const expectRect = (purpose, rect) => {
    const calls = integ[purpose] || [];
    const found = calls.some(
      (c) => c.length === 4 && c.every((v, i) => Math.abs(v - rect[i]) < 1e-9),
    );
    if (!found) {
      failures.push(`integration ${purpose}: expected strokeRect ${JSON.stringify(rect)} in ${JSON.stringify(calls)}`);
    }
  };
  expectRect("preview", [80, 80, 5840, 5840]);
  expectRect("print", [16, 16, 5968, 5968]);
  const numeric = candidate.results.numeric || {};
  const expectNumeric = (key, value) => {
    if (numeric[key] !== value) failures.push(`numeric ${key}: expected ${value}, got ${numeric[key]}`);
  };
  expectNumeric("insetPreview6000", 80);
  expectNumeric("insetPrint6000", 16);
  expectNumeric("insetOmitted6000", 16);
  expectNumeric("fitPreview6000", 5780);
  expectNumeric("fitPrint6000", 5908);

  const report = {
    generatedAt: new Date().toISOString(),
    fixtureCount: bMap.size,
    failures,
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
  console.log(`PASS: ${bMap.size} print fixtures byte-identical; integration + numeric assertions hold.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
