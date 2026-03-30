import type { CheckoutOrderType, CheckoutPlan, PrintVariant } from "@/lib/pricing";

export type PromotionSource = "none" | "manual" | "referral_auto";

export function selectCheckoutPromotion(input: {
  manualPromotionCodeId?: string;
  referralCode?: string;
  referralPromotionCodeId?: string;
  orderType: CheckoutOrderType;
  plan: CheckoutPlan;
  printVariant?: PrintVariant;
}): { promotionCodeId?: string; source: PromotionSource } {
  const manualPromotionCodeId = input.manualPromotionCodeId?.trim();
  const canApplyManualPromotion =
    input.orderType === "print" || (input.orderType === "digital" && input.plan === "single");
  if (manualPromotionCodeId && canApplyManualPromotion) {
    return { promotionCodeId: manualPromotionCodeId, source: "manual" };
  }

  const referralPromotionCodeId = input.referralPromotionCodeId?.trim();
  const hasReferralCode = Boolean(input.referralCode?.trim());
  const printVariant = input.printVariant ?? "poster_framed";
  const canApplyReferralPromotion =
    hasReferralCode &&
    Boolean(referralPromotionCodeId) &&
    (
      (input.orderType === "digital" && input.plan !== "subscription") ||
      (input.orderType === "print" && printVariant === "poster_framed")
    );

  if (canApplyReferralPromotion) {
    return { promotionCodeId: referralPromotionCodeId, source: "referral_auto" };
  }

  return { source: "none" };
}
