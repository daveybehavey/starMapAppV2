import Stripe from "stripe";
import { isQaTaggedSessionLike } from "@/lib/qaSession";

export type PromotionSource = "manual" | "referral_auto" | "unknown";
export type PromotionOrderType = "digital" | "print" | "mixed";

export type PromotionCheckoutSessionLike = {
  id?: string | null;
  payment_status?: string | null;
  amount_total?: number | null;
  metadata?: Record<string, string | null | undefined> | null;
};

export type PromotionCheckoutCodeSummary = {
  label: string;
  code: string | null;
  source: PromotionSource;
  orderType: PromotionOrderType;
  sessions: number;
  unpaidSessions: number;
  paidSessions: number;
  revenuePaidSessions: number;
  revenueCents: number;
  positiveRevenueAovCents: number;
};

export type PromotionCheckoutSummary = {
  available: boolean;
  appliedSessions: number;
  unpaidSessions: number;
  paidSessions: number;
  revenuePaidSessions: number;
  revenueCents: number;
  topCodes: PromotionCheckoutCodeSummary[];
};

type ResolvedPromotionDetails = {
  label: string;
  code: string | null;
  source: PromotionSource;
  orderType: Exclude<PromotionOrderType, "mixed">;
};

type MutablePromotionSummary = {
  label: string;
  code: string | null;
  source: PromotionSource;
  sessions: number;
  unpaidSessions: number;
  paidSessions: number;
  revenuePaidSessions: number;
  revenueCents: number;
  hasDigital: boolean;
  hasPrint: boolean;
};

const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim() || "";
const stripe = stripeSecret
  ? new Stripe(stripeSecret, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
      timeout: 20_000,
    })
  : null;

function normalizeValue(value: string | null | undefined) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeLower(value: string | null | undefined) {
  return normalizeValue(value).toLowerCase();
}

function normalizeUpper(value: string | null | undefined) {
  return normalizeValue(value).toUpperCase();
}

function classifyOrder(session: PromotionCheckoutSessionLike): Exclude<PromotionOrderType, "mixed"> {
  const metadata = session.metadata || {};
  const rawOrderType = normalizeLower(metadata.order_type);
  if (rawOrderType === "print" || normalizeValue(metadata.print_variant)) {
    return "print";
  }
  return "digital";
}

function isPaidCheckoutSession(session: PromotionCheckoutSessionLike) {
  const paymentStatus = normalizeLower(session.payment_status);
  return paymentStatus === "paid" || paymentStatus === "no_payment_required";
}

function isRevenuePositivePaidSession(session: PromotionCheckoutSessionLike) {
  return isPaidCheckoutSession(session) && Number(session.amount_total || 0) > 0;
}

function normalizePromotionSource(value: string | null | undefined): PromotionSource {
  const normalized = normalizeLower(value);
  if (normalized === "manual") return "manual";
  if (normalized === "referral_auto") return "referral_auto";
  return "unknown";
}

function resolvePromotionDetails(
  session: PromotionCheckoutSessionLike,
  promotionCodeLabelsById: Map<string, string>,
): ResolvedPromotionDetails | null {
  const metadata = session.metadata || {};
  const promotionSource = normalizePromotionSource(metadata.promotion_source);
  const orderType = classifyOrder(session);
  const promotionCode = normalizeUpper(metadata.promotion_code);
  const promotionCodeId = normalizeValue(metadata.promotion_code_id);
  const referralOfferApplied = normalizeLower(metadata.referral_offer_applied) === "true";
  const referralOfferVariant = normalizeLower(metadata.referral_offer_variant);

  const inferredReferralSource =
    promotionSource === "referral_auto" ||
    referralOfferApplied ||
    referralOfferVariant.startsWith("referral_auto");
  if (inferredReferralSource) {
    const label = referralOfferVariant
      ? `REFERRAL_AUTO (${referralOfferVariant})`
      : "REFERRAL_AUTO";
    return {
      label,
      code: null,
      source: "referral_auto",
      orderType,
    };
  }

  const resolvedManualCode = promotionCode || normalizeUpper(promotionCodeLabelsById.get(promotionCodeId));
  if (resolvedManualCode) {
    return {
      label: resolvedManualCode,
      code: resolvedManualCode,
      source: promotionSource === "unknown" ? "manual" : promotionSource,
      orderType,
    };
  }

  if (promotionCodeId) {
    return {
      label: `PROMO_ID:${promotionCodeId.slice(-8).toUpperCase()}`,
      code: null,
      source: promotionSource === "unknown" ? "manual" : promotionSource,
      orderType,
    };
  }

  return null;
}

