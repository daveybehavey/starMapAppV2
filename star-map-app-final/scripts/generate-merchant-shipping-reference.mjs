#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readWranglerVars } from "./wrangler-vars.mjs";

const wranglerVars = await readWranglerVars(process.cwd());
for (const [key, value] of Object.entries(wranglerVars)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
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

const shippingJsonPath = resolve(process.cwd(), "data", "printful-shipping.json");
const shippingData = JSON.parse(readFileSync(shippingJsonPath, "utf8"));
const allSupportedCountries = Array.isArray(shippingData?.countries)
  ? shippingData.countries
      .map((value) => String(value || "").trim().toUpperCase())
      .filter((value) => /^[A-Z]{2}$/.test(value))
  : ["US"];

const configuredFeedCountries = parseCountryListEnv(
  ["MERCHANT_FEED_COUNTRIES", "PRINT_ALLOWED_COUNTRIES", "NEXT_PUBLIC_PRINT_ALLOWED_COUNTRIES"],
  allSupportedCountries.length ? allSupportedCountries : ["US"],
);
const includeRestrictedCountries = parseBooleanEnv("MERCHANT_FEED_INCLUDE_RESTRICTED", false);
const restrictedCountries = includeRestrictedCountries
  ? []
  : parseCountryListEnv("MERCHANT_FEED_EXCLUDED_COUNTRIES", ["KR"]);
const restrictedSet = new Set(restrictedCountries);
const merchantCountries = uniqueCountries(
  configuredFeedCountries.filter((country) => !restrictedSet.has(country)),
);

const rows = [];
for (const country of merchantCountries) {
  const framed = shippingData?.poster_framed?.[country];
  const unframed = shippingData?.poster_unframed?.[country];
  if (!framed && !unframed) continue;
  rows.push({
    country,
    framedUsd: Number.isFinite(framed?.rate) ? Number(framed.rate).toFixed(2) : "",
    unframedUsd: Number.isFinite(unframed?.rate) ? Number(unframed.rate).toFixed(2) : "",
    framedWindow:
      typeof framed?.min_delivery_days === "number" && typeof framed?.max_delivery_days === "number"
        ? `${framed.min_delivery_days}-${framed.max_delivery_days}`
        : "",
    unframedWindow:
      typeof unframed?.min_delivery_days === "number" && typeof unframed?.max_delivery_days === "number"
        ? `${unframed.min_delivery_days}-${unframed.max_delivery_days}`
        : "",
  });
}

rows.sort((a, b) => a.country.localeCompare(b.country));

const header = [
  "country",
  "framed_shipping_usd",
  "unframed_shipping_usd",
  "framed_delivery_days",
  "unframed_delivery_days",
];
const csv = [header.join(",")]
  .concat(
    rows.map((row) =>
      [row.country, row.framedUsd, row.unframedUsd, row.framedWindow, row.unframedWindow].join(","),
    ),
  )
  .join("\n");

const outputDir = resolve(process.cwd(), "docs");
mkdirSync(outputDir, { recursive: true });
const outputPath = resolve(outputDir, "merchant-shipping-reference.csv");
writeFileSync(outputPath, `${csv}\n`, "utf8");

console.log(`Generated ${outputPath}`);
console.log(`Rows: ${rows.length}`);
if (restrictedCountries.length && !includeRestrictedCountries) {
  console.log(`Excluded countries: ${restrictedCountries.join(", ")}`);
}
