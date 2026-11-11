#!/usr/bin/env node

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { seedEnv } from "./merchant-shipping-common.mjs";
import ts from "typescript";

// Compile the two canonical pricing modules in memory so this build script
// works on all supported Node versions, without Next's alias resolver or
// duplicated price defaults. No generated source files are written.
function sourceModuleUrl(relativePath, replacements = {}) {
  let source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  for (const [specifier, url] of Object.entries(replacements)) {
    source = source.replaceAll(`"${specifier}"`, JSON.stringify(url));
  }
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}

const catalogUrl = sourceModuleUrl("../src/lib/printCatalog.ts");
const { PRINT_CATALOG } = await import(catalogUrl);
const { getPricingTiers, getPrintDigitalAddOnPrice } = await import(
  sourceModuleUrl("../src/lib/pricing.ts", { "@/lib/printCatalog": catalogUrl })
);

await seedEnv();

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

const digitalTiers = getPricingTiers();
const PRICE_SINGLE_CENTS = parseIntEnv(["NEXT_PUBLIC_PRICE_SINGLE_CENTS", "PRICE_SINGLE_CENTS"], digitalTiers.single.amountCents);
function printPrice(row) {
  return parseIntEnv([row.publicPriceEnv, row.priceEnv], row.priceFallbackCents);
}
const PRINT_UNFRAMED_CENTS = printPrice(PRINT_CATALOG.find(row => row.id === "poster_unframed"));
const PRINT_FRAMED_CENTS = printPrice(PRINT_CATALOG.find(row => row.id === "poster_framed"));
const PRINT_DIGITAL_ADDON_CENTS = parseIntEnv(
  ["NEXT_PUBLIC_PRINT_DIGITAL_ADDON_PRICE_CENTS", "PRINT_DIGITAL_ADDON_PRICE_CENTS"],
  getPrintDigitalAddOnPrice().amountCents,
);
const PRINT_FRAMED_HD_BUNDLE_CENTS = PRINT_FRAMED_CENTS + PRINT_DIGITAL_ADDON_CENTS;
const PRINT_FREE_SHIPPING_THRESHOLD_CENTS = parseIntEnv(
  ["PRINT_FREE_SHIPPING_THRESHOLD_CENTS", "NEXT_PUBLIC_PRINT_FREE_SHIPPING_THRESHOLD_CENTS"],
  8900,
);
// Checkout waives shipping once an order's merchandise subtotal clears the
// threshold, and a framed-only order is exactly the framed price — so when
// the framed price qualifies on its own (Lever B: $99 vs the $89 default),
// the standalone framed item must advertise $0 shipping in the feed, the
// same total checkout charges. Mirrors the framed + HD bundle rule below.
const PRINT_FRAMED_FREE_SHIPPING = PRINT_FRAMED_CENTS >= PRINT_FREE_SHIPPING_THRESHOLD_CENTS;
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
const includeDigitalInFeed = parseBooleanEnv("MERCHANT_FEED_INCLUDE_DIGITAL", true);
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
      const minHandlingTime =
        typeof entry.minHandlingTime === "number" && Number.isFinite(entry.minHandlingTime)
          ? Math.max(0, Math.floor(entry.minHandlingTime))
          : null;
      const maxHandlingTime =
        typeof entry.maxHandlingTime === "number" && Number.isFinite(entry.maxHandlingTime)
          ? Math.max(0, Math.floor(entry.maxHandlingTime))
          : null;
      const minTransitTime =
        typeof entry.minTransitTime === "number" && Number.isFinite(entry.minTransitTime)
          ? Math.max(0, Math.floor(entry.minTransitTime))
          : null;
      const maxTransitTime =
        typeof entry.maxTransitTime === "number" && Number.isFinite(entry.maxTransitTime)
          ? Math.max(0, Math.floor(entry.maxTransitTime))
          : null;
      shippingLines.push(
        "<g:shipping>",
        `<g:country>${entry.country}</g:country>`,
        `<g:price>${entry.price}</g:price>`,
        minHandlingTime !== null ? `<g:min_handling_time>${minHandlingTime}</g:min_handling_time>` : "",
        maxHandlingTime !== null ? `<g:max_handling_time>${maxHandlingTime}</g:max_handling_time>` : "",
        minTransitTime !== null ? `<g:min_transit_time>${minTransitTime}</g:min_transit_time>` : "",
        maxTransitTime !== null ? `<g:max_transit_time>${maxTransitTime}</g:max_transit_time>` : "",
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

const printBaseDescription =
  "Create a custom star map from any date and location, preview the design, and order a made-to-order wall art print from the approved artwork.";

const framedMockupPath = resolve(process.cwd(), "public", "printproof", "framed-mockup.jpg");
const unframedMockupPath = resolve(process.cwd(), "public", "printproof", "unframed-mockup.jpg");
const framedProofPath = resolve(process.cwd(), "public", "printproof", "framed-latest.png");
const unframedProofPath = resolve(process.cwd(), "public", "printproof", "unframed-latest.png");
const framedImageLink = existsSync(framedMockupPath)
  ? `${SITE_URL}/printproof/framed-mockup.jpg`
  : usePrintProofImages && existsSync(framedProofPath)
    ? `${SITE_URL}/printproof/framed-latest.png`
    : `${SITE_URL}/blog/anniversary/framed-star-map.jpg`;
const unframedImageLink = existsSync(unframedMockupPath)
  ? `${SITE_URL}/printproof/unframed-mockup.jpg`
  : usePrintProofImages && existsSync(unframedProofPath)
    ? `${SITE_URL}/printproof/unframed-latest.png`
    : `${SITE_URL}/blog/anniversary/framed-star-map.jpg`;

const PRINT_MIN_HANDLING_DAYS = parseIntEnv("MERCHANT_FEED_PRINT_MIN_HANDLING_DAYS", 1);
const PRINT_MAX_HANDLING_DAYS = parseIntEnv("MERCHANT_FEED_PRINT_MAX_HANDLING_DAYS", 3);
const PRINT_MIN_TRANSIT_DAYS = parseIntEnv("MERCHANT_FEED_PRINT_MIN_TRANSIT_DAYS", 3);
const PRINT_MAX_TRANSIT_DAYS = parseIntEnv("MERCHANT_FEED_PRINT_MAX_TRANSIT_DAYS", 9);

function withDeliveryDefaults(shippingEntry) {
  return {
    ...shippingEntry,
    minHandlingTime: PRINT_MIN_HANDLING_DAYS,
    maxHandlingTime: PRINT_MAX_HANDLING_DAYS,
    minTransitTime: PRINT_MIN_TRANSIT_DAYS,
    maxTransitTime: PRINT_MAX_TRANSIT_DAYS,
  };
}

const items = [
  ...(includeDigitalInFeed
    ? [
        ...[
          { id: "digital_single_hd", title: "Custom Star Map HD Download", cents: PRICE_SINGLE_CENTS, description: "One high-resolution digital download" },
        ].map(offer => ({
          id: offer.id,
          title: offer.title,
          description:
            `Create a custom star map from any date and location and preview the design. ${offer.description} — yours right after checkout.`,
          link: `${SITE_URL}/personalized-star-map`,
          imageLink: `${SITE_URL}/custom-star-map-anniversary.png`,
          additionalImageLinks: [`${SITE_URL}/examples/example-anniversary-heirloom.webp`],
          availability: "in_stock",
          condition: "new",
          price: formatPrice(offer.cents),
          productType: "Digital download",
          shippingLabel: "digital",
          googleProductCategory: "Software > Digital Goods & Currency > Digital Artwork",
          identifierExists: false,
          brand: "StarMapCo",
          shipping: shippingMap
            ? MERCHANT_FEED_COUNTRIES.map((country) => ({
                country,
                price: formatPrice(0),
              }))
            : [{ country: MERCHANT_FEED_COUNTRIES[0], price: formatPrice(0) }],
        })),
      ]
    : []),
  {
    id: "print_poster_unframed",
    title: "Custom Star Map Poster (Unframed)",
    description: `${printBaseDescription} Museum-grade unframed poster print.`,
    link: `${SITE_URL}/star-map-poster`,
    imageLink: unframedImageLink,
    additionalImageLinks: [framedImageLink, `${SITE_URL}/blog/anniversary/framed-star-map.jpg`],
    availability: "in_stock",
    condition: "new",
    price: formatPrice(PRINT_UNFRAMED_CENTS),
    productType: "Print poster",
    shippingLabel: "print_unframed",
    googleProductCategory: "Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork",
    identifierExists: false,
    brand: "StarMapCo",
    shipping: shippingMap
      ? MERCHANT_FEED_COUNTRIES
          .map((country) => {
            const rate = shippingMap.poster_unframed?.[country];
            return withDeliveryDefaults({
              country,
              price: formatShippingPrice(rate),
            });
          })
      : [{ country: MERCHANT_FEED_COUNTRIES[0], price: formatPrice(PRINT_SHIPPING_CENTS) }],
  },
  {
    id: "print_poster_framed",
    title: "Custom Star Map Framed Print",
    description: `${printBaseDescription} Framed print ready to hang.`,
    link: `${SITE_URL}/star-map-poster`,
    imageLink: framedImageLink,
    additionalImageLinks: [unframedImageLink, `${SITE_URL}/blog/anniversary/framed-star-map.jpg`],
    availability: "in_stock",
    condition: "new",
    price: formatPrice(PRINT_FRAMED_CENTS),
    productType: "Framed print",
    shippingLabel: "print_framed",
    googleProductCategory: "Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork",
    identifierExists: false,
    brand: "StarMapCo",
    shipping: shippingMap
      ? MERCHANT_FEED_COUNTRIES
          .map((country) => {
            const rate = shippingMap.poster_framed?.[country];
            return withDeliveryDefaults({
              country,
              price: PRINT_FRAMED_FREE_SHIPPING ? formatPrice(0) : formatShippingPrice(rate),
            });
          })
      : [{
          country: MERCHANT_FEED_COUNTRIES[0],
          price: PRINT_FRAMED_FREE_SHIPPING ? formatPrice(0) : formatPrice(PRINT_SHIPPING_CENTS),
        }],
  },
  ...(PRINT_FRAMED_HD_BUNDLE_CENTS >= PRINT_FREE_SHIPPING_THRESHOLD_CENTS
    ? [
        {
          id: "print_poster_framed_hd_bundle",
          title: "Custom Star Map Framed Print + HD Digital Download",
          description: `${printBaseDescription} Framed print with HD digital add-on. Free standard shipping on this bundle.`,
          // Bundle-specific crawlable landing (editor remains robots-disallowed).
          link: `${SITE_URL}/star-map-poster/framed-hd-bundle`,
          imageLink: framedImageLink,
          additionalImageLinks: [unframedImageLink, `${SITE_URL}/blog/anniversary/framed-star-map.jpg`],
          availability: "in_stock",
          condition: "new",
          price: formatPrice(PRINT_FRAMED_HD_BUNDLE_CENTS),
          productType: "Framed print bundle",
          shippingLabel: "print_framed_hd_free",
          googleProductCategory: "Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork",
          identifierExists: false,
          brand: "StarMapCo",
          shipping: MERCHANT_FEED_COUNTRIES.map((country) =>
            withDeliveryDefaults({
              country,
              price: formatPrice(0),
            }),
          ),
        },
      ]
    : []),
];

// Existing offers above retain their IDs, landing pages and shipping rules.
// The remaining catalogue rows use the same per-profile rates and threshold.
const productPresentation = {
  poster_unframed_16x16: { path: "/star-map-poster", image: unframedImageLink, type: "Print poster" },
  canvas_wrap: { path: "/shop", image: `${SITE_URL}/printproof/canvas-printful.jpg`, type: "Canvas print" },
  mug_11oz: { path: "/shop", image: `${SITE_URL}/printproof/gift-raw/mug/mug-printful.jpg`, type: "Mug" },
  card_4x6: { path: "/star-map-keepsake-card", image: `${SITE_URL}/printproof/gift-raw/card/card-mockup.jpg`, type: "Keepsake card" },
};
for (const row of PRINT_CATALOG) {
  if (["poster_unframed", "poster_framed"].includes(row.id)) continue;
  const presentation = productPresentation[row.id];
  if (!presentation) throw new Error(`Missing Merchant presentation for ${row.id}`);
  const cents = printPrice(row);
  const freeShipping = cents >= PRINT_FREE_SHIPPING_THRESHOLD_CENTS;
  items.push({
    id: `print_${row.id}`,
    title: `Custom Star Map ${row.labelFallback}`,
    description: `Create a custom star map from any date and location. ${row.labelFallback}, personalized with your approved artwork and made to order.`,
    link: `${SITE_URL}${presentation.path}`,
    imageLink: presentation.image,
    availability: "in_stock",
    condition: "new",
    price: formatPrice(cents),
    productType: presentation.type,
    shippingLabel: `print_${row.id}`,
    identifierExists: false,
    brand: "StarMapCo",
    shipping: shippingMap
      ? MERCHANT_FEED_COUNTRIES.map(country => withDeliveryDefaults({
          country,
          price: freeShipping ? formatPrice(0) : formatShippingPrice(shippingMap[row.shippingProfile]?.[country]),
        }))
      : [{ country: MERCHANT_FEED_COUNTRIES[0], price: formatPrice(freeShipping ? 0 : PRINT_SHIPPING_CENTS) }],
  });
}

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
