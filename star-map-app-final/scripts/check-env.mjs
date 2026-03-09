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
  "PROMOTION_COUPON_CODE",
  "PROMOTION_EMAIL_FROM",
  "RESEND_API_KEY",
  "SENDGRID_API_KEY",
  "PROMOTION_AUTOMATION_WEBHOOK_URL",
  "PRINTFUL_API_TOKEN",
  "PRINTFUL_STORE_ID",
  "PRINTFUL_VARIANT_ID_POSTER_UNFRAMED",
  "PRINTFUL_VARIANT_ID_POSTER_FRAMED",
  "PRINT_ORDER_SUBMISSION_ENABLED",
  "STRIPE_SHIPPING_RATE_ID_PRINT_STANDARD",
  "PRINT_STANDARD_SHIPPING_CENTS",
  "PRINT_STANDARD_SHIPPING_LABEL",
  "PRINT_STANDARD_SHIPPING_MIN_BUSINESS_DAYS",
  "PRINT_STANDARD_SHIPPING_MAX_BUSINESS_DAYS",
  "PRINT_ADMIN_TOKEN",
  "STRIPE_REFERRAL_PROMO_CODE_ID",
  "REFERRAL_SIGNING_SECRET",
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

const parseBooleanEnv = (key) => {
  const raw = process.env[key];
  if (!raw || !raw.trim()) return null;
  const value = raw.trim().toLowerCase();
  if (["1", "true", "yes"].includes(value)) return true;
  if (["0", "false", "no"].includes(value)) return false;
  errors.push(`Invalid ${key} (expected true/false/1/0/yes/no)`);
  return null;
};

const checkStripeIdPrefix = (key, prefix) => {
  const value = process.env[key];
  if (!value) return;
  if (!value.startsWith(prefix)) {
    errors.push(`Invalid ${key} (expected to start with ${prefix})`);
  }
};

checkInt("PRICE_CENTS");
checkInt("NEXT_PUBLIC_PRICE_CENTS");
checkInt("PRINTFUL_VARIANT_ID_POSTER_UNFRAMED");
checkInt("PRINTFUL_VARIANT_ID_POSTER_FRAMED");
checkInt("PRINT_STANDARD_SHIPPING_CENTS");
checkInt("PRINT_STANDARD_SHIPPING_MIN_BUSINESS_DAYS");
checkInt("PRINT_STANDARD_SHIPPING_MAX_BUSINESS_DAYS");

const printCheckoutEnabled = parseBooleanEnv("PRINT_CHECKOUT_ENABLED");
const clientPrintCheckoutEnabled = parseBooleanEnv("NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED");
const printSubmissionEnabled = parseBooleanEnv("PRINT_ORDER_SUBMISSION_ENABLED");

if (
  printCheckoutEnabled !== null &&
  clientPrintCheckoutEnabled !== null &&
  printCheckoutEnabled !== clientPrintCheckoutEnabled
) {
  errors.push("PRINT_CHECKOUT_ENABLED and NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED must match");
}

if (clientPrintCheckoutEnabled === true && printCheckoutEnabled !== true) {
  errors.push("NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED=true requires PRINT_CHECKOUT_ENABLED=true");
}

if (printSubmissionEnabled === true) {
  const hasWebhook = Boolean(process.env.PRINT_FULFILLMENT_WEBHOOK_URL?.trim());
  const hasPrintful =
    Boolean(process.env.PRINTFUL_API_TOKEN?.trim()) &&
    Boolean(process.env.PRINTFUL_VARIANT_ID_POSTER_UNFRAMED?.trim()) &&
    Boolean(process.env.PRINTFUL_VARIANT_ID_POSTER_FRAMED?.trim());
  if (!hasWebhook && !hasPrintful) {
    errors.push(
      "PRINT_ORDER_SUBMISSION_ENABLED=true requires either PRINT_FULFILLMENT_WEBHOOK_URL or full PRINTFUL_* config",
    );
  }
}

if (process.env.STRIPE_SHIPPING_RATE_ID_PRINT_STANDARD && !process.env.STRIPE_SHIPPING_RATE_ID_PRINT_STANDARD.startsWith("shr_")) {
  warnings.push("STRIPE_SHIPPING_RATE_ID_PRINT_STANDARD does not look like a Stripe shipping rate id");
}

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

const promotionPercent = process.env.PROMOTION_COUPON_PERCENT;
if (promotionPercent) {
  const parsed = Number.parseFloat(promotionPercent);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
    errors.push("PROMOTION_COUPON_PERCENT must be between 0 and 100");
  }
}

checkStripeIdPrefix("STRIPE_PROMO_CODE_ID", "promo_");
checkStripeIdPrefix("STRIPE_REFERRAL_PROMO_CODE_ID", "promo_");

if (process.env.RESEND_API_KEY && !process.env.PROMOTION_EMAIL_FROM) {
  warnings.push("PROMOTION_EMAIL_FROM is required when RESEND_API_KEY is set");
}

if (process.env.SENDGRID_API_KEY && !process.env.PROMOTION_EMAIL_FROM) {
  warnings.push("PROMOTION_EMAIL_FROM is required when SENDGRID_API_KEY is set");
}

const hasAutomation = Boolean(
  process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY || process.env.PROMOTION_AUTOMATION_WEBHOOK_URL,
);
if (!hasAutomation) {
  warnings.push("No promotion automation configured (set RESEND_API_KEY, SENDGRID_API_KEY, or PROMOTION_AUTOMATION_WEBHOOK_URL)");
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
