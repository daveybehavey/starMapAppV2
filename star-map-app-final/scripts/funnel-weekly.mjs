#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const execFileAsync = promisify(execFile);
const MIN_DOWNLOAD_COMPLETION_SAMPLE = 5;

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

function asFiniteNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function buildOperatorActions(report) {
  const actions = [];
  const reconcileDelta = asFiniteNumber(report.reconcile.delta) ?? 0;
  const reconcileDeltaPct = asFiniteNumber(report.reconcile.deltaPct) ?? 0;
  const stripeRevenuePaidSessionsExcludingQa =
    asFiniteNumber(report.reconcile.stripeRevenuePaidSessionsExcludingQa) ?? 0;
  const metrics = report.funnelHealth.metrics ?? {};
  const recentWindow = report.funnelHealth.recentWindow ?? null;
  const recentCounts = recentWindow?.counts ?? null;
  const recentWindowDays = Math.max(0, Number(recentWindow?.windowDays || 0));
  const warningsCount = Array.isArray(report.funnelHealth.warnings) ? report.funnelHealth.warnings.length : 0;

  if (reconcileDelta !== 0) {
    actions.push({
      severity: Math.abs(reconcileDelta) >= 3 || reconcileDeltaPct >= 5 ? "critical" : "warning",
      area: "stripe_reconcile",
      trigger: `Stripe/Funnel delta is ${reconcileDelta} (${reconcileDeltaPct}% variance).`,
      action:
        reconcileDelta > 0
          ? "Run `npm run qa:funnel-reconcile -- --days 14 --repair` and verify webhook delivery/backfill."
          : "Investigate duplicate `payment_verified` recording paths before next deploy.",
    });
  }

  if (warningsCount > 0) {
    actions.push({
      severity: "warning",
      area: "funnel_health",
      trigger: `${warningsCount} funnel-health warning(s) detected.`,
      action: "Create follow-up tickets for each warning and track them in the next weekly digest.",
    });
  }

  const checkoutRequestCoverage = asFiniteNumber(metrics.checkoutRequestCoverage);
  if (checkoutRequestCoverage !== null && checkoutRequestCoverage < 90) {
    actions.push({
      severity: "critical",
      area: "checkout_handoff",
      trigger: `checkout_started -> checkout_request_received is ${checkoutRequestCoverage}%.`,
      action:
        "Investigate checkout handoff regressions in editor/paywall CTA paths and verify server checkout entry logging.",
    });
  }

  const checkoutSessionCoverage = asFiniteNumber(metrics.checkoutSessionCoverage);
  if (checkoutSessionCoverage !== null && checkoutSessionCoverage < 90) {
    actions.push({
      severity: "critical",
      area: "checkout_session_create",
      trigger: `checkout_request_received -> checkout_session_created is ${checkoutSessionCoverage}%.`,
      action: "Audit `/api/checkout` failure reasons and fix the top blocker before traffic campaigns.",
    });
  }

  const checkoutRedirectCoverage = asFiniteNumber(metrics.checkoutRedirectCoverage);
  if (checkoutRedirectCoverage !== null && checkoutRedirectCoverage < 90) {
    actions.push({
      severity: "warning",
      area: "checkout_redirect",
      trigger: `checkout_session_created -> checkout_redirected is ${checkoutRedirectCoverage}%.`,
      action: "Review client timeout/redirect failures and confirm checkout URL handoff completes on mobile and desktop.",
    });
  }

  const downloadCompletionRateFromPaid = asFiniteNumber(metrics.downloadCompletionRateFromPaid);
  const paymentVerifiedCount = asFiniteNumber(report.funnelHealth.counts?.payment_verified) ?? 0;
  if (
    downloadCompletionRateFromPaid !== null &&
    downloadCompletionRateFromPaid < 70 &&
    paymentVerifiedCount >= MIN_DOWNLOAD_COMPLETION_SAMPLE
  ) {
    actions.push({
      severity: "warning",
      area: "post_purchase_recovery",
      trigger: `payment_verified -> download_completed is ${downloadCompletionRateFromPaid}% (n=${paymentVerifiedCount}).`,
      action:
        "Check success/download recovery panels and access-link email flow for entitlement or UX friction regressions.",
    });
  } else if (
    downloadCompletionRateFromPaid !== null &&
    downloadCompletionRateFromPaid < 70 &&
    paymentVerifiedCount > 0 &&
    paymentVerifiedCount < MIN_DOWNLOAD_COMPLETION_SAMPLE
  ) {
    actions.push({
      severity: "info",
      area: "post_purchase_recovery_sample",
      trigger: `payment_verified -> download_completed is ${downloadCompletionRateFromPaid}% with low sample (n=${paymentVerifiedCount}).`,
      action: `Monitor until sample reaches at least ${MIN_DOWNLOAD_COMPLETION_SAMPLE} paid sessions before treating as regression.`,
    });
  }

  if (recentWindowDays > 0 && recentCounts) {
    const recentCheckoutStarted = asFiniteNumber(recentCounts.checkout_started) ?? 0;
    const recentPaymentVerified = asFiniteNumber(recentCounts.payment_verified) ?? 0;
    if (recentCheckoutStarted >= 5 && recentPaymentVerified === 0) {
      actions.push({
        severity: "critical",
        area: "recent_conversion_drop",
        trigger: `Recent ${recentWindowDays}d has ${recentCheckoutStarted} checkout starts and 0 payments.`,
        action: "Pause traffic pushes and run live conversion QA immediately (`npm run qa:live-conversion`).",
      });
    }
    if (recentCheckoutStarted >= 5 && stripeRevenuePaidSessionsExcludingQa === 0) {
      actions.push({
        severity: "critical",
        area: "recent_revenue_drop",
        trigger:
          `Recent ${recentWindowDays}d has ${recentCheckoutStarted} checkout starts and ` +
          "0 revenue-positive payments (excluding QA-tagged sessions).",
        action:
          "Pause paid traffic scaling, verify live checkout on mobile/desktop, and inspect offer/pricing friction before relaunch.",
      });
    }
  }

  if (actions.length === 0) {
    actions.push({
      severity: "ok",
      area: "weekly_status",
      trigger: "No threshold breaches detected.",
      action: "Continue standard cadence and monitor next weekly report.",
    });
  }

  return actions;
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
      stripeRevenuePaidSessions: reconcile.stripeRevenuePaidSessions ?? 0,
      stripeRevenuePaidSessionsExcludingQa: reconcile.stripeRevenuePaidSessionsExcludingQa ?? 0,
      stripeNoChargePaidSessions: reconcile.stripeNoChargePaidSessions ?? 0,
      stripeQaTaggedPaidSessions: reconcile.stripeQaTaggedPaidSessions ?? 0,
      stripePaidDigital: reconcile.stripePaidDigital ?? 0,
      stripePaidPrint: reconcile.stripePaidPrint ?? 0,
      stripeRevenuePaidDigital: reconcile.stripeRevenuePaidDigital ?? 0,
      stripeRevenuePaidPrint: reconcile.stripeRevenuePaidPrint ?? 0,
      delta: reconcile.delta ?? 0,
      deltaPct: reconcile.deltaPct ?? 0,
    },
    operatorActions: [],
    strictFailures,
  };
  report.operatorActions = buildOperatorActions(report);

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
      `Paid mix (all): digital=${report.reconcile.stripePaidDigital} print=${report.reconcile.stripePaidPrint}`,
    );
    console.log(
      `Paid mix (revenue): digital=${report.reconcile.stripeRevenuePaidDigital} print=${report.reconcile.stripeRevenuePaidPrint}`,
    );
    console.log(
      `Revenue-paid (excluding QA): ${report.reconcile.stripeRevenuePaidSessionsExcludingQa} ` +
        `| no-charge paid: ${report.reconcile.stripeNoChargePaidSessions} ` +
        `| QA-tagged paid: ${report.reconcile.stripeQaTaggedPaidSessions}`,
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
    if (Array.isArray(report.operatorActions) && report.operatorActions.length > 0) {
      console.log("");
      console.log("Operator actions");
      for (const entry of report.operatorActions) {
        const severity = String(entry.severity || "info").toUpperCase();
        console.log(`- [${severity}] ${entry.area}: ${entry.trigger}`);
        console.log(`  -> ${entry.action}`);
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
