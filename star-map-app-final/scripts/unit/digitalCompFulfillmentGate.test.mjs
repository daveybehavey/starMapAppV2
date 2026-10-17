/**
 * Regression: digital_comp must not entitle print/pack3/subscription at
 * webhook + verify fulfillment gates; pinned Stripe discount shape;
 * transient coupon lookup stays retryable; manual promo rejects without fallback.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  collectCheckoutSessionDiscountEntries,
  evaluateAppliedCouponsForOrderFulfillment,
  evaluateCheckoutSessionDiscountFulfillment,
  isDiscountFulfillmentRetryable,
  resolveCheckoutSessionDiscountCoupons,
  resolveEditorCheckoutPromoCode,
} from "../../src/lib/checkoutPromotions.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WEBHOOK = path.join(ROOT, "src/app/api/stripe/webhook/route.ts");
const VERIFY = path.join(ROOT, "src/app/api/stripe/verify/route.ts");
const CHECKOUT = path.join(ROOT, "src/app/api/checkout/route.ts");
const EDITOR = path.join(ROOT, "src/components/EditorExperience.tsx");

const DIGITAL_COMP = { id: "coup_comp", metadata: { digital_comp: "true" } };
const REFERRAL = { id: "coup_ref", metadata: { referral: "true" } };
const PRINT_PROMO = { id: "coup_xmas", metadata: { campaign: "xmas15" } };

/** Pinned Stripe API 2024-06-20: discounts only under total_details.breakdown. */
function breakdownOnlySession(coupon, extras = {}) {
  return {
    payment_status: extras.payment_status ?? "no_payment_required",
    amount_total: extras.amount_total ?? 0,
    total_details: {
      amount_discount: extras.amount_discount ?? 900,
      breakdown: {
        discounts: [
          {
            amount: extras.amount_discount ?? 900,
            discount: {
              coupon,
              promotion_code: extras.promotion_code ?? null,
            },
          },
        ],
      },
    },
    // Intentionally omit top-level discounts — pinned API shape.
  };
}

