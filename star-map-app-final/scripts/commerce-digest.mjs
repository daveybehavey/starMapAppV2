#!/usr/bin/env node

import Stripe from "stripe";
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

function parseArgs(argv) {
  const args = {
    site: process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://starmapco.com",
    days: 7,
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
      console.log(`Usage: node scripts/commerce-digest.mjs [--site <url>] [--days <n>] [--json]

One operator-facing report for:
  - funnel step totals
  - Stripe paid revenue split
  - print order states + missing operator alerts
  - referral-attributed paid sessions

Required env vars:
  STRIPE_SECRET_KEY

Optional env vars:
  FUNNEL_DASHBOARD_TOKEN
  PRINT_ADMIN_TOKEN
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

function isPaidCheckoutSession(session) {
  const paymentStatus = String(session.payment_status || "");
  return paymentStatus === "paid" || paymentStatus === "no_payment_required";
}

function classifyOrder(session) {
  const metadata = session.metadata || {};
  const rawOrderType = String(metadata.order_type || metadata.orderType || "").toLowerCase();
  if (rawOrderType === "print" || metadata.print_variant || metadata.printVariant) return "print";
  return "digital";
}

function getPlan(session) {
  const metadata = session.metadata || {};
  const raw = String(metadata.plan || "").trim().toLowerCase();
  return raw || "single";
}

function getPrintVariant(session) {
  const metadata = session.metadata || {};
  const raw = String(metadata.print_variant || metadata.printVariant || "").trim().toLowerCase();
  return raw || "poster_unframed";
}

function getReferralSource(session) {
  const metadata = session.metadata || {};
  const source = String(metadata.referral_source || "").trim().toLowerCase();
  return source || "";
}

function formatMoney(cents, currency) {
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

function incrementBucket(map, key, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

function topBuckets(map, labelKey) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ [labelKey]: name, count }));
}

async function getFunnelData(site, days) {
  const token = process.env.FUNNEL_DASHBOARD_TOKEN?.trim() || "";
  const res = await fetch(`${site}/api/analytics/funnel?days=${days}`, {
    headers: token ? { "x-funnel-token": token } : undefined,
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok || !body?.data) {
    return { ok: false, error: `funnel_${res.status}` };
  }

  const steps = {};
  if (Array.isArray(body.data.rows)) {
    for (const row of body.data.rows) {
      if (typeof row?.step === "string" && typeof row?.lastNDays === "number") {
        steps[row.step] = row.lastNDays;
      }
    }
  }

  return { ok: true, steps };
}

async function loadSessions(days) {
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
    sessions.push(...page.data.filter((session) => belongsToStarMap(session)));
    if (!page.has_more || !page.data.length) break;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  return sessions;
}

async function getPrintStatus(site, sessionId, adminToken) {
  const res = await fetch(`${site}/api/print/orders/status?session_id=${encodeURIComponent(sessionId)}`, {
    headers: {
      accept: "application/json",
      "x-print-admin-token": adminToken,
    },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (res.status === 404) return { ok: false, status: "missing" };
  if (!res.ok || !body?.ok) return { ok: false, status: "error", error: body?.error || `http_${res.status}` };
  return { ok: true, order: body.order || null };
}

async function buildReport(args) {
  const [funnel, sessions] = await Promise.all([
    getFunnelData(args.site, args.days),
    loadSessions(args.days),
  ]);

  const paidSessions = sessions.filter((session) => isPaidCheckoutSession(session));
  const digitalPaid = paidSessions.filter((session) => classifyOrder(session) === "digital");
  const printPaid = paidSessions.filter((session) => classifyOrder(session) === "print");

  const digitalPlanCounts = new Map();
  const printVariantCounts = new Map();
  const referralSourceCounts = new Map();

  let digitalRevenueCents = 0;
  let printRevenueCents = 0;

  for (const session of digitalPaid) {
    incrementBucket(digitalPlanCounts, getPlan(session));
    digitalRevenueCents += Number(session.amount_total || 0);
    const referralSource = getReferralSource(session);
    if (referralSource) incrementBucket(referralSourceCounts, referralSource);
  }

  for (const session of printPaid) {
    incrementBucket(printVariantCounts, getPrintVariant(session));
    printRevenueCents += Number(session.amount_total || 0);
    const referralSource = getReferralSource(session);
    if (referralSource) incrementBucket(referralSourceCounts, referralSource);
  }

  const adminToken = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  const printOps = {
    available: Boolean(adminToken),
    sent: 0,
    pending: 0,
    failed: 0,
    missing: 0,
    error: 0,
    missingApprovalAlerts: 0,
    missingFailureAlerts: 0,
  };

  if (adminToken && printPaid.length) {
    for (const session of printPaid) {
      const status = await getPrintStatus(args.site, session.id, adminToken);
      if (!status.ok) {
        if (status.status === "missing") printOps.missing += 1;
        else printOps.error += 1;
        continue;
      }

      const order = status.order || {};
      const recordStatus = String(order.status || "unknown");
      if (recordStatus === "sent") {
        printOps.sent += 1;
        if (!order.operatorAlertedAt) printOps.missingApprovalAlerts += 1;
        continue;
      }
      if (recordStatus === "pending") {
        printOps.pending += 1;
        continue;
      }
      if (recordStatus === "failed") {
        printOps.failed += 1;
        if (!order.operatorFailureAlertedAt) printOps.missingFailureAlerts += 1;
        continue;
      }
      printOps.error += 1;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    site: args.site,
    days: args.days,
    funnel: funnel.ok ? funnel.steps : null,
    funnelError: funnel.ok ? null : funnel.error,
    stripe: {
      sessionsScanned: sessions.length,
      paidSessions: paidSessions.length,
      digitalPaidSessions: digitalPaid.length,
      printPaidSessions: printPaid.length,
      digitalRevenueCents,
      printRevenueCents,
      totalRevenueCents: digitalRevenueCents + printRevenueCents,
      currency: "usd",
      digitalPlanCounts: topBuckets(digitalPlanCounts, "plan"),
      printVariantCounts: topBuckets(printVariantCounts, "variant"),
      referralPaidSources: topBuckets(referralSourceCounts, "source"),
    },
    printOps,
  };
}

function printHumanReport(report) {
  console.log("Commerce digest");
  console.log(`Site: ${report.site}`);
  console.log(`Window: last ${report.days} days`);
  console.log("");

  console.log("Revenue");
  console.log(`Paid sessions: ${report.stripe.paidSessions}`);
  console.log(
    `Revenue: ${formatMoney(report.stripe.totalRevenueCents, report.stripe.currency)} ` +
      `(digital ${formatMoney(report.stripe.digitalRevenueCents, report.stripe.currency)}, ` +
      `print ${formatMoney(report.stripe.printRevenueCents, report.stripe.currency)})`,
  );
  console.log(
    `Mix: digital=${report.stripe.digitalPaidSessions} print=${report.stripe.printPaidSessions} scanned=${report.stripe.sessionsScanned}`,
  );

  console.log("");
  console.log("Top digital plans");
  if (!report.stripe.digitalPlanCounts.length) {
    console.log("none");
  } else {
    for (const item of report.stripe.digitalPlanCounts) {
      console.log(`${item.plan}: ${item.count}`);
    }
  }

  console.log("");
  console.log("Top print variants");
  if (!report.stripe.printVariantCounts.length) {
    console.log("none");
  } else {
    for (const item of report.stripe.printVariantCounts) {
      console.log(`${item.variant}: ${item.count}`);
    }
  }

  console.log("");
  console.log("Paid referral sources");
  if (!report.stripe.referralPaidSources.length) {
    console.log("none");
  } else {
    for (const item of report.stripe.referralPaidSources.slice(0, 8)) {
      console.log(`${item.source}: ${item.count}`);
    }
  }

  console.log("");
  console.log("Funnel");
  if (!report.funnel) {
    console.log(`unavailable (${report.funnelError || "unknown"})`);
  } else {
    const stepOrder = [
      "landing_view",
      "preview_started",
      "checkout_started",
      "checkout_session_created",
      "payment_verified",
    ];
    for (const step of stepOrder) {
      console.log(`${step}: ${Number(report.funnel[step] || 0)}`);
    }
  }

  console.log("");
  console.log("Print ops");
  if (!report.printOps.available) {
    console.log("admin token not configured");
  } else {
    console.log(
      `sent=${report.printOps.sent} pending=${report.printOps.pending} failed=${report.printOps.failed} ` +
        `missing=${report.printOps.missing} error=${report.printOps.error}`,
    );
    console.log(
      `missing approval alerts=${report.printOps.missingApprovalAlerts} missing failure alerts=${report.printOps.missingFailureAlerts}`,
    );
  }
}

const args = parseArgs(process.argv.slice(2));

buildReport(args)
  .then((report) => {
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    printHumanReport(report);
  })
  .catch((error) => {
    console.error("Commerce digest failed.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
