#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const API_BASE = "https://api.printful.com/v2/shipping-rates";
const TOKEN = process.env.PRINTFUL_API_TOKEN;
const STORE_ID = process.env.PRINTFUL_STORE_ID;
const UNFRAMED = process.env.PRINTFUL_VARIANT_ID_POSTER_UNFRAMED;
const FRAMED = process.env.PRINTFUL_VARIANT_ID_POSTER_FRAMED;

if (!TOKEN || !STORE_ID || !UNFRAMED || !FRAMED) {
  console.error("Missing PRINTFUL_API_TOKEN, PRINTFUL_STORE_ID, or variant IDs.");
  process.exit(1);
}

const DEFAULT_COUNTRIES = [
  "US",
  "CA",
  "GB",
  "IE",
  "AU",
  "NZ",
  "DE",
  "FR",
  "ES",
  "IT",
  "NL",
  "BE",
  "SE",
  "NO",
  "DK",
  "FI",
  "CH",
  "AT",
  "PT",
  "PL",
  "CZ",
  "RO",
  "HU",
  "GR",
  "SG",
  "JP",
  "MX",
  "BR",
  "AR",
  "CL",
  "CO",
  "PE",
  "UY",
  "PA",
  "CR",
  "DO",
  "PR",
  "IN",
  "PH",
  "TH",
  "MY",
  "ID",
  "VN",
  "KR",
  "TW",
  "HK",
  "CN",
  "TR",
  "ZA",
  "MA",
  "NG",
  "KE",
  "GH",
  "UG",
  "BD",
  "LK",
  "NP",
  "RS",
  "HR",
  "SI",
  "SK",
  "LT",
  "LV",
  "EE",
  "LU",
  "IS",
  "MT",
  "CY",
  "AL",
  "BA",
  "MK",
  "MD",
  "GE",
  "AZ",
];

function parseCountries(raw) {
  const parsed = String(raw || "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^[A-Z]{2}$/.test(value));
  return [...new Set(parsed)];
}

const COUNTRIES = parseCountries(process.env.PRINTFUL_SHIPPING_COUNTRIES);
const TARGET_COUNTRIES = COUNTRIES.length ? COUNTRIES : DEFAULT_COUNTRIES;

const STATE_BY_COUNTRY = {
  US: "CA",
  CA: "ON",
  AU: "NSW",
  JP: "13",
  BR: "SP",
  MX: "CMX",
  IN: "DL",
};

async function fetchRates(countryCode, catalogVariantId) {
  const recipient = { country_code: countryCode };
  if (STATE_BY_COUNTRY[countryCode]) {
    recipient.state_code = STATE_BY_COUNTRY[countryCode];
  }
  const body = {
    recipient,
    order_items: [
      {
        source: "catalog",
        quantity: 1,
        catalog_variant_id: Number(catalogVariantId),
      },
    ],
    currency: "USD",
  };

  const res = await fetch(API_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "X-PF-Store-Id": STORE_ID,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Printful shipping rates failed (${countryCode}): ${res.status} ${text}`);
  }

  const json = await res.json();
  const options = Array.isArray(json?.data) ? json.data : [];
  const standard = options.find((opt) => opt.shipping === "STANDARD") || options[0];
  if (!standard) {
    throw new Error(`No shipping options for ${countryCode}`);
  }
  return {
    rate: Number(standard.rate),
    currency: standard.currency || "USD",
    min_delivery_days: standard.min_delivery_days,
    max_delivery_days: standard.max_delivery_days,
  };
}

async function buildMap(label, variantId) {
  const out = {};
  for (const country of TARGET_COUNTRIES) {
    try {
      const rate = await fetchRates(country, variantId);
      out[country] = rate;
    } catch (error) {
      console.error(
        `Skipping ${label} ${country}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  return out;
}

async function main() {
  const posterUnframed = await buildMap("poster_unframed", UNFRAMED);
  const posterFramed = await buildMap("poster_framed", FRAMED);

  const supportedCountries = TARGET_COUNTRIES.filter(
    (country) => posterUnframed[country] && posterFramed[country],
  );

  const output = {
    currency: "USD",
    countries: supportedCountries,
    poster_unframed: posterUnframed,
    poster_framed: posterFramed,
  };

  const outputPath = resolve(process.cwd(), "data", "printful-shipping.json");
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Saved ${outputPath} (${supportedCountries.length} countries)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
