/**
 * Pricing + free-shipping threshold behaviour against the REAL lib modules.
 *
 * Regression targets:
 * - PRE-discount merchandise subtotal is the free-shipping decision basis
 *   (a promo must never revoke a free-shipping promise that the pre-discount
 *   cart already earned).
 * - Exact $89.00 / $88.99 boundary at the Lever-B default threshold.
 * - Merchandise subtotal composition (variant + digital add-on + card +
 *   second-copy at 90%).
 * - USD / CAD price-book lookups for every print + digital plan.
 * - Threshold env parsing: empty / non-positive / non-numeric fall back to
 *   the $89 default; a positive override wins.
 * - applyPrintFreeShippingToCheckout waive vs keep-charge contracts,
 *   including the empty-options edge.
 *
 * No prices, promos, or thresholds are edited — assertions pin source values.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const pricing = await import("../../src/lib/pricing.ts");
const {
  applyPrintFreeShippingToCheckout,
  formatCheckoutShippingLine,
  formatPrintFreeShippingThresholdLabel,
  getPrintFreeShippingOfferLine,
  getPrintFreeShippingShortTag,
  getPrintFreeShippingThresholdCents,
  getPrintMerchandiseSubtotalCents,
  isPrintFreeShippingEnabled,
  qualifiesForPrintFreeShipping,
} = await import("../../src/lib/printFreeShipping.ts");
const { PRINT_CATALOG } = await import("../../src/lib/printCatalog.ts");

const TOUCHED_ENV = [
  "PRINT_FREE_SHIPPING_THRESHOLD_CENTS",
  "NEXT_PUBLIC_PRINT_FREE_SHIPPING_THRESHOLD_CENTS",
  "PRINT_FRAMED_PRICE_CENTS",
  "NEXT_PUBLIC_PRINT_FRAMED_PRICE_CENTS",
  "PRINT_UNFRAMED_PRICE_CENTS",
  "NEXT_PUBLIC_PRINT_UNFRAMED_PRICE_CENTS",
  "PRINT_DIGITAL_ADDON_PRICE_CENTS",
  "NEXT_PUBLIC_PRINT_DIGITAL_ADDON_PRICE_CENTS",
  "PRICE_CENTS",
  "PRICE_SINGLE_CENTS",
  "PACK3_PRICE_CENTS",
  "SUBSCRIPTION_PRICE_CENTS",
  "NEXT_PUBLIC_PRICE_CENTS",
  "NEXT_PUBLIC_PRICE_SINGLE_CENTS",
  "NEXT_PUBLIC_PACK3_PRICE_CENTS",
  "NEXT_PUBLIC_SUBSCRIPTION_PRICE_CENTS",
  "CURRENCY",
  "NEXT_PUBLIC_CURRENCY",
];

function withEnv(overrides, fn) {
  const saved = new Map(TOUCHED_ENV.map((key) => [key, process.env[key]]));
  for (const key of TOUCHED_ENV) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const key of TOUCHED_ENV) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const SELECTION = () => ({
  shippingOptions: [{ shipping_rate_data: { fixed_amount: { amount: 1399, currency: "usd" } } }],
  shippingChargeCents: 1399,
});

/* ---------------- Step 1: PRE-discount free-shipping rule ---------------- */

test("PRE-discount rule: a 15% promo cannot break free shipping once the pre-discount subtotal clears $89", () => {
  withEnv({}, () => {
    // Framed $99 alone clears the $89 default — the storefront promise.
    const preDiscount = getPrintMerchandiseSubtotalCents({ variant: "poster_framed" });
    assert.equal(preDiscount, 9900);
    const promoEstimate = Math.round(preDiscount * 0.15); // 1485
    const afterDiscount = preDiscount - promoEstimate; // 8415 — below $89
    assert.ok(afterDiscount < 8900, "sanity: after-discount basis would fall under the threshold");
    // Decision uses the PRE-discount figure (checkout wiring already pinned
    // in printFreeShipping.test.mjs); a discounted-looking cart still ships free.
    assert.equal(qualifiesForPrintFreeShipping(afterDiscount), false);
    assert.equal(qualifiesForPrintFreeShipping(preDiscount), true);
    const waived = applyPrintFreeShippingToCheckout(SELECTION(), preDiscount);
    assert.equal(waived.freeShippingApplied, true);
    assert.equal(waived.shippingChargeCents, 0);
    assert.equal(waived.shippingSubsidyCents, 1399);
  });
});

