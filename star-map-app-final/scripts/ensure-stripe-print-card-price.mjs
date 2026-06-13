/**
 * Idempotent: ensure live Stripe Product + Price for card_4x6 ($19.00 USD).
 * Safe — creates catalog objects only; no charges.
 *
 * Usage: node scripts/ensure-stripe-print-card-price.mjs
 * Optional: --dry-run
 */
import Stripe from "stripe";
import { loadDotenv } from "./load-dotenv.mjs";

loadDotenv();

const dryRun = process.argv.includes("--dry-run");
const secret = process.env.STRIPE_SECRET_KEY?.trim() || "";
const targetCents = Number.parseInt(process.env.PRINT_CARD_4X6_PRICE_CENTS || "1900", 10);
const label = (process.env.PRINT_CARD_4X6_LABEL || "Greeting card (4×6)").trim();

if (!secret) {
  console.error("Missing STRIPE_SECRET_KEY");
  process.exit(1);
}
if (!Number.isFinite(targetCents) || targetCents <= 0) {
  console.error("Invalid PRINT_CARD_4X6_PRICE_CENTS");
  process.exit(1);
}

const stripe = new Stripe(secret, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

const METADATA = {
  print_variant: "card_4x6",
  printful_variant_id: "14457",
  starmapco_sku: "card_4x6",
};

async function findExistingPrice() {
  const search = await stripe.products.search({
    query: "metadata['starmapco_sku']:'card_4x6'",
    limit: 5,
  });
  for (const product of search.data) {
    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 20 });
    const match = prices.data.find(
      (p) => p.currency === "usd" && p.unit_amount === targetCents && p.type === "one_time",
    );
    if (match) {
      return { product, price: match, reused: true };
    }
    if (prices.data.length && dryRun) {
      return { product, price: prices.data[0], reused: true, note: "existing product, would create new price" };
    }
    if (!dryRun && product.id) {
      const price = await stripe.prices.create({
        product: product.id,
        currency: "usd",
        unit_amount: targetCents,
        metadata: METADATA,
      });
      return { product, price, reused: false };
    }
  }
  return null;
}

async function main() {
  const mode = secret.startsWith("sk_live_") ? "live" : secret.startsWith("sk_test_") ? "test" : "unknown";
  console.log(`Stripe mode: ${mode}`);
  console.log(`Target: ${label} @ $${(targetCents / 100).toFixed(2)} USD`);

  if (dryRun) {
    console.log("Dry run — no Stripe writes.");
  }

  let result = await findExistingPrice();

  if (!result && !dryRun) {
    const product = await stripe.products.create({
      name: label,
      description: "4×6 greeting card with custom star map — Printful fulfilled",
      metadata: METADATA,
    });
    const price = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: targetCents,
      metadata: METADATA,
    });
    result = { product, price, reused: false };
  }

  if (!result) {
    console.log("No existing card product found.");
    if (dryRun) {
      console.log("Would create Product + Price on real run.");
      process.exit(0);
    }
    console.error("Unexpected: failed to create card price.");
    process.exit(1);
  }

  console.log(result.reused ? "Reused existing Stripe catalog:" : "Created Stripe catalog:");
  console.log(`  product_id=${result.product.id}`);
  console.log(`  price_id=${result.price.id}`);
  console.log("");
  console.log("Add to wrangler.toml / Cloudflare env:");
  console.log(`STRIPE_PRICE_ID_PRINT_CARD_4X6 = "${result.price.id}"`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
