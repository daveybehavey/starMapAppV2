#!/usr/bin/env node

/**
 * Read-only Merchant Center free-listing eligibility diagnostic.
 * GET/list only — no product/account mutations, no feed submission, no Ads.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { seedEnv, getMerchantAccountId, writeJsonReport } from "./merchant-shipping-common.mjs";
import { merchantApiRequest, hasMerchantServiceAccountConfigured } from "./merchant-api.mjs";
import {
  credentialsSetupMessage,
  diagnoseFreeListingEligibility,
  formatConsoleSummary,
} from "./merchant-free-listing-diagnose-lib.mjs";

function parseArgs(argv) {
  const args = {
    feedFile: "public/merchant-feed.xml",
    reportPath: "reports/merchant-free-listing-eligibility.json",
    noReport: false,
    noAggregate: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "-h" || token === "--help") {
      args.help = true;
      continue;
    }
    if (token === "--no-report") {
      args.noReport = true;
      continue;
    }
    if (token === "--no-aggregate") {
      args.noAggregate = true;
      continue;
    }
    if (token === "--feed-file") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) throw new Error("Missing value for --feed-file");
      args.feedFile = next;
      i += 1;
      continue;
    }
    if (token === "--report") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) throw new Error("Missing value for --report");
      args.reportPath = next;
      i += 1;
      continue;
    }
    throw new Error(`Unknown arg: ${token}`);
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/merchant-free-listing-diagnose.mjs [options]

Read-only diagnosis of Google Merchant free-listing eligibility using the
existing service-account Merchant API helpers.

Options:
  --feed-file <path>   Local merchant feed XML used for SKU coverage (default: public/merchant-feed.xml)
  --report <path>      Sanitized JSON report path (default: reports/merchant-free-listing-eligibility.json)
  --no-report          Skip writing the JSON report
  --no-aggregate       Skip issueresolution aggregateProductStatuses (products + account issues only)
  -h, --help           Show this help

Exit codes:
  0  PASS
  1  PARTIAL or BLOCKED
  2  SKIP (credentials/account id missing)

Safety: GET/list only. Never logs service-account JSON, tokens, or auth headers.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  await seedEnv();

  if (!hasMerchantServiceAccountConfigured()) {
    console.error(credentialsSetupMessage());
    process.exit(2);
  }

  let accountId;
  try {
    accountId = getMerchantAccountId();
  } catch {
    console.error(credentialsSetupMessage());
    process.exit(2);
  }

  const feedPath = resolve(process.cwd(), args.feedFile);
  let feedXml = "";
  if (existsSync(feedPath)) {
    feedXml = readFileSync(feedPath, "utf8");
  } else {
    console.warn(`NOTE: Feed file not found at ${args.feedFile}; skipping SKU coverage check.`);
  }

  const report = await diagnoseFreeListingEligibility({
    requestFn: merchantApiRequest,
    accountId,
    feedXml,
    includeAggregate: !args.noAggregate,
  });

  console.log(formatConsoleSummary(report));

  if (!args.noReport) {
    const reportPath = writeJsonReport(args.reportPath, report);
    console.log(`Report written: ${reportPath}`);
  }

  if (report.verdict === "PASS") {
    process.exit(0);
  }
  process.exit(1);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  // Never dump raw bodies that might contain sensitive env reflections.
  console.error(`FAIL: ${message}`);
  if (error && typeof error === "object" && "status" in error) {
    console.error(`HTTP status: ${error.status}`);
  }
  process.exit(1);
});
