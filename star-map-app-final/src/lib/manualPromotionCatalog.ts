import type { CheckoutOrderType, CheckoutPlan, PrintVariant } from "@/lib/pricing";
import type { PromotionTargetScope } from "@/lib/promotionOffer";

type ManualPromotionRule = {
  scope: PromotionTargetScope;
};

const MANUAL_PROMOTION_RULES: Record<string, ManualPromotionRule> = {
  PRINT10: { scope: "any_print" },
  REDDIT50: { scope: "single_digital" },
  TIKTOK50: { scope: "single_digital" },
};

function normalizePromoCode(raw: string | null | undefined) {
  const normalized = raw?.trim().toUpperCase();
  return normalized || null;
}

export function getManualPromotionRule(promoCode: string | null | undefined): ManualPromotionRule | null {
  const normalized = normalizePromoCode(promoCode);
  if (!normalized) return null;
  return MANUAL_PROMOTION_RULES[normalized] ?? null;
}

export function isManualPromotionAllowedForCheckout(input: {
  promoCode?: string | null;
  orderType: CheckoutOrderType;
  plan: CheckoutPlan;
  printVariant?: PrintVariant;
}) {
  const rule = getManualPromotionRule(input.promoCode);
  if (!rule) return true;

  switch (rule.scope) {
    case "single_digital":
      return input.orderType === "digital" && input.plan === "single";
    case "print_framed":
      return input.orderType === "print" && input.printVariant === "poster_framed";
    case "print_unframed":
      return input.orderType === "print" && input.printVariant === "poster_unframed";
    case "any_print":
      return input.orderType === "print";
    case "any":
    default:
      return true;
  }
}
