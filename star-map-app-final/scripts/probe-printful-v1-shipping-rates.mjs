#!/usr/bin/env node
/** Probe Printful v1 /shipping/rates for US poster SKUs (poster fulfillment path). */
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
    // ignore
  }
}

for (const p of [
  resolve(process.cwd(), ".env.local"),
  "C:\\Users\\david\\dev\\starMapAppV2\\star-map-app-final\\.env.local",
]) {
  loadEnvFile(p);
}

const TOKEN = process.env.PRINTFUL_API_TOKEN;
const STORE_ID = process.env.PRINTFUL_STORE_ID;
const UNFRAMED = process.env.PRINTFUL_VARIANT_ID_POSTER_UNFRAMED || "6242";
const FRAMED = process.env.PRINTFUL_VARIANT_ID_POSTER_FRAMED || "4654";
const BASE = (process.env.PRINTFUL_API_BASE_URL || "https://api.printful.com").replace(/\/+$/, "");

if (!TOKEN) {
  console.error("Missing PRINTFUL_API_TOKEN");
  process.exit(1);
}

async function fetchV1Rates(label, variantId) {
  const body = {
    recipient: {
      country_code: "US",
      state_code: "CA",
      zip: "90210",
      city: "Los Angeles",
      address1: "1 Main St",
    },
    items: [{ variant_id: Number(variantId), quantity: 1 }],
    currency: "USD",
  };

  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  };
  if (STORE_ID) headers["X-PF-Store-Id"] = STORE_ID;

  const res = await fetch(`${BASE}/shipping/rates`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${label} v1 failed ${res.status}: ${text.slice(0, 500)}`);
  const json = JSON.parse(text);
  const options = Array.isArray(json?.result) ? json.result : [];
  return options.map((opt) => ({
    id: opt.id,
    name: opt.name,
    rate: Number(opt.rate),
    currency: opt.currency || "USD",
    minDeliveryDays: opt.minDeliveryDays ?? opt.min_delivery_days,
    maxDeliveryDays: opt.maxDeliveryDays ?? opt.max_delivery_days,
  }));
}

async function main() {
  console.log("Printful v1 /shipping/rates US probe\n");
  for (const [label, variantId] of [
    ["poster_unframed", UNFRAMED],
    ["poster_framed", FRAMED],
  ]) {
    console.log(`=== ${label} (variant_id=${variantId}) ===`);
    const tiers = await fetchV1Rates(label, variantId);
    for (const t of tiers) {
      console.log(
        `  ${t.id}: $${t.rate.toFixed(2)} | ${t.minDeliveryDays ?? "?"}–${t.maxDeliveryDays ?? "?"} days | ${t.name ?? ""}`,
      );
    }
    const express = tiers.filter((t) => /EXPRESS|PRIORITY|RUSH|FAST/i.test(String(t.id)));
    console.log(`  express-like: ${express.map((t) => t.id).join(", ") || "none"}\n`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
