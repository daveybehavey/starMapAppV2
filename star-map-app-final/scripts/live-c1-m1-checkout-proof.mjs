#!/usr/bin/env node
/**
 * C1.5 + M1.3 proof without payment.
 * Creates map + print asset + Stripe Checkout sessions via live API; verifies metadata via Stripe API.
 * Every created Checkout Session must carry QA markers (fail-closed before session create).
 */
import { loadDotenv, peekDotenvValue } from "./load-dotenv.mjs";
import { readWranglerVars } from "./wrangler-vars.mjs";
import {
  assertQaCheckoutDispatchAllowed,
  LIVE_C1_M1_CHECKOUT_PROOF_QA_SOURCE,
} from "./qa-checkout-headers.mjs";
import {
  assertNoRedirectEscape,
  createSecretBearingFetch,
  resolveTrustedSiteUrlBeforeSecrets,
} from "./qa-trusted-origin.mjs";

export {
  assertTrustedLiveProbeSite,
  resolveTrustedSiteUrlBeforeSecrets,
  CANONICAL_PRODUCTION_SITE_ORIGIN,
} from "./qa-trusted-origin.mjs";

/**
 * Establish trusted SITE_URL before any token-bearing dotenv load.
 * Hostile/malformed site input fails before PRINT_ADMIN_TOKEN can be read from dotenv files.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {{
 *   peekSiteUrl?: () => string | undefined,
 *   loadSecrets?: () => void,
 * }} [hooks]
 */
export function bootstrapTrustedC1M1Site(env = process.env, hooks = {}) {
  const peekSiteUrl =
    typeof hooks.peekSiteUrl === "function" ? hooks.peekSiteUrl : () => peekDotenvValue("SITE_URL");
  const loadSecrets =
    typeof hooks.loadSecrets === "function"
      ? hooks.loadSecrets
      : () => {
          loadDotenv();
        };
  return resolveTrustedSiteUrlBeforeSecrets({
    env,
    readSiteUrlFromFiles: peekSiteUrl,
    loadSecrets,
  });
}

// Validate/canonicalize SITE_URL before any PRINT_ADMIN_TOKEN-bearing dotenv load.
const SITE = bootstrapTrustedC1M1Site(process.env);

