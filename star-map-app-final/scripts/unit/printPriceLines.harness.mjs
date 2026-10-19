/**
 * Keep in sync with:
 * - src/lib/printCheckoutConfig.ts
 *   (getFramedHdBundlePriceLine, getFramedCardBundlePriceLine)
 * - src/lib/paywallPrintCheckout.ts
 *   (getPaywallPrintCheckoutPresentation secondaryLine composition,
 *    formatPosterShippingFootnote)
 * - src/lib/printFreeShipping.ts
 *   (getPrintMerchandiseSubtotalCents, qualifiesForPrintFreeShipping)
 *
 * Amounts are the code fallbacks: framed 9900, unframed 4900, canvas 5900,
 * card 1900 (src/lib/printCatalog.ts), HD add-on 700 (pricing), default
 * free-shipping threshold 10000 (printFreeShipping.ts). Shipping estimates
 * are the Canada row of data/printful-shipping.json (framed profile 1070,
 * unframed profile 533; canvas ships on the framed profile).
 */

export function formatPrice(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

export const TIER_CENTS = {
  poster_framed: 9900,
  poster_unframed: 4900,
  canvas_wrap: 5900,
  card_4x6: 1900,
};
export const HD_ADDON_CENTS = 700;
export const DEFAULT_THRESHOLD_CENTS = 10000;

const SHIPPING_PROFILE = {
  poster_framed: "poster_framed",
  poster_unframed: "poster_unframed",
  canvas_wrap: "poster_framed",
  card_4x6: "poster_unframed",
};
const CA_SHIPPING_CENTS = { poster_framed: 1070, poster_unframed: 533 };

export function getPrintMerchandiseSubtotalCents({ variant, includeDigitalAddOn, includeCardAddOn }) {
  let total = TIER_CENTS[variant];
  if (includeDigitalAddOn) total += HD_ADDON_CENTS;
  if (includeCardAddOn) total += TIER_CENTS.card_4x6;
  return total;
}

export function qualifiesForPrintFreeShipping(subtotal, threshold = DEFAULT_THRESHOLD_CENTS) {
  return subtotal >= threshold;
}

export function getFramedHdBundlePriceLine(threshold = DEFAULT_THRESHOLD_CENTS) {
  const subtotal = getPrintMerchandiseSubtotalCents({ variant: "poster_framed", includeDigitalAddOn: true });
  const total = formatPrice(subtotal);
  if (qualifiesForPrintFreeShipping(subtotal, threshold)) {
    return `${total} framed + HD · free shipping`;
  }
  return `${total} framed + HD digital`;
}

export function getFramedCardBundlePriceLine(threshold = DEFAULT_THRESHOLD_CENTS) {
  const subtotal = getPrintMerchandiseSubtotalCents({ variant: "poster_framed", includeCardAddOn: true });
  const total = formatPrice(subtotal);
  if (qualifiesForPrintFreeShipping(subtotal, threshold)) {
    return `${total} framed + card · free shipping`;
  }
  return `${total} framed + card`;
}

export function formatPrintShippingEstimate(variant) {
  return `${formatPrice(CA_SHIPPING_CENTS[SHIPPING_PROFILE[variant]])} shipping`;
}

/** Mirror of the secondaryLine composition in getPaywallPrintCheckoutPresentation (CA selected). */
export function paywallSecondaryLine(row, threshold = DEFAULT_THRESHOLD_CENTS) {
  const merchandiseSubtotalCents = getPrintMerchandiseSubtotalCents(row);
  const shippingLabel = qualifiesForPrintFreeShipping(merchandiseSubtotalCents, threshold)
    ? "free shipping"
    : formatPrintShippingEstimate(row.variant);
  const isBundleRow = Boolean(row.includeDigitalAddOn || row.includeCardAddOn);
  return isBundleRow
    ? `${formatPrice(merchandiseSubtotalCents)} · ${shippingLabel}`
    : [formatPrice(TIER_CENTS[row.variant]), shippingLabel].join(" + ");
}

export function formatPosterShippingFootnote(country) {
  if (!country) return null;
  const framed = formatPrintShippingEstimate("poster_framed");
  const unframed = formatPrintShippingEstimate("poster_unframed");
  return `framed print ${framed}, unframed poster ${unframed}`;
}
