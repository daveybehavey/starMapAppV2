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
import {
  appendReferralEvent,
  appendReferralRewardGrant,
  countRecentReferralRewardGrants,
  type ReferralEvent,
} from "@/lib/referralLedger";
import { createEntitlementAuthorityClient } from "@/lib/entitlementAuthority";
import {
  acquireAccountingLease,
  releaseAccountingLease,
  sealAccountingLease,
} from "@/lib/entitlementMigration";
import {
  ReferralGrantTransientError,
  grantReferralRewardViaAuthority,
  isEntitlementAuthorityRoutingEnabled,
  isReferralGrantTransientError,
  isTransientReferralGrantReason,
  reverseReferralRewardViaAuthority,
} from "@/lib/referralRewardAuthority";
import { createReferralDiscoveryClient } from "@/lib/referralDiscoveryClient";
import type { StripeSessionEntitlement } from "@/lib/entitlementsStore";
import { isPrintfulConfigured, submitPrintfulOrder } from "@/lib/printful";
import { isPrintfulV2Configured, submitPrintfulV2CatalogOrder } from "@/lib/printfulV2Orders";
import { PRINT_ASSET_ID_REGEX } from "@/lib/printAssets";
import {
  alternateDispatchBlocksRedispatch,
  alternateFulfillmentDispatchId,
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
import { giftFlagForRecord } from "@/lib/checkoutGiftFlag";
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
  readSessionRevocationEvidenceStrict,
  refreshEntitledMapRecipeTtl,
  settleSessionPurchase,
  withSettlementMetadata,
  SETTLEMENT_SCHEMA_VERSION,
  type SessionRevocationEvidence,
  type RevocationUnresolvedRecord,
  type RecoveryResultRecord,
  type SettlementPurchaseTerms,
  type SettlementReceipt,
} from "@/lib/entitlementsStore";
import {
  evaluateCheckoutSessionDiscountFulfillment,
  isDiscountFulfillmentRetryable,
  isFulfillableCheckoutPayment,
  sessionHasAppliedDiscount,
  type CouponLookup,
} from "@/lib/checkoutPromotions";

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

function createStripeCouponLookup(client: Stripe): CouponLookup {
  return {
    retrieveCoupon: (id) => client.coupons.retrieve(id),
    retrievePromotionCode: (id) =>
      client.promotionCodes.retrieve(id, { expand: ["coupon"] }),
  };
}

type SessionRecord = {
  paid?: boolean;
  /** Option B interim settlement receipt (see lib/entitlementsStore.ts). */
  settlementReceipt?: SettlementReceipt;
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
  isGift?: boolean;
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

/**
 * S93-1 item 4: the conversion state's explicit processing phase.
 * Absent on records written before this protocol — the entry
 * disposition in applyReferralReward defines how those are read.
 * - pending: checkpoint written before grant processing; a replay
 *   checkpoint, NOT an exclusion and NOT a claim of reward.
 * - grant_confirmed: the authority accepted the grant; bookkeeping
 *   (aggregate + ledger) is still outstanding.
 * - terminal_skip: a recorded no-grant decision. Only terminal states
 *   (this and completed) short-circuit re-entry.
 * - completed: a grant decision with bookkeeping fully recorded.
 */
type ReferralConversionPhase = "pending" | "grant_confirmed" | "terminal_skip" | "completed";

type ReferralConversionState = {
  phase?: ReferralConversionPhase;
  /** The decision that closed this conversion (skip outcomes). */
  decisionReason?: string;
  /** Bookkeeping completion evidence: set on the terminal outcome
   *  record once the aggregate delta has been applied. While
   *  bookkeeping is still in flight the delta's evidence is the
   *  ReferralRecord's applied-session marker instead — the outcome
   *  record is written last and never claims an effect that has not
   *  landed. A terminal record for a conversion reversed BEFORE its
   *  bookkeeping ran carries `false`: the delta never landed (the
   *  reversal gated its decrements on that same evidence), and the
   *  stored reversal fields record the disposition. */
  aggregateApplied?: boolean;
  /** A legacy `rewarded: true` record whose outcome fields are missing:
   *  ambiguous, never regranted and never reinterpreted as granted. */
  reconciliationRequired?: boolean;
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
  /** Gate fix round 1 (Codex P1 on PR #476): a purchaser_revoked
   *  skip recorded over a `pending` checkpoint may shadow an
   *  authority grant the machine already accepted — the
   *  grant_confirmed write is the only KV evidence of acceptance,
   *  and it is exactly what may have failed. The skip preserves the
   *  unresolved grant identity under this flag so the reversal side
   *  pairs the record with the authority before finalizing instead
   *  of settling the refund around a live grant. */
  authorityGrantUnresolved?: boolean;
};

const sessionKey = (id: string) => `stripe:session:${id}`;
/** The referral ledger's storage key (mirrors referralLedger). The
 *  reversal-repair recognition in reverseReferralReward must see the
 *  code's full stored history — including reversal events appended
 *  before deterministic event ids existed — which the capped
 *  getReferralEvents read cannot guarantee. */
const referralEventsKey = (code: string) => `referral:events:${code}`;
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
 *
 * S93-1 item 7: the write is DURABLE (setDurable). The ordinary kv.set
 * could degrade to local-only success during a Cloudflare outage and
 * report a terminal marker that no other isolate can see; a durable
 * failure now returns false and every caller leaves its event
 * Stripe-retryable instead of finalizing on an invisible marker.
 */
async function persistWebhookEventDedupe(
  eventDedupeKey: string,
  meta?: { reason?: string },
): Promise<boolean> {
  try {
    await kv.setDurable(
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

/** A persisted terminal dedupe marker (vs a legacy numeric incr counter). */
function isWebhookTerminalDedupeMarker(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { received?: unknown }).received === true
  );
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

function includesSecondCopy(session: Stripe.Checkout.Session): boolean {
  return session.metadata?.print_include_second_copy === "true";
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
  // S94-1 F7: count from the union of the raw feed storage and the
  // dedicated reward-grant ledger. The previous read went through
  // getReferralEvents, whose 50-entry clamp let high feed volume push
  // in-window grants out of the counted slice and under-enforce the
  // cap; feed entries already evicted from storage by the 200-entry
  // bound before this fix are covered going forward by the ledger.
  return countRecentReferralRewardGrants(code, windowMs, now);
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

/**
 * S93-1 item 5: settlement reports an explicit outcome so the
 * fulfillment pass can distinguish a revoked purchase from a settled
 * one — the pre-fix void return let processCheckoutFulfillment run
 * the referral application after a revocation it had just converged.
 */
type MarkSessionPaidOutcome =
  | { kind: "settled" }
  | { kind: "revoked"; reason: string }
  | { kind: "nonfulfillable" };

async function markSessionPaid(
  session: Stripe.Checkout.Session,
): Promise<MarkSessionPaidOutcome> {
  if (!session.id) return { kind: "nonfulfillable" };
  if (!isFulfillableCheckoutPayment(session)) return { kind: "nonfulfillable" };

  const existing = await kv.get<SessionRecord>(sessionKey(session.id));
  if (existing?.revoked) {
    return { kind: "revoked", reason: existing.reason ?? "revoked" };
  }

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
      return { kind: "revoked", reason: revokedRecord.reason ?? "refund" };
    }
  }

  // Option B interim settlement (S61-1 mapping of S54-3): the shared policy
  // owns the ONLY settlement balance write. Observed replay performs no
  // session write; legacy paid records are adopted by observation; ambiguous
  // persistence throws so this event stays Stripe-retryable instead of
  // finalizing on an unknown grant state.
  const purchaseTerms: SettlementPurchaseTerms = {
    plan: plan ?? null,
    purchasedCredits: credits,
    orderType,
    printVariant: printVariant ?? null,
    includesDigitalAddOn: hasDigitalAddOn,
    subscription: plan === "subscription",
    amountTotal: session.amount_total ?? null,
    currency: session.currency ?? null,
    paymentIntentId,
    subscriptionId,
    customerId,
  };
  const outcome = await settleSessionPurchase({
    sessionId: session.id,
    paymentIntentId,
    purchaseTerms,
    buildInitialRecord: (receipt) => ({
      paid: true,
      settlementReceipt: receipt,
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
      isGift: giftFlagForRecord(session.metadata),
      printAssetId,
      referralCode: normalizeReferralCode(session.metadata?.referral_code) ?? undefined,
      referrerSessionId:
        typeof session.metadata?.referrer_session_id === "string"
          ? session.metadata.referrer_session_id.trim() || undefined
          : undefined,
      referralOfferVariant: getReferralOfferVariant(session),
    }),
  });
  if (outcome.kind === "revoked") {
    await markSessionRevoked(session.id, outcome.reason);
    return { kind: "revoked", reason: outcome.reason };
  }
  if (outcome.kind === "reconciliation_required") {
    console.error("Settlement reconciliation required; leaving event retryable", {
      sessionId: session.id,
      detail: outcome.detail,
    });
    throw new Error(`settlement_reconciliation_required: ${outcome.detail}`);
  }
  if (outcome.kind === "persistence_ambiguous") {
    console.error("Settlement persistence ambiguous; leaving event retryable", {
      sessionId: session.id,
      detail: outcome.detail,
    });
    throw new Error(`settlement_persistence_ambiguous: ${outcome.detail}`);
  }
  const alreadyPaid = outcome.kind === "already_settled";
  // Fix round (Codex P1, PR #447): when this call completed settlement
  // metadata onto a record another route initialized (verify-first), this
  // webhook call is the first bearer of the customer's email — the record
  // previously had none, so /api/account/access-email could only answer
  // 409 missing_customer_email. The access-email send below keys off that
  // completion as well as off first settlement. Wording correction (fix
  // round 4, G-dot gate): the dedupe counter is a NON-ATOMIC increment —
  // it is the send discipline that bounds sends to one in the ordinary
  // case, not proof of "one send ever" under arbitrary interleavings.
  const completedSettlementMetadata =
    outcome.kind === "already_settled" && outcome.completedMetadataFields.length > 0;

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

  if (
    (!alreadyPaid || completedSettlementMetadata) &&
    customerEmail &&
    hasDigitalEntitlementCandidate &&
    isAccountAccessEmailConfigured()
  ) {
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
        // Option B: the email outcome lives in a separate record. The old
        // { ...current } session replacement could overwrite a later
        // consume, transfer, or revocation with this stale snapshot.
        await kv.setDurable(ENTITLEMENT_KV.accessEmailResult(session.id), {
          schemaVersion: SETTLEMENT_SCHEMA_VERSION,
          sessionId: session.id,
          accessEmailSentAt: alertResult.delivered ? Date.now() : current.accessEmailSentAt,
          accessEmailProvider: alertResult.provider,
          accessEmailError: alertResult.delivered ? undefined : alertResult.error,
          recordedAt: Date.now(),
        });
      }
    }
  }

  return { kind: "settled" };
}

