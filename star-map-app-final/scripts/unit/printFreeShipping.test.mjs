import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyPrintFreeShippingToCheckout,
  qualifiesForPrintFreeShipping,
} from "./printFreeShipping.harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CHECKOUT_ROUTE = path.join(ROOT, "src/app/api/checkout/route.ts");

const SELECTION = () => ({
  shippingOptions: [{ shipping_rate_data: { fixed_amount: { amount: 1399, currency: "usd" } } }],
  shippingChargeCents: 1399,
});

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

/**
 * F4 — the free-shipping DECISION basis is the PRE-discount merchandise
 * subtotal, the same basis as the storefront promise. Checkout used to
 * decide on the after-discount estimate, so a promo could push a
 * qualifying order below the threshold and charge shipping the site
 * said was free. The decision input below is the pre-discount subtotal
 * the route now passes (see the route wiring pin at the bottom).
 */

test("F4 (a): $106 framed + HD bundle with a 15% promo still ships free", () => {
  const preDiscountSubtotal = 9900 + 700; // 10_600
  const promoEstimate = Math.round(preDiscountSubtotal * 0.15); // 1_590
  const afterDiscount = preDiscountSubtotal - promoEstimate; // 9_010
  // The old after-discount basis fell below the threshold — the defect.
  assert.equal(qualifiesForPrintFreeShipping(afterDiscount, 10_000), false);
  // The pre-discount basis the route now uses qualifies.
  const result = applyPrintFreeShippingToCheckout(SELECTION(), preDiscountSubtotal, 10_000);
  assert.equal(result.freeShippingApplied, true);
  assert.equal(result.shippingChargeCents, 0);
  assert.equal(result.shippingSubsidyCents, 1399);
});

test("F4 (b): print cart below $100 pre-discount is charged shipping, promo or not", () => {
  const preDiscountSubtotal = 6000;
  for (const promoEstimate of [0, Math.round(preDiscountSubtotal * 0.15)]) {
    void promoEstimate; // the decision never subtracts it
    const result = applyPrintFreeShippingToCheckout(SELECTION(), preDiscountSubtotal, 10_000);
    assert.equal(result.freeShippingApplied, false);
    assert.equal(result.shippingChargeCents, 1399);
  }
});

test("F4 (c): pre-discount subtotal exactly at the $100 threshold qualifies", () => {
  const result = applyPrintFreeShippingToCheckout(SELECTION(), 10_000, 10_000);
  assert.equal(result.freeShippingApplied, true);
  assert.equal(result.shippingChargeCents, 0);
});

test("F4 (d): no-promo print order at/above threshold keeps free shipping (unchanged)", () => {
  const result = applyPrintFreeShippingToCheckout(SELECTION(), 10_600, 10_000);
  assert.equal(result.freeShippingApplied, true);
  assert.equal(result.shippingChargeCents, 0);
  assert.equal(result.shippingSubsidyCents, 1399);
});

test("F4 route wiring: checkout decides on the pre-discount merchandise subtotal", () => {
  const route = fs.readFileSync(CHECKOUT_ROUTE, "utf8");
  const blockStart = route.indexOf("if (isPrintOrder && !isMerchOrder)");
  assert.notEqual(blockStart, -1, "print free-shipping block must exist");
  const block = route.slice(blockStart, blockStart + 2500);
  assert.match(
    block,
    /applyPrintFreeShippingToCheckout\(\s*\{[^}]*\},\s*merchandiseSubtotalCents\s*\)/,
    "free-shipping decision must receive the pre-discount merchandise subtotal"
  );
  assert.equal(
    route.includes("merchandiseAfterDiscountCents"),
    false,
    "the after-discount estimate must not feed the free-shipping decision"
  );
  // The metadata flag stays wired to the selection outcome.
  assert.match(block, /if \(freeShippingSelection\.freeShippingApplied\)/);
  assert.match(block, /metadata\.print_free_shipping_applied = "true"/);
});
