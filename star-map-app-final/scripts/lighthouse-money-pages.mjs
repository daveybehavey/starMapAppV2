#!/usr/bin/env node
/**
 * Lighthouse pass on money pages (B5 + perf budgets).
 *   npm run qa:lighthouse:money-pages
 *   npm run qa:lighthouse:money-pages -- --site https://starmapco.com
 */
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_SITE = "https://starmapco.com";
const DEFAULT_OUT_DIR = "reports/lighthouse";
const MONEY_PATHS = ["/", "/wedding", "/star-map-generator", "/personalized-star-map", "/shop"];
const MIN_PERFORMANCE = Number.parseInt(process.env.LH_MIN_PERFORMANCE || "75", 10);

function parseArgs(argv) {
  const args = { site: DEFAULT_SITE, outDir: DEFAULT_OUT_DIR, paths: MONEY_PATHS };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--site" && next) {
      args.site = next.replace(/\/+$/, "");
      i += 1;
      continue;
    }
    if (token === "--out-dir" && next) {
      args.outDir = next;
      i += 1;
    }
  }
  return args;
}

function slugFromPath(pathname) {
  if (pathname === "/") return "home";
  return pathname.replace(/^\//, "").replace(/\//g, "-");
}

async function runLighthouse(url, outFile) {
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  const result = spawnSync(
    "npx",
    [
      "lighthouse",
      url,
      "--only-categories=performance,accessibility,best-practices,seo",
      "--chrome-flags=--headless",
      "--output=json",
      `--output-path=${outFile}`,
      "--quiet",
    ],
    { stdio: "inherit", shell: true },
  );
  if (result.status !== 0) {
    throw new Error(`Lighthouse failed for ${url}`);
  }
  const report = JSON.parse(await fs.readFile(outFile, "utf8"));
  const scores = Object.fromEntries(
    Object.entries(report.categories).map(([key, value]) => [key, Math.round(value.score * 100)]),
  );
  return {
    url,
    scores,
    lcp: report.audits["largest-contentful-paint"]?.displayValue ?? "n/a",
    cls: report.audits["cumulative-layout-shift"]?.displayValue ?? "n/a",
    tbt: report.audits["total-blocking-time"]?.displayValue ?? "n/a",
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const results = [];

  for (const pathname of args.paths) {
    const url = `${args.site}${pathname}`;
    const outFile = path.resolve(args.outDir, `${slugFromPath(pathname)}.json`);
    console.log(`\nLighthouse: ${url}`);
    try {
      results.push(await runLighthouse(url, outFile));
    } catch (error) {
      console.error(`  skipped: ${error instanceof Error ? error.message : String(error)}`);
      results.push({
        url,
        scores: { performance: 0, accessibility: 0, "best-practices": 0, seo: 0 },
        lcp: "n/a",
        cls: "n/a",
        tbt: "n/a",
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await sleep(2500);
  }

  const summaryPath = path.resolve(args.outDir, "money-pages-summary.json");
  await fs.writeFile(summaryPath, JSON.stringify({ site: args.site, generatedAt: new Date().toISOString(), results }, null, 2));

  console.log("\n=== Money pages Lighthouse summary ===");
  let failed = false;
  for (const row of results) {
    if (row.error) {
      console.log(`${row.url}\n  ERROR: ${row.error}`);
      failed = true;
      continue;
    }
    const perf = row.scores.performance;
    const flag = perf < MIN_PERFORMANCE ? " FAIL" : "";
    if (perf < MIN_PERFORMANCE) failed = true;
    console.log(
      `${row.url}\n  perf ${perf} · a11y ${row.scores.accessibility} · bp ${row.scores["best-practices"]} · seo ${row.scores.seo}${flag}\n  LCP ${row.lcp} · CLS ${row.cls} · TBT ${row.tbt}`,
    );
  }
  console.log(`\nWrote ${summaryPath}`);

  if (failed) {
    console.error(`One or more pages scored below performance threshold ${MIN_PERFORMANCE}.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
