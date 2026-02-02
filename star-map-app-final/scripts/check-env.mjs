import fs from "node:fs";
import path from "node:path";

const REQUIRED = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_SITE_URL",
  "PRICE_CENTS",
  "CURRENCY",
  "NEXT_PUBLIC_PRICE_CENTS",
  "NEXT_PUBLIC_CURRENCY",
];

const OPTIONAL = [
  "NEXT_PUBLIC_POSTHOG_KEY",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "NEXT_PUBLIC_GA_ID",
];

const loadEnvFile = (filename) => {
  const filePath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const idx = trimmed.indexOf("=");
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
};

// Load local env files without external dependencies.
loadEnvFile(".env.local");
loadEnvFile(".env");

const errors = [];
const warnings = [];

const isMissing = (key) => !process.env[key] || process.env[key].trim() === "";

for (const key of REQUIRED) {
  if (isMissing(key)) errors.push(`Missing ${key}`);
}

for (const key of OPTIONAL) {
  if (isMissing(key)) warnings.push(`Missing optional ${key}`);
}

const checkInt = (key) => {
  const val = process.env[key];
  if (!val) return;
  const parsed = Number.parseInt(val, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    errors.push(`Invalid ${key} (expected positive integer)`);
  }
};

checkInt("PRICE_CENTS");
checkInt("NEXT_PUBLIC_PRICE_CENTS");

const checkDate = (key) => {
  const val = process.env[key];
  if (!val) return;
  const date = new Date(val);
  if (!Number.isFinite(date.getTime())) {
    errors.push(`Invalid ${key} (expected ISO date)`);
  }
};


const stripeKey = process.env.STRIPE_SECRET_KEY;
if (stripeKey && !/^sk_(live|test)_/.test(stripeKey)) {
  warnings.push("STRIPE_SECRET_KEY does not look like a Stripe secret key");
}
const webhookKey = process.env.STRIPE_WEBHOOK_SECRET;
if (webhookKey && !/^whsec_/.test(webhookKey)) {
  warnings.push("STRIPE_WEBHOOK_SECRET does not look like a webhook secret");
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
if (siteUrl && !/^https?:\/\//.test(siteUrl)) {
  errors.push("NEXT_PUBLIC_SITE_URL must include http/https");
}

const currency = process.env.CURRENCY || process.env.NEXT_PUBLIC_CURRENCY;
if (currency && !/^[a-z]{3}$/i.test(currency)) {
  errors.push("CURRENCY must be a 3-letter code (e.g., usd)");
}

console.log("Env sanity check:");
if (errors.length) {
  console.log("Errors:");
  errors.forEach((e) => console.log(`- ${e}`));
}
if (warnings.length) {
  console.log("Warnings:");
  warnings.forEach((w) => console.log(`- ${w}`));
}
if (!errors.length) {
  console.log("OK");
}

process.exit(errors.length ? 1 : 0);
