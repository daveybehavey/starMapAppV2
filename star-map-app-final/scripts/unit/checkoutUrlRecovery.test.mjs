import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  isRecoverableStripeCheckoutUrl,
  isStripeOwnedHostname,
  isValidStripeCheckoutUrl,
  resolveStripeCheckoutHandoffUrl,
} from "../../src/lib/stripeCheckoutNavigation.ts";
import {
  buildUnknownCheckoutFailureResponse,
  resolveCheckoutFailureReason,
} from "../../src/lib/checkoutResilience.ts";
import {
  parseCheckoutApiErrorPayload,
  shouldOfferDigitalSingleFallback,
  shouldRetryCheckoutFailure,
} from "../../src/lib/checkoutClientFailure.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CHECKOUT_ROUTE = path.join(ROOT, "src/app/api/checkout/route.ts");

const STRICT_OK = "https://checkout.stripe.com/c/pay/cs_live_abc123";
const G_PAY_OK = "https://checkout.stripe.com/g/pay/cs_live_abc123";
const ALT_PATH = "https://checkout.stripe.com/pay/cs_live_abc123";
const LOOKALIKE = "https://checkout.stripe.com.evil.example/c/pay/cs_live_abc";

test("strict validator still rejects alternate /pay/ path", () => {
  assert.equal(isValidStripeCheckoutUrl(STRICT_OK), true);
  assert.equal(isValidStripeCheckoutUrl(ALT_PATH), false);
});

test("strict validator accepts the /g/pay session path Stripe rolled out in 2026-10", () => {
  assert.equal(isValidStripeCheckoutUrl(G_PAY_OK), true);
  assert.equal(isValidStripeCheckoutUrl("https://checkout.stripe.com/g/pay/cs_test_abc123"), true);
  assert.equal(isValidStripeCheckoutUrl("https://checkout.stripe.com/x/pay/cs_live_abc123"), false);
  assert.equal(isValidStripeCheckoutUrl("https://checkout.stripe.com.evil.example/g/pay/cs_live_abc"), false);
  const resolved = resolveStripeCheckoutHandoffUrl(G_PAY_OK);
  assert.equal(resolved.url, G_PAY_OK);
  assert.equal(resolved.strictValid, true);
  assert.equal(resolved.recovered, false);
});

test("recovery allowlist accepts checkout.stripe.com alternate paths", () => {
  assert.equal(isRecoverableStripeCheckoutUrl(ALT_PATH), true);
  assert.equal(isRecoverableStripeCheckoutUrl(STRICT_OK), true);
  assert.equal(isRecoverableStripeCheckoutUrl(LOOKALIKE), false);
  assert.equal(isRecoverableStripeCheckoutUrl("https://notstripe.com/c/pay/cs_live_abc"), false);
  assert.equal(isStripeOwnedHostname("checkout.stripe.com"), true);
  assert.equal(isStripeOwnedHostname("notstripe.com"), false);
});

test("resolveStripeCheckoutHandoffUrl recovers non-strict Stripe URLs", () => {
  const strict = resolveStripeCheckoutHandoffUrl(STRICT_OK);
  assert.equal(strict.url, STRICT_OK);
  assert.equal(strict.strictValid, true);
  assert.equal(strict.recovered, false);

  const recovered = resolveStripeCheckoutHandoffUrl(ALT_PATH);
  assert.equal(recovered.url, ALT_PATH);
  assert.equal(recovered.strictValid, false);
  assert.equal(recovered.recovered, true);

  const rejected = resolveStripeCheckoutHandoffUrl(LOOKALIKE);
  assert.equal(rejected.url, null);
  assert.equal(rejected.recovered, false);
});

test("plain Error message becomes failure reason (not stripe_Error)", () => {
  const plain = resolveCheckoutFailureReason(new Error("invalid_stripe_checkout_url"));
  assert.equal(plain.reason, "invalid_stripe_checkout_url");
  assert.equal(plain.errorMessage, "invalid_stripe_checkout_url");

  const payload = buildUnknownCheckoutFailureResponse("corr-test-abcdefgh", plain.reason);
  assert.equal(payload.code, "unknown_error");
  assert.equal(payload.reason, "invalid_stripe_checkout_url");
  assert.equal(payload.diagnosticId, "corr-test-abcdefgh");
  assert.equal(Object.hasOwn(payload, "message"), false);
});

test("client diagnostics parse server reason + diagnosticId", () => {
  const parsed = parseCheckoutApiErrorPayload(
    {
      error: "Checkout failed",
      code: "unknown_error",
      reason: "invalid_stripe_checkout_url",
      diagnosticId: "corr-abc-12345678",
    },
    500,
  );
  assert.equal(parsed.code, "unknown_error");
  assert.equal(parsed.serverReason, "invalid_stripe_checkout_url");
  assert.equal(parsed.diagnosticId, "corr-abc-12345678");
  assert.equal(parsed.httpStatus, 500);
  assert.equal(shouldRetryCheckoutFailure("unknown_error"), true);
  assert.equal(shouldRetryCheckoutFailure("map_required"), false);
  assert.equal(shouldOfferDigitalSingleFallback({ orderType: "print", plan: "single", code: "unknown_error" }), true);
  assert.equal(shouldOfferDigitalSingleFallback({ orderType: "digital", plan: "pack3", code: "unknown_error" }), true);
  assert.equal(shouldOfferDigitalSingleFallback({ orderType: "digital", plan: "single", code: "unknown_error" }), false);
});

test("source: checkout route recovers URL and returns reason on unknown_error", () => {
  const route = fs.readFileSync(CHECKOUT_ROUTE, "utf8");
  assert.match(route, /resolveStripeCheckoutHandoffUrl/);
  assert.match(route, /buildUnknownCheckoutFailureResponse/);
  assert.match(route, /checkout_handoff_required/);
  assert.match(route, /errorMessage:\s*normalized\.errorMessage/);
  assert.match(route, /checkout_url_recovered_after_strict_validation/);
  // Must not throw invalid_stripe_checkout_url after session create (stranded session).
  assert.doesNotMatch(route, /throw new Error\("invalid_stripe_checkout_url"\)/);
});
