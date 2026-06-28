#!/usr/bin/env node
/**
 * Phase 1A-2B: unframed print proof without payment.
 * Creates map + print asset + Stripe Checkout session via live API; does not pay.
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

const SITE = (process.env.SITE_URL || "https://starmapco.com").replace(/\/+$/, "");
const TINY_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxISEhUQEhIVFhUVFRUVFRUVFRUWFhUXFhUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OGxAQGy0lICUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAXAAEBAQEAAAAAAAAAAAAAAAAAAQID/8QAFhEBAQEAAAAAAAAAAAAAAAAAAAER/9oADAMBAAIQAxAAAAGqP//EABQQAQAAAAAAAAAAAAAAAAAAAJD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAJD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAJD/2gAIAQEAAT8hf//Z";

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

const checks = [];

// Gate: missing asset rejected
const gate = await post("/api/checkout", {
  orderType: "print",
  printVariant: "poster_unframed",
  shippingCountry: "US",
});
checks.push(
  pass(
    "Print checkout rejects missing asset",
    gate.status === 400 && gate.json?.code === "missing_print_asset",
    `status=${gate.status} code=${gate.json?.code}`,
  ),
);

const mapRes = await post("/api/maps", {
  version: 1,
  seed: "phase1a-2b-unframed-proof",
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
      text: "Phase 1A-2B proof",
      fontFamily: "cinzel",
      color: "#d7b56c",
      size: 40,
      align: "center",
    },
  ],
  renderOptions: {
    visualMode: "enhanced",
    starIntensity: "normal",
    starGlow: true,
    constellationLines: "thin",
    constellationLabels: false,
    showGrid: false,
    showPlanets: true,
    premiumStars: "off",
    premiumPlanets: "off",
    planetEmphasis: "highlighted",
    showMoon: true,
    moonSize: "large",
    shapeMask: "rectangle",
    frameEnabled: true,
  },
});
const mapId = mapRes.json?.id ?? mapRes.json?.mapId;
checks.push(pass("Map save API", mapRes.status === 200 && Boolean(mapId), mapId || mapRes.text));

const assetRes = await post("/api/print/assets", {
  mapId,
  dataUrl: TINY_JPEG,
  source: "editor",
});
const assetId = assetRes.json?.assetId;
const assetUrl = assetRes.json?.assetUrl;
checks.push(
  pass("Print asset upload", assetRes.status === 200 && Boolean(assetId), assetId || assetRes.text),
);

let assetGetStatus = 0;
let assetContentType = "";
if (assetUrl) {
  const assetGet = await fetch(assetUrl);
  assetGetStatus = assetGet.status;
  assetContentType = assetGet.headers.get("content-type") || "";
}
checks.push(
  pass(
    "Print asset retrievable",
    assetGetStatus === 200 && assetContentType.includes("image"),
    `${assetGetStatus} ${assetContentType}`,
  ),
);

const checkoutRes = await post("/api/checkout", {
  plan: "single",
  orderType: "print",
  printVariant: "poster_unframed",
  includeDigitalAddOn: false,
  printAssetId: assetId,
  mapId,
  shippingCountry: "US",
});
const checkoutUrl = checkoutRes.json?.url;
const sessionId = checkoutUrl?.match(/(cs_(?:live|test)_[A-Za-z0-9]+)/)?.[1] ?? null;
checks.push(
  pass(
    "Unframed checkout session created",
    checkoutRes.status === 200 && Boolean(checkoutUrl),
    checkoutUrl ? `${sessionId}` : checkoutRes.text,
  ),
);

let stripeSession = null;
if (sessionId && process.env.STRIPE_SECRET_KEY?.trim()) {
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY.trim());
  stripeSession = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items", "shipping_cost", "shipping_options"],
  });
  const md = stripeSession.metadata || {};
  checks.push(
    pass("Stripe metadata order_type=print", md.order_type === "print", md.order_type),
  );
  checks.push(
    pass("Stripe metadata print_variant=poster_unframed", md.print_variant === "poster_unframed", md.print_variant),
  );
  checks.push(
    pass("Stripe metadata print_include_digital=false", md.print_include_digital === "false", md.print_include_digital),
  );
  checks.push(
    pass("Stripe metadata print_asset_id set", md.print_asset_id === assetId, md.print_asset_id),
  );
  checks.push(
    pass("Stripe metadata print_shipping_country=US", md.print_shipping_country === "US", md.print_shipping_country),
  );
  checks.push(
    pass(
      "Stripe metadata print_shipping_charge_cents=462",
      md.print_shipping_charge_cents === "462",
      md.print_shipping_charge_cents,
    ),
  );
  const amountSubtotal = stripeSession.amount_subtotal ?? null;
  checks.push(
    pass("Stripe product subtotal $49.00", amountSubtotal === 4900, String(amountSubtotal)),
  );
  const shippingAmount = stripeSession.shipping_cost?.amount_subtotal ?? stripeSession.total_details?.amount_shipping ?? null;
  checks.push(
    pass("Stripe shipping ~$4.62", shippingAmount === 462, String(shippingAmount)),
  );
  const lineNames = (stripeSession.line_items?.data || []).map((li) => li.description || li.price?.product?.name || "");
  checks.push(
    pass(
      "Stripe line item mentions poster/unframed",
      lineNames.some((n) => /poster|unframed|18/i.test(String(n))),
      lineNames.join(" | "),
    ),
  );
  const submitMsg = stripeSession.custom_text?.submit?.message || "";
  checks.push(
    pass("Stripe submit message is print-specific", /print order/i.test(submitMsg), submitMsg),
  );
  checks.push(
    pass("No free shipping in session", !/free shipping/i.test(JSON.stringify(stripeSession)), "checked"),
  );
} else if (sessionId) {
  checks.push({
    label: "Stripe session detail (skipped — STRIPE_SECRET_KEY not in env)",
    ok: null,
    detail: "Set STRIPE_SECRET_KEY locally to verify metadata/shipping amounts",
  });
}

const editorRes = await fetch(`${SITE}/editor?mode=quick&checkout=print&print_variant=poster_unframed&shipping_country=US`);
const editorHtml = await editorRes.text();
checks.push(pass("Editor route responds 200", editorRes.status === 200, String(editorRes.status)));
checks.push(
  pass(
    "Editor HTML includes print checkout enabled signals",
    /print_variant=poster_unframed|PRINT_CHECKOUT|Unframed poster/i.test(editorHtml),
    "html scan",
  ),
);

const failed = checks.filter((c) => c.ok === false);
const passed = checks.filter((c) => c.ok === true);
const skipped = checks.filter((c) => c.ok === null);

const report = {
  site: SITE,
  phase: "1A-2B-unframed-no-payment",
  mapId,
  assetId,
  sessionId,
  checkoutUrl: checkoutUrl || null,
  summary: {
    passed: passed.length,
    failed: failed.length,
    skipped: skipped.length,
  },
  checks,
  autoConfirmNote: "Production wrangler.toml: PRINTFUL_AUTO_CONFIRM=false (manual Printful approval)",
  paymentNote: "No payment was made.",
};

console.log(JSON.stringify(report, null, 2));
process.exit(failed.length ? 1 : 0);
