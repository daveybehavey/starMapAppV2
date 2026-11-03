/**
 * #550 (fresh-eyes audit N1, PR #541) — route-level regression tests.
 *
 * The defect (verified at 6c153d51): the Stripe webhook's
 * queuePrintOrder ran all of its guards BEFORE its long awaits (the
 * asset-TTL extensions) and, with a complete recipient, proceeded to
 * native Printful submission — submitPrintfulV2CatalogOrder (merch)
 * or submitPrintfulOrder (v1) — with no fresh stand-down check. An
 * operator resolve landing during the TTL window (the resolve route
 * binds the manually fulfilled order in the authority and projects
 * `sent` to KV; it never calls Printful) therefore did not stop the
 * resumed pass, which submitted a SECOND confirmed provider order;
 * the post-submit authority bind refused only after the provider
 * side effect. The retry route already had the protection
 * (standDownIfFulfillmentMoved, S96 follow-up F-1 / #501); the
 * webhook caller never got it.
 *
 * The fix mirrors the retry route's stand-down into queuePrintOrder
 * at the read that decides dispatch (after the TTL/recipient awaits,
 * immediately before the destination branches): re-read authority +
 * KV, stand down on bound/recovered/terminal lifecycle, a standing
 * alternate claim, an accepted alternate marker, or a moved KV
 * mirror (sent / operatorResolvedAt / a new provider ID); bound
 * state is repaired by projecting the authority onto the fresh
 * record.
 *
 * These tests drive the REAL webhook route and the REAL resolve
 * route against the local KV fallback and the in-memory authority
 * client, with only the external-service seams stubbed (Stripe,
 * Printful v1/V2 submit, alerts, confirmation, post-submit review).
 * The interleaving is deterministic: the resolve is performed INSIDE
 * the stubbed asset-TTL extension, i.e. provably during the webhook
 * pass's own await — the audit's reproduction seam.
 *
 * Assertions: after a mid-pass resolve, ZERO outbound Printful
 * submits on either native path and the resolved record stands;
 * with no resolve, the happy paths are unchanged (exactly one
 * submit each).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

register("./tsAliasLoader.mjs", import.meta.url);
// Literal-file "@/..." specifiers (e.g. commerceAnalyticsQa.mjs in the
// analytics graph) that tsAliasLoader does not map.
register("./gaConsentMode.hooks.mjs", import.meta.url);
// Registered last so its resolve hook runs first for the stubbed seams.
register("./printWebhookResolveRace.hooks.mjs", import.meta.url);

const RUN = Date.now().toString(36);
process.env.STARMAP_KV_ALLOW_LOCAL = "1";
process.env.STARMAP_KV_DIR = fs.mkdtempSync(path.join(os.tmpdir(), `n1-webhook-kv-${RUN}-`));
process.env.STARMAP_PRINT_ORDER_AUTHORITY_LOCAL = "1";
process.env.PRINT_ADMIN_TOKEN = "n1-test-admin-token";
process.env.PRINT_ORDER_SUBMISSION_ENABLED = "1";
process.env.STRIPE_SECRET_KEY = "sk_test_n1_placeholder";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_n1_placeholder";
delete process.env.PRINT_FULFILLMENT_WEBHOOK_URL;
delete process.env.DL1_AUTHORITY_ROUTING_ENABLED;

const { NextRequest } = await import("next/server");
const webhookRoute = await import("../../src/app/api/stripe/webhook/route.ts");
const resolveRoute = await import("../../src/app/api/print/orders/resolve/route.ts");
const { kv } = await import("../../src/lib/kv.ts");
const { printOrderKey } = await import("../../src/lib/printOrders.ts");
const { getPrintOrderAuthorityState } = await import("../../src/lib/printOrderAuthority.ts");

const ADMIN = { "x-print-admin-token": "n1-test-admin-token" };
const PRINT_ASSET_ID = "123e4567-e89b-42d3-a456-426614174000";

/** Pinned-API-shaped paid print checkout session (framed, $99.00, complete recipient). */
function printSession(sessionId, overrides = {}) {
  return {
    id: sessionId,
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    status: "complete",
    amount_total: 9900,
    currency: "usd",
    created: 1767225600,
    customer: "cus_buyer",
    // No customer email: settlement's account-lite upsert needs a
    // coordinator binding this harness does not provide, and nothing
    // on the print path requires it (the recipient comes from
    // shipping_details).
    customer_details: { email: null, name: "Buyer One" },
    customer_email: null,
    payment_intent: `pi_${sessionId}`,
    subscription: null,
    shipping_details: {
      name: "Buyer One",
      address: {
        line1: "1 Main St",
        city: "Victoria",
        state: "BC",
        country: "US",
        postal_code: "90210",
      },
    },
    metadata: {
      order_type: "print",
      print_variant: "poster_framed",
      print_asset_id: PRINT_ASSET_ID,
      qa_run: "true",
    },
    total_details: { amount_discount: 0, breakdown: { discounts: [] } },
    ...overrides,
  };
}

