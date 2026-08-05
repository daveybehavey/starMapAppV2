#!/usr/bin/env node
/**
 * C1.5 + M1.3 proof without payment.
 * Creates map + print asset + Stripe Checkout sessions via live API; verifies metadata via Stripe API.
 * Every created Checkout Session must carry QA markers (fail-closed before session create).
 */
import { loadDotenv } from "./load-dotenv.mjs";
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
import { extractCheckoutSessionIdFromPayPath } from "./qa-stripe-checkout-url.mjs";
import {
  assertCanonicalQaMetadata,
  assertStripeQaVerificationCapability,
  printAssetIdBindingStatus,
} from "./live-print-conversion-qa.mjs";

export {
  assertTrustedLiveProbeSite,
  resolveTrustedSiteUrlBeforeSecrets,
  CANONICAL_PRODUCTION_SITE_ORIGIN,
} from "./qa-trusted-origin.mjs";

export { extractCheckoutSessionIdFromPayPath } from "./qa-stripe-checkout-url.mjs";
export { printAssetIdBindingStatus } from "./live-print-conversion-qa.mjs";

/**
 * Establish trusted SITE_URL before any token-bearing dotenv load.
 * SITE_URL comes only from the process env or the canonical constant — never from dotenv peeks.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {{ loadSecrets?: () => void }} [hooks]
 */
export function bootstrapTrustedC1M1Site(env = process.env, hooks = {}) {
  const loadSecrets =
    typeof hooks.loadSecrets === "function"
      ? hooks.loadSecrets
      : () => {
          loadDotenv();
        };
  return resolveTrustedSiteUrlBeforeSecrets({
    env,
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

// Fail closed before any Checkout Session creation if QA markers / Stripe verify cannot be guaranteed.
assertStripeQaVerificationCapability(process.env);
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

/**
 * Require strict Stripe handoff shape, then bind session ID to `/c/pay/<session>` only.
 * @param {unknown} url
 * @returns {string | null}
 */
function sessionIdFromStrictCheckoutHandoff(url) {
  try {
    return extractCheckoutSessionIdFromPayPath(url);
  } catch {
    return null;
  }
}

async function retrieveStripeSession(sessionId) {
  const secret = assertStripeQaVerificationCapability(process.env);
  if (!sessionId) {
    throw new Error("BLOCKER: missing Checkout Session ID for independent QA metadata verification.");
  }
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
const cardSessionId = sessionIdFromStrictCheckoutHandoff(cardUrl);
checks.push(
  pass(
    "C1.5 framed+card checkout session created",
    cardCheckout.status === 200 && Boolean(cardSessionId),
    cardSessionId ? "stripe_handoff" : `status_${cardCheckout.status}`
  )
);

const cardSession = await (async () => {
  if (!cardSessionId) {
    checks.push(pass("C1.5 exact persisted QA metadata verified", false, "missing_session_id"));
    return null;
  }
  try {
    return await retrieveStripeSession(cardSessionId);
  } catch {
    checks.push(pass("C1.5 exact persisted QA metadata verified", false, "retrieve_failed"));
    return null;
  }
})();
if (cardSession) {
  const md = cardSession.metadata || {};
  try {
    assertCanonicalQaMetadata(md, LIVE_C1_M1_CHECKOUT_PROOF_QA_SOURCE);
    checks.push(pass("C1.5 exact persisted QA metadata verified", true, "verified"));
  } catch {
    checks.push(pass("C1.5 exact persisted QA metadata verified", false, "qa_metadata_mismatch"));
  }
  checks.push(
    pass("C1.5 metadata print_include_card=true", md.print_include_card === "true", md.print_include_card)
  );
  checks.push(
    pass("C1.5 metadata print_variant=poster_framed", md.print_variant === "poster_framed", md.print_variant)
  );
  {
    const binding = printAssetIdBindingStatus(md.print_asset_id, assetId);
    checks.push(
      pass("C1.5 metadata print_asset_id matches created asset", binding.ok, binding.detail)
    );
  }
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
const stickerSessionId = sessionIdFromStrictCheckoutHandoff(stickerUrl);
checks.push(
  pass(
    "M1.3 sticker merch checkout session created",
    stickerCheckout.status === 200 && Boolean(stickerSessionId),
    stickerSessionId ? "stripe_handoff" : `status_${stickerCheckout.status}`
  )
);

const stickerSession = await (async () => {
  if (!stickerSessionId) {
    checks.push(pass("M1.3 exact persisted QA metadata verified", false, "missing_session_id"));
    return null;
  }
  try {
    return await retrieveStripeSession(stickerSessionId);
  } catch {
    checks.push(pass("M1.3 exact persisted QA metadata verified", false, "retrieve_failed"));
    return null;
  }
})();
if (stickerSession) {
  const md = stickerSession.metadata || {};
  try {
    assertCanonicalQaMetadata(md, LIVE_C1_M1_CHECKOUT_PROOF_QA_SOURCE);
    checks.push(pass("M1.3 exact persisted QA metadata verified", true, "verified"));
  } catch {
    checks.push(pass("M1.3 exact persisted QA metadata verified", false, "qa_metadata_mismatch"));
  }
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
  {
    const binding = printAssetIdBindingStatus(md.print_asset_id, assetId);
    checks.push(
      pass("M1.3 metadata print_asset_id matches created asset", binding.ok, binding.detail)
    );
  }
  checks.push(
    pass(
      "M1.3 metadata print_variant tracks editor context",
      md.print_variant === "poster_framed",
      md.print_variant
    )
  );
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
const c1QaVerified = checks.some(
  (c) => c.label === "C1.5 exact persisted QA metadata verified" && c.ok === true
);
const m1QaVerified = checks.some(
  (c) => c.label === "M1.3 exact persisted QA metadata verified" && c.ok === true
);
const ok = failed.length === 0 && c1QaVerified && m1QaVerified;

const report = {
  phase: "C1.5+M1.3-no-payment",
  summary: { passed: passed.length, failed: failed.length, c1QaVerified, m1QaVerified },
  checks,
  paymentNote: "No payment was made. Stripe sessions expire unpaid.",
  privacyNote: "Identifiers, checkout URLs, and raw provider bodies are omitted from this report.",
};

console.log(JSON.stringify(report, null, 2));
process.exit(ok ? 0 : 1);
