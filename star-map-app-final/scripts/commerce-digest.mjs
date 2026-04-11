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

function isRevenuePositivePaidSession(session) {
  return isPaidCheckoutSession(session) && Number(session.amount_total || 0) > 0;
}

function isQaTaggedSession(session) {
  const metadata = session.metadata || {};
  const qaRun = String(metadata.qa_run || "").trim().toLowerCase();
  const qaSource = String(metadata.qa_source || "").trim().toLowerCase();
  const clientReferenceId = String(session.client_reference_id || "").trim().toLowerCase();
  return qaRun === "true" || qaSource.startsWith("qa") || clientReferenceId.includes("qa");
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

function getCustomerEmail(session) {
  const sessionCustomerEmail = String(session.customer_email || "").trim().toLowerCase();
  if (sessionCustomerEmail) return sessionCustomerEmail;
  const customerDetailsEmail = String(session.customer_details?.email || "").trim().toLowerCase();
  return customerDetailsEmail || "";
}

function normalizeMetadataValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMetadataLower(value) {
  return normalizeMetadataValue(value).toLowerCase();
}

function normalizeMetadataUpper(value) {
  return normalizeMetadataValue(value).toUpperCase();
}

function hasCheckoutAttribution(session) {
  const metadata = session.metadata || {};
  return Boolean(
    String(metadata.referral_code || "").trim() ||
      String(metadata.referrer_session_id || "").trim() ||
      String(metadata.referral_source || "").trim() ||
      String(metadata.referral_medium || "").trim() ||
      String(metadata.referral_campaign || "").trim() ||
      String(metadata.promotion_code_id || "").trim(),
  );
}

async function resolvePromotionCodeLabelsById(stripe, sessions) {
  const promotionCodeIds = [...new Set(
    sessions
      .map((session) => normalizeMetadataValue(session.metadata?.promotion_code_id))
      .filter(Boolean),
  )];
  const labels = new Map();

  await Promise.all(
    promotionCodeIds.map(async (promotionCodeId) => {
      try {
        const promotionCode = await stripe.promotionCodes.retrieve(promotionCodeId);
        const code = normalizeMetadataUpper(promotionCode.code);
        if (code) {
          labels.set(promotionCodeId, code);
        }
      } catch (error) {
        console.error("Promotion code retrieve failed for reporting", { promotionCodeId, error });
      }
    }),
  );

  return labels;
}

function resolvePromotionSummaryDetails(session, promotionCodeLabelsById) {
  const metadata = session.metadata || {};
  const explicitSource = normalizeMetadataLower(metadata.promotion_source);
  const referralOfferApplied = normalizeMetadataLower(metadata.referral_offer_applied) === "true";
  const referralOfferVariant = normalizeMetadataLower(metadata.referral_offer_variant);
  const orderType = classifyOrder(session) === "print" ? "print" : "digital";

  if (
    explicitSource === "referral_auto" ||
    referralOfferApplied ||
    referralOfferVariant.startsWith("referral_auto")
  ) {
    return {
      label: referralOfferVariant ? `REFERRAL_AUTO (${referralOfferVariant})` : "REFERRAL_AUTO",
      source: "referral_auto",
      orderType,
    };
  }

  const explicitCode = normalizeMetadataUpper(metadata.promotion_code);
  const promotionCodeId = normalizeMetadataValue(metadata.promotion_code_id);
  const resolvedCode = explicitCode || normalizeMetadataUpper(promotionCodeLabelsById.get(promotionCodeId));
  if (resolvedCode) {
    return {
      label: resolvedCode,
      source: explicitSource === "unknown" || !explicitSource ? "manual" : explicitSource,
      orderType,
    };
  }

  if (promotionCodeId) {
    return {
      label: `PROMO_ID:${promotionCodeId.slice(-8).toUpperCase()}`,
      source: explicitSource === "unknown" || !explicitSource ? "manual" : explicitSource,
      orderType,
    };
  }

  return null;
}

async function buildPromotionSummary(stripe, sessions) {
  const promotionCodeLabelsById = await resolvePromotionCodeLabelsById(stripe, sessions);
  const buckets = new Map();
  let appliedSessions = 0;
  let paidSessions = 0;
  let revenuePaidSessions = 0;
  let revenueCents = 0;

  for (const session of sessions) {
    const resolved = resolvePromotionSummaryDetails(session, promotionCodeLabelsById);
    if (!resolved) continue;

    appliedSessions += 1;
    const key = `${resolved.source}:${resolved.label}`;
    const bucket = buckets.get(key) ?? {
      label: resolved.label,
      source: resolved.source,
      sessions: 0,
      unpaidSessions: 0,
      paidSessions: 0,
      revenuePaidSessions: 0,
      revenueCents: 0,
      hasDigital: false,
      hasPrint: false,
    };
    bucket.sessions += 1;
    if (resolved.orderType === "digital") bucket.hasDigital = true;
    if (resolved.orderType === "print") bucket.hasPrint = true;

    if (isPaidCheckoutSession(session)) {
      bucket.paidSessions += 1;
      paidSessions += 1;
    } else {
      bucket.unpaidSessions += 1;
    }

    if (isRevenuePositivePaidSession(session)) {
      const amount = Math.max(0, Number(session.amount_total || 0));
      bucket.revenuePaidSessions += 1;
      bucket.revenueCents += amount;
      revenuePaidSessions += 1;
      revenueCents += amount;
    }

    buckets.set(key, bucket);
  }

  const topCodes = [...buckets.values()]
    .map((entry) => ({
      label: entry.label,
      source: entry.source,
      orderType: entry.hasDigital && entry.hasPrint ? "mixed" : entry.hasPrint ? "print" : "digital",
      sessions: entry.sessions,
      unpaidSessions: entry.unpaidSessions,
      paidSessions: entry.paidSessions,
      revenuePaidSessions: entry.revenuePaidSessions,
      revenueCents: entry.revenueCents,
      positiveRevenueAovCents:
        entry.revenuePaidSessions > 0 ? Math.round(entry.revenueCents / entry.revenuePaidSessions) : 0,
    }))
    .sort((a, b) => {
      if (b.revenuePaidSessions !== a.revenuePaidSessions) return b.revenuePaidSessions - a.revenuePaidSessions;
      if (b.sessions !== a.sessions) return b.sessions - a.sessions;
      if (b.revenueCents !== a.revenueCents) return b.revenueCents - a.revenueCents;
      return a.label.localeCompare(b.label);
    });

  return {
    appliedSessions,
    unpaidSessions: Math.max(0, appliedSessions - paidSessions),
    paidSessions,
    revenuePaidSessions,
    revenueCents,
    topCodes,
  };
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

function emptyLifecycleStepCounts() {
  return { objection: 0, urgency: 0 };
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

function summarizePromotionSubscriberRows(subscribers) {
  const queuedByStep = emptyLifecycleStepCounts();
  const dueByStep = emptyLifecycleStepCounts();
  const sentByStep = emptyLifecycleStepCounts();
  let welcomeSent = 0;
  let legacyFollowupSent = 0;
  let pending = 0;
  let dueNow = 0;
  let completed = 0;
  const now = Date.now();

  for (const row of subscribers) {
    if (row?.unsubscribedAt) continue;
    if (row?.couponSentAt) {
      welcomeSent += 1;
    }

    const sentSteps = new Set();
    const history = Array.isArray(row?.followupHistory) ? row.followupHistory : [];
    for (const entry of history) {
      const step = normalizeToken(entry?.step);
      if (step === "objection" || step === "urgency") {
        sentSteps.add(step);
      }
    }
    for (const step of sentSteps) {
      sentByStep[step] += 1;
    }

    const nextStep = normalizeToken(row?.followupNextStep);
    if (nextStep === "objection" || nextStep === "urgency") {
      pending += 1;
      queuedByStep[nextStep] += 1;
      const dueAt = Number(row?.followupDueAt || 0);
      if (Number.isFinite(dueAt) && dueAt > 0 && dueAt <= now) {
        dueNow += 1;
        dueByStep[nextStep] += 1;
      }
    }

    const hasLegacyFollowup = Boolean(row?.followupSentAt) && sentSteps.size === 0;
    if (hasLegacyFollowup) {
      legacyFollowupSent += 1;
    }
    if (!nextStep && (hasLegacyFollowup || sentSteps.has("urgency"))) {
      completed += 1;
    }
  }

  return {
    welcomeSent,
    legacyFollowupSent,
    pending,
    dueNow,
    queuedByStep,
    dueByStep,
    sentByStep,
    completed,
  };
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
  const summary = body.summary && typeof body.summary === "object" ? body.summary : null;
  const lifecycle = summary?.lifecycle && typeof summary.lifecycle === "object"
    ? {
        welcomeSent: Number(summary.lifecycle.welcomeSent || 0),
        legacyFollowupSent: Number(summary.lifecycle.legacyFollowupSent || 0),
        pending: Number(summary.lifecycle.pending || 0),
        dueNow: Number(summary.lifecycle.dueNow || 0),
        queuedByStep: {
          objection: Number(summary.lifecycle.queuedByStep?.objection || 0),
          urgency: Number(summary.lifecycle.queuedByStep?.urgency || 0),
        },
        dueByStep: {
          objection: Number(summary.lifecycle.dueByStep?.objection || 0),
          urgency: Number(summary.lifecycle.dueByStep?.urgency || 0),
        },
        sentByStep: {
          objection: Number(summary.lifecycle.sentByStep?.objection || 0),
          urgency: Number(summary.lifecycle.sentByStep?.urgency || 0),
        },
        completed: Number(summary.lifecycle.completed || 0),
      }
    : summarizePromotionSubscriberRows(subscribers);
  return {
    ok: true,
    total: Number(summary?.total ?? subscribers.length),
    active: Number(summary?.active ?? subscribers.filter((row) => !row.unsubscribedAt).length),
    unsubscribed: Number(summary?.unsubscribed ?? subscribers.filter((row) => row.unsubscribedAt).length),
    sources: Array.isArray(summary?.sources)
      ? summary.sources
          .filter((row) => row && typeof row === "object")
          .map((row) => ({
            source: String(row.source || "unknown"),
            total: Number(row.total || 0),
            active: Number(row.active || 0),
            unsubscribed: Number(row.unsubscribed || 0),
          }))
      : [],
    lifecycle,
    listComplete: Boolean(summary?.listComplete ?? body.listComplete),
    nextCursor: body.nextCursor ?? null,
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
  const unpaidSessions = sessions.filter((session) => !isPaidCheckoutSession(session));
  const revenuePaidSessions = paidSessions.filter((session) => isRevenuePositivePaidSession(session));
  const noChargePaidSessions = paidSessions.filter((session) => !isRevenuePositivePaidSession(session));
  const qaTaggedPaidSessions = paidSessions.filter((session) => isQaTaggedSession(session));
  const revenuePaidSessionsNonQa = revenuePaidSessions.filter((session) => !isQaTaggedSession(session));

  const digitalPaid = paidSessions.filter((session) => classifyOrder(session) === "digital");
  const printPaid = paidSessions.filter((session) => classifyOrder(session) === "print");
  const digitalRevenuePaid = revenuePaidSessions.filter((session) => classifyOrder(session) === "digital");
  const printRevenuePaid = revenuePaidSessions.filter((session) => classifyOrder(session) === "print");
  const paymentMethodMix = await resolvePaidSessionPaymentMethods(stripe, paidSessions);
  const revenuePaymentMethodMix = await resolvePaidSessionPaymentMethods(stripe, revenuePaidSessions);
  const promotionSummary = await buildPromotionSummary(stripe, sessions);

  const digitalPlanCounts = new Map();
  const printVariantCounts = new Map();
  const referralSourceCounts = new Map();
  const referralOfferVariantCounts = new Map();
  const paidPaymentMethodCounts = new Map();
  const digitalPaymentMethodCounts = new Map();
  const printPaymentMethodCounts = new Map();
  const paidRevenuePaymentMethodCounts = new Map();
  const digitalRevenuePaymentMethodCounts = new Map();
  const printRevenuePaymentMethodCounts = new Map();

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

  for (const session of digitalRevenuePaid) {
    const paymentMethod = revenuePaymentMethodMix.bySessionId.get(session.id);
    if (paymentMethod) {
      incrementBucket(paidRevenuePaymentMethodCounts, paymentMethod);
      incrementBucket(digitalRevenuePaymentMethodCounts, paymentMethod);
    }
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

  for (const session of printRevenuePaid) {
    const paymentMethod = revenuePaymentMethodMix.bySessionId.get(session.id);
    if (paymentMethod) {
      incrementBucket(paidRevenuePaymentMethodCounts, paymentMethod);
      incrementBucket(printRevenuePaymentMethodCounts, paymentMethod);
    }
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

  const unpaidStatusCounts = new Map();
  let unpaidDigitalSessions = 0;
  let unpaidPrintSessions = 0;
  let unpaidMissingEmail = 0;
  let unpaidMissingAttribution = 0;
  let unpaidAnonymousContext = 0;
  for (const session of unpaidSessions) {
    incrementBucket(unpaidStatusCounts, String(session.status || "unknown").trim().toLowerCase() || "unknown");
    if (classifyOrder(session) === "print") {
      unpaidPrintSessions += 1;
    } else {
      unpaidDigitalSessions += 1;
    }
    const hasEmail = Boolean(getCustomerEmail(session));
    const hasAttribution = hasCheckoutAttribution(session);
    if (!hasEmail) unpaidMissingEmail += 1;
    if (!hasAttribution) unpaidMissingAttribution += 1;
    if (!hasEmail && !hasAttribution) unpaidAnonymousContext += 1;
  }

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
          sources: promotionSubscribers.sources,
          lifecycle: promotionSubscribers.lifecycle,
          listComplete: promotionSubscribers.listComplete,
          nextCursor: promotionSubscribers.nextCursor,
        }
      : null,
    promotionSubscribersError: promotionSubscribers.ok ? null : promotionSubscribers.error,
    stripe: {
      sessionsScanned: sessions.length,
      paidSessions: paidSessions.length,
      revenuePaidSessions: revenuePaidSessions.length,
      revenuePaidSessionsExcludingQa: revenuePaidSessionsNonQa.length,
      noChargePaidSessions: noChargePaidSessions.length,
      qaTaggedPaidSessions: qaTaggedPaidSessions.length,
      unpaidSessions: unpaidSessions.length,
      digitalPaidSessions: digitalPaid.length,
      printPaidSessions: printPaid.length,
      unpaidDigitalSessions,
      unpaidPrintSessions,
      unpaidMissingEmail,
      unpaidMissingAttribution,
      unpaidAnonymousContext,
      digitalRevenuePaidSessions: digitalRevenuePaid.length,
      printRevenuePaidSessions: printRevenuePaid.length,
      digitalRevenueCents,
      printRevenueCents,
      totalRevenueCents: digitalRevenueCents + printRevenueCents,
      positiveRevenueAovCents:
        revenuePaidSessions.length > 0
          ? Math.round((digitalRevenueCents + printRevenueCents) / revenuePaidSessions.length)
          : 0,
      currency: "usd",
      digitalPlanCounts: topBuckets(digitalPlanCounts, "plan"),
      printVariantCounts: topBuckets(printVariantCounts, "variant"),
      paidPaymentMethods: topBuckets(paidPaymentMethodCounts, "method"),
      digitalPaymentMethods: topBuckets(digitalPaymentMethodCounts, "method"),
      printPaymentMethods: topBuckets(printPaymentMethodCounts, "method"),
      paidRevenuePaymentMethods: topBuckets(paidRevenuePaymentMethodCounts, "method"),
      digitalRevenuePaymentMethods: topBuckets(digitalRevenuePaymentMethodCounts, "method"),
      printRevenuePaymentMethods: topBuckets(printRevenuePaymentMethodCounts, "method"),
      unpaidStatusCounts: topBuckets(unpaidStatusCounts, "status"),
      referralPaidSources: topBuckets(referralSourceCounts, "source"),
      referralOfferVariants: topBuckets(referralOfferVariantCounts, "variant"),
      promotions: promotionSummary,
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
  console.log(`Paid sessions (all): ${report.stripe.paidSessions}`);
  console.log(
    `Revenue-paid sessions: ${report.stripe.revenuePaidSessions} ` +
      `(excluding QA-tagged: ${report.stripe.revenuePaidSessionsExcludingQa})`,
  );
  if (report.stripe.noChargePaidSessions > 0 || report.stripe.qaTaggedPaidSessions > 0) {
    console.log(
      `No-charge paid sessions: ${report.stripe.noChargePaidSessions} ` +
        `| QA-tagged paid sessions: ${report.stripe.qaTaggedPaidSessions}`,
    );
  }
  console.log(
    `Revenue: ${formatMoney(report.stripe.totalRevenueCents, report.stripe.currency)} ` +
      `(digital ${formatMoney(report.stripe.digitalRevenueCents, report.stripe.currency)}, ` +
      `print ${formatMoney(report.stripe.printRevenueCents, report.stripe.currency)})`,
  );
  console.log(
    `Positive-revenue AOV: ${formatMoney(report.stripe.positiveRevenueAovCents, report.stripe.currency)}`,
  );
  console.log(
    `Mix (all paid): digital=${report.stripe.digitalPaidSessions} print=${report.stripe.printPaidSessions} scanned=${report.stripe.sessionsScanned}`,
  );
  console.log(
    `Mix (revenue-paid): digital=${report.stripe.digitalRevenuePaidSessions} print=${report.stripe.printRevenuePaidSessions}`,
  );

  console.log("");
  console.log("Unpaid sessions");
  console.log(
    `total=${report.stripe.unpaidSessions} digital=${report.stripe.unpaidDigitalSessions} print=${report.stripe.unpaidPrintSessions}`,
  );
  console.log(
    `missing email=${report.stripe.unpaidMissingEmail} missing attribution=${report.stripe.unpaidMissingAttribution} anonymous context=${report.stripe.unpaidAnonymousContext}`,
  );
  if (!report.stripe.unpaidStatusCounts.length) {
    console.log("statuses: none");
  } else {
    console.log(
      `statuses: ${report.stripe.unpaidStatusCounts.map((item) => `${item.status}:${item.count}`).join(", ")}`,
    );
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
  console.log("Revenue-paid payment methods");
  if (!report.stripe.paidRevenuePaymentMethods.length) {
    console.log("none");
  } else {
    for (const item of report.stripe.paidRevenuePaymentMethods) {
      console.log(`${item.method}: ${item.count}`);
    }
    console.log(
      `Digital revenue mix: ${report.stripe.digitalRevenuePaymentMethods.map((item) => `${item.method}:${item.count}`).join(", ") || "none"}`,
    );
    console.log(
      `Print revenue mix: ${report.stripe.printRevenuePaymentMethods.map((item) => `${item.method}:${item.count}`).join(", ") || "none"}`,
    );
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
  console.log("Promotion codes");
  console.log(
    `applied=${report.stripe.promotions.appliedSessions} paid=${report.stripe.promotions.paidSessions} revenue-paid=${report.stripe.promotions.revenuePaidSessions} revenue=${formatMoney(report.stripe.promotions.revenueCents, report.stripe.currency)}`,
  );
  if (!report.stripe.promotions.topCodes.length) {
    console.log("none");
  } else {
    for (const item of report.stripe.promotions.topCodes.slice(0, 8)) {
      console.log(
        `${item.label}: source=${item.source} order=${item.orderType} sessions=${item.sessions} revenue-paid=${item.revenuePaidSessions} revenue=${formatMoney(item.revenueCents, report.stripe.currency)}`,
      );
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
      "preview_download_started",
      "preview_download_completed",
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
    const previewDownloads = Number(report.funnel.preview_download_completed || 0);
    const revenuePaid = Number(report.stripe.revenuePaidSessions || 0);
    const revenuePaidExcludingQa = Number(report.stripe.revenuePaidSessionsExcludingQa || 0);
    console.log("");
    console.log("Preview export")
    if (Number(report.funnel.preview_started || 0) > 0) {
      console.log(
        `preview -> preview download: ${((previewDownloads / Number(report.funnel.preview_started || 0)) * 100).toFixed(2)}% (${previewDownloads}/${Number(report.funnel.preview_started || 0)})`,
      );
    } else {
      console.log("preview -> preview download: n/a");
    }
    if (previewDownloads > 0) {
      if (checkoutStarted > previewDownloads) {
        console.log(
          `preview download -> checkout intent: partial history / mixed entry points (${checkoutStarted} checkout intents, ${previewDownloads} preview downloads tracked in-window)`,
        );
      } else {
        console.log(
          `preview download -> checkout intent: ${((checkoutStarted / previewDownloads) * 100).toFixed(2)}% (${checkoutStarted}/${previewDownloads})`,
        );
      }
    } else {
      console.log("preview download -> checkout intent: n/a");
    }

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
      console.log(
        `session created -> revenue-paid: ${((revenuePaid / sessionCreated) * 100).toFixed(2)}% (${revenuePaid}/${sessionCreated})`,
      );
      console.log(
        `session created -> revenue-paid (ex QA): ${((revenuePaidExcludingQa / sessionCreated) * 100).toFixed(2)}% (${revenuePaidExcludingQa}/${sessionCreated})`,
      );
    } else {
      console.log("session created -> paid: n/a");
      console.log("session created -> revenue-paid: n/a");
      console.log("session created -> revenue-paid (ex QA): n/a");
    }
  }

  console.log("");
  console.log("Checkout blockers");
  if (!report.checkoutDiagnostics) {
    console.log(`unavailable (${report.checkoutDiagnosticsError || "unknown"})`);
  } else if (!report.checkoutDiagnostics.length) {
    console.log("none");
  } else {
    const intentRows = report.checkoutDiagnostics.filter((item) =>
      ["checkout_intent_missing", "checkout_intent_invalid", "checkout_intent_used"].includes(String(item.reason)),
    );
    const clientRows = report.checkoutDiagnostics.filter((item) => String(item.reason).startsWith("client_"));
    const serverRows = report.checkoutDiagnostics.filter((item) => !String(item.reason).startsWith("client_"));
    if (intentRows.length) {
      console.log("checkout intent gate:");
      for (const item of intentRows) {
        console.log(`  ${item.reason}: last_${report.days}d=${item.lastNDays} total=${item.total}`);
      }
    } else {
      console.log("checkout intent gate: none");
    }
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
    if (report.promotionSubscribers.lifecycle) {
      console.log(
        `welcome sent=${report.promotionSubscribers.lifecycle.welcomeSent} pending=${report.promotionSubscribers.lifecycle.pending} due now=${report.promotionSubscribers.lifecycle.dueNow} completed=${report.promotionSubscribers.lifecycle.completed}`,
      );
      console.log(
        `queued: objection=${report.promotionSubscribers.lifecycle.queuedByStep.objection} urgency=${report.promotionSubscribers.lifecycle.queuedByStep.urgency}`,
      );
      console.log(
        `sent: objection=${report.promotionSubscribers.lifecycle.sentByStep.objection} urgency=${report.promotionSubscribers.lifecycle.sentByStep.urgency} legacy=${report.promotionSubscribers.lifecycle.legacyFollowupSent}`,
      );
      console.log(
        `due now: objection=${report.promotionSubscribers.lifecycle.dueByStep.objection} urgency=${report.promotionSubscribers.lifecycle.dueByStep.urgency}`,
      );
    }
    if (Array.isArray(report.promotionSubscribers.sources) && report.promotionSubscribers.sources.length > 0) {
      console.log(
        `top sources: ${report.promotionSubscribers.sources
          .slice(0, 5)
          .map((row) => `${row.source}: active=${row.active} total=${row.total}`)
          .join(" | ")}`,
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
