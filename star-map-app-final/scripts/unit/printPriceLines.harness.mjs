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
 * free-shipping threshold 8900 (printFreeShipping.ts, Lever B). Shipping
 * estimates are the Canada and US rows of data/printful-shipping.json
 * (framed profile CA 1077 / US 984, unframed profile CA 517 / US 449,
 * canvas profile CA 1712 / US 1005 — canvas has its own profile).
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
export const DEFAULT_THRESHOLD_CENTS = 8900;

const SHIPPING_PROFILE = {
  poster_framed: "poster_framed",
  poster_unframed: "poster_unframed",
  canvas_wrap: "canvas_wrap",
  card_4x6: "poster_unframed",
};
const SHIPPING_CENTS_BY_COUNTRY = {
  CA: { poster_framed: 1077, poster_unframed: 517, canvas_wrap: 1712 },
  US: { poster_framed: 984, poster_unframed: 449, canvas_wrap: 1005 },
};

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

export function formatPrintShippingEstimate(variant, country = "CA") {
  const rates = SHIPPING_CENTS_BY_COUNTRY[country] ?? SHIPPING_CENTS_BY_COUNTRY.CA;
  return `${formatPrice(rates[SHIPPING_PROFILE[variant]])} shipping`;
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
  // Mirror of src: a framed-only order qualifies on its own at the Lever B
  // threshold, so the framed segment reads "free shipping", not a charge.
  const framed = qualifiesForPrintFreeShipping(
    getPrintMerchandiseSubtotalCents({ variant: "poster_framed" }),
  )
    ? "free shipping"
    : formatPrintShippingEstimate("poster_framed", country);
  const unframed = formatPrintShippingEstimate("poster_unframed", country);
  return `framed print ${framed}, unframed poster ${unframed}`;
}
