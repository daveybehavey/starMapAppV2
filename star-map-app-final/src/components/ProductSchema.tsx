type ProductOffer = {
  name: string;
  price: string;
  priceCurrency: string;
  url: string;
};

type ProductSchemaProps = {
  name: string;
  description: string;
  imageUrl: string;
  offers: ProductOffer[];
  /**
   * Indexable landing URL for Offer.url when an offer still points at /editor
   * (robots-disallowed). Prefer passing the page's self-canonical URL.
   */
  offerLandingUrl?: string;
};

function resolveOfferUrl(offerUrl: string, offerLandingUrl?: string) {
  if (!offerLandingUrl) return offerUrl;
  try {
    const parsed = new URL(offerUrl, offerLandingUrl);
    if (parsed.pathname === "/editor" || parsed.pathname.startsWith("/editor/")) {
      return offerLandingUrl;
    }
  } catch {
    if (offerUrl.includes("/editor")) return offerLandingUrl;
  }
  return offerUrl;
}

export default function ProductSchema({
  name,
  description,
  imageUrl,
  offers,
  offerLandingUrl,
}: ProductSchemaProps) {
  if (!offers.length) return null;

  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    brand: { "@type": "Brand", name: "StarMapCo" },
    image: [imageUrl],
    category: "Personalized gifts",
    offers: offers.map((offer) => ({
      "@type": "Offer",
      name: offer.name,
      priceCurrency: offer.priceCurrency,
      price: offer.price,
      availability: "https://schema.org/InStock",
      url: resolveOfferUrl(offer.url, offerLandingUrl),
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
