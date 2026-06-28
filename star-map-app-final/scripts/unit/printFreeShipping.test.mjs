import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPrintFreeShippingToCheckout,
  qualifiesForPrintFreeShipping,
} from "./printFreeShipping.harness.mjs";

test("framed + HD bundle qualifies at $100 threshold", () => {
  assert.equal(qualifiesForPrintFreeShipping(9900 + 700, 10_000), true);
  assert.equal(qualifiesForPrintFreeShipping(9900, 10_000), false);
});

test("checkout waives shipping charge when merchandise clears threshold", () => {
  const result = applyPrintFreeShippingToCheckout(
    {
      shippingOptions: [{ shipping_rate_data: { fixed_amount: { amount: 1399, currency: "usd" } } }],
      shippingChargeCents: 1399,
    },
    10_600,
    10_000,
  );
  assert.equal(result.freeShippingApplied, true);
  assert.equal(result.shippingChargeCents, 0);
  assert.equal(result.shippingSubsidyCents, 1399);
});

test("checkout keeps shipping below threshold", () => {
  const selection = {
    shippingOptions: [{ shipping_rate_data: { fixed_amount: { amount: 1399, currency: "usd" } } }],
    shippingChargeCents: 1399,
  };
  const result = applyPrintFreeShippingToCheckout(selection, 4900, 10_000);
  assert.equal(result.freeShippingApplied, false);
  assert.equal(result.shippingChargeCents, 1399);
});
