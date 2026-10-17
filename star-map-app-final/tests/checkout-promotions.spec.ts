import { expect, test } from "@playwright/test";
import {
  canUseHostedPromotionCodes,
  canUseManualPromotionCode,
  evaluateAppliedCouponsForOrderFulfillment,
  isDigitalCompCoupon,
  isFulfillableCheckoutPayment,
  isManualPromotionCompatibleWithOrder,
  resolveEditorCheckoutPromoCode,
  selectCheckoutPromotion,
} from "../src/lib/checkoutPromotions";

test.describe("checkout promotion selection", () => {
  test("manual promotion codes allowed for print and digital single", () => {
    expect(canUseManualPromotionCode("print", "single")).toBe(true);
    expect(canUseManualPromotionCode("digital", "single")).toBe(true);
    expect(canUseManualPromotionCode("digital", "pack3")).toBe(false);
    expect(canUseManualPromotionCode("digital", "subscription")).toBe(false);
  });

  test("hosted promotion codes remain print-only", () => {
    expect(canUseHostedPromotionCodes("print", "single")).toBe(true);
    expect(canUseHostedPromotionCodes("digital", "single")).toBe(false);
  });

  test("digital_comp metadata gates digital vs print compatibility", () => {
    expect(isDigitalCompCoupon({ metadata: { digital_comp: "true" } })).toBe(true);
    expect(
      isManualPromotionCompatibleWithOrder({
        orderType: "digital",
        plan: "single",
        coupon: { metadata: { digital_comp: "true" } },
      })
    ).toBe(true);
    expect(
      isManualPromotionCompatibleWithOrder({
        orderType: "digital",
        plan: "single",
        coupon: { metadata: {} },
      })
    ).toBe(false);
    expect(
      isManualPromotionCompatibleWithOrder({
        orderType: "print",
        plan: "single",
        coupon: { metadata: { digital_comp: "true" } },
      })
    ).toBe(false);
    expect(
      isManualPromotionCompatibleWithOrder({
        orderType: "digital",
        plan: "pack3",
        coupon: { metadata: { digital_comp: "true" } },
      })
    ).toBe(false);
  });

  test("applies manual promotion code for print; digital prefers manual when present", () => {
    const printSelected = selectCheckoutPromotion({
      manualPromotionCodeId: "promo_xmas15",
      referralCode: "REF12345",
      referralPromotionCodeId: "promo_referral_123",
      orderType: "print",
      plan: "single",
    });
    expect(printSelected).toEqual({
      promotionCodeId: "promo_xmas15",
      source: "manual",
    });

    const digitalSelected = selectCheckoutPromotion({
      manualPromotionCodeId: "promo_digital_comp",
      referralCode: "REF12345",
      referralPromotionCodeId: "promo_referral_123",
      orderType: "digital",
      plan: "single",
    });
    expect(digitalSelected).toEqual({
      promotionCodeId: "promo_digital_comp",
      source: "manual",
    });
  });

  test("applies referral auto promotion for digital non-subscription checkout", () => {
    const selected = selectCheckoutPromotion({
      referralCode: "REF12345",
      referralPromotionCodeId: "promo_referral_123",
      orderType: "digital",
      plan: "pack3",
    });

    expect(selected).toEqual({
      promotionCodeId: "promo_referral_123",
      source: "referral_auto",
    });
  });

  test("does not apply referral auto promotion for subscription or print checkout", () => {
    const subscriptionSelected = selectCheckoutPromotion({
      referralCode: "REF12345",
      referralPromotionCodeId: "promo_referral_123",
      orderType: "digital",
      plan: "subscription",
    });
    expect(subscriptionSelected).toEqual({ source: "none" });

    const printSelected = selectCheckoutPromotion({
      referralCode: "REF12345",
      referralPromotionCodeId: "promo_referral_123",
      orderType: "print",
      plan: "single",
    });
    expect(printSelected).toEqual({ source: "none" });
  });

  test("ignores referral attribution when referral promo id is not configured", () => {
    const selected = selectCheckoutPromotion({
      referralCode: "REF12345",
      referralPromotionCodeId: "   ",
      orderType: "digital",
      plan: "single",
    });

    expect(selected).toEqual({ source: "none" });
  });

  test("$0 discounted session fulfillment gate", () => {
    expect(
      isFulfillableCheckoutPayment({
        mode: "payment",
        payment_status: "no_payment_required",
        amount_total: 0,
        total_details: { amount_discount: 900 },
      })
    ).toBe(true);
    expect(
      isFulfillableCheckoutPayment({
        mode: "payment",
        payment_status: "no_payment_required",
        amount_total: 0,
      })
    ).toBe(false);
    expect(
      isFulfillableCheckoutPayment({
        mode: "payment",
        payment_status: "paid",
        amount_total: 900,
      })
    ).toBe(true);
  });

  test("fulfillment refuses digital_comp on print; allows digital single + referral", () => {
    const printRefused = evaluateAppliedCouponsForOrderFulfillment({
      orderType: "print",
      plan: "single",
      coupons: [{ metadata: { digital_comp: "true" } }],
      sessionHasDiscount: true,
    });
    expect(printRefused.ok).toBe(false);
    if (!printRefused.ok) {
      expect(printRefused.retryable).toBe(false);
    }
    expect(
      evaluateAppliedCouponsForOrderFulfillment({
        orderType: "digital",
        plan: "single",
        coupons: [{ metadata: { digital_comp: "true" } }],
        sessionHasDiscount: true,
      })
    ).toEqual({ ok: true });
    expect(
      evaluateAppliedCouponsForOrderFulfillment({
        orderType: "digital",
        plan: "single",
        coupons: [{ metadata: { referral: "true" } }],
        sessionHasDiscount: true,
      })
    ).toEqual({ ok: true });
  });

  test("cleared editor promo field does not fall back to URL code", () => {
    expect(
      resolveEditorCheckoutPromoCode({
        fieldValue: "",
        fieldEdited: true,
        queryPromoCode: "EXPIRED",
        storedPromoCode: "EXPIRED",
      })
    ).toBeNull();
    expect(
      resolveEditorCheckoutPromoCode({
        fieldValue: "",
        fieldEdited: false,
        queryPromoCode: "XMAS15",
        storedPromoCode: null,
      })
    ).toBe("XMAS15");
  });
});