test("(a) print session + digital_comp coupon is refused at fulfillment gate", () => {
  const decision = evaluateAppliedCouponsForOrderFulfillment({
    orderType: "print",
    plan: "single",
    coupons: [DIGITAL_COMP],
    sessionHasDiscount: true,
  });
  assert.equal(decision.ok, false);
  assert.equal(decision.retryable, false);
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
    assert.equal(decision.retryable, false);
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

test("discount present but unresolved coupons fail closed as retryable", () => {
  const decision = evaluateAppliedCouponsForOrderFulfillment({
    orderType: "digital",
    plan: "single",
    coupons: [],
    sessionHasDiscount: true,
  });
  assert.equal(decision.ok, false);
  assert.equal(decision.reason, "discount_present_but_coupon_unresolved");
  assert.equal(decision.retryable, true);
  assert.equal(isDiscountFulfillmentRetryable(decision), true);
});

test("resolveCheckoutSessionDiscountCoupons retrieves coupon ids from top-level discounts", async () => {
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

test("pinned API: discounts ONLY in total_details.breakdown resolve coupons", async () => {
  const session = breakdownOnlySession(DIGITAL_COMP);
  assert.equal(session.discounts, undefined);

  const entries = collectCheckoutSessionDiscountEntries(session);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].coupon, DIGITAL_COMP);

  const coupons = await resolveCheckoutSessionDiscountCoupons(session, {
    retrieveCoupon: async () => {
      throw new Error("should not retrieve — coupon already expanded in breakdown");
    },
    retrievePromotionCode: async () => {
      throw new Error("should not retrieve promo");
    },
  });
  assert.equal(coupons.length, 1);
  assert.equal(coupons[0].metadata.digital_comp, "true");
});

test("pinned API: breakdown promotion_code id is looked up when coupon not expanded", async () => {
  const session = {
    total_details: {
      amount_discount: 900,
      breakdown: {
        discounts: [
          {
            amount: 900,
            discount: { coupon: null, promotion_code: "promo_comp" },
          },
        ],
      },
    },
  };
  const coupons = await resolveCheckoutSessionDiscountCoupons(session, {
    retrieveCoupon: async (id) => {
      assert.equal(id, "coup_comp");
      return DIGITAL_COMP;
    },
    retrievePromotionCode: async (id) => {
      assert.equal(id, "promo_comp");
      return { coupon: "coup_comp" };
    },
  });
  assert.equal(coupons.length, 1);
  assert.equal(coupons[0].metadata.digital_comp, "true");
});

test("pinned API: digital single + digital_comp fulfills via breakdown-only session", async () => {
  const decision = await evaluateCheckoutSessionDiscountFulfillment({
    session: breakdownOnlySession(DIGITAL_COMP),
    orderType: "digital",
    plan: "single",
    lookup: {
      retrieveCoupon: async () => DIGITAL_COMP,
      retrievePromotionCode: async () => ({ coupon: DIGITAL_COMP }),
    },
  });
  assert.deepEqual(decision, { ok: true });
});

test("pinned API: referral coupon print + digital fulfill via breakdown-only session", async () => {
  const lookup = {
    retrieveCoupon: async () => REFERRAL,
    retrievePromotionCode: async () => ({ coupon: REFERRAL }),
  };
  assert.deepEqual(
    await evaluateCheckoutSessionDiscountFulfillment({
      session: breakdownOnlySession(REFERRAL, {
        payment_status: "paid",
        amount_total: 7900,
        amount_discount: 1000,
      }),
      orderType: "print",
      plan: "single",
      lookup,
    }),
    { ok: true }
  );
  assert.deepEqual(
    await evaluateCheckoutSessionDiscountFulfillment({
      session: breakdownOnlySession(REFERRAL),
      orderType: "digital",
      plan: "single",
      lookup,
    }),
    { ok: true }
  );
});

test("pinned API: digital_comp on print denies via breakdown-only session", async () => {
  const decision = await evaluateCheckoutSessionDiscountFulfillment({
    session: breakdownOnlySession(DIGITAL_COMP, {
      payment_status: "paid",
      amount_total: 5000,
      amount_discount: 2000,
    }),
    orderType: "print",
    plan: "single",
    lookup: {
      retrieveCoupon: async () => DIGITAL_COMP,
      retrievePromotionCode: async () => ({ coupon: DIGITAL_COMP }),
    },
  });
  assert.equal(decision.ok, false);
  assert.equal(decision.retryable, false);
  assert.match(decision.reason, /digital_comp_incompatible_with_print/);
});

test("coupon lookup throw yields retryable denial (not terminal incompatible)", async () => {
  const decision = await evaluateCheckoutSessionDiscountFulfillment({
    session: {
      payment_status: "paid",
      amount_total: 0,
      total_details: {
        amount_discount: 900,
        breakdown: {
          discounts: [{ amount: 900, discount: { coupon: "coup_comp" } }],
        },
      },
    },
    orderType: "digital",
    plan: "single",
    lookup: {
      retrieveCoupon: async () => {
        throw new Error("stripe_timeout");
      },
      retrievePromotionCode: async () => null,
    },
  });
  assert.equal(decision.ok, false);
  assert.equal(decision.reason, "discount_coupon_lookup_failed");
  assert.equal(decision.retryable, true);
  assert.equal(isDiscountFulfillmentRetryable(decision), true);
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
  assert.equal(printRefused.retryable, false);

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
  assert.match(webhook, /isDiscountFulfillmentRetryable/);
  assert.match(webhook, /sessionHasAppliedDiscount/);
  assert.match(webhook, /expand:\s*\["total_details\.breakdown"\]/);
  assert.match(webhook, /completedCheckoutRetryable = true/);
  assert.match(webhook, /skipPrintOrder/);
  assert.match(webhook, /Skipping paid entitlement grants and print queue/);
  assert.match(webhook, /if \(!skipEntitlementGrants\) \{\s*await markSessionPaid/);
  assert.match(webhook, /if \(!skipPrintOrder\) \{\s*await queuePrintOrder/);
  assert.match(webhook, /if \(!skipEntitlementGrants\) \{\s*await applyReferralReward/);

  const completedCase = webhook.slice(
    webhook.indexOf('case "checkout.session.completed"'),
    webhook.indexOf('case "checkout.session.expired"'),
  );
  // Retryable unresolved path must break before dedupe finalize.
  assert.match(
    completedCase,
    /isDiscountFulfillmentRetryable\(discountGate\)[\s\S]*?completedCheckoutRetryable = true[\s\S]*?break;/,
  );
  assert.ok(
    completedCase.indexOf("completedCheckoutRetryable = true") <
      completedCase.indexOf("persistWebhookEventDedupe(eventDedupeKey)"),
    "retryable discount path must not reach unconditional dedupe finalize before break",
  );

  assert.match(verify, /evaluateCheckoutSessionDiscountFulfillment/);
  assert.match(verify, /isDiscountFulfillmentRetryable/);
  assert.match(verify, /Stripe verify refused incompatible checkout discount/);
  assert.match(verify, /Stripe verify discount coupon resolution pending/);
  assert.match(
    verify,
    /pending:\s*true[\s\S]*?status:\s*503/,
    "verify unresolved lookup uses 503 + pending transient pattern",
  );
  assert.match(
    verify,
    /if \(!discountGate\.ok\)[\s\S]*?paid:\s*false/,
    "verify must return paid:false when discount gate fails terminally",
  );
});

test("checkout: rejected manual code does not create full-price fallback session", () => {
  const route = fs.readFileSync(CHECKOUT, "utf8");
  assert.match(
    route,
    /fallbackOnDiscountError:\s*selectedPromotion\.source !== "manual"/,
    "manual promo must disable discount fallback at both GET and POST",
  );
  assert.equal(
    (route.match(/fallbackOnDiscountError:\s*selectedPromotion\.source !== "manual"/g) || []).length,
    2,
    "GET and POST must both disable fallback for manual codes",
  );
  assert.match(
    route,
    /never mint a silent full-price fallback session/,
  );
  assert.match(
    route,
    /if \(!fallbackOnDiscountError\) \{\s*throw new CheckoutError\(\s*"This code isn't valid for this item\."/,
  );
  // Referral / no-manual path still has the no-discount retry.
  assert.match(route, /:no-discount/);
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
