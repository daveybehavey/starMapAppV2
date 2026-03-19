#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    site: process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://starmapco.com",
    days: 14,
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
    if (token === "--days") {
      const next = Number(argv[i + 1]);
      if (!Number.isFinite(next) || next <= 0) throw new Error("--days must be a positive number");
      args.days = Math.min(90, Math.floor(next));
      i += 1;
      continue;
    }
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "-h" || token === "--help") {
      console.log(`Usage: node scripts/loop-scorecard.mjs [--site <url>] [--days <n>] [--json]

Builds a weekly loop-marketing scorecard from commerce digest data.
Required env vars are the same as scripts/commerce-digest.mjs (e.g. STRIPE_SECRET_KEY).`);
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${token}`);
  }

  args.site = args.site.replace(/\/+$/, "");
  return args;
}

function percent(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

function toRate(numerator, denominator) {
  return `${percent(numerator, denominator).toFixed(2)}% (${numerator}/${denominator})`;
}

function buildScorecard(digest) {
  const paidSessions = Number(digest?.stripe?.paidSessions || 0);
  const printPaidSessions = Number(digest?.stripe?.printPaidSessions || 0);
  const referralPaidSessions = Array.isArray(digest?.stripe?.referralPaidSources)
    ? digest.stripe.referralPaidSources.reduce((sum, row) => sum + Number(row?.count || 0), 0)
    : 0;
  const landingViews = Number(digest?.funnel?.landing_view || 0);
  const previewStarted = Number(digest?.funnel?.preview_started || 0);
  const checkoutStarted = Number(digest?.funnel?.checkout_started || 0);
  const paymentVerified = Number(digest?.funnel?.payment_verified || 0);
  const activeSubscribers = Number(digest?.promotionSubscribers?.active || 0);
  const unsubscribedSubscribers = Number(digest?.promotionSubscribers?.unsubscribed || 0);
  const totalSubscribers = Number(digest?.promotionSubscribers?.total || 0);
  const clientBlockers = Array.isArray(digest?.checkoutDiagnostics)
    ? digest.checkoutDiagnostics.filter((row) => String(row?.reason || "").startsWith("client_"))
    : [];
  const topClientBlocker =
    clientBlockers.length > 0
      ? clientBlockers
          .slice()
          .sort((a, b) => Number(b?.lastNDays || 0) - Number(a?.lastNDays || 0))[0]
      : null;

  return {
    generatedAt: new Date().toISOString(),
    site: digest.site,
    days: digest.days,
    loops: {
      referralShare: {
        paidReferralSessions: referralPaidSessions,
        paidSessions,
        referralShareOfPaidPct: Number(percent(referralPaidSessions, paidSessions).toFixed(2)),
      },
      proofTrust: {
        proofRequestOpportunities: printPaidSessions,
        note: "Automated published-proof counts are not instrumented yet; use manual publishing queue totals weekly.",
      },
      promoLifecycle: {
        activeSubscribers,
        unsubscribedSubscribers,
        totalSubscribers,
        checkoutStarted,
        paidSessions,
        paidPerActiveSubscriberPct: Number(percent(paidSessions, activeSubscribers).toFixed(2)),
      },
    },
    funnel: {
      landingViews,
      previewStarted,
      checkoutStarted,
      paymentVerified,
      previewRate: Number(percent(previewStarted, landingViews).toFixed(2)),
      checkoutRate: Number(percent(checkoutStarted, previewStarted).toFixed(2)),
      paidRateFromCheckout: Number(percent(paymentVerified, checkoutStarted).toFixed(2)),
    },
    diagnostics: {
      topClientBlocker:
        topClientBlocker && Number(topClientBlocker.lastNDays || 0) > 0
          ? {
              reason: String(topClientBlocker.reason),
              count: Number(topClientBlocker.lastNDays || 0),
            }
          : null,
    },
  };
}

function printHumanScorecard(scorecard) {
  console.log("Loop scorecard");
  console.log(`Site: ${scorecard.site}`);
  console.log(`Window: last ${scorecard.days} days`);
  console.log("");

  console.log("Loop 1 · Referral share");
  console.log(`Paid referral sessions: ${scorecard.loops.referralShare.paidReferralSessions}`);
  console.log(`Referral share of paid sessions: ${scorecard.loops.referralShare.referralShareOfPaidPct.toFixed(2)}%`);
  console.log("");

  console.log("Loop 2 · Proof trust");
  console.log(`Proof request opportunities (paid print sessions): ${scorecard.loops.proofTrust.proofRequestOpportunities}`);
  console.log(scorecard.loops.proofTrust.note);
  console.log("");

  console.log("Loop 3 · Promo lifecycle");
  console.log(`Active subscribers: ${scorecard.loops.promoLifecycle.activeSubscribers}`);
  console.log(`Unsubscribed: ${scorecard.loops.promoLifecycle.unsubscribedSubscribers}`);
  console.log(`Subscriber -> paid proxy: ${scorecard.loops.promoLifecycle.paidPerActiveSubscriberPct.toFixed(2)}%`);
  console.log("");

  console.log("Funnel snapshot");
  console.log(`landing -> preview: ${toRate(scorecard.funnel.previewStarted, scorecard.funnel.landingViews)}`);
  console.log(`preview -> checkout: ${toRate(scorecard.funnel.checkoutStarted, scorecard.funnel.previewStarted)}`);
  console.log(`checkout -> paid: ${toRate(scorecard.funnel.paymentVerified, scorecard.funnel.checkoutStarted)}`);
  if (scorecard.diagnostics.topClientBlocker) {
    console.log("");
    console.log(
      `Top client checkout blocker: ${scorecard.diagnostics.topClientBlocker.reason} (${scorecard.diagnostics.topClientBlocker.count})`,
    );
  }
}

function runCommerceDigest(args) {
  const scriptPath = path.join(process.cwd(), "scripts", "commerce-digest.mjs");
  const commandArgs = [scriptPath, "--site", args.site, "--days", String(args.days), "--json"];
  const result = spawnSync("node", commandArgs, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `commerce-digest exited with code ${String(result.status)}`);
  }
  const parsed = JSON.parse(result.stdout);
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const digest = runCommerceDigest(args);
  const scorecard = buildScorecard(digest);

  if (args.json) {
    console.log(JSON.stringify(scorecard, null, 2));
    return;
  }
  printHumanScorecard(scorecard);
}

main().catch((error) => {
  console.error(`loop-scorecard failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
