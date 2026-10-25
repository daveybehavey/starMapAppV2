import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  getFramedCardBundlePriceLine,
  getFramedHdBundlePriceLine,
  getPrintMerchandiseSubtotalCents,
} from "./printPriceLines.harness.mjs";

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(UNIT_DIR, "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(APP_ROOT, "src", relativePath), "utf8");
}

/** Keep in sync with buildGiftFormatTiers tier ids */
const WEDDING_TIER_IDS = ["digital", "poster", "poster_16x16", "framed_hd", "framed_card"];
const SHOP_TIER_IDS = ["digital", "poster", "poster_16x16", "framed_hd", "canvas", "framed_card"];

test("gift format ladder tier sets match product strategy", () => {
  assert.equal(WEDDING_TIER_IDS.includes("canvas"), false);
  assert.equal(SHOP_TIER_IDS.includes("canvas"), true);
  assert.deepEqual(WEDDING_TIER_IDS, ["digital", "poster", "poster_16x16", "framed_hd", "framed_card"]);
});

// U04 (persona sweep 2026-10-19): the framed + keepsake card bundle must be
// judged on the BUNDLE subtotal, like checkout. Framed alone ($99) is under
// the $100 free-shipping threshold; framed + card ($118) clears it, so the
// ladder must not claim "+ shipping" for the bundle.
test("framed + card bundle subtotal clears the free-shipping threshold", () => {
  const subtotal = getPrintMerchandiseSubtotalCents({ variant: "poster_framed", includeCardAddOn: true });
  assert.equal(subtotal, 11800);
});

test("framed + card bundle price line states the total with free shipping", () => {
  const line = getFramedCardBundlePriceLine();
  assert.equal(line, "$118.00 USD framed + card · free shipping");
  assert.doesNotMatch(line, /\+ shipping/);
});

test("framed + card bundle line drops the free-shipping claim when the bundle does not qualify", () => {
  const line = getFramedCardBundlePriceLine(20000);
  assert.equal(line, "$118.00 USD framed + card");
  assert.doesNotMatch(line, /free shipping/i);
});

test("framed + HD bundle price line is unchanged (regression)", () => {
  assert.equal(getFramedHdBundlePriceLine(), "$106.00 USD framed + HD · free shipping");
});

test("ladder composes the framed_card line from the bundle helper, not the framed tier alone", () => {
  const ladder = readSrc("lib/giftFormatLadder.ts");
  assert.match(ladder, /priceLine: getFramedCardBundlePriceLine\(\)/);
  // The old composition priced the framed tier alone and appended the card.
  assert.doesNotMatch(ladder, /cardPrice/);
  assert.doesNotMatch(ladder, /formatPrintPriceWithShipping\(printTiers\.poster_framed/);
});

test("bundle helper in printCheckoutConfig judges shipping on the card-inclusive subtotal", () => {
  const config = readSrc("lib/printCheckoutConfig.ts");
  const helper = config.slice(config.indexOf("export function getFramedCardBundlePriceLine"));
  assert.match(helper, /getPrintMerchandiseSubtotalCents/);
  assert.match(helper, /includeCardAddOn: true/);
  assert.match(helper, /qualifiesForPrintFreeShipping\(subtotal\)/);
});
