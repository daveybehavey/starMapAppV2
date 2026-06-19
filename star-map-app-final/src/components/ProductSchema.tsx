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
};

export default function ProductSchema({ name, description, imageUrl, offers }: ProductSchemaProps) {
  if (!offers.length) return null;

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
    image: [imageUrl],
    category: "Personalized gifts",
    offers: offers.map((offer) => ({
      "@type": "Offer",
      name: offer.name,
      priceCurrency: offer.priceCurrency,
      price: offer.price,
      priceValidUntil,
      availability: "https://schema.org/InStock",
      url: offer.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
