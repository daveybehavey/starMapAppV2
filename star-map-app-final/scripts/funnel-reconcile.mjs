#!/usr/bin/env node

import Stripe from "stripe";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

function parseArgs(argv) {
  const args = {
    site: process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://starmapco.com",
    days: 14,
    json: false,
    repair: false,
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
      args.days = Math.min(60, Math.floor(next));
      i += 1;
      continue;
    }
    if (token === "--json") {
      args.json = true;
      continue;
    }
    if (token === "--repair") {
      args.repair = true;
      continue;
    }
    if (token === "-h" || token === "--help") {
      console.log(`Usage: node scripts/funnel-reconcile.mjs [--site <url>] [--days <n>] [--json] [--repair]

Compares funnel payment_verified count with Stripe paid checkouts in the same time window.

Required env vars:
  STRIPE_SECRET_KEY

Optional env vars:
  FUNNEL_DASHBOARD_TOKEN
  PRINT_ADMIN_TOKEN (required when --repair is used)
`);
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${token}`);
  }

  args.site = args.site.replace(/\/+$/, "");
  return args;
}

function isPaidCheckoutSession(session) {
  const paymentStatus = String(session.payment_status || "");
  return paymentStatus === "paid" || paymentStatus === "no_payment_required";
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

function classifyOrder(session) {
  const metadata = session.metadata || {};
  const rawOrderType = String(metadata.order_type || metadata.orderType || "").toLowerCase();
  if (rawOrderType === "print" || metadata.print_variant || metadata.printVariant) return "print";
  return "digital";
}

async function getFunnelData(site, days) {
  const url = `${site}/api/analytics/funnel?days=${days}`;
  const token = process.env.FUNNEL_DASHBOARD_TOKEN?.trim() || "";
  const res = await fetch(url, {
    headers: token ? { "x-funnel-token": token } : undefined,
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok || !body?.data) {
    throw new Error(`Failed to load funnel dashboard (${res.status})`);
  }
  return body.data;
}

async function getStripePaidSessions(days) {
  const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim() || "";
  if (!stripeSecret) throw new Error("Missing STRIPE_SECRET_KEY");
  const stripe = new Stripe(stripeSecret);
  const createdGte = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
  const sessions = [];
  let startingAfter = undefined;

  while (true) {
    const page = await stripe.checkout.sessions.list({
      limit: 100,
      created: { gte: createdGte },
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    sessions.push(...page.data);
    if (!page.has_more || !page.data.length) break;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  const paid = sessions.filter((session) => isPaidCheckoutSession(session) && belongsToStarMap(session));
  const digital = paid.filter((session) => classifyOrder(session) === "digital").length;
  const print = paid.filter((session) => classifyOrder(session) === "print").length;
  return {
    scanned: sessions.length,
    paid: paid.length,
    digital,
    print,
  };
}

async function repairFunnelData(site, days) {
  const adminToken = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  if (!adminToken) {
    throw new Error("Missing PRINT_ADMIN_TOKEN for --repair");
  }
  const res = await fetch(`${site}/api/analytics/funnel/reconcile`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": adminToken,
    },
    body: JSON.stringify({ days }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    throw new Error(`Failed to repair funnel data (${res.status})`);
  }
  return body;
}

function getFunnelPaymentVerifiedCount(data) {
  if (Array.isArray(data?.rows)) {
    const row = data.rows.find((entry) => entry.step === "payment_verified");
    if (row && typeof row.lastNDays === "number") return row.lastNDays;
  }
  if (Array.isArray(data?.daily)) {
    return data.daily.reduce((sum, day) => sum + (day?.counts?.payment_verified ?? 0), 0);
  }
  return 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let repairReport = null;
  if (args.repair) {
    repairReport = await repairFunnelData(args.site, args.days);
  }

  const [funnelData, stripeData] = await Promise.all([
    getFunnelData(args.site, args.days),
    getStripePaidSessions(args.days),
  ]);

  const funnelPaymentVerified = getFunnelPaymentVerifiedCount(funnelData);
  const delta = stripeData.paid - funnelPaymentVerified;
  const deltaPct = stripeData.paid > 0
    ? Number(((Math.abs(delta) / stripeData.paid) * 100).toFixed(2))
    : 0;

  const report = {
    generatedAt: new Date().toISOString(),
    site: args.site,
    days: args.days,
    repair: repairReport
      ? {
          dryRun: Boolean(repairReport.dryRun),
          scanned: repairReport.scanned ?? 0,
          eligible: repairReport.eligible ?? 0,
          alreadyRecorded: repairReport.alreadyRecorded ?? 0,
          repaired: repairReport.repaired ?? 0,
        }
      : null,
    funnelPaymentVerified,
    stripePaidSessions: stripeData.paid,
    stripePaidDigital: stripeData.digital,
    stripePaidPrint: stripeData.print,
    stripeSessionsScanned: stripeData.scanned,
    delta,
    deltaPct,
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("Funnel vs Stripe reconciliation");
  console.log(`Site: ${report.site}`);
  console.log(`Window: last ${report.days} days`);
  if (report.repair) {
    console.log(
      `Repair: scanned=${report.repair.scanned} eligible=${report.repair.eligible} already_recorded=${report.repair.alreadyRecorded} repaired=${report.repair.repaired}`,
    );
  }
  console.log(`Funnel payment_verified: ${report.funnelPaymentVerified}`);
  console.log(`Stripe paid sessions: ${report.stripePaidSessions} (digital=${report.stripePaidDigital}, print=${report.stripePaidPrint})`);
  console.log(`Stripe sessions scanned: ${report.stripeSessionsScanned}`);
  console.log(`Delta (Stripe - Funnel): ${report.delta} (${report.deltaPct}% absolute variance)`);
}

main().catch((error) => {
  console.error("Funnel reconciliation failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
