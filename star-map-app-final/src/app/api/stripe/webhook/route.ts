import { NextResponse } from "next/server";
import Stripe from "stripe";
import { isDurableKvPersistenceError, kv } from "@/lib/kv";
import type { CheckoutOrderType, CheckoutPlan, PrintVariant } from "@/lib/pricing";
import { isPrintVariant } from "@/lib/printCatalog";
import { getMerchFamily, isMerchFamilyId, type MerchFamilyId } from "@/lib/merchCatalog";
import {
  normalizeReferralCode,
  referralKey,
  referralRewardedKey,
  type ReferralRecord,
} from "@/lib/referrals";
import { appendReferralEvent, getReferralEvents } from "@/lib/referralLedger";
import { isPrintfulConfigured, submitPrintfulOrder } from "@/lib/printful";
import { isPrintfulV2Configured, submitPrintfulV2CatalogOrder } from "@/lib/printfulV2Orders";
import { PRINT_ASSET_ID_REGEX } from "@/lib/printAssets";
import {
  assertPrintOrderRetained,
  buildAlternateFulfillmentWebhookPayload,
  buildPrintAssetUrl,
  extractCheckoutPhoneFromStripeSession,
  getPrintMinChargeCents,
  getPrintRecipient,
  hasSufficientPrintCharge,
  isPrintOrderUnretainableError,
  persistPrintOrderRecord,
  PrintOrderUnretainableError,
  printOrderKey,
  resolvePrintOrderCreatedAt,
  type PrintOrderRecord,
} from "@/lib/printOrders";
import { recordCheckoutExpiredOnce, recordPaymentVerifiedOnce } from "@/lib/funnel";
import { sendPrintOrderFailureAlert } from "@/lib/printOrderAlerts";
import { extendPrintAssetTtlForFulfillment } from "@/lib/printAssetFulfillment";
import { bindAcceptedPrintfulIdentityThenReview } from "@/lib/printFulfillmentPostSubmit";
import {
  isPrintOrderAuthorityBindError,
  PrintOrderAuthorityBindError,
} from "@/lib/printOrderAuthority";
import { sendPrintOrderConfirmation } from "@/lib/printOrderConfirmation";
import {
  applyCheckoutRecoveryDeliveredSessionFields,
  buildCheckoutRecoveryAttemptRecord,
  checkoutRecoveryEmailAttemptKey,
  checkoutRecoveryEmailDeliveredKey,
  checkoutRecoveryProviderDispatchSuppressedResult,
  CHECKOUT_RECOVERY_ATTEMPT_TTL_SECONDS,
  CHECKOUT_RECOVERY_EMAIL_DELIVERED_TTL_SECONDS,
  createCheckoutRecoveryAttemptId,
  evaluateCheckoutRecoveryProviderDispatchGate,
  isCheckoutRecoveryDeliveredMarker,
  isCheckoutRecoveryWebhookRetryable,
  sendCheckoutRecoveryAlert,
  type CheckoutRecoveryRetryability,
} from "@/lib/checkoutRecoveryAlerts";
import { evaluatePrintMarginForPaidOrder } from "@/lib/printMargin";
import { upsertAccountLiteEmailSession } from "@/lib/accountLite";
import { sendPostPurchaseAccessEmail } from "@/lib/accountAccessDelivery";
import { hasRecoverableAccess } from "@/lib/accountAccessLinks";
import { isAccountAccessEmailConfigured } from "@/lib/accountAccessAlerts";
import { resolveCheckoutMapIdFromStripeSession } from "@/lib/checkoutMapId";
import {
  buildGa4PurchaseFromStripeSession,
  isQaStripeSession,
} from "@/lib/commerceAnalytics";
import {
  ENTITLEMENT_KV,
  refreshEntitledMapRecipeTtl,
} from "@/lib/entitlementsStore";

export const runtime = "nodejs";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const printFulfillmentWebhookUrl = process.env.PRINT_FULFILLMENT_WEBHOOK_URL?.trim() || "";
const printOrderSubmissionEnabled = /^(1|true|yes)$/i.test(
  (process.env.PRINT_ORDER_SUBMISSION_ENABLED || "").trim(),
);
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com").replace(/\/+$/, "");
const referralRewardCredits = (() => {
  const raw = process.env.REFERRAL_REWARD_CREDITS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
})();
const referralMaxRewardsPerReferrer30d = (() => {
  const raw = process.env.REFERRAL_MAX_REWARDS_PER_REFERRER_30D?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
})();
const referralMaxRewardsPerReferrer24h = (() => {
  const raw = process.env.REFERRAL_MAX_REWARDS_PER_REFERRER_24H?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
})();
const REFERRAL_REWARD_CAP_WINDOW_24H_MS = 24 * 60 * 60 * 1000;
const REFERRAL_REWARD_CAP_WINDOW_30D_MS = 30 * 24 * 60 * 60 * 1000;
const stripe =
  stripeSecret &&
  new Stripe(stripeSecret, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
    timeout: 20_000,
  });

type SessionRecord = {
  paid?: boolean;
  created?: number;
  revoked?: boolean;
  revokedAt?: number;
  reason?: string;
  mapId?: string;
  paymentIntentId?: string | null;
  amountTotal?: number | null;
  currency?: string | null;
  plan?: CheckoutPlan;
  creditsRemaining?: number;
  creditsTotal?: number;
  subscriptionId?: string | null;
  subscriptionActive?: boolean;
  customerId?: string | null;
  customerEmail?: string | null;
  orderType?: CheckoutOrderType;
  printVariant?: PrintVariant;
  includesDigitalAddOn?: boolean;
  printAssetId?: string;
  referralCode?: string;
  referrerSessionId?: string;
  referralOfferVariant?: string;
  expiredAt?: number;
  recoveryUrl?: string | null;
  recoveryEmailSentAt?: number;
  recoveryEmailProvider?: string;
  recoveryEmailError?: string;
  recoveryEmailErrorCode?: string;
  recoveryEmailRetryability?: CheckoutRecoveryRetryability;
  recoveryEmailLastAttemptAt?: number;
  recoveryEmailAttemptCount?: number;
  accessEmailSentAt?: number;
  accessEmailProvider?: string;
  accessEmailError?: string;
};

type ReferralConversionState = {
  rewarded?: boolean;
  createdAt?: number;
  checkoutSessionId?: string;
  referralCode?: string;
  referrerSessionId?: string;
  rewardGranted?: number;
  rewardSkipReason?: string;
  orderType?: CheckoutOrderType;
  amountTotal?: number;
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  offerVariant?: string;
  conversionRecorded?: boolean;
  conversionReversed?: boolean;
  conversionReversedAt?: number;
  rewardReversed?: boolean;
  rewardReversedAt?: number;
  reversalReason?: string;
  rewardReclaimed?: number;
};

const sessionKey = (id: string) => `stripe:session:${id}`;
const paymentIntentKey = (id: string) => `stripe:pi:${id}`;
const revokedPaymentIntentKey = (id: string) => `stripe:pi:revoked:${id}`;
const chargeKey = (id: string) => `stripe:charge:${id}`;
const subscriptionKey = (id: string) => `stripe:sub:${id}`;
const accessEmailKey = (id: string) => ENTITLEMENT_KV.accessEmailDedupe(id);
const ACCESS_EMAIL_TTL_SECONDS = 45 * 24 * 60 * 60;
const WEBHOOK_EVENT_DEDUPE_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Persist Stripe event dedupe as a terminal "do not re-enter" marker.
 * Returns false when the write fails — callers must not claim successful finalize.
 */
