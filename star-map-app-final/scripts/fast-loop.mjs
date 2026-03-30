#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const execFileAsync = promisify(execFile);
const DEFAULT_WINDOWS = [1, 3];
const MAX_WINDOW_DAYS = 30;
const MIN_DOWNLOAD_COMPLETION_SAMPLE = 5;

function parseWindows(raw) {
  if (!raw) return [...DEFAULT_WINDOWS];
  const values = raw
    .split(",")
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((entry) => Number.isFinite(entry) && entry > 0)
    .map((entry) => Math.min(MAX_WINDOW_DAYS, entry));
  if (!values.length) {
    throw new Error("--windows must include one or more positive day values (example: 1,3)");
  }
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function parseArgs(argv) {
  const args = {
    site: process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://starmapco.com",
    windows: [...DEFAULT_WINDOWS],
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
    if (token === "--windows") {
      args.windows = parseWindows(argv[i + 1] || "");
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
      console.log(`Usage: node scripts/fast-loop.mjs [--site <url>] [--windows <days_csv>] [--json] [--strict]

Runs rapid execution diagnostics without waiting for weekly windows.
Each window runs:
  - commerce digest
  - funnel health

Defaults:
  --windows 1,3

Strict mode exits non-zero when critical actions are detected.`);
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
    maxBuffer: 1024 * 1024 * 8,
  });
  return JSON.parse(stdout);
}

function asFiniteNumber(value, fallback = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return value;
}

function safePct(numerator, denominator) {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function getReferralPaidSessions(digest) {
  const rows = Array.isArray(digest?.stripe?.referralPaidSources) ? digest.stripe.referralPaidSources : [];
  return rows.reduce((sum, row) => sum + asFiniteNumber(row?.count, 0), 0);
}

function getTopCheckoutBlocker(digest) {
  const rows = Array.isArray(digest?.checkoutDiagnostics) ? digest.checkoutDiagnostics : [];
  const sorted = rows
    .map((row) => ({
      reason: String(row?.reason || "unknown"),
      count: asFiniteNumber(row?.lastNDays, 0),
    }))
    .sort((a, b) => b.count - a.count);
  const top = sorted.find((entry) => entry.count > 0);
  return top ?? null;
}

function buildWindowSummary(days, digest, health) {
  const funnel = digest?.funnel ?? {};
  const landingView = asFiniteNumber(funnel?.landing_view);
  const previewStarted = asFiniteNumber(funnel?.preview_started);
  const checkoutStarted = asFiniteNumber(funnel?.checkout_started);
  const paymentVerified = asFiniteNumber(funnel?.payment_verified);
  const downloadCompleted = asFiniteNumber(funnel?.download_completed);
  const checkoutRequestReceived = asFiniteNumber(funnel?.checkout_request_received);
  const checkoutSessionCreated = asFiniteNumber(funnel?.checkout_session_created);
  const checkoutRedirected = asFiniteNumber(funnel?.checkout_redirected);

  return {
    days,
    funnel: {
      landingView,
      previewStarted,
      checkoutStarted,
      checkoutRequestReceived,
      checkoutSessionCreated,
      checkoutRedirected,
      paymentVerified,
      downloadCompleted,
    },
    commerce: {
      paidSessions: asFiniteNumber(digest?.stripe?.paidSessions),
      printPaidSessions: asFiniteNumber(digest?.stripe?.printPaidSessions),
      digitalPaidSessions: asFiniteNumber(digest?.stripe?.digitalPaidSessions),
      referralPaidSessions: getReferralPaidSessions(digest),
    },
    rates: {
      previewRateFromLanding: safePct(previewStarted, landingView),
      checkoutRateFromPreview: safePct(checkoutStarted, previewStarted),
      paidRateFromCheckout: safePct(paymentVerified, checkoutStarted),
      downloadCompletionRateFromPaid: safePct(downloadCompleted, paymentVerified),
      checkoutRequestCoverage: safePct(checkoutRequestReceived, checkoutStarted),
      checkoutSessionCoverage: safePct(checkoutSessionCreated, checkoutRequestReceived),
      checkoutRedirectCoverage: safePct(checkoutRedirected, checkoutSessionCreated),
    },
    warnings: Array.isArray(health?.warnings) ? health.warnings : [],
    notes: Array.isArray(health?.notes) ? health.notes : [],
    topCheckoutBlocker: getTopCheckoutBlocker(digest),
  };
}

function getWindowByDays(windows, days) {
  return windows.find((window) => window.days === days) ?? null;
}

function buildActions(windows) {
  const actions = [];
  const day1 = getWindowByDays(windows, 1) ?? windows[0] ?? null;
  const day3 = getWindowByDays(windows, 3) ?? windows[windows.length - 1] ?? null;

  if (day1) {
    if (day1.funnel.checkoutStarted >= 3 && day1.funnel.paymentVerified === 0) {
      actions.push({
        severity: "critical",
        area: "conversion_today",
        trigger: `1d window has ${day1.funnel.checkoutStarted} checkout starts and 0 payments.`,
        action: "Run `npm run qa:live-conversion` and verify checkout/payment on mobile + desktop immediately.",
      });
    }

    if (
      day1.rates.checkoutRequestCoverage !== null &&
      day1.funnel.checkoutStarted >= 3 &&
      day1.rates.checkoutRequestCoverage < 90
    ) {
      actions.push({
        severity: "critical",
        area: "checkout_handoff_today",
        trigger: `1d checkout_started -> checkout_request_received is ${day1.rates.checkoutRequestCoverage}%.`,
        action: "Audit editor/paywall CTA handoff and fix top client blocker before shipping additional traffic.",
      });
    }

    if (day1.topCheckoutBlocker) {
      actions.push({
        severity: "warning",
        area: "checkout_blocker_today",
        trigger: `Top checkout blocker in 1d: ${day1.topCheckoutBlocker.reason} (${day1.topCheckoutBlocker.count}).`,
        action: "Prioritize this blocker in the current sprint and verify with same-day rerun.",
      });
    }
  }

  if (day3) {
    if (
      day3.rates.downloadCompletionRateFromPaid !== null &&
      day3.funnel.paymentVerified >= MIN_DOWNLOAD_COMPLETION_SAMPLE &&
      day3.rates.downloadCompletionRateFromPaid < 70
    ) {
      actions.push({
        severity: "warning",
        area: "post_purchase_recovery",
        trigger: `3d paid -> download_completed is ${day3.rates.downloadCompletionRateFromPaid}% (n=${day3.funnel.paymentVerified}).`,
        action: "Check success/download recovery paths and access-link delivery for friction regressions.",
      });
    }

    if (day3.commerce.paidSessions >= 3 && day3.commerce.referralPaidSessions === 0) {
      actions.push({
        severity: "info",
        area: "referral_activation",
        trigger: "3d paid sessions exist but referral-attributed paid sessions are 0.",
        action: "Push referral CTA placement and run a same-day share test from success/download/my-downloads surfaces.",
      });
    }
  }

  if (actions.length === 0) {
    actions.push({
      severity: "ok",
      area: "rapid_loop",
      trigger: "No critical thresholds breached in selected windows.",
      action: "Continue shipping and rerun this command after each deploy or major funnel change.",
    });
  }

  return actions;
}

function printWindowSummary(window) {
  console.log(`Window: ${window.days}d`);
  console.log(
    `  landing=${window.funnel.landingView} preview=${window.funnel.previewStarted} checkout=${window.funnel.checkoutStarted} paid=${window.funnel.paymentVerified} download_completed=${window.funnel.downloadCompleted}`,
  );
  console.log(
    `  rates: preview=${window.rates.previewRateFromLanding ?? "n/a"}% checkout=${window.rates.checkoutRateFromPreview ?? "n/a"}% paid=${window.rates.paidRateFromCheckout ?? "n/a"}%`,
  );
  console.log(
    `  coverage: request=${window.rates.checkoutRequestCoverage ?? "n/a"}% session=${window.rates.checkoutSessionCoverage ?? "n/a"}% redirect=${window.rates.checkoutRedirectCoverage ?? "n/a"}%`,
  );
  console.log(
    `  paid mix: total=${window.commerce.paidSessions} digital=${window.commerce.digitalPaidSessions} print=${window.commerce.printPaidSessions} referral=${window.commerce.referralPaidSessions}`,
  );
  if (window.topCheckoutBlocker) {
    console.log(`  top blocker: ${window.topCheckoutBlocker.reason} (${window.topCheckoutBlocker.count})`);
  }
  if (window.warnings.length > 0) {
    console.log(`  warnings: ${window.warnings.length}`);
  }
  if (window.notes.length > 0) {
    console.log(`  notes: ${window.notes.length}`);
  }
}

function printHumanReport(report) {
  console.log("Fast loop check");
  console.log(`Site: ${report.site}`);
  console.log(`Windows: ${report.windows.map((window) => `${window.days}d`).join(", ")}`);
  console.log("");

  for (const window of report.windows) {
    printWindowSummary(window);
    console.log("");
  }

  console.log("Actions");
  for (const action of report.actions) {
    console.log(`- [${String(action.severity).toUpperCase()}] ${action.area}: ${action.trigger}`);
    console.log(`  -> ${action.action}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const windowReports = await Promise.all(
    args.windows.map(async (days) => {
      const common = ["--site", args.site, "--days", String(days), "--json"];
      const [digest, health] = await Promise.all([
        runJsonScript("scripts/commerce-digest.mjs", common),
        runJsonScript("scripts/funnel-health.mjs", common),
      ]);
      return buildWindowSummary(days, digest, health);
    }),
  );

  const windows = windowReports.sort((a, b) => a.days - b.days);
  const actions = buildActions(windows);
  const report = {
    generatedAt: new Date().toISOString(),
    site: args.site,
    windows,
    actions,
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  if (args.strict && actions.some((action) => action.severity === "critical")) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fast loop check failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
