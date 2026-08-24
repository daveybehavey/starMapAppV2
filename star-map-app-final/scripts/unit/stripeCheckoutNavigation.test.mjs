import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildDownloadPath,
  describeStripeCheckoutUrlShape,
  isValidStripeCheckoutUrl,
  stripeCheckoutHtmlRedirectBody,
} from "../../src/lib/stripeCheckoutNavigation.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CHECKOUT_ROUTE = path.join(ROOT, "src/app/api/checkout/route.ts");

const WITH_FRAGMENT =
  "https://checkout.stripe.com/c/pay/cs_live_abc#fid1d2BpamRhQ2prcSc%2FJ1ZqcHdmYCVWZGt2JVV3aicpJ2dqd2Fgd1ZxfGlgJz8%3D";

const WITHOUT_FRAGMENT = "https://checkout.stripe.com/c/pay/cs_live_abc";

/** Production-shaped ~629 char URL observed live (fragment optional). */
const LONG_FRAGMENTLESS = `https://checkout.stripe.com/c/pay/cs_test_${"A".repeat(585)}`;

test("1: valid Stripe checkout URL WITH fragment -> accepted", () => {
  assert.equal(isValidStripeCheckoutUrl(WITH_FRAGMENT), true);
  const shape = describeStripeCheckoutUrlShape(WITH_FRAGMENT);
  assert.equal(shape.valid, true);
  assert.equal(shape.hashPresent, true);
});

test("2: valid Stripe checkout URL WITHOUT fragment -> accepted", () => {
  assert.equal(isValidStripeCheckoutUrl(WITHOUT_FRAGMENT), true);
  const shape = describeStripeCheckoutUrlShape(WITHOUT_FRAGMENT);
  assert.equal(shape.valid, true);
  assert.equal(shape.hashPresent, false);
});

test("3: http://checkout.stripe.com -> rejected", () => {
  assert.equal(
    isValidStripeCheckoutUrl("http://checkout.stripe.com/c/pay/cs_live_abc"),
    false
  );
});

test("4: lookalike host checkout.stripe.com.evil.example -> rejected", () => {
  assert.equal(
    isValidStripeCheckoutUrl(
      "https://checkout.stripe.com.evil.example/c/pay/cs_live_abc"
    ),
    false
  );
});

test("5: stripe hostname in path/query only -> rejected", () => {
  assert.equal(
    isValidStripeCheckoutUrl("https://evil.example/checkout.stripe.com/c/pay/cs_live_abc"),
    false
  );
  assert.equal(
    isValidStripeCheckoutUrl("https://example.com/?next=checkout.stripe.com"),
    false
  );
});

test("6: credentials/userinfo URL -> rejected", () => {
  assert.equal(
    isValidStripeCheckoutUrl("https://user:pass@checkout.stripe.com/c/pay/cs_live_abc"),
    false
  );
});

test("7: malformed URL -> rejected", () => {
  assert.equal(isValidStripeCheckoutUrl("not-a-url"), false);
  assert.equal(isValidStripeCheckoutUrl(""), false);
});

test("8: unrelated stripe.com hostname -> rejected", () => {
  assert.equal(isValidStripeCheckoutUrl("https://stripe.com/c/pay/cs_live_abc"), false);
  assert.equal(isValidStripeCheckoutUrl("https://pay.stripe.com/c/pay/cs_live_abc"), false);
});

test("9: real-shaped long fragment-less session URL -> accepted", () => {
  assert.ok(LONG_FRAGMENTLESS.length >= 600);
  assert.equal(isValidStripeCheckoutUrl(LONG_FRAGMENTLESS), true);
  assert.equal(describeStripeCheckoutUrlShape(LONG_FRAGMENTLESS).hashPresent, false);
});

test("10: same URL accepted on repeat (idempotency cache safe)", () => {
  const url = WITHOUT_FRAGMENT;
  assert.equal(isValidStripeCheckoutUrl(url), true);
  assert.equal(isValidStripeCheckoutUrl(url), true);
  // Simulates idempotency KV read: cached URL must still pass validation.
  const cached = url;
  assert.equal(isValidStripeCheckoutUrl(cached.trim()), true);
});

test("11: wrong path variants still rejected", () => {
  assert.equal(
    isValidStripeCheckoutUrl("https://checkout.stripe.com/pay/cs_live_abc"),
    false
  );
  assert.equal(
    isValidStripeCheckoutUrl("https://checkout.stripe.com/c/pay/not-a-session"),
    false
  );
  // Trailing `#` alone normalizes to empty hash — still a valid Stripe handoff host/path.
  assert.equal(
    isValidStripeCheckoutUrl("https://checkout.stripe.com/c/pay/cs_live_abc#"),
    true
  );
});

test("12: checkout route uses shape diagnostics not fragment-only rejection", () => {
  const route = fs.readFileSync(CHECKOUT_ROUTE, "utf8");
  assert.match(route, /describeStripeCheckoutUrlShape/);
  assert.match(route, /hashPresent/);
  assert.equal(route.includes("without required fragment"), false);
  assert.match(route, /diagnosticId:\s*correlationId/);
  assert.match(route, /code:\s*"unknown_error"/);
});

test("stripeCheckoutHtmlRedirectBody works with and without fragment", () => {
  const withFrag = stripeCheckoutHtmlRedirectBody(
    "https://checkout.stripe.com/c/pay/cs_test_abc#fidfragment"
  );
  assert.match(withFrag, /location\.replace/);
  assert.match(withFrag, /fidfragment/);

  const noFrag = stripeCheckoutHtmlRedirectBody(WITHOUT_FRAGMENT);
  assert.match(noFrag, /location\.replace/);
  assert.match(noFrag, /cs_live_abc/);
});

test("buildDownloadPath includes session_id and map_id when provided", () => {
  const pathOut = buildDownloadPath({
    sessionId: "cs_test_abc",
    mapId: "11111111-1111-4111-8111-111111111111",
  });
  assert.match(pathOut, /^\/download\?/);
  assert.match(pathOut, /session_id=cs_test_abc/);
  assert.match(pathOut, /map_id=11111111-1111-4111-8111-111111111111/);
});

test("buildDownloadPath can request auto_export after digital checkout", () => {
  const pathOut = buildDownloadPath({
    sessionId: "cs_test_abc",
    mapId: "11111111-1111-4111-8111-111111111111",
    autoExport: true,
  });
  assert.match(pathOut, /auto_export=1/);
});