async function persistWebhookEventDedupe(
  eventDedupeKey: string,
  meta?: { reason?: string },
): Promise<boolean> {
  try {
    await kv.set(
      eventDedupeKey,
      { received: true, ...(meta?.reason ? { reason: meta.reason } : {}) },
      { ex: WEBHOOK_EVENT_DEDUPE_TTL_SECONDS },
    );
    return true;
  } catch (error) {
    console.error("Webhook event dedupe persistence failed", { eventDedupeKey, error });
    return false;
  }
}

function normalizeEmail(raw: unknown) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed || null;
}

function getOrderType(session: Stripe.Checkout.Session): CheckoutOrderType {
  return session.metadata?.order_type === "print" ? "print" : "digital";
}

function getPrintVariant(session: Stripe.Checkout.Session): PrintVariant | undefined {
  const raw = session.metadata?.print_variant;
  return isPrintVariant(raw) ? raw : undefined;
}

function includesDigitalAddOn(session: Stripe.Checkout.Session): boolean {
  return session.metadata?.print_include_digital === "true";
}

function includesCardAddOn(session: Stripe.Checkout.Session): boolean {
  return session.metadata?.print_include_card === "true";
}

function getPrintAssetId(session: Stripe.Checkout.Session): string | undefined {
  const raw = typeof session.metadata?.print_asset_id === "string" ? session.metadata.print_asset_id.trim() : "";
  if (!raw || !PRINT_ASSET_ID_REGEX.test(raw)) return undefined;
  return raw;
}

function getPrintCardAssetId(session: Stripe.Checkout.Session): string | undefined {
  const raw =
    typeof session.metadata?.print_card_asset_id === "string" ? session.metadata.print_card_asset_id.trim() : "";
  if (!raw || !PRINT_ASSET_ID_REGEX.test(raw)) return undefined;
  return raw;
}

function getMerchFamilyFromSession(session: Stripe.Checkout.Session): MerchFamilyId | undefined {
  const raw = session.metadata?.print_merch_family;
  return isMerchFamilyId(raw) ? raw : undefined;
}

