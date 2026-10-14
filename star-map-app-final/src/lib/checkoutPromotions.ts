import type { CheckoutOrderType, CheckoutPlan } from "@/lib/pricing";

export type PromotionSource = "none" | "manual" | "referral_auto";

/**
 * Manual promo codes (XMAS15, BLACKFRIDAY20, etc.) are print-only.
 * Digital SKUs use one-off price_data / shared prices that cannot be product-restricted
 * in Stripe, so hosted `allow_promotion_codes` and promo_code params must stay off.
 */
export function canUseManualPromotionCode(orderType: CheckoutOrderType, plan?: CheckoutPlan) {
  void plan;
  return orderType === "print";
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
