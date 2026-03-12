#!/usr/bin/env node

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { readWranglerVars } from "./wrangler-vars.mjs";

const wranglerVars = await readWranglerVars(process.cwd());
for (const [key, value] of Object.entries(wranglerVars)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com").replace(/\/+$/, "");
const CURRENCY = (process.env.NEXT_PUBLIC_CURRENCY || "usd").trim().toUpperCase();
// Keep known GMC currency-unsupported markets out of the feed unless we build native-currency support.
const HARD_EXCLUDED_COUNTRIES = new Set(["KR"]);

function parseIntEnv(names, fallback) {
  const keys = Array.isArray(names) ? names : [names];
  for (const key of keys) {
    const raw = process.env[key];
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseCountryListEnv(names, fallback = ["US"]) {
  const keys = Array.isArray(names) ? names : [names];
  for (const key of keys) {
    const raw = process.env[key];
    if (!raw) continue;
    const parsed = raw
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter((value) => /^[A-Z]{2}$/.test(value));
    if (parsed.length > 0) return parsed;
  }
  return fallback;
}

function parseBooleanEnv(names, fallback = false) {
  const keys = Array.isArray(names) ? names : [names];
  for (const key of keys) {
    const raw = process.env[key];
    if (!raw || !raw.trim()) continue;
    const normalized = raw.trim().toLowerCase();
    if (["1", "true", "yes"].includes(normalized)) return true;
    if (["0", "false", "no"].includes(normalized)) return false;
  }
  return fallback;
}

function uniqueCountries(countries) {
  return Array.from(new Set(countries.filter((value) => /^[A-Z]{2}$/.test(value))));
}

const PRICE_SINGLE_CENTS = parseIntEnv(["NEXT_PUBLIC_PRICE_SINGLE_CENTS", "PRICE_SINGLE_CENTS"], 900);
const PRINT_UNFRAMED_CENTS = parseIntEnv(
  ["NEXT_PUBLIC_PRINT_UNFRAMED_PRICE_CENTS", "PRINT_UNFRAMED_PRICE_CENTS"],
  4900,
);
const PRINT_FRAMED_CENTS = parseIntEnv(
  ["NEXT_PUBLIC_PRINT_FRAMED_PRICE_CENTS", "PRINT_FRAMED_PRICE_CENTS"],
  9900,
);
const PRINT_SHIPPING_CENTS = parseIntEnv("PRINT_STANDARD_SHIPPING_CENTS", 1399);
let shippingMap = null;
try {
  const shippingRaw = readFileSync(resolve(process.cwd(), "data", "printful-shipping.json"), "utf8");
  shippingMap = JSON.parse(shippingRaw);
} catch {
  shippingMap = null;
}

const supportedCountriesFromMap = Array.isArray(shippingMap?.countries)
  ? shippingMap.countries
      .map((value) => String(value || "").trim().toUpperCase())
      .filter((value) => /^[A-Z]{2}$/.test(value))
  : [];

const configuredFeedCountries = parseCountryListEnv(
  ["MERCHANT_FEED_COUNTRIES", "PRINT_ALLOWED_COUNTRIES", "NEXT_PUBLIC_PRINT_ALLOWED_COUNTRIES"],
  supportedCountriesFromMap.length ? supportedCountriesFromMap : ["US"],
);
const includeRestrictedCountries = parseBooleanEnv("MERCHANT_FEED_INCLUDE_RESTRICTED", false);
const usePrintProofImages = parseBooleanEnv("MERCHANT_FEED_USE_PRINT_PROOF_IMAGES", false);
const restrictedCountries = includeRestrictedCountries
  ? []
  : parseCountryListEnv("MERCHANT_FEED_EXCLUDED_COUNTRIES", ["KR"]);
const MERCHANT_FEED_COUNTRIES = (() => {
  const restrictedSet = new Set([...restrictedCountries, ...HARD_EXCLUDED_COUNTRIES]);
  const filtered = uniqueCountries(
    configuredFeedCountries.filter((country) => !restrictedSet.has(country)),
  );
  return filtered.length ? filtered : ["US"];
})();

function formatPrice(amountCents) {
  return `${(amountCents / 100).toFixed(2)} ${CURRENCY}`;
}

function formatShippingPrice(rate) {
  const rateCurrency = String(rate?.currency || "").trim().toUpperCase();
  if (typeof rate?.rate === "number" && Number.isFinite(rate.rate) && rateCurrency === CURRENCY) {
    return `${rate.rate.toFixed(2)} ${CURRENCY}`;
  }
  return formatPrice(PRINT_SHIPPING_CENTS);
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
  const additionalImages = Array.isArray(item.additionalImageLinks)
    ? item.additionalImageLinks
        .filter((value) => typeof value === "string" && value.trim().length > 0)
        .map((value) => `<g:additional_image_link>${escapeXml(value)}</g:additional_image_link>`)
    : [];
  const shippingLines = [];
  if (Array.isArray(item.shipping)) {
    for (const entry of item.shipping) {
      shippingLines.push(
        "<g:shipping>",
        `<g:country>${entry.country}</g:country>`,
        `<g:price>${entry.price}</g:price>`,
        "</g:shipping>",
      );
    }
  }
  return [
    "<item>",
    `<g:id>${escapeXml(item.id)}</g:id>`,
    `<g:title>${escapeXml(item.title)}</g:title>`,
    `<g:description>${escapeXml(item.description)}</g:description>`,
    `<g:link>${escapeXml(item.link)}</g:link>`,
    `<g:image_link>${escapeXml(item.imageLink)}</g:image_link>`,
    ...additionalImages,
    `<g:availability>${item.availability}</g:availability>`,
    `<g:condition>${item.condition}</g:condition>`,
    `<g:price>${item.price}</g:price>`,
    `<g:product_type>${escapeXml(item.productType)}</g:product_type>`,
    item.shippingLabel ? `<g:shipping_label>${escapeXml(item.shippingLabel)}</g:shipping_label>` : "",
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

const framedProofPath = resolve(process.cwd(), "public", "printproof", "framed-latest.png");
const unframedProofPath = resolve(process.cwd(), "public", "printproof", "unframed-latest.png");
const framedImageLink = usePrintProofImages && existsSync(framedProofPath)
  ? `${SITE_URL}/printproof/framed-latest.png`
  : `${SITE_URL}/blog/anniversary/framed-star-map.jpg`;
const unframedImageLink = usePrintProofImages && existsSync(unframedProofPath)
  ? `${SITE_URL}/printproof/unframed-latest.png`
  : `${SITE_URL}/examples/example-wedding-aurora-heart.webp`;

const items = [
  {
    id: "digital_single_hd",
    title: "Custom Star Map HD Download",
    description: `${baseDescription} Instant high-resolution digital download.`,
    link: `${SITE_URL}/personalized-star-map`,
    imageLink: `${SITE_URL}/custom-star-map-anniversary.png`,
    additionalImageLinks: [`${SITE_URL}/examples/example-anniversary-heirloom.webp`],
    availability: "in_stock",
    condition: "new",
    price: formatPrice(PRICE_SINGLE_CENTS),
    productType: "Digital download",
    shippingLabel: "digital",
    googleProductCategory: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Craft Supplies",
    identifierExists: false,
    brand: "StarMapCo",
    shipping: shippingMap
      ? MERCHANT_FEED_COUNTRIES.map((country) => ({
          country,
          price: formatPrice(0),
        }))
      : [{ country: MERCHANT_FEED_COUNTRIES[0], price: formatPrice(0) }],
  },
  {
    id: "print_poster_unframed",
    title: "Custom Star Map Poster (Unframed)",
    description: `${baseDescription} Museum-grade unframed poster print.`,
    link: `${SITE_URL}/star-map-poster`,
    imageLink: unframedImageLink,
    additionalImageLinks: [`${SITE_URL}/custom-star-map-anniversary.png`],
    availability: "in_stock",
    condition: "new",
    price: formatPrice(PRINT_UNFRAMED_CENTS),
    productType: "Print poster",
    shippingLabel: "print",
    googleProductCategory: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Craft Supplies",
    identifierExists: false,
    brand: "StarMapCo",
    shipping: shippingMap
      ? MERCHANT_FEED_COUNTRIES
          .map((country) => {
            const rate = shippingMap.poster_unframed?.[country];
            return {
              country,
              price: formatShippingPrice(rate),
            };
          })
      : [{ country: MERCHANT_FEED_COUNTRIES[0], price: formatPrice(PRINT_SHIPPING_CENTS) }],
  },
  {
    id: "print_poster_framed",
    title: "Custom Star Map Framed Print",
    description: `${baseDescription} Framed print ready to hang.`,
    link: `${SITE_URL}/star-map-poster`,
    imageLink: framedImageLink,
    additionalImageLinks: [`${SITE_URL}/custom-star-map-anniversary.png`],
    availability: "in_stock",
    condition: "new",
    price: formatPrice(PRINT_FRAMED_CENTS),
    productType: "Framed print",
    shippingLabel: "print",
    googleProductCategory: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Craft Supplies",
    identifierExists: false,
    brand: "StarMapCo",
    shipping: shippingMap
      ? MERCHANT_FEED_COUNTRIES
          .map((country) => {
            const rate = shippingMap.poster_framed?.[country];
            return {
              country,
              price: formatShippingPrice(rate),
            };
          })
      : [{ country: MERCHANT_FEED_COUNTRIES[0], price: formatPrice(PRINT_SHIPPING_CENTS) }],
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
console.log(`Merchant feed countries: ${MERCHANT_FEED_COUNTRIES.join(", ")}`);
if (restrictedCountries.length && !includeRestrictedCountries) {
  console.log(`Excluded countries: ${restrictedCountries.join(", ")}`);
}
