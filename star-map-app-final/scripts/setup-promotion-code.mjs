import fs from "node:fs";
import path from "node:path";
import Stripe from "stripe";

const cwd = process.cwd();

const loadEnvFile = (filename) => {
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
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  });
};

loadEnvFile(".env.local");
loadEnvFile(".env");

const stripeSecret = process.env.STRIPE_SECRET_KEY;
if (!stripeSecret) {
  console.error("Missing STRIPE_SECRET_KEY in .env.local");
  process.exit(1);
}

const couponCode = (process.env.PROMOTION_COUPON_CODE ?? "FIRST50").trim().toUpperCase();
const percentOff = Number.parseFloat(process.env.PROMOTION_COUPON_PERCENT ?? "50");
const maxRedemptions = Number.parseInt(process.env.PROMOTION_COUPON_MAX_REDEMPTIONS ?? "0", 10);
const firstTimeOnly = (process.env.PROMOTION_COUPON_FIRST_TIME_ONLY ?? "true").toLowerCase() !== "false";
const scopeToSingleDigital =
  (process.env.PROMOTION_COUPON_DIGITAL_SINGLE_ONLY ?? "true").toLowerCase() !== "false";
const singleDigitalPriceId = (process.env.STRIPE_PRICE_ID_SINGLE ?? "").trim();

if (!Number.isFinite(percentOff) || percentOff <= 0 || percentOff > 100) {
  console.error("PROMOTION_COUPON_PERCENT must be between 0 and 100");
  process.exit(1);
}

const stripe = new Stripe(stripeSecret, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
  timeout: 20_000,
});

function upsertEnvValue(filePath, key, value) {
  const line = `${key}=${value}`;
  const exists = fs.existsSync(filePath);
  const content = exists ? fs.readFileSync(filePath, "utf8") : "";
  const pattern = new RegExp(`^${key}=.*$`, "m");

  const next = pattern.test(content)
    ? content.replace(pattern, line)
    : `${content}${content && !content.endsWith("\n") ? "\n" : ""}${line}\n`;

  fs.writeFileSync(filePath, next, "utf8");
}

async function findExistingPromotionCode(code) {
  let startingAfter = undefined;
  for (;;) {
    const page = await stripe.promotionCodes.list({
      active: true,
      code,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    const exact = page.data.find((promotion) => promotion.code.toUpperCase() === code);
    if (exact) return exact;
    if (!page.has_more || page.data.length === 0) return null;
    startingAfter = page.data[page.data.length - 1].id;
  }
}

async function resolveCouponProductScope() {
  if (!scopeToSingleDigital) return null;
  if (!singleDigitalPriceId) {
    console.warn("STRIPE_PRICE_ID_SINGLE missing; coupon scope will not be restricted to digital single.");
    return null;
  }

  try {
    const price = await stripe.prices.retrieve(singleDigitalPriceId, { expand: ["product"] });
    const productId = typeof price.product === "string" ? price.product : price.product?.id;
    if (!productId) {
      console.warn("Could not resolve Stripe product for STRIPE_PRICE_ID_SINGLE; coupon scope left unrestricted.");
      return null;
    }
    return productId;
  } catch (error) {
    console.warn("Could not load STRIPE_PRICE_ID_SINGLE for coupon scope; coupon scope left unrestricted.", error);
    return null;
  }
}

async function main() {
  console.log(`Setting up Stripe promotion code: ${couponCode} (${percentOff}% off)`);

  const existingPromotion = await findExistingPromotionCode(couponCode);
  if (existingPromotion) {
    console.log(`Promotion code already exists: ${existingPromotion.id}`);
    upsertEnvValue(path.resolve(cwd, ".env.local"), "PROMOTION_COUPON_CODE", couponCode);
    upsertEnvValue(path.resolve(cwd, ".env.local"), "STRIPE_PROMO_CODE_ID", existingPromotion.id);
    console.log("Updated .env.local with PROMOTION_COUPON_CODE + STRIPE_PROMO_CODE_ID");
    return;
  }

  const scopedProductId = await resolveCouponProductScope();

  const coupon = await stripe.coupons.create({
    percent_off: percentOff,
    duration: "once",
    name: `StarMap signup ${percentOff}% off`,
    ...(maxRedemptions > 0 ? { max_redemptions: maxRedemptions } : {}),
    ...(scopedProductId ? { applies_to: { products: [scopedProductId] } } : {}),
  });

  const promotionCode = await stripe.promotionCodes.create({
    coupon: coupon.id,
    code: couponCode,
    active: true,
    ...(maxRedemptions > 0 ? { max_redemptions: maxRedemptions } : {}),
    restrictions: {
      first_time_transaction: firstTimeOnly,
    },
  });

  upsertEnvValue(path.resolve(cwd, ".env.local"), "PROMOTION_COUPON_CODE", couponCode);
  upsertEnvValue(path.resolve(cwd, ".env.local"), "STRIPE_PROMO_CODE_ID", promotionCode.id);

  console.log("Created Stripe coupon + promotion code:");
  console.log(`- coupon: ${coupon.id}`);
  console.log(`- promotion code: ${promotionCode.id}`);
  if (scopedProductId) {
    console.log(`- scoped product: ${scopedProductId} (single digital price)`);
  }
  console.log("Updated .env.local with PROMOTION_COUPON_CODE + STRIPE_PROMO_CODE_ID");
}

main().catch((error) => {
  console.error("Failed to set up promotion code:", error);
  process.exit(1);
});