async function markSessionRevoked(sessionId: string, reason: string) {
  // S94-1 F3: this read→write rewrites the WHOLE session record, so it
  // must exclude the other whole-record accounting writers. Consume and
  // compensation hold the authority's accounting lease across their
  // load→mutate→write; this writer took no lease, so a revocation
  // landing mid-consume was erased by the consume's stale write (and a
  // consume's debit could equally be erased here). Take the same lease:
  // - acquired: hold it across the read, both writes, with the
  //   seal-before-write the other holders use;
  // - busy: another accounting writer is mid-flight — throw, leaving
  //   the caller's event Stripe-retryable (its dedupe is not finalized)
  //   until the lease clears (15s TTL) and a redelivery lands the
  //   revocation whole;
  // - fenced: a baseline exists, so no legacy accounting writer can be
  //   mid-flight (capture itself needed this lease, and later legacy
  //   writers fence at acquire) — proceed unleased;
  // - authority_unavailable: no legacy writer can COMMIT during an
  //   authority outage (their seals fail closed), and a revocation —
  //   the safety-direction write — must not be blocked by the outage —
  //   proceed unleased.
  const authorityClient = createEntitlementAuthorityClient();
  const lease = await acquireAccountingLease(authorityClient, sessionId, "legacy_write", {
    retryDeadlineMs: 1500,
  });
  if (lease.status === "busy") {
    throw new Error("revocation_accounting_busy");
  }
  const leased = lease.status === "acquired";
  try {
    const existing = await kv.get<SessionRecord>(sessionKey(sessionId));
    if (leased) {
      const seal = await sealAccountingLease(authorityClient, sessionId, lease.leaseId);
      if (seal.status !== "sealed") {
        throw new Error("revocation_accounting_lease_lost");
      }
    }
    await kv.set(sessionKey(sessionId), {
      ...existing,
      paid: false,
      revoked: true,
      revokedAt: Date.now(),
      reason,
      subscriptionActive: false,
    });
    // Option B: durable side evidence, separate from the mutable session
    // snapshot, so a later stale session replacement cannot silently erase
    // the only record of revocation. A failure here propagates: the caller's
    // event stays retryable with incomplete revocation work rather than
    // finalizing on partial evidence. (Reader enforcement of this evidence is
    // partial — verify checks it; see the retained residuals in the PR body.)
    const evidence: SessionRevocationEvidence = {
      schemaVersion: SETTLEMENT_SCHEMA_VERSION,
      sessionId,
      revoked: true,
      reason,
      paymentIntentId: existing?.paymentIntentId ?? null,
      revokedAt: Date.now(),
    };
    await kv.setDurable(ENTITLEMENT_KV.sessionRevoked(sessionId), evidence);
  } finally {
    if (leased) {
      await releaseAccountingLease(authorityClient, sessionId, lease.leaseId);
    }
  }
}

async function markPaymentIntentRevoked(paymentIntentId: string, reason: string) {
  // Option B: the tombstone is terminal revocation evidence — persist it
  // durably so a failed write surfaces instead of degrading to local-only.
  await kv.setDurable(revokedPaymentIntentKey(paymentIntentId), {
    revoked: true,
    revokedAt: Date.now(),
    reason,
  });
}

/**
 * Option B: the session is revoked but its payment intent could not be
 * resolved, so no tombstone could be written. Name the unresolved
 * association work in a separate record instead of silently treating the
 * revocation as complete; the record stays retryable/reconcilable.
 */
