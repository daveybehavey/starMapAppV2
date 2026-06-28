#!/usr/bin/env node

import Stripe from "stripe";
import { loadDotenv } from "./load-dotenv.mjs";
import { readWranglerVars } from "./wrangler-vars.mjs";

loadDotenv();

const wranglerVars = await readWranglerVars(process.cwd());
for (const [key, value] of Object.entries(wranglerVars)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

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
      console.log(`Usage: node scripts/checkout-source-diagnostics.mjs [--site <url>] [--days <n>] [--json]

Read-only checkout source diagnostics using Stripe Checkout session metadata plus funnel counters.

Required env:
  STRIPE_SECRET_KEY

Optional env:
  FUNNEL_DASHBOARD_TOKEN
`);
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${token}`);
  }

  args.site = args.site.replace(/\/+$/, "");
  return args;
}

function belongsToStarMap(session) {
  const metadata = session.metadata || {};
  return Boolean(
    metadata.plan ||
      metadata.order_type ||
      metadata.orderType ||
      metadata.print_variant ||
      metadata.printVariant ||
      metadata.map_id ||
      session.client_reference_id,
  );
}

function countBy(items, resolver) {
  const counts = new Map();
  for (const item of items) {
    const key = String(resolver(item) || "unknown");
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, count }));
}

function firstMetadataValue(metadata, keys) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function classifyOrder(session) {
  const metadata = session.metadata || {};
  const raw = firstMetadataValue(metadata, ["order_type", "orderType"]).toLowerCase();
  if (raw === "print" || metadata.print_variant || metadata.printVariant) return "print";
  if (raw === "digital" || metadata.plan) return "digital";
  return "unknown";
}

function getPlan(session) {
  return firstMetadataValue(session.metadata || {}, ["plan"]) || "none";
}

function getPrintVariant(session) {
  return firstMetadataValue(session.metadata || {}, ["print_variant", "printVariant"]) || "none";
}

function getCheckoutSource(session) {
  return firstMetadataValue(session.metadata || {}, ["checkout_source"]) || "unknown_legacy";
}

function classifyMethod(source) {
  if (source.endsWith("_get")) return "GET";
  if (source.endsWith("_post")) return "POST";
  return "unknown";
}

function getSafeContextId(session) {
  const metadata = session.metadata || {};
  return firstMetadataValue(metadata, ["map_id"]) || session.client_reference_id || "";
}

function buildContextKey(session) {
  const metadata = session.metadata || {};
  const contextId = getSafeContextId(session);
  if (!contextId) return null;
  return [
    classifyOrder(session),
    getPlan(session),
    getPrintVariant(session),
    firstMetadataValue(metadata, ["print_include_digital"]) || "none",
    firstMetadataValue(metadata, ["print_shipping_country"]) || "none",
    metadata.promotion_code_id ? "promo" : "no_promo",
    metadata.referral_code ? "referral" : "no_referral",
    contextId,
  ].join("|");
}

function summarizeDuplicateClusters(sessions) {
  const clusters = new Map();
  for (const session of sessions) {
    const key = buildContextKey(session);
    if (!key) continue;
    const current = clusters.get(key);
    if (current) {
      current.count += 1;
      continue;
    }
    clusters.set(key, {
      count: 1,
      orderType: classifyOrder(session),
      plan: getPlan(session),
      printVariant: getPrintVariant(session),
      hasPromo: Boolean(session.metadata?.promotion_code_id),
      hasReferral: Boolean(session.metadata?.referral_code),
      context: "redacted",
    });
  }

  const duplicateClusters = Array.from(clusters.values())
    .filter((cluster) => cluster.count > 1)
    .sort((a, b) => b.count - a.count || a.orderType.localeCompare(b.orderType));

  return {
    uniqueContextCount: clusters.size,
    duplicateClusterCount: duplicateClusters.length,
    duplicateSessionCount: duplicateClusters.reduce((sum, cluster) => sum + cluster.count, 0),
    topDuplicateClusters: duplicateClusters.slice(0, 10),
  };
}

async function loadSessions(stripe, days) {
  const createdGte = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
  const sessions = [];
  let startingAfter;

  while (true) {
    const page = await stripe.checkout.sessions.list({
      limit: 100,
      created: { gte: createdGte },
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    sessions.push(...page.data.filter((session) => belongsToStarMap(session)));
    if (!page.has_more || !page.data.length) break;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  return sessions;
}

async function getFunnelData(site, days) {
  const token = process.env.FUNNEL_DASHBOARD_TOKEN?.trim() || "";
  const res = await fetch(`${site}/api/analytics/funnel?days=${days}`, {
    headers: token ? { "x-funnel-token": token } : undefined,
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok || !body?.data) {
    return { ok: false, error: body?.error || `http_${res.status}` };
  }
  const steps = {};
  for (const row of Array.isArray(body.data.rows) ? body.data.rows : []) {
    if (typeof row?.step === "string") {
      steps[row.step] = Number(row.lastNDays || 0);
    }
  }
  return { ok: true, generatedAt: body.data.generatedAt, steps };
}

function pct(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function buildReport(args, sessions, funnel) {
  const duplicateSummary = summarizeDuplicateClusters(sessions);
  const safeContextIds = new Set(sessions.map(getSafeContextId).filter(Boolean));
  const blankContextCount = sessions.length - safeContextIds.size;
  const paidSessions = sessions.filter(
    (session) => session.payment_status === "paid" || session.payment_status === "no_payment_required",
  );
  const sourceCounts = countBy(sessions, getCheckoutSource);
  const unknownLegacy = sourceCounts.find((row) => row.value === "unknown_legacy")?.count || 0;
  const funnelSessionCreated = funnel.ok ? Number(funnel.steps.checkout_session_created || 0) : null;

  return {
    generatedAt: new Date().toISOString(),
    site: args.site,
    days: args.days,
    stripe: {
      rawCheckoutSessions: sessions.length,
      paidSessions: paidSessions.length,
      unpaidSessions: sessions.length - paidSessions.length,
      uniqueSafeContextIds: safeContextIds.size,
      blankContextCount,
      duplicateClusterCount: duplicateSummary.duplicateClusterCount,
      duplicateSessionCount: duplicateSummary.duplicateSessionCount,
      rawToUniqueContextRatio: pct(sessions.length, safeContextIds.size),
      orderTypes: countBy(sessions, classifyOrder),
      status: countBy(sessions, (session) => session.status),
      paymentStatus: countBy(sessions, (session) => session.payment_status),
      checkoutSources: sourceCounts,
      methods: countBy(sessions, (session) => classifyMethod(getCheckoutSource(session))),
      plans: countBy(sessions, getPlan),
      printVariants: countBy(sessions, getPrintVariant),
      shippingCountries: countBy(
        sessions,
        (session) => firstMetadataValue(session.metadata || {}, ["print_shipping_country"]) || "none",
      ),
      topHoursUtc: countBy(
        sessions,
        (session) => `${new Date(session.created * 1000).toISOString().slice(0, 13)}:00Z`,
      ).slice(0, 10),
      topDuplicateClusters: duplicateSummary.topDuplicateClusters,
    },
    funnel: funnel.ok
      ? {
          generatedAt: funnel.generatedAt,
          checkoutStarted: Number(funnel.steps.checkout_started || 0),
          checkoutRequestReceived: Number(funnel.steps.checkout_request_received || 0),
          checkoutSessionCreated: funnelSessionCreated,
          paymentVerified: Number(funnel.steps.payment_verified || 0),
          stripeSessionCoveragePct: pct(sessions.length, funnelSessionCreated),
        }
      : { error: funnel.error },
    interpretation: {
      sourceQuality:
        unknownLegacy === sessions.length
          ? "blocked_for_historical_source_breakdown"
          : unknownLegacy > 0
            ? "partial_source_breakdown"
            : "source_breakdown_available",
      duplicateSignal:
        duplicateSummary.duplicateClusterCount === 0
          ? "no_duplicate_context_clusters_detected"
          : "duplicate_context_clusters_detected",
      buyerAttemptSignal:
        sessions.length > 0 && safeContextIds.size === sessions.length
          ? "raw_sessions_match_unique_safe_contexts"
          : "raw_sessions_do_not_match_unique_safe_contexts",
    },
  };
}

function printBucket(label, rows, limit = 8) {
  console.log(label);
  if (!rows.length) {
    console.log("  none");
    return;
  }
  for (const row of rows.slice(0, limit)) {
    console.log(`  ${row.value}: ${row.count}`);
  }
}

function printHuman(report) {
  console.log("Checkout source diagnostics");
  console.log(`Site: ${report.site}`);
  console.log(`Window: last ${report.days} days`);
  console.log("");
  console.log("Summary");
  console.log(`  raw Stripe Checkout sessions: ${report.stripe.rawCheckoutSessions}`);
  console.log(`  unique safe context ids: ${report.stripe.uniqueSafeContextIds}`);
  console.log(`  blank safe context ids: ${report.stripe.blankContextCount}`);
  console.log(`  duplicate context clusters: ${report.stripe.duplicateClusterCount}`);
  console.log(`  paid sessions: ${report.stripe.paidSessions}`);
  console.log(`  unpaid sessions: ${report.stripe.unpaidSessions}`);
  if (report.funnel.error) {
    console.log(`  funnel: unavailable (${report.funnel.error})`);
  } else {
    console.log(`  funnel checkout_started: ${report.funnel.checkoutStarted}`);
    console.log(`  funnel checkout_request_received: ${report.funnel.checkoutRequestReceived}`);
    console.log(`  funnel checkout_session_created: ${report.funnel.checkoutSessionCreated}`);
    console.log(`  funnel payment_verified: ${report.funnel.paymentVerified}`);
    console.log(`  Stripe sessions / funnel sessions: ${report.funnel.stripeSessionCoveragePct ?? "n/a"}%`);
  }
  console.log("");
  printBucket("Order types", report.stripe.orderTypes);
  printBucket("Checkout sources", report.stripe.checkoutSources);
  printBucket("Methods", report.stripe.methods);
  printBucket("Stripe session status", report.stripe.status);
  printBucket("Payment status", report.stripe.paymentStatus);
  printBucket("Plans", report.stripe.plans);
  printBucket("Print variants", report.stripe.printVariants);
  printBucket("Top UTC hours", report.stripe.topHoursUtc, 10);
  console.log("");
  console.log("Interpretation");
  console.log(`  source quality: ${report.interpretation.sourceQuality}`);
  console.log(`  duplicate signal: ${report.interpretation.duplicateSignal}`);
  console.log(`  buyer-attempt signal: ${report.interpretation.buyerAttemptSignal}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim() || "";
  if (!stripeSecret) throw new Error("Missing STRIPE_SECRET_KEY");
  const stripe = new Stripe(stripeSecret);
  const [sessions, funnel] = await Promise.all([loadSessions(stripe, args.days), getFunnelData(args.site, args.days)]);
  const report = buildReport(args, sessions, funnel);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  printHuman(report);
}

main().catch((error) => {
  console.error("checkout-source-diagnostics failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
