import assert from "node:assert/strict";
import test from "node:test";
import { isPrintVariant, parsePrintVariant, PRINT_VARIANT_IDS } from "./printCatalogVariant.mjs";

test("parsePrintVariant accepts every catalog SKU", () => {
  for (const id of PRINT_VARIANT_IDS) {
    assert.equal(parsePrintVariant(id), id);
    assert.equal(isPrintVariant(id), true);
  }
});

test("parsePrintVariant does not coerce card_4x6 to poster_framed", () => {
  assert.equal(parsePrintVariant("card_4x6"), "card_4x6");
  assert.notEqual(parsePrintVariant("card_4x6"), "poster_framed");
});

test("parsePrintVariant falls back for unknown values", () => {
  assert.equal(parsePrintVariant("greeting_card"), "poster_framed");
  assert.equal(parsePrintVariant(null, "poster_unframed"), "poster_unframed");
  assert.equal(isPrintVariant("poster_framed_extra"), false);
});
