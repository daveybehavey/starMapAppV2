import type { CheckoutOrderType, CheckoutPlan } from "@/lib/pricing";

export type PromotionSource = "none" | "manual" | "referral_auto";

export function selectCheckoutPromotion(input: {
  manualPromotionCodeId?: string;
  referralCode?: string;
  referralPromotionCodeId?: string;
  orderType: CheckoutOrderType;
  plan: CheckoutPlan;
}): { promotionCodeId?: string; source: PromotionSource } {
  const manualPromotionCodeId = input.manualPromotionCodeId?.trim();
  const canApplyManualPromotion =
    input.orderType === "print" || (input.orderType === "digital" && input.plan === "single");
  if (manualPromotionCodeId && canApplyManualPromotion) {
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
