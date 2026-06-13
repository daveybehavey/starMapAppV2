import assert from "node:assert/strict";
import test from "node:test";
import {
  cardRecipeFingerprintSuffix,
  getCard4x6ExportDimensions,
} from "./printCardExport.harness.mjs";

test("getCard4x6ExportDimensions uses 4:6 portrait ratio", () => {
  const dims = getCard4x6ExportDimensions(1200);
  assert.equal(dims.width, 1200);
  assert.equal(dims.height, 1800);
});

test("cardRecipeFingerprintSuffix tags card reuse index", () => {
  assert.equal(cardRecipeFingerprintSuffix("abc123"), "abc123:card_4x6");
});
