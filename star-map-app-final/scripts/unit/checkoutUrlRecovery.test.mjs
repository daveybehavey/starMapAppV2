import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  redirectToStripeCheckout,
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
const ALT_PATH = "https://checkout.stripe.com/pay/cs_live_abc123";
const LOOKALIKE = "https://checkout.stripe.com.evil.example/c/pay/cs_live_abc";

test("strict validator still rejects alternate /pay/ path", () => {
  assert.equal(isValidStripeCheckoutUrl(STRICT_OK), true);
  assert.equal(isValidStripeCheckoutUrl(ALT_PATH), false);
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

test("browser and API handoff reject unrecognized Stripe destinations", () => {
  const rejected = ["https://pay.stripe.com/c/pay/cs_live_abc", "https://checkout.stripe.com/not-a-checkout", "https://checkout.stripe.com/c/pay/cs_live_abc/extra", "https://checkout.stripe.com:444/c/pay/cs_live_abc", "https://evil.example/c/pay/cs_live_abc", "https://checkout.stripe.com.evil.example/pay/cs_test_abc", "http://checkout.stripe.com/pay/cs_test_abc", "https://user@checkout.stripe.com/pay/cs_test_abc"];
  globalThis.window = { location: { assign: () => assert.fail("unsafe navigation") } };
  try { for(const url of rejected) { assert.equal(resolveStripeCheckoutHandoffUrl(url).url,null,url);assert.throws(()=>redirectToStripeCheckout(url),/invalid_checkout_url/); } }
  finally { delete globalThis.window; }
});
test("recognized checkout path shapes preserve complete fragment", () => {
  const assigned=[];globalThis.window={location:{assign:url=>assigned.push(url)}};
  try { for(const prefix of ["/pay/","/c/pay/","/f/pay/"]) {const url=`https://checkout.stripe.com${prefix}cs_test_abc123#fid=synthetic`;redirectToStripeCheckout(url);assert.equal(assigned.at(-1),url);} }
  finally {delete globalThis.window;}
});
