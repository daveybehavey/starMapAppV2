import assert from "node:assert/strict";
import test from "node:test";
import {
  PAYWALL_LIVE_PRINT_VARIANTS,
  PAYWALL_PRINT_CHECKOUT_ROW_VARIANTS,
  isPrintVariant,
  parsePrintVariant,
} from "./printCatalog.harness.mjs";

test("parsePrintVariant preserves card_4x6 for checkout metadata", () => {
  assert.equal(parsePrintVariant("card_4x6"), "card_4x6");
  assert.equal(parsePrintVariant("card_4x6", "poster_framed"), "card_4x6");
  assert.notEqual(parsePrintVariant("card_4x6"), "poster_framed");
});

test("parsePrintVariant does not map unknown SKUs to framed poster", () => {
  assert.equal(parsePrintVariant("not_a_sku"), "poster_framed");
  assert.equal(parsePrintVariant(null, "poster_unframed"), "poster_unframed");
});

test("isPrintVariant accepts all catalog ids", () => {
  for (const id of ["poster_framed", "poster_unframed", "canvas_wrap", "mug_11oz", "card_4x6"]) {
    assert.equal(isPrintVariant(id), true);
  }
  assert.equal(isPrintVariant("poster"), false);
});

test("paywall checkout rows expose canvas pilot; mug stays shop-only", () => {
  assert.equal(PAYWALL_PRINT_CHECKOUT_ROW_VARIANTS.includes("canvas_wrap"), true);
  assert.equal(PAYWALL_PRINT_CHECKOUT_ROW_VARIANTS.includes("mug_11oz"), false);
  assert.equal(PAYWALL_PRINT_CHECKOUT_ROW_VARIANTS.includes("card_4x6"), false);
  assert.deepEqual(PAYWALL_LIVE_PRINT_VARIANTS, ["poster_framed", "poster_unframed", "canvas_wrap"]);
});
