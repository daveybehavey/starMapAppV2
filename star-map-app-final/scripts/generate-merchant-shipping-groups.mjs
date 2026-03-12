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

function groupByRate(countryList, rateMap) {
  const groups = new Map();
  for (const country of countryList) {
    const rate = rateMap?.[country];
    if (!rate || typeof rate.rate !== "number") continue;
    const key = `${Number(rate.rate).toFixed(2)}|${rate.min_delivery_days ?? ""}-${rate.max_delivery_days ?? ""}`;
    if (!groups.has(key)) {
      groups.set(key, {
        shippingUsd: Number(rate.rate).toFixed(2),
        deliveryDays:
          typeof rate.min_delivery_days === "number" && typeof rate.max_delivery_days === "number"
            ? `${rate.min_delivery_days}-${rate.max_delivery_days}`
            : "",
        countries: [],
      });
    }
    groups.get(key).countries.push(country);
  }
  return Array.from(groups.values())
    .map((entry) => ({ ...entry, countries: entry.countries.sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => Number.parseFloat(a.shippingUsd) - Number.parseFloat(b.shippingUsd));
}

const shipping = JSON.parse(readFileSync(resolve(process.cwd(), "data", "printful-shipping.json"), "utf8"));
const configuredFeedCountries = parseCountryListEnv(
  ["MERCHANT_FEED_COUNTRIES", "PRINT_ALLOWED_COUNTRIES", "NEXT_PUBLIC_PRINT_ALLOWED_COUNTRIES"],
  Array.isArray(shipping?.countries) ? shipping.countries : ["US"],
);
const includeRestrictedCountries = parseBooleanEnv("MERCHANT_FEED_INCLUDE_RESTRICTED", false);
const restrictedCountries = includeRestrictedCountries
  ? []
  : parseCountryListEnv("MERCHANT_FEED_EXCLUDED_COUNTRIES", ["KR"]);
const restrictedSet = new Set(restrictedCountries);
const countries = uniqueCountries(configuredFeedCountries.filter((country) => !restrictedSet.has(country)));

const framedGroups = groupByRate(countries, shipping?.poster_framed);
const unframedGroups = groupByRate(countries, shipping?.poster_unframed);

const lines = [];
lines.push("# Merchant Shipping Groups");
lines.push("");
lines.push("Generated from `data/printful-shipping.json` for quick Merchant Center service setup.");
lines.push("");
lines.push(`- Countries: ${countries.length}`);
if (restrictedCountries.length && !includeRestrictedCountries) {
  lines.push(`- Excluded: ${restrictedCountries.join(", ")}`);
}
lines.push("- Currency: USD");
lines.push("");
lines.push("## Print (shipping_label=print) — framed");
lines.push("");
lines.push("| Shipping (USD) | Delivery (days) | Countries |");
lines.push("| --- | --- | --- |");
for (const group of framedGroups) {
  lines.push(`| ${group.shippingUsd} | ${group.deliveryDays || "-"} | ${group.countries.join(", ")} |`);
}
lines.push("");
lines.push("## Print (shipping_label=print) — unframed");
lines.push("");
lines.push("| Shipping (USD) | Delivery (days) | Countries |");
lines.push("| --- | --- | --- |");
for (const group of unframedGroups) {
  lines.push(`| ${group.shippingUsd} | ${group.deliveryDays || "-"} | ${group.countries.join(", ")} |`);
}
lines.push("");
lines.push("## Digital (shipping_label=digital)");
lines.push("");
lines.push("- Shipping rate: `0.00 USD`");
lines.push(`- Countries: ${countries.join(", ")}`);
lines.push("");

const outputDir = resolve(process.cwd(), "docs");
mkdirSync(outputDir, { recursive: true });
const outputPath = resolve(outputDir, "merchant-shipping-groups.md");
writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Generated ${outputPath}`);
console.log(`Framed groups: ${framedGroups.length}`);
console.log(`Unframed groups: ${unframedGroups.length}`);
