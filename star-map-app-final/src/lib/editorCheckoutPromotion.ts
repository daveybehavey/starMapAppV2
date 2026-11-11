import { canUseManualPromotionCode, isManualPromotionCompatibleWithOrder } from "@/lib/checkoutPromotions";
import type { CheckoutOrderType, CheckoutPlan } from "@/lib/pricing";
import { META_SEASONAL_CODES } from "@/lib/metaCheckout";

/** Only known seasonal print codes can be rejected here without Stripe metadata. */
export function resolveEditorSubmitPromotion(input: {
  promoCode: string | null;
  fieldEdited: boolean;
  orderType: CheckoutOrderType;
  plan: CheckoutPlan;
}): { promoCode: string | null; clearCarry: boolean } {
  const clearCarry =
    META_SEASONAL_CODES.some((row) => row.code === input.promoCode?.trim().toUpperCase()) &&
    !input.fieldEdited &&
    (!canUseManualPromotionCode(input.orderType, input.plan) ||
      !isManualPromotionCompatibleWithOrder({
        orderType: input.orderType,
        plan: input.plan,
        coupon: { metadata: {} },
      }));
  return { promoCode: clearCarry ? null : input.promoCode, clearCarry };
}
