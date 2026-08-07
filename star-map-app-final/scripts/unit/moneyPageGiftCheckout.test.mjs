import assert from "node:assert/strict";
import test from "node:test";
import {
  FRAMED_HD_RECOMMENDED_BADGE,
  buildStandardGiftPreviewIntentDetails,
  getFramedHdEditorOpenDescription,
  getFramedHdGiftCtaLine,
  getGiftLadderIntro,
} from "./moneyPageGiftCheckout.harness.mjs";

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

test("gift ladder intro uses factual recommended presentation copy", () => {
  const intro = getGiftLadderIntro();
  assert.match(intro, /recommended presentation is framed \+ HD/i);
  assert.doesNotMatch(intro, /most gift buyers choose/i);
  assert.equal(FRAMED_HD_RECOMMENDED_BADGE, "Premium gift");
});

test("editor-open and CTA helpers avoid unsupported popularity claims", () => {
  assert.match(getFramedHdEditorOpenDescription(), /recommended premium gift presentation/i);
  assert.match(getFramedHdGiftCtaLine(), /Recommended presentation: framed \+ HD/i);
  const details = buildStandardGiftPreviewIntentDetails();
  assert.match(details[0], /premium gift route/i);
  assert.doesNotMatch(details.join(" "), /most (buyers|gift buyers) choose/i);
});
