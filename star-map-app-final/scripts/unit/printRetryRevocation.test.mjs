/**
 * A-01 (audit loop, 2026-11-03; issue #540) — route-level regression
 * tests for the admin retry route's revocation gate.
 *
 * The defect: the retry route decided dispatch from the print
 * record, the authority lifecycle, and the Stripe payment gate —
 * none of which consult revocation. A purchase refunded after its
 * order failed could be dispatched to Printful by an operator retry,
 * manufacturing a print the store no longer holds the money for.
 *
 * These tests drive the REAL retry route against the local KV
 * fallback and the in-memory authority client, reusing the F-1
 * suite's stubbed seams (Stripe retrieve, Printful submit, alerts,
 * confirmation, asset TTL, post-submit review). Assertions: with an
 * observed revocation — via the session record flag, the PI
 * tombstone, or the session-revoked sidecar — the retry refuses 409
 * print_order_revocation_blocked with ZERO outbound Printful
 * submits; with a clean paid record the happy path is unchanged
 * (exactly one submit).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);
// Registered last so its resolve hook runs first for the stubbed seams.
register("./printRetryResolveRace.hooks.mjs", import.meta.url);

const RUN = Date.now().toString(36);
process.env.STARMAP_KV_ALLOW_LOCAL = "1";
process.env.STARMAP_KV_DIR = fs.mkdtempSync(path.join(os.tmpdir(), `a01-retry-kv-${RUN}-`));
process.env.STARMAP_PRINT_ORDER_AUTHORITY_LOCAL = "1";
process.env.PRINT_ADMIN_TOKEN = "a01-test-admin-token";
process.env.PRINT_ORDER_SUBMISSION_ENABLED = "1";
process.env.STRIPE_SECRET_KEY = "sk_test_a01_placeholder";
delete process.env.PRINT_FULFILLMENT_WEBHOOK_URL;

const { NextRequest } = await import("next/server");
const retryRoute = await import("../../src/app/api/print/orders/retry/route.ts");
const { kv } = await import("../../src/lib/kv.ts");
const { printOrderKey } = await import("../../src/lib/printOrders.ts");
const { ENTITLEMENT_KV } = await import("../../src/lib/entitlementsStore.ts");

const ADMIN = { "x-print-admin-token": "a01-test-admin-token" };

/** Pinned-API-shaped paid print checkout session (framed, $106.00). */
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
    mapId: "map_a01",
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
    printAssetId: "asset_a01",
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
async function seedCase(entitlementSeed) {
  counter += 1;
  const sessionId = `cs_test_a01retry${RUN}${counter}`;
  const paymentIntentId = `pi_a01_${RUN}_${counter}`;
  await kv.set(printOrderKey(sessionId), retryableRecord(sessionId));
  if (entitlementSeed) {
    await entitlementSeed(sessionId, paymentIntentId);
  }
  globalThis.__f1SubmitCalls = [];
  globalThis.__f1SubmitOrderId = 555901;
  globalThis.__f1StripeRetrieve = async () => paidSession({ id: sessionId });
  return { sessionId, paymentIntentId };
}

async function expectRevocationBlocked(sessionId) {
  const res = await runRetry(sessionId);
  const body = await res.json();
  assert.equal(res.status, 409);
  assert.equal(body.error, "print_order_revocation_blocked");
  assert.equal(
    globalThis.__f1SubmitCalls.length,
    0,
    "no Printful submission for a revoked purchase",
  );
  const stored = await kv.get(printOrderKey(sessionId));
  assert.equal(stored.status, "failed");
  assert.equal(stored.error, "print_order_revocation_blocked");
}

test("A-01 retry: session record revoked flag -> 409, zero submits", async () => {
  const { sessionId } = await seedCase(async (id, pi) => {
    await kv.set(ENTITLEMENT_KV.stripeSession(id), {
      paid: true,
      revoked: true,
      reason: "refund",
      paymentIntentId: pi,
    });
  });
  await expectRevocationBlocked(sessionId);
});

test("A-01 retry: PI tombstone only (record unflagged) -> 409, zero submits", async () => {
  const { sessionId } = await seedCase(async (id, pi) => {
    await kv.set(ENTITLEMENT_KV.stripeSession(id), {
      paid: true,
      revoked: false,
      paymentIntentId: pi,
    });
    await kv.set(`stripe:pi:revoked:${pi}`, { revoked: true, reason: "dispute" });
  });
  await expectRevocationBlocked(sessionId);
});

test("A-01 retry: session-revoked sidecar only -> 409, zero submits", async () => {
  const { sessionId } = await seedCase(async (id, pi) => {
    await kv.set(ENTITLEMENT_KV.stripeSession(id), {
      paid: true,
      revoked: false,
      paymentIntentId: pi,
    });
    await kv.set(ENTITLEMENT_KV.sessionRevoked(id), {
      revoked: true,
      reason: "refund",
      revokedAt: Date.now(),
    });
  });
  await expectRevocationBlocked(sessionId);
});

test("A-01 retry happy path: clean paid record -> exactly one Printful submit, order sent", async () => {
  const { sessionId } = await seedCase(async (id, pi) => {
    await kv.set(ENTITLEMENT_KV.stripeSession(id), {
      paid: true,
      revoked: false,
      paymentIntentId: pi,
    });
  });
  const res = await runRetry(sessionId);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.status, "sent");
  assert.equal(globalThis.__f1SubmitCalls.length, 1, "exactly one outbound Printful submission");
  assert.equal(globalThis.__f1SubmitCalls[0].externalId, sessionId);
  const stored = await kv.get(printOrderKey(sessionId));
  assert.equal(stored.status, "sent");
  assert.equal(String(stored.printfulOrderId), "555901");
});
