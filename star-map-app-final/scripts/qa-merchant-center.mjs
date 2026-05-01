#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function run(cmd, args, { label } = {}) {
  const pretty = [cmd, ...args].join(" ");
  const prefix = label ? `${label}: ` : "";
  console.log(`\n${prefix}${pretty}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  return result.status === 0;
}

function section(title) {
  console.log(`\n============================================================`);
  console.log(title);
  console.log(`============================================================`);
}

let ok = true;

section("Merchant Center readiness (repo + optional API checks)");

// Always run: feed generation + local validation.
ok = run("node", ["scripts/generate-merchant-feed.mjs"], { label: "feed" }) && ok;
ok = run("node", ["scripts/merchant-feed-health.mjs", "--file", "public/merchant-feed.xml"], { label: "feed" }) && ok;

// Always run: print the exact facts we intend to use.
ok = run("node", ["scripts/store-quality-facts.mjs"], { label: "facts" }) && ok;

// Optional: Merchant API checks (requires service account JSON path to exist).
// We run them, but don’t fail the whole command if credentials are missing.
section("Optional: Merchant API shipping coverage (requires GOOGLE_MERCHANT_* creds)");
const shippingVerifyOk = run("node", ["scripts/merchant-shipping-verify.mjs", "--country", "CA"], { label: "merchant" });
if (!shippingVerifyOk) {
  console.log("\nNOTE: Shipping verify failed. If this machine lacks Merchant API creds, set:");
  console.log("- GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON_PATH (or GOOGLE_APPLICATION_CREDENTIALS)");
  console.log("Then re-run: npm run merchant:shipping:verify -- --country CA");
}

section("Optional: Stripe wallet config (requires STRIPE_SECRET_KEY in .env.local)");
const stripeOk = run("node", ["scripts/stripe-payment-method-audit.mjs", "--json"], { label: "stripe" });
if (!stripeOk) {
  console.log("\nNOTE: Stripe audit failed. Ensure STRIPE_SECRET_KEY + STRIPE_PAYMENT_METHOD_CONFIGURATION_ID exist in .env.local.");
}

process.exit(ok ? 0 : 1);

