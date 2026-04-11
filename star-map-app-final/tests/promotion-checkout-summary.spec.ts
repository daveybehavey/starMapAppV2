import { expect, test } from "@playwright/test";
import { summarizePromotionCheckoutSessions } from "../src/lib/promotionCheckoutSummary";

test.describe("promotion checkout summary", () => {
  test("groups readable manual promotion codes and tracks paid revenue", () => {
    const summary = summarizePromotionCheckoutSessions([
      {
        id: "cs_test_manual_paid",
        payment_status: "paid",
        amount_total: 4500,
        metadata: {
          order_type: "digital",
          promotion_source: "manual",
          promotion_code: "REDDIT50",
          promotion_code_id: "promo_manual_1",
        },
      },
      {
        id: "cs_test_manual_unpaid",
        payment_status: "unpaid",
        amount_total: 4500,
        metadata: {
          order_type: "digital",
          promotion_source: "manual",
          promotion_code: "REDDIT50",
          promotion_code_id: "promo_manual_1",
        },
      },
    ]);

    expect(summary.appliedSessions).toBe(2);
    expect(summary.paidSessions).toBe(1);
    expect(summary.revenuePaidSessions).toBe(1);
    expect(summary.revenueCents).toBe(4500);
    expect(summary.topCodes[0]).toMatchObject({
      label: "REDDIT50",
      source: "manual",
      orderType: "digital",
      sessions: 2,
      unpaidSessions: 1,
      paidSessions: 1,
      revenuePaidSessions: 1,
      revenueCents: 4500,
    });
  });

  test("falls back to resolving manual code labels from Stripe promotion ids", () => {
    const summary = summarizePromotionCheckoutSessions(
      [
        {
          id: "cs_test_print_paid",
          payment_status: "paid",
          amount_total: 9900,
          metadata: {
            order_type: "print",
            print_variant: "poster_framed",
            promotion_code_id: "promo_print_10",
          },
        },
      ],
      new Map([["promo_print_10", "PRINT10"]]),
    );

    expect(summary.topCodes[0]).toMatchObject({
      label: "PRINT10",
      source: "manual",
      orderType: "print",
      sessions: 1,
      revenuePaidSessions: 1,
      revenueCents: 9900,
    });
  });

  test("separates referral auto promotions from manual promo codes", () => {
    const summary = summarizePromotionCheckoutSessions([
      {
        id: "cs_test_referral_paid",
        payment_status: "paid",
        amount_total: 5200,
        metadata: {
          order_type: "digital",
          promotion_source: "referral_auto",
          referral_offer_applied: "true",
          referral_offer_variant: "referral_auto_primary",
          promotion_code_id: "promo_ref_primary",
        },
      },
    ]);

    expect(summary.topCodes[0]).toMatchObject({
      label: "REFERRAL_AUTO (referral_auto_primary)",
      source: "referral_auto",
      orderType: "digital",
      sessions: 1,
      revenuePaidSessions: 1,
      revenueCents: 5200,
    });
  });
});