function merchSession(sessionId) {
  return printSession(sessionId, {
    metadata: {
      order_type: "print",
      print_asset_id: PRINT_ASSET_ID,
      print_merch_family: "sticker_kisscut",
      print_merch_catalog_variant_id: "12345",
      qa_run: "true",
    },
  });
}

function postJson(url, body, headers = {}) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** Deliver a checkout.session.completed event through the REAL webhook route. */
async function postCompleted(session) {
  const event = {
    id: `evt_n1_${session.id}`,
    object: "event",
    type: "checkout.session.completed",
    created: 1767225700,
    data: { object: session },
  };
  const payload = JSON.stringify(event);
  const req = new Request("https://starmapco.test/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=stub", "content-type": "application/json" },
    body: payload,
  });
  return webhookRoute.POST(req);
}

/** The operator resolve, through the REAL resolve route. */
async function operatorResolve(sessionId, printfulOrderId) {
  const res = await resolveRoute.POST(
    postJson(
      "https://starmapco.com/api/print/orders/resolve",
      { sessionId, printfulOrderId },
      ADMIN,
    ),
  );
  assert.equal(res.status, 200, "resolve route must accept the manual order");
  return res;
}

let counter = 0;
function nextSessionId() {
  counter += 1;
  return `cs_test_n1_${RUN}_${counter}`;
}

function resetSeams() {
  globalThis.__whSubmitCalls = [];
  globalThis.__whSubmitCallsV2 = [];
  globalThis.__whTtlHook = undefined;
  globalThis.__whStripeRetrieve = undefined;
}

/** Install the interleaving: the resolve lands inside the webhook's TTL await. */
function resolveDuringTtl(sessionId, printfulOrderId) {
  let resolved = false;
  globalThis.__whTtlHook = async () => {
    if (resolved) return;
    resolved = true;
    await operatorResolve(sessionId, printfulOrderId);
  };
}

test("N1 (v1): resolve with a provider ID lands during the TTL await -> zero Printful submits, resolved record stands", async () => {
  resetSeams();
  const sessionId = nextSessionId();
  resolveDuringTtl(sessionId, "777001");

  const res = await postCompleted(printSession(sessionId));
  assert.equal(res.status, 200);

  assert.equal(globalThis.__whSubmitCalls.length, 0, "no v1 Printful submission after a mid-pass resolve");
  assert.equal(globalThis.__whSubmitCallsV2.length, 0, "no V2 Printful submission either");
  const stored = await kv.get(printOrderKey(sessionId));
  assert.equal(stored.status, "sent");
  assert.equal(String(stored.printfulOrderId), "777001");
  assert.equal(typeof stored.operatorResolvedAt, "number");
  const authority = await getPrintOrderAuthorityState(sessionId);
  assert.equal(authority.lifecycle, "bound");
  assert.equal(authority.printfulOrderId, "777001");
});

test("N1 (v2): resolve with a provider ID lands during the TTL await of a merch order -> zero Printful submits on either native path", async () => {
  resetSeams();
  const sessionId = nextSessionId();
  resolveDuringTtl(sessionId, "777002");

  const res = await postCompleted(merchSession(sessionId));
  assert.equal(res.status, 200);

  assert.equal(globalThis.__whSubmitCallsV2.length, 0, "no V2 catalog submission after a mid-pass resolve");
  assert.equal(globalThis.__whSubmitCalls.length, 0, "no v1 submission either");
  const stored = await kv.get(printOrderKey(sessionId));
  assert.equal(stored.status, "sent");
  assert.equal(String(stored.printfulOrderId), "777002");
  assert.equal(typeof stored.operatorResolvedAt, "number");
  const authority = await getPrintOrderAuthorityState(sessionId);
  assert.equal(authority.lifecycle, "bound");
  assert.equal(authority.printfulOrderId, "777002");
});