function getMerchCatalogVariantId(session: Stripe.Checkout.Session): number | undefined {
  const raw = session.metadata?.print_merch_catalog_variant_id;
  const parsed = raw ? Number.parseInt(String(raw), 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function getMerchSize(session: Stripe.Checkout.Session): string | undefined {
  const raw = typeof session.metadata?.print_merch_size === "string" ? session.metadata.print_merch_size.trim() : "";
  return raw || undefined;
}

function getMerchColor(session: Stripe.Checkout.Session): string | undefined {
  const raw = typeof session.metadata?.print_merch_color === "string" ? session.metadata.print_merch_color.trim() : "";
  return raw || undefined;
}

function getReferralAttributionValue(session: Stripe.Checkout.Session, field: "source" | "medium" | "campaign" | "content") {
  const key = `referral_${field}` as const;
  const raw = typeof session.metadata?.[key] === "string" ? session.metadata[key] : "";
  const value = raw.trim().toLowerCase();
  return value || undefined;
}

function getReferralOfferVariant(session: Stripe.Checkout.Session) {
  const raw = typeof session.metadata?.referral_offer_variant === "string" ? session.metadata.referral_offer_variant : "";
  const value = raw.trim().toLowerCase();
  return value || undefined;
}

async function countRecentReferralRewards(code: string, windowMs: number, now = Date.now()) {
  const events = await getReferralEvents(code, 200);
  const windowStart = now - windowMs;
  return events.reduce((count, event) => {
    if (event.type !== "reward_granted") return count;
    if (event.createdAt < windowStart) return count;
    return count + 1;
  }, 0);
}

function getRecoveryUrl(session: Stripe.Checkout.Session): string | null {
  return session.after_expiration?.recovery?.url ?? null;
}

function extractShippingDetails(session: Stripe.Checkout.Session): Stripe.Checkout.Session.ShippingDetails | null {
  if (session.shipping_details) return session.shipping_details;
  const collected = (
    session as Stripe.Checkout.Session & {
      collected_information?: { shipping_details?: Stripe.Checkout.Session.ShippingDetails | null };
    }
  ).collected_information?.shipping_details;
  return collected ?? null;
}

function getPlan(
  session: Stripe.Checkout.Session,
  orderType: CheckoutOrderType,
  hasDigitalAddOn: boolean,
): CheckoutPlan | undefined {
  if (orderType === "print" && !hasDigitalAddOn) {
    return undefined;
  }
  const plan = typeof session.metadata?.plan === "string" ? session.metadata.plan : null;
  if (plan === "pack3" || plan === "subscription" || plan === "single") {
    return plan;
  }
  return session.mode === "subscription" ? "subscription" : "single";
}

function getCredits(session: Stripe.Checkout.Session, plan: CheckoutPlan | undefined): number {
  if (!plan) return 0;
  if (plan === "subscription") return 0;
  const raw = typeof session.metadata?.credits === "string" ? Number.parseInt(session.metadata.credits, 10) : NaN;
  if (Number.isFinite(raw) && raw > 0) return raw;
  return plan === "pack3" ? 3 : 1;
}

async function markSessionPaid(session: Stripe.Checkout.Session) {
  if (!session.id) return;
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") return;

  const existing = await kv.get<SessionRecord>(sessionKey(session.id));
  if (existing?.revoked) return;
  const alreadyPaid = existing?.paid === true;

  const orderType = getOrderType(session);
  const printVariant = getPrintVariant(session);
  const hasDigitalAddOn = includesDigitalAddOn(session);
  const printAssetId = getPrintAssetId(session);
  const plan = getPlan(session, orderType, hasDigitalAddOn);
  const credits = getCredits(session, plan);
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
  const customerId = typeof session.customer === "string" ? session.customer : null;
  const customerEmail = normalizeEmail(session.customer_details?.email ?? session.customer_email);
  const hasDigitalEntitlementCandidate =
    orderType === "print"
      ? hasDigitalAddOn && (plan === "subscription" || credits > 0)
      : plan === "subscription" || credits > 0;
  if (paymentIntentId) {
    const revokedRecord = await kv.get<{ revoked?: boolean; reason?: string }>(
      revokedPaymentIntentKey(paymentIntentId),
    );
    if (revokedRecord?.revoked) {
      await markSessionRevoked(session.id, revokedRecord.reason ?? "refund");
      return;
    }
  }

  await kv.set(sessionKey(session.id), {
    paid: true,
    created: Date.now(),
    revoked: false,
    mapId: resolveCheckoutMapIdFromStripeSession(session),
    paymentIntentId,
    amountTotal: session.amount_total ?? null,
    currency: session.currency ?? null,
    plan,
    creditsRemaining: credits || undefined,
    creditsTotal: credits || undefined,
    subscriptionId: subscriptionId ?? undefined,
    subscriptionActive: plan === "subscription" ? true : undefined,
    customerId: customerId ?? undefined,
    customerEmail: customerEmail ?? undefined,
    orderType,
    printVariant,
    includesDigitalAddOn: hasDigitalAddOn,
    printAssetId,
    referralCode: normalizeReferralCode(session.metadata?.referral_code) ?? undefined,
    referrerSessionId:
      typeof session.metadata?.referrer_session_id === "string"
        ? session.metadata.referrer_session_id.trim() || undefined
        : undefined,
    referralOfferVariant: getReferralOfferVariant(session),
  });

  if (customerEmail) {
    await upsertAccountLiteEmailSession({
      email: customerEmail,
      session: {
        sessionId: session.id,
        createdAt: typeof session.created === "number" ? session.created * 1000 : Date.now(),
        mapId: resolveCheckoutMapIdFromStripeSession(session),
        plan,
        orderType,
        printVariant,
        includesDigitalAddOn: hasDigitalAddOn,
        amountTotal: session.amount_total ?? null,
        currency: session.currency ?? null,
      },
    });
  }

  if (paymentIntentId) {
    await kv.set(paymentIntentKey(paymentIntentId), session.id);
    try {
      if (stripe) {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        const latestCharge =
          paymentIntent && typeof paymentIntent.latest_charge === "string"
            ? paymentIntent.latest_charge
            : null;
        if (latestCharge) {
          await kv.set(chargeKey(latestCharge), session.id);
        }
      }
    } catch (err) {
      console.warn("Stripe payment intent lookup failed", err);
    }
  }
  if (subscriptionId) {
    await kv.set(subscriptionKey(subscriptionId), session.id);
  }

  if (!alreadyPaid) {
    const skipProductionAnalytics = isQaStripeSession(session);
    await recordPaymentVerifiedOnce({
      sessionId: session.id,
      amountTotal: typeof session.amount_total === "number" ? session.amount_total : null,
      source: orderType === "print" ? "stripe_webhook_print" : "stripe_webhook_digital",
      plan: plan ?? undefined,
      skipProductionAnalytics,
      ga4Purchase: buildGa4PurchaseFromStripeSession(session),
    });
  }

  const mapId = resolveCheckoutMapIdFromStripeSession(session);
  if (mapId) {
    await refreshEntitledMapRecipeTtl(mapId);
  }

  if (!alreadyPaid && customerEmail && hasDigitalEntitlementCandidate && isAccountAccessEmailConfigured()) {
    const shouldSend = await kv.incr(accessEmailKey(session.id), 1, { ex: ACCESS_EMAIL_TTL_SECONDS });
    if (shouldSend === 1) {
      const current = await kv.get<SessionRecord>(sessionKey(session.id));
      if (current && hasRecoverableAccess(current)) {
        const alertResult = await sendPostPurchaseAccessEmail({
          siteOrigin: siteUrl,
          email: customerEmail,
          sessionId: session.id,
          record: current,
        });
        await kv.set(sessionKey(session.id), {
          ...current,
          accessEmailSentAt: alertResult.delivered ? Date.now() : current.accessEmailSentAt,
          accessEmailProvider: alertResult.provider,
          accessEmailError: alertResult.delivered ? undefined : alertResult.error,
        });
      }
    }
  }
}

async function markSessionRevoked(sessionId: string, reason: string) {
  const existing = await kv.get<SessionRecord>(sessionKey(sessionId));
  await kv.set(sessionKey(sessionId), {
    ...existing,
    paid: false,
    revoked: true,
    revokedAt: Date.now(),
    reason,
    subscriptionActive: false,
  });
}

async function markPaymentIntentRevoked(paymentIntentId: string, reason: string) {
  await kv.set(revokedPaymentIntentKey(paymentIntentId), {
    revoked: true,
    revokedAt: Date.now(),
    reason,
  });
}

async function resolveSessionIdFromPaymentIntent(paymentIntentId?: string | null) {
  if (!paymentIntentId) return null;
  return await kv.get<string>(paymentIntentKey(paymentIntentId));
}

async function resolveSessionIdFromCharge(chargeId?: string | null) {
  if (!chargeId) return null;
  const mapped = await kv.get<string>(chargeKey(chargeId));
  if (mapped) return mapped;
  const paymentIntentId = await resolvePaymentIntentIdFromCharge(chargeId);
  if (!paymentIntentId) return null;
  return await resolveSessionIdFromPaymentIntent(paymentIntentId);
}

async function resolvePaymentIntentIdFromCharge(chargeId?: string | null) {
  if (!chargeId || !stripe) return null;
  try {
    const charge = await stripe.charges.retrieve(chargeId);
    return typeof charge.payment_intent === "string" ? charge.payment_intent : null;
  } catch (err) {
    console.warn("Stripe charge lookup failed", err);
    return null;
  }
}

async function applyReferralReward(session: Stripe.Checkout.Session) {
  if (!session.id) return;
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") return;

  const referralCode = normalizeReferralCode(session.metadata?.referral_code);
  const referrerSessionId =
    typeof session.metadata?.referrer_session_id === "string" ? session.metadata.referrer_session_id.trim() : "";
  if (!referralCode || !referrerSessionId) return;
  if (referrerSessionId === session.id) return;

  const rewardStateKey = referralRewardedKey(session.id);
  const existingRewardState = await kv.get<ReferralConversionState>(rewardStateKey);
  if (existingRewardState?.rewarded) return;

  const orderType = getOrderType(session);
  const hasDigitalAddOn = includesDigitalAddOn(session);
  const amountTotal = typeof session.amount_total === "number" ? session.amount_total : 0;
  const referralSource = getReferralAttributionValue(session, "source");
  const referralMedium = getReferralAttributionValue(session, "medium");
  const referralCampaign = getReferralAttributionValue(session, "campaign");
  const referralContent = getReferralAttributionValue(session, "content");
  const referralOfferVariant = getReferralOfferVariant(session);
  const rewardEligible = (orderType === "digital" || hasDigitalAddOn) && amountTotal > 0;
  const stateBase: ReferralConversionState = {
    rewarded: true,
    createdAt: Date.now(),
    checkoutSessionId: session.id,
    referralCode,
    referrerSessionId,
    orderType,
    amountTotal,
    source: referralSource,
    medium: referralMedium,
    campaign: referralCampaign,
    content: referralContent,
    offerVariant: referralOfferVariant,
  };
  await kv.set(rewardStateKey, stateBase);

  const referralRecord = await kv.get<ReferralRecord>(referralKey(referralCode));
  if (!referralRecord || referralRecord.sessionId !== referrerSessionId) {
    await appendReferralEvent({
      code: referralCode,
      type: "reward_skipped",
      details: {
        reason: "code_mismatch_or_missing",
        checkoutSessionId: session.id,
        offerVariant: referralOfferVariant,
      },
    });
    await kv.set(rewardStateKey, {
      ...stateBase,
      rewardSkipReason: "code_mismatch_or_missing",
      rewardGranted: 0,
      conversionRecorded: false,
    });
    return;
  }

  let rewardGranted = 0;
  const checkoutCustomerId = typeof session.customer === "string" ? session.customer.trim() : "";
  const checkoutCustomerEmail = normalizeEmail(session.customer_details?.email ?? session.customer_email);
  const referrer = await kv.get<SessionRecord>(sessionKey(referrerSessionId));
  if (!referrer || referrer.revoked) {
    await appendReferralEvent({
      code: referralCode,
      type: "reward_skipped",
      details: {
        reason: "referrer_inactive",
        checkoutSessionId: session.id,
        offerVariant: referralOfferVariant,
      },
    });
    await kv.set(rewardStateKey, {
      ...stateBase,
      rewardSkipReason: "referrer_inactive",
      rewardGranted: 0,
      conversionRecorded: false,
    });
    return;
  }

  const sameCustomerId = Boolean(referrer.customerId && checkoutCustomerId && referrer.customerId === checkoutCustomerId);
  const referrerEmail = normalizeEmail(referrer.customerEmail);
  const sameEmail = Boolean(referrerEmail && checkoutCustomerEmail && referrerEmail === checkoutCustomerEmail);
  if (sameCustomerId || sameEmail) {
    await appendReferralEvent({
      code: referralCode,
      type: "reward_skipped",
      details: {
        reason: "self_referral",
        checkoutSessionId: session.id,
        offerVariant: referralOfferVariant,
      },
    });
    await kv.set(rewardStateKey, {
      ...stateBase,
      rewardSkipReason: "self_referral",
      rewardGranted: 0,
      conversionRecorded: false,
    });
    return;
  }

  const timestamp = Date.now();
  let rewardSkipReason: string | undefined;
  if (rewardEligible) {
    if (referrer.plan !== "subscription") {
      if (referralMaxRewardsPerReferrer24h > 0) {
        const recentRewardCount24h = await countRecentReferralRewards(
          referralCode,
          REFERRAL_REWARD_CAP_WINDOW_24H_MS,
          timestamp,
        );
        if (recentRewardCount24h >= referralMaxRewardsPerReferrer24h) {
          rewardSkipReason = "reward_cap_24h_reached";
        }
      }
      if (!rewardSkipReason && referralMaxRewardsPerReferrer30d > 0) {
        const recentRewardCount30d = await countRecentReferralRewards(
          referralCode,
          REFERRAL_REWARD_CAP_WINDOW_30D_MS,
          timestamp,
        );
        if (recentRewardCount30d >= referralMaxRewardsPerReferrer30d) {
          rewardSkipReason = "reward_cap_30d_reached";
        }
      }
      if (!rewardSkipReason) {
        const nextCredits = Math.max(0, referrer.creditsRemaining ?? 0) + referralRewardCredits;
        await kv.set(sessionKey(referrerSessionId), {
          ...referrer,
          paid: true,
          creditsRemaining: nextCredits,
          creditsTotal: Math.max(nextCredits, referrer.creditsTotal ?? 0),
        });
        rewardGranted = referralRewardCredits;
      }
    } else {
      rewardSkipReason = "subscription_referrer";
    }
  } else {
    rewardSkipReason = "ineligible_order";
  }

  await kv.set(referralKey(referralCode), {
    ...referralRecord,
    conversions: (referralRecord.conversions ?? 0) + 1,
    rewardsGranted: (referralRecord.rewardsGranted ?? 0) + rewardGranted,
    lastConvertedAt: timestamp,
  });
  await kv.set(rewardStateKey, {
    ...stateBase,
    rewardGranted,
    rewardSkipReason: rewardGranted > 0 ? undefined : rewardSkipReason ?? "not_eligible",
    conversionRecorded: true,
  });

  await appendReferralEvent({
    code: referralCode,
    type: "conversion_recorded",
    createdAt: timestamp,
    details: {
      checkoutSessionId: session.id,
      orderType,
      amountTotal,
      rewardGranted,
      source: referralSource,
      medium: referralMedium,
      campaign: referralCampaign,
      content: referralContent,
      offerVariant: referralOfferVariant,
    },
  });

  if (rewardGranted > 0) {
    await appendReferralEvent({
      code: referralCode,
      type: "reward_granted",
      createdAt: timestamp,
      details: {
        checkoutSessionId: session.id,
        rewardGranted,
        source: referralSource,
        medium: referralMedium,
        campaign: referralCampaign,
        content: referralContent,
        offerVariant: referralOfferVariant,
      },
    });
  } else {
    await appendReferralEvent({
      code: referralCode,
      type: "reward_skipped",
      createdAt: timestamp,
      details: {
        checkoutSessionId: session.id,
        reason: rewardSkipReason ?? "not_eligible",
        source: referralSource,
        medium: referralMedium,
        campaign: referralCampaign,
        content: referralContent,
        offerVariant: referralOfferVariant,
      },
    });
  }
}

async function reverseReferralReward(sessionId: string, reason: "refund" | "dispute") {
  if (!sessionId) return;

  const rewardStateKey = referralRewardedKey(sessionId);
  const rewardState = await kv.get<ReferralConversionState>(rewardStateKey);
  if (!rewardState?.rewarded) return;
  if (!rewardState.referralCode || !rewardState.referrerSessionId) return;
  if (rewardState.conversionRecorded !== true) return;

  const referralCode = normalizeReferralCode(rewardState.referralCode);
  if (!referralCode) return;
  const rewardGranted = Math.max(0, Math.floor(rewardState.rewardGranted ?? 0));
  const conversionAlreadyReversed = rewardState.conversionReversed === true;
  const rewardAlreadyReversed = rewardGranted <= 0 || rewardState.rewardReversed === true;
  if (conversionAlreadyReversed && rewardAlreadyReversed) return;

  const referralRecord = await kv.get<ReferralRecord>(referralKey(referralCode));
  if (!referralRecord || referralRecord.sessionId !== rewardState.referrerSessionId) {
    await kv.set(rewardStateKey, {
      ...rewardState,
      reversalReason: reason,
    });
    return;
  }

  const timestamp = Date.now();
  const nextReferralRecord: ReferralRecord = {
    ...referralRecord,
    conversions:
      conversionAlreadyReversed || rewardState.conversionRecorded !== true
        ? referralRecord.conversions ?? 0
        : Math.max(0, (referralRecord.conversions ?? 0) - 1),
    rewardsGranted:
      rewardAlreadyReversed || rewardGranted <= 0
        ? referralRecord.rewardsGranted ?? 0
        : Math.max(0, (referralRecord.rewardsGranted ?? 0) - rewardGranted),
  };
  await kv.set(referralKey(referralCode), nextReferralRecord);

  let rewardReclaimed = 0;
  if (!rewardAlreadyReversed && rewardGranted > 0) {
    const referrer = await kv.get<SessionRecord>(sessionKey(rewardState.referrerSessionId));
    if (referrer && referrer.plan !== "subscription") {
      const currentCredits = Math.max(0, referrer.creditsRemaining ?? 0);
      rewardReclaimed = Math.min(currentCredits, rewardGranted);
      await kv.set(sessionKey(rewardState.referrerSessionId), {
        ...referrer,
        paid: true,
        creditsRemaining: Math.max(0, currentCredits - rewardReclaimed),
      });
    }
  }

  await kv.set(rewardStateKey, {
    ...rewardState,
    conversionReversed: true,
    conversionReversedAt: conversionAlreadyReversed ? rewardState.conversionReversedAt : timestamp,
    rewardReversed: rewardAlreadyReversed ? rewardState.rewardReversed : rewardGranted > 0,
    rewardReversedAt:
      rewardAlreadyReversed || rewardGranted <= 0
        ? rewardState.rewardReversedAt
        : timestamp,
    reversalReason: reason,
    rewardReclaimed:
      rewardAlreadyReversed || rewardGranted <= 0 ? rewardState.rewardReclaimed : rewardReclaimed,
  });

  if (!conversionAlreadyReversed) {
    await appendReferralEvent({
      code: referralCode,
      type: "conversion_reversed",
      createdAt: timestamp,
      details: {
        checkoutSessionId: sessionId,
        reason,
        orderType: rewardState.orderType,
        amountTotal: rewardState.amountTotal,
        source: rewardState.source,
        medium: rewardState.medium,
        campaign: rewardState.campaign,
        content: rewardState.content,
        offerVariant: rewardState.offerVariant,
      },
    });
  }

  if (!rewardAlreadyReversed && rewardGranted > 0) {
    await appendReferralEvent({
      code: referralCode,
      type: "reward_reversed",
      createdAt: timestamp,
      details: {
        checkoutSessionId: sessionId,
        reason,
        rewardGranted,
        rewardReclaimed,
        source: rewardState.source,
        medium: rewardState.medium,
        campaign: rewardState.campaign,
        content: rewardState.content,
        offerVariant: rewardState.offerVariant,
      },
    });
  }
}

async function queuePrintOrder(session: Stripe.Checkout.Session) {
  if (!session.id) return;
  if (getOrderType(session) !== "print") return;

  const persistProblemPrintOrder = async (record: PrintOrderRecord) => {
    const nextRecord: PrintOrderRecord = {
      ...record,
      error: record.error ?? "print_order_needs_review",
      // Ordinary/nonterminal failure writers must not inherit stale terminal provenance.
      ...(record.status === "failed" ? { terminalEventType: null as const } : {}),
    };
    if (!nextRecord.operatorFailureAlertedAt) {
      const alertResult = await sendPrintOrderFailureAlert(nextRecord);
      if (alertResult.delivered) {
        nextRecord.operatorFailureAlertedAt = Date.now();
        nextRecord.operatorFailureAlertProvider = alertResult.provider;
        nextRecord.operatorFailureAlertError = undefined;
      } else {
        nextRecord.operatorFailureAlertProvider = alertResult.provider;
        nextRecord.operatorFailureAlertError = alertResult.error;
      }
    }
    // Fail-closed: unretainable delete must not look like durable problem-state success.
    assertPrintOrderRetained(await persistPrintOrderRecord(session.id, nextRecord));
  };

  const existing = await kv.get<PrintOrderRecord>(printOrderKey(session.id));
  if (existing?.status === "sent") {
    void sendPrintOrderConfirmation(session.id).catch((error) => {
      console.warn("Print confirmation email retry on sent order failed", error);
    });
    return;
  }

  let payload: PrintOrderRecord = {
    status: "pending",
    sessionId: session.id,
    mapId: resolveCheckoutMapIdFromStripeSession(session),
    printVariant: getPrintVariant(session) ?? "poster_framed",
    merchFamily: getMerchFamilyFromSession(session),
    merchCatalogVariantId: getMerchCatalogVariantId(session),
    merchSize: getMerchSize(session),
    merchColor: getMerchColor(session),
    includesDigitalAddOn: includesDigitalAddOn(session),
    includesCardAddOn: includesCardAddOn(session),
    printAssetId: getPrintAssetId(session),
    cardPrintAssetId: getPrintCardAssetId(session),
    amountTotal: session.amount_total,
    currency: session.currency,
    customerEmail: session.customer_details?.email ?? session.customer_email ?? null,
    customerName: session.customer_details?.name ?? null,
    customerPhone: extractCheckoutPhoneFromStripeSession(session),
    shippingDetails: extractShippingDetails(session),
    attempts: (existing?.attempts ?? 0) + 1,
    createdAt: resolvePrintOrderCreatedAt(existing),
  };
  // Pending queue write must remain durable. Deleted/unretainable aborts before Printful.
  assertPrintOrderRetained(await persistPrintOrderRecord(session.id, payload));

  const printAssetId = payload.printAssetId;
  if (!printAssetId) {
    await persistProblemPrintOrder({
      ...payload,
      status: "failed",
      error: "print_asset_missing",
    });
    return;
  }

  const printAssetUrl = buildPrintAssetUrl(siteUrl, printAssetId);
  await extendPrintAssetTtlForFulfillment(printAssetId).catch((error) => {
    console.warn("Print asset TTL extension failed", { printAssetId, error });
  });

  const cardPrintAssetId = payload.cardPrintAssetId;
  let cardPrintAssetUrl: string | undefined;
  if (payload.includesCardAddOn) {
    if (!cardPrintAssetId) {
      await persistProblemPrintOrder({
        ...payload,
        printAssetUrl,
        status: "failed",
        error: "card_print_asset_missing",
      });
      return;
    }
    cardPrintAssetUrl = buildPrintAssetUrl(siteUrl, cardPrintAssetId);
    await extendPrintAssetTtlForFulfillment(cardPrintAssetId).catch((error) => {
      console.warn("Card print asset TTL extension failed", { cardPrintAssetId, error });
    });
  }

  let recipient = getPrintRecipient(payload);
  if (!recipient && stripe) {
    try {
      const latest = await stripe.checkout.sessions.retrieve(session.id);
      payload = {
        ...payload,
        amountTotal:
          typeof latest.amount_total === "number" && Number.isFinite(latest.amount_total)
            ? latest.amount_total
            : payload.amountTotal ?? null,
        currency: latest.currency ?? payload.currency ?? null,
        customerEmail: latest.customer_details?.email ?? latest.customer_email ?? payload.customerEmail ?? null,
        customerName: latest.customer_details?.name ?? payload.customerName ?? null,
        customerPhone: extractCheckoutPhoneFromStripeSession(latest) ?? payload.customerPhone ?? null,
        shippingDetails: extractShippingDetails(latest),
      };
      assertPrintOrderRetained(await persistPrintOrderRecord(session.id, payload));
      recipient = getPrintRecipient(payload);
    } catch (error) {
      if (isDurableKvPersistenceError(error) || isPrintOrderUnretainableError(error)) throw error;
      console.warn("Print order recipient refresh failed", error);
    }
  }
  if (!recipient) {
    await persistProblemPrintOrder({
      ...payload,
      printAssetUrl,
      status: "failed",
      error: "shipping_details_missing",
    });
    return;
  }

  if (!hasSufficientPrintCharge(payload.amountTotal)) {
    await persistProblemPrintOrder({
      ...payload,
      printAssetUrl,
      status: "failed",
      error: `print_amount_below_minimum:${getPrintMinChargeCents()}`,
    });
    return;
  }

  const marginCheck = payload.merchCatalogVariantId
    ? { allowed: true, code: "merch_margin_skipped" as const, minMarginCents: 0 }
    : evaluatePrintMarginForPaidOrder({
        variant: payload.printVariant,
        shippingCountry: recipient.country_code,
        amountTotalCents: payload.amountTotal ?? null,
      });
  if (!marginCheck.allowed) {
    await persistProblemPrintOrder({
      ...payload,
      printAssetUrl,
      status: "failed",
      error:
        marginCheck.code === "margin_below_threshold"
          ? `print_margin_below_minimum:${marginCheck.minMarginCents}`
          : "print_margin_estimate_unavailable",
    });
    return;
  }

  if (!printOrderSubmissionEnabled) {
    await persistProblemPrintOrder({
      ...payload,
      printAssetUrl,
      status: "pending",
      error: "submission_disabled",
    });
    return;
  }

  if (payload.merchCatalogVariantId) {
    if (!isPrintfulV2Configured() && !printFulfillmentWebhookUrl) {
      await persistProblemPrintOrder({
        ...payload,
        printAssetUrl,
        status: "failed",
        error: "fulfillment_not_configured",
      });
      return;
    }

    if (isPrintfulV2Configured()) {
      const family = payload.merchFamily ? getMerchFamily(payload.merchFamily) : null;
      const printfulResult = await submitPrintfulV2CatalogOrder({
        externalId: session.id,
        catalogVariantId: payload.merchCatalogVariantId,
        fileUrl: printAssetUrl,
        recipient,
        placement: family?.placement ?? "default",
        technique: family?.technique ?? "digital",
        itemName: family?.labelFallback ?? "Custom Star Map merch",
      });
      if (!printfulResult.ok) {
        await persistProblemPrintOrder({
          ...payload,
          printAssetUrl,
          status: "failed",
          webhookStatus: printfulResult.status,
          error: printfulResult.error ?? "printful_v2_order_failed",
        });
        return;
      }
      const sentRecord: PrintOrderRecord = {
        ...payload,
        printAssetUrl,
        status: "sent",
        webhookStatus: printfulResult.status,
        printfulOrderId: printfulResult.orderId,
        sentAt: Date.now(),
        error: undefined,
        terminalEventType: null,
      };
      // Bind DO identity (+ KV/index) before optional file review/alerts.
      const {
        identityPersist: sentPersist,
        record: reviewedRecord,
        bindOk,
        bindBlockedByTerminal,
        bindFailureReason,
      } = await bindAcceptedPrintfulIdentityThenReview({
        sessionId: session.id,
        sentRecord,
        existingKv: payload,
      });
      if (sentPersist?.outcome === "deleted_unretainable") {
        // Provider already accepted. Index is written inside the helper; throw so the
        // outer handler writes event dedupe before any further work (tight crash window).
        console.error("Print order sent but durable record unretainable after provider success", {
          sessionId: session.id,
          reason: sentPersist.reason,
          printfulOrderId: reviewedRecord.printfulOrderId ?? null,
        });
        throw new PrintOrderUnretainableError(sentPersist.reason);
      }
      if (
        bindOk &&
        sentPersist?.outcome === "persisted" &&
        !bindBlockedByTerminal &&
        !bindFailureReason
      ) {
        void sendPrintOrderConfirmation(session.id).catch((error) => {
          console.warn("Print confirmation email failed", { sessionId: session.id, error });
        });
      }
      if (!bindOk || bindBlockedByTerminal || bindFailureReason) {
        // Provider already accepted — do not finalize Stripe dedupe while DO bind is unbound/conflicted/unread.
        console.error("Print order provider accepted but authority bind failed; leaving Stripe event retryable", {
          sessionId: session.id,
          bindFailureReason: bindFailureReason ?? (bindBlockedByTerminal ? "terminal_blocks_bind" : "bind_rejected"),
          printfulOrderId: reviewedRecord.printfulOrderId ?? null,
        });
        throw new PrintOrderAuthorityBindError(
          bindFailureReason ?? (bindBlockedByTerminal ? "terminal_blocks_bind" : "bind_rejected"),
        );
      }
    }
    return;
  }

  if (!isPrintfulConfigured() && !printFulfillmentWebhookUrl) {
    await persistProblemPrintOrder({
      ...payload,
      printAssetUrl,
      status: "failed",
      error: "fulfillment_not_configured",
    });
    return;
  }

  if (isPrintfulConfigured()) {
    const printfulResult = await submitPrintfulOrder({
      externalId: session.id,
      variant: payload.printVariant,
      fileUrl: printAssetUrl,
      recipient,
      additionalVariants: payload.includesCardAddOn ? ["card_4x6"] : undefined,
      variantFileUrls: cardPrintAssetUrl ? { card_4x6: cardPrintAssetUrl } : undefined,
    });
    if (!printfulResult.ok) {
      await persistProblemPrintOrder({
        ...payload,
        printAssetUrl,
        status: "failed",
        webhookStatus: printfulResult.status,
        error: printfulResult.error ?? "printful_order_failed",
      });
      return;
    }
    const sentRecord: PrintOrderRecord = {
      ...payload,
      printAssetUrl,
      cardPrintAssetUrl,
      status: "sent",
      webhookStatus: printfulResult.status,
      printfulOrderId: printfulResult.orderId,
      sentAt: Date.now(),
      error: undefined,
      terminalEventType: null,
    };
    // Bind DO identity (+ KV/index) before optional file review/alerts.
    const {
      identityPersist: sentPersist,
      record: reviewedRecord,
      bindOk,
      bindBlockedByTerminal,
      bindFailureReason,
    } = await bindAcceptedPrintfulIdentityThenReview({
      sessionId: session.id,
      sentRecord,
      existingKv: payload,
    });
    if (sentPersist?.outcome === "deleted_unretainable") {
      // Provider already accepted. Index is written inside the helper; throw so event
      // dedupe is written immediately in the outer handler (no remint soft-return gap).
      console.error("Print order sent but durable record unretainable after provider success", {
        sessionId: session.id,
        reason: sentPersist.reason,
        printfulOrderId: reviewedRecord.printfulOrderId ?? null,
      });
      throw new PrintOrderUnretainableError(sentPersist.reason);
    }
    if (
      bindOk &&
      sentPersist?.outcome === "persisted" &&
      !bindBlockedByTerminal &&
      !bindFailureReason
    ) {
      void sendPrintOrderConfirmation(session.id).catch((error) => {
        console.warn("Print confirmation email failed", { sessionId: session.id, error });
      });
    }
    if (!bindOk || bindBlockedByTerminal || bindFailureReason) {
      // Provider already accepted — do not finalize Stripe dedupe while DO bind is unbound/conflicted/unread.
      console.error("Print order provider accepted but authority bind failed; leaving Stripe event retryable", {
        sessionId: session.id,
        bindFailureReason: bindFailureReason ?? (bindBlockedByTerminal ? "terminal_blocks_bind" : "bind_rejected"),
        printfulOrderId: reviewedRecord.printfulOrderId ?? null,
      });
      throw new PrintOrderAuthorityBindError(
        bindFailureReason ?? (bindBlockedByTerminal ? "terminal_blocks_bind" : "bind_rejected"),
      );
    }
  }

  if (!printFulfillmentWebhookUrl) return;

  let webhookResponse: Response;
  try {
    webhookResponse = await fetch(printFulfillmentWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildAlternateFulfillmentWebhookPayload(payload, {
          printAssetUrl,
          cardPrintAssetUrl,
          recipient,
        }),
      ),
    });
    if (!webhookResponse.ok) {
      const body = await webhookResponse.text().catch(() => "");
      throw new Error(`Webhook ${webhookResponse.status}: ${body.slice(0, 280)}`);
    }
  } catch (error) {
    // Outbound fulfillment failures only — durable persistence errors must not land here.
    if (isDurableKvPersistenceError(error)) throw error;
    if (!isPrintfulConfigured()) {
      await persistProblemPrintOrder({
        ...payload,
        printAssetUrl,
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 320) : "webhook_failed",
      });
    }
    return;
  }

  // Successful external side effect: persist "sent" outside the outbound catch so a
  // transient KV failure cannot be rewritten as a webhook/provider failure.
  if (!isPrintfulConfigured()) {
    const sentPersist = await persistPrintOrderRecord(session.id, {
      ...payload,
      printAssetUrl,
      status: "sent",
      webhookStatus: webhookResponse.status,
      sentAt: Date.now(),
      error: undefined,
      terminalEventType: null,
    });
    if (sentPersist.outcome === "deleted_unretainable") {
      console.error("Alternate fulfillment webhook succeeded but durable record unretainable", {
        sessionId: session.id,
        reason: sentPersist.reason,
      });
      throw new PrintOrderUnretainableError(sentPersist.reason);
    }
  }
}