async function recordRevocationUnresolved(sessionId: string, reason: string) {
  const record: RevocationUnresolvedRecord = {
    schemaVersion: SETTLEMENT_SCHEMA_VERSION,
    sessionId,
    reason,
    associationState: "payment_intent_unresolved",
    recordedAt: Date.now(),
  };
  await kv.setDurable(ENTITLEMENT_KV.revocationUnresolved(sessionId), record);
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

/** The Stripe payload's payment-intent identity, string or expanded object. */
function checkoutPaymentIntentId(session: Stripe.Checkout.Session): string | null {
  const paymentIntent = session.payment_intent;
  if (typeof paymentIntent === "string") return paymentIntent || null;
  if (
    paymentIntent &&
    typeof paymentIntent === "object" &&
    typeof paymentIntent.id === "string"
  ) {
    return paymentIntent.id;
  }
  return null;
}

/**
 * S93-1 item 5: strict purchaser-revocation check for the referral
 * grant path — the purchaser's mutable record flag plus the durable
 * session evidence and PI tombstone, read error-preserving. A read
 * failure is converted to a retryable referral outcome: unreadable
 * evidence must never read as "not revoked" in front of a grant.
 */
async function purchaserRevokedForReferral(session: Stripe.Checkout.Session): Promise<boolean> {
  if (!session.id) return false;
  const record = await kv.get<SessionRecord>(sessionKey(session.id));
  if (record?.revoked) return true;
  try {
    const evidence = await readSessionRevocationEvidenceStrict(
      session.id,
      checkoutPaymentIntentId(session),
    );
    return evidence.revoked;
  } catch {
    throw new ReferralGrantTransientError("purchaser_revocation_evidence_unreadable");
  }
}

async function applyReferralReward(session: Stripe.Checkout.Session) {
  if (!session.id) return;
  if (!isFulfillableCheckoutPayment(session)) return;

  const referralCode = normalizeReferralCode(session.metadata?.referral_code);
  const referrerSessionId =
    typeof session.metadata?.referrer_session_id === "string" ? session.metadata.referrer_session_id.trim() : "";
  if (!referralCode || !referrerSessionId) return;
  if (referrerSessionId === session.id) return;

  const rewardStateKey = referralRewardedKey(session.id);
  const existingRewardState = await kv.get<ReferralConversionState>(rewardStateKey);

  // S93-1 item 4: phase disposition. Only terminal decisions
  // (completed / terminal_skip) short-circuit. `pending` is a replay
  // checkpoint — validation and the grant seam re-run. `grant_confirmed`
  // resumes at bookkeeping without re-invoking the grant seam.
  if (
    existingRewardState?.phase === "completed" ||
    existingRewardState?.phase === "terminal_skip"
  ) {
    return;
  }
  const resumedGrant =
    existingRewardState?.phase === "grant_confirmed" ? existingRewardState : null;
  if (!resumedGrant && !existingRewardState?.phase && existingRewardState?.rewarded) {
    // Pre-protocol record. One carrying its outcome fields is a finished
    // legacy decision and stands. One without them is AMBIGUOUS: the old
    // protocol wrote `rewarded: true` BEFORE the grant, so the claim
    // alone proves neither a grant nor a skip. Never regrant and never
    // reinterpret as granted — mark reconciliation-required and keep
    // the event retryable.
    if (
      existingRewardState.conversionRecorded === true ||
      typeof existingRewardState.rewardSkipReason === "string"
    ) {
      return;
    }
    await kv.setDurable(rewardStateKey, {
      ...existingRewardState,
      reconciliationRequired: true,
    });
    throw new ReferralGrantTransientError("legacy_reward_state_reconciliation_required");
  }

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
    createdAt: existingRewardState?.createdAt ?? Date.now(),
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
  const timestamp = Date.now();

  // Validation-style terminal skip: no aggregate bookkeeping and
  // conversionRecorded stays false — the legacy shape for decisions
  // reached before final bookkeeping. The `rewarded: true` on terminal
  // records is the legacy decision marker (readers keyed to it keep
  // working); unlike the old protocol it is written only WITH a
  // decision, never before one.
  const recordValidationSkip = async (reason: string) => {
    await appendReferralEvent({
      code: referralCode,
      type: "reward_skipped",
      details: {
        reason,
        checkoutSessionId: session.id,
        offerVariant: referralOfferVariant,
      },
    });
    await kv.setDurable(rewardStateKey, {
      ...stateBase,
      phase: "terminal_skip",
      decisionReason: reason,
      rewardSkipReason: reason,
      rewardGranted: 0,
      conversionRecorded: false,
      rewarded: true,
      // Gate fix round 1 (Codex P1 on PR #476): a purchaser_revoked
      // skip recorded over a PENDING checkpoint does not prove no
      // grant exists — a prior delivery may have run the grant seam,
      // the authority may have accepted, and only the grant_confirmed
      // write failed, leaving this record in `pending` as the sole
      // trace. Preserve the unresolved grant identity on the skip so
      // reverseReferralReward pairs it with the authority before
      // finalizing; without the marker the skip settles as an
      // ordinary zero-grant decision and the refund finalizes around
      // the accepted grant, which then stays live and unreversed.
      ...(reason === "purchaser_revoked" &&
      existingRewardState?.phase === "pending" &&
      isEntitlementAuthorityRoutingEnabled()
        ? { authorityGrantUnresolved: true }
        : {}),
    });
  };

  let referralRecord: ReferralRecord | null = null;
  let rewardGranted = resumedGrant
    ? Math.max(0, Math.floor(resumedGrant.rewardGranted ?? 0))
    : 0;
  let rewardSkipReason: string | undefined;

  if (!resumedGrant) {
    // S93-1 item 5: purchaser revocation forbids the grant, checked
    // BEFORE any conversion-state write. Observed revocation is a
    // deterministic terminal outcome with zero grant.
    if (await purchaserRevokedForReferral(session)) {
      await recordValidationSkip("purchaser_revoked");
      return;
    }

    // S93-1 item 4: the pending checkpoint is written durably BEFORE
    // grant processing. A transient failure from here on leaves it in
    // place — no snapshot restore, no delete — for the redelivery.
    await kv.setDurable(rewardStateKey, { ...stateBase, phase: "pending" });

    referralRecord = await kv.get<ReferralRecord>(referralKey(referralCode));
    if (!referralRecord || referralRecord.sessionId !== referrerSessionId) {
      await recordValidationSkip("code_mismatch_or_missing");
      return;
    }

    const checkoutCustomerId = typeof session.customer === "string" ? session.customer.trim() : "";
    const checkoutCustomerEmail = normalizeEmail(session.customer_details?.email ?? session.customer_email);
    const referrer = await kv.get<SessionRecord>(sessionKey(referrerSessionId));
    if (!referrer || referrer.revoked) {
      await recordValidationSkip("referrer_inactive");
      return;
    }

    const sameCustomerId = Boolean(referrer.customerId && checkoutCustomerId && referrer.customerId === checkoutCustomerId);
    // The referrer's email may have been completed into the settlement-
    // metadata sidecar (fix round 4, PR #447) — the self-referral check
    // reads the merged view, as it read the completed inline field before.
    const referrerMerged = await withSettlementMetadata(referrerSessionId, referrer);
    const referrerEmail = normalizeEmail(referrerMerged.customerEmail);
    const sameEmail = Boolean(referrerEmail && checkoutCustomerEmail && referrerEmail === checkoutCustomerEmail);
    if (sameCustomerId || sameEmail) {
      await recordValidationSkip("self_referral");
      return;
    }

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
          // S93-1 item 5: recheck purchaser revocation immediately
          // before the grant seam — evidence can land between the
          // entry check and here.
          if (await purchaserRevokedForReferral(session)) {
            await recordValidationSkip("purchaser_revoked");
            return;
          }
          // S93-1 item 3: before an authority grant is invoked, the
          // referrer's CURRENT revocation state — mutable flag plus
          // strict external evidence via its known PI identity — must
          // not show revocation. A read error stays retryable; an
          // observed revocation is a terminal inactive-referrer
          // decision.
          const freshReferrer = await kv.get<SessionRecord>(sessionKey(referrerSessionId));
          let referrerRevoked = !freshReferrer || freshReferrer.revoked === true;
          if (freshReferrer && !referrerRevoked) {
            let referrerEvidence;
            try {
              referrerEvidence = await readSessionRevocationEvidenceStrict(
                referrerSessionId,
                freshReferrer.paymentIntentId ?? null,
              );
            } catch {
              throw new ReferralGrantTransientError("referrer_revocation_evidence_unreadable");
            }
            referrerRevoked = referrerEvidence.revoked;
          }
          if (referrerRevoked) {
            await recordValidationSkip("referrer_inactive");
            return;
          }
          if (isEntitlementAuthorityRoutingEnabled()) {
            // DL-1 Slice 3 (R1-A): the reward lands in the entitlement
            // authority's separate reward bucket — never in the combined KV
            // balance, where a later clawback could reach purchased credits.
            // The grant migrates the referrer first (lazy trigger) and is
            // idempotent on this checkout session id. If the referrer's
            // legacy record cannot be baselined, the grant is skipped
            // (fail closed) rather than written behind the authority's back.
            const grantResult = await grantReferralRewardViaAuthority(
              createEntitlementAuthorityClient(),
              referrerSessionId,
              session.id,
              referralRewardCredits,
              async () =>
                (await kv.get<SessionRecord>(sessionKey(referrerSessionId))) as
                  | StripeSessionEntitlement
                  | null,
              timestamp,
              {
                // DL-1 v3.8 §5: the discovery registration leg runs
                // inside the grant (before any fold effect). The
                // classification evidence is presented with NO witness
                // (the grant-time claim is not a finalized witness, so
                // the wrapper presents "absent"): the machine decides
                // on the provenance forms alone, and P-b's fencing
                // timestamp arrives with the activation record at the
                // Slice 6 cutover.
                discoveryClient: createReferralDiscoveryClient(),
                sessionCreatedAt: (session.created ?? 0) * 1000,
                fencingCompletedAt: null,
              },
            );
            if (grantResult.status === "granted" || grantResult.status === "already_granted") {
              rewardGranted = referralRewardCredits;
            } else if (isTransientReferralGrantReason(grantResult.reason)) {
              // Transient contention/outage (Codex P2, PR #367): recording
              // this as a settled skip would lose an eligible reward for
              // good. Under the S93-1 protocol there is nothing to roll
              // back — the pending checkpoint simply stays, and the
              // redelivery resumes and retries the wrapper with the same
              // checkout identity once the authority clears.
              throw new ReferralGrantTransientError(grantResult.reason);
            } else {
              rewardSkipReason = `authority_${grantResult.reason}`;
            }
          } else {
            // S93-1 item 3: the routing-disabled legacy session grant is
            // REMOVED. It spread a previously read referrer snapshot,
            // set paid: true, and wrote combined credits with no durable
            // revocation recheck — a debit or revocation landing between
            // the read and the write was silently restored, and KV
            // offers no conditional update that could make a concurrent
            // increment safe (re-reading immediately before the write
            // does not close the race). Eligible grants defer to the
            // authority cutover instead: the conversion stays pending,
            // nothing terminal is recorded, no referral aggregates move,
            // the webhook event does not finalize, and the redelivery
            // retries. Do NOT enable authority routing from this lane —
            // the cutover is a separately approved act.
            throw new ReferralGrantTransientError("legacy_referral_grant_requires_authority");
          }
        }
      } else {
        rewardSkipReason = "subscription_referrer";
      }
    } else {
      rewardSkipReason = "ineligible_order";
    }

    if (rewardGranted > 0) {
      // S93-1 item 4: persist the confirmation BEFORE bookkeeping.
      // After this write, a replay resumes at bookkeeping (see the
      // entry disposition) and never re-invokes the grant seam.
      await kv.setDurable(rewardStateKey, {
        ...stateBase,
        phase: "grant_confirmed",
        rewardGranted,
        conversionRecorded: false,
      });
    }
  }

  // Final bookkeeping (fresh decisions and grant_confirmed resumes
  // alike). Fix round (Codex P2, PR #471): the terminal outcome
  // record is written LAST, after the effects it claims. Until it
  // lands, the record stays in a resumable phase (grant_confirmed /
  // pending), so a failure in any effect below leaves the conversion
  // resumable instead of terminally marked with its bookkeeping
  // lost. Each effect is replay-safe on its own:
  // - the aggregate delta records this checkout session id in the
  //   ReferralRecord IN THE SAME WRITE as the counters, so the
  //   application and its evidence are atomic: a failed delta write
  //   leaves neither behind, and a resume that observes the marker
  //   (or the outcome record's aggregateApplied) never applies the
  //   delta twice;
  // - the ledger appends carry deterministic event ids, which
  //   appendReferralEvent dedupes by id — a replayed append replaces
  //   rather than duplicates (reward caps count reward_granted
  //   events, so a duplicate would inflate the count).
  //
  // Fix round 2 (Codex P2, PR #471): both aggregate-state reads in
  // this block are ERROR-PRESERVING. Plain kv.get degrades to local
  // fallback storage on a remote read failure and can answer null
  // for a record that exists; the previous shape then skipped the
  // aggregate delta yet still wrote a terminal outcome claiming
  // aggregateApplied — permanently losing the counters. A
  // bookkeeping pass proceeds only from records it actually read:
  // an unreadable or absent aggregate/outcome record leaves the
  // conversion in its resumable phase and the event retryable.
  if (!referralRecord) {
    let freshReferralRecord: ReferralRecord | null = null;
    try {
      freshReferralRecord = await kv.getErrorPreserving<ReferralRecord>(
        referralKey(referralCode),
      );
    } catch {
      freshReferralRecord = null;
    }
    if (!freshReferralRecord) {
      throw new ReferralGrantTransientError("referral_record_unreadable");
    }
    referralRecord = freshReferralRecord;
  }
  let latestRewardState: ReferralConversionState | null = null;
  try {
    latestRewardState =
      await kv.getErrorPreserving<ReferralConversionState>(rewardStateKey);
  } catch {
    latestRewardState = null;
  }
  if (!latestRewardState) {
    throw new ReferralGrantTransientError("referral_conversion_state_unreadable");
  }

  // A reversal can land while this conversion's bookkeeping is in
  // flight (refund/dispute deliveries interleave with the checkout
  // redelivery across invocations): reverseReferralReward persists
  // its flags on the outcome record and gates its aggregate
  // decrements on the counted-ness evidence at THAT time. This pass
  // defers to that disposition:
  // - the aggregate delta is never applied for a reversed
  //   conversion (if it had landed, the evidence below already
  //   shows it and the reversal already decremented it; if it had
  //   not, applying it now would leak counters the reversal
  //   deliberately left untouched);
  // - the grant-side ledger appends are skipped (the reversal's
  //   own events are the closing ledger entries for the conversion);
  // - the terminal write below carries the stored reversal fields
  //   over instead of erasing them, so a later reversal attempt
  //   still sees the conversion as already reversed.
  const reversalState =
    latestRewardState.conversionReversed === true ||
    latestRewardState.rewardReversed === true
      ? latestRewardState
      : null;

  const aggregateAlreadyApplied =
    existingRewardState?.aggregateApplied === true ||
    latestRewardState.aggregateApplied === true ||
    (referralRecord.recentConversionSessionIds?.includes(session.id) ?? false);
  let aggregateApplied = aggregateAlreadyApplied;
  if (!aggregateAlreadyApplied && !reversalState) {
    // Fix round 2 (Codex P2, PR #471): the applied-session marker
    // list is NOT truncated. The delta and its evidence are this
    // single write — the only atomicity the store offers — so the
    // evidence must live exactly as long as the counters it
    // protects. The previous 50-entry bound evicted the marker of
    // a conversion whose terminal write was still outstanding
    // after 50 later conversions for the same code, and its retry
    // then applied the delta a second time.
    const appliedSessionIds = [
      ...(referralRecord.recentConversionSessionIds ?? []).filter((id) => id !== session.id),
      session.id,
    ];
    await kv.set(referralKey(referralCode), {
      ...referralRecord,
      conversions: (referralRecord.conversions ?? 0) + 1,
      rewardsGranted: (referralRecord.rewardsGranted ?? 0) + rewardGranted,
      lastConvertedAt: timestamp,
      recentConversionSessionIds: appliedSessionIds,
    });
    aggregateApplied = true;
  }

  if (!reversalState) {
    await appendReferralEvent({
      code: referralCode,
      type: "conversion_recorded",
      eventId: `conversion_recorded:${session.id}`,
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
        eventId: `reward_granted:${session.id}`,
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
      // S94-1 F7: the same grant is recorded in the dedicated cap
      // ledger (same deterministic id), which feed volume and the
      // feed's storage bound cannot evict within the cap windows.
      await appendReferralRewardGrant({
        code: referralCode,
        eventId: `reward_granted:${session.id}`,
        createdAt: timestamp,
        details: {
          checkoutSessionId: session.id,
          rewardGranted,
        },
      });
    } else {
      await appendReferralEvent({
        code: referralCode,
        type: "reward_skipped",
        eventId: `reward_skipped:${session.id}`,
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

  // Terminal outcome — written only once every bookkeeping effect
  // above is recorded (the aggregate delta is evidenced by the
  // marker in the ReferralRecord, the appends by their deterministic
  // ids). Terminal states refuse re-entry at the disposition above,
  // so a replay of a completed conversion is a no-op.
  // aggregateApplied states what actually landed — never asserted
  // for a delta this pass (or an earlier one) did not apply, which
  // is exactly the reversed-before-bookkeeping case above, whose
  // stored reversal fields are carried over verbatim.
  //
  // The outcome record is re-read once more, error-preserving,
  // immediately before this write: a reversal landing DURING this
  // pass (after the decision read above — e.g. between the delta
  // write and here) persists its flags on the stored record, and
  // the terminal write must carry them over rather than erase them
  // with the pass's stale snapshot. An unreadable record at this
  // point leaves the event retryable; the effects above are all
  // evidenced idempotently, so the resume re-enters safely.
  let terminalRewardState: ReferralConversionState | null = null;
  try {
    terminalRewardState =
      await kv.getErrorPreserving<ReferralConversionState>(rewardStateKey);
  } catch {
    terminalRewardState = null;
  }
  if (!terminalRewardState) {
    throw new ReferralGrantTransientError("referral_conversion_state_unreadable");
  }
  const terminalReversalState =
    terminalRewardState.conversionReversed === true ||
    terminalRewardState.rewardReversed === true
      ? terminalRewardState
      : reversalState;
  if (!terminalReversalState && rewardGranted > 0) {
    // S94-1 F5: the reread above closes the window only up to the
    // read. A reversal whose FIRST durable act lands after it —
    // markSessionRevoked persists the session's revocation evidence
    // before reverseReferralReward writes any outcome-record flag —
    // would still be erased by the terminal write below, after which
    // the reversal's counted-ness consult reads the terminal record,
    // finds no flags, and treats the grant as never counted (the
    // referrer keeps reward credits for a refunded purchase). Consult
    // the revocation evidence — written strictly before the flags in
    // both reversal handlers — immediately before the terminal write:
    // a revoked session defers this pass (the record stays in its
    // resumable phase; the reversal completes; the redelivery then
    // carries its flags), and unreadable evidence leaves the event
    // retryable rather than finalising blind. Zero-grant outcomes
    // need no consult: a reversal cannot have written flags before
    // observing a terminal record, and a not-yet-terminal zero-grant
    // record sits in a guarded phase the reversal defers on.
    let terminalRevocationRevoked = false;
    try {
      const evidence = await readSessionRevocationEvidenceStrict(
        session.id,
        checkoutPaymentIntentId(session),
      );
      terminalRevocationRevoked = evidence.revoked;
    } catch {
      throw new ReferralGrantTransientError("referral_reversal_evidence_unreadable");
    }
    if (terminalRevocationRevoked) {
      throw new ReferralGrantTransientError("referral_reversal_in_flight");
    }
  }
  // Gate fix round 1 (Codex P1-B on PR #477): the evidence consult
  // above narrows the F5 window but does not close it — its clean
  // answer is already stale when the terminal write runs, and a
  // reversal landing after it (revocation evidence first, then the
  // outcome-record flags — the order both handlers write them) was
  // still erased by the write's stale snapshot. Another read alone
  // would only move the window; instead the outcome record is
  // re-read as the FINAL step before the write, and the freshest
  // reversal state governs the write's reversal fields: a reversal
  // that has landed by now is merged, never erased. A reversal
  // still in flight past this read can only write its flags after
  // this write, from the snapshot IT read — regressing the record
  // to its resumable phase with the flags on it — so the redelivery
  // converges through this same carry-over instead of the terminal
  // write finalising over it.
  let finalRewardState: ReferralConversionState | null = null;
  try {
    finalRewardState = await kv.getErrorPreserving<ReferralConversionState>(rewardStateKey);
  } catch {
    finalRewardState = null;
  }
  if (!finalRewardState) {
    throw new ReferralGrantTransientError("referral_conversion_state_unreadable");
  }
  const finalReversalState =
    finalRewardState.conversionReversed === true || finalRewardState.rewardReversed === true
      ? finalRewardState
      : terminalReversalState;
  await kv.setDurable(rewardStateKey, {
    ...stateBase,
    phase: rewardGranted > 0 ? "completed" : "terminal_skip",
    decisionReason: rewardGranted > 0 ? undefined : rewardSkipReason ?? "not_eligible",
    rewardGranted,
    rewardSkipReason: rewardGranted > 0 ? undefined : rewardSkipReason ?? "not_eligible",
    conversionRecorded: true,
    aggregateApplied,
    rewarded: true,
    ...(finalReversalState
      ? {
          conversionReversed: finalReversalState.conversionReversed,
          conversionReversedAt: finalReversalState.conversionReversedAt,
          rewardReversed: finalReversalState.rewardReversed,
          rewardReversedAt: finalReversalState.rewardReversedAt,
          reversalReason: finalReversalState.reversalReason,
          rewardReclaimed: finalReversalState.rewardReclaimed,
        }
      : {}),
  });
}

/**
 * Reverses a referral conversion + reward for a refunded/disputed
 * referred purchase. Returns `deferred: true` when the clawback could
 * not run because the entitlement authority was transiently
 * unavailable: nothing is finalized in that case, and the caller keeps
 * the Stripe event retryable (its dedupe is deferred — see POST) so a
 * redelivery completes the reversal (Codex P2, PR #367).
 */
async function reverseReferralReward(
  sessionId: string,
  reason: "refund" | "dispute",
): Promise<{ deferred: boolean }> {
  if (!sessionId) return { deferred: false };

  const rewardStateKey = referralRewardedKey(sessionId);
  const rewardState = await kv.get<ReferralConversionState>(rewardStateKey);
  if (!rewardState) return { deferred: false };
  if (!rewardState.referralCode || !rewardState.referrerSessionId) return { deferred: false };
  // S93-1 item 4: a CONFIRMED grant is reversible even when conversion
  // bookkeeping never completed (grant_confirmed phase, or a record
  // carrying rewardGranted > 0) — conversionRecorded must never hide a
  // confirmed grant from reversal. Whether the aggregate counters may
  // be decremented is decided separately below, on evidence that
  // this conversion's aggregate increment actually landed.
  const confirmedGrant =
    rewardState.phase === "grant_confirmed" ||
    rewardState.phase === "completed" ||
    (rewardState.rewardGranted ?? 0) > 0;
  const rewardGranted = Math.max(0, Math.floor(rewardState.rewardGranted ?? 0));
  // S94-1-F4 + gate fix round 1 (Codex P1 on PR #476): with authority
  // routing enabled, two record shapes name a grant the authority may
  // ALREADY have accepted while the KV side cannot prove it:
  // - a record still in the `pending` checkpoint (the grant_confirmed
  //   write is the only KV evidence of acceptance, and it may be the
  //   write that failed), and
  // - a purchaser_revoked terminal skip carrying
  //   authorityGrantUnresolved (the grant side recorded its decision
  //   over such a checkpoint and preserved the identity).
  // Neither may be answered with a settled "nothing to reverse", and
  // a blanket deferral is not sufficient either: the checkout
  // redelivery the F4 guard waited on settles the record only when
  // its settlement pass reaches the grant side — a redelivery that
  // observes the revocation first is suppressed there and leaves the
  // record pending, so the deferral could strand the refund with the
  // accepted grant live behind it. These identities therefore fall
  // through to the authority consult below: an accepted grant is
  // reversed on the spot and the reversal finalizes with the true
  // clawed amount; the consult defers (dedupe unfinalized) only when
  // the authority itself cannot yet answer — a grant still pending
  // in its journal, or an absence the machine treats as unresolved.
  // With routing disabled no authority grant can be in flight (the
  // grant path defers rather than granting), so the legacy
  // disposition stands.
  const unresolvedAuthorityGrant =
    isEntitlementAuthorityRoutingEnabled() &&
    rewardGranted <= 0 &&
    (rewardState.phase === "pending" || rewardState.authorityGrantUnresolved === true);
  if (rewardState.rewarded !== true && !confirmedGrant && !unresolvedAuthorityGrant) {
    return { deferred: false };
  }
  if (!confirmedGrant && rewardState.conversionRecorded !== true && !unresolvedAuthorityGrant) {
    return { deferred: false };
  }

  const referralCode = normalizeReferralCode(rewardState.referralCode);
  if (!referralCode) return { deferred: false };
  const conversionAlreadyReversed = rewardState.conversionReversed === true;
  const rewardAlreadyReversed = rewardGranted <= 0 || rewardState.rewardReversed === true;
  if (conversionAlreadyReversed && rewardAlreadyReversed) {
    // S94-1-F6: the reversal state write lands BEFORE the ledger
    // appends at the end of this function, so an append failure in
    // the original delivery stranded the reversal with its ledger
    // evidence missing — and this early return meant no redelivery
    // ever repaired it. The appends carry deterministic ids and
    // appendReferralEvent dedupes by id (replacing, never
    // duplicating), so re-issuing the events this record owes is a
    // no-op when they already landed and a repair when they did
    // not. The aggregate decrements are NOT repeated here: they
    // landed with the original reversal and their evidence is
    // unchanged.
    // Gate fix round 1 (Codex P2 on PR #476): the re-issue may only
    // repair events that are actually MISSING. Reversal events
    // appended before S94-1-F6 carry random-UUID ids, so the
    // deterministic-id dedupe cannot recognise them: re-issuing on
    // redelivery of an already-reversed legacy record appended a
    // duplicate conversion_reversed / reward_reversed alongside the
    // legacy original (aggregates unaffected — no counter reads
    // reversal events — but the ledger evidence duplicated). An
    // event for the same checkout session and type IS the same
    // ledger fact whatever id it carries, so the repair first reads
    // the code's stored history and skips any type already recorded
    // for this session.
    const storedEvents =
      (await kv.get<ReferralEvent[]>(referralEventsKey(referralCode))) ?? [];
    const reversalEventRecorded = (type: ReferralEvent["type"]) =>
      storedEvents.some(
        (entry) => entry.type === type && entry.details?.checkoutSessionId === sessionId,
      );
    if (conversionAlreadyReversed && !reversalEventRecorded("conversion_reversed")) {
      await appendReferralEvent({
        code: referralCode,
        type: "conversion_reversed",
        eventId: `conversion_reversed:${sessionId}`,
        createdAt: rewardState.conversionReversedAt ?? Date.now(),
        details: {
          checkoutSessionId: sessionId,
          reason: rewardState.reversalReason ?? reason,
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
    if (
      ((rewardState.rewardReversed === true && rewardGranted > 0) ||
        (rewardState.rewardReclaimed ?? 0) > 0) &&
      !reversalEventRecorded("reward_reversed")
    ) {
      await appendReferralEvent({
        code: referralCode,
        type: "reward_reversed",
        eventId: `reward_reversed:${sessionId}`,
        createdAt: rewardState.rewardReversedAt ?? Date.now(),
        details: {
          checkoutSessionId: sessionId,
          reason: rewardState.reversalReason ?? reason,
          rewardGranted,
          rewardReclaimed: rewardState.rewardReclaimed ?? 0,
          source: rewardState.source,
          medium: rewardState.medium,
          campaign: rewardState.campaign,
          content: rewardState.content,
          offerVariant: rewardState.offerVariant,
        },
      });
    }
    return { deferred: false };
  }

  const referralRecord = await kv.get<ReferralRecord>(referralKey(referralCode));
  if (!referralRecord || referralRecord.sessionId !== rewardState.referrerSessionId) {
    await kv.set(rewardStateKey, {
      ...rewardState,
      reversalReason: reason,
    });
    return { deferred: false };
  }

  const timestamp = Date.now();
  const routingEnabled = isEntitlementAuthorityRoutingEnabled();

  // A grant that journaled PENDING in the authority (discovery or
  // inclusion unresolved) was finalized on the KV side as a
  // zero-grant skip — but it is not a TERMINAL skip (Codex re-gate
  // F-D): the machine pairs a reversal with the pendency
  // (reversal_deferred — dedupe must NOT finalize), and a later
  // settlement can still fold the grant. The recorded skip reason
  // is the durable distinction, so this record's reversal consults
  // the authority even though the KV side granted 0.
  const pendingAuthorityGrant =
    routingEnabled &&
    rewardGranted <= 0 &&
    (rewardState.rewardSkipReason === "authority_grant_discovery_unresolved" ||
      rewardState.rewardSkipReason === "authority_grant_inclusion_unresolved" ||
      // S94-1-F8: the birth pending kind is an authority grant
      // pendency exactly like discovery/inclusion — leaving it out
      // finalized the reversal without ever consulting the
      // authority for a grant that may still settle and fold.
      rewardState.rewardSkipReason === "authority_grant_birth_unresolved");

  // When authority routing is enabled, the clawback runs BEFORE any
  // bookkeeping below is finalized (Codex P2, PR #367): a transient
  // authority outage must not be recorded as a completed zero-credit
  // reversal — the finalized flags would refuse every later attempt and
  // leave unspent rewards spendable for good. On `authority_unavailable`
  // nothing is written at all, so the reversal stays retryable by any
  // later delivery that reaches this path for the session.
  let authorityClawed: number | null = null;
  let referrer: SessionRecord | null = null;
  if ((!rewardAlreadyReversed && rewardGranted > 0) || pendingAuthorityGrant || unresolvedAuthorityGrant) {
    referrer = await kv.get<SessionRecord>(sessionKey(rewardState.referrerSessionId));
    if (referrer && referrer.plan !== "subscription" && routingEnabled) {
      // DL-1 Slice 3 (R1-A): the clawback runs against the authority's
      // reward bucket only — it removes at most this grant's unspent
      // bucket credits. A grant that predates the bucket (inside the
      // migrated legacy balance) reclaims ZERO: the legacy bucket is
      // never debited by a referral reversal, purchased credits are
      // unreachable, and no debt is created when the reward was spent.
      const reversal = await reverseReferralRewardViaAuthority(
        createEntitlementAuthorityClient(),
        rewardState.referrerSessionId,
        sessionId,
        timestamp,
      );
      if (reversal.status === "authority_unavailable" || reversal.status === "deferred") {
        // authority_unavailable: no authoritative answer exists.
        // deferred: outcome 3 — the grant's inclusion classification
        // is still pending (DL-1 v3.7 §2.3 pairing). Either way the
        // dedupe must NOT finalize; the redelivery re-runs the chain.
        console.warn("Referral reversal deferred: entitlement authority unavailable", {
          sessionId,
          reason,
        });
        return { deferred: true };
      }
      // A replayed reversal reports the ORIGINAL journaled claw
      // (v3.6 §4.3 receipt): if this process died after the authority
      // committed but before the KV finalization below, the
      // redelivery finalizes with the true reclaimed amount.
      authorityClawed =
        reversal.status === "reversed" || reversal.status === "already_reversed"
          ? reversal.clawed
          : 0;
    }
  }

  // Fix round (Codex P2, PR #471): both aggregate decrements may
  // only undo an increment that actually landed for THIS conversion.
  // Evidence: the outcome record's aggregateApplied (set only once
  // bookkeeping's delta is in), a pre-protocol record with
  // conversionRecorded: true (the legacy flow recorded only after
  // its aggregate write), or the ReferralRecord's own applied-session
  // marker (the delta landed mid-bookkeeping and the terminal
  // outcome write is still outstanding). A grant_confirmed record
  // whose bookkeeping never applied the delta carries none of these
  // — decrementing it would subtract rewards belonging to other
  // conversions. The credit clawback below is NOT gated on this
  // either: under authority routing a confirmed grant's bucket
  // credits are reclaimable regardless of counted-ness; with
  // routing disabled the reclaim is zero under the S94-1-F1 bucket
  // discipline (see the clawback block below).
  const aggregateCounted =
    rewardState.aggregateApplied === true ||
    (rewardState.phase === undefined && rewardState.conversionRecorded === true) ||
    (referralRecord.recentConversionSessionIds?.includes(sessionId) ?? false);

  const nextReferralRecord: ReferralRecord = {
    ...referralRecord,
    conversions:
      conversionAlreadyReversed || !aggregateCounted
        ? referralRecord.conversions ?? 0
        : Math.max(0, (referralRecord.conversions ?? 0) - 1),
    rewardsGranted:
      rewardAlreadyReversed || rewardGranted <= 0 || !aggregateCounted
        ? referralRecord.rewardsGranted ?? 0
        : Math.max(0, (referralRecord.rewardsGranted ?? 0) - rewardGranted),
  };
  await kv.set(referralKey(referralCode), nextReferralRecord);

  let rewardReclaimed = 0;
  if (!rewardAlreadyReversed && rewardGranted > 0) {
    if (authorityClawed !== null) {
      rewardReclaimed = authorityClawed;
    } else if (!routingEnabled && referrer && referrer.plan !== "subscription") {
      // S94-1-F1 (DL-1 R1 Option A): NO debit is taken here. The
      // legacy grant was credited to the combined KV counter — the
      // same counter purchased credits live in — and the grant
      // raised creditsTotal alongside the balance, so once the
      // reward is spent it is indistinguishable from purchased
      // value in this record (the migration baseline captures the
      // legacy balance WHOLE for exactly this reason). A clawback
      // may only remove positively identified, unspent reward
      // value; a legacy record identifies none, so the reclaim is
      // zero — the same answer the authority path returns for a
      // pre-bucket grant (not_bucket_grant: a clawback must not
      // reach the legacy bucket; reclaimed is zero by policy). The
      // reversal still finalizes (flags, aggregate decrements,
      // ledger): the reward entitlement is extinguished, purchased
      // credits are unreachable, and no debt is created when the
      // reward was spent. The pre-S94-1 debit —
      // min(combined balance, rewardGranted) written back to the
      // session record — removed purchased credits whenever the
      // reward had been spent first, and its whole-record write
      // also republished the earlier-read referrer snapshot.
      rewardReclaimed = 0;
    }
  } else if ((pendingAuthorityGrant || unresolvedAuthorityGrant) && authorityClawed !== null) {
    // The pending grant settled and folded before this reversal
    // landed — or, gate fix round 1 (P1), the record names an
    // unresolved authority grant (still in the pending checkpoint,
    // or preserved through a purchaser_revoked skip): the
    // authority's claw is the true reclaimed amount, recorded here
    // even though the KV grant side stood at 0.
    rewardReclaimed = authorityClawed;
  }

  // The authority answered this record's reversal (granted path, or
  // a pending grant's terminal answer): the reversal is final and
  // is recorded as such, with the authority's amount.
  const authorityReversalAnswered =
    (pendingAuthorityGrant || unresolvedAuthorityGrant) && authorityClawed !== null;

  await kv.set(rewardStateKey, {
    ...rewardState,
    conversionReversed: true,
    conversionReversedAt: conversionAlreadyReversed ? rewardState.conversionReversedAt : timestamp,
    rewardReversed: authorityReversalAnswered
      ? true
      : rewardAlreadyReversed
        ? rewardState.rewardReversed
        : rewardGranted > 0,
    rewardReversedAt:
      authorityReversalAnswered || !(rewardAlreadyReversed || rewardGranted <= 0)
        ? timestamp
        : rewardState.rewardReversedAt,
    reversalReason: reason,
    rewardReclaimed: authorityReversalAnswered
      ? rewardReclaimed
      : rewardAlreadyReversed || rewardGranted <= 0
        ? rewardState.rewardReclaimed
        : rewardReclaimed,
  });

  if (!conversionAlreadyReversed) {
    await appendReferralEvent({
      code: referralCode,
      type: "conversion_reversed",
      // S94-1-F6: deterministic id — the redelivery repair path at
      // this function's head re-issues this exact event if the
      // original append failed after the state write landed.
      eventId: `conversion_reversed:${sessionId}`,
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

  if (
    (!rewardAlreadyReversed && rewardGranted > 0) ||
    (authorityReversalAnswered && rewardReclaimed > 0)
  ) {
    await appendReferralEvent({
      code: referralCode,
      type: "reward_reversed",
      // S94-1-F6: deterministic id, as for conversion_reversed above.
      eventId: `reward_reversed:${sessionId}`,
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

  return { deferred: false };
}

async function queuePrintOrder(session: Stripe.Checkout.Session) {
  if (!session.id) return;
  if (getOrderType(session) !== "print") return;

  const persistProblemPrintOrder = async (record: PrintOrderRecord) => {
    const nextRecord: PrintOrderRecord = {
      ...record,
      error: record.error ?? "print_order_needs_review",
      // Ordinary/nonterminal failure writers must not inherit stale terminal provenance.
      ...(record.status === "failed" ? { terminalEventType: null } : {}),
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
    includesSecondCopy: includesSecondCopy(session),
    isGift: giftFlagForRecord(session.metadata),
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
    // Gate fix round 1 (BOT-P1): an existing alternate-dispatch
    // marker is the only acceptance evidence for an outbound side
    // effect that may already have happened — this rebuild must
    // carry it, never drop it. Every persist in this function
    // spreads the payload (the pending rebuild, the recipient
    // refresh, every problem/sent write), so the marker now survives
    // them all: if the reconciliation problem-write at the dispatch
    // check below fails and the webhook answers 503, the stored
    // record still holds the marker, and the next redelivery's
    // dispatch check refuses instead of dispatching into a receiver
    // that may already hold the order.
    ...(existing?.alternateDispatch
      ? { alternateDispatch: existing.alternateDispatch }
      : {}),
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
        currency: payload.currency ?? null,
        includesSecondCopy: payload.includesSecondCopy,
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
      mainItemQuantity: payload.includesSecondCopy ? 2 : 1,
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
    // M1-04: destination exclusivity. Printful v1 was selected for this
    // invocation and has accepted (or its outcome was handled above); the
    // alternate fulfillment webhook must never also receive this order.
    return;
  }

  if (!printFulfillmentWebhookUrl) return;

  // S94-1 F9: replay-safe dispatch to the alternate destination (see
  // AlternateFulfillmentDispatch in printOrders), applied exactly where
  // the alternate webhook is the fulfiller (the same condition as the
  // problem/sent persists below). A prior attempt whose outcome was
  // never durably resolved refuses redispatch — the receiver may
  // already hold this order; an operator reconciles. Gate fix round 2
  // (PR #477): a legacy "rejected" marker refuses identically — it
  // encodes an ambiguous response, not a proven refusal. Gate fix
  // round 3: ANY present marker refuses, including one whose
  // persisted state is missing or unrecognized (fail closed) —
  // dispatch happens only when no marker exists.
  const alternateIsFulfiller = !isPrintfulConfigured();
  const dispatchId = alternateFulfillmentDispatchId(session.id);
  const existingAlternateDispatch = existing?.alternateDispatch;
  if (alternateIsFulfiller && alternateDispatchBlocksRedispatch(existingAlternateDispatch)) {
    await persistProblemPrintOrder({
      ...payload,
      printAssetUrl,
      status: "failed",
      error: "alternate_dispatch_reconciliation_required",
      alternateDispatch: existingAlternateDispatch,
    });
    return;
  }
  if (alternateIsFulfiller) {
    payload = {
      ...payload,
      alternateDispatch: { dispatchId, state: "attempted", attemptedAt: Date.now() },
    };
    // The attempt marker must be durable BEFORE the outbound side
    // effect; if it cannot be retained, fail closed and never dispatch.
    assertPrintOrderRetained(await persistPrintOrderRecord(session.id, payload));
  }

  let webhookResponse: Response;
  try {
    webhookResponse = await fetch(printFulfillmentWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": dispatchId },
      body: JSON.stringify(
        buildAlternateFulfillmentWebhookPayload(payload, {
          printAssetUrl,
          cardPrintAssetUrl,
          recipient,
        }),
      ),
    });
  } catch (error) {
    // Outbound fulfillment failures only — durable persistence errors must not land here.
    if (isDurableKvPersistenceError(error)) throw error;
    if (!isPrintfulConfigured()) {
      // The dispatch outcome is unknown (no response): the marker in
      // payload stays "attempted", so a later pass refuses instead of
      // redispatching.
      await persistProblemPrintOrder({
        ...payload,
        printAssetUrl,
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 320) : "webhook_failed",
      });
    }
    return;
  }

  if (!webhookResponse.ok) {
    // Gate fix round 1 (Codex P1-C on PR #477): a non-2xx answer
    // does NOT prove the receiver rejected the dispatch — the
    // receiver may have created the order before failing, or an
    // intermediary may have answered after the receiver accepted.
    // No status is provably a rejection (the receiver's contract
    // defines none, and receiver-side idempotency is optional), so
    // the attempt stays "attempted": the response facts are recorded
    // for the operator, and any later pass refuses to redispatch
    // until the dispatch is reconciled.
    const body = await webhookResponse.text().catch(() => "");
    if (!isPrintfulConfigured()) {
      await persistProblemPrintOrder({
        ...payload,
        printAssetUrl,
        status: "failed",
        alternateDispatch: {
          dispatchId,
          state: "attempted",
          attemptedAt: payload.alternateDispatch?.attemptedAt ?? Date.now(),
          respondedAt: Date.now(),
          httpStatus: webhookResponse.status,
        },
        error: `Webhook ${webhookResponse.status}: ${body.slice(0, 280)}`.slice(0, 320),
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
      alternateDispatch: {
        dispatchId,
        state: "accepted",
        attemptedAt: payload.alternateDispatch?.attemptedAt ?? Date.now(),
        respondedAt: Date.now(),
        httpStatus: webhookResponse.status,
      },
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
  const expiresAtMs =
    typeof hydrated.expires_at === "number" && Number.isFinite(hydrated.expires_at)
      ? hydrated.expires_at * 1000
      : eventCreated * 1000;
  const existing = await kv.get<SessionRecord>(sessionKey(hydrated.id));
  // Option B: confirmed recovery delivery is recorded in a separate record,
  // never as a session-record replacement. The pre-B write spread a stale
  // expired-session base (paid:false, with stale balances/revocation riding
  // in the re-read record) over the entitlement record; the sidecar removes
  // that writer entirely. Legacy session-carried recovery fields remain
  // readable as a fallback.
  const existingRecoveryResult = await kv.get<RecoveryResultRecord>(
    ENTITLEMENT_KV.recoveryResult(hydrated.id),
  );
  const priorRecoverySentAt =
    existing?.recoveryEmailSentAt ?? existingRecoveryResult?.recoveryEmailSentAt;

  let recoveryOutcome: CheckoutRecoveryRetryability | "skipped" | "already_delivered" = "skipped";
  let wroteRecoveryResult = false;

  // Aggregate-only expired-session observability (no email/PII in logs).
  console.info("checkout_session_expired", {
    hasCustomerEmail: Boolean(customerEmail),
    hasRecoveryUrl: Boolean(recoveryUrl),
    orderType,
    plan,
    printVariant: orderType === "print" ? printVariant : null,
    recoveryEligible: Boolean(recoveryUrl && customerEmail),
    eventIdPresent: Boolean(eventId),
  });

  if (recoveryUrl && customerEmail) {
    const deliveredMarker = await kv.get(checkoutRecoveryEmailDeliveredKey(hydrated.id));
    const sessionAlreadySucceeded = priorRecoverySentAt != null;
    const markerPresent = isCheckoutRecoveryDeliveredMarker(deliveredMarker);

    if (sessionAlreadySucceeded || markerPresent) {
      recoveryOutcome = "already_delivered";
      // Success without marker: backfill marker only — never rewrite sessionKey.
      if (sessionAlreadySucceeded && !markerPresent) {
        await kv.set(
          checkoutRecoveryEmailDeliveredKey(hydrated.id),
          { delivered: true as const, at: priorRecoverySentAt as number },
          { ex: CHECKOUT_RECOVERY_EMAIL_DELIVERED_TTL_SECONDS },
        );
      }
      // Marker-only (success not yet visible): acknowledge without touching sessionKey.
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
        // Option B: the success lands in the recovery sidecar record; the
        // entitlement session record is not written by this handler at all.
        const recoveryRecord: RecoveryResultRecord = {
          schemaVersion: SETTLEMENT_SCHEMA_VERSION,
          sessionId: hydrated.id,
          ...deliveredFields,
          expiredAt: expiresAtMs,
          recoveryUrl,
          recordedAt: Date.now(),
        };
        try {
          await kv.setDurable(ENTITLEMENT_KV.recoveryResult(hydrated.id), recoveryRecord);
          wroteRecoveryResult = true;
          recoveryOutcome = alertResult.retryability;
          await kv.set(
            checkoutRecoveryEmailDeliveredKey(hydrated.id),
            { delivered: true as const, at: deliveredFields.recoveryEmailSentAt ?? Date.now() },
            { ex: CHECKOUT_RECOVERY_EMAIL_DELIVERED_TTL_SECONDS },
          );
        } catch (error) {
          console.warn("Checkout recovery durable result persistence failed; deferring marker", error);
          // Attempt record already written. Do not write delivered marker or claim durable success.
          // Still inside safe window: leave retryable — Idempotency-Key prevents duplicate send.
          // A later Stripe redelivery past the deadline will suppress Resend (fail closed).
          recoveryOutcome = "retryable";
        }
      } else {
        // Non-delivered: attempt record only. Acknowledge visible winner without session rewrite.
        const latestMarker = await kv.get(checkoutRecoveryEmailDeliveredKey(hydrated.id));
        const latestSession = await kv.get<SessionRecord>(sessionKey(hydrated.id));
        const latestRecoveryResult = await kv.get<RecoveryResultRecord>(
          ENTITLEMENT_KV.recoveryResult(hydrated.id),
        );
        const observedSuccessAt =
          latestSession?.recoveryEmailSentAt ?? latestRecoveryResult?.recoveryEmailSentAt;
        const observedSessionSuccess = observedSuccessAt != null;
        const observedMarker = isCheckoutRecoveryDeliveredMarker(latestMarker);
        if (observedSessionSuccess || observedMarker) {
          recoveryOutcome = "already_delivered";
          if (observedSessionSuccess && !observedMarker) {
            await kv.set(
              checkoutRecoveryEmailDeliveredKey(hydrated.id),
              { delivered: true as const, at: observedSuccessAt as number },
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
  const finalRecoveryResult = await kv.get<RecoveryResultRecord>(
    ENTITLEMENT_KV.recoveryResult(hydrated.id),
  );
  const deliveryVisible =
    wroteRecoveryResult ||
    Boolean(finalSession?.recoveryEmailSentAt) ||
    Boolean(finalRecoveryResult?.recoveryEmailSentAt) ||
    isCheckoutRecoveryDeliveredMarker(finalMarker);

  const retryable =
    !deliveryVisible && isCheckoutRecoveryWebhookRetryable(recoveryOutcome);
  return { retryable };
}

/**
 * Shared fulfillment pass for a settled-or-completed checkout session.
 *
 * Runs the discount gate, then the payment-gated grants (markSessionPaid and
 * applyReferralReward self-gate on isFulfillableCheckoutPayment) and the print
 * queue. The print queue is payment-gated here as well: an async payment
 * method completes checkout with payment_status "unpaid", and manufacturing
 * the order before settlement would ship against a payment that can still
 * fail. Settlement re-enters through checkout.session.async_payment_succeeded,
 * which runs this same pass once the session is fulfillable; queuePrintOrder
 * no-ops on a record already "sent", so the pair queues exactly one order.
 *
 * Persists the terminal event dedupe exactly like the completed handler
 * always has; returns retryable=true when Stripe must redeliver instead.
 */
async function processCheckoutFulfillment(
  session: Stripe.Checkout.Session,
  eventDedupeKey: string,
): Promise<{ retryable: boolean }> {
  let fulfilledSession = session;
  try {
    // digital_comp must not entitle print/pack3/subscription (hosted-page bypass).
    // Pinned Stripe API carries applied discounts in total_details.breakdown —
    // hydrate when the event payload lacks that expansion before running the gate.
    if (
      stripe &&
      sessionHasAppliedDiscount(fulfilledSession) &&
      !fulfilledSession.total_details?.breakdown
    ) {
      fulfilledSession = await stripe.checkout.sessions.retrieve(fulfilledSession.id, {
        expand: ["total_details.breakdown"],
      });
    }
    const orderType = getOrderType(fulfilledSession);
    const hasDigitalAddOn = includesDigitalAddOn(fulfilledSession);
    const plan = getPlan(fulfilledSession, orderType, hasDigitalAddOn);
    let skipEntitlementGrants = false;
    let skipPrintOrder = false;
    if (stripe) {
      const discountGate = await evaluateCheckoutSessionDiscountFulfillment({
        session: fulfilledSession,
        orderType,
        plan,
        lookup: createStripeCouponLookup(stripe),
      });
      if (!discountGate.ok) {
        if (isDiscountFulfillmentRetryable(discountGate)) {
          // Transient coupon lookup / unresolved discount — do not finalize
          // dedupe so Stripe redelivers; never grant on an unresolved gate.
          console.warn(
            `Discount coupon resolution retryable for session ${fulfilledSession.id}: ${discountGate.reason}`,
          );
          return { retryable: true };
        }
        skipEntitlementGrants = true;
        skipPrintOrder = true;
        console.warn(
          `Skipping paid entitlement grants and print queue for session ${fulfilledSession.id}: ${discountGate.reason}`,
        );
      }
    }
    const paymentFulfillable = isFulfillableCheckoutPayment(fulfilledSession);
    if (!skipEntitlementGrants) {
      const paidOutcome = await markSessionPaid(fulfilledSession);
      if (paidOutcome.kind === "revoked") {
        // S93-1 item 5: settlement observed revocation (e.g. a PI
        // tombstone persisted before the session association existed).
        // The referral application for this pass is suppressed;
        // applyReferralReward also re-checks the evidence itself
        // before any grant, to cover evidence arriving later.
        skipEntitlementGrants = true;
      }
    }
    if (!skipPrintOrder && paymentFulfillable) {
      await queuePrintOrder(fulfilledSession);
    } else if (!skipPrintOrder && orderType === "print") {
      console.info("print_order_deferred_until_payment_settles", {
        sessionId: fulfilledSession.id,
        paymentStatus: fulfilledSession.payment_status,
      });
    }
    if (!skipEntitlementGrants) {
      await applyReferralReward(fulfilledSession);
    }
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
      return { retryable: !deduped };
    }
    // Durable print-order persistence failure must not finalize dedupe — Stripe
    // redelivery must be able to queue the paid order again.
    if (isPrintOrderAuthorityBindError(error)) {
      // Provider accepted but DO bind unread/conflicted — Stripe must retry; do not finalize dedupe.
      console.error("Print order authority bind failed after provider accept; Stripe event remains retryable", {
        sessionId: session.id,
        reason: error.reason,
      });
      return { retryable: true };
    }
    if (isDurableKvPersistenceError(error)) {
      return { retryable: true };
    }
    // Referral grant hit transient authority contention/outage: its
    // idempotency claim was rolled back, so redelivery can complete the
    // grant. Do not finalize dedupe (Codex P2, PR #367).
    if (isReferralGrantTransientError(error)) {
      console.warn("Referral grant transiently skipped; Stripe event remains retryable", {
        sessionId: session.id,
      });
      return { retryable: true };
    }
    throw error;
  }
  const deduped = await persistWebhookEventDedupe(eventDedupeKey);
  return { retryable: !deduped };
}

/**
 * checkout.session.async_payment_failed: the async payment never settled, so
 * the completed handler granted nothing and queued nothing (every grant is
 * payment-gated). Defensively finalize any print record still "pending"
 * (e.g. queued before payment gating existed) so no later path can submit
 * it. A record already "sent" is with the provider — log only.
 */
async function finalizeAsyncPaymentFailed(session: Stripe.Checkout.Session) {
  if (!session.id) return;
  console.info("checkout_session_async_payment_failed", { sessionId: session.id });
  if (getOrderType(session) !== "print") return;
  const existing = await kv.get<PrintOrderRecord>(printOrderKey(session.id));
  if (!existing) return;
  if (existing.status === "sent") {
    console.warn("async_payment_failed for already-submitted print order", {
      sessionId: session.id,
    });
    return;
  }
  if (existing.status !== "pending") return;
  assertPrintOrderRetained(
    await persistPrintOrderRecord(session.id, {
      ...existing,
      status: "failed",
      error: "async_payment_failed",
      // Not a provider terminal event — clear any stale terminal provenance.
      terminalEventType: null,
    }),
  );
}

/**
 * S93-1 item 6 outcome. `applied` and `refused_activation` are terminal
 * handlings (the caller finalizes event dedupe); `retryable` leaves the
 * event unfinalized so Stripe redelivers.
 */
type SubscriptionEventOutcome =
  | { kind: "applied" }
  | { kind: "refused_activation"; reason: string }
  | { kind: "retryable"; reason: string };

/**
 * Apply a customer.subscription.updated/deleted event to the mapped
 * entitlement session (S93-1 item 6, bounded interim mitigation).
 *
 * The pre-fix branch replaced the session unconditionally: an
 * active/trialing event set paid: true and cleared revocation fields
 * even over a refund revocation, republishing whatever stale snapshot
 * it had read. This handler instead:
 * - requires a present session whose subscriptionId matches the event
 *   subscription (missing/mismatched association is retryable — never
 *   a partial entitlement constructed from an empty spread);
 * - reads revocation evidence through the strict reader (item 5)
 *   before applying status — observed external revocation means NO
 *   activation and NO session replacement, and an unreadable evidence
 *   state throws (the caller leaves the event retryable);
 * - refuses activation when the mutable revocation reason is anything
 *   other than "subscription_inactive" — an active event may clear
 *   only that one reason;
 * - re-reads the session and the evidence immediately before a
 *   permitted put, builds the write from that re-read, and writes
 *   durably;
 * - re-checks evidence after an activation put: revocation landing
 *   during the put converges through markSessionRevoked and the event
 *   stays retryable — an activation is never finalized as successful
 *   after observed revocation.
 * Inactive events preserve an existing refund/dispute reason and
 * timestamp. This mitigates visible revocation conflicts only; the
 * check-then-put race and stale-accounting republication are retained
 * residuals (full closure needs the entitlement authority to own
 * subscription status — deliberately not invented here).
 */
async function applySubscriptionEvent(
  subscription: Stripe.Subscription,
): Promise<SubscriptionEventOutcome> {
  if (!subscription.id) return { kind: "retryable", reason: "subscription_id_missing" };
  const sessionId = await kv.get<string>(subscriptionKey(subscription.id));
  if (!sessionId) return { kind: "retryable", reason: "subscription_mapping_missing" };
  const key = sessionKey(sessionId);
  const existing = await kv.get<SessionRecord>(key);
  if (!existing) return { kind: "retryable", reason: "subscription_session_missing" };
  if (existing.subscriptionId !== subscription.id) {
    return { kind: "retryable", reason: "subscription_mapping_mismatch" };
  }
  const active = subscription.status === "active" || subscription.status === "trialing";

  const evidence = await readSessionRevocationEvidenceStrict(
    sessionId,
    existing.paymentIntentId ?? null,
  );
  if (evidence.revoked) {
    return { kind: "refused_activation", reason: evidence.reason ?? "refund" };
  }

  if (!active) {
    const fresh = await kv.get<SessionRecord>(key);
    if (!fresh || fresh.subscriptionId !== subscription.id) {
      return { kind: "retryable", reason: "subscription_session_changed" };
    }
    const freshEvidence = await readSessionRevocationEvidenceStrict(
      sessionId,
      fresh.paymentIntentId ?? null,
    );
    if (freshEvidence.revoked) {
      return { kind: "refused_activation", reason: freshEvidence.reason ?? "refund" };
    }
    if (fresh.revoked && fresh.reason && fresh.reason !== "subscription_inactive") {
      // Preserve the refund/dispute reason and timestamp exactly; only
      // the subscription activity flags move.
      await kv.setDurable(key, {
        ...fresh,
        paid: false,
        revoked: true,
        subscriptionActive: false,
      });
      return { kind: "applied" };
    }
    await kv.setDurable(key, {
      ...fresh,
      paid: false,
      revoked: true,
      subscriptionActive: false,
      revokedAt: Date.now(),
      reason: "subscription_inactive",
    });
    return { kind: "applied" };
  }

  // Active/trialing may clear only a subscription_inactive revocation.
  if (existing.revoked && existing.reason !== "subscription_inactive") {
    return { kind: "refused_activation", reason: existing.reason ?? "revoked" };
  }
  const fresh = await kv.get<SessionRecord>(key);
  if (!fresh || fresh.subscriptionId !== subscription.id) {
    return { kind: "retryable", reason: "subscription_session_changed" };
  }
  if (fresh.revoked && fresh.reason !== "subscription_inactive") {
    return { kind: "refused_activation", reason: fresh.reason ?? "revoked" };
  }
  const freshEvidence = await readSessionRevocationEvidenceStrict(
    sessionId,
    fresh.paymentIntentId ?? null,
  );
  if (freshEvidence.revoked) {
    return { kind: "refused_activation", reason: freshEvidence.reason ?? "refund" };
  }
  await kv.setDurable(key, {
    ...fresh,
    paid: true,
    revoked: false,
    subscriptionActive: true,
    revokedAt: undefined,
    reason: undefined,
  });
  const postEvidence = await readSessionRevocationEvidenceStrict(
    sessionId,
    fresh.paymentIntentId ?? null,
  );
  if (postEvidence.revoked) {
    await markSessionRevoked(sessionId, postEvidence.reason ?? "refund");
    return { kind: "retryable", reason: "revocation_observed_after_activation" };
  }
  return { kind: "applied" };
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
  const isAsyncPaymentSucceededEvent = event.type === "checkout.session.async_payment_succeeded";
  const isAsyncPaymentFailedEvent = event.type === "checkout.session.async_payment_failed";
  // Refund/dispute events drive the referral reversal; since DL-1 Slice 3
  // that reversal can be transiently deferred by an authority outage, so
  // these events defer dedupe too — a deferred reversal answers 503 and
  // Stripe redelivery completes it, instead of the pre-processing dedupe
  // acking the redelivery as a duplicate (Codex P2, PR #367).
  const isReferralReversalEvent =
    event.type === "charge.refunded" ||
    event.type === "charge.dispute.created" ||
    event.type === "charge.dispute.funds_withdrawn";
  // S93-1 item 7: subscription events defer dedupe too. The pre-fix
  // pre-processing kv.incr acknowledged the event before handling, so a
  // session-write failure after a successful increment was permanently
  // acked on replay (duplicate: true) and the update was lost.
  const isSubscriptionEvent =
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted";
  // Defer dedupe finalization for events whose critical side effects must remain
  // Stripe-retryable when durable persistence fails mid-handling.
  const deferDedupeUntilSuccess =
    isExpiredCheckoutEvent ||
    isCompletedCheckoutEvent ||
    isAsyncPaymentSucceededEvent ||
    isAsyncPaymentFailedEvent ||
    isReferralReversalEvent ||
    isSubscriptionEvent;

  // Unrelated Stripe event types keep pre-processing dedupe.
  // checkout.session.expired / checkout.session.completed / the async-payment
  // settlement events finalize dedupe only after successful handling so
  // retryable durable failures remain eligible for redelivery.
  if (!deferDedupeUntilSuccess) {
    const dedupeCount = await kv.incr(eventDedupeKey, 1, {
      ex: WEBHOOK_EVENT_DEDUPE_TTL_SECONDS,
    });
    if (dedupeCount > 1) {
      return NextResponse.json({ received: true, duplicate: true });
    }
  } else {
    const existingEvent = await kv.get(eventDedupeKey);
    // For subscription events only a validated terminal marker object
    // means duplicate: numeric counters left by the old pre-processing
    // incr do not establish application success and must re-enter
    // processing (S93-1 item 7).
    const isDuplicate = isSubscriptionEvent
      ? isWebhookTerminalDedupeMarker(existingEvent)
      : Boolean(existingEvent);
    if (isDuplicate) {
      return NextResponse.json({ received: true, duplicate: true });
    }
  }

  let expiredRecoveryRetryable = false;
  let completedCheckoutRetryable = false;
  let asyncPaymentFailedRetryable = false;
  let referralReversalRetryable = false;
  let subscriptionRetryable = false;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const { retryable } = await processCheckoutFulfillment(session, eventDedupeKey);
      if (retryable) {
        completedCheckoutRetryable = true;
      }
      break;
    }
    case "checkout.session.async_payment_succeeded": {
      // Settlement of an async payment method. The completed event already ran
      // with payment_status "unpaid" and every grant stayed payment-gated off;
      // run the same fulfillment pass now that the session is fulfillable.
      const session = event.data.object as Stripe.Checkout.Session;
      const { retryable } = await processCheckoutFulfillment(session, eventDedupeKey);
      if (retryable) {
        completedCheckoutRetryable = true;
      }
      break;
    }
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      try {
        await finalizeAsyncPaymentFailed(session);
        const deduped = await persistWebhookEventDedupe(eventDedupeKey);
        if (!deduped) {
          asyncPaymentFailedRetryable = true;
        }
      } catch (error) {
        if (isDurableKvPersistenceError(error)) {
          asyncPaymentFailedRetryable = true;
          break;
        }
        throw error;
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
      // S93-1 item 7: the handler runs inside explicit retryable error
      // handling — any failure (including unreadable revocation
      // evidence) leaves the event unfinalized for redelivery.
      try {
        const outcome = await applySubscriptionEvent(subscription);
        if (outcome.kind === "retryable") {
          console.error("Subscription event handling retryable", {
            eventId: event.id,
            reason: outcome.reason,
          });
          subscriptionRetryable = true;
        }
      } catch (error) {
        console.error("Subscription event handling failed; leaving event retryable", {
          eventId: event.id,
          error,
        });
        subscriptionRetryable = true;
      }
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
        // M1-06 (Option B): resolve the payment intent even when a session
        // mapping already exists — the tombstone must not be omitted on
        // this branch, or a later settlement for the same PI can re-grant.
        if (!paymentIntentId) {
          paymentIntentId = await resolvePaymentIntentIdFromCharge(charge.id);
        }
        if (paymentIntentId) {
          await markPaymentIntentRevoked(paymentIntentId, "refund");
        } else {
          await recordRevocationUnresolved(sessionId, "refund");
        }
        const reversal = await reverseReferralReward(sessionId, "refund");
        if (reversal.deferred) referralReversalRetryable = true;
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
        // M1-06 (Option B): same tombstone completeness as the refund
        // branch — resolve the PI even with a known session mapping.
        if (!paymentIntentId && chargeId) {
          paymentIntentId = await resolvePaymentIntentIdFromCharge(chargeId);
        }
        if (paymentIntentId) {
          await markPaymentIntentRevoked(paymentIntentId, "dispute");
        } else {
          await recordRevocationUnresolved(sessionId, "dispute");
        }
        const reversal = await reverseReferralReward(sessionId, "dispute");
        if (reversal.deferred) referralReversalRetryable = true;
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

  // Deferred-dedupe reversal events finalize their dedupe only on
  // success (mirroring the checkout flows): a deferred reversal leaves
  // no dedupe behind, so the 503 below buys a real redelivery.
  if (isReferralReversalEvent && !referralReversalRetryable) {
    const deduped = await persistWebhookEventDedupe(eventDedupeKey);
    if (!deduped) referralReversalRetryable = true;
  }

  // S93-1 item 7: subscription events likewise finalize dedupe only
  // after an applied or deliberately refused activation completes;
  // a failed terminal-marker write is itself retryable.
  if (isSubscriptionEvent && !subscriptionRetryable) {
    const deduped = await persistWebhookEventDedupe(eventDedupeKey);
    if (!deduped) subscriptionRetryable = true;
  }

  if (
    expiredRecoveryRetryable ||
    completedCheckoutRetryable ||
    asyncPaymentFailedRetryable ||
    referralReversalRetryable ||
    subscriptionRetryable
  ) {
    return NextResponse.json(
      {
        error: completedCheckoutRetryable
          ? "print_order_queue_retryable"
          : asyncPaymentFailedRetryable
            ? "async_payment_failed_finalize_retryable"
            : referralReversalRetryable
              ? "referral_reversal_retryable"
              : subscriptionRetryable
                ? "subscription_event_retryable"
                : "checkout_recovery_retryable",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ received: true });
}
