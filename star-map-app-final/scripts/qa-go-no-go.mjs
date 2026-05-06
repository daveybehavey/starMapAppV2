import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { readWranglerVars } from "./wrangler-vars.mjs";

function parseCli(argv) {
  const out = { strictWranglerParity: false };
  for (const token of argv) {
    if (token === "--strict-wrangler-parity") {
      out.strictWranglerParity = true;
      continue;
    }
    if (token === "-h" || token === "--help") {
      console.log(`Usage: node scripts/qa-go-no-go.mjs [options]

Loads .env then .env.local (local overrides), merges missing keys from wrangler.toml [vars],
then validates print/commerce configuration.

Options:
  --strict-wrangler-parity   Exit non-zero when merged .env/.env.local differs from wrangler [vars]
                             for tracked parity keys (behavior flags + margin cents).
  -h, --help                 Show this message.
`);
      process.exit(0);
    }
    console.error(`Unknown arg: ${token} (try --help)`);
    process.exit(2);
  }
  return out;
}

const cli = parseCli(process.argv.slice(2));

const appRoot = process.cwd();

/** Keys where drift between developer env files and wrangler [vars] causes real prod surprises. */
const WRANGLER_PARITY_KEYS = [
  "PRINT_CHECKOUT_ENABLED",
  "NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED",
  "PRINT_ORDER_SUBMISSION_ENABLED",
  "PRINTFUL_AUTO_CONFIRM",
  "PRINT_MARGIN_GUARD_ENABLED",
  "PRINT_MIN_MARGIN_CENTS",
  "PRINT_MIN_CHARGE_CENTS",
  "PRINT_DYNAMIC_SHIPPING",
  "NEXT_PUBLIC_DOWNLOAD_ARCHIVE_ENABLED",
  "GEO_DIGITAL_SINGLE_PRICING_ENABLED",
];

function parseEnvFile(filename) {
  const full = path.join(appRoot, filename);
  try {
    const content = fs.readFileSync(full, "utf8");
    return dotenv.parse(content);
  } catch {
    return {};
  }
}

const mergedEnvFiles = {
  ...parseEnvFile(".env"),
  ...parseEnvFile(".env.local"),
};

dotenv.config({ path: path.join(appRoot, ".env") });
dotenv.config({ path: path.join(appRoot, ".env.local") });

