#!/usr/bin/env node

import Stripe from "stripe";
import { loadDotenv } from "./load-dotenv.mjs";
import { readWranglerVars } from "./wrangler-vars.mjs";
import { isQaStripeSession } from "../src/lib/commerceAnalyticsQa.mjs";

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
  - checkout failure reasons
  - Stripe paid revenue split
  - print order states + missing operator alerts
  - referral-attributed paid sessions
  - promo signup totals

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

function getReferralOfferVariant(session) {
  const metadata = session.metadata || {};
  const variant = String(metadata.referral_offer_variant || "").trim().toLowerCase();
  return variant || "";
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

function normalizeToken(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function classifyResolvedPaymentMethod(paymentIntent) {
  if (!paymentIntent || typeof paymentIntent !== "object") return "unknown";
  const paymentMethod = paymentIntent.payment_method;
  if (!paymentMethod || typeof paymentMethod === "string") return "unknown";

  const paymentMethodType = normalizeToken(paymentMethod.type);
  if (paymentMethodType === "card") {
    const walletType = normalizeToken(paymentMethod.card?.wallet?.type);
    if (walletType === "apple_pay") return "apple_pay";
    if (walletType === "google_pay") return "google_pay";
    if (walletType === "link") return "link";
    if (walletType) return `wallet_${walletType}`;
    return "card";
  }

  if (paymentMethodType === "link") return "link";
  if (!paymentMethodType) return "unknown";
  return paymentMethodType;
}

async function resolvePaidSessionPaymentMethods(stripe, paidSessions) {
  const intentCache = new Map();
  const bySessionId = new Map();
  const totals = new Map();

  for (const session of paidSessions) {
    const sessionId = typeof session.id === "string" ? session.id : "";
    if (!sessionId) continue;

    const paymentStatus = String(session.payment_status || "");
    const paymentIntentRef = session.payment_intent;
    const paymentIntentId =
      typeof paymentIntentRef === "string"
        ? paymentIntentRef
        : typeof paymentIntentRef?.id === "string"
          ? paymentIntentRef.id
          : "";

    if (paymentStatus === "no_payment_required" || (!paymentIntentId && Number(session.amount_total || 0) <= 0)) {
      const method = "no_payment_required";
      bySessionId.set(sessionId, method);
      incrementBucket(totals, method);
      continue;
    }

    if (!paymentIntentId) {
      const method = "unknown";
      bySessionId.set(sessionId, method);
      incrementBucket(totals, method);
      continue;
    }

    let paymentIntent = intentCache.get(paymentIntentId);
    if (!paymentIntent) {
      try {
        paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
          expand: ["payment_method"],
        });
        intentCache.set(paymentIntentId, paymentIntent);
      } catch {
        const method = "lookup_failed";
        bySessionId.set(sessionId, method);
        incrementBucket(totals, method);
        continue;
      }
    }

    const method = classifyResolvedPaymentMethod(paymentIntent);
    bySessionId.set(sessionId, method);
    incrementBucket(totals, method);
  }

  return { bySessionId, totals };
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

async function getCheckoutDiagnostics(site, days) {
  const adminToken = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  if (!adminToken) {
    return { ok: false, error: "admin_token_missing" };
  }
  const res = await fetch(`${site}/api/analytics/checkout-diagnostics?days=${days}`, {
    headers: { "x-admin-token": adminToken },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok || !body?.data) {
    return { ok: false, error: `checkout_diagnostics_${res.status}` };
  }
  return { ok: true, rows: Array.isArray(body.data.rows) ? body.data.rows : [] };
}

function aggregatePromoCaptureSources(subscribers) {
  const activeRows = subscribers.filter((row) => !row.unsubscribedAt);
  const counts = new Map();
  for (const row of activeRows) {
    const raw = row.lastSource;
    const src = typeof raw === "string" && raw.trim() ? raw.trim() : "unknown";
    counts.set(src, (counts.get(src) || 0) + 1);
  }
  const captureSources = [...counts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
  return { captureSources, topCaptureSource: captureSources[0] || null };
}

async function getPromotionSubscribers(site) {
  const adminToken = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  if (!adminToken) {
    return { ok: false, error: "admin_token_missing" };
  }
  const res = await fetch(`${site}/api/promotions/subscribers?limit=500&include_unsubscribed=true`, {
    headers: { "x-admin-token": adminToken },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok || !Array.isArray(body?.subscribers)) {
    return { ok: false, error: `promotion_subscribers_${res.status}` };
  }
  const subscribers = body.subscribers;
  const { captureSources, topCaptureSource } = aggregatePromoCaptureSources(subscribers);
  return {
    ok: true,
    total: subscribers.length,
    active: subscribers.filter((row) => !row.unsubscribedAt).length,
    unsubscribed: subscribers.filter((row) => row.unsubscribedAt).length,
    listComplete: Boolean(body.listComplete),
    nextCursor: body.nextCursor ?? null,
    captureSources,
    topCaptureSource,
  };
}

async function loadSessions(stripe, days) {
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
  const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim() || "";
  if (!stripeSecret) throw new Error("Missing STRIPE_SECRET_KEY");
  const stripe = new Stripe(stripeSecret);

  const [funnel, checkoutDiagnostics, promotionSubscribers, sessions] = await Promise.all([
    getFunnelData(args.site, args.days),
    getCheckoutDiagnostics(args.site, args.days),
    getPromotionSubscribers(args.site),
    loadSessions(stripe, args.days),
  ]);

  const paidSessions = sessions.filter((session) => isPaidCheckoutSession(session));
  const realPaidSessions = paidSessions.filter((session) => Number(session.amount_total || 0) > 0);
  const qaPaidSessions = realPaidSessions.filter((session) => isQaStripeSession(session));
  const productionPaidSessions = realPaidSessions.filter((session) => !isQaStripeSession(session));
  const zeroPaidSessions = paidSessions.length - realPaidSessions.length;
  const digitalPaid = paidSessions.filter((session) => classifyOrder(session) === "digital");
  const printSessions = sessions.filter((session) => classifyOrder(session) === "print");
  const printPaid = printSessions.filter((session) => isPaidCheckoutSession(session));
  const printUnpaidSessions = printSessions.length - printPaid.length;
  const paymentMethodMix = await resolvePaidSessionPaymentMethods(stripe, paidSessions);

  const digitalPlanCounts = new Map();
  const printVariantCounts = new Map();
  const referralSourceCounts = new Map();
  const referralOfferVariantCounts = new Map();
  const paidPaymentMethodCounts = new Map();
  const digitalPaymentMethodCounts = new Map();
  const printPaymentMethodCounts = new Map();

  let digitalRevenueCents = 0;
  let printRevenueCents = 0;

  for (const session of digitalPaid) {
    incrementBucket(digitalPlanCounts, getPlan(session));
    const paymentMethod = paymentMethodMix.bySessionId.get(session.id);
    if (paymentMethod) {
      incrementBucket(paidPaymentMethodCounts, paymentMethod);
      incrementBucket(digitalPaymentMethodCounts, paymentMethod);
    }
    digitalRevenueCents += Number(session.amount_total || 0);
    const referralSource = getReferralSource(session);
    if (referralSource) incrementBucket(referralSourceCounts, referralSource);
    const referralOfferVariant = getReferralOfferVariant(session);
    if (referralOfferVariant) incrementBucket(referralOfferVariantCounts, referralOfferVariant);
  }

  for (const session of printPaid) {
    incrementBucket(printVariantCounts, getPrintVariant(session));
    const paymentMethod = paymentMethodMix.bySessionId.get(session.id);
    if (paymentMethod) {
      incrementBucket(paidPaymentMethodCounts, paymentMethod);
      incrementBucket(printPaymentMethodCounts, paymentMethod);
    }
    printRevenueCents += Number(session.amount_total || 0);
    const referralSource = getReferralSource(session);
    if (referralSource) incrementBucket(referralSourceCounts, referralSource);
    const referralOfferVariant = getReferralOfferVariant(session);
    if (referralOfferVariant) incrementBucket(referralOfferVariantCounts, referralOfferVariant);
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
    checkoutDiagnostics: checkoutDiagnostics.ok ? checkoutDiagnostics.rows : null,
    checkoutDiagnosticsError: checkoutDiagnostics.ok ? null : checkoutDiagnostics.error,
    promotionSubscribers: promotionSubscribers.ok
      ? {
          total: promotionSubscribers.total,
          active: promotionSubscribers.active,
          unsubscribed: promotionSubscribers.unsubscribed,
          listComplete: promotionSubscribers.listComplete,
          nextCursor: promotionSubscribers.nextCursor,
          topCaptureSource: promotionSubscribers.topCaptureSource,
          captureSources: promotionSubscribers.captureSources,
        }
      : null,
    promotionSubscribersError: promotionSubscribers.ok ? null : promotionSubscribers.error,
    stripe: {
      sessionsScanned: sessions.length,
      paidSessions: paidSessions.length,
      realPaidSessions: realPaidSessions.length,
      productionPaidSessions: productionPaidSessions.length,
      qaPaidSessions: qaPaidSessions.length,
      zeroPaidSessions,
      digitalPaidSessions: digitalPaid.length,
      printSessionsTotal: printSessions.length,
      printPaidSessions: printPaid.length,
      printUnpaidSessions,
      digitalRevenueCents,
      printRevenueCents,
      totalRevenueCents: digitalRevenueCents + printRevenueCents,
      currency: "usd",
      digitalPlanCounts: topBuckets(digitalPlanCounts, "plan"),
      printVariantCounts: topBuckets(printVariantCounts, "variant"),
      paidPaymentMethods: topBuckets(paidPaymentMethodCounts, "method"),
      digitalPaymentMethods: topBuckets(digitalPaymentMethodCounts, "method"),
      printPaymentMethods: topBuckets(printPaymentMethodCounts, "method"),
      referralPaidSources: topBuckets(referralSourceCounts, "source"),
      referralOfferVariants: topBuckets(referralOfferVariantCounts, "variant"),
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
    `Real paid sessions (amount_total>0): ${report.stripe.realPaidSessions} ` +
      `(zero-dollar/test: ${report.stripe.zeroPaidSessions})`,
  );
  console.log(
    `Production paid (excl. QA metadata): ${report.stripe.productionPaidSessions} ` +
      `(QA-tagged: ${report.stripe.qaPaidSessions})`,
  );
  console.log(
    `Revenue: ${formatMoney(report.stripe.totalRevenueCents, report.stripe.currency)} ` +
      `(digital ${formatMoney(report.stripe.digitalRevenueCents, report.stripe.currency)}, ` +
      `print ${formatMoney(report.stripe.printRevenueCents, report.stripe.currency)})`,
  );
  console.log(
    `Mix: digital=${report.stripe.digitalPaidSessions} print=${report.stripe.printPaidSessions} scanned=${report.stripe.sessionsScanned}`,
  );
  if (report.stripe.printSessionsTotal > 0) {
    const paidPct =
      report.stripe.printSessionsTotal > 0
        ? ((report.stripe.printPaidSessions / report.stripe.printSessionsTotal) * 100).toFixed(1)
        : "0.0";
    console.log(
      `Print checkout (Stripe): opened=${report.stripe.printSessionsTotal} paid=${report.stripe.printPaidSessions} (${paidPct}%) unpaid=${report.stripe.printUnpaidSessions}`,
    );
    if (report.stripe.printPaidSessions === 0 && report.stripe.printUnpaidSessions >= 3) {
      console.log(
        "  ⚠ Phase A2 blocked: no paid print in window — expect abandon at Stripe until one real order completes.",
      );
    }
  }

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
  console.log("Paid payment methods");
  if (!report.stripe.paidPaymentMethods.length) {
    console.log("none");
  } else {
    for (const item of report.stripe.paidPaymentMethods) {
      console.log(`${item.method}: ${item.count}`);
    }
    const methodList = report.stripe.paidPaymentMethods.slice(0, 5).map((item) => `${item.method}:${item.count}`);
    if (methodList.length) {
      console.log(`Digital mix: ${report.stripe.digitalPaymentMethods.map((item) => `${item.method}:${item.count}`).join(", ") || "none"}`);
      console.log(`Print mix: ${report.stripe.printPaymentMethods.map((item) => `${item.method}:${item.count}`).join(", ") || "none"}`);
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
  console.log("Referral offer variants (paid)");
  if (!report.stripe.referralOfferVariants.length) {
    console.log("none");
  } else {
    for (const item of report.stripe.referralOfferVariants.slice(0, 8)) {
      console.log(`${item.variant}: ${item.count}`);
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
      "checkout_request_received",
      "checkout_session_created",
      "payment_verified",
    ];
    for (const step of stepOrder) {
      console.log(`${step}: ${Number(report.funnel[step] || 0)}`);
    }

    console.log("");
    console.log("Checkout conversion");
    const checkoutStarted = Number(report.funnel.checkout_started || 0);
    const checkoutRequestReceived = Number(report.funnel.checkout_request_received || 0);
    const sessionCreated = Number(report.funnel.checkout_session_created || 0);
    const paid = Number(report.funnel.payment_verified || 0);
    if (checkoutStarted > 0) {
      console.log(
        `intent -> api request: ${((checkoutRequestReceived / checkoutStarted) * 100).toFixed(2)}% (${checkoutRequestReceived}/${checkoutStarted})`,
      );
    } else {
      console.log("intent -> api request: n/a");
    }
    if (checkoutRequestReceived > 0) {
      if (checkoutRequestReceived < sessionCreated) {
        console.log(
          `api request -> session created: partial history (${sessionCreated} sessions, ${checkoutRequestReceived} api requests tracked in-window)`,
        );
      } else {
        console.log(
          `api request -> session created: ${((sessionCreated / checkoutRequestReceived) * 100).toFixed(2)}% (${sessionCreated}/${checkoutRequestReceived})`,
        );
      }
    } else {
      console.log("api request -> session created: n/a");
    }
    if (checkoutStarted > 0) {
      console.log(
        `intent -> session created: ${((sessionCreated / checkoutStarted) * 100).toFixed(2)}% (${sessionCreated}/${checkoutStarted})`,
      );
    } else {
      console.log("intent -> session created: n/a");
    }
    if (sessionCreated > 0) {
      console.log(
        `session created -> paid: ${((paid / sessionCreated) * 100).toFixed(2)}% (${paid}/${sessionCreated})`,
      );
    } else {
      console.log("session created -> paid: n/a");
    }
  }

  console.log("");
  console.log("Checkout blockers");
  if (!report.checkoutDiagnostics) {
    console.log(`unavailable (${report.checkoutDiagnosticsError || "unknown"})`);
  } else if (!report.checkoutDiagnostics.length) {
    console.log("none");
  } else {
    const clientRows = report.checkoutDiagnostics.filter((item) => String(item.reason).startsWith("client_"));
    const serverRows = report.checkoutDiagnostics.filter((item) => !String(item.reason).startsWith("client_"));
    if (clientRows.length) {
      console.log("client-side (before checkout API response):");
      for (const item of clientRows.slice(0, 6)) {
        console.log(`  ${item.reason}: last_${report.days}d=${item.lastNDays} total=${item.total}`);
      }
    } else {
      console.log("client-side (before checkout API response): none");
    }
    if (serverRows.length) {
      console.log("server-side (/api/checkout):");
      for (const item of serverRows.slice(0, 6)) {
        console.log(`  ${item.reason}: last_${report.days}d=${item.lastNDays} total=${item.total}`);
      }
    } else {
      console.log("server-side (/api/checkout): none");
    }
  }

  console.log("");
  console.log("Promo signups");
  if (!report.promotionSubscribers) {
    console.log(`unavailable (${report.promotionSubscribersError || "unknown"})`);
  } else {
    console.log(
      `active=${report.promotionSubscribers.active} unsubscribed=${report.promotionSubscribers.unsubscribed} total=${report.promotionSubscribers.total}`,
    );
    const top = report.promotionSubscribers.topCaptureSource;
    if (top && Number(report.promotionSubscribers.active) > 0) {
      console.log(`top capture source: ${top.source} (${top.count} active)`);
    } else {
      console.log("top capture source: —");
    }
    const sources = report.promotionSubscribers.captureSources;
    if (Array.isArray(sources) && sources.length > 1) {
      console.log(
        `by source: ${sources.map((row) => `${row.source}=${row.count}`).join(", ")}`,
      );
    }
    if (!report.promotionSubscribers.listComplete) {
      console.log(`partial list (nextCursor=${report.promotionSubscribers.nextCursor || "unknown"})`);
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
