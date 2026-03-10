import { getPricingTiers, getPrintPricingTiers } from "@/lib/pricing";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com").replace(/\/+$/, "");
const CURRENCY = (process.env.NEXT_PUBLIC_CURRENCY || "usd").trim().toUpperCase();

type FeedItem = {
  id: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  availability: "in_stock" | "out_of_stock";
  condition: "new";
  price: string;
  productType: string;
  googleProductCategory?: string;
  identifierExists: boolean;
  brand: string;
};

function formatPrice(amountCents: number) {
  return `${(amountCents / 100).toFixed(2)} ${CURRENCY}`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderItem(item: FeedItem) {
  return [
    "<item>",
    `<g:id>${escapeXml(item.id)}</g:id>`,
    `<g:title>${escapeXml(item.title)}</g:title>`,
    `<g:description>${escapeXml(item.description)}</g:description>`,
    `<g:link>${escapeXml(item.link)}</g:link>`,
    `<g:image_link>${escapeXml(item.imageLink)}</g:image_link>`,
    `<g:availability>${item.availability}</g:availability>`,
    `<g:condition>${item.condition}</g:condition>`,
    `<g:price>${item.price}</g:price>`,
    `<g:product_type>${escapeXml(item.productType)}</g:product_type>`,
    item.googleProductCategory
      ? `<g:google_product_category>${escapeXml(item.googleProductCategory)}</g:google_product_category>`
      : "",
    `<g:identifier_exists>${item.identifierExists ? "yes" : "no"}</g:identifier_exists>`,
    `<g:brand>${escapeXml(item.brand)}</g:brand>`,
    "</item>",
  ]
    .filter(Boolean)
    .join("");
}

function buildItems(): FeedItem[] {
  const tiers = getPricingTiers();
  const printTiers = getPrintPricingTiers();

  const baseDescription =
    "Create a custom star map of any date and location. Preview instantly, customize the design, and download or order a professional print.";

  return [
    {
      id: "digital_single_hd",
      title: "Custom Star Map HD Download",
      description: `${baseDescription} Instant high-resolution digital download.`,
      link: `${SITE_URL}/personalized-star-map`,
      imageLink: `${SITE_URL}/examples/example-anniversary-heirloom.webp`,
      availability: "in_stock",
      condition: "new",
      price: formatPrice(tiers.single.amountCents),
      productType: "Digital download",
      googleProductCategory: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Craft Supplies",
      identifierExists: false,
      brand: "StarMapCo",
    },
    {
      id: "print_poster_unframed",
      title: "Custom Star Map Poster (Unframed)",
      description: `${baseDescription} Museum-grade unframed poster print.`,
      link: `${SITE_URL}/star-map-poster`,
      imageLink: `${SITE_URL}/examples/example-wedding-aurora-heart.webp`,
      availability: "in_stock",
      condition: "new",
      price: formatPrice(printTiers.poster_unframed.amountCents),
      productType: "Print poster",
      googleProductCategory: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Craft Supplies",
      identifierExists: false,
      brand: "StarMapCo",
    },
    {
      id: "print_poster_framed",
      title: "Custom Star Map Framed Print",
      description: `${baseDescription} Framed print ready to hang.`,
      link: `${SITE_URL}/star-map-poster`,
      imageLink: `${SITE_URL}/examples/example-memorial-starlace.webp`,
      availability: "in_stock",
      condition: "new",
      price: formatPrice(printTiers.poster_framed.amountCents),
      productType: "Framed print",
      googleProductCategory: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Craft Supplies",
      identifierExists: false,
      brand: "StarMapCo",
    },
  ];
}

export const revalidate = 3600;

export async function GET() {
  const items = buildItems();
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "<channel>",
    "<title>StarMapCo Product Feed</title>",
    `<link>${SITE_URL}</link>`,
    "<description>StarMapCo product feed for Google Merchant Center.</description>",
    ...items.map(renderItem),
    "</channel>",
    "</rss>",
  ].join("");

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
