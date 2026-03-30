#!/usr/bin/env node

import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const KEY_STEPS = [
  "landing_view",
  "preview_started",
  "checkout_started",
  "checkout_request_received",
  "checkout_session_created",
  "checkout_redirected",
  "payment_verified",
  "download_started",
  "download_completed",
];
const MIN_DOWNLOAD_COMPLETION_SAMPLE = 5;

function parseArgs(argv) {
  const args = {
    site: process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://starmapco.com",
    days: 14,
    json: false,
    strict: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--site") {
      const value = argv[i + 1];
      if (!value) throw new Error("Missing value for --site");
      args.site = value;
      i += 1;
      continue;
    }
    if (token === "--days") {
      const value = Number.parseInt(argv[i + 1] || "", 10);
      if (!Number.isFinite(value) || value <= 0) throw new Error("--days must be a positive integer");
      args.days = Math.min(60, value);
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
      console.log(`Usage: node scripts/funnel-health.mjs [--site <url>] [--days <n>] [--json] [--strict]

Checks event-level funnel continuity and conversion rates from:
  landing_view -> preview_started -> checkout_started -> payment_verified -> download_completed

Optional env vars:
  FUNNEL_DASHBOARD_TOKEN
`);
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${token}`);
  }

  args.site = args.site.replace(/\/+$/, "");
  return args;
}

function safePct(numerator, denominator) {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

async function getFunnelData(site, days) {
  const token = process.env.FUNNEL_DASHBOARD_TOKEN?.trim() || "";
  const res = await fetch(`${site}/api/analytics/funnel?days=${days}`, {
    headers: token ? { "x-funnel-token": token } : undefined,
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok || !body?.data?.rows) {
    throw new Error(`Unable to fetch funnel dashboard (${res.status})`);
  }
  return body.data;
}

function buildStepMap(rows) {
  const out = Object.create(null);
  for (const row of rows || []) {
    if (!row?.step) continue;
    out[row.step] = Number(row.lastNDays || 0);
  }
  for (const step of KEY_STEPS) {
    if (typeof out[step] !== "number") out[step] = 0;
  }
  return out;
}

function buildRecentCounts(dailyRows, windowDays = 3) {
  const window = Array.isArray(dailyRows) ? dailyRows.slice(-windowDays) : [];
  const out = Object.create(null);
  for (const step of KEY_STEPS) out[step] = 0;
  for (const day of window) {
    const counts = day?.counts ?? {};
    for (const step of KEY_STEPS) {
      const value = Number(counts[step] || 0);
      if (Number.isFinite(value)) out[step] += value;
    }
  }
  return { windowDays: Math.max(0, window.length), counts: out };
}

function analyzeCounts(counts, recentWindow) {
  const metrics = {
    previewRateFromLanding: safePct(counts.preview_started, counts.landing_view),
    checkoutRateFromPreview: safePct(counts.checkout_started, counts.preview_started),
    paidRateFromCheckout: safePct(counts.payment_verified, counts.checkout_started),
    paidRateFromLanding: safePct(counts.payment_verified, counts.landing_view),
    downloadCompletionRateFromPaid: safePct(counts.download_completed, counts.payment_verified),
    checkoutRequestCoverage: safePct(counts.checkout_request_received, counts.checkout_started),
    checkoutSessionCoverage: safePct(counts.checkout_session_created, counts.checkout_request_received),
    checkoutRedirectCoverage: safePct(counts.checkout_redirected, counts.checkout_session_created),
  };

  const warnings = [];
  const notes = [];
  const recentCounts = recentWindow?.counts ?? null;
  const recentWindowDays = recentWindow?.windowDays ?? 0;

  if (counts.landing_view === 0) {
    warnings.push("No landing_view events in the selected window.");
  }
  if (counts.checkout_started > 0 && counts.checkout_request_received < counts.checkout_started * 0.85) {
    warnings.push("Low checkout_request_received coverage from checkout_started (<85%).");
  }
  if (counts.checkout_started > 0 && counts.checkout_request_received > counts.checkout_started * 1.15) {
    const recentCheckoutStarted = Number(recentCounts?.checkout_started || 0);
    const recentCheckoutRequestReceived = Number(recentCounts?.checkout_request_received || 0);
    if (
      recentWindowDays > 0 &&
      recentCheckoutStarted > 0 &&
      recentCheckoutRequestReceived <= recentCheckoutStarted * 1.15
    ) {
      notes.push(
        `Legacy-window inflation: checkout_request_received > checkout_started over selected window, but recent ${recentWindowDays}d looks normal.`,
      );
    } else {
      warnings.push("checkout_request_received is significantly above checkout_started (>115%), likely duplicate instrumentation.");
    }
  }
  if (counts.checkout_request_received > 0 && counts.checkout_session_created < counts.checkout_request_received * 0.9) {
    warnings.push("Low checkout_session_created coverage from checkout_request_received (<90%).");
  }
  if (counts.checkout_request_received > 0 && counts.checkout_session_created > counts.checkout_request_received * 1.15) {
    warnings.push("checkout_session_created is significantly above checkout_request_received (>115%), likely duplicate instrumentation.");
  }
  if (counts.checkout_session_created > 0 && counts.checkout_redirected < counts.checkout_session_created * 0.9) {
    warnings.push("Low checkout_redirected coverage from checkout_session_created (<90%).");
  }
  if (counts.checkout_session_created > 0 && counts.checkout_redirected > counts.checkout_session_created * 1.15) {
    const recentCheckoutSessionCreated = Number(recentCounts?.checkout_session_created || 0);
    const recentCheckoutRedirected = Number(recentCounts?.checkout_redirected || 0);
    if (
      recentWindowDays > 0 &&
      recentCheckoutSessionCreated > 0 &&
      recentCheckoutRedirected <= recentCheckoutSessionCreated * 1.15
    ) {
      notes.push(
        `Legacy-window inflation: checkout_redirected > checkout_session_created over selected window, but recent ${recentWindowDays}d looks normal.`,
      );
    } else {
      warnings.push("checkout_redirected is significantly above checkout_session_created (>115%), likely duplicate instrumentation.");
    }
  }
  if (counts.checkout_started >= 5 && counts.payment_verified === 0) {
    warnings.push("Checkout starts exist but no payment_verified events were recorded.");
  }
  if (
    counts.payment_verified >= MIN_DOWNLOAD_COMPLETION_SAMPLE &&
    counts.download_completed < counts.payment_verified * 0.7
  ) {
    warnings.push(
      `Low download_completed coverage from payment_verified (<70%) with sample >=${MIN_DOWNLOAD_COMPLETION_SAMPLE}.`,
    );
  } else if (
    counts.payment_verified > 0 &&
    counts.payment_verified < MIN_DOWNLOAD_COMPLETION_SAMPLE &&
    counts.download_completed < counts.payment_verified * 0.7
  ) {
    notes.push(
      `Download completion is below 70%, but payment_verified sample is low (${counts.payment_verified}/${MIN_DOWNLOAD_COMPLETION_SAMPLE} min).`,
    );
  }

  return { metrics, warnings, notes };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const data = await getFunnelData(args.site, args.days);
  const counts = buildStepMap(data.rows);
  const recentWindow = buildRecentCounts(data.daily, 3);
  const { metrics, warnings, notes } = analyzeCounts(counts, recentWindow);

  const report = {
    generatedAt: new Date().toISOString(),
    site: args.site,
    days: args.days,
    counts,
    recentWindow,
    metrics,
    warnings,
    notes,
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    if (args.strict && warnings.length > 0) process.exit(1);
    return;
  }

  console.log("Funnel health check");
  console.log(`Site: ${report.site}`);
  console.log(`Window: last ${report.days} days`);
  console.log("");
  console.log("Step counts");
  for (const step of KEY_STEPS) {
    console.log(`- ${step}: ${counts[step]}`);
  }
  console.log("");
  console.log("Key rates");
  console.log(`- landing -> preview: ${metrics.previewRateFromLanding ?? "n/a"}%`);
  console.log(`- preview -> checkout: ${metrics.checkoutRateFromPreview ?? "n/a"}%`);
  console.log(`- checkout -> paid: ${metrics.paidRateFromCheckout ?? "n/a"}%`);
  console.log(`- landing -> paid: ${metrics.paidRateFromLanding ?? "n/a"}%`);
  console.log(`- paid -> download_completed: ${metrics.downloadCompletionRateFromPaid ?? "n/a"}%`);
  console.log(`- checkout_started -> checkout_request_received: ${metrics.checkoutRequestCoverage ?? "n/a"}%`);
  console.log(`- checkout_request_received -> checkout_session_created: ${metrics.checkoutSessionCoverage ?? "n/a"}%`);
  console.log(`- checkout_session_created -> checkout_redirected: ${metrics.checkoutRedirectCoverage ?? "n/a"}%`);
  if (recentWindow.windowDays > 0) {
    console.log("");
    console.log(`Recent ${recentWindow.windowDays}d checkpoint`);
    console.log(`- checkout_started: ${recentWindow.counts.checkout_started}`);
    console.log(`- checkout_request_received: ${recentWindow.counts.checkout_request_received}`);
    console.log(`- checkout_session_created: ${recentWindow.counts.checkout_session_created}`);
    console.log(`- checkout_redirected: ${recentWindow.counts.checkout_redirected}`);
  }
  if (notes.length) {
    console.log("");
    console.log("Notes");
    for (const note of notes) {
      console.log(`- ${note}`);
    }
  }

  if (warnings.length) {
    console.log("");
    console.log("Warnings");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
    if (args.strict) {
      process.exit(1);
    }
    return;
  }

  console.log("");
  console.log("OK");
}

main().catch((error) => {
  console.error("Funnel health check failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
