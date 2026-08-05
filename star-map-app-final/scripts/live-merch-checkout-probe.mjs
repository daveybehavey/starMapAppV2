#!/usr/bin/env node
/**
 * Live probe: map save, share page, merch + print checkout API (no payment).
 * Checkout Session creation requires QA metadata headers (fail-closed).
 * Usage: node scripts/live-merch-checkout-probe.mjs [--site https://starmapco.com]
 */

import {
  assertQaCheckoutDispatchAllowed,
  LIVE_MERCH_CHECKOUT_PROBE_QA_SOURCE,
} from "./qa-checkout-headers.mjs";
import {
  assertNoRedirectEscape,
  assertTrustedLiveProbeSite,
  CANONICAL_PRODUCTION_SITE_ORIGIN,
} from "./qa-trusted-origin.mjs";
import {
  assertHostedStripeCheckoutUrl,
  extractCheckoutSessionIdFromPayPath,
  isStrictStripeCheckoutHandoff,
} from "./qa-stripe-checkout-url.mjs";

/**
 * Resolve and canonicalize `--site` before any PRINT_ADMIN_TOKEN access.
 * @param {string[]} [argv]
 * @returns {string}
 */
export function resolveMerchProbeSite(argv = process.argv) {
  const raw = argv.find((a, i) => argv[i - 1] === "--site") || CANONICAL_PRODUCTION_SITE_ORIGIN;
  return assertTrustedLiveProbeSite(raw);
}

/**
 * True only for HTTP 200 + strict Stripe Checkout handoff (no substring host checks).
 * @param {number} status
 * @param {unknown} url
 */
export function isStrictMerchCheckoutUrlOk(status, url) {
  return status === 200 && isStrictStripeCheckoutHandoff(url);
}

export {
  assertHostedStripeCheckoutUrl,
  extractCheckoutSessionIdFromPayPath,
  isStrictStripeCheckoutHandoff,
};

/**
 * Build a secret-bearing checkout fetch init.
 * Trusted-origin validation runs before any PRINT_ADMIN_TOKEN read/attachment.
 * Uses redirect:"manual" so credentials cannot follow a 3xx escape.
 *
 * @param {string} site Trusted or candidate site origin (validated first)
 * @param {Record<string, unknown>} body
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function buildQaCheckoutFetchInit(site, body, env = process.env) {
  assertTrustedLiveProbeSite(site);
  const headers = assertQaCheckoutDispatchAllowed(LIVE_MERCH_CHECKOUT_PROBE_QA_SOURCE, env);
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
    redirect: /** @type {RequestRedirect} */ ("manual"),
  };
}

function ok(name, passed, detail = "") {
  // Aggregate/category-only details — never echo IDs or URLs.
  const safeDetail = detail && !/(cs_|https?:\/\/|[0-9a-f]{8}-[0-9a-f]{4})/i.test(detail) ? detail : "";
  console.log(`[${passed ? "PASS" : "FAIL"}] ${name}${safeDetail ? ` — ${safeDetail}` : ""}`);
  return passed;
}