test("N1: resolve with NO provider ID lands during the TTL await -> authority stays unbound, the resolved KV mirror still stands the pass down", async () => {
  resetSeams();
  const sessionId = nextSessionId();
  resolveDuringTtl(sessionId, "");

  const res = await postCompleted(printSession(sessionId));
  assert.equal(res.status, 200);

  assert.equal(globalThis.__whSubmitCalls.length, 0, "no Printful submission after a mid-pass resolve");
  assert.equal(globalThis.__whSubmitCallsV2.length, 0);
  const authority = await getPrintOrderAuthorityState(sessionId);
  assert.equal(authority.lifecycle, "unbound");
  const stored = await kv.get(printOrderKey(sessionId));
  assert.equal(stored.status, "sent");
  assert.equal(typeof stored.operatorResolvedAt, "number");
});

test("N1 happy path (v1): no resolve -> exactly one Printful submit, order sent with the submitted provider ID", async () => {
  resetSeams();
  const sessionId = nextSessionId();
  globalThis.__whSubmitOrderId = 555001;

  const res = await postCompleted(printSession(sessionId));
  assert.equal(res.status, 200);

  assert.equal(globalThis.__whSubmitCalls.length, 1, "exactly one outbound v1 submission");
  assert.equal(globalThis.__whSubmitCalls[0].externalId, sessionId);
  assert.equal(globalThis.__whSubmitCallsV2.length, 0);
  const stored = await kv.get(printOrderKey(sessionId));
  assert.equal(stored.status, "sent");
  assert.equal(String(stored.printfulOrderId), "555001");
  const authority = await getPrintOrderAuthorityState(sessionId);
  assert.equal(authority.lifecycle, "bound");
  assert.equal(authority.printfulOrderId, "555001");
});

test("N1 happy path (v2): no resolve -> exactly one V2 catalog submit for a merch order", async () => {
  resetSeams();
  const sessionId = nextSessionId();
  globalThis.__whSubmitOrderIdV2 = 666001;

  const res = await postCompleted(merchSession(sessionId));
  assert.equal(res.status, 200);

  assert.equal(globalThis.__whSubmitCallsV2.length, 1, "exactly one outbound V2 submission");
  assert.equal(globalThis.__whSubmitCallsV2[0].externalId, sessionId);
  assert.equal(globalThis.__whSubmitCallsV2[0].catalogVariantId, 12345);
  assert.equal(globalThis.__whSubmitCalls.length, 0, "merch never submits via v1");
  const stored = await kv.get(printOrderKey(sessionId));
  assert.equal(stored.status, "sent");
  assert.equal(String(stored.printfulOrderId), "666001");
});

test("source: the stand-down sits after the TTL awaits and before both native submissions, and consults authority + KV", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const source = fs.readFileSync(
    path.join(root, "src/app/api/stripe/webhook/route.ts"),
    "utf8",
  );
  const start = source.indexOf("async function queuePrintOrder");
  assert.ok(start > 0, "queuePrintOrder present");
  const segment = source.slice(start);
  const ttlIdx = segment.indexOf("await extendPrintAssetTtlForFulfillment(printAssetId)");
  const standDownDefIdx = segment.indexOf("const standDownIfFulfillmentMoved");
  const standDownCallIdx = segment.indexOf("if (await standDownIfFulfillmentMoved()) return;");
  const v2Idx = segment.indexOf("submitPrintfulV2CatalogOrder({");
  const v1Idx = segment.indexOf("submitPrintfulOrder({");
  assert.ok(ttlIdx > 0, "TTL extension present");
  assert.ok(standDownDefIdx > ttlIdx, "stand-down is defined after the TTL awaits");
  assert.ok(standDownCallIdx > standDownDefIdx, "stand-down is invoked after its definition");
  assert.ok(standDownCallIdx < v2Idx, "stand-down precedes the Printful V2 submission");
  assert.ok(standDownCallIdx < v1Idx, "stand-down precedes the Printful v1 submission");
  const helper = segment.slice(standDownDefIdx, standDownCallIdx);
  assert.match(helper, /getPrintOrderAuthorityState\(session\.id\)/);
  assert.match(helper, /kv\.get<PrintOrderRecord>\(printOrderKey\(session\.id\)\)/);
  assert.match(helper, /operatorResolvedAt/);
  assert.match(helper, /alternateDispatchClaim/);
  assert.match(helper, /projectPrintOrderWithAuthority/);
});
