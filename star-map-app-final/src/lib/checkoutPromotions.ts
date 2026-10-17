import type { CheckoutOrderType, CheckoutPlan } from "@/lib/pricing";

export type PromotionSource = "none" | "manual" | "referral_auto";

/** Stripe coupon metadata key for 100% digital make-good / reviewer sample codes. */
export const DIGITAL_COMP_COUPON_METADATA_KEY = "digital_comp";

/**
 * Manual promo codes may be accepted server-side for:
 * - print orders (XMAS15, BLACKFRIDAY20, etc.)
 * - digital single only when the coupon is tagged digital_comp (validated separately)
 *
 * Hosted Stripe `allow_promotion_codes` must stay off for digital — use
 * {@link canUseHostedPromotionCodes} for that gate.
 */
export function canUseManualPromotionCode(orderType: CheckoutOrderType, plan?: CheckoutPlan) {
  if (orderType === "print") return true;
  if (orderType === "digital" && plan === "single") return true;
  return false;
}

/**
 * Stripe hosted Checkout / recovery may collect typed codes only for print.
 * Digital SKUs use price_data that cannot be product-restricted in Stripe, so
 * promo_code params and `allow_promotion_codes` must stay off for digital.
 */
export function canUseHostedPromotionCodes(orderType: CheckoutOrderType, plan?: CheckoutPlan) {
  void plan;
  return orderType === "print";
}

type CouponMetadataLike = {
  metadata?: Record<string, string> | null;
} | null
  | undefined;

export function isDigitalCompCoupon(coupon: CouponMetadataLike): boolean {
  const value = coupon?.metadata?.[DIGITAL_COMP_COUPON_METADATA_KEY];
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

/**
 * After Stripe resolves a promotion code, decide whether it may apply to this order.
 * Digital single requires digital_comp metadata; print rejects that tag.
 */
export function isManualPromotionCompatibleWithOrder(input: {
  orderType: CheckoutOrderType;
  plan: CheckoutPlan;
  coupon: CouponMetadataLike;
}): boolean {
  if (!canUseManualPromotionCode(input.orderType, input.plan)) return false;
  const isComp = isDigitalCompCoupon(input.coupon);
  if (input.orderType === "digital") return isComp;
  // print: any coupon except digital-only comps
  return !isComp;
}

export function selectCheckoutPromotion(input: {
  manualPromotionCodeId?: string;
  referralCode?: string;
  referralPromotionCodeId?: string;
  orderType: CheckoutOrderType;
  plan: CheckoutPlan;
}): { promotionCodeId?: string; source: PromotionSource } {
  const manualPromotionCodeId = input.manualPromotionCodeId?.trim();
  if (manualPromotionCodeId && canUseManualPromotionCode(input.orderType, input.plan)) {
    return { promotionCodeId: manualPromotionCodeId, source: "manual" };
  }

  const referralPromotionCodeId = input.referralPromotionCodeId?.trim();
  const hasReferralCode = Boolean(input.referralCode?.trim());
  const canApplyReferralPromotion =
    hasReferralCode &&
    Boolean(referralPromotionCodeId) &&
    input.orderType === "digital" &&
    input.plan !== "subscription";

  if (canApplyReferralPromotion) {
    return { promotionCodeId: referralPromotionCodeId, source: "referral_auto" };
  }

  return { source: "none" };
}

type FulfillableSessionLike = {
  mode?: string | null;
  payment_status?: string | null;
  amount_total?: number | null;
  total_details?: { amount_discount?: number | null } | null;
  discounts?: Array<unknown> | null;
};

function sessionHasAppliedDiscount(session: FulfillableSessionLike): boolean {
  const discountCents =
    typeof session.total_details?.amount_discount === "number"
      ? session.total_details.amount_discount
      : 0;
  if (discountCents > 0) return true;
  return Array.isArray(session.discounts) && session.discounts.length > 0;
}

/**
 * Whether a Checkout Session may grant digital entitlement / fulfillment.
 * - `paid` sessions: unchanged (any positive or settled charge).
 * - `no_payment_required`: only when total is $0 and a discount was applied
 *   (100% referral / digital_comp), or the session is a subscription
 *   (free trial / $0 first invoice keeps existing behavior).
 */
export function isFulfillableCheckoutPayment(session: FulfillableSessionLike): boolean {
  const status = session.payment_status;
  if (status === "paid") return true;
  if (status !== "no_payment_required") return false;
  if (session.mode === "subscription") return true;
  const amountTotal = typeof session.amount_total === "number" ? session.amount_total : null;
  if (amountTotal !== 0) return false;
  return sessionHasAppliedDiscount(session);
}
