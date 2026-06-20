#!/usr/bin/env node
/**
 * One-off probe: list all Printful v2 shipping tiers for US poster SKUs.
 * Does not write files or log secrets.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path) {
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // ignore missing file
  }
}

const envPaths = [
  resolve(process.cwd(), ".env.local"),
  resolve(process.cwd(), ".env"),
  "C:\\Users\\david\\dev\\starMapAppV2\\star-map-app-final\\.env.local",
];
for (const p of envPaths) loadEnvFile(p);

const API_BASE = "https://api.printful.com/v2/shipping-rates";
const TOKEN = process.env.PRINTFUL_API_TOKEN;
const STORE_ID = process.env.PRINTFUL_STORE_ID;
const UNFRAMED = process.env.PRINTFUL_VARIANT_ID_POSTER_UNFRAMED || "6242";
const FRAMED = process.env.PRINTFUL_VARIANT_ID_POSTER_FRAMED || "4654";

if (!TOKEN || !STORE_ID) {
  console.error("Missing PRINTFUL_API_TOKEN or PRINTFUL_STORE_ID (check .env.local).");
  process.exit(1);
}

async function fetchAllTiers(label, catalogVariantId) {
  const body = {
    recipient: { country_code: "US", state_code: "CA" },
    order_items: [{ source: "catalog", quantity: 1, catalog_variant_id: Number(catalogVariantId) }],
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

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${label} failed ${res.status}: ${text.slice(0, 400)}`);
  }

  const json = JSON.parse(text);
  const options = Array.isArray(json?.data) ? json.data : [];
  return options.map((opt) => ({
    shipping: opt.shipping,
    shipping_method_name: opt.shipping_method_name,
    rate: Number(opt.rate),
    currency: opt.currency || "USD",
    min_delivery_days: opt.min_delivery_days,
    max_delivery_days: opt.max_delivery_days,
  }));
}

async function main() {
  console.log("Printful US express probe (CA state)\n");
  for (const [label, variantId] of [
    ["poster_unframed", UNFRAMED],
    ["poster_framed", FRAMED],
  ]) {
    console.log(`=== ${label} (catalog_variant_id=${variantId}) ===`);
    const tiers = await fetchAllTiers(label, variantId);
    if (!tiers.length) {
      console.log("  NO OPTIONS RETURNED\n");
      continue;
    }
    for (const t of tiers) {
      console.log(
        `  ${t.shipping}: $${t.rate.toFixed(2)} ${t.currency} | transit ${t.min_delivery_days ?? "?"}–${t.max_delivery_days ?? "?"} business days | ${t.shipping_method_name ?? ""}`,
      );
    }
    const express = tiers.filter((t) => t.shipping !== "STANDARD" && !String(t.shipping).includes("CARBON"));
    const hasExpress = express.some((t) => /EXPRESS|PRIORITY|RUSH|FAST/i.test(String(t.shipping)));
    console.log(`  express-like tiers: ${express.map((t) => t.shipping).join(", ") || "none"}`);
    console.log(`  hasExpressCandidate: ${hasExpress}\n`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
