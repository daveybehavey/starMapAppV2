/**
 * T-FLEET-103 — native CAD pricing for Canadian buyers.
 *
 * Pins:
 * - the single currency resolver (print/merch follow the shipping
 *   country, digital follows the client IP country; CA -> CAD,
 *   everyone else -> USD, exactly today's behaviour);
 * - the native CAD price book verbatim (design §2.1, struck at the
 *   1.40 reference rate) alongside an UNCHANGED USD book;
 * - shipping conversion at the same 1.40 reference rate;
 * - the pricing identity per currency — the transition guarantee:
 *   the same cart priced in CAD and in USD can never share a checkout
 *   URL cache key or a Stripe idempotency key, in either direction;
 * - the route wiring: both the session builder and the identity
 *   resolver consult the one resolver, adaptive_pricing is disabled
 *   for CAD sessions only, and automatic_tax appears nowhere.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const { getPrintSecondCopyCadPriceCents } = await import("../../src/lib/pricing.ts");

import {
  CAD_REFERENCE_RATE,
  convertUsdCentsToCadCents,
  convertUsdShippingRateToCadCents,
  resolveCheckoutCurrency,
} from "../../src/lib/checkoutCurrency.ts";
import { PRINT_CATALOG } from "../../src/lib/printCatalog.ts";
import {
  buildCheckoutPricingIdentity,
  priceDataComponent,
  priceIdComponent,
} from "../../src/lib/checkoutPricingIdentity.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("resolver: print orders follow the shipping country, never the IP country", () => {
  assert.equal(
    resolveCheckoutCurrency({ orderType: "print", shippingCountry: "CA", clientCountry: "US" }),
    "cad"
  );
  assert.equal(
    resolveCheckoutCurrency({ orderType: "print", shippingCountry: "US", clientCountry: "CA" }),
    "usd"
  );
  assert.equal(
    resolveCheckoutCurrency({ orderType: "print", shippingCountry: "GB", clientCountry: "CA" }),
    "usd"
  );
  assert.equal(
    resolveCheckoutCurrency({ orderType: "print", shippingCountry: null, clientCountry: "CA" }),
    "usd"
  );
});

test("resolver: digital orders follow the client IP country", () => {
  assert.equal(
    resolveCheckoutCurrency({ orderType: "digital", shippingCountry: null, clientCountry: "CA" }),
    "cad"
  );
  assert.equal(
    resolveCheckoutCurrency({ orderType: "digital", shippingCountry: "CA", clientCountry: "US" }),
    "usd"
  );
  assert.equal(
    resolveCheckoutCurrency({ orderType: "digital", shippingCountry: null, clientCountry: null }),
    "usd"
  );
  assert.equal(
    resolveCheckoutCurrency({ orderType: "digital", shippingCountry: null, clientCountry: "FR" }),
    "usd"
  );
});

test("resolver: country tokens are normalized; malformed tokens fall back to USD", () => {
  assert.equal(
    resolveCheckoutCurrency({ orderType: "digital", shippingCountry: null, clientCountry: " ca " }),
    "cad"
  );
  assert.equal(
    resolveCheckoutCurrency({ orderType: "print", shippingCountry: "ca", clientCountry: null }),
    "cad"
  );
  assert.equal(
    resolveCheckoutCurrency({ orderType: "digital", shippingCountry: null, clientCountry: "CAN" }),
    "usd"
  );
  assert.equal(
    resolveCheckoutCurrency({ orderType: "digital", shippingCountry: null, clientCountry: "C1" }),
    "usd"
  );
  assert.equal(
    resolveCheckoutCurrency({ orderType: "digital", shippingCountry: null, clientCountry: "" }),
    "usd"
  );
});

test("shipping conversion uses the 1.40 reference rate, rounded to the nearest cent", () => {
  assert.equal(CAD_REFERENCE_RATE, 1.4);
  // CA Printful table rates (data/printful-shipping.json): unframed
  // poster $5.33, framed poster $10.70.
  assert.equal(convertUsdShippingRateToCadCents(5.33), 746);
  assert.equal(convertUsdShippingRateToCadCents(10.7), 1498);
  assert.equal(convertUsdCentsToCadCents(533), 746);
  assert.equal(convertUsdCentsToCadCents(1070), 1498);
  assert.equal(convertUsdCentsToCadCents(0), 0);
});

test("print catalog: CAD book matches design §2.1 verbatim; USD fallbacks unchanged", () => {
  const byId = new Map(PRINT_CATALOG.map((row) => [row.id, row]));
  const expected = {
    poster_unframed: { usd: 4900, cad: 6900 },
    poster_framed: { usd: 9900, cad: 13900 },
    canvas_wrap: { usd: 7900, cad: 11100 },
    mug_11oz: { usd: 3900, cad: 5500 },
    card_4x6: { usd: 1900, cad: 2700 },
  };
  for (const [id, amounts] of Object.entries(expected)) {
    const row = byId.get(id);
    assert.ok(row, `print catalog row ${id} missing`);
    assert.equal(row.priceFallbackCents, amounts.usd, `${id} USD fallback changed`);
    assert.equal(row.priceCadFallbackCents, amounts.cad, `${id} CAD book amount wrong`);
  }
});

test("merch catalog: CAD book matches design §2.1 verbatim; USD fallbacks unchanged", () => {
  const src = read("src/lib/merchCatalog.ts");
  const cadAmounts = [...src.matchAll(/priceCadFallbackCents: (\d+),/g)].map((m) => Number(m[1]));
  // Family order in the catalog: sticker, magnet, pins, tee, hoodie.
  assert.deepEqual(cadAmounts, [1300, 2000, 2000, 4100, 6900]);
  const usdAmounts = [...src.matchAll(/priceFallbackCents: (\d+),/g)].map((m) => Number(m[1]));
  assert.deepEqual(usdAmounts, [900, 1400, 1400, 2900, 4900]);
  assert.match(src, /export function getMerchCadCheckoutPriceCents/);
});

test("pricing lib: digital CAD book is fixed constants, not env-driven", () => {
  const src = read("src/lib/pricing.ts");
  assert.match(src, /single: 1300,\s*pack3: 2700,\s*subscription: 2700/);
  assert.match(src, /PRINT_DIGITAL_ADDON_CAD_PRICE_CENTS = 1000/);
  assert.match(src, /export function getDigitalCadPriceCents/);
  assert.match(src, /export function getPrintDigitalAddOnCadPriceCents/);
  assert.match(src, /export function getPrintCadPriceCents/);
  // The CAD book must never become a dashboard/env flip the pricing
  // identity cannot see.
  const currencySrc = read("src/lib/checkoutCurrency.ts");
  assert.equal(/process\.env/.test(currencySrc), false, "checkoutCurrency must not read env");
});

test("identity: CAD components format as pd:cad:<cents>", () => {
  assert.equal(
    buildCheckoutPricingIdentity([priceDataComponent("cad", 13900)]),
    "pd:cad:13900"
  );
});

test("transition: same cart, CAD vs USD identities never collide; same currency is stable", () => {
  // Framed poster + HD add-on, the design §5 case. Pre-change this
  // cart resolved to its configured USD Price IDs; post-change the CA
  // session charges the CAD book via price_data.
  const usdIdentity = buildCheckoutPricingIdentity([
    priceIdComponent("price_framed_usd"),
    priceIdComponent("price_addon_usd"),
  ]);
  const cadIdentity = buildCheckoutPricingIdentity([
    priceDataComponent("cad", 13900),
    priceDataComponent("cad", 1000),
  ]);
  assert.equal(cadIdentity, "pd:cad:13900+pd:cad:1000");
  assert.notEqual(cadIdentity, usdIdentity);
  // A price_data USD resolution of the same cart differs too (amounts
  // and currency both embedded), so no pre-flip cached URL or Stripe
  // idempotency key can be served across the flip in either direction.
  const usdPriceDataIdentity = buildCheckoutPricingIdentity([
    priceDataComponent("usd", 9900),
    priceDataComponent("usd", 700),
  ]);
  assert.notEqual(cadIdentity, usdPriceDataIdentity);
  // Deterministic: identical inputs resolve identically, so same-price
  // retries still dedupe.
  assert.equal(
    buildCheckoutPricingIdentity([priceDataComponent("cad", 13900), priceDataComponent("cad", 1000)]),
    cadIdentity
  );
});

test("route: one resolver feeds both the session builder and the pricing identity", () => {
  const route = read("src/app/api/checkout/route.ts");
  const resolverCalls = route.match(/resolveCheckoutCurrency\(\{/g) ?? [];
  assert.ok(
    resolverCalls.length >= 2,
    "session construction and pricing identity must both consult resolveCheckoutCurrency"
  );
  // The POST handler hands the order's shipping country to the
  // identity resolver (print currency follows shipping country).
  assert.match(route, /shippingCountry: shippingCountry \?\? null,\s*clientCountry,/);
  // Identity resolves CAD components from the same CAD book getters
  // the session builder charges.
  assert.match(route, /priceDataComponent\("cad", getDigitalCadPriceCents\(input\.plan\)\)/);
  assert.match(route, /priceDataComponent\("cad", getMerchCadCheckoutPriceCents\(family\)\)/);
  assert.match(route, /priceDataComponent\("cad", getPrintCadPriceCents\(normalizedPrintVariant\)\)/);
  assert.match(route, /priceDataComponent\("cad", getPrintDigitalAddOnCadPriceCents\(\)\)/);
  assert.match(route, /priceDataComponent\("cad", getPrintCadPriceCents\("card_4x6"\)\)/);
});

test("route: adaptive_pricing is disabled for CAD sessions only; currency is stamped in metadata", () => {
  const route = read("src/app/api/checkout/route.ts");
  assert.match(
    route,
    /\.\.\.\(isCadCheckout \? \{ adaptive_pricing: \{ enabled: false \} \} : \{\}\)/
  );
  assert.match(route, /metadata\.checkout_currency = checkoutCurrency;/);
  // USD behaviour preserved: the USD digital path still prefers the
  // configured Stripe Price IDs.
  assert.match(route, /const useDigitalPriceId = Boolean\(digitalPriceId\) && !useGeoDigitalSinglePricing;/);
});

test("route: promotion estimator sees session currency; margin guard and free shipping stay USD", () => {
  const route = read("src/app/api/checkout/route.ts");
  assert.match(route, /currency: isCadCheckout \? "cad" : printTier\.currency,/);
  assert.match(route, /lineItems: promotionEstimateLineItemsUsd,/);
  assert.match(route, /currency: "usd",\s*lineItems: promotionEstimateLineItemsUsd,/);
  assert.match(route, /promotionEstimateLineItemsUsd\.reduce\(/);
  assert.match(route, /discountAmountCents: guardDiscountCents,/);
});

test("merch checkout: currency parameter converts shipping presentation and mints CAD price_data", () => {
  const src = read("src/lib/merchCheckout.ts");
  assert.match(src, /getMerchShippingOptionsForCountry\([\s\S]*?currency: CheckoutCurrency = "usd"/);
  assert.match(src, /buildMerchCheckoutLineItem\([\s\S]*?currency: CheckoutCurrency = "usd"/);
  assert.match(src, /convertUsdShippingRateToCadCents\(rate\.rate\)/);
  assert.match(src, /currency: "cad",\s*unit_amount: cadPriceCents,/);
  assert.match(src, /getMerchCadCheckoutPriceCents\(family\)/);
  // The USD charge figure is preserved for accounting.
  assert.match(src, /shippingChargeCents: amountCents,/);
});

test("lever A: the CAD copy price is round(CAD book x 0.9), struck from the same CAD book", () => {
  // The copy helper reads priceCadFallbackCents via getPrintCadPriceCents —
  // the code-struck CAD book, deliberately not env-overridable, exactly
  // like the main CAD line it mirrors.
  assert.equal(getPrintSecondCopyCadPriceCents("poster_unframed"), 6210); // 6900 x 0.9
  assert.equal(getPrintSecondCopyCadPriceCents("poster_unframed_16x16"), 4950); // 5500 x 0.9
  assert.equal(getPrintSecondCopyCadPriceCents("poster_framed"), 12510); // 13900 x 0.9
  assert.equal(getPrintSecondCopyCadPriceCents("canvas_wrap"), 9990); // 11100 x 0.9
});

test("fence: automatic_tax appears nowhere in the checkout path", () => {
  for (const rel of [
    "src/app/api/checkout/route.ts",
    "src/lib/checkoutCurrency.ts",
    "src/lib/merchCheckout.ts",
    "src/lib/pricing.ts",
  ]) {
    assert.equal(/automatic_tax/.test(read(rel)), false, `${rel} must not reference automatic_tax`);
  }
});
