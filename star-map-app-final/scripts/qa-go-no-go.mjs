import dotenv from "dotenv";
import { readWranglerVars } from "./wrangler-vars.mjs";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

function parseArgs(argv) {
  const args = {
    allowCheckoutOnly: false,
  };

  for (const token of argv) {
    if (token === "--allow-checkout-only") {
      args.allowCheckoutOnly = true;
      continue;
    }
    if (token === "-h" || token === "--help") {
      console.log(`Usage: node scripts/qa-go-no-go.mjs [--allow-checkout-only]

Validates print launch configuration.

Options:
  --allow-checkout-only  Allow CHECKOUT_ONLY mode for local/non-live validation.
                         This never means live-ready fulfillment.
`);
      process.exit(0);
    }
    throw new Error(`Unknown arg: ${token}`);
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));

const wranglerVars = await readWranglerVars(process.cwd());
for (const [key, value] of Object.entries(wranglerVars)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

const issues = [];
const warnings = [];

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
const wranglerPrintCheckoutEnabled = parseBool(
  wranglerVars.PRINT_CHECKOUT_ENABLED,
  "wrangler:PRINT_CHECKOUT_ENABLED",
  printCheckoutEnabled,
);
const wranglerPublicPrintCheckoutEnabled = parseBool(
  wranglerVars.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED,
  "wrangler:NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED",
  publicPrintCheckoutEnabled,
);
const wranglerPrintSubmissionEnabled = parseBool(
  wranglerVars.PRINT_ORDER_SUBMISSION_ENABLED,
  "wrangler:PRINT_ORDER_SUBMISSION_ENABLED",
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

if (mode !== wranglerMode) {
  console.log("\nNote: local env differs from wrangler production vars.");
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
  if (args.allowCheckoutOnly) {
    console.log(
      "\nGO (non-live override): checkout is enabled and fulfillment submission is disabled by design for this run.",
    );
    console.log("Live reminder: CHECKOUT_ONLY is still NO-GO for live customers.");
    process.exit(0);
  }
  console.log(
    "\nNO-GO for live customers: checkout is enabled but fulfillment submission is disabled.",
  );
  process.exit(1);
}

console.log("\nGO: configuration is coherent.");