const wranglerVars = await readWranglerVars(appRoot);
for (const [key, value] of Object.entries(wranglerVars)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

const issues = [];
const warnings = [];

function parseBoolLoose(raw, fallback = false) {
  if (!raw || !String(raw).trim()) return fallback;
  const value = String(raw).trim().toLowerCase();
  if (["1", "true", "yes"].includes(value)) return true;
  if (["0", "false", "no"].includes(value)) return false;
  return fallback;
}

const BOOL_PARITY_KEYS = new Set([
  "PRINT_CHECKOUT_ENABLED",
  "NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED",
  "PRINT_ORDER_SUBMISSION_ENABLED",
  "PRINTFUL_AUTO_CONFIRM",
  "PRINT_MARGIN_GUARD_ENABLED",
  "PRINT_DYNAMIC_SHIPPING",
  "NEXT_PUBLIC_DOWNLOAD_ARCHIVE_ENABLED",
  "GEO_DIGITAL_SINGLE_PRICING_ENABLED",
]);

function comparableScalar(key, raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  if (BOOL_PARITY_KEYS.has(key)) {
    return `bool:${parseBoolLoose(raw, false)}`;
  }

  if (key.endsWith("_CENTS") || key.endsWith("_PERCENT")) {
    const n = Number.parseInt(s, 10);
    if (Number.isFinite(n)) return `int:${n}`;
    return null;
  }

  return `str:${s}`;
}

const parityMismatches = [];
const parityLocalOnly = [];

for (const key of WRANGLER_PARITY_KEYS) {
  const localRaw = mergedEnvFiles[key];
  const wranglerRaw = wranglerVars[key];

  if (localRaw !== undefined && wranglerRaw === undefined) {
    parityLocalOnly.push(key);
    continue;
  }
  if (localRaw === undefined || wranglerRaw === undefined) continue;

  const ca = comparableScalar(key, localRaw);
  const cw = comparableScalar(key, wranglerRaw);
  if (ca !== null && cw !== null && ca !== cw) {
    parityMismatches.push({
      key,
      local: String(localRaw).trim(),
      wrangler: String(wranglerRaw).trim(),
    });
  }
}

const hasValue = (key) => Boolean(process.env[key]?.trim());

function parseBool(raw, key, fallback = false) {
  if (!raw || !raw.trim()) return fallback;
  const value = raw.trim().toLowerCase();
  if (["1", "true", "yes"].includes(value)) return true;
  if (["0", "false", "no"].includes(value)) return false;
  issues.push(`${key} must be true/false (or 1/0/yes/no)`);
  return fallback;
}

function getMode(checkoutEnabled, publicCheckoutEnabled, submissionEnabled, configured) {
  if (!checkoutEnabled && !publicCheckoutEnabled && !submissionEnabled) return "SAFE_OFF";
  if (checkoutEnabled && publicCheckoutEnabled && !submissionEnabled) return "CHECKOUT_ONLY";
  if (checkoutEnabled && publicCheckoutEnabled && submissionEnabled && configured) return "LIVE_READY";
  return "CUSTOM";
}

const printCheckoutEnabled = parseBool(process.env.PRINT_CHECKOUT_ENABLED, "PRINT_CHECKOUT_ENABLED", false);
const publicPrintCheckoutEnabled = parseBool(
  process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED,
  "NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED",
  false,
);
const printSubmissionEnabled = parseBool(
  process.env.PRINT_ORDER_SUBMISSION_ENABLED,
  "PRINT_ORDER_SUBMISSION_ENABLED",
  false,
);
const hasPrintShippingConfig =
  hasValue("STRIPE_SHIPPING_RATE_ID_PRINT_STANDARD") || hasValue("PRINT_STANDARD_SHIPPING_CENTS");
const minPrintChargeRaw = (process.env.PRINT_MIN_CHARGE_CENTS || "").trim();
const minPrintChargeCents = minPrintChargeRaw ? Number.parseInt(minPrintChargeRaw, 10) : 100;
const printMarginGuardEnabled = parseBool(
  process.env.PRINT_MARGIN_GUARD_ENABLED,
  "PRINT_MARGIN_GUARD_ENABLED",
  false,
);
const minPrintMarginRaw = (process.env.PRINT_MIN_MARGIN_CENTS || "").trim();
const minPrintMarginCents = minPrintMarginRaw ? Number.parseInt(minPrintMarginRaw, 10) : 0;
const referralCap24hRaw = (process.env.REFERRAL_MAX_REWARDS_PER_REFERRER_24H || "").trim();
const referralCap24h = referralCap24hRaw ? Number.parseInt(referralCap24hRaw, 10) : 0;
const referralCap30dRaw = (process.env.REFERRAL_MAX_REWARDS_PER_REFERRER_30D || "").trim();
const referralCap30d = referralCap30dRaw ? Number.parseInt(referralCap30dRaw, 10) : 0;
const geoPricingEnabled = parseBool(
  process.env.GEO_DIGITAL_SINGLE_PRICING_ENABLED,
  "GEO_DIGITAL_SINGLE_PRICING_ENABLED",
  false,
);

const hasPrintful =
  hasValue("PRINTFUL_API_TOKEN") &&
  hasValue("PRINTFUL_STORE_ID") &&
  hasValue("PRINTFUL_VARIANT_ID_POSTER_UNFRAMED") &&
  hasValue("PRINTFUL_VARIANT_ID_POSTER_FRAMED");
const hasWebhookFulfillment = hasValue("PRINT_FULFILLMENT_WEBHOOK_URL");
const fulfillmentConfigured = hasPrintful || hasWebhookFulfillment;
const hasPrintAdminToken = hasValue("PRINT_ADMIN_TOKEN");

if (printCheckoutEnabled !== publicPrintCheckoutEnabled) {
  issues.push("PRINT_CHECKOUT_ENABLED and NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED must match.");
}

if (printSubmissionEnabled && !fulfillmentConfigured) {
  issues.push(
    "PRINT_ORDER_SUBMISSION_ENABLED=true but no fulfillment configured (set Printful vars or PRINT_FULFILLMENT_WEBHOOK_URL).",
  );
}

if (printSubmissionEnabled && !printCheckoutEnabled) {
  warnings.push("Print submission is enabled while print checkout is disabled.");
}

if (printSubmissionEnabled && !hasPrintAdminToken) {
  warnings.push("PRINT_ADMIN_TOKEN is not set. Admin retry/status endpoints cannot be used securely.");
}

if (minPrintChargeRaw && !Number.isFinite(minPrintChargeCents)) {
  issues.push("PRINT_MIN_CHARGE_CENTS must be an integer when set.");
}

if (Number.isFinite(minPrintChargeCents) && minPrintChargeCents < 0) {
  issues.push("PRINT_MIN_CHARGE_CENTS cannot be negative.");
}
if (minPrintMarginRaw && !Number.isFinite(minPrintMarginCents)) {
  issues.push("PRINT_MIN_MARGIN_CENTS must be an integer when set.");
}
if (Number.isFinite(minPrintMarginCents) && minPrintMarginCents < 0) {
  issues.push("PRINT_MIN_MARGIN_CENTS cannot be negative.");
}
if (printMarginGuardEnabled && minPrintMarginCents <= 0) {
  warnings.push("PRINT_MARGIN_GUARD_ENABLED=true but PRINT_MIN_MARGIN_CENTS is not > 0.");
}
if (referralCap24hRaw && (!Number.isFinite(referralCap24h) || referralCap24h < 0)) {
  issues.push("REFERRAL_MAX_REWARDS_PER_REFERRER_24H must be a non-negative integer when set.");
}
if (referralCap30dRaw && (!Number.isFinite(referralCap30d) || referralCap30d < 0)) {
  issues.push("REFERRAL_MAX_REWARDS_PER_REFERRER_30D must be a non-negative integer when set.");
}
if (referralCap24h > 0 && referralCap30d > 0 && referralCap24h > referralCap30d) {
  warnings.push(
    "REFERRAL_MAX_REWARDS_PER_REFERRER_24H is higher than REFERRAL_MAX_REWARDS_PER_REFERRER_30D; caps may not behave as expected.",
  );
}

if (geoPricingEnabled) {
  const raw = process.env.GEO_DIGITAL_SINGLE_PRICING_JSON?.trim();
  if (!raw) {
    warnings.push("GEO_DIGITAL_SINGLE_PRICING_ENABLED=true but GEO_DIGITAL_SINGLE_PRICING_JSON is empty.");
  } else {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        issues.push("GEO_DIGITAL_SINGLE_PRICING_JSON must be a JSON object.");
      }
    } catch {
      issues.push("GEO_DIGITAL_SINGLE_PRICING_JSON must be valid JSON.");
    }
  }
}

