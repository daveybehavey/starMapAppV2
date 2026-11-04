import ProductSchema from "@/components/ProductSchema";
import { getStorefrontProductOffers } from "@/lib/storefrontProductOffers";

/** Metadata only: leaves the storefront and map renderer unchanged. */
export default function StorefrontProductSchema({
  name,
  siteUrl,
  digitalOnly = false,
}: {
  name: string;
  siteUrl: string;
  digitalOnly?: boolean;
}) {
  return (
    <ProductSchema
      name={name}
      description="Personalized star map of the night sky from a chosen date and location. Create and approve a free preview before purchasing."
      imageUrl={`${siteUrl.replace(/\/$/, "")}/custom-star-map-anniversary.webp`}
      offers={getStorefrontProductOffers(siteUrl, digitalOnly)}
    />
  );
}
