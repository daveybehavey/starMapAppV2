import Stripe from "stripe";
import { getCheckoutFailureDashboard } from "@/lib/checkoutDiagnostics";
import { getFunnelDashboard } from "@/lib/funnel";
import { getPromotionSubscriberSummary } from "@/lib/promotionSubscriptions";
import { getReferralDashboard } from "@/lib/referralDashboard";

export type LoopScorecard = {
  generatedAt: string;
  site: string;
  days: number;
  loops: {
    referralShare: {
      paidReferralSessions: number;
      paidSessions: number;
      paidSessionsSource: "stripe" | "funnel";
      referralShareOfPaidPct: number;
      topOfferVariant: { variant: string; count: number } | null;
    };
    proofTrust: {
      proofRequestOpportunities: number;
      proofRequestSource: "stripe_print_paid_sessions" | "unavailable";
      note: string;
    };
    promoLifecycle: {
      activeSubscribers: number;
      unsubscribedSubscribers: number;
      totalSubscribers: number;
      checkoutStarted: number;
      paidSessions: number;
      paidPerActiveSubscriberPct: number;
    };
  };
  funnel: {
    landingViews: number;
    previewStarted: number;
    checkoutStarted: number;
    paymentVerified: number;
    previewRate: number;
    checkoutRate: number;
    paidRateFromCheckout: number;
  };
  diagnostics: {
    topClientBlocker: { reason: string; count: number } | null;
  };
};

type BuildLoopScorecardInput = {
  days?: number;
  site?: string;
};

const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim() || "";
const stripe = stripeSecret
  ? new Stripe(stripeSecret, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
      timeout: 20_000,
    })
  : null;

function clampDays(days: number) {
  if (!Number.isFinite(days)) return 14;
  return Math.min(90, Math.max(1, Math.floor(days)));
}

function percent(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

function getLastNDaysCount(
  rows: Array<{ step: string; lastNDays: number }>,
  step: string,
) {
  const row = rows.find((entry) => entry.step === step);
  return Number(row?.lastNDays || 0);
}

function isPaidCheckoutSession(session: Stripe.Checkout.Session) {
  return session.payment_status === "paid" || session.payment_status === "no_payment_required";
}

function belongsToStarMap(session: Stripe.Checkout.Session) {
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

function classifyOrder(session: Stripe.Checkout.Session) {
  const metadata = session.metadata || {};
  const rawOrderType = String(metadata.order_type || metadata.orderType || "").toLowerCase();
  if (rawOrderType === "print" || metadata.print_variant || metadata.printVariant) return "print";
  return "digital";
}

async function getStripePaidMix(days: number) {
  if (!stripe) {
    return {
      available: false as const,
      paidSessions: 0,
      printPaidSessions: 0,
    };
  }
  const createdGte = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
  let startingAfter: string | undefined;
  const sessions: Stripe.Checkout.Session[] = [];

  for (;;) {
    const page = await stripe.checkout.sessions.list({
      limit: 100,
      created: { gte: createdGte },
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    sessions.push(...page.data);
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  const paidSessions = sessions.filter((session) => isPaidCheckoutSession(session) && belongsToStarMap(session));
  const printPaidSessions = paidSessions.filter((session) => classifyOrder(session) === "print");

  return {
    available: true as const,
    paidSessions: paidSessions.length,
    printPaidSessions: printPaidSessions.length,
  };
}

export async function buildLoopScorecard(input: BuildLoopScorecardInput = {}): Promise<LoopScorecard> {
  const days = clampDays(input.days ?? 14);
  const site = (input.site?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://starmapco.com").replace(
    /\/+$/,
    "",
  );

  const [funnelDashboard, checkoutFailures, promotionSubscribers, referralDashboard, stripeMix] =
    await Promise.all([
      getFunnelDashboard(days),
      getCheckoutFailureDashboard(days),
      getPromotionSubscriberSummary(500),
      getReferralDashboard(days),
      getStripePaidMix(days),
    ]);

  const landingViews = getLastNDaysCount(funnelDashboard.rows, "landing_view");
  const previewStarted = getLastNDaysCount(funnelDashboard.rows, "preview_started");
  const checkoutStarted = getLastNDaysCount(funnelDashboard.rows, "checkout_started");
  const paymentVerified = getLastNDaysCount(funnelDashboard.rows, "payment_verified");
  const paidSessions = stripeMix.available ? stripeMix.paidSessions : paymentVerified;
  const paidSessionsSource = stripeMix.available ? "stripe" : "funnel";

  const referralPaidSessions = Number(referralDashboard.lastNDays.conversions || 0);
  const topOfferVariant = referralDashboard.topOfferVariants[0];
  const topClientBlocker = checkoutFailures.rows.find((row) => row.reason.startsWith("client_")) ?? null;

  return {
    generatedAt: new Date().toISOString(),
    site,
    days,
    loops: {
      referralShare: {
        paidReferralSessions: referralPaidSessions,
        paidSessions,
        paidSessionsSource,
        referralShareOfPaidPct: Number(percent(referralPaidSessions, paidSessions).toFixed(2)),
        topOfferVariant:
          topOfferVariant && Number(topOfferVariant.count || 0) > 0
            ? {
                variant: String(topOfferVariant.value || "unknown"),
                count: Number(topOfferVariant.count || 0),
              }
            : null,
      },
      proofTrust: {
        proofRequestOpportunities: stripeMix.available ? stripeMix.printPaidSessions : 0,
        proofRequestSource: stripeMix.available ? "stripe_print_paid_sessions" : "unavailable",
        note: stripeMix.available
          ? "Proof opportunity count uses paid print sessions in Stripe for this window."
          : "Stripe secret is unavailable; proof opportunity count could not be computed.",
      },
      promoLifecycle: {
        activeSubscribers: promotionSubscribers.active,
        unsubscribedSubscribers: promotionSubscribers.unsubscribed,
        totalSubscribers: promotionSubscribers.total,
        checkoutStarted,
        paidSessions,
        paidPerActiveSubscriberPct: Number(percent(paidSessions, promotionSubscribers.active).toFixed(2)),
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