export function summarizePromotionCheckoutSessions(
  sessions: PromotionCheckoutSessionLike[],
  promotionCodeLabelsById = new Map<string, string>(),
): PromotionCheckoutSummary {
  const totals = {
    available: true,
    appliedSessions: 0,
    unpaidSessions: 0,
    paidSessions: 0,
    revenuePaidSessions: 0,
    revenueCents: 0,
  };
  const buckets = new Map<string, MutablePromotionSummary>();

  for (const session of sessions) {
    if (isQaTaggedSessionLike(session)) continue;
    const resolved = resolvePromotionDetails(session, promotionCodeLabelsById);
    if (!resolved) continue;

    totals.appliedSessions += 1;
    const key = `${resolved.source}:${resolved.label}`;
    const existing = buckets.get(key) ?? {
      label: resolved.label,
      code: resolved.code,
      source: resolved.source,
      sessions: 0,
      unpaidSessions: 0,
      paidSessions: 0,
      revenuePaidSessions: 0,
      revenueCents: 0,
      hasDigital: false,
      hasPrint: false,
    };

    existing.sessions += 1;
    if (resolved.orderType === "digital") existing.hasDigital = true;
    if (resolved.orderType === "print") existing.hasPrint = true;

    if (isPaidCheckoutSession(session)) {
      existing.paidSessions += 1;
      totals.paidSessions += 1;
    } else {
      existing.unpaidSessions += 1;
      totals.unpaidSessions += 1;
    }

    if (isRevenuePositivePaidSession(session)) {
      const amount = Math.max(0, Number(session.amount_total || 0));
      existing.revenuePaidSessions += 1;
      existing.revenueCents += amount;
      totals.revenuePaidSessions += 1;
      totals.revenueCents += amount;
    }

    buckets.set(key, existing);
  }

  const topCodes = [...buckets.values()]
    .map((entry) => {
      const orderType: PromotionOrderType =
        entry.hasDigital && entry.hasPrint ? "mixed" : entry.hasPrint ? "print" : "digital";
      return {
      label: entry.label,
      code: entry.code,
      source: entry.source,
      orderType,
      sessions: entry.sessions,
      unpaidSessions: entry.unpaidSessions,
      paidSessions: entry.paidSessions,
      revenuePaidSessions: entry.revenuePaidSessions,
      revenueCents: entry.revenueCents,
      positiveRevenueAovCents:
        entry.revenuePaidSessions > 0 ? Math.round(entry.revenueCents / entry.revenuePaidSessions) : 0,
    };
    })
    .sort((a, b) => {
      if (b.revenuePaidSessions !== a.revenuePaidSessions) return b.revenuePaidSessions - a.revenuePaidSessions;
      if (b.sessions !== a.sessions) return b.sessions - a.sessions;
      if (b.revenueCents !== a.revenueCents) return b.revenueCents - a.revenueCents;
      return a.label.localeCompare(b.label);
    });

  return {
    ...totals,
    topCodes,
  };
}

async function fetchPromotionCodeLabelsById(promotionCodeIds: string[]) {
  const labels = new Map<string, string>();
  if (!stripe || promotionCodeIds.length === 0) return labels;

  await Promise.all(
    promotionCodeIds.map(async (promotionCodeId) => {
      try {
        const promotionCode = await stripe.promotionCodes.retrieve(promotionCodeId);
        const code = normalizeUpper(promotionCode.code);
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

async function loadStarMapCheckoutSessions(days: number) {
  if (!stripe) return [];

  const createdGte = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
  let startingAfter: string | undefined;
  const sessions: Stripe.Checkout.Session[] = [];

  for (;;) {
    const page = await stripe.checkout.sessions.list({
      limit: 100,
      created: { gte: createdGte },
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    sessions.push(
      ...page.data.filter((session) => {
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
      }),
    );
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  return sessions;
}

export async function getStripePromotionCheckoutSummary(days: number): Promise<PromotionCheckoutSummary> {
  if (!stripe) {
    return {
      available: false,
      appliedSessions: 0,
      unpaidSessions: 0,
      paidSessions: 0,
      revenuePaidSessions: 0,
      revenueCents: 0,
      topCodes: [],
    };
  }

  const sessions = await loadStarMapCheckoutSessions(days);
  const promotionCodeIds = [...new Set(
    sessions
      .map((session) => normalizeValue(session.metadata?.promotion_code_id))
      .filter(Boolean),
  )];
  const promotionCodeLabelsById = await fetchPromotionCodeLabelsById(promotionCodeIds);
  return summarizePromotionCheckoutSessions(sessions, promotionCodeLabelsById);
}
