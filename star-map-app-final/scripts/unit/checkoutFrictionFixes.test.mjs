/**
 * Checkout friction fixes: rate limit, handoff recovery, promo drop, client retry.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CHECKOUT_RETRY_STATUS_MESSAGE,
  parseCheckoutApiErrorPayload,
  shouldRetryCheckoutFailure,
} from "../../src/lib/checkoutClientFailure.ts";
import {
  buildCheckoutCancelUrl,
  buildCheckoutEditorRecoveryUrl,
} from "../../src/lib/checkoutEditorRecovery.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CHECKOUT_ROUTE = path.join(ROOT, "src/app/api/checkout/route.ts");

test("checkout rate limit is ~20 requests per minute per IP", () => {
  const route = fs.readFileSync(CHECKOUT_ROUTE, "utf8");
  const matches = [...route.matchAll(/checkRateLimit\(`checkout:\$\{ip\}`,\s*(\d+),\s*60\)/g)];
  assert.equal(matches.length, 2, "GET and POST must both rate-limit checkout");
  for (const match of matches) {
    assert.equal(Number(match[1]), 20, "checkout cap should be 20/min");
  }
});

test("invalid promo codes are dropped instead of hard-blocking checkout", () => {
  const route = fs.readFileSync(CHECKOUT_ROUTE, "utf8");
  assert.match(route, /promoInvalidDropped/);
  assert.equal(
    /Invalid or expired promotion code\.\s*",\s*code:\s*"invalid_promotion_code"/.test(route),
    false,
    "must not return 400 invalid_promotion_code that blocks checkout"
  );
});

test("manual promo codes use shared helpers; hosted entry stays print-only", () => {
  const route = fs.readFileSync(CHECKOUT_ROUTE, "utf8");
  // Local helper removed — gates live in checkoutPromotions.
  assert.equal(
    /function canUseManualPromotionCode\(orderType/.test(route),
    false,
    "route must import canUseManualPromotionCode instead of a local helper"
  );
  assert.match(route, /canUseManualPromotionCode/);
  assert.match(route, /canUseHostedPromotionCodes/);
  assert.match(route, /isManualPromotionCompatibleWithOrder/);
  // Configured-code-only profit gate removed so XMAS15/BLACKFRIDAY20 can pre-apply on print.
  assert.equal(
    /only allow the explicitly configured promotion code/.test(route),
    false,
    "must not restrict pre-apply to PROMOTION_COUPON_CODE alone"
  );
  assert.match(
    route,
    /Hosted Stripe promo entry is print-only/,
    "createCheckoutSession must keep allow_promotion_codes print-only"
  );
  assert.match(
    route,
    /This code isn't valid for this item/,
    "digital incompatible codes must hard-fail with a plain validity error"
  );
});

test("ToS checkbox consent_collection is removed from session params", () => {
  const route = fs.readFileSync(CHECKOUT_ROUTE, "utf8");
  assert.equal(/consent_collection:\s*\{\s*terms_of_service:\s*"required"/.test(route), false);
  assert.match(route, /By completing your purchase you agree to our \[Terms of Service\]/);
});

test("cancel URL rebuilds editor checkout so country can be changed", () => {
  const route = fs.readFileSync(CHECKOUT_ROUTE, "utf8");
  assert.match(route, /buildCheckoutCancelUrl/);
  const url = buildCheckoutCancelUrl({
    siteOrigin: "https://starmapco.com",
    mapId: "00000000-0000-4000-8000-000000000001",
    orderType: "print",
    printVariant: "poster_framed",
    shippingCountry: "US",
  });
  assert.match(url, /^https:\/\/starmapco\.com\/editor\?/);
  assert.match(url, /checkout=print/);
  assert.match(url, /shipping_country=US/);
  assert.match(url, /source=checkout-cancel-change-country/);
});

test("handoff recovery URL reopens digital checkout with map", () => {
  const url = buildCheckoutEditorRecoveryUrl({
    siteOrigin: "https://starmapco.com/",
    mapId: "00000000-0000-4000-8000-000000000002",
    orderType: "digital",
    plan: "single",
  });
  assert.equal(
    url,
    "https://starmapco.com/editor?mode=quick&source=checkout-handoff-recovery&map_id=00000000-0000-4000-8000-000000000002&checkout=digital&plan=single"
  );
});

test("429 and handoff failures are retryable; map errors are not", () => {
  assert.equal(shouldRetryCheckoutFailure("rate_limited", 429), true);
  assert.equal(shouldRetryCheckoutFailure("checkout_handoff_required", 403), true);
  assert.equal(shouldRetryCheckoutFailure("map_required", 400), false);
  assert.equal(shouldRetryCheckoutFailure("sky_location_required", 400), false);
  assert.equal(CHECKOUT_RETRY_STATUS_MESSAGE, "One moment, retrying…");
});

test("parseCheckoutApiErrorPayload maps bare 429 bodies to rate_limited", () => {
  const parsed = parseCheckoutApiErrorPayload({ error: "Too many requests. Please try again later." }, 429);
  assert.equal(parsed.code, "rate_limited");
  assert.equal(parsed.httpStatus, 429);
});

test("parseCheckoutApiErrorPayload keeps customer-readable sky location error", () => {
  const parsed = parseCheckoutApiErrorPayload(
    {
      code: "sky_location_required",
      error: "Please choose the location for your star map before checking out",
    },
    400
  );
  assert.equal(parsed.code, "sky_location_required");
  assert.equal(
    parsed.errorMessage,
    "Please choose the location for your star map before checking out"
  );
});

test("checkout_handoff_required payload includes editorRecoveryUrl when provided", () => {
  const parsed = parseCheckoutApiErrorPayload(
    {
      code: "checkout_handoff_required",
      error: "Checkout requires a browser session. Open checkout from the editor.",
      editorRecoveryUrl: "https://starmapco.com/editor?checkout=digital",
    },
    403
  );
  assert.equal(parsed.code, "checkout_handoff_required");
  assert.equal(parsed.editorRecoveryUrl, "https://starmapco.com/editor?checkout=digital");
});
