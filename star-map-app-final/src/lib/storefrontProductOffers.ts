import { getPricingTiers, getPrintPricingTiers } from "@/lib/pricing";

/** Offers for the three formats shown by the storefront delivery module.
 * Read existing prices and the same public print-availability gate; never
 * advertise a disabled physical offer or treat the free preview as a product.
 *
 * Offer URLs point at the indexable landing (`pagePath`), not `/editor`
 * (robots-disallowed / noindex). Checkout still starts from on-page CTAs.
 */
export function getStorefrontProductOffers(
  siteUrl: string,
  digitalOnly = false,
  pagePath = "/personalized-star-map",
) {
  const baseUrl = siteUrl.replace(/\/$/, "");
  const path = pagePath.startsWith("/") ? pagePath : `/${pagePath}`;
  const landingUrl = `${baseUrl}${path}`;
  const digital = getPricingTiers().single;
  const printEnabled = /^(1|true|yes)$/i.test(
    (process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED || "").trim()
  );
  const offers = [{
    name: "HD digital download",
    price: (digital.amountCents / 100).toFixed(2),
    priceCurrency: digital.currency.toUpperCase(),
    url: landingUrl,
  }];
  if (!digitalOnly && printEnabled) {
    const prints = getPrintPricingTiers();
    for (const variant of ["poster_unframed", "poster_framed"] as const) {
      const tier = prints[variant];
      offers.push({
        name: tier.label,
        price: (tier.amountCents / 100).toFixed(2),
        priceCurrency: tier.currency.toUpperCase(),
        url: landingUrl,
      });
    }
  }
  return offers;
}
