#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    site: "https://starmapco.com",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--site" && next) {
      args.site = next.trim().replace(/\/+$/, "");
      index += 1;
      continue;
    }
    if (token === "-h" || token === "--help") {
      console.log(`Usage: node scripts/content-consistency-sweep.mjs [--site https://starmapco.com]`);
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${token}`);
  }
  return args;
}

function toLower(value) {
  return String(value || "").toLowerCase();
}

function hasAnyPhrase(content, phrases) {
  const normalized = toLower(content);
  return phrases.some((phrase) => normalized.includes(toLower(phrase)));
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "starmapco-content-consistency/1.0",
      accept: "text/html,application/xhtml+xml",
    },
  });
  const html = await response.text().catch(() => "");
  return { status: response.status, ok: response.ok, html };
}

const pageChecks = [
  {
    path: "/",
    requiredAny: ["preview framed print", "compare all gift formats"],
    requiredAll: ["/shipping", "/returns", "support@starmapco.com"],
  },
  {
    path: "/personalized-star-map",
    requiredAny: ["what you receive", "physical print", "framed"],
    requiredAll: ["/shipping", "/returns"],
  },
  {
    path: "/star-map-gift",
    requiredAny: ["gift formats", "framed", "unframed"],
    requiredAll: ["/shipping", "/returns"],
  },
  {
    path: "/wedding",
    requiredAny: ["wedding", "framed", "digital"],
    requiredAll: ["/shipping", "/returns"],
  },
  {
    path: "/shipping",
    requiredAny: ["shipping", "delivery"],
    requiredAll: ["/returns"],
  },
  {
    path: "/returns",
    requiredAny: ["returns", "refund"],
    requiredAll: ["/shipping"],
  },
  {
    path: "/privacy",
    requiredAny: ["privacy"],
    requiredAll: [],
  },
  {
    path: "/terms",
    requiredAny: ["terms"],
    requiredAll: [],
  },
];

function checkPageContent(input) {
  const issues = [];
  if (!input.ok) {
    issues.push(`status_${input.status}`);
    return issues;
  }
  for (const phrase of input.requiredAll) {
    if (!hasAnyPhrase(input.html, [phrase])) {
      issues.push(`missing:${phrase}`);
    }
  }
  if (input.requiredAny.length > 0 && !hasAnyPhrase(input.html, input.requiredAny)) {
    issues.push(`missing_any:${input.requiredAny.join("|")}`);
  }
  return issues;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const generatedAt = new Date().toISOString();
  const report = {
    generatedAt,
    site: args.site,
    pages: [],
    failed: 0,
  };

  for (const page of pageChecks) {
    const url = `${args.site}${page.path}`;
    const response = await fetchHtml(url);
    const issues = checkPageContent({
      ...response,
      requiredAll: page.requiredAll,
      requiredAny: page.requiredAny,
    });
    report.pages.push({
      path: page.path,
      status: response.status,
      ok: issues.length === 0,
      issues,
    });
  }

  report.failed = report.pages.filter((page) => !page.ok).length;

  for (const page of report.pages) {
    if (page.ok) {
      console.log(`[PASS] ${page.path}`);
    } else {
      console.log(`[FAIL] ${page.path} -> ${page.issues.join(", ")}`);
    }
  }

  const reportsDir = path.join(process.cwd(), "reports");
  await fs.mkdir(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, "content-consistency-sweep.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Report written: ${reportPath}`);

  if (report.failed > 0) {
    process.exit(1);
  }
  console.log("Content consistency sweep passed.");
}

main().catch((error) => {
  console.error(`content-consistency-sweep failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
