import assert from "node:assert/strict";
import test from "node:test";

/** Keep in sync with buildGiftFormatTiers tier ids */
const WEDDING_TIER_IDS = ["digital", "poster", "framed_hd", "framed_card"];
const SHOP_TIER_IDS = ["digital", "poster", "framed_hd", "canvas", "framed_card"];

test("gift format ladder tier sets match product strategy", () => {
  assert.equal(WEDDING_TIER_IDS.includes("canvas"), false);
  assert.equal(SHOP_TIER_IDS.includes("canvas"), true);
  assert.deepEqual(WEDDING_TIER_IDS, ["digital", "poster", "framed_hd", "framed_card"]);
});
