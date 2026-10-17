/**
 * Manual promo codes: print + digital_comp single; hosted entry stays print-only.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  canUseHostedPromotionCodes,
  canUseManualPromotionCode,
  isDigitalCompCoupon,
  isFulfillableCheckoutPayment,
  isManualPromotionCompatibleWithOrder,
  selectCheckoutPromotion,
} from "../../src/lib/checkoutPromotions.ts";

test("canUseManualPromotionCode allows print and digital single only", () => {
  assert.equal(canUseManualPromotionCode("print", "single"), true);
  assert.equal(canUseManualPromotionCode("digital", "single"), true);
  assert.equal(canUseManualPromotionCode("digital", "pack3"), false);
  assert.equal(canUseManualPromotionCode("digital", "subscription"), false);
});

test("canUseHostedPromotionCodes stays print-only", () => {
  assert.equal(canUseHostedPromotionCodes("print", "single"), true);
  assert.equal(canUseHostedPromotionCodes("digital", "single"), false);
  assert.equal(canUseHostedPromotionCodes("digital", "pack3"), false);
});

test("isDigitalCompCoupon requires metadata digital_comp=true", () => {
  assert.equal(isDigitalCompCoupon({ metadata: { digital_comp: "true" } }), true);
  assert.equal(isDigitalCompCoupon({ metadata: { digital_comp: "TRUE" } }), true);
  assert.equal(isDigitalCompCoupon({ metadata: { digital_comp: "false" } }), false);
  assert.equal(isDigitalCompCoupon({ metadata: {} }), false);
  assert.equal(isDigitalCompCoupon(null), false);
});

test("digital single + digital_comp coupon is compatible", () => {
  assert.equal(
    isManualPromotionCompatibleWithOrder({
      orderType: "digital",
      plan: "single",
      coupon: { metadata: { digital_comp: "true" } },
    }),
    true
  );
});

test("digital + coupon without digital_comp metadata is rejected", () => {
  assert.equal(
    isManualPromotionCompatibleWithOrder({
      orderType: "digital",
      plan: "single",
      coupon: { metadata: { campaign: "xmas15" } },
    }),
    false
  );
});

test("print + digital_comp coupon is rejected", () => {
  assert.equal(
    isManualPromotionCompatibleWithOrder({
      orderType: "print",
      plan: "single",
      coupon: { metadata: { digital_comp: "true" } },
    }),
    false
  );
});

test("print + ordinary coupon remains allowed", () => {
  assert.equal(
    isManualPromotionCompatibleWithOrder({
      orderType: "print",
      plan: "single",
      coupon: { metadata: { campaign: "xmas15" } },
    }),
    true
  );
});

test("subscription and pack3 reject tagged digital_comp coupons", () => {
  const tagged = { metadata: { digital_comp: "true" } };
  assert.equal(
    isManualPromotionCompatibleWithOrder({
      orderType: "digital",
      plan: "subscription",
      coupon: tagged,
    }),
    false
  );
  assert.equal(
    isManualPromotionCompatibleWithOrder({
      orderType: "digital",
      plan: "pack3",
      coupon: tagged,
    }),
    false
  );
});

test("selectCheckoutPromotion applies manual codes on print and digital single", () => {
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
      manualPromotionCodeId: "promo_digital_comp",
      orderType: "digital",
      plan: "single",
    }),
    { promotionCodeId: "promo_digital_comp", source: "manual" }
  );

  assert.deepEqual(
    selectCheckoutPromotion({
      manualPromotionCodeId: "promo_digital_comp",
      orderType: "digital",
      plan: "pack3",
    }),
    { source: "none" }
  );
});

test("referral auto path is unchanged when no manual code", () => {
  assert.deepEqual(
    selectCheckoutPromotion({
      referralCode: "REF12345",
      referralPromotionCodeId: "promo_referral_123",
      orderType: "digital",
      plan: "single",
    }),
    { promotionCodeId: "promo_referral_123", source: "referral_auto" }
  );

  assert.deepEqual(
    selectCheckoutPromotion({
      referralCode: "REF12345",
      referralPromotionCodeId: "promo_referral_123",
      orderType: "digital",
      plan: "pack3",
    }),
    { promotionCodeId: "promo_referral_123", source: "referral_auto" }
  );
});

test("digital single with manual + referral prefers manual (comp override)", () => {
  assert.deepEqual(
    selectCheckoutPromotion({
      manualPromotionCodeId: "promo_digital_comp",
      referralCode: "REF12345",
      referralPromotionCodeId: "promo_referral_123",
      orderType: "digital",
      plan: "single",
    }),
    { promotionCodeId: "promo_digital_comp", source: "manual" }
  );
});

test("$0 session with discount is fulfillable; non-zero unpaid is not", () => {
  assert.equal(
    isFulfillableCheckoutPayment({
      mode: "payment",
      payment_status: "paid",
      amount_total: 900,
    }),
    true
  );
  assert.equal(
    isFulfillableCheckoutPayment({
      mode: "payment",
      payment_status: "no_payment_required",
      amount_total: 0,
      total_details: { amount_discount: 900 },
    }),
    true
  );
  assert.equal(
    isFulfillableCheckoutPayment({
      mode: "payment",
      payment_status: "no_payment_required",
      amount_total: 0,
      discounts: [{ promotion_code: "promo_comp" }],
    }),
    true
  );
  assert.equal(
    isFulfillableCheckoutPayment({
      mode: "payment",
      payment_status: "no_payment_required",
      amount_total: 0,
      total_details: { amount_discount: 0 },
      discounts: [],
    }),
    false
  );
  assert.equal(
    isFulfillableCheckoutPayment({
      mode: "payment",
      payment_status: "no_payment_required",
      amount_total: 900,
      total_details: { amount_discount: 100 },
    }),
    false
  );
  assert.equal(
    isFulfillableCheckoutPayment({
      mode: "payment",
      payment_status: "unpaid",
      amount_total: 0,
    }),
    false
  );
  assert.equal(
    isFulfillableCheckoutPayment({
      mode: "subscription",
      payment_status: "no_payment_required",
      amount_total: 0,
    }),
    true
  );
});
