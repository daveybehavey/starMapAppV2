import assert from "node:assert/strict";
import test from "node:test";
import {
  PAYWALL_LIVE_PRINT_VARIANTS,
  PAYWALL_PRINT_CHECKOUT_ROW_VARIANTS,
  isPrintVariant,
  parsePrintVariant,
} from "../../src/lib/printCatalog.mjs";

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

test("paywall checkout rows hide pilot SKUs until QA", () => {
  const pilot = ["canvas_wrap", "mug_11oz", "card_4x6"];
  for (const variant of pilot) {
    assert.equal(PAYWALL_PRINT_CHECKOUT_ROW_VARIANTS.includes(variant), false);
  }
  assert.deepEqual(PAYWALL_LIVE_PRINT_VARIANTS, ["poster_framed", "poster_unframed"]);
});
