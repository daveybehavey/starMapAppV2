/**
 * Regression: digital_comp must not entitle print/pack3/subscription at
 * webhook + verify fulfillment gates; editor cleared promo must not resend URL code.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  evaluateAppliedCouponsForOrderFulfillment,
  evaluateCheckoutSessionDiscountFulfillment,
  resolveCheckoutSessionDiscountCoupons,
  resolveEditorCheckoutPromoCode,
} from "../../src/lib/checkoutPromotions.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WEBHOOK = path.join(ROOT, "src/app/api/stripe/webhook/route.ts");
const VERIFY = path.join(ROOT, "src/app/api/stripe/verify/route.ts");
const EDITOR = path.join(ROOT, "src/components/EditorExperience.tsx");

const DIGITAL_COMP = { id: "coup_comp", metadata: { digital_comp: "true" } };
const REFERRAL = { id: "coup_ref", metadata: { referral: "true" } };
const PRINT_PROMO = { id: "coup_xmas", metadata: { campaign: "xmas15" } };

test("(a) print session + digital_comp coupon is refused at fulfillment gate", () => {
  const decision = evaluateAppliedCouponsForOrderFulfillment({
    orderType: "print",
    plan: "single",
    coupons: [DIGITAL_COMP],
    sessionHasDiscount: true,
  });
  assert.equal(decision.ok, false);
  assert.match(decision.reason, /digital_comp_incompatible_with_print/);
});

test("(a) pack3 / subscription + digital_comp coupon is refused", () => {
  for (const plan of ["pack3", "subscription"]) {
    const decision = evaluateAppliedCouponsForOrderFulfillment({
      orderType: "digital",
      plan,
      coupons: [DIGITAL_COMP],
      sessionHasDiscount: true,
    });
    assert.equal(decision.ok, false, `expected refuse for ${plan}`);
  }
});

test("(b) digital single + digital_comp still fulfills", () => {
  const decision = evaluateAppliedCouponsForOrderFulfillment({
    orderType: "digital",
    plan: "single",
    coupons: [DIGITAL_COMP],
    sessionHasDiscount: true,
  });
  assert.deepEqual(decision, { ok: true });
});

test("(c) referral coupon fulfills for digital and does not block print", () => {
  assert.deepEqual(
    evaluateAppliedCouponsForOrderFulfillment({
      orderType: "digital",
      plan: "single",
      coupons: [REFERRAL],
      sessionHasDiscount: true,
    }),
    { ok: true }
  );
  assert.deepEqual(
    evaluateAppliedCouponsForOrderFulfillment({
      orderType: "digital",
      plan: "pack3",
      coupons: [REFERRAL],
      sessionHasDiscount: true,
    }),
    { ok: true }
  );
  assert.deepEqual(
    evaluateAppliedCouponsForOrderFulfillment({
      orderType: "print",
      plan: "single",
      coupons: [PRINT_PROMO],
      sessionHasDiscount: true,
    }),
    { ok: true }
  );
  assert.deepEqual(
    evaluateAppliedCouponsForOrderFulfillment({
      orderType: "print",
      plan: "single",
      coupons: [REFERRAL],
      sessionHasDiscount: true,
    }),
    { ok: true }
  );
});

test("no-discount sessions remain fulfillable without coupon inspection", () => {
  assert.deepEqual(
    evaluateAppliedCouponsForOrderFulfillment({
      orderType: "print",
      plan: "single",
      coupons: [],
      sessionHasDiscount: false,
    }),
    { ok: true }
  );
});

test("discount present but unresolved coupons fail closed", () => {
  const decision = evaluateAppliedCouponsForOrderFulfillment({
    orderType: "digital",
    plan: "single",
    coupons: [],
    sessionHasDiscount: true,
  });
  assert.equal(decision.ok, false);
  assert.equal(decision.reason, "discount_present_but_coupon_unresolved");
});

test("resolveCheckoutSessionDiscountCoupons retrieves coupon ids", async () => {
  const coupons = await resolveCheckoutSessionDiscountCoupons(
    {
      discounts: [{ coupon: "coup_comp", promotion_code: "promo_comp" }],
    },
    {
      retrieveCoupon: async (id) => {
        assert.equal(id, "coup_comp");
        return DIGITAL_COMP;
      },
      retrievePromotionCode: async () => ({ coupon: DIGITAL_COMP }),
    }
  );
  assert.equal(coupons.length, 1);
  assert.equal(coupons[0].metadata.digital_comp, "true");
});

test("evaluateCheckoutSessionDiscountFulfillment end-to-end: print+comp refuses; digital+comp ok; referral ok", async () => {
  const lookup = {
    retrieveCoupon: async (id) => {
      if (id === "coup_comp") return DIGITAL_COMP;
      if (id === "coup_ref") return REFERRAL;
      return { id, metadata: {} };
    },
    retrievePromotionCode: async (id) => {
      if (id.includes("comp")) return { coupon: DIGITAL_COMP };
      return { coupon: REFERRAL };
    },
  };

  const printRefused = await evaluateCheckoutSessionDiscountFulfillment({
    session: {
      payment_status: "no_payment_required",
      amount_total: 0,
      total_details: { amount_discount: 9900 },
      discounts: [{ coupon: "coup_comp" }],
    },
    orderType: "print",
    plan: "single",
    lookup,
  });
  assert.equal(printRefused.ok, false);

  const digitalOk = await evaluateCheckoutSessionDiscountFulfillment({
    session: {
      payment_status: "no_payment_required",
      amount_total: 0,
      total_details: { amount_discount: 900 },
      discounts: [{ coupon: "coup_comp" }],
    },
    orderType: "digital",
    plan: "single",
    lookup,
  });
  assert.deepEqual(digitalOk, { ok: true });

  const referralDigital = await evaluateCheckoutSessionDiscountFulfillment({
    session: {
      payment_status: "no_payment_required",
      amount_total: 0,
      total_details: { amount_discount: 900 },
      discounts: [{ coupon: "coup_ref" }],
    },
    orderType: "digital",
    plan: "single",
    lookup,
  });
  assert.deepEqual(referralDigital, { ok: true });

  const referralPrint = await evaluateCheckoutSessionDiscountFulfillment({
    session: {
      payment_status: "paid",
      amount_total: 7900,
      total_details: { amount_discount: 1000 },
      discounts: [{ coupon: "coup_ref" }],
    },
    orderType: "print",
    plan: "single",
    lookup,
  });
  assert.deepEqual(referralPrint, { ok: true });
});

test("webhook and verify routes wire the shared fulfillment discount gate", () => {
  const webhook = fs.readFileSync(WEBHOOK, "utf8");
  const verify = fs.readFileSync(VERIFY, "utf8");

  assert.match(webhook, /evaluateCheckoutSessionDiscountFulfillment/);
  assert.match(webhook, /Skipping paid entitlement grants for session/);
  assert.match(webhook, /skipEntitlementGrants/);
  assert.match(webhook, /if \(!skipEntitlementGrants\) \{\s*await markSessionPaid/);
  assert.match(webhook, /if \(!skipEntitlementGrants\) \{\s*await applyReferralReward/);

  assert.match(verify, /evaluateCheckoutSessionDiscountFulfillment/);
  assert.match(verify, /Stripe verify refused incompatible checkout discount/);
  assert.match(
    verify,
    /if \(!discountGate\.ok\)[\s\S]*?paid:\s*false/,
    "verify must return paid:false when discount gate fails"
  );
});

test("(d) cleared promo field does not resend URL code; untouched still applies it", () => {
  assert.equal(
    resolveEditorCheckoutPromoCode({
      fieldValue: "",
      fieldEdited: true,
      queryPromoCode: "EXPIRED",
      storedPromoCode: "EXPIRED",
    }),
    null,
    "explicit clear must not fall back to URL/stored"
  );

  assert.equal(
    resolveEditorCheckoutPromoCode({
      fieldValue: "",
      fieldEdited: false,
      queryPromoCode: "XMAS15",
      storedPromoCode: null,
    }),
    "XMAS15",
    "untouched empty field still applies URL code"
  );

  assert.equal(
    resolveEditorCheckoutPromoCode({
      fieldValue: "BLACKFRIDAY20",
      fieldEdited: false,
      queryPromoCode: "XMAS15",
      storedPromoCode: null,
    }),
    "BLACKFRIDAY20"
  );

  assert.equal(
    resolveEditorCheckoutPromoCode({
      fieldValue: "NEWCODE1",
      fieldEdited: true,
      queryPromoCode: "EXPIRED",
      storedPromoCode: "EXPIRED",
    }),
    "NEWCODE1"
  );
});

test("EditorExperience marks promo edits and uses resolveEditorCheckoutPromoCode", () => {
  const editor = fs.readFileSync(EDITOR, "utf8");
  assert.match(editor, /resolveEditorCheckoutPromoCode/);
  assert.match(editor, /promoCodeEdited/);
  assert.match(editor, /setPromoCodeEdited\(true\)/);
  assert.match(editor, /if \(promoCodeEdited\) return/);
  assert.match(
    editor,
    /Do not re-seed storage from the URL after the user has edited/,
    "URL must not re-seed localStorage after clear"
  );
});