if (printCheckoutEnabled && !hasValue("STRIPE_SECRET_KEY")) {
  issues.push("PRINT_CHECKOUT_ENABLED=true requires STRIPE_SECRET_KEY.");
}

if (printCheckoutEnabled && !hasValue("STRIPE_WEBHOOK_SECRET")) {
  issues.push("PRINT_CHECKOUT_ENABLED=true requires STRIPE_WEBHOOK_SECRET.");
}

if (printCheckoutEnabled && !hasValue("STRIPE_PAYMENT_METHOD_CONFIGURATION_ID")) {
  warnings.push(
    "STRIPE_PAYMENT_METHOD_CONFIGURATION_ID is not set. Checkout may fall back to dashboard defaults instead of wallet-optimized method configuration.",
  );
}

if (printCheckoutEnabled && !hasPrintShippingConfig) {
  issues.push("PRINT_CHECKOUT_ENABLED=true requires explicit print shipping configuration.");
}

if (
  printCheckoutEnabled &&
  !hasValue("STRIPE_PRICE_ID_PRINT_UNFRAMED") &&
  !hasValue("PRINT_UNFRAMED_PRICE_CENTS")
) {
  issues.push("Configure STRIPE_PRICE_ID_PRINT_UNFRAMED or PRINT_UNFRAMED_PRICE_CENTS.");
}

if (
  printCheckoutEnabled &&
  !hasValue("STRIPE_PRICE_ID_PRINT_FRAMED") &&
  !hasValue("PRINT_FRAMED_PRICE_CENTS")
) {
  issues.push("Configure STRIPE_PRICE_ID_PRINT_FRAMED or PRINT_FRAMED_PRICE_CENTS.");
}

