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

function formatMoney(cents, currency = "usd") {
  if (!Number.isFinite(cents)) return "0";
  const code = String(currency || "usd").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}

function buildScorecard(digest) {
  const paidSessionsAll = Number(digest?.stripe?.paidSessions || 0);
  const paidSessionsRevenue = Number(digest?.stripe?.revenuePaidSessions || paidSessionsAll);
  const paidSessions = Number(digest?.stripe?.revenuePaidSessionsExcludingQa || paidSessionsRevenue);
  const printPaidSessionsAll = Number(digest?.stripe?.printPaidSessions || 0);
  const printPaidSessionsRevenue = Number(digest?.stripe?.printRevenuePaidSessions || printPaidSessionsAll);
  const noChargePaidSessions = Number(digest?.stripe?.noChargePaidSessions || 0);
  const qaTaggedPaidSessions = Number(digest?.stripe?.qaTaggedPaidSessions || 0);
  const referralPaidSessions = Array.isArray(digest?.stripe?.referralPaidSources)
    ? digest.stripe.referralPaidSources.reduce((sum, row) => sum + Number(row?.count || 0), 0)
    : 0;
  const topReferralOfferVariant = Array.isArray(digest?.stripe?.referralOfferVariants)
    ? digest.stripe.referralOfferVariants
        .slice()
        .sort((a, b) => Number(b?.count || 0) - Number(a?.count || 0))[0] || null
    : null;
  const landingViews = Number(digest?.funnel?.landing_view || 0);
  const previewStarted = Number(digest?.funnel?.preview_started || 0);
  const checkoutStarted = Number(digest?.funnel?.checkout_started || 0);
  const paymentVerified = Number(digest?.funnel?.payment_verified || 0);
  const activeSubscribers = Number(digest?.promotionSubscribers?.active || 0);
  const unsubscribedSubscribers = Number(digest?.promotionSubscribers?.unsubscribed || 0);
  const totalSubscribers = Number(digest?.promotionSubscribers?.total || 0);
  const lifecycle = digest?.promotionSubscribers?.lifecycle || null;
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
        paidSessionsAll,
        paidSessionsRevenue,
        noChargePaidSessions,
        qaTaggedPaidSessions,
        referralShareOfPaidPct: Number(percent(referralPaidSessions, paidSessions).toFixed(2)),
        topOfferVariant:
          topReferralOfferVariant && Number(topReferralOfferVariant.count || 0) > 0
            ? {
                variant: String(topReferralOfferVariant.variant || "unknown"),
                count: Number(topReferralOfferVariant.count || 0),
              }
            : null,
      },
      proofTrust: {
        proofRequestOpportunities: printPaidSessionsRevenue,
        printPaidSessionsAll,
        printPaidSessionsRevenue,
        note: "Automated published-proof counts are not instrumented yet; use manual publishing queue totals weekly.",
      },
      promoLifecycle: {
        activeSubscribers,
        unsubscribedSubscribers,
        totalSubscribers,
        topSources: Array.isArray(digest?.promotionSubscribers?.sources)
          ? digest.promotionSubscribers.sources.slice(0, 5).map((row) => ({
              source: String(row?.source || "unknown"),
              active: Number(row?.active || 0),
              total: Number(row?.total || 0),
            }))
          : [],
        welcomeSent: Number(lifecycle?.welcomeSent || 0),
        followupPending: Number(lifecycle?.pending || 0),
        followupDueNow: Number(lifecycle?.dueNow || 0),
        queuedObjection: Number(lifecycle?.queuedByStep?.objection || 0),
        queuedUrgency: Number(lifecycle?.queuedByStep?.urgency || 0),
        dueObjection: Number(lifecycle?.dueByStep?.objection || 0),
        dueUrgency: Number(lifecycle?.dueByStep?.urgency || 0),
        sentObjection: Number(lifecycle?.sentByStep?.objection || 0),
        sentUrgency: Number(lifecycle?.sentByStep?.urgency || 0),
        completed: Number(lifecycle?.completed || 0),
        legacyFollowupSent: Number(lifecycle?.legacyFollowupSent || 0),
        checkoutStarted,
        promoAppliedSessions: Number(digest?.stripe?.promotions?.appliedSessions || 0),
        promoRevenuePaidSessions: Number(digest?.stripe?.promotions?.revenuePaidSessions || 0),
        promoRevenueCents: Number(digest?.stripe?.promotions?.revenueCents || 0),
        topCheckoutPromotions: Array.isArray(digest?.stripe?.promotions?.topCodes)
          ? digest.stripe.promotions.topCodes.slice(0, 5).map((row) => ({
              label: String(row?.label || "unknown"),
              source: String(row?.source || "unknown"),
              orderType: String(row?.orderType || "digital"),
              sessions: Number(row?.sessions || 0),
              revenuePaidSessions: Number(row?.revenuePaidSessions || 0),
            }))
          : [],
        paidSessions,
        paidSessionsAll,
        paidSessionsRevenue,
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
  console.log(
    `Paid sessions (revenue-positive, ex QA): ${scorecard.loops.referralShare.paidSessions}` +
      ` | revenue-paid all: ${scorecard.loops.referralShare.paidSessionsRevenue}` +
      ` | paid all: ${scorecard.loops.referralShare.paidSessionsAll}`,
  );
  if (
    scorecard.loops.referralShare.noChargePaidSessions > 0 ||
    scorecard.loops.referralShare.qaTaggedPaidSessions > 0
  ) {
    console.log(
      `No-charge paid: ${scorecard.loops.referralShare.noChargePaidSessions} | ` +
        `QA-tagged paid: ${scorecard.loops.referralShare.qaTaggedPaidSessions}`,
    );
  }
  console.log(
    `Referral share of paid sessions (revenue-positive, ex QA): ${scorecard.loops.referralShare.referralShareOfPaidPct.toFixed(2)}%`,
  );
  if (scorecard.loops.referralShare.topOfferVariant) {
    console.log(
      `Top paid offer variant: ${scorecard.loops.referralShare.topOfferVariant.variant} (${scorecard.loops.referralShare.topOfferVariant.count})`,
    );
  }
  console.log("");

  console.log("Loop 2 · Proof trust");
  console.log(
    `Proof request opportunities (revenue-positive print sessions): ${scorecard.loops.proofTrust.proofRequestOpportunities}`,
  );
  console.log(
    `Print paid sessions (all): ${scorecard.loops.proofTrust.printPaidSessionsAll} | ` +
      `revenue-paid: ${scorecard.loops.proofTrust.printPaidSessionsRevenue}`,
  );
  console.log(scorecard.loops.proofTrust.note);
  console.log("");

  console.log("Loop 3 · Promo lifecycle");
  console.log(`Active subscribers: ${scorecard.loops.promoLifecycle.activeSubscribers}`);
  console.log(`Unsubscribed: ${scorecard.loops.promoLifecycle.unsubscribedSubscribers}`);
  if (scorecard.loops.promoLifecycle.topSources.length > 0) {
    console.log(
      `Top sources: ${scorecard.loops.promoLifecycle.topSources
        .map((row) => `${row.source} (${row.active}/${row.total})`)
        .join(" | ")}`,
    );
  }
  console.log(
    `Welcome sent: ${scorecard.loops.promoLifecycle.welcomeSent} | ` +
      `pending: ${scorecard.loops.promoLifecycle.followupPending} | ` +
      `due now: ${scorecard.loops.promoLifecycle.followupDueNow} | ` +
      `completed: ${scorecard.loops.promoLifecycle.completed}`,
  );
  console.log(
    `Queued by step: objection=${scorecard.loops.promoLifecycle.queuedObjection} ` +
      `urgency=${scorecard.loops.promoLifecycle.queuedUrgency}`,
  );
  console.log(
    `Sent by step: objection=${scorecard.loops.promoLifecycle.sentObjection} ` +
      `urgency=${scorecard.loops.promoLifecycle.sentUrgency} ` +
      `legacy=${scorecard.loops.promoLifecycle.legacyFollowupSent}`,
  );
  console.log(
    `Due now by step: objection=${scorecard.loops.promoLifecycle.dueObjection} ` +
      `urgency=${scorecard.loops.promoLifecycle.dueUrgency}`,
  );
  console.log(
    `Paid sessions (revenue-positive, ex QA): ${scorecard.loops.promoLifecycle.paidSessions}` +
      ` | revenue-paid all: ${scorecard.loops.promoLifecycle.paidSessionsRevenue}` +
      ` | paid all: ${scorecard.loops.promoLifecycle.paidSessionsAll}`,
  );
  if (scorecard.loops.promoLifecycle.topCheckoutPromotions.length > 0) {
    console.log(
      `Top checkout promos: ${scorecard.loops.promoLifecycle.topCheckoutPromotions
        .map((row) => `${row.label} (${row.revenuePaidSessions}/${row.sessions})`)
        .join(" | ")}`,
    );
    console.log(
      `Promo-attributed sessions: ${scorecard.loops.promoLifecycle.promoAppliedSessions}` +
        ` | revenue-paid: ${scorecard.loops.promoLifecycle.promoRevenuePaidSessions}` +
        ` | revenue: ${formatMoney(scorecard.loops.promoLifecycle.promoRevenueCents)}`,
    );
  }
  console.log(
    `Subscriber -> paid proxy (revenue-positive, ex QA): ${scorecard.loops.promoLifecycle.paidPerActiveSubscriberPct.toFixed(2)}%`,
  );
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
