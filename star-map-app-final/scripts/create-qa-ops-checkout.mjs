#!/usr/bin/env node
/**
 * QA checkout with $0 shipping baked into the Stripe session (promo codes on the
 * hosted page cannot remove shipping). Uses live map/asset + Stripe metadata the
 * webhook expects. No payment until you open the URL and complete checkout.
 *
 * Usage:
 *   node scripts/create-qa-ops-checkout.mjs --kind sticker
 *   node scripts/create-qa-ops-checkout.mjs --kind card-bundle
 *   node scripts/create-qa-ops-checkout.mjs --kind sticker --country CA
 *   node scripts/create-qa-ops-checkout.mjs --kind card-bundle --asset proof   # use proof (default); tiny rejected by upload validation
 */
import { loadDotenv } from "./load-dotenv.mjs";
import { readWranglerVars } from "./wrangler-vars.mjs";
import { loadQaPrintAssetDataUrl, parseQaAssetArg, uploadQaPrintAsset } from "./qa-print-asset.mjs";

loadDotenv();
const wranglerVars = await readWranglerVars(process.cwd());
for (const [key, value] of Object.entries(wranglerVars)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

const SITE = (process.env.SITE_URL || "https://starmapco.com").replace(/\/+$/, "");
const kindArg = process.argv.find((_, i) => process.argv[i - 1] === "--kind") || "sticker";
const countryArg = (
  process.argv.find((_, i) => process.argv[i - 1] === "--country") || "US"
)
  .trim()
  .toUpperCase();
if (!/^[A-Z]{2}$/.test(countryArg)) {
  console.error('Invalid --country (use ISO code, e.g. "US" or "CA")');
  process.exit(1);
}
const assetArg = parseQaAssetArg(process.argv);
if (assetArg === "tiny") {
  console.error(
    "--asset tiny is no longer supported for checkout uploads (print asset validation requires real dimensions). Use --asset proof (default).",
  );
  process.exit(1);
}
let printAssetDataUrl;
try {
  printAssetDataUrl = loadQaPrintAssetDataUrl(assetArg);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

async function post(path, body) {
  const res = await fetch(`${SITE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
if (!stripeSecret) {
  console.error("Missing STRIPE_SECRET_KEY");
  process.exit(1);
}

const Stripe = (await import("stripe")).default;
const stripe = new Stripe(stripeSecret);

const freeShippingOptions = [
  {
    shipping_rate_data: {
      type: "fixed_amount",
      fixed_amount: { amount: 0, currency: "usd" },
      display_name: "QA free shipping",
    },
  },
];

async function createOneTimeDiscount(input) {
  const coupon = await stripe.coupons.create({
    ...input.coupon,
    duration: "once",
    max_redemptions: 1,
    name: input.name,
  });
  const promotion = await stripe.promotionCodes.create({
    coupon: coupon.id,
    code: input.code,
    active: true,
    max_redemptions: 1,
    restrictions: { first_time_transaction: false },
  });
  return { coupon, promotion };
}

const mapRes = await post("/api/maps", {
  version: 1,
  seed: `qa-ops-${kindArg}`,
  datetimeISO: "2024-06-15T12:00:00.000Z",
  location: {
    name: "New York, NY, USA",
    latitude: 40.7128,
    longitude: -74.006,
    timezone: "America/New_York",
  },
  selectedStyle: "navyGold",
  aspectRatio: "square",
  shape: "rectangle",
  textBoxes: [{ id: "t1", text: "QA ops test", fontFamily: "cinzel", color: "#d7b56c", size: 40, align: "center" }],
  renderOptions: { visualMode: "enhanced", constellationLines: "thin" },
});
const mapId = mapRes.json?.id;
if (mapRes.status !== 200 || !mapId) {
  console.error("Map save failed", mapRes);
  process.exit(1);
}

const assetRes = await uploadQaPrintAsset({ site: SITE, mapId, dataUrl: printAssetDataUrl, source: "editor" });
const assetId = assetRes.json?.assetId;
if (assetRes.status !== 200 || !assetId) {
  console.error("Print asset upload failed", assetRes);
  process.exit(1);
}

const baseMetadata = {
  order_type: "print",
  map_id: mapId,
  print_asset_id: assetId,
  print_include_digital: "false",
  print_include_card: "false",
  print_shipping_country: countryArg,
  print_shipping_charge_cents: "0",
  plan: "single",
  credits: "1",
  qa_ops_checkout: "true",
};

let lineItems;
let metadata;
let discount;
let label;

if (kindArg === "card-bundle") {
  const framedPrice = process.env.STRIPE_PRICE_ID_PRINT_FRAMED?.trim();
  const cardPrice = process.env.STRIPE_PRICE_ID_PRINT_CARD_4X6?.trim();
  const framedLine = framedPrice
    ? { price: framedPrice, quantity: 1 }
    : {
        price_data: {
          currency: "usd",
          unit_amount: Number.parseInt(process.env.PRINT_FRAMED_PRICE_CENTS || "9900", 10),
          product_data: { name: "Custom Star Map — Framed print (14x14)" },
        },
        quantity: 1,
      };
  const cardLine = cardPrice
    ? { price: cardPrice, quantity: 1 }
    : {
        price_data: {
          currency: "usd",
          unit_amount: Number.parseInt(process.env.PRINT_CARD_4X6_PRICE_CENTS || "1900", 10),
          product_data: { name: "Custom Star Map — Greeting card (4×6)" },
        },
        quantity: 1,
      };
  lineItems = [framedLine, cardLine];
  metadata = {
    ...baseMetadata,
    print_variant: "poster_framed",
    print_include_card: "true",
  };
  const code = `QACARD${Date.now().toString(36).toUpperCase().slice(-6)}`;
  discount = await createOneTimeDiscount({
    code,
    name: `QA card bundle 99% (${code})`,
    coupon: { percent_off: 99 },
  });
  label = "C1.5 framed + card (99% off products, $0 shipping)";
} else if (kindArg === "sticker") {
  const stickerPrice = process.env.STRIPE_PRICE_ID_MERCH_STICKERS?.trim();
  if (!stickerPrice) {
    console.error("Missing STRIPE_PRICE_ID_MERCH_STICKERS");
    process.exit(1);
  }
  lineItems = [{ price: stickerPrice, quantity: 1 }];
  metadata = {
    ...baseMetadata,
    print_variant: "poster_framed",
    print_merch_family: "sticker_kisscut",
    print_merch_catalog_variant_id: "10163",
    print_merch_size: "3×3",
  };
  const code = `QASTKR${Date.now().toString(36).toUpperCase().slice(-6)}`;
  // $9 sticker -> $1 after $8 off (webhook min charge is $1.00)
  discount = await createOneTimeDiscount({
    code,
    name: `QA sticker $8 off (${code})`,
    coupon: { amount_off: 800, currency: "usd" },
  });
  label = "M1.3 sticker ($1 product + $0 shipping)";
} else {
  console.error('Unknown --kind. Use "sticker" or "card-bundle".');
  process.exit(1);
}

const session = await stripe.checkout.sessions.create({
  mode: "payment",
  success_url: `${SITE}/success?session_id={CHECKOUT_SESSION_ID}&map_id=${encodeURIComponent(mapId)}&order_type=print&print_variant=${encodeURIComponent(metadata.print_variant)}`,
  cancel_url: `${SITE}/editor?map_id=${encodeURIComponent(mapId)}`,
  client_reference_id: mapId,
  line_items: lineItems,
  metadata,
  discounts: [{ promotion_code: discount.promotion.id }],
  shipping_address_collection: { allowed_countries: [countryArg] },
  shipping_options: freeShippingOptions,
  phone_number_collection: { enabled: true },
  billing_address_collection: "required",
  consent_collection: { terms_of_service: "required" },
  custom_text: {
    submit: { message: "QA test order — print fulfillment after checkout" },
    terms_of_service_acceptance: {
      message: `I agree to the [Terms of Service](${SITE}/terms) and [Privacy Policy](${SITE}/privacy)`,
    },
  },
});

console.log(
  JSON.stringify(
    {
      label,
      mapId,
      assetId,
      promoCode: discount.promotion.code,
      promoNote: "Discount is already applied — do not need MAPQA99.",
      printAsset: assetArg,
      expectedTotalCents: kindArg === "sticker" ? "~100 (+ tax if any)" : "~118 (+ tax if any)",
      shippingCountry: countryArg,
      shipping: "$0 (QA free shipping)",
      checkoutUrl: session.url,
      sessionId: session.id,
    },
    null,
    2,
  ),
);
