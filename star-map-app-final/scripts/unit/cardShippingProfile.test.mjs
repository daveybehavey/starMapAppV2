/**
 * L4 (2026-10-26) — the standalone keepsake card (Printful variant
 * 14457) gets its own `card_4x6` shipping profile.
 *
 * Before this fix the card row pointed at the poster_unframed profile,
 * so a standalone card order was charged poster shipping (US $4.49 /
 * CA $5.17) while Printful's true single-card rates are US $4.06 /
 * CA $4.70 — an over-recovery of $0.43 / $0.47 on every card order.
 * The card_4x6 rates below are the verified live pull of variant 14457
 * (all 74 store destinations, 2026-10-26; SQ-65 addendum).
 *
 * Margin discipline (David's 50% rule) is asserted on BOTH bases:
 * - total-paid basis (shipping charged through): US 67.13% / CA 65.62%
 *   per the SQ-65 design arithmetic, recomputed here through the real
 *   paid-order margin guard;
 * - free-shipping-ABSORBED basis (product-price-only revenue, seller
 *   absorbs the true card rate): the governing floor — the recorded
 *   57.4% worst case was measured on this basis (CA, $19.00 revenue);
 *   through the guard's CAD normalization a CA$27 order reads 57.9%.
 * A lone card ($19) must still NOT clear the $89 free-shipping
 * threshold.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const { getPrintShippingEstimate, getPrintfulShippingCountries } = await import(
  "../../src/lib/printfulShipping.ts"
);
const { getPrintShippingProfile } = await import("../../src/lib/printCatalog.ts");
const { evaluatePrintMarginForPaidOrder } = await import("../../src/lib/printMargin.ts");
const { getPrintMerchandiseSubtotalCents, qualifiesForPrintFreeShipping } = await import(
  "../../src/lib/printFreeShipping.ts"
);
const { convertUsdShippingRateToCadCents } = await import("../../src/lib/checkoutCurrency.ts");
const { getShippingProfile, getConfiguredShippingCostCents } = await import(
  "../lib/commerceCostEstimates.mjs"
);

test("card_4x6 resolves its own shipping profile in catalog + cost mirror", () => {
  assert.equal(getPrintShippingProfile("card_4x6"), "card_4x6");
  assert.equal(getShippingProfile("card_4x6"), "card_4x6");
});

test("card shipping anchors match the verified variant-14457 rates", () => {
  assert.equal(getPrintShippingEstimate("card_4x6", "US")?.amountCents, 406);
  assert.equal(getPrintShippingEstimate("card_4x6", "CA")?.amountCents, 470);
  assert.equal(getPrintShippingEstimate("card_4x6", "JP")?.amountCents, 278);
  assert.equal(getPrintShippingEstimate("card_4x6", "GB")?.amountCents, 392);
  assert.equal(getPrintShippingEstimate("card_4x6", "AU")?.amountCents, 527);
  assert.equal(getPrintShippingEstimate("card_4x6", "NO")?.amountCents, 934);
  // Offline cost mirror reads the same matrix.
  assert.equal(getConfiguredShippingCostCents("card_4x6", "US")?.amountCents, 406);
  assert.equal(getConfiguredShippingCostCents("card_4x6", "CA")?.amountCents, 470);
});

test("card profile covers every supported destination", () => {
  const countries = getPrintfulShippingCountries();
  assert.equal(countries.length, 74);
  for (const country of countries) {
    const estimate = getPrintShippingEstimate("card_4x6", country);
    assert.ok(estimate, `card_4x6 missing rate for ${country}`);
    assert.ok(Number.isFinite(estimate.amountCents) && estimate.amountCents > 0);
  }
});

test("other products' shipping profiles and rates are untouched", () => {
  assert.equal(getPrintShippingProfile("poster_unframed"), "poster_unframed");
  assert.equal(getPrintShippingProfile("poster_unframed_16x16"), "poster_unframed");
  assert.equal(getPrintShippingProfile("poster_framed"), "poster_framed");
  assert.equal(getPrintShippingProfile("canvas_wrap"), "canvas_wrap");
  assert.equal(getPrintShippingProfile("mug_11oz"), "mug_11oz");
  assert.equal(getPrintShippingEstimate("poster_unframed", "US")?.amountCents, 449);
  assert.equal(getPrintShippingEstimate("poster_unframed", "CA")?.amountCents, 517);
  assert.equal(getPrintShippingEstimate("poster_framed", "US")?.amountCents, 984);
  assert.equal(getPrintShippingEstimate("poster_framed", "CA")?.amountCents, 1077);
  assert.equal(getPrintShippingEstimate("canvas_wrap", "US")?.amountCents, 1005);
  assert.equal(getPrintShippingEstimate("mug_11oz", "US")?.amountCents, 599);
});

test("CAD presentation of the honest CA rate is CA$6.58 at the 1.40 book", () => {
  assert.equal(convertUsdShippingRateToCadCents(4.7), 658);
});

test("card margin on the total-paid basis clears 50% (US + CA)", () => {
  // US: $19.00 + $4.06 charged = $23.06 total. Guard: fee 97,
  // fulfilment 255 + 406 → margin 1548 = 67.13% of revenue.
  const us = evaluatePrintMarginForPaidOrder({
    variant: "card_4x6",
    shippingCountry: "US",
    amountTotalCents: 2306,
    currency: "usd",
  });
  assert.equal(us.estimate?.marginCents, 1548);
  assert.ok(us.estimate.marginCents / us.estimate.revenueCents >= 0.5);

  // CA: CA$27 + CA$6.58 = CA$33.58 total → normalized revenue 2399,
  // fee 100, fulfilment 255 + 470 → margin 1574 = 65.6% of revenue.
  const ca = evaluatePrintMarginForPaidOrder({
    variant: "card_4x6",
    shippingCountry: "CA",
    amountTotalCents: 3358,
    currency: "cad",
  });
  assert.equal(ca.estimate?.marginCents, 1574);
  assert.ok(ca.estimate.marginCents / ca.estimate.revenueCents >= 0.5);
});

test("card margin on the free-shipping-absorbed basis clears 50% (US + CA)", () => {
  // US absorbed: revenue $19.00 only; fee 85, fulfilment 255 + 406
  // → margin 1154 = 60.7%.
  const us = evaluatePrintMarginForPaidOrder({
    variant: "card_4x6",
    shippingCountry: "US",
    amountTotalCents: 1900,
    currency: "usd",
  });
  assert.equal(us.estimate?.marginCents, 1154);
  assert.ok(us.estimate.marginCents / us.estimate.revenueCents >= 0.5);

  // CA absorbed: revenue CA$27 only → normalized 1929; fee 86,
  // fulfilment 255 + 470 → margin 1118 = 57.9% (the recorded 57.4%
  // floor was measured on a flat $19.00 revenue; both clear 50%).
  const ca = evaluatePrintMarginForPaidOrder({
    variant: "card_4x6",
    shippingCountry: "CA",
    amountTotalCents: 2700,
    currency: "cad",
  });
  assert.equal(ca.estimate?.marginCents, 1118);
  assert.ok(ca.estimate.marginCents / ca.estimate.revenueCents >= 0.5);
});

test("a lone card still does not clear the $89 free-shipping threshold", () => {
  const subtotal = getPrintMerchandiseSubtotalCents({ variant: "card_4x6" });
  assert.equal(subtotal, 1900);
  assert.equal(qualifiesForPrintFreeShipping(subtotal), false);
});
