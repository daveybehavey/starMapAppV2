type CollectionPageSchemaItem = {
  name: string;
  path: string;
};

type CollectionPageSchemaProps = {
  name: string;
  description: string;
  path: string;
  items: CollectionPageSchemaItem[];
};

export default function CollectionPageSchema({
  name,
  description,
  path,
  items,
}: CollectionPageSchemaProps) {
  if (!items.length) return null;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com";
  const normalizedBase = siteUrl.replace(/\/$/, "");
  const toUrl = (input: string) => new URL(input, normalizedBase).toString();

  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url: toUrl(path),
    mainEntity: {
      "@type": "ItemList",
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      numberOfItems: items.length,
      itemListElement: items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: toUrl(item.path),
        name: item.name,
      })),
    },
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />;
}