if (
  printCheckoutEnabled &&
  !hasValue("STRIPE_PRICE_ID_PRINT_DIGITAL_ADDON") &&
  !hasValue("PRINT_DIGITAL_ADDON_PRICE_CENTS")
) {
  warnings.push("No print digital add-on pricing configured (optional).");
}

const mode = getMode(printCheckoutEnabled, publicPrintCheckoutEnabled, printSubmissionEnabled, fulfillmentConfigured);
const wranglerPrintCheckoutEnabled = parseBoolLoose(wranglerVars.PRINT_CHECKOUT_ENABLED, printCheckoutEnabled);
const wranglerPublicPrintCheckoutEnabled = parseBoolLoose(
  wranglerVars.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED,
  publicPrintCheckoutEnabled,
);
const wranglerPrintSubmissionEnabled = parseBoolLoose(
  wranglerVars.PRINT_ORDER_SUBMISSION_ENABLED,
  printSubmissionEnabled,
);
const wranglerMode = getMode(
  wranglerPrintCheckoutEnabled,
  wranglerPublicPrintCheckoutEnabled,
  wranglerPrintSubmissionEnabled,
  fulfillmentConfigured,
);

console.log("Print go/no-go summary");
console.log(`Mode: ${mode}`);
console.log(`- PRINT_CHECKOUT_ENABLED=${String(printCheckoutEnabled)}`);
console.log(`- NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED=${String(publicPrintCheckoutEnabled)}`);
console.log(`- PRINT_ORDER_SUBMISSION_ENABLED=${String(printSubmissionEnabled)}`);
console.log(`- Fulfillment configured=${String(fulfillmentConfigured)}`);
console.log(`- PRINT_MIN_CHARGE_CENTS=${Number.isFinite(minPrintChargeCents) ? String(minPrintChargeCents) : "100"}`);
console.log(`- PRINT_MARGIN_GUARD_ENABLED=${String(printMarginGuardEnabled)}`);
console.log(`- PRINT_MIN_MARGIN_CENTS=${Number.isFinite(minPrintMarginCents) ? String(minPrintMarginCents) : "0"}`);
console.log(`- GEO_DIGITAL_SINGLE_PRICING_ENABLED=${String(geoPricingEnabled)}`);
if (hasPrintful) console.log("- Fulfillment path: Printful");
if (!hasPrintful && hasWebhookFulfillment) console.log("- Fulfillment path: Custom webhook");

if (parityMismatches.length || parityLocalOnly.length) {
  console.log("\nWrangler parity (.env + .env.local vs wrangler.toml [vars]):");
  for (const row of parityMismatches) {
    console.log(`- ${row.key}: env files "${row.local}" ≠ wrangler "${row.wrangler}"`);
  }
  for (const key of parityLocalOnly) {
    console.log(`- ${key}: set in env files but missing from wrangler [vars] (won't apply in prod)`);
  }
}

if (mode !== wranglerMode) {
  console.log("\nNote: merged runtime env mode differs from raw wrangler production vars.");
  console.log(`- Wrangler mode: ${wranglerMode}`);
  console.log(`- Wrangler PRINT_CHECKOUT_ENABLED=${String(wranglerPrintCheckoutEnabled)}`);
  console.log(`- Wrangler NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED=${String(wranglerPublicPrintCheckoutEnabled)}`);
  console.log(`- Wrangler PRINT_ORDER_SUBMISSION_ENABLED=${String(wranglerPrintSubmissionEnabled)}`);
}

if (warnings.length) {
  console.log("\nWarnings:");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

if (issues.length) {
  console.log("\nNO-GO (fix these first):");
  for (const issue of issues) {
    console.log(`- ${issue}`);
  }
  process.exit(1);
}

if (mode === "CHECKOUT_ONLY") {
  console.log("\nNO-GO for live customers: checkout is enabled but fulfillment submission is disabled.");
  process.exit(1);
}

if (cli.strictWranglerParity && (parityMismatches.length || parityLocalOnly.length)) {
  console.log("\nNO-GO: --strict-wrangler-parity failed (fix env files or wrangler.toml).");
  process.exit(1);
}

console.log("\nGO: configuration is coherent.");
