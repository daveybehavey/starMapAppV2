/**
 * Mirrors parsePrintVariant / isPrintVariant from src/lib/printCatalog.ts for node --test.
 * Keep PRINT_VARIANT_IDS in sync with PRINT_CATALOG in printCatalog.ts.
 */

/** @type {readonly string[]} */
export const PRINT_VARIANT_IDS = [
  "poster_unframed",
  "poster_framed",
  "canvas_wrap",
  "mug_11oz",
  "card_4x6",
];

const VARIANT_SET = new Set(PRINT_VARIANT_IDS);

/**
 * @param {unknown} value
 */
export function isPrintVariant(value) {
  return typeof value === "string" && VARIANT_SET.has(value);
}

/**
 * @param {unknown} raw
 * @param {string} [fallback]
 */
export function parsePrintVariant(raw, fallback = "poster_framed") {
  return isPrintVariant(raw) ? raw : fallback;
}