test("PRE-discount rule: cart below $89 pre-discount is charged shipping even when a promo is zero", () => {
  withEnv({}, () => {
    // Unframed $49 alone is under the bar regardless of discount.
    const preDiscount = getPrintMerchandiseSubtotalCents({ variant: "poster_unframed" });
    assert.equal(preDiscount, 4900);
    for (const promo of [0, Math.round(preDiscount * 0.15)]) {
      void promo;
      const result = applyPrintFreeShippingToCheckout(SELECTION(), preDiscount);
      assert.equal(result.freeShippingApplied, false);
      assert.equal(result.shippingChargeCents, 1399);
      assert.equal(result.shippingSubsidyCents, null);
    }
  });
});

test("boundary: exactly $89.00 qualifies; $88.99 does not (default threshold)", () => {
  withEnv({}, () => {
    assert.equal(getPrintFreeShippingThresholdCents(), 8900);
    assert.equal(qualifiesForPrintFreeShipping(8900), true);
    assert.equal(qualifiesForPrintFreeShipping(8899), false);
    assert.equal(qualifiesForPrintFreeShipping(0), false);
    assert.equal(qualifiesForPrintFreeShipping(-1), false);
    const at = applyPrintFreeShippingToCheckout(SELECTION(), 8900);
    assert.equal(at.freeShippingApplied, true);
    assert.equal(at.shippingChargeCents, 0);
    const below = applyPrintFreeShippingToCheckout(SELECTION(), 8899);
    assert.equal(below.freeShippingApplied, false);
    assert.equal(below.shippingChargeCents, 1399);
  });
});

test("boundary: framed + HD add-on subtotal is $106 and ships free; card-only does not", () => {
  withEnv({}, () => {
    const framedHd = getPrintMerchandiseSubtotalCents({
      variant: "poster_framed",
      includeDigitalAddOn: true,
    });
    assert.equal(framedHd, 9900 + 700);
    assert.equal(qualifiesForPrintFreeShipping(framedHd), true);

    const cardOnly = getPrintMerchandiseSubtotalCents({ variant: "card_4x6" });
    assert.equal(cardOnly, 1900);
    assert.equal(qualifiesForPrintFreeShipping(cardOnly), false);
  });
});

test("subtotal composition: second copy counts at 90% of the variant (Lever A)", () => {
  withEnv({}, () => {
    const base = getPrintMerchandiseSubtotalCents({ variant: "poster_unframed" });
    assert.equal(base, 4900);
    const withCopy = getPrintMerchandiseSubtotalCents({
      variant: "poster_unframed",
      includeSecondCopy: true,
    });
    assert.equal(withCopy, 4900 + Math.round(4900 * 0.9));
    assert.equal(withCopy, 4900 + 4410);
    // $93.10 clears $89.
    assert.equal(qualifiesForPrintFreeShipping(withCopy), true);
  });
});

test("subtotal composition: digital add-on + card stack on the primary variant", () => {
  withEnv({}, () => {
    const total = getPrintMerchandiseSubtotalCents({
      variant: "poster_framed",
      includeDigitalAddOn: true,
      includeCardAddOn: true,
    });
    assert.equal(total, 9900 + 700 + 1900);
  });
});

/* ---------------- price lookups (USD + CAD books) ---------------- */

test("USD print price book: every catalog row resolves to its fallback cents", () => {
  withEnv({}, () => {
    const tiers = pricing.getPrintPricingTiers();
    for (const row of PRINT_CATALOG) {
      assert.equal(
        tiers[row.id].amountCents,
        row.priceFallbackCents,
        `${row.id} must pin its catalog fallback when env is unset`,
      );
      assert.equal(tiers[row.id].currency, "usd");
      assert.equal(tiers[row.id].includesFrame, row.includesFrame);
    }
  });
});

test("USD digital ladder: single $9 / pack3 $19 / subscription $19 / HD add-on $7", () => {
  withEnv({}, () => {
    const tiers = pricing.getPricingTiers();
    assert.equal(tiers.single.amountCents, 900);
    assert.equal(tiers.pack3.amountCents, 1900);
    assert.equal(tiers.subscription.amountCents, 1900);
    assert.equal(pricing.getPrintDigitalAddOnPrice().amountCents, 700);
  });
});

