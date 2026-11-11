import { canUseManualPromotionCode, isManualPromotionCompatibleWithOrder } from "@/lib/checkoutPromotions";
import type { CheckoutOrderType, CheckoutPlan } from "@/lib/pricing";

/** Auto-supplied codes have no digital_comp metadata; the API resolves typed codes. */
export function resolveEditorSubmitPromotion(input: {
  promoCode: string | null;
  fieldEdited: boolean;
  orderType: CheckoutOrderType;
  plan: CheckoutPlan;
}): { promoCode: string | null; clearCarry: boolean } {
  const clearCarry =
    Boolean(input.promoCode) &&
    !input.fieldEdited &&
    (!canUseManualPromotionCode(input.orderType, input.plan) ||
      !isManualPromotionCompatibleWithOrder({
        orderType: input.orderType,
        plan: input.plan,
        coupon: { metadata: {} },
      }));
  return { promoCode: clearCarry ? null : input.promoCode, clearCarry };
}
