#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import Stripe from "stripe";

const cwd = process.cwd();

function loadEnvFile(filename) {
  const filePath = path.resolve(cwd, filename);
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index === -1) return;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  });
}

function parseArgs(argv) {
  return {
    json: argv.includes("--json"),
  };
}

function summarizeMethodConfig(methodConfig) {
  if (!methodConfig) return null;
  const methodKeys = ["card", "link", "apple_pay", "google_pay", "paypal"];
  return Object.fromEntries(
    methodKeys.map((key) => {
      const value = methodConfig[key];
      return [
        key,
        value
          ? {
              available: Boolean(value.available),
              preference: value.display_preference?.value ?? value.display_preference?.preference ?? null,
            }
          : null,
      ];
    }),
  );
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
const paymentMethodConfigurationId = process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION_ID?.trim();

if (!stripeSecret) {
  console.error("Missing STRIPE_SECRET_KEY in .env.local");
  process.exit(1);
}

if (!paymentMethodConfigurationId) {
  console.error("Missing STRIPE_PAYMENT_METHOD_CONFIGURATION_ID in .env.local");
  process.exit(1);
}

const stripe = new Stripe(stripeSecret, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
  timeout: 20_000,
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [account, methodConfig] = await Promise.all([
    stripe.accounts.retrieve(),
    stripe.paymentMethodConfigurations.retrieve(paymentMethodConfigurationId),
  ]);

  const result = {
    accountId: account.id,
    country: account.country,
    chargesEnabled: Boolean(account.charges_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    paymentMethodConfiguration: {
      id: methodConfig.id,
      name: methodConfig.name,
      active: Boolean(methodConfig.active),
      methods: summarizeMethodConfig(methodConfig),
    },
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Stripe account: ${result.accountId} (${result.country})`);
  console.log(`Charges enabled: ${result.chargesEnabled ? "yes" : "no"}`);
  console.log(`Details submitted: ${result.detailsSubmitted ? "yes" : "no"}`);
  console.log(`Payment method config: ${result.paymentMethodConfiguration.name} (${result.paymentMethodConfiguration.id})`);
  console.log(`Active: ${result.paymentMethodConfiguration.active ? "yes" : "no"}`);
  for (const [method, config] of Object.entries(result.paymentMethodConfiguration.methods)) {
    if (!config) continue;
    console.log(`- ${method}: available=${config.available ? "yes" : "no"}, preference=${config.preference ?? "n/a"}`);
  }
}

main().catch((error) => {
  console.error("Stripe payment method audit failed:", error);
  process.exit(1);
});
