import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getMerchFamily } from "../../src/lib/merchCatalog.ts";
import { getMerchSizeGuide, MERCH_SIZE_GUIDES } from "../../src/lib/merchSizeGuide.ts";

/**
 * The expected tables below are transcribed from Printful's Catalog API
 * v2 size tables (retrieved 2026-10-19):
 *   GET https://api.printful.com/v2/catalog-products/71/sizes (+ ?unit=cm)
 *   GET https://api.printful.com/v2/catalog-products/146/sizes (+ ?unit=cm)
 * "product_measure" gives Length / Width / Sleeve length; "measure_yourself"
 * gives the Chest fit range. The cm values are Printful's own published cm
 * table, NOT a conversion — if Printful republishes a value, update the
 * data module and this expectation together, from the API, never by hand.
 * Apparel is made to order and wrong-size orders are not refundable, so
 * these pins are the exactness guarantee for the customer-facing chart.
 */
const EXPECTED = {
  tee_unisex_bc3001: {
    printfulCatalogProductId: 71,
    blankLabel: "Bella + Canvas 3001",
    rows: [
      { size: "S", lengthIn: 28, lengthCm: 71.12, chestWidthIn: 18, chestWidthCm: 45.72, fitsChestMinIn: 34, fitsChestMaxIn: 37, fitsChestMinCm: 86.36, fitsChestMaxCm: 93.98 },
      { size: "M", lengthIn: 29, lengthCm: 73.66, chestWidthIn: 20, chestWidthCm: 50.8, fitsChestMinIn: 38, fitsChestMaxIn: 41, fitsChestMinCm: 96.52, fitsChestMaxCm: 104.14 },
      { size: "L", lengthIn: 30, lengthCm: 76.2, chestWidthIn: 22, chestWidthCm: 55.88, fitsChestMinIn: 42, fitsChestMaxIn: 45, fitsChestMinCm: 106.68, fitsChestMaxCm: 114.3 },
      { size: "XL", lengthIn: 31, lengthCm: 78.74, chestWidthIn: 24, chestWidthCm: 60.96, fitsChestMinIn: 46, fitsChestMaxIn: 49, fitsChestMinCm: 116.84, fitsChestMaxCm: 124.46 },
      { size: "2XL", lengthIn: 32, lengthCm: 81.28, chestWidthIn: 26, chestWidthCm: 66.04, fitsChestMinIn: 50, fitsChestMaxIn: 53, fitsChestMinCm: 127, fitsChestMaxCm: 134.62 },
      { size: "3XL", lengthIn: 33, lengthCm: 83.82, chestWidthIn: 28, chestWidthCm: 71.12, fitsChestMinIn: 54, fitsChestMaxIn: 57, fitsChestMinCm: 137.16, fitsChestMaxCm: 144.78 },
    ],
  },
  hoodie_unisex_g18500: {
    printfulCatalogProductId: 146,
    blankLabel: "Gildan 18500",
    rows: [
      { size: "S", lengthIn: 27, lengthCm: 68.58, chestWidthIn: 20, chestWidthCm: 50.8, sleeveLengthIn: 33.5, sleeveLengthCm: 85.09, fitsChestMinIn: 38, fitsChestMaxIn: 41, fitsChestMinCm: 96.52, fitsChestMaxCm: 104.14 },
      { size: "M", lengthIn: 28, lengthCm: 71.12, chestWidthIn: 22, chestWidthCm: 55.88, sleeveLengthIn: 34.5, sleeveLengthCm: 87.63, fitsChestMinIn: 42, fitsChestMaxIn: 45, fitsChestMinCm: 106.68, fitsChestMaxCm: 114.3 },
      { size: "L", lengthIn: 29, lengthCm: 73.66, chestWidthIn: 24, chestWidthCm: 60.96, sleeveLengthIn: 35.5, sleeveLengthCm: 90.17, fitsChestMinIn: 46, fitsChestMaxIn: 49, fitsChestMinCm: 116.84, fitsChestMaxCm: 124.46 },
      { size: "XL", lengthIn: 30, lengthCm: 76.2, chestWidthIn: 26, chestWidthCm: 66.04, sleeveLengthIn: 36.5, sleeveLengthCm: 92.71, fitsChestMinIn: 50, fitsChestMaxIn: 53, fitsChestMinCm: 127, fitsChestMaxCm: 134.62 },
      { size: "2XL", lengthIn: 31, lengthCm: 78.74, chestWidthIn: 28, chestWidthCm: 71.12, sleeveLengthIn: 37.5, sleeveLengthCm: 95.25, fitsChestMinIn: 54, fitsChestMaxIn: 57, fitsChestMinCm: 137.16, fitsChestMaxCm: 144.78 },
      { size: "3XL", lengthIn: 32, lengthCm: 81.28, chestWidthIn: 30, chestWidthCm: 76.2, sleeveLengthIn: 38.5, sleeveLengthCm: 97.79, fitsChestMinIn: 58, fitsChestMaxIn: 61, fitsChestMinCm: 147.32, fitsChestMaxCm: 154.94 },
    ],
  },
};

