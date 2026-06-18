/**
 * Pure catalog helpers for Node unit tests. Keep in sync with printCatalog.ts.
 * @typedef {"poster_unframed" | "poster_framed" | "canvas_wrap" | "mug_11oz" | "card_4x6"} PrintVariant
 */

/** @type {Set<string>} */
const VARIANT_SET = new Set([
  "poster_unframed",
  "poster_framed",
  "canvas_wrap",
  "mug_11oz",
  "card_4x6",
]);

/** @type {PrintVariant[]} */
export const PAYWALL_LIVE_PRINT_VARIANTS = ["poster_framed", "poster_unframed", "canvas_wrap"];

/** @type {PrintVariant[]} */
export const PAYWALL_PRINT_CHECKOUT_ROW_VARIANTS = [
  "poster_framed",
  "poster_framed",
  "poster_framed",
  "poster_unframed",
  "canvas_wrap",
];

/**
 * @param {unknown} raw
 * @param {PrintVariant} [fallback]
 * @returns {PrintVariant}
 */
export function parsePrintVariant(raw, fallback = "poster_framed") {
  return typeof raw === "string" && VARIANT_SET.has(raw) ? /** @type {PrintVariant} */ (raw) : fallback;
}

/**
 * @param {unknown} value
 * @returns {value is PrintVariant}
 */
export function isPrintVariant(value) {
  return typeof value === "string" && VARIANT_SET.has(value);
}
