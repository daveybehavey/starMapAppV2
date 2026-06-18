import assert from "node:assert/strict";
import test from "node:test";
import { buildDigitalEditorCheckoutHref } from "./digitalGiftCheckout.harness.mjs";

test("buildDigitalEditorCheckoutHref sets checkout=digital for paywall auto-open", () => {
  const href = buildDigitalEditorCheckoutHref("hd-star-map-hero-instant");
  assert.equal(href, "/editor?mode=quick&source=hd-star-map-hero-instant&checkout=digital");
});

test("gift ladder digital tier href pattern", () => {
  const href = buildDigitalEditorCheckoutHref("home-ladder-digital");
  assert.match(href, /checkout=digital/);
  assert.match(href, /source=home-ladder-digital/);
  assert.doesNotMatch(href, /checkout=print/);
});
