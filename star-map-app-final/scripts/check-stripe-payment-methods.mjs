#!/usr/bin/env node
/**
 * Verify Stripe Payment Method Configuration (wallets, cards) without creating checkout sessions.
 */
import Stripe from "stripe";
import { loadDotenv } from "./load-dotenv.mjs";

loadDotenv();

const pmcId = (process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION_ID || "").trim();
const secret = (process.env.STRIPE_SECRET_KEY || "").trim();

if (!secret) {
  console.error("check-stripe-payment-methods: STRIPE_SECRET_KEY missing (.env.local)");
  process.exit(1);
}

const stripe = new Stripe(secret, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

async function main() {
  if (!pmcId) {
    console.log("STRIPE_PAYMENT_METHOD_CONFIGURATION_ID: (not set) — Checkout uses Stripe account defaults.");
    process.exit(0);
  }

  const pmc = await stripe.paymentMethodConfigurations.retrieve(pmcId);
  const interesting = ["card", "apple_pay", "google_pay", "link", "amazon_pay", "cashapp", "klarna", "affirm"];
  const rows = [];
  for (const key of interesting) {
    const entry = pmc[key];
    if (!entry || typeof entry !== "object") continue;
    const display = entry.display_preference?.preference ?? entry.display_preference ?? "—";
    const available = entry.available ?? "—";
    rows.push({ method: key, display, available });
  }

  console.log(`Payment method configuration: ${pmcId}`);
  console.log(`Name: ${pmc.name ?? "(default)"}`);
  console.log(`Active: ${pmc.active ?? "—"}`);
  if (rows.length) {
    console.log("\nMethods:");
    for (const row of rows) {
      console.log(`  ${row.method.padEnd(12)} display=${row.display} available=${row.available}`);
    }
  } else {
    console.log("(No known method keys on this PMC — check Stripe Dashboard.)");
  }

  const walletOk =
    (pmc.apple_pay?.display_preference?.preference === "on" ||
      pmc.apple_pay?.display_preference === "on") &&
    (pmc.google_pay?.display_preference?.preference === "on" ||
      pmc.google_pay?.display_preference === "on");
  const cardOn =
    pmc.card?.display_preference?.preference === "on" || pmc.card?.display_preference === "on";

  if (!cardOn) {
    console.error("\nWARN: card is not enabled on this PMC.");
    process.exit(1);
  }
  if (!walletOk) {
    console.error("\nWARN: Apple Pay and/or Google Pay are not fully enabled on this PMC.");
    process.exit(1);
  }
  console.log("\nOK: card + Apple Pay + Google Pay appear enabled for Checkout.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