test("CAD price book: digital + print + second-copy are the fixed 1.40 book (not env-overridable)", () => {
  withEnv(
    {
      // Deliberately set USD env overrides — CAD helpers must ignore them.
      PRINT_FRAMED_PRICE_CENTS: "5000",
      PRICE_SINGLE_CENTS: "999",
    },
    () => {
      assert.equal(pricing.getDigitalCadPriceCents("single"), 1300);
      assert.equal(pricing.getDigitalCadPriceCents("pack3"), 2700);
      assert.equal(pricing.getDigitalCadPriceCents("subscription"), 2700);
      assert.equal(pricing.getPrintDigitalAddOnCadPriceCents(), 1000);
      assert.equal(pricing.getPrintCadPriceCents("poster_unframed"), 6900);
      assert.equal(pricing.getPrintCadPriceCents("poster_framed"), 13900);
      assert.equal(pricing.getPrintCadPriceCents("canvas_wrap"), 11100);
      assert.equal(pricing.getPrintCadPriceCents("mug_11oz"), 5500);
      assert.equal(pricing.getPrintCadPriceCents("card_4x6"), 2700);
      assert.equal(pricing.getPrintSecondCopyCadPriceCents("poster_framed"), Math.round(13900 * 0.9));
      // USD env override still moves the USD book / USD second-copy helper.
      assert.equal(pricing.getPrintPricingTiers().poster_framed.amountCents, 5000);
      assert.equal(pricing.getPrintSecondCopyPriceCents("poster_framed"), Math.round(5000 * 0.9));
    },
  );
});

test("formatPrice always appends the currency code; empty currency falls back to USD", () => {
  assert.equal(pricing.formatPrice(8900, "usd"), "$89.00 USD");
  assert.equal(pricing.formatPrice(8900, "cad"), "CA$89.00 CAD");
  assert.equal(pricing.formatPrice(0, "usd"), "$0.00 USD");
  assert.equal(pricing.formatPrice(4900, ""), "$49.00 USD");
});

/* ---------------- threshold env + checkout application edges ---------------- */

test("threshold env: empty / zero / negative / non-numeric fall back to $89; positive override wins", () => {
  withEnv({ PRINT_FREE_SHIPPING_THRESHOLD_CENTS: "" }, () => {
    assert.equal(getPrintFreeShippingThresholdCents(), 8900);
  });
  withEnv({ PRINT_FREE_SHIPPING_THRESHOLD_CENTS: "0" }, () => {
    assert.equal(getPrintFreeShippingThresholdCents(), 8900);
  });
  withEnv({ PRINT_FREE_SHIPPING_THRESHOLD_CENTS: "-100" }, () => {
    assert.equal(getPrintFreeShippingThresholdCents(), 8900);
  });
  withEnv({ PRINT_FREE_SHIPPING_THRESHOLD_CENTS: "abc" }, () => {
    assert.equal(getPrintFreeShippingThresholdCents(), 8900);
  });
  withEnv({ PRINT_FREE_SHIPPING_THRESHOLD_CENTS: "10000" }, () => {
    assert.equal(getPrintFreeShippingThresholdCents(), 10000);
    assert.equal(qualifiesForPrintFreeShipping(9999), false);
    assert.equal(qualifiesForPrintFreeShipping(10000), true);
  });
  withEnv({}, () => {
    assert.equal(isPrintFreeShippingEnabled(), true);
  });
});

test("applyPrintFreeShipping: empty options with a null charge cannot invent a waive", () => {
  withEnv({}, () => {
    const result = applyPrintFreeShippingToCheckout(
      { shippingOptions: undefined, shippingChargeCents: null },
      9900,
    );
    assert.equal(result.freeShippingApplied, false);
    assert.equal(result.shippingSubsidyCents, null);
  });
});

test("applyPrintFreeShipping: waived CAD session stamps a zero option in the session currency", () => {
  withEnv({ CURRENCY: "usd" }, () => {
    const selection = {
      shippingOptions: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: 1900, currency: "cad" },
            display_name: "Standard",
          },
        },
      ],
      shippingChargeCents: 1900,
    };
    const result = applyPrintFreeShippingToCheckout(selection, 9900, "cad");
    assert.equal(result.freeShippingApplied, true);
    assert.equal(result.shippingChargeCents, 0);
    assert.equal(result.shippingSubsidyCents, 1900);
    assert.equal(result.shippingOptions?.[0]?.shipping_rate_data?.fixed_amount?.amount, 0);
    assert.equal(result.shippingOptions?.[0]?.shipping_rate_data?.fixed_amount?.currency, "cad");
    assert.equal(result.shippingOptions?.[0]?.shipping_rate_data?.display_name, "Free standard shipping");
  });
});

test("labels: threshold label is always USD; short tag and offer line name the $89 figure", () => {
  withEnv({}, () => {
    assert.equal(formatPrintFreeShippingThresholdLabel("cad"), "$89.00 USD");
    assert.equal(getPrintFreeShippingShortTag("cad"), "Free standard shipping · $89.00 USD+ subtotal");
    assert.match(getPrintFreeShippingOfferLine() ?? "", /\$89\.00 USD/);
    assert.equal(
      formatCheckoutShippingLine({ variant: "poster_framed", country: "US" }),
      "Free shipping",
    );
    assert.equal(
      formatCheckoutShippingLine({
        variant: "poster_unframed",
        country: "US",
        shippingAmountCents: 1399,
      }),
      "$13.99 USD shipping",
    );
  });
});
