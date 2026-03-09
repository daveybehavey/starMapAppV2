import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const issues = [];
const warnings = [];

const hasValue = (key) => Boolean(process.env[key]?.trim());

function readBoolEnv(key, fallback = false) {
  const raw = process.env[key];
  if (!raw || !raw.trim()) return fallback;
  const value = raw.trim().toLowerCase();
  if (["1", "true", "yes"].includes(value)) return true;
  if (["0", "false", "no"].includes(value)) return false;
  issues.push(`${key} must be true/false (or 1/0/yes/no)`);
  return fallback;
}

const printCheckoutEnabled = readBoolEnv("PRINT_CHECKOUT_ENABLED", false);
const publicPrintCheckoutEnabled = readBoolEnv("NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED", false);
const printSubmissionEnabled = readBoolEnv("PRINT_ORDER_SUBMISSION_ENABLED", false);
const hasPrintShippingConfig =
  hasValue("STRIPE_SHIPPING_RATE_ID_PRINT_STANDARD") || hasValue("PRINT_STANDARD_SHIPPING_CENTS");

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

if (printCheckoutEnabled && !hasValue("STRIPE_SECRET_KEY")) {
  issues.push("PRINT_CHECKOUT_ENABLED=true requires STRIPE_SECRET_KEY.");
}

if (printCheckoutEnabled && !hasValue("STRIPE_WEBHOOK_SECRET")) {
  issues.push("PRINT_CHECKOUT_ENABLED=true requires STRIPE_WEBHOOK_SECRET.");
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

const mode = (() => {
  if (!printCheckoutEnabled && !publicPrintCheckoutEnabled && !printSubmissionEnabled) return "SAFE_OFF";
  if (printCheckoutEnabled && publicPrintCheckoutEnabled && !printSubmissionEnabled) return "CHECKOUT_ONLY";
  if (printCheckoutEnabled && publicPrintCheckoutEnabled && printSubmissionEnabled && fulfillmentConfigured) {
    return "LIVE_READY";
  }
  return "CUSTOM";
})();

console.log("Print go/no-go summary");
console.log(`Mode: ${mode}`);
console.log(`- PRINT_CHECKOUT_ENABLED=${String(printCheckoutEnabled)}`);
console.log(`- NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED=${String(publicPrintCheckoutEnabled)}`);
console.log(`- PRINT_ORDER_SUBMISSION_ENABLED=${String(printSubmissionEnabled)}`);
console.log(`- Fulfillment configured=${String(fulfillmentConfigured)}`);
if (hasPrintful) console.log("- Fulfillment path: Printful");
if (!hasPrintful && hasWebhookFulfillment) console.log("- Fulfillment path: Custom webhook");

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
  console.log(
    "\nNO-GO for live customers: checkout is enabled but fulfillment submission is disabled.",
  );
  process.exit(1);
}

console.log("\nGO: configuration is coherent.");
