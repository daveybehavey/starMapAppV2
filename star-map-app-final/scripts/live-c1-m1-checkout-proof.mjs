#!/usr/bin/env node
/**
 * C1.5 + M1.3 proof without payment.
 * Creates map + print asset + Stripe Checkout sessions via live API; verifies metadata via Stripe API.
 */
import { loadDotenv } from "./load-dotenv.mjs";
import { readWranglerVars } from "./wrangler-vars.mjs";

loadDotenv();
const wranglerVars = await readWranglerVars(process.cwd());
for (const [key, value] of Object.entries(wranglerVars)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

import { loadQaPrintAssetDataUrl, uploadQaPrintAsset } from "./qa-print-asset.mjs";

const SITE = (process.env.SITE_URL || "https://starmapco.com").replace(/\/+$/, "");
const printAssetDataUrl = loadQaPrintAssetDataUrl("proof");

async function post(path, body) {
  const res = await fetch(`${SITE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text: text.slice(0, 800) };
}

function pass(label, ok, detail) {
  return { label, ok, detail };
}

function sessionIdFromUrl(url) {
  return url?.match(/(cs_(?:live|test)_[A-Za-z0-9]+)/)?.[1] ?? null;
}

async function retrieveStripeSession(sessionId) {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret || !sessionId) return null;
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(secret);
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items", "shipping_cost", "shipping_options"],
  });
}

function lineItemText(session) {
  return (session?.line_items?.data || []).map(
    (li) => li.description || li.price?.product?.name || li.price?.nickname || "",
  );
}

const checks = [];

// --- Shared fixtures ---
const mapRes = await post("/api/maps", {
  version: 1,
  seed: "c1-m1-checkout-proof",
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
  textBoxes: [
    {
      id: "title",
      label: "Title",
      text: "C1/M1 proof",
      fontFamily: "cinzel",
      color: "#d7b56c",
      size: 40,
      align: "center",
    },
  ],
  renderOptions: { visualMode: "enhanced", constellationLines: "thin" },
});
const mapId = mapRes.json?.id ?? mapRes.json?.mapId;
checks.push(pass("Map save API", mapRes.status === 200 && Boolean(mapId), mapId || mapRes.text));

const assetRes = await uploadQaPrintAsset({ site: SITE, mapId, dataUrl: printAssetDataUrl, source: "editor" });
const assetId = assetRes.json?.assetId;
checks.push(
  pass("Print asset upload", assetRes.status === 200 && Boolean(assetId), assetId || assetRes.text),
);

// --- C1.5: Framed + greeting card add-on ---
const cardCheckout = await post("/api/checkout", {
  plan: "single",
  orderType: "print",
  printVariant: "poster_framed",
  includeDigitalAddOn: false,
  includeCardAddOn: true,
  printAssetId: assetId,
  mapId,
  shippingCountry: "US",
});
const cardUrl = cardCheckout.json?.url;
const cardSessionId = sessionIdFromUrl(cardUrl);
checks.push(
  pass(
    "C1.5 framed+card checkout session created",
    cardCheckout.status === 200 && Boolean(cardUrl),
    cardUrl ? cardSessionId : cardCheckout.text,
  ),
);

const cardSession = await retrieveStripeSession(cardSessionId);
if (cardSession) {
  const md = cardSession.metadata || {};
  checks.push(pass("C1.5 metadata print_include_card=true", md.print_include_card === "true", md.print_include_card));
  checks.push(
    pass("C1.5 metadata print_variant=poster_framed", md.print_variant === "poster_framed", md.print_variant),
  );
  checks.push(pass("C1.5 metadata print_asset_id set", md.print_asset_id === assetId, md.print_asset_id));
  const names = lineItemText(cardSession);
  checks.push(
    pass(
      "C1.5 line items include framed print",
      names.some((n) => /framed|14/i.test(String(n))),
      names.join(" | "),
    ),
  );
  checks.push(
    pass(
      "C1.5 line items include greeting card",
      names.some((n) => /card|4.?6|greeting/i.test(String(n))),
      names.join(" | "),
    ),
  );
  const subtotal = cardSession.amount_subtotal ?? 0;
  checks.push(
    pass("C1.5 subtotal includes framed + card ($99 + $19)", subtotal >= 11800, String(subtotal)),
  );
} else if (cardSessionId) {
  checks.push({
    label: "C1.5 Stripe session detail (skipped - STRIPE_SECRET_KEY missing)",
    ok: null,
    detail: cardSessionId,
  });
}

// --- M1.3: Sticker merch on framed print ---
const stickerCheckout = await post("/api/checkout", {
  plan: "single",
  orderType: "print",
  printVariant: "poster_framed",
  merchFamily: "sticker_kisscut",
  merchOptions: { size: "3x3" },
  printAssetId: assetId,
  mapId,
  shippingCountry: "US",
});
const stickerUrl = stickerCheckout.json?.url;
const stickerSessionId = sessionIdFromUrl(stickerUrl);
checks.push(
  pass(
    "M1.3 sticker merch checkout session created",
    stickerCheckout.status === 200 && Boolean(stickerUrl),
    stickerUrl ? stickerSessionId : stickerCheckout.text,
  ),
);

const stickerSession = await retrieveStripeSession(stickerSessionId);
if (stickerSession) {
  const md = stickerSession.metadata || {};
  checks.push(
    pass("M1.3 metadata print_merch_family=sticker_kisscut", md.print_merch_family === "sticker_kisscut", md.print_merch_family),
  );
  checks.push(
    pass(
      "M1.3 metadata print_merch_size matches 3x3",
      md.print_merch_size === "3\u00d73",
      md.print_merch_size,
    ),
  );
  checks.push(
    pass("M1.3 metadata print_merch_catalog_variant_id set", Boolean(md.print_merch_catalog_variant_id), md.print_merch_catalog_variant_id),
  );
  const names = lineItemText(stickerSession);
  checks.push(
    pass(
      "M1.3 line items include sticker",
      names.some((n) => /sticker|kiss/i.test(String(n))),
      names.join(" | "),
    ),
  );
  checks.push(
    pass(
      "M1.3 line items are sticker-only (merch SKU, not framed print line)",
      names.length >= 1 && names.every((n) => /sticker|kiss/i.test(String(n))),
      names.join(" | "),
    ),
  );
  const subtotal = stickerSession.amount_subtotal ?? 0;
  checks.push(
    pass("M1.3 sticker subtotal is $9.00", subtotal === 900, String(subtotal)),
  );
  checks.push(
    pass("M1.3 metadata print_asset_id set for fulfillment", md.print_asset_id === assetId, md.print_asset_id),
  );
  checks.push(
    pass("M1.3 metadata print_variant tracks editor context", md.print_variant === "poster_framed", md.print_variant),
  );
} else if (stickerSessionId) {
  checks.push({
    label: "M1.3 Stripe session detail (skipped - STRIPE_SECRET_KEY missing)",
    ok: null,
    detail: stickerSessionId,
  });
}

// --- Editor deep links (marketing surfaces) ---
const cardEditor = await fetch(
  `${SITE}/editor?mode=quick&checkout=print&print_variant=poster_framed&include_card_addon=1&map_id=${encodeURIComponent(mapId)}&source=map-hub`,
  { cache: "no-store" },
);
checks.push(
  pass("C1.5 editor deep link responds 200", cardEditor.status === 200, String(cardEditor.status)),
);

const stickerEditor = await fetch(
  `${SITE}/editor?mode=quick&merch_family=sticker_kisscut&map_id=${encodeURIComponent(mapId)}&source=map-hub`,
  { cache: "no-store" },
);
checks.push(
  pass("M1.3 editor merch deep link responds 200", stickerEditor.status === 200, String(stickerEditor.status)),
);

const failed = checks.filter((c) => c.ok === false);
const passed = checks.filter((c) => c.ok === true);
const skipped = checks.filter((c) => c.ok === null);

const report = {
  site: SITE,
  phase: "C1.5+M1.3-no-payment",
  mapId,
  assetId,
  sessions: {
    cardBundle: { id: cardSessionId, url: cardUrl || null },
    stickerMerch: { id: stickerSessionId, url: stickerUrl || null },
  },
  summary: { passed: passed.length, failed: failed.length, skipped: skipped.length },
  checks,
  paymentNote: "No payment was made. Stripe sessions expire unpaid.",
};

console.log(JSON.stringify(report, null, 2));
process.exit(failed.length ? 1 : 0);
