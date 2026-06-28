import assert from "node:assert/strict";
import test from "node:test";

/** Mirrors buildStandardGiftPreviewIntents shape from moneyPageGiftCheckout.ts */
const STANDARD_GIFT_INTENT_PLANS = ["print_framed_hd", "print_unframed", "preview"];

test("standard money-page gift intents prioritize framed + HD", () => {
  assert.deepEqual(STANDARD_GIFT_INTENT_PLANS, ["print_framed_hd", "print_unframed", "preview"]);
  assert.equal(STANDARD_GIFT_INTENT_PLANS[0], "print_framed_hd");
});

test("framed + HD editor href includes digital add-on flag", () => {
  const href =
    "/editor?mode=quick&source=birthday-hero-framed-hd&checkout=print&print_variant=poster_framed&include_digital_addon=1";
  assert.match(href, /include_digital_addon=1/);
  assert.match(href, /print_variant=poster_framed/);
});