async function main() {
  // Fail closed on untrusted --site before any admin-token read or attachment.
  const site = resolveMerchProbeSite(process.argv);

  let failed = false;
  const run = (name, passed, detail) => {
    if (!ok(name, passed, detail)) failed = true;
  };

  console.log("Live merch checkout probe\n");

  const shop = await fetch(`${site}/shop`, { cache: "no-store" }).then((r) => r.text());
  run("/shop 200", shop.length > 1000, `bytes=${shop.length}`);
  run("shop merch section", shop.includes('id="merch-addons"'), "merch-addons anchor");
  run("shop sticker CTA", shop.includes("merch_family=sticker_kisscut"), "deep link");

  const editorRes = await fetch(`${site}/editor?mode=quick&merch_family=sticker_kisscut`, {
    cache: "no-store",
  });
  run("/editor merch deep link", editorRes.status === 200, `status=${editorRes.status}`);

  const recipe = {
    version: 1,
    seed: "probe",
    datetimeISO: "2020-06-15T22:30:00.000Z",
    location: { name: "New York, NY", latitude: 40.7128, longitude: -74.006, timezone: "America/New_York" },
    textBoxes: [
      {
        id: "t1",
        text: "Probe night sky",
        fontFamily: "playfair",
        color: "#ffffff",
        size: 24,
        align: "center",
        position: { x: 0.5, y: 0.2 },
      },
    ],
    selectedStyle: "navyGold",
    aspectRatio: "square",
    shape: "circle",
    renderOptions: { visualMode: "realistic" },
  };

  const mapRes = await fetch(`${site}/api/maps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(recipe),
  });
  const mapJson = await mapRes.json().catch(() => ({}));
  run("POST /api/maps", mapRes.status === 200 && Boolean(mapJson.id), `status=${mapRes.status}`);

  if (mapJson.id) {
    const getRes = await fetch(`${site}/api/maps?id=${encodeURIComponent(mapJson.id)}`, {
      cache: "no-store",
    });
    run("GET /api/maps?id=", getRes.status === 200, `status=${getRes.status}`);

    const shareRes = await fetch(`${site}/m/${mapJson.id}`, { cache: "no-store" });
    const shareHtml = await shareRes.text();
    run("GET /m/:id share page", shareRes.status === 200, `status=${shareRes.status}`);
    run("share page map hub section", shareHtml.includes('id="shop-this-map"'), "shop-this-map anchor");
    run("share page HD CTA", shareHtml.includes("checkout=hd"), "map hub HD link");
    run(
      "share page edit CTA",
      shareHtml.includes("map_id=") && shareHtml.includes("source=map-hub"),
      "editor deep links"
    );

    // Rejection path does not create a Checkout Session — safe without QA headers.
    const noAsset = await fetch(`${site}/api/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mapId: mapJson.id,
        plan: "single",
        orderType: "print",
        printVariant: "poster_framed",
        merchFamily: "sticker_kisscut",
        merchOptions: { size: "3×3" },
        shippingCountry: "US",
      }),
    });
    const noAssetJson = await noAsset.json().catch(() => ({}));
    run(
      "merch checkout rejects missing print asset",
      noAsset.status === 400 && noAssetJson.code === "missing_print_asset",
      `status=${noAsset.status} code=${noAssetJson.code}`
    );

    // Session-creating paths require QA markers; stop before dispatch when unavailable.
    // Token is only read after site trust above.
    let qaHeadersReady = true;
    try {
      assertQaCheckoutDispatchAllowed(LIVE_MERCH_CHECKOUT_PROBE_QA_SOURCE);
    } catch (error) {
      qaHeadersReady = false;
      run(
        "QA marker capability before session create",
        false,
        error instanceof Error ? error.message : "qa_markers_unavailable"
      );
    }

    if (qaHeadersReady) {
      const fakeAsset = "00000000-0000-4000-8000-000000000001";
      const checkoutUrl = `${site}/api/checkout`;
      const merchCheckout = await fetch(
        checkoutUrl,
        buildQaCheckoutFetchInit(site, {
          mapId: mapJson.id,
          plan: "single",
          orderType: "print",
          printVariant: "poster_framed",
          merchFamily: "sticker_kisscut",
          merchOptions: { size: "3×3" },
          shippingCountry: "US",
          printAssetId: fakeAsset,
        })
      );
      assertNoRedirectEscape(merchCheckout, checkoutUrl);
      const merchJson = await merchCheckout.json().catch(() => ({}));
      const merchUrlOk = isStrictMerchCheckoutUrlOk(merchCheckout.status, merchJson.url);
      run(
        "merch checkout returns Stripe URL",
        merchUrlOk,
        `status=${merchCheckout.status} code=${merchJson.code || "ok"}`
      );

      const cardCheckout = await fetch(
        checkoutUrl,
        buildQaCheckoutFetchInit(site, {
          mapId: mapJson.id,
          plan: "single",
          orderType: "print",
          printVariant: "poster_framed",
          includeCardAddOn: true,
          includeDigitalAddOn: false,
          shippingCountry: "US",
          printAssetId: fakeAsset,
        })
      );
      assertNoRedirectEscape(cardCheckout, checkoutUrl);
      const cardJson = await cardCheckout.json().catch(() => ({}));
      run(
        "card add-on checkout (fake asset)",
        cardCheckout.status === 200 || cardCheckout.status === 400,
        `status=${cardCheckout.status} code=${cardJson.code || (cardJson.url ? "stripe_url" : "none")}`
      );
    } else {
      run("merch checkout session create skipped", true, "fail_closed_before_untagged_session");
      run("card add-on checkout session create skipped", true, "fail_closed_before_untagged_session");
    }
  }

  console.log(failed ? "\nProbe result: FAILED" : "\nProbe result: PASSED");
  process.exit(failed ? 1 : 0);
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("live-merch-checkout-probe.mjs") ||
    process.argv[1].includes("live-merch-checkout-probe"));

if (isDirectRun) {
  main().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    const safe = /(cs_|https?:\/\/|sk_|Bearer)/i.test(message)
      ? "Live merch checkout probe failed (details redacted)."
      : message;
    console.error(safe);
    process.exit(1);
  });
}
