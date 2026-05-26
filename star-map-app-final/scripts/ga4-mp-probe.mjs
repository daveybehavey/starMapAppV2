#!/usr/bin/env node
/**
 * Send a test purchase to GA4 Measurement Protocol (debug + live).
 * Run: node scripts/ga4-mp-probe.mjs
 */
import { loadDotenv } from "./load-dotenv.mjs";

loadDotenv();

const measurementId = (process.env.NEXT_PUBLIC_GA_ID || "").trim();
const apiSecret = (process.env.GA4_API_SECRET || "").trim();
if (!measurementId || !apiSecret) {
  console.error("Need NEXT_PUBLIC_GA_ID and GA4_API_SECRET in .env.local");
  process.exit(2);
}

const transactionId = `probe_${Date.now()}`;
const params = {
  transaction_id: transactionId,
  currency: "USD",
  value: 9,
  free_checkout: true,
  items: [
    {
      item_id: "digital_single",
      item_name: "Single HD Digital Download",
      quantity: 1,
      price: 9,
    },
  ],
};

async function post(base, label) {
  const url = new URL(`${base}/mp/collect`);
  url.searchParams.set("measurement_id", measurementId);
  url.searchParams.set("api_secret", apiSecret);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: `stripe.${transactionId}`,
      events: [{ name: "purchase", params }],
    }),
  });
  const text = await res.text();
  console.log(`[${label}] HTTP ${res.status}`, text.slice(0, 500) || "(empty body)");
  return { status: res.status, text };
}

const debug = await post("https://www.google-analytics.com/debug", "debug");
if (debug.text) {
  try {
    const parsed = JSON.parse(debug.text);
    const messages = parsed.validationMessages ?? [];
    if (messages.length) {
      console.error("Validation issues:", JSON.stringify(messages, null, 2));
      process.exit(1);
    }
    console.log("Debug validation: OK");
  } catch {
    // non-json ok on live collect
  }
}

await post("https://www.google-analytics.com", "live");
console.log(`Sent test purchase transaction_id=${transactionId}`);
console.log("Check GA4 Realtime for `purchase` in 1–2 minutes.");
