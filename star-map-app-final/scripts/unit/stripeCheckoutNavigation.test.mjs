import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidStripeCheckoutUrl,
  stripeCheckoutHtmlRedirectBody,
} from "../../src/lib/stripeCheckoutNavigation.ts";
import { buildDownloadPath } from "../../src/lib/stripeCheckoutNavigation.ts";

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

test("buildDownloadPath includes session_id and map_id when provided", () => {
  const path = buildDownloadPath({
    sessionId: "cs_test_abc",
    mapId: "11111111-1111-4111-8111-111111111111",
  });
  assert.match(path, /^\/download\?/);
  assert.match(path, /session_id=cs_test_abc/);
  assert.match(path, /map_id=11111111-1111-4111-8111-111111111111/);
});

test("buildDownloadPath can request auto_export after digital checkout", () => {
  const path = buildDownloadPath({
    sessionId: "cs_test_abc",
    mapId: "11111111-1111-4111-8111-111111111111",
    autoExport: true,
  });
  assert.match(path, /auto_export=1/);
});
