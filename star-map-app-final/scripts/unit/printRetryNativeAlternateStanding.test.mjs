/**
 * Audit A3 — native retry must refuse when an alternate-dispatch claim
 * or attempted/accepted marker is already standing.
 *
 * Defect: standDownIfFulfillmentMoved is change-only against the
 * admission snapshot. A claim/marker left by a prior alternate
 * dispatch (response lost → "attempted", claim standing) compares
 * equal and is treated as "not moved". When fulfilment config later
 * flips to native Printful, the native branches submitted a second
 * physical order with no claim/marker gate.
 *
 * These tests drive the REAL retry route against local KV + in-memory
 * authority, reusing the F-1 stubbed seams (Stripe, Printful submit,
 * alerts, confirmation, asset TTL, post-submit). Assertions: standing
 * claim + attempted marker, or a pre-written accepted marker, yield
 * 409 alternate_dispatch_reconciliation_required with ZERO Printful
 * submits; a clean retry (no claim, no marker) still dispatches once.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

register("./tsAliasLoader.mjs", import.meta.url);
register("./printRetryResolveRace.hooks.mjs", import.meta.url);

const RUN = Date.now().toString(36);
process.env.STARMAP_KV_ALLOW_LOCAL = "1";
process.env.STARMAP_KV_DIR = fs.mkdtempSync(path.join(os.tmpdir(), `a3-retry-kv-${RUN}-`));
process.env.STARMAP_PRINT_ORDER_AUTHORITY_LOCAL = "1";
process.env.PRINT_ADMIN_TOKEN = "a3-test-admin-token";
process.env.PRINT_ORDER_SUBMISSION_ENABLED = "1";
process.env.STRIPE_SECRET_KEY = "sk_test_a3_placeholder";
delete process.env.PRINT_FULFILLMENT_WEBHOOK_URL;

const { NextRequest } = await import("next/server");
const retryRoute = await import("../../src/app/api/print/orders/retry/route.ts");
const { kv } = await import("../../src/lib/kv.ts");
const {
  alternateFulfillmentDispatchId,
  printOrderKey,
} = await import("../../src/lib/printOrders.ts");
const {
  claimAlternateFulfillmentDispatch,
  getPrintOrderAuthorityState,
  releaseAlternateFulfillmentDispatchClaim,
  seedPrintOrderAuthorityFromKv,
  __resetPrintOrderAuthorityMemoryForTests,
} = await import("../../src/lib/printOrderAuthority.ts");

const ADMIN = { "x-print-admin-token": "a3-test-admin-token" };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function paidSession(overrides = {}) {
  return {
    id: "cs_test_placeholder",
    object: "checkout.session",
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    amount_total: 10600,
    currency: "usd",
    payment_method_types: ["card"],
    metadata: { order_type: "print", print_variant: "poster_framed" },
    total_details: { amount_discount: 0, breakdown: { discounts: [] } },
    customer_details: { email: "buyer@example.com", name: "Buyer", phone: "+12065550137" },
    customer_email: "buyer@example.com",
    shipping_details: {
      name: "Buyer",
      address: {
        line1: "1 Main St",
        city: "Victoria",
        state: "BC",
        country: "US",
        postal_code: "90210",
      },
    },
    ...overrides,
  };
}

function retryableRecord(sessionId, overrides = {}) {
  return {
    status: "failed",
    sessionId,
    mapId: "map_a3",
    printVariant: "poster_framed",
    includesDigitalAddOn: false,
    amountTotal: 10600,
    currency: "usd",
    customerEmail: "buyer@example.com",
    customerName: "Buyer",
    customerPhone: "+12065550137",
    shippingDetails: {
      name: "Buyer",
      address: {
        line1: "1 Main St",
        city: "Victoria",
        state: "BC",
        country: "US",
        postal_code: "90210",
      },
    },
    printAssetId: "asset_a3",
    attempts: 1,
    createdAt: Date.now(),
    error: "printful_order_failed",
    terminalEventType: null,
    ...overrides,
  };
}

function postJson(url, body, headers = {}) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function runRetry(sessionId) {
  return retryRoute.POST(
    postJson("https://starmapco.com/api/print/orders/retry", { sessionId }, ADMIN),
  );
}

let counter = 0;
async function seedCase(overrides = {}) {
  counter += 1;
  const sessionId = `cs_test_a3native${RUN}${counter}`;
  const dispatchId = alternateFulfillmentDispatchId(sessionId);
  const record = retryableRecord(sessionId, overrides);
  await kv.set(printOrderKey(sessionId), record);
  globalThis.__f1SubmitCalls = [];
  globalThis.__f1SubmitOrderId = 555301;
  globalThis.__f1StripeRetrieve = async () => paidSession({ id: sessionId });
  return { sessionId, record, dispatchId };
}

test("A3: standing alternate claim + attempted marker bars native dispatch (409, zero submits)", async () => {
  __resetPrintOrderAuthorityMemoryForTests();
  const attemptedAt = Date.now() - 60_000;
  const { sessionId, dispatchId } = await seedCase();
  const marker = { dispatchId, state: "attempted", attemptedAt };
  await kv.set(printOrderKey(sessionId), retryableRecord(sessionId, { alternateDispatch: marker }));
  await seedPrintOrderAuthorityFromKv(sessionId, await kv.get(printOrderKey(sessionId)));
  const claim = await claimAlternateFulfillmentDispatch(sessionId, dispatchId);
  // Seed-from-marker already planted the claim; a second claim observes it.
  assert.equal(claim.ok, true);
  assert.equal(claim.claimAcquired, false);
  const authority = await getPrintOrderAuthorityState(sessionId);
  assert.ok(authority?.alternateDispatchClaim, "standing claim must be present before the retry");
  assert.equal(authority.alternateDispatchClaim.dispatchId, dispatchId);

  const res = await runRetry(sessionId);
  const body = await res.json();

  assert.equal(res.status, 409);
  assert.equal(body.error, "alternate_dispatch_reconciliation_required");
  assert.equal(body.dispatchId, dispatchId);
  assert.equal(globalThis.__f1SubmitCalls.length, 0, "native Printful must not be called");
});

test("A3: accepted alternate marker bars native dispatch (409, zero submits)", async () => {
  __resetPrintOrderAuthorityMemoryForTests();
  const { sessionId, dispatchId } = await seedCase();
  const marker = {
    dispatchId,
    state: "accepted",
    attemptedAt: Date.now() - 120_000,
    respondedAt: Date.now() - 119_000,
    httpStatus: 200,
  };
  await kv.set(printOrderKey(sessionId), retryableRecord(sessionId, { alternateDispatch: marker }));
  await seedPrintOrderAuthorityFromKv(sessionId, await kv.get(printOrderKey(sessionId)));

  const res = await runRetry(sessionId);
  const body = await res.json();

  assert.equal(res.status, 409);
  assert.equal(body.error, "alternate_dispatch_reconciliation_required");
  assert.equal(body.dispatchId, dispatchId);
  assert.equal(globalThis.__f1SubmitCalls.length, 0, "native Printful must not be called");
});

test("A3: clean native retry (no claim, no marker) still dispatches exactly once", async () => {
  __resetPrintOrderAuthorityMemoryForTests();
  const { sessionId } = await seedCase();
  const authorityBefore = await getPrintOrderAuthorityState(sessionId);
  assert.equal(authorityBefore?.alternateDispatchClaim ?? null, null);

  const res = await runRetry(sessionId);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.status, "sent");
  assert.equal(globalThis.__f1SubmitCalls.length, 1, "exactly one native submit on a clean retry");
  assert.equal(globalThis.__f1SubmitCalls[0].externalId, sessionId);
});

test("A3: accepted marker alone after claim release still bars native dispatch", async () => {
  __resetPrintOrderAuthorityMemoryForTests();
  const { sessionId, dispatchId } = await seedCase();
  const marker = {
    dispatchId,
    state: "accepted",
    attemptedAt: Date.now() - 90_000,
    respondedAt: Date.now() - 89_000,
    httpStatus: 200,
  };
  await kv.set(printOrderKey(sessionId), retryableRecord(sessionId, { alternateDispatch: marker }));
  await seedPrintOrderAuthorityFromKv(sessionId, await kv.get(printOrderKey(sessionId)));
  const released = await releaseAlternateFulfillmentDispatchClaim(sessionId, dispatchId);
  assert.equal(released.ok, true);
  const authority = await getPrintOrderAuthorityState(sessionId);
  assert.equal(authority?.alternateDispatchClaim ?? null, null, "claim released; marker alone must still block");

  const res = await runRetry(sessionId);
  const body = await res.json();

  assert.equal(res.status, 409);
  assert.equal(body.error, "alternate_dispatch_reconciliation_required");
  assert.equal(body.dispatchId, dispatchId);
  assert.equal(globalThis.__f1SubmitCalls.length, 0);
});

test("A3 source: native standing-claim/marker gate sits before both native submits and leaves alternate protocol intact", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "src/app/api/print/orders/retry/route.ts"),
    "utf8",
  );
  const gateDef = source.indexOf("refuseNativeIfAlternateDispatchStanding");
  const gateCall = source.indexOf("blockedByAlternateStanding");
  const v2Submit = source.indexOf("await submitPrintfulV2CatalogOrder({");
  const v1Submit = source.indexOf("await submitPrintfulOrder({");
  const alternateGate = source.indexOf(
    "if (alternateDispatchBlocksRedispatch(hydrated.alternateDispatch))",
  );
  const alternateClaim = source.indexOf(
    "await claimAlternateFulfillmentDispatch(sessionId, dispatchId)",
  );
  assert.ok(gateDef > 0, "A3 helper present");
  assert.ok(gateCall > gateDef, "A3 helper is invoked");
  assert.ok(gateCall < v2Submit, "A3 gate runs before merch V2 native submit");
  assert.ok(gateCall < v1Submit, "A3 gate runs before poster V1 native submit");
  assert.ok(alternateGate > v1Submit, "alternate marker gate remains after native branches");
  assert.ok(alternateClaim > alternateGate, "alternate claim protocol remains intact");
  assert.match(source, /alternateDispatchBlocksRedispatch\(freshRecord\.alternateDispatch\)/);
  assert.match(source, /freshAuthority\.alternateDispatchClaim/);
  assert.match(
    source.slice(gateDef, gateCall),
    /print_order_authority_unread/,
    "A3 re-read fails closed with the existing unread posture",
  );
});
