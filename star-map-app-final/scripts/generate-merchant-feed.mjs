#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com").replace(/\/+$/, "");
const CURRENCY = (process.env.NEXT_PUBLIC_CURRENCY || "usd").trim().toUpperCase();

function parseIntEnv(name, fallback) {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

const PRICE_SINGLE_CENTS = parseIntEnv("NEXT_PUBLIC_PRICE_SINGLE_CENTS", 900);
const PRINT_UNFRAMED_CENTS = parseIntEnv("NEXT_PUBLIC_PRINT_UNFRAMED_PRICE_CENTS", 4900);
const PRINT_FRAMED_CENTS = parseIntEnv("NEXT_PUBLIC_PRINT_FRAMED_PRICE_CENTS", 8900);
const PRINT_SHIPPING_CENTS = parseIntEnv("PRINT_STANDARD_SHIPPING_CENTS", 1399);

function formatPrice(amountCents) {
  return `${(amountCents / 100).toFixed(2)} ${CURRENCY}`;
}

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderItem(item) {
  const shippingLines = item.shipping
    ? [
        "<g:shipping>",
        `<g:country>${item.shipping.country}</g:country>`,
        `<g:price>${item.shipping.price}</g:price>`,
        "</g:shipping>",
      ]
    : [];
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
    ...shippingLines,
    `<g:identifier_exists>${item.identifierExists ? "yes" : "no"}</g:identifier_exists>`,
    `<g:brand>${escapeXml(item.brand)}</g:brand>`,
    "</item>",
  ]
    .filter(Boolean)
    .join("");
}

const baseDescription =
  "Create a custom star map of any date and location. Preview instantly, customize the design, and download or order a professional print.";

const items = [
  {
    id: "digital_single_hd",
    title: "Custom Star Map HD Download",
    description: `${baseDescription} Instant high-resolution digital download.`,
    link: `${SITE_URL}/personalized-star-map`,
    imageLink: `${SITE_URL}/blog/anniversary/anniversary-night-sky.jpg`,
    availability: "in_stock",
    condition: "new",
    price: formatPrice(PRICE_SINGLE_CENTS),
    productType: "Digital download",
    googleProductCategory: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Craft Supplies",
    identifierExists: false,
    brand: "StarMapCo",
    shipping: {
      country: "US",
      price: formatPrice(0),
    },
  },
  {
    id: "print_poster_unframed",
    title: "Custom Star Map Poster (Unframed)",
    description: `${baseDescription} Museum-grade unframed poster print.`,
    link: `${SITE_URL}/star-map-poster`,
    imageLink: `${SITE_URL}/blog/anniversary/framed-star-map.jpg`,
    availability: "in_stock",
    condition: "new",
    price: formatPrice(PRINT_UNFRAMED_CENTS),
    productType: "Print poster",
    googleProductCategory: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Craft Supplies",
    identifierExists: false,
    brand: "StarMapCo",
    shipping: {
      country: "US",
      price: formatPrice(PRINT_SHIPPING_CENTS),
    },
  },
  {
    id: "print_poster_framed",
    title: "Custom Star Map Framed Print",
    description: `${baseDescription} Framed print ready to hang.`,
    link: `${SITE_URL}/star-map-poster`,
    imageLink: `${SITE_URL}/blog/anniversary/couple-under-stars.jpg`,
    availability: "in_stock",
    condition: "new",
    price: formatPrice(PRINT_FRAMED_CENTS),
    productType: "Framed print",
    googleProductCategory: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Craft Supplies",
    identifierExists: false,
    brand: "StarMapCo",
    shipping: {
      country: "US",
      price: formatPrice(PRINT_SHIPPING_CENTS),
    },
  },
];

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

const outputDir = resolve(process.cwd(), "public");
mkdirSync(outputDir, { recursive: true });
writeFileSync(resolve(outputDir, "merchant-feed.xml"), body, "utf8");

console.log("Generated public/merchant-feed.xml");
