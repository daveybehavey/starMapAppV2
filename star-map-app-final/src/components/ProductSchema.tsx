import { getPricingTiers, getPrintPricingTiers } from "@/lib/pricing";

type ProductSchemaProps = {
  name: string;
  description: string;
  path: string;
  image?: string;
  category?: string;
  digitalOfferName?: string;
  unframedOfferName?: string;
  framedOfferName?: string;
};

export default function ProductSchema({
  name,
  description,
  path,
  image,
  category = "Personalized gifts",
  digitalOfferName = "Single HD download",
  unframedOfferName = "Unframed print",
  framedOfferName = "Framed print",
}: ProductSchemaProps) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
  const pricing = getPricingTiers();
  const printPricing = getPrintPricingTiers();
  const printCheckoutEnabled = /^(1|true|yes)$/i.test(
    (process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED || "").trim(),
  );
  const priceValidUntil = (() => {
    const now = new Date();
    const nextYear = new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate()));
    return nextYear.toISOString().slice(0, 10);
  })();

  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    brand: { "@type": "Brand", name: "StarMapCo" },
    category,
    url: `${siteUrl}${path}`,
    image: [image ?? `${siteUrl}/og-default.png`],
    additionalProperty: [
      {
        "@type": "PropertyValue",
        name: "Preview",
        value: "Free preview before payment",
      },
      {
        "@type": "PropertyValue",
        name: "Export resolution",
        value: "Up to 6000x6000 PNG",
      },
      {
        "@type": "PropertyValue",
        name: "Delivery",
        value: printCheckoutEnabled
          ? "Instant HD digital delivery plus optional framed or unframed print"
          : "Instant HD digital delivery",
      },
    ],
    offers: [
      {
        "@type": "Offer",
        name: digitalOfferName,
        priceCurrency: (pricing.single.currency || "USD").toUpperCase(),
        price: (pricing.single.amountCents / 100).toFixed(2),
        priceValidUntil,
        availability: "https://schema.org/InStock",
        url: `${siteUrl}/editor?mode=quick&source=schema-digital`,
      },
      ...(printCheckoutEnabled
        ? [
            {
              "@type": "Offer" as const,
              name: unframedOfferName,
              priceCurrency: (printPricing.poster_unframed.currency || "USD").toUpperCase(),
              price: (printPricing.poster_unframed.amountCents / 100).toFixed(2),
              priceValidUntil,
              availability: "https://schema.org/InStock",
              url: `${siteUrl}/editor?mode=quick&source=schema-print-unframed&checkout=print&print_variant=poster_unframed`,
            },
            {
              "@type": "Offer" as const,
              name: framedOfferName,
              priceCurrency: (printPricing.poster_framed.currency || "USD").toUpperCase(),
              price: (printPricing.poster_framed.amountCents / 100).toFixed(2),
              priceValidUntil,
              availability: "https://schema.org/InStock",
              url: `${siteUrl}/editor?mode=quick&source=schema-print-framed&checkout=print&print_variant=poster_framed`,
            },
          ]
        : []),
    ],
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />;
}
