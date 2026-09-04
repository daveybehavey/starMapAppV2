import assert from "node:assert/strict";
import test from "node:test";
import {
  extractGetCheckoutHtmlHandoffUrl,
  extractPostCheckoutJsonUrl,
  isStrictStripeCheckoutHandoffUrl,
} from "../live-smoke.mjs";
import { stripeCheckoutHtmlRedirectBody } from "../../src/lib/stripeCheckoutNavigation.ts";

const C_PAY = "https://checkout.stripe.com/c/pay/cs_live_abc";
const F_PAY = "https://checkout.stripe.com/f/pay/cs_live_abc";
const F_PAY_TEST = "https://checkout.stripe.com/f/pay/cs_test_abc";
const C_PAY_TEST = "https://checkout.stripe.com/c/pay/cs_test_abc";
const C_PAY_FRAG = `${C_PAY}#fidfragment`;
const F_PAY_FRAG = `${F_PAY}#fidfragment`;

test("POST JSON extractor accepts /c/pay and /f/pay urls", () => {
  assert.equal(extractPostCheckoutJsonUrl(JSON.stringify({ url: C_PAY })), C_PAY);
  assert.equal(extractPostCheckoutJsonUrl(JSON.stringify({ url: F_PAY })), F_PAY);
  assert.equal(extractPostCheckoutJsonUrl(JSON.stringify({ url: C_PAY_TEST })), C_PAY_TEST);
  assert.equal(extractPostCheckoutJsonUrl(JSON.stringify({ url: F_PAY_TEST })), F_PAY_TEST);
  assert.equal(extractPostCheckoutJsonUrl(JSON.stringify({ url: C_PAY_FRAG })), C_PAY_FRAG);
  assert.equal(extractPostCheckoutJsonUrl(JSON.stringify({ url: F_PAY_FRAG })), F_PAY_FRAG);
});

test("POST JSON extractor rejects HTML location.replace fallback", () => {
  const html = stripeCheckoutHtmlRedirectBody(F_PAY_FRAG);
  assert.match(html, /location\.replace/);
  assert.equal(extractPostCheckoutJsonUrl(html), "");
  assert.equal(isStrictStripeCheckoutHandoffUrl(extractPostCheckoutJsonUrl(html)), false);
});

test("POST JSON extractor rejects missing/malformed JSON bodies", () => {
  assert.equal(extractPostCheckoutJsonUrl(""), "");
  assert.equal(extractPostCheckoutJsonUrl("{"), "");
  assert.equal(extractPostCheckoutJsonUrl(JSON.stringify({ ok: true })), "");
  assert.equal(extractPostCheckoutJsonUrl(JSON.stringify({ url: 123 })), "");
  assert.equal(extractPostCheckoutJsonUrl(JSON.stringify({ url: "   " })), "");
});

test("strict allowlist accepts valid /c/pay and /f/pay JSON urls", () => {
  for (const url of [C_PAY, F_PAY, C_PAY_TEST, F_PAY_TEST, C_PAY_FRAG, F_PAY_FRAG]) {
    const extracted = extractPostCheckoutJsonUrl(JSON.stringify({ url }));
    assert.equal(isStrictStripeCheckoutHandoffUrl(extracted), true, url);
  }
});

test("strict allowlist rejects malformed and lookalike urls from POST JSON", () => {
  const rejected = [
    "http://checkout.stripe.com/f/pay/cs_live_abc",
    "https://user:pass@checkout.stripe.com/f/pay/cs_live_abc",
    "https://checkout.stripe.com.evil.example/f/pay/cs_live_abc",
    "https://evil.example/checkout.stripe.com/f/pay/cs_live_abc",
    "https://pay.stripe.com/f/pay/cs_live_abc",
    "https://checkout.stripe.com/pay/cs_live_abc",
    "https://checkout.stripe.com/evil/pay/cs_live_abc",
    "https://checkout.stripe.com/f/pay/not-a-session",
    "https://checkout.stripe.com/x/pay/cs_live_abc",
  ];
  for (const url of rejected) {
    const extracted = extractPostCheckoutJsonUrl(JSON.stringify({ url }));
    assert.equal(extracted, url);
    assert.equal(isStrictStripeCheckoutHandoffUrl(extracted), false, url);
  }
});

test("GET HTML extractor is route-specific and accepts allowlisted handoff bodies", () => {
  const htmlC = stripeCheckoutHtmlRedirectBody(C_PAY_FRAG);
  const htmlF = stripeCheckoutHtmlRedirectBody(F_PAY);
  assert.equal(extractGetCheckoutHtmlHandoffUrl(htmlC), C_PAY_FRAG);
  assert.equal(extractGetCheckoutHtmlHandoffUrl(htmlF), F_PAY);
  assert.equal(isStrictStripeCheckoutHandoffUrl(extractGetCheckoutHtmlHandoffUrl(htmlC)), true);
  assert.equal(isStrictStripeCheckoutHandoffUrl(extractGetCheckoutHtmlHandoffUrl(htmlF)), true);
});

test("GET HTML extractor does not accept POST JSON bodies as HTML handoff", () => {
  const jsonBody = JSON.stringify({ url: F_PAY });
  assert.equal(extractGetCheckoutHtmlHandoffUrl(jsonBody), "");
});

test("GET HTML extractor rejects hostile embedded URLs even if parseable", () => {
  const hostileHtml =
    '<script>window.location.replace("https://evil.example/checkout.stripe.com/f/pay/cs_live_abc");</script>';
  const extracted = extractGetCheckoutHtmlHandoffUrl(hostileHtml);
  assert.equal(extracted, "https://evil.example/checkout.stripe.com/f/pay/cs_live_abc");
  assert.equal(isStrictStripeCheckoutHandoffUrl(extracted), false);
});

test("live-smoke POST probe source stays JSON-specific (no HTML fallback)", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const source = fs.readFileSync(path.join(root, "live-smoke.mjs"), "utf8");
  assert.match(source, /extractPostCheckoutJsonUrl\(checkoutBody\)/);
  assert.match(source, /export function extractGetCheckoutHtmlHandoffUrl/);
  assert.equal(source.includes("extractCheckoutHandoffUrl"), false);
  // POST digital-checkout block must call JSON extractor, not HTML extractor.
  const postBlock = source.slice(
    source.indexOf('method: "POST"'),
    source.indexOf("Digital checkout checks")
  );
  assert.match(postBlock, /extractPostCheckoutJsonUrl/);
  assert.doesNotMatch(postBlock, /extractGetCheckoutHtmlHandoffUrl/);
  assert.doesNotMatch(postBlock, /location\.replace/);
});
