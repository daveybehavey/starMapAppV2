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
