#!/usr/bin/env node
/**
 * One-time QA promotion code in live Stripe (does not touch wrangler / FIRST50).
 * Enter the code on the Stripe Checkout page after starting checkout from the site.
 */
import { loadDotenv } from "./load-dotenv.mjs";

loadDotenv();

const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
if (!stripeSecret) {
  console.error("Missing STRIPE_SECRET_KEY in .env.local");
  process.exit(1);
}

const codeArg = process.argv.find((a, i) => process.argv[i - 1] === "--code");
const percentArg = process.argv.find((a, i) => process.argv[i - 1] === "--percent");
const code = (codeArg || process.env.QA_PROMO_CODE || "MAPQA99").trim().toUpperCase();
const percentOff = Number.parseFloat(percentArg || process.env.QA_PROMO_PERCENT || "99");

if (!Number.isFinite(percentOff) || percentOff <= 0 || percentOff > 100) {
  console.error("--percent must be between 0 and 100");
  process.exit(1);
}

const Stripe = (await import("stripe")).default;
const stripe = new Stripe(stripeSecret);

async function findExisting(codeValue) {
  const page = await stripe.promotionCodes.list({ code: codeValue, active: true, limit: 20 });
  return page.data.find((p) => p.code?.toUpperCase() === codeValue) ?? null;
}

const existing = await findExisting(code);
if (existing) {
  console.log(JSON.stringify({
    status: "already_exists",
    code,
    promotionCodeId: existing.id,
    maxRedemptions: existing.max_redemptions,
    timesRedeemed: existing.times_redeemed,
    note: "Enter this code on the Stripe Checkout page (Add promotion code).",
  }, null, 2));
  process.exit(0);
}

const coupon = await stripe.coupons.create({
  percent_off: percentOff,
  duration: "once",
  name: `QA one-time ${percentOff}% off (${code})`,
  max_redemptions: 1,
});

const promotion = await stripe.promotionCodes.create({
  coupon: coupon.id,
  code,
  active: true,
  max_redemptions: 1,
  restrictions: {
    first_time_transaction: false,
  },
});

console.log(JSON.stringify({
  status: "created",
  code,
  percentOff,
  couponId: coupon.id,
  promotionCodeId: promotion.id,
  maxRedemptions: 1,
  howToUse: [
    "1. Start checkout normally on starmapco.com (editor or share page).",
    "2. On the Stripe Checkout page, click Add promotion code.",
    `3. Enter: ${code}`,
    "4. Pay the discounted total (product ~1% + shipping still applies).",
    "5. Code is single-use — one test order only.",
  ],
}, null, 2));
