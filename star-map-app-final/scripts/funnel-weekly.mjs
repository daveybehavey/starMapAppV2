#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const args = {
    days: 14,
    site: process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://starmapco.com",
    json: false,
    strict: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--days") {
      const value = Number.parseInt(argv[i + 1] || "", 10);
      if (!Number.isFinite(value) || value <= 0) throw new Error("--days must be a positive integer");
      args.days = Math.min(60, value);
      i += 1;
      continue;
    }
    if (token === "--site") {
      const value = argv[i + 1];
      if (!value) throw new Error("Missing value for --site");
      args.site = value;
      i += 1;
      continue;
    }
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--strict") {
      args.strict = true;
      continue;
    }
    if (token === "-h" || token === "--help") {
      console.log(`Usage: node scripts/funnel-weekly.mjs [--days <n>] [--site <url>] [--json] [--strict]

Runs both:
  - funnel continuity check
  - Stripe reconciliation check

Strict mode exits non-zero when:
  - reconciliation delta != 0
  - funnel health returns warnings
`);
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${token}`);
  }

  args.site = args.site.replace(/\/+$/, "");
  return args;
}

async function runJsonScript(scriptPath, args) {
  const { stdout } = await execFileAsync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 1024 * 1024 * 4,
  });
  const parsed = JSON.parse(stdout);
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const common = ["--days", String(args.days), "--site", args.site, "--json"];

  const [health, reconcile] = await Promise.all([
    runJsonScript("scripts/funnel-health.mjs", common),
    runJsonScript("scripts/funnel-reconcile.mjs", common),
  ]);

  const strictFailures = [];
  if (Number(reconcile.delta || 0) !== 0) {
    strictFailures.push(`reconciliation_delta=${reconcile.delta}`);
  }
  if (Array.isArray(health.warnings) && health.warnings.length > 0) {
    strictFailures.push(`funnel_warnings=${health.warnings.length}`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    site: args.site,
    days: args.days,
    funnelHealth: {
      counts: health.counts ?? {},
      recentWindow: health.recentWindow ?? null,
      metrics: health.metrics ?? {},
      warnings: health.warnings ?? [],
      notes: health.notes ?? [],
    },
    reconcile: {
      funnelPaymentVerified: reconcile.funnelPaymentVerified ?? 0,
      stripePaidSessions: reconcile.stripePaidSessions ?? 0,
      stripePaidDigital: reconcile.stripePaidDigital ?? 0,
      stripePaidPrint: reconcile.stripePaidPrint ?? 0,
      delta: reconcile.delta ?? 0,
      deltaPct: reconcile.deltaPct ?? 0,
    },
    strictFailures,
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("Weekly funnel check");
    console.log(`Site: ${report.site}`);
    console.log(`Window: last ${report.days} days`);
    console.log("");
    console.log(
      `Reconcile: funnel=${report.reconcile.funnelPaymentVerified} stripe=${report.reconcile.stripePaidSessions} delta=${report.reconcile.delta} (${report.reconcile.deltaPct}%)`,
    );
    console.log(
      `Paid mix: digital=${report.reconcile.stripePaidDigital} print=${report.reconcile.stripePaidPrint}`,
    );
    if (report.funnelHealth.warnings.length > 0) {
      console.log("");
      console.log("Funnel warnings");
      for (const warning of report.funnelHealth.warnings) {
        console.log(`- ${warning}`);
      }
    } else {
      console.log("");
      console.log("Funnel warnings: none");
    }
    if (Array.isArray(report.funnelHealth.notes) && report.funnelHealth.notes.length > 0) {
      console.log("");
      console.log("Funnel notes");
      for (const note of report.funnelHealth.notes) {
        console.log(`- ${note}`);
      }
    }
  }

  if (args.strict && strictFailures.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Weekly funnel check failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
