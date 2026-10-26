/**
 * Keep in sync with:
 * - src/lib/pricing.ts (formatPrice — incl. the currency-code suffix,
 *   sweep U03: every rendered price names its currency, "$49.00 USD")
 * - src/lib/printCheckoutConfig.ts
 *   (getFramedHdBundlePriceLine, getFramedCardBundlePriceLine)
 * - src/lib/paywallPrintCheckout.ts
 *   (getPaywallPrintCheckoutPresentation secondaryLine composition,
 *    formatPosterShippingFootnote)
 * - src/lib/printFreeShipping.ts
 *   (getPrintMerchandiseSubtotalCents, qualifiesForPrintFreeShipping)
 *
 * Amounts are the code fallbacks: framed 9900, unframed 4900, canvas 7900,
 * card 1900 (src/lib/printCatalog.ts), HD add-on 700 (pricing), default
 * free-shipping threshold 10000 (printFreeShipping.ts). Shipping estimates
 * are the Canada row of data/printful-shipping.json (framed profile 1077,
 * unframed profile 517, canvas profile 1712 — canvas has its own profile).
 */

export function formatPrice(cents, currency = "USD") {
  const code = (currency || "USD").toUpperCase();
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return `${formatted} ${code}`;
}

export const TIER_CENTS = {
  poster_framed: 9900,
  poster_unframed: 4900,
  canvas_wrap: 7900,
  card_4x6: 1900,
};
export const HD_ADDON_CENTS = 700;
export const DEFAULT_THRESHOLD_CENTS = 10000;

const SHIPPING_PROFILE = {
  poster_framed: "poster_framed",
  poster_unframed: "poster_unframed",
  canvas_wrap: "canvas_wrap",
  card_4x6: "poster_unframed",
};
const CA_SHIPPING_CENTS = { poster_framed: 1077, poster_unframed: 517, canvas_wrap: 1712 };

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
