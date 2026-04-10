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
    const idx = trimmed.indexOf("=");
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  });
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const stripeSecret = process.env.STRIPE_SECRET_KEY;
if (!stripeSecret) {
  console.error("Missing STRIPE_SECRET_KEY in .env.local");
  process.exit(1);
}

const stripe = new Stripe(stripeSecret, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
  timeout: 20_000,
});

function printUsage() {
  console.log(`Usage:
  node scripts/create-stripe-promo-code.mjs --code PRINT10 --percent 10 --scope any_print [options]

Required:
  --code <CODE>                 Promotion code shown to buyers
  --percent <1-100>             Percent discount
  --scope <scope>               single_digital | print_framed | print_unframed | any_print | any

Optional:
  --max-redemptions <count>     Limit total redemptions
  --first-time-only <true|false> Restrict to first-time customers (default: false)
  --name <coupon_name>          Internal Stripe coupon name
  --dry-run                     Resolve scope and show plan without creating anything

Examples:
  node scripts/create-stripe-promo-code.mjs --code PRINT10 --percent 10 --scope any_print
  node scripts/create-stripe-promo-code.mjs --code REDDIT50 --percent 50 --scope single_digital --max-redemptions 15
`);
}

function readArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function normalizeScope(value) {
  const normalized = (value ?? "").trim().toLowerCase();
  switch (normalized) {
    case "single_digital":
    case "print_framed":
    case "print_unframed":
    case "any_print":
    case "any":
      return normalized;
    default:
      return null;
  }
}

function parseBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes"].includes(normalized)) return true;
  if (["0", "false", "no"].includes(normalized)) return false;
  return fallback;
}

function getScopedPriceIds(scope) {
  const digital = process.env.STRIPE_PRICE_ID_SINGLE?.trim();
  const framed = process.env.STRIPE_PRICE_ID_PRINT_FRAMED?.trim();
  const unframed = process.env.STRIPE_PRICE_ID_PRINT_UNFRAMED?.trim();

  switch (scope) {
    case "single_digital":
      return digital ? [digital] : [];
    case "print_framed":
      return framed ? [framed] : [];
    case "print_unframed":
      return unframed ? [unframed] : [];
    case "any_print":
      return [framed, unframed].filter(Boolean);
    case "any":
    default:
      return [];
  }
}

async function resolveProductIds(priceIds) {
  const uniquePriceIds = Array.from(new Set(priceIds.filter(Boolean)));
  const productIds = new Set();
  for (const priceId of uniquePriceIds) {
    const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
    const productId = typeof price.product === "string" ? price.product : price.product?.id;
    if (!productId) {
      throw new Error(`Could not resolve product for Stripe price ${priceId}`);
    }
    productIds.add(productId);
  }
  return Array.from(productIds);
}

async function findExistingPromotionCode(code) {
  let startingAfter;
  for (;;) {
    const page = await stripe.promotionCodes.list({
      code,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    const exact = page.data.find(
      (promotion) => typeof promotion.code === "string" && promotion.code.trim().toUpperCase() === code,
    );
    if (exact) return exact;
    if (!page.has_more || page.data.length === 0) return null;
    startingAfter = page.data[page.data.length - 1]?.id;
  }
}

async function main() {
  if (hasFlag("--help")) {
    printUsage();
    return;
  }

  const code = readArg("--code")?.trim().toUpperCase();
  const percent = Number.parseFloat(readArg("--percent") ?? "");
  const scope = normalizeScope(readArg("--scope"));
  const maxRedemptionsRaw = readArg("--max-redemptions");
  const maxRedemptions =
    maxRedemptionsRaw && Number.isFinite(Number.parseInt(maxRedemptionsRaw, 10))
      ? Number.parseInt(maxRedemptionsRaw, 10)
      : 0;
  const firstTimeOnly = parseBoolean(readArg("--first-time-only"), false);
  const dryRun = hasFlag("--dry-run");
  const name =
    readArg("--name")?.trim() ||
    `StarMapCo ${code || "promo"} ${Number.isFinite(percent) ? `${percent}%` : ""}`.trim();

  if (!code || !/^[A-Z0-9_-]{3,40}$/.test(code)) {
    console.error("Invalid or missing --code");
    process.exit(1);
  }
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
    console.error("Invalid or missing --percent");
    process.exit(1);
  }
  if (!scope) {
    console.error("Invalid or missing --scope");
    process.exit(1);
  }

  const priceIds = getScopedPriceIds(scope);
  const productIds = await resolveProductIds(priceIds);

  console.log(`Preparing promotion code ${code}`);
  console.log(`- percent off: ${percent}`);
  console.log(`- scope: ${scope}`);
  console.log(`- first time only: ${firstTimeOnly ? "yes" : "no"}`);
  console.log(`- max redemptions: ${maxRedemptions > 0 ? String(maxRedemptions) : "unlimited"}`);
  if (productIds.length) {
    console.log(`- scoped products: ${productIds.join(", ")}`);
  } else {
    console.log("- scoped products: none (global)");
  }

  const existing = await findExistingPromotionCode(code);
  if (existing) {
    console.log(`Promotion code already exists: ${existing.id}`);
    return;
  }

  if (dryRun) {
    console.log("Dry run complete.");
    return;
  }

  const coupon = await stripe.coupons.create({
    percent_off: percent,
    duration: "once",
    name,
    ...(maxRedemptions > 0 ? { max_redemptions: maxRedemptions } : {}),
    ...(productIds.length ? { applies_to: { products: productIds } } : {}),
  });

  const promotionCode = await stripe.promotionCodes.create({
    coupon: coupon.id,
    code,
    active: true,
    ...(maxRedemptions > 0 ? { max_redemptions: maxRedemptions } : {}),
    restrictions: {
      first_time_transaction: firstTimeOnly,
    },
  });

  console.log("Created Stripe promotion:");
  console.log(`- coupon: ${coupon.id}`);
  console.log(`- promotion code id: ${promotionCode.id}`);
  console.log(`- code: ${code}`);
}

main().catch((error) => {
  console.error("Failed to create Stripe promo code:", error);
  process.exit(1);
});