async function hydrateExpiredSession(session: Stripe.Checkout.Session) {
  const hasRecoveryUrl = Boolean(getRecoveryUrl(session));
  const hasCustomerEmail = Boolean(normalizeEmail(session.customer_details?.email ?? session.customer_email));
  if ((hasRecoveryUrl && hasCustomerEmail) || !stripe || !session.id) {
    return session;
  }

  try {
    return await stripe.checkout.sessions.retrieve(session.id);
  } catch (error) {
    console.warn("Stripe expired session refresh failed", error);
    return session;
  }
}

async function handleExpiredCheckoutSession(
  session: Stripe.Checkout.Session,
  eventCreated: number,
  eventId?: string,
): Promise<{ retryable: boolean }> {
  if (!session.id) return { retryable: false };

  const hydrated = await hydrateExpiredSession(session);
  const orderType = getOrderType(hydrated);
  const printVariant = getPrintVariant(hydrated);
  const hasDigitalAddOn = includesDigitalAddOn(hydrated);
  const plan = getPlan(hydrated, orderType, hasDigitalAddOn);
  const recoveryUrl = getRecoveryUrl(hydrated);
  const customerEmail = normalizeEmail(hydrated.customer_details?.email ?? hydrated.customer_email);
  const customerId = typeof hydrated.customer === "string" ? hydrated.customer : null;
  const expiresAtMs =
    typeof hydrated.expires_at === "number" && Number.isFinite(hydrated.expires_at)
      ? hydrated.expires_at * 1000
      : eventCreated * 1000;
  const existing = await kv.get<SessionRecord>(sessionKey(hydrated.id));

  // Used only for confirmed-delivery success writes. Non-delivered / already-delivered /
  // observed-winner paths must not rewrite sessionKey (stale repairs erased provider).
  const expiredBase: SessionRecord = {
    paid: false,
    created:
      existing?.created ??
      (typeof hydrated.created === "number" && Number.isFinite(hydrated.created) ? hydrated.created * 1000 : Date.now()),
    mapId: resolveCheckoutMapIdFromStripeSession(hydrated),
    paymentIntentId: typeof hydrated.payment_intent === "string" ? hydrated.payment_intent : existing?.paymentIntentId,
    amountTotal: hydrated.amount_total ?? existing?.amountTotal ?? null,
    currency: hydrated.currency ?? existing?.currency ?? null,
    plan,
    customerId: customerId ?? existing?.customerId ?? undefined,
    customerEmail: customerEmail ?? existing?.customerEmail ?? undefined,
    orderType,
    printVariant,
    includesDigitalAddOn: hasDigitalAddOn,
    printAssetId: getPrintAssetId(hydrated) ?? existing?.printAssetId,
    expiredAt: expiresAtMs,
    recoveryUrl,
  };

  let recoveryOutcome: CheckoutRecoveryRetryability | "skipped" | "already_delivered" = "skipped";
  let wroteSuccessSession = false;

  if (recoveryUrl && customerEmail) {
    const deliveredMarker = await kv.get(checkoutRecoveryEmailDeliveredKey(hydrated.id));
    const sessionAlreadySucceeded = Boolean(existing?.recoveryEmailSentAt);
    const markerPresent = isCheckoutRecoveryDeliveredMarker(deliveredMarker);

    if (sessionAlreadySucceeded || markerPresent) {
      recoveryOutcome = "already_delivered";
      // Session success without marker: backfill marker only — never rewrite sessionKey.
      if (sessionAlreadySucceeded && !markerPresent) {
        await kv.set(
          checkoutRecoveryEmailDeliveredKey(hydrated.id),
          { delivered: true as const, at: existing!.recoveryEmailSentAt as number },
          { ex: CHECKOUT_RECOVERY_EMAIL_DELIVERED_TTL_SECONDS },
        );
      }
      // Marker-only (session not yet visible): acknowledge without touching sessionKey.
    } else {
      const attemptId = createCheckoutRecoveryAttemptId();
      // Bound Resend dispatch to event.created + safe window inside Resend's 24h
      // Idempotency-Key retention. Past the deadline (or untrusted event.created): fail
      // closed without calling Resend — prefer no late duplicate over a possibly-missed send.
      const dispatchGate = evaluateCheckoutRecoveryProviderDispatchGate({
        eventCreatedSeconds: eventCreated,
        nowMs: Date.now(),
      });
      const alertResult = dispatchGate.allowed
        ? await sendCheckoutRecoveryAlert({
            sessionId: hydrated.id,
            email: customerEmail,
            recoveryUrl,
            orderType,
            plan: plan ?? undefined,
            printVariant,
            includesDigitalAddOn: hasDigitalAddOn,
            amountTotal: hydrated.amount_total,
            currency: hydrated.currency,
          })
        : checkoutRecoveryProviderDispatchSuppressedResult(
            dispatchGate.errorCode ?? "untrusted_event_created"
          );

      const attemptRecord = buildCheckoutRecoveryAttemptRecord({
        attemptId,
        result: alertResult,
        eventId,
      });
      await kv.set(checkoutRecoveryEmailAttemptKey(hydrated.id, attemptId), attemptRecord, {
        ex: CHECKOUT_RECOVERY_ATTEMPT_TTL_SECONDS,
      });

      if (alertResult.delivered) {
        const deliveredFields = applyCheckoutRecoveryDeliveredSessionFields(alertResult);
        // Persist canonical success before the separate delivered marker, using a durable
        // write path that surfaces Cloudflare put failures (never local-only success).
        const latest = (await kv.get<SessionRecord>(sessionKey(hydrated.id))) ?? existing ?? {};
        try {
          await kv.setDurable(sessionKey(hydrated.id), {
            ...latest,
            ...expiredBase,
            ...deliveredFields,
          });
          wroteSuccessSession = true;
          recoveryOutcome = alertResult.retryability;
          await kv.set(
            checkoutRecoveryEmailDeliveredKey(hydrated.id),
            { delivered: true as const, at: deliveredFields.recoveryEmailSentAt ?? Date.now() },
            { ex: CHECKOUT_RECOVERY_EMAIL_DELIVERED_TTL_SECONDS },
          );
        } catch (error) {
          console.warn("Checkout recovery durable session persistence failed; deferring marker", error);
          // Attempt record already written. Do not write delivered marker or claim durable session.
          // Still inside safe window: leave retryable — Idempotency-Key prevents duplicate send.
          // A later Stripe redelivery past the deadline will suppress Resend (fail closed).
          recoveryOutcome = "retryable";
        }
      } else {
        // Non-delivered: attempt record only. Acknowledge visible winner without session rewrite.
        const latestMarker = await kv.get(checkoutRecoveryEmailDeliveredKey(hydrated.id));
        const latestSession = await kv.get<SessionRecord>(sessionKey(hydrated.id));
        const observedSessionSuccess = Boolean(latestSession?.recoveryEmailSentAt);
        const observedMarker = isCheckoutRecoveryDeliveredMarker(latestMarker);
        if (observedSessionSuccess || observedMarker) {
          recoveryOutcome = "already_delivered";
          if (observedSessionSuccess && !observedMarker) {
            await kv.set(
              checkoutRecoveryEmailDeliveredKey(hydrated.id),
              { delivered: true as const, at: latestSession!.recoveryEmailSentAt as number },
              { ex: CHECKOUT_RECOVERY_EMAIL_DELIVERED_TTL_SECONDS },
            );
          }
        } else {
          recoveryOutcome = alertResult.retryability;
        }
      }
    }
  }

  await recordCheckoutExpiredOnce({
    sessionId: hydrated.id,
    source: orderType === "print" ? "stripe_checkout_expired_print" : "stripe_checkout_expired_digital",
    plan: orderType === "print" ? printVariant : plan,
    occurredAt: expiresAtMs,
  });

  // Final visibility check for HTTP status (Workers KV is not a CAS).
  const finalMarker = await kv.get(checkoutRecoveryEmailDeliveredKey(hydrated.id));
  const finalSession = await kv.get<SessionRecord>(sessionKey(hydrated.id));
  const deliveryVisible =
    wroteSuccessSession ||
    Boolean(finalSession?.recoveryEmailSentAt) ||
    isCheckoutRecoveryDeliveredMarker(finalMarker);

  const retryable =
    !deliveryVisible && isCheckoutRecoveryWebhookRetryable(recoveryOutcome);
  return { retryable };
}

