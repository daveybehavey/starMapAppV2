import { loadDotenv } from "./load-dotenv.mjs";

loadDotenv();

process.env.PRINT_FRAMED_PRICE_CENTS = process.env.PRINT_FRAMED_PRICE_CENTS || "9900";
process.env.PRINT_DIGITAL_ADDON_PRICE_CENTS = process.env.PRINT_DIGITAL_ADDON_PRICE_CENTS || "700";
process.env.PRINT_FREE_SHIPPING_THRESHOLD_CENTS =
  process.env.PRINT_FREE_SHIPPING_THRESHOLD_CENTS || "10000";

const framed = Number.parseInt(process.env.PRINT_FRAMED_PRICE_CENTS, 10);
const addon = Number.parseInt(process.env.PRINT_DIGITAL_ADDON_PRICE_CENTS, 10);
const threshold = Number.parseInt(process.env.PRINT_FREE_SHIPPING_THRESHOLD_CENTS, 10);
const bundle = framed + addon;

console.log("Print free shipping preflight");
console.log(`  Framed: $${(framed / 100).toFixed(2)}`);
console.log(`  HD add-on: $${(addon / 100).toFixed(2)}`);
console.log(`  Bundle subtotal: $${(bundle / 100).toFixed(2)}`);
console.log(`  Threshold: $${(threshold / 100).toFixed(2)}`);
console.log(`  Wedding bundle qualifies: ${bundle >= threshold ? "YES" : "NO"}`);

if (bundle < threshold) {
  console.error("\nFAIL: framed + HD does not clear free-shipping threshold.");
  process.exit(1);
}

console.log("\nOK — ads can honestly say free shipping on the $106 wedding bundle.");
console.log("Checkout applies waive via applyPrintFreeShippingToCheckout in src/app/api/checkout/route.ts.");
console.log("Run: npm run test:unit -- scripts/unit/printFreeShipping.test.mjs");
