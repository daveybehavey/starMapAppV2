import { expect, test } from "@playwright/test";
import { selectCheckoutPromotion } from "../src/lib/checkoutPromotions";

test.describe("checkout promotion selection", () => {
  test("prioritizes manual promotion code over referral auto promotion", () => {
    const selected = selectCheckoutPromotion({
      manualPromotionCodeId: "promo_manual_123",
      referralCode: "REF12345",
      referralPromotionCodeId: "promo_referral_123",
      orderType: "digital",
      plan: "single",
    });

    expect(selected).toEqual({
      promotionCodeId: "promo_manual_123",
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

  test("applies referral auto promotion for framed print checkout", () => {
    const selected = selectCheckoutPromotion({
      referralCode: "REF12345",
      referralPromotionCodeId: "promo_referral_framed_123",
      orderType: "print",
      plan: "single",
      printVariant: "poster_framed",
    });

    expect(selected).toEqual({
      promotionCodeId: "promo_referral_framed_123",
      source: "referral_auto",
    });
  });

  test("does not apply referral auto promotion for subscription or unframed print checkout", () => {
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
      printVariant: "poster_unframed",
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
