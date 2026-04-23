#!/usr/bin/env node

import dotenv from "dotenv";
import { readWranglerVars } from "./wrangler-vars.mjs";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const wranglerVars = await readWranglerVars(process.cwd());
for (const [key, value] of Object.entries(wranglerVars)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

const PREVIEW_STEP = "preview_started";
const SESSION_STEP = "checkout_session_created";
const PAID_STEP = "payment_verified";

function parseArgs(argv) {
  const args = {
    site: process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://starmapco.com",
    probe: true,
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
    if (token === "--no-probe") {
      args.probe = false;
      continue;
    }
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "-h" || token === "--help") {
      console.log(`Usage: node scripts/checkout-ratio-sanity.mjs [--site <url>] [--no-probe] [--json]

Prints preview_started → checkout_session_created → payment_verified ratios for the
funnel dashboard windows last 1d and last 7d (UTC day range, same source as commerce digest).

Optional env:
  FUNNEL_DASHBOARD_TOKEN — required when the site enforces funnel dashboard auth

By default performs a quick GET ${args.site}/ (or --site) and logs PASS/FAIL for HTTP 200.`);
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${token}`);
  }

  args.site = args.site.replace(/\/+$/, "");
  return args;
}

function pct(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function formatRate(numerator, denominator) {
  const p = pct(numerator, denominator);
  if (p === null) return "n/a";
  return `${p.toFixed(2)}% (${numerator}/${denominator})`;
}

async function fetchFunnelSteps(site, days) {
  const token = process.env.FUNNEL_DASHBOARD_TOKEN?.trim() || "";
  const res = await fetch(`${site}/api/analytics/funnel?days=${days}`, {
    headers: token ? { "x-funnel-token": token } : undefined,
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok || !body?.data) {
    const err = body?.error || `http_${res.status}`;
    throw new Error(`funnel days=${days}: ${err}`);
  }

  const steps = {};
  if (Array.isArray(body.data.rows)) {
    for (const row of body.data.rows) {
      if (typeof row?.step === "string" && typeof row?.lastNDays === "number") {
        steps[row.step] = row.lastNDays;
      }
    }
  }
  return {
    generatedAt: body.data.generatedAt,
    days: body.data.days,
    preview: Number(steps[PREVIEW_STEP] || 0),
    session: Number(steps[SESSION_STEP] || 0),
    paid: Number(steps[PAID_STEP] || 0),
  };
}

function buildWindowReport(snapshot) {
  const { days, preview, session, paid } = snapshot;
  return {
    days,
    counts: { preview_started: preview, checkout_session_created: session, payment_verified: paid },
    previewToSession: { pct: pct(session, preview), numerator: session, denominator: preview },
    sessionToPaid: { pct: pct(paid, session), numerator: paid, denominator: session },
    previewToPaid: { pct: pct(paid, preview), numerator: paid, denominator: preview },
  };
}

async function probeSiteRoot(site) {
  const res = await fetch(site, {
    method: "GET",
    signal: AbortSignal.timeout(8000),
    headers: { accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
  });
  return { ok: res.ok, status: res.status };
}

function printWindow(label, report) {
  console.log(label);
  console.log(
    `  counts: ${PREVIEW_STEP}=${report.counts.preview_started} ${SESSION_STEP}=${report.counts.checkout_session_created} ${PAID_STEP}=${report.counts.payment_verified}`,
  );
  console.log(`  preview → session: ${formatRate(report.previewToSession.numerator, report.previewToSession.denominator)}`);
  console.log(`  session → paid: ${formatRate(report.sessionToPaid.numerator, report.sessionToPaid.denominator)}`);
  console.log(`  preview → paid: ${formatRate(report.previewToPaid.numerator, report.previewToPaid.denominator)}`);
  console.log("");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const [one, seven] = await Promise.all([fetchFunnelSteps(args.site, 1), fetchFunnelSteps(args.site, 7)]);

  const out = {
    generatedAt: new Date().toISOString(),
    site: args.site,
    windows: {
      last1d: buildWindowReport(one),
      last7d: buildWindowReport(seven),
    },
  };

  if (args.json) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  console.log("Checkout ratio sanity (funnel)");
  console.log(`Site: ${args.site}`);
  console.log(`Funnel snapshots: 1d@${one.generatedAt || "unknown"} 7d@${seven.generatedAt || "unknown"}`);
  console.log("");
  printWindow("Last 1d (funnel UTC window)", out.windows.last1d);
  printWindow("Last 7d (funnel UTC window)", out.windows.last7d);

  if (args.probe) {
    try {
      const probe = await probeSiteRoot(args.site);
      if (probe.ok) {
        console.log(`[PASS] site probe: HTTP ${probe.status} ${args.site}/`);
      } else {
        console.log(`[FAIL] site probe: HTTP ${probe.status} ${args.site}/`);
        process.exitCode = 1;
      }
    } catch (error) {
      console.log(`[FAIL] site probe: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error("checkout-ratio-sanity failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
