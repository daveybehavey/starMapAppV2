import { expect, test } from "@playwright/test";
import {
  canUseManualPromotionCode,
  selectCheckoutPromotion,
} from "../src/lib/checkoutPromotions";

test.describe("checkout promotion selection", () => {
  test("manual promotion codes are print-only", () => {
    expect(canUseManualPromotionCode("print", "single")).toBe(true);
    expect(canUseManualPromotionCode("digital", "single")).toBe(false);
    expect(canUseManualPromotionCode("digital", "pack3")).toBe(false);
    expect(canUseManualPromotionCode("digital", "subscription")).toBe(false);
  });

  test("applies manual promotion code only for print checkout", () => {
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
      manualPromotionCodeId: "promo_xmas15",
      referralCode: "REF12345",
      referralPromotionCodeId: "promo_referral_123",
      orderType: "digital",
      plan: "single",
    });
    // Digital ignores manual Christmas/print codes; referral auto may still apply.
    expect(digitalSelected).toEqual({
      promotionCodeId: "promo_referral_123",
      source: "referral_auto",
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
});