test("size guide data matches Printful's published tables exactly", () => {
  for (const [familyId, expected] of Object.entries(EXPECTED)) {
    const guide = getMerchSizeGuide(familyId);
    assert.ok(guide, `missing size guide for ${familyId}`);
    assert.equal(guide.printfulCatalogProductId, expected.printfulCatalogProductId);
    assert.equal(guide.blankLabel, expected.blankLabel);
    assert.deepEqual(
      guide.rows.map((row) => ({ ...row })),
      expected.rows,
      `${familyId} rows drifted from the sourced Printful table`
    );
  }
});

test("guide covers exactly the sizes the editor offers, no more, no fewer", () => {
  for (const familyId of Object.keys(EXPECTED)) {
    const guide = getMerchSizeGuide(familyId);
    const offered = getMerchFamily(familyId).options.size;
    assert.deepEqual(
      guide.rows.map((row) => row.size),
      offered,
      `${familyId}: guide sizes must equal merchCatalog options.size`
    );
  }
});

test("only the apparel families have a size guide", () => {
  assert.deepEqual(Object.keys(MERCH_SIZE_GUIDES).sort(), [
    "hoodie_unisex_g18500",
    "tee_unisex_bc3001",
  ]);
  for (const familyId of ["sticker_kisscut", "magnet_diecut", "pins_set"]) {
    assert.equal(getMerchSizeGuide(familyId), null, `${familyId} must not expose a size guide`);
  }
});

test("the tee guide has no sleeve column; the hoodie guide does", () => {
  const tee = getMerchSizeGuide("tee_unisex_bc3001");
  assert.ok(tee.rows.every((row) => row.sleeveLengthIn === undefined && row.sleeveLengthCm === undefined));
  const hoodie = getMerchSizeGuide("hoodie_unisex_g18500");
  assert.ok(hoodie.rows.every((row) => typeof row.sleeveLengthIn === "number" && typeof row.sleeveLengthCm === "number"));
});

test("editor size-pick step wires the size guide panel for guided families only", () => {
  const editor = readFileSync(new URL("../../src/components/EditorExperience.tsx", import.meta.url), "utf8");
  assert.match(editor, /import MerchSizeGuidePanel from "@\/components\/MerchSizeGuidePanel";/);
  assert.match(editor, /import \{ getMerchSizeGuide \} from "@\/lib\/merchSizeGuide";/);
  assert.match(editor, /getMerchSizeGuide\(family\.id\) \? \(/);
  assert.match(editor, /<MerchSizeGuidePanel family=\{family\} \/>/);

  const panel = readFileSync(new URL("../../src/components/MerchSizeGuidePanel.tsx", import.meta.url), "utf8");
  // Non-apparel families render nothing: the panel bails out on a null guide.
  assert.match(panel, /if \(!guide\) return null;/);
  // Both unit systems are offered, sourced from Printful's own tables.
  assert.match(panel, /Inches/);
  assert.match(panel, /CM/);
  // Printful's published tolerance note is part of the customer copy.
  assert.match(panel, /may vary by up to 2″ \(5 cm\)/);
});
