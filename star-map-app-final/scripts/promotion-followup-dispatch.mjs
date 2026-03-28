#!/usr/bin/env node

import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

function parseArgs(argv) {
  const args = {
    site: process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://starmapco.com",
    limit: 100,
    dryRun: false,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--site") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value for --site");
      args.site = next;
      i += 1;
      continue;
    }
    if (token === "--limit") {
      const next = Number.parseInt(argv[i + 1] || "", 10);
      if (!Number.isFinite(next) || next <= 0) throw new Error("--limit must be a positive integer");
      args.limit = Math.min(500, next);
      i += 1;
      continue;
    }
    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "-h" || token === "--help") {
      console.log(`Usage: node scripts/promotion-followup-dispatch.mjs [--site <url>] [--limit <n>] [--dry-run] [--json]

Dispatches due promotion follow-up emails via:
  POST /api/promotions/followup-dispatch

Required env vars:
  PRINT_ADMIN_TOKEN

Examples:
  npm run ops:promotion-followup -- --dry-run
  npm run ops:promotion-followup -- --limit 50
`);
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${token}`);
  }

  args.site = args.site.replace(/\/+$/, "");
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const adminToken = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  if (!adminToken) {
    throw new Error("Missing PRINT_ADMIN_TOKEN");
  }

  const res = await fetch(`${args.site}/api/promotions/followup-dispatch`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": adminToken,
    },
    body: JSON.stringify({
      limit: args.limit,
      dryRun: args.dryRun,
    }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    throw new Error(`Dispatch failed (${res.status}): ${data?.error || "unknown_error"}`);
  }

  if (args.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log("Promotion follow-up dispatch");
  console.log(`Site: ${args.site}`);
  console.log(`Dry run: ${args.dryRun ? "yes" : "no"}`);
  console.log(`Scanned: ${data.scanned}`);
  console.log(`Due: ${data.due}`);
  console.log(`Processed: ${data.processed}`);
  console.log(`Sent: ${data.sent}`);
  console.log(`Failed: ${data.failed}`);
  if (Array.isArray(data.results) && data.results.length > 0) {
    console.log("");
    console.log("Recent results");
    for (const row of data.results.slice(0, 10)) {
      console.log(`- ${row.email}: ${row.status}${row.error ? ` (${row.error})` : ""}`);
    }
  }
}

main().catch((error) => {
  console.error(`promotion-followup-dispatch failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
