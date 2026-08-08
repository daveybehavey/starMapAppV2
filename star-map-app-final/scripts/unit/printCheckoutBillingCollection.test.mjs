/**
 * #224 — print Stripe Checkout billing_address_collection is `auto`, while
 * fulfillment/compliance-critical inputs (shipping, phone, ToS) remain.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CHECKOUT_ROUTE = path.join(ROOT, "src/app/api/checkout/route.ts");

/**
 * Extract the Checkout.SessionCreateParams object literal that sets billing,
 * phone, consent, and shipping collection for createCheckoutSession.
 * @param {string} route
 */
function extractSessionParamsBlock(route) {
  const marker = "const sessionParams: Stripe.Checkout.SessionCreateParams = {";
  const start = route.indexOf(marker);
  assert.ok(start >= 0, "sessionParams declaration missing from checkout route");
  const after = route.slice(start + marker.length);
  const end = after.indexOf("\n  };");
  assert.ok(end >= 0, "sessionParams block terminator missing");
  return after.slice(0, end);
}

test("print Checkout billing_address_collection is Stripe auto (not forced required)", () => {
  const route = fs.readFileSync(CHECKOUT_ROUTE, "utf8");
  const block = extractSessionParamsBlock(route);

  assert.match(
    block,
    /billing_address_collection:\s*"auto"/,
    "print and digital Checkout must use billing_address_collection: auto"
  );
  assert.equal(
    /billing_address_collection:\s*isPrintOrder\s*\?\s*"required"/.test(block),
    false,
    "must not force billing_address_collection required for print orders"
  );
  assert.equal(
    /billing_address_collection:\s*"required"/.test(block),
    false,
    "sessionParams must not set billing_address_collection to required"
  );
});

test("print Checkout still collects shipping address, phone, and ToS", () => {
  const route = fs.readFileSync(CHECKOUT_ROUTE, "utf8");
  const block = extractSessionParamsBlock(route);

  assert.match(
    block,
    /phone_number_collection:\s*\{\s*enabled:\s*isPrintOrder\s*,?\s*\}/,
    "phone collection must remain enabled for print orders"
  );
  assert.match(
    block,
    /consent_collection:\s*\{\s*terms_of_service:\s*"required"\s*,?\s*\}/,
    "ToS consent collection must remain required"
  );
  assert.match(
    block,
    /shipping_address_collection:\s*isPrintOrder\s*\?/,
    "shipping address collection must remain gated on print orders"
  );
  assert.match(
    block,
    /allowed_countries:/,
    "print shipping_address_collection must still supply allowed_countries"
  );
});

test("discount fallback spreads sessionParams so billing auto is preserved", () => {
  const route = fs.readFileSync(CHECKOUT_ROUTE, "utf8");
  assert.match(
    route,
    /const fallbackParams: Stripe\.Checkout\.SessionCreateParams = \{\s*\.\.\.sessionParams/,
    "promo fallback must spread sessionParams (inherits billing_address_collection: auto)"
  );
  // Fallback must not override billing collection back to required.
  const fallbackStart = route.indexOf("const fallbackParams: Stripe.Checkout.SessionCreateParams = {");
  assert.ok(fallbackStart >= 0);
  const fallbackSlice = route.slice(fallbackStart, fallbackStart + 600);
  assert.equal(
    /billing_address_collection/.test(fallbackSlice),
    false,
    "fallbackParams must not redeclare billing_address_collection"
  );
});
