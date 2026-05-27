import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidStripeCheckoutUrl,
  stripeCheckoutHtmlRedirectBody,
} from "../../src/lib/stripeCheckoutNavigation.ts";

test("isValidStripeCheckoutUrl requires checkout.stripe.com path and hash fragment", () => {
  const valid =
    "https://checkout.stripe.com/c/pay/cs_live_abc#fid1d2BpamRhQ2prcSc%2FJ1ZqcHdmYCVWZGt2JVV3aicpJ2dqd2Fgd1ZxfGlgJz8%3D";
  assert.equal(isValidStripeCheckoutUrl(valid), true);
  assert.equal(isValidStripeCheckoutUrl("https://checkout.stripe.com/c/pay/cs_live_abc"), false);
  assert.equal(isValidStripeCheckoutUrl("https://starmapco.com/editor"), false);
});

test("stripeCheckoutHtmlRedirectBody embeds full URL for client navigation", () => {
  const url =
    "https://checkout.stripe.com/c/pay/cs_test_abc#fidfragment";
  const html = stripeCheckoutHtmlRedirectBody(url);
  assert.match(html, /location\.replace/);
  assert.match(html, /fidfragment/);
});
