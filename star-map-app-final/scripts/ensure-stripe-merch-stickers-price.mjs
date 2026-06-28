/**
 * Idempotent: ensure live Stripe Product + Price for sticker_kisscut merch ($9.00 USD default).
 * Safe — creates catalog objects only; no charges.
 *
 * Usage: node scripts/ensure-stripe-merch-stickers-price.mjs
 * Optional: --dry-run
 */
import Stripe from "stripe";
import { loadDotenv } from "./load-dotenv.mjs";

loadDotenv();

const dryRun = process.argv.includes("--dry-run");
const secret = process.env.STRIPE_SECRET_KEY?.trim() || "";
const targetCents = Number.parseInt(process.env.NEXT_PUBLIC_MERCH_STICKERS_PRICE_CENTS || "900", 10);
const label = (process.env.NEXT_PUBLIC_MERCH_STICKERS_LABEL || "Kiss-cut stickers").trim();

if (!secret) {
  console.error("Missing STRIPE_SECRET_KEY");
  process.exit(1);
}
if (!Number.isFinite(targetCents) || targetCents <= 0) {
  console.error("Invalid NEXT_PUBLIC_MERCH_STICKERS_PRICE_CENTS");
  process.exit(1);
}

const stripe = new Stripe(secret, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

const METADATA = {
  merch_family: "sticker_kisscut",
  printful_catalog_product_id: "358",
  starmapco_sku: "merch_sticker_kisscut",
};

async function findExistingPrice() {
  const search = await stripe.products.search({
    query: "metadata['starmapco_sku']:'merch_sticker_kisscut'",
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
      description: "Custom star map kiss-cut stickers — Printful fulfilled",
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
    console.log("No existing sticker merch product found.");
    if (dryRun) {
      console.log("Would create Product + Price on real run.");
      process.exit(0);
    }
    console.error("Unexpected: failed to create sticker price.");
    process.exit(1);
  }

  console.log(result.reused ? "Reused existing Stripe catalog:" : "Created Stripe catalog:");
  console.log(`  product_id=${result.product.id}`);
  console.log(`  price_id=${result.price.id}`);
  console.log("");
  console.log("Add to wrangler.toml / Cloudflare env:");
  console.log(`STRIPE_PRICE_ID_MERCH_STICKERS = "${result.price.id}"`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
