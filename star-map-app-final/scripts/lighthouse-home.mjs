#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_SITE = "http://localhost:3011";
const DEFAULT_OUT = "reports/lighthouse-home.json";
const MIN_PERFORMANCE = Number.parseInt(process.env.LH_MIN_PERFORMANCE || "80", 10);

function parseArgs(argv) {
  const args = { site: DEFAULT_SITE, out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--site" && next) {
      args.site = next.replace(/\/+$/, "");
      i += 1;
      continue;
    }
    if (token === "--out" && next) {
      args.out = next;
      i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await fs.mkdir(path.dirname(path.resolve(args.out)), { recursive: true });

  const result = spawnSync(
    "npx",
    [
      "lighthouse",
      `${args.site}/`,
      "--only-categories=performance,accessibility,best-practices,seo",
      "--chrome-flags=--headless",
      `--output=json`,
      `--output-path=${args.out}`,
      "--quiet",
    ],
    { stdio: "inherit", shell: true },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  const report = JSON.parse(await fs.readFile(args.out, "utf8"));
  const scores = Object.fromEntries(
    Object.entries(report.categories).map(([key, value]) => [key, Math.round(value.score * 100)]),
  );
  const lcp = report.audits["largest-contentful-paint"]?.displayValue ?? "n/a";
  const cls = report.audits["cumulative-layout-shift"]?.displayValue ?? "n/a";
  const tbt = report.audits["total-blocking-time"]?.displayValue ?? "n/a";

  console.log(`Lighthouse homepage (${args.site})`);
  console.log(`  performance: ${scores.performance}`);
  console.log(`  accessibility: ${scores.accessibility}`);
  console.log(`  best-practices: ${scores["best-practices"]}`);
  console.log(`  seo: ${scores.seo}`);
  console.log(`  LCP: ${lcp} · CLS: ${cls} · TBT: ${tbt}`);

  if (scores.performance < MIN_PERFORMANCE) {
    console.error(`Performance ${scores.performance} is below threshold ${MIN_PERFORMANCE}.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