const wranglerVars = await readWranglerVars(process.cwd());
for (const [key, value] of Object.entries(wranglerVars)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

import { loadQaPrintAssetDataUrl, uploadQaPrintAsset } from "./qa-print-asset.mjs";
import { isQaStripeSession } from "../src/lib/commerceAnalyticsQa.mjs";

const printAssetDataUrl = loadQaPrintAssetDataUrl("proof");

// Fail closed before any Checkout Session creation if QA markers cannot be guaranteed.
assertQaCheckoutDispatchAllowed(LIVE_C1_M1_CHECKOUT_PROOF_QA_SOURCE);

async function post(path, body) {
  const secretBearing = path === "/api/checkout";
  const qaHeaders = secretBearing ? assertQaCheckoutDispatchAllowed(LIVE_C1_M1_CHECKOUT_PROOF_QA_SOURCE) : {};
  const url = `${SITE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...qaHeaders },
    body: JSON.stringify(body),
    ...(secretBearing ? { redirect: /** @type {RequestRedirect} */ ("manual") } : {}),
  });
  if (secretBearing) {
    assertNoRedirectEscape(res, url);
  }
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
  const safeDetail =
    typeof detail === "string" && !/(cs_|https?:\/\/|sk_|[0-9a-f]{8}-[0-9a-f]{4})/i.test(detail)
      ? detail
      : ok
        ? "ok"
        : "failed";
  return { label, ok, detail: safeDetail };
}

function sessionIdFromUrl(url) {
  return url?.match(/(cs_(?:live|test)_[A-Za-z0-9]+)/)?.[1] ?? null;
}

async function retrieveStripeSession(sessionId) {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret || !sessionId) return null;
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(secret, {
    httpClient: Stripe.createFetchHttpClient(createSecretBearingFetch()),
  });
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items", "shipping_cost", "shipping_options"],
  });
}

function lineItemText(session) {
  return (session?.line_items?.data || []).map(
    (li) => li.description || li.price?.product?.name || li.price?.nickname || ""
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
checks.push(
  pass("Map save API", mapRes.status === 200 && Boolean(mapId), mapId ? "map_created" : "map_failed")
);

const assetRes = await uploadQaPrintAsset({
  site: SITE,
  mapId,
  dataUrl: printAssetDataUrl,
  source: "editor",
});
const assetId = assetRes.json?.assetId;
checks.push(
  pass(
    "Print asset upload",
    assetRes.status === 200 && Boolean(assetId),
    assetId ? "asset_created" : "asset_failed"
  )
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
    cardUrl ? "stripe_url" : `status_${cardCheckout.status}`
  )
);

const cardSession = await retrieveStripeSession(cardSessionId);
if (cardSession) {
  const md = cardSession.metadata || {};
  checks.push(
    pass("C1.5 metadata print_include_card=true", md.print_include_card === "true", md.print_include_card)
  );
  checks.push(
    pass("C1.5 metadata print_variant=poster_framed", md.print_variant === "poster_framed", md.print_variant)
  );
  checks.push(
    pass(
      "C1.5 metadata print_asset_id set",
      Boolean(md.print_asset_id),
      md.print_asset_id ? "set" : "missing"
    )
  );
  checks.push(pass("C1.5 QA metadata qa_run=true", md.qa_run === "true", md.qa_run));
  checks.push(
    pass("C1.5 QA metadata recognized by isQaStripeSession", isQaStripeSession(cardSession), "qa_exclusion")
  );
  const names = lineItemText(cardSession);
  checks.push(
    pass(
      "C1.5 line items include framed print",
      names.some((n) => /framed|14/i.test(String(n))),
      names.length ? "line_items_ok" : "line_items_empty"
    )
  );
  checks.push(
    pass(
      "C1.5 line items include greeting card",
      names.some((n) => /card|4.?6|greeting/i.test(String(n))),
      names.length ? "line_items_ok" : "line_items_empty"
    )
  );
  const subtotal = cardSession.amount_subtotal ?? 0;
  checks.push(pass("C1.5 subtotal includes framed + card ($99 + $19)", subtotal >= 11800, String(subtotal)));
} else if (cardSessionId) {
  checks.push({
    label: "C1.5 Stripe session detail (skipped - STRIPE_SECRET_KEY missing)",
    ok: null,
    detail: "skipped",
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
    stickerUrl ? "stripe_url" : `status_${stickerCheckout.status}`
  )
);

const stickerSession = await retrieveStripeSession(stickerSessionId);
if (stickerSession) {
  const md = stickerSession.metadata || {};
  checks.push(
    pass(
      "M1.3 metadata print_merch_family=sticker_kisscut",
      md.print_merch_family === "sticker_kisscut",
      md.print_merch_family
    )
  );
  checks.push(
    pass(
      "M1.3 metadata print_merch_size matches 3x3",
      md.print_merch_size === "3\u00d73",
      md.print_merch_size
    )
  );
  checks.push(
    pass(
      "M1.3 metadata print_merch_catalog_variant_id set",
      Boolean(md.print_merch_catalog_variant_id),
      "set"
    )
  );
  checks.push(pass("M1.3 QA metadata qa_run=true", md.qa_run === "true", md.qa_run));
  checks.push(
    pass(
      "M1.3 QA metadata recognized by isQaStripeSession",
      isQaStripeSession(stickerSession),
      "qa_exclusion"
    )
  );
  const names = lineItemText(stickerSession);
  checks.push(
    pass(
      "M1.3 line items include sticker",
      names.some((n) => /sticker|kiss/i.test(String(n))),
      names.length ? "line_items_ok" : "line_items_empty"
    )
  );
  checks.push(
    pass(
      "M1.3 line items are sticker-only (merch SKU, not framed print line)",
      names.length >= 1 && names.every((n) => /sticker|kiss/i.test(String(n))),
      names.length ? "line_items_ok" : "line_items_empty"
    )
  );
  const subtotal = stickerSession.amount_subtotal ?? 0;
  checks.push(pass("M1.3 sticker subtotal is $9.00", subtotal === 900, String(subtotal)));
  checks.push(pass("M1.3 metadata print_asset_id set for fulfillment", Boolean(md.print_asset_id), "set"));
  checks.push(
    pass(
      "M1.3 metadata print_variant tracks editor context",
      md.print_variant === "poster_framed",
      md.print_variant
    )
  );
} else if (stickerSessionId) {
  checks.push({
    label: "M1.3 Stripe session detail (skipped - STRIPE_SECRET_KEY missing)",
    ok: null,
    detail: "skipped",
  });
}

// --- Editor deep links (marketing surfaces) ---
const cardEditor = await fetch(
  `${SITE}/editor?mode=quick&checkout=print&print_variant=poster_framed&include_card_addon=1&map_id=${encodeURIComponent(mapId)}&source=map-hub`,
  { cache: "no-store" }
);
checks.push(pass("C1.5 editor deep link responds 200", cardEditor.status === 200, String(cardEditor.status)));

const stickerEditor = await fetch(
  `${SITE}/editor?mode=quick&merch_family=sticker_kisscut&map_id=${encodeURIComponent(mapId)}&source=map-hub`,
  { cache: "no-store" }
);
checks.push(
  pass("M1.3 editor merch deep link responds 200", stickerEditor.status === 200, String(stickerEditor.status))
);

const failed = checks.filter((c) => c.ok === false);
const passed = checks.filter((c) => c.ok === true);
const skipped = checks.filter((c) => c.ok === null);

const report = {
  phase: "C1.5+M1.3-no-payment",
  summary: { passed: passed.length, failed: failed.length, skipped: skipped.length },
  checks,
  paymentNote: "No payment was made. Stripe sessions expire unpaid.",
  privacyNote: "Identifiers, checkout URLs, and raw provider bodies are omitted from this report.",
};

console.log(JSON.stringify(report, null, 2));
process.exit(failed.length ? 1 : 0);
