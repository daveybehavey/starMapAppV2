/**
 * Apparel size guides for merch families, shown at the editor's size-pick
 * step. Apparel is made to order and wrong-size orders are not refundable
 * (see the merch returns policy), so the measurements here must be EXACT —
 * they are transcribed verbatim from Printful, never estimated or converted
 * in code.
 *
 * Source (retrieved 2026-10-19): Printful Catalog API v2 size tables
 *   GET https://api.printful.com/v2/catalog-products/71/sizes
 *   GET https://api.printful.com/v2/catalog-products/71/sizes?unit=cm
 *   GET https://api.printful.com/v2/catalog-products/146/sizes
 *   GET https://api.printful.com/v2/catalog-products/146/sizes?unit=cm
 * "Garment Length / Width / Sleeve length" below are Printful's
 * `product_measure` table; "Fits chest" is Printful's `measure_yourself`
 * Chest range. The cm values are Printful's own published centimetre
 * table (the same endpoint with unit=cm) — no inch→cm conversion happens
 * anywhere in this codebase.
 *
 * Cross-checks (2026-10-19, all values agree):
 * - Printful's published Gildan 18500 guide ("Gildan 18500 Hoodie Review",
 *   printful.com blog): Length / Width / Sleeve length in inches match
 *   the API table exactly.
 * - Bella+Canvas's manufacturer spec sheet for the 3001: Body Length and
 *   Chest Width (laid flat) match the API table exactly.
 *
 * Only the sizes actually offered in the editor (see merchCatalog.ts,
 * S–3XL for both apparel families) are listed, even though Printful
 * publishes a wider range.
 */

import type { MerchFamilyId } from "@/lib/merchCatalog";

export type MerchSizeGuideRow = {
  size: string;
  /** Garment body length, high point shoulder to hem (Printful "Length"). */
  lengthIn: number;
  lengthCm: number;
  /** Garment chest width, measured laid flat (Printful "Width"). */
  chestWidthIn: number;
  chestWidthCm: number;
  /**
   * Sleeve length from centre back (Printful "Sleeve length").
   * Published for the hoodie only; Printful publishes no sleeve row
   * for the tee, so it stays absent there.
   */
  sleeveLengthIn?: number;
  sleeveLengthCm?: number;
  /** Body chest circumference the size fits (Printful "Chest"). */
  fitsChestMinIn: number;
  fitsChestMaxIn: number;
  fitsChestMinCm: number;
  fitsChestMaxCm: number;
};

export type MerchSizeGuide = {
  familyId: MerchFamilyId;
  printfulCatalogProductId: number;
  /** Human name of the blank, e.g. "Bella + Canvas 3001". */
  blankLabel: string;
  rows: readonly MerchSizeGuideRow[];
};

const TEE_GUIDE: MerchSizeGuide = {
  familyId: "tee_unisex_bc3001",
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
};

const HOODIE_GUIDE: MerchSizeGuide = {
  familyId: "hoodie_unisex_g18500",
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
};

export const MERCH_SIZE_GUIDES: Partial<Record<MerchFamilyId, MerchSizeGuide>> = {
  tee_unisex_bc3001: TEE_GUIDE,
  hoodie_unisex_g18500: HOODIE_GUIDE,
};

/** Size guide for a merch family, or null when the family has none (non-apparel). */
export function getMerchSizeGuide(familyId: MerchFamilyId): MerchSizeGuide | null {
  return MERCH_SIZE_GUIDES[familyId] ?? null;
}
