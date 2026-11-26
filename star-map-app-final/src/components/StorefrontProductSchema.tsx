import ProductSchema from "@/components/ProductSchema";
import { getStorefrontProductOffers } from "@/lib/storefrontProductOffers";

/** Metadata only: leaves the storefront and map renderer unchanged. */
export default function StorefrontProductSchema({
  name,
  siteUrl,
  digitalOnly = false,
  pagePath = "/personalized-star-map",
}: {
  name: string;
  siteUrl: string;
  digitalOnly?: boolean;
  /** Self-canonical path for Offer.url (must be indexable). */
  pagePath?: string;
}) {
  const base = siteUrl.replace(/\/$/, "");
  const path = pagePath.startsWith("/") ? pagePath : `/${pagePath}`;
  const offerLandingUrl = `${base}${path}`;
  return (
    <ProductSchema
      name={name}
      description="Personalized star map of the night sky from a chosen date and location. Create and approve a free preview before purchasing."
      imageUrl={`${base}/custom-star-map-anniversary.webp`}
      offers={getStorefrontProductOffers(siteUrl, digitalOnly, path)}
      offerLandingUrl={offerLandingUrl}
    />
  );
}
