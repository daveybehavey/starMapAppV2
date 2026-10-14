/**
 * Print-only manual promo codes (XMAS15 / BLACKFRIDAY20).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  canUseManualPromotionCode,
  selectCheckoutPromotion,
} from "../../src/lib/checkoutPromotions.ts";

test("canUseManualPromotionCode is true only for print orders", () => {
  assert.equal(canUseManualPromotionCode("print", "single"), true);
  assert.equal(canUseManualPromotionCode("digital", "single"), false);
  assert.equal(canUseManualPromotionCode("digital", "pack3"), false);
  assert.equal(canUseManualPromotionCode("digital", "subscription"), false);
});

test("selectCheckoutPromotion applies manual codes on print only", () => {
  assert.deepEqual(
    selectCheckoutPromotion({
      manualPromotionCodeId: "promo_xmas15",
      orderType: "print",
      plan: "single",
    }),
    { promotionCodeId: "promo_xmas15", source: "manual" }
  );

  assert.deepEqual(
    selectCheckoutPromotion({
      manualPromotionCodeId: "promo_blackfriday20",
      orderType: "digital",
      plan: "single",
    }),
    { source: "none" }
  );
});

test("digital single with manual + referral prefers referral auto (manual ignored)", () => {
  assert.deepEqual(
    selectCheckoutPromotion({
      manualPromotionCodeId: "promo_xmas15",
      referralCode: "REF12345",
      referralPromotionCodeId: "promo_referral_123",
      orderType: "digital",
      plan: "single",
    }),
    { promotionCodeId: "promo_referral_123", source: "referral_auto" }
  );
});