export async function POST(req: Request) {
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook not configured" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const payload = await req.text();
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const eventDedupeKey = ENTITLEMENT_KV.stripeWebhookEvent(event.id);
  const isExpiredCheckoutEvent = event.type === "checkout.session.expired";
  const isCompletedCheckoutEvent = event.type === "checkout.session.completed";
  // Defer dedupe finalization for events whose critical side effects must remain
  // Stripe-retryable when durable persistence fails mid-handling.
  const deferDedupeUntilSuccess = isExpiredCheckoutEvent || isCompletedCheckoutEvent;

  // Unrelated Stripe event types keep pre-processing dedupe.
  // checkout.session.expired / checkout.session.completed finalize dedupe only after
  // successful handling so retryable durable failures remain eligible for redelivery.
  if (!deferDedupeUntilSuccess) {
    const dedupeCount = await kv.incr(eventDedupeKey, 1, {
      ex: WEBHOOK_EVENT_DEDUPE_TTL_SECONDS,
    });
    if (dedupeCount > 1) {
      return NextResponse.json({ received: true, duplicate: true });
    }
  } else {
    const existingEvent = await kv.get(eventDedupeKey);
    if (existingEvent) {
      return NextResponse.json({ received: true, duplicate: true });
    }
  }

  let expiredRecoveryRetryable = false;
  let completedCheckoutRetryable = false;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      try {
        await markSessionPaid(session);
        await queuePrintOrder(session);
        await applyReferralReward(session);
      } catch (error) {
        // Unretainable / deleted durable print-order state must fail closed and
        // finalize the Stripe event — retrying would remint retention and risk a
        // duplicate provider order. True KV outages remain Stripe-retryable.
        if (isPrintOrderUnretainableError(error)) {
          console.error("Print order unretainable; finalizing webhook without provider retry", {
            sessionId: session.id,
            reason: error.reason,
          });
          // Must persist event dedupe before treating this as terminal. If dedupe
          // cannot be written, return retryable 503 — provider reconcile (v1/v2)
          // prevents a second order if the provider already accepted.
          const deduped = await persistWebhookEventDedupe(eventDedupeKey, {
            reason: "print_order_unretainable",
          });
          if (!deduped) {
            completedCheckoutRetryable = true;
          }
          break;
        }
        // Durable print-order persistence failure must not finalize dedupe — Stripe
        // redelivery must be able to queue the paid order again.
        if (isPrintOrderAuthorityBindError(error)) {
          // Provider accepted but DO bind unread/conflicted — Stripe must retry; do not finalize dedupe.
          console.error("Print order authority bind failed after provider accept; Stripe event remains retryable", {
            sessionId: session.id,
            reason: error.reason,
          });
          completedCheckoutRetryable = true;
          break;
        }
        if (isDurableKvPersistenceError(error)) {
          completedCheckoutRetryable = true;
          break;
        }
        throw error;
      }
      {
        const deduped = await persistWebhookEventDedupe(eventDedupeKey);
        if (!deduped) {
          completedCheckoutRetryable = true;
        }
      }
      break;
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const outcome = await handleExpiredCheckoutSession(session, event.created, event.id);
      if (outcome.retryable) {
        expiredRecoveryRetryable = true;
      } else {
        await kv.set(eventDedupeKey, { received: true }, { ex: WEBHOOK_EVENT_DEDUPE_TTL_SECONDS });
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      if (!subscription.id) break;
      const sessionId = await kv.get<string>(subscriptionKey(subscription.id));
      if (!sessionId) break;
      const existing = await kv.get<SessionRecord>(sessionKey(sessionId));
      const active = subscription.status === "active" || subscription.status === "trialing";
      await kv.set(sessionKey(sessionId), {
        ...existing,
        paid: active,
        revoked: !active,
        subscriptionActive: active,
        revokedAt: active ? undefined : Date.now(),
        reason: active ? undefined : "subscription_inactive",
      });
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      if ((charge.amount_refunded ?? 0) <= 0 && !charge.refunded) break;
      let paymentIntentId =
        typeof charge.payment_intent === "string" ? charge.payment_intent : null;
      const sessionId =
        (await resolveSessionIdFromPaymentIntent(paymentIntentId)) ??
        (await resolveSessionIdFromCharge(charge.id));
      if (sessionId) {
        await markSessionRevoked(sessionId, "refund");
        await reverseReferralReward(sessionId, "refund");
      } else {
        if (!paymentIntentId) {
          paymentIntentId = await resolvePaymentIntentIdFromCharge(charge.id);
        }
        if (paymentIntentId) {
          await markPaymentIntentRevoked(paymentIntentId, "refund");
        }
      }
      break;
    }
    case "charge.dispute.created":
    case "charge.dispute.funds_withdrawn": {
      const dispute = event.data.object as Stripe.Dispute;
      let paymentIntentId =
        typeof dispute.payment_intent === "string" ? dispute.payment_intent : null;
      const chargeId = typeof dispute.charge === "string" ? dispute.charge : null;
      const sessionId =
        (await resolveSessionIdFromPaymentIntent(paymentIntentId)) ??
        (await resolveSessionIdFromCharge(chargeId));
      if (sessionId) {
        await markSessionRevoked(sessionId, "dispute");
        await reverseReferralReward(sessionId, "dispute");
      } else {
        if (!paymentIntentId && chargeId) {
          paymentIntentId = await resolvePaymentIntentIdFromCharge(chargeId);
        }
        if (paymentIntentId) {
          await markPaymentIntentRevoked(paymentIntentId, "dispute");
        }
      }
      break;
    }
    default:
      break;
  }

  if (expiredRecoveryRetryable || completedCheckoutRetryable) {
    return NextResponse.json(
      {
        error: completedCheckoutRetryable
          ? "print_order_queue_retryable"
          : "checkout_recovery_retryable",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ received: true });
}
