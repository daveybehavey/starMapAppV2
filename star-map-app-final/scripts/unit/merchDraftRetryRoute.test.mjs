import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { register } from "node:module";

// Reuse the established route harness; Printful V2 stays REAL and only fetch is stubbed.
register("./tsAliasLoader.mjs", import.meta.url);
register("./printRetryResolveRace.hooks.mjs", import.meta.url);
const run = Date.now().toString(36);
process.env.STARMAP_KV_ALLOW_LOCAL = "1";
process.env.STARMAP_KV_DIR = fs.mkdtempSync(path.join(os.tmpdir(), `merch669-${run}-`));
process.env.STARMAP_PRINT_ORDER_AUTHORITY_LOCAL = "1";
process.env.PRINT_ADMIN_TOKEN = "test-admin-placeholder";
process.env.PRINT_ORDER_SUBMISSION_ENABLED = "1";
process.env.STRIPE_SECRET_KEY = "test-placeholder";
process.env.PRINTFUL_API_TOKEN = "test-placeholder";
process.env.PRINTFUL_STORE_ID = "test-store";
process.env.PRINTFUL_AUTO_CONFIRM = "true";
process.env.MERCH_VARIANT_COSTS_JSON = JSON.stringify({
  123: { productCents: 300, providerTaxCents: 0, processingBps: 300,
    processingFixedCents: 30, fxBps: 200, replacementReserveCents: 50 },
});
process.env.PRINT_FULFILLMENT_WEBHOOK_URL = "https://alternate.example.test/fulfill";

const { NextRequest } = await import("next/server");
const retryRoute = await import("../../src/app/api/print/orders/retry/route.ts");
const { kv } = await import("../../src/lib/kv.ts");
const { printOrderKey } = await import("../../src/lib/printOrders.ts");
const { getPrintOrderAuthorityState } = await import("../../src/lib/printOrderAuthority.ts");
const originalFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = originalFetch; });
let serial = 0;

async function seed(overrides = {}) {
  const sessionId = `cs_test_m669${run}${++serial}`;
  const record = {
    status: "failed", sessionId, mapId: "synthetic-map", printVariant: "poster_framed",
    merchFamily: "sticker_kisscut", merchCatalogVariantId: 123,
    merchQuotedCountry: "CA", merchQuotedState: "BC", merchShippingCostUsdCents: 500,
    amountTax: 0, amountTotal: 4200, currency: "cad", includesDigitalAddOn: false,
    customerName: "Synthetic Buyer", customerEmail: "synthetic@example.test", customerPhone: null,
    shippingDetails: { name: "Synthetic Buyer", address: {
      line1: "1 Test Street", city: "Victoria", country: "CA", state: "BC", postal_code: "V0V0V0",
    } },
    printAssetId: "synthetic-asset", attempts: 1, createdAt: Date.now(), terminalEventType: null,
    ...overrides,
  };
  await kv.set(printOrderKey(sessionId), record);
  globalThis.__f1SubmitCalls = [];
  globalThis.__f1StripeRetrieve = async () => ({
    id: sessionId, object: "checkout.session", mode: "payment", status: "complete",
    payment_status: "paid", amount_total: 4200, currency: "cad", payment_method_types: ["card"],
    metadata: { order_type: "print", print_variant: "poster_framed" },
    total_details: { amount_tax: 0, amount_discount: 0, breakdown: { discounts: [] } },
    shipping_details: record.shippingDetails,
  });
  return { sessionId, record };
}

function provider(sessionId, { status = "draft", costs = "calculating" } = {}) {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const method = options.method || "GET";
    calls.push({ url: String(url), method });
    assert.match(String(url), /^https:\/\/api\.printful\.com\/v2\/orders/);
    assert.ok(!String(url).endsWith("/confirmation"), "these reconciliation tests must never confirm");
    return new Response(JSON.stringify({ data: {
      id: 321, external_id: sessionId, status,
      recipient: { name: "Synthetic Buyer", address1: "1 Test Street", city: "Victoria",
        country_code: "CA", state_code: "BC", zip: "V0V0V0" },
      costs: { calculation_status: costs, currency: "USD", total: costs === "done" ? "8.00" : null },
    } }), { status: 200 });
  };
  return calls;
}

async function retry(sessionId) {
  return retryRoute.POST(new NextRequest("https://example.test/api/print/orders/retry", {
    method: "POST", headers: { "content-type": "application/json", "x-print-admin-token": "test-admin-placeholder" },
    body: JSON.stringify({ sessionId }),
  }));
}

test("route: pending-cost draft persists separately and repeat retry is GET-only without unbinding dispatch", async () => {
  const { sessionId } = await seed();
  const creationCalls = provider(sessionId);
  const first = await retry(sessionId);
  assert.equal(first.status, 502);
  let stored = await kv.get(printOrderKey(sessionId));
  assert.equal(stored.merchDraftOrderId, 321);
  assert.equal(stored.printfulOrderId, undefined);
  assert.notEqual(stored.status, "sent");
  assert.equal(stored.error, "printful_v2_costs_pending");
  assert.equal(creationCalls.filter(call => call.method === "POST").length, 1);
  const authorityBefore = await getPrintOrderAuthorityState(sessionId);
  assert.equal(authorityBefore.lifecycle, "unbound");
  assert.ok(authorityBefore.alternateDispatchClaim);
  const marker = stored.alternateDispatch;

  const secondCalls = provider(sessionId, { costs: "done" });
  const second = await retry(sessionId);
  assert.equal(second.status, 502);
  assert.ok(secondCalls.length > 0, "retained claim must allow the explicit GET reconciliation");
  assert.ok(secondCalls.every(call => call.method === "GET"));
  stored = await kv.get(printOrderKey(sessionId));
  assert.equal(stored.error, "printful_v2_existing_draft_review_required");
  assert.equal(stored.printfulOrderId, undefined);
  assert.deepEqual(stored.alternateDispatch, marker);
  assert.deepEqual((await getPrintOrderAuthorityState(sessionId)).alternateDispatchClaim, authorityBefore.alternateDispatchClaim);
  assert.equal(globalThis.__f1SubmitCalls.length, 0, "never fall through to v1 fulfillment");
});

test("route: manual confirmation readback binds retained draft once without another provider POST", async () => {
  const { sessionId } = await seed({ merchDraftOrderId: 321, merchProviderState: "draft" });
  const calls = provider(sessionId, { status: "pending", costs: "done" });
  const response = await retry(sessionId);
  assert.equal(response.status, 200);
  const stored = await kv.get(printOrderKey(sessionId));
  assert.equal(stored.status, "sent");
  assert.equal(stored.printfulOrderId, 321);
  assert.equal((await getPrintOrderAuthorityState(sessionId)).lifecycle, "bound");
  assert.ok(calls.every(call => call.method === "GET"));
  const second = await retry(sessionId);
  assert.equal(second.status, 200);
  assert.equal(calls.length, 1, "already-bound retry must not revisit provider");
});

test("route: unpaid known draft cannot be reconciled or dispatched", async () => {
  const { sessionId } = await seed({ merchDraftOrderId: 321 });
  globalThis.__f1StripeRetrieve = async () => ({
    id: sessionId, mode: "payment", status: "complete", payment_status: "unpaid",
    amount_total: 4200, currency: "cad", metadata: { order_type: "print" },
  });
  const calls = provider(sessionId, { status: "pending", costs: "done" });
  const response = await retry(sessionId);
  assert.equal(response.status, 409);
  assert.equal(calls.length, 0);
  assert.notEqual((await kv.get(printOrderKey(sessionId))).status, "sent");
});

test("route: losing V2 configuration cannot send a retained native draft to alternate fulfillment", async () => {
  const { sessionId } = await seed({ merchDraftOrderId: 321, merchProviderState: "draft" });
  const saved = process.env.PRINTFUL_API_TOKEN;
  let calls = 0;
  delete process.env.PRINTFUL_API_TOKEN;
  globalThis.fetch = async () => { calls++; return Response.json({ ok: true }); };
  try {
    const response = await retry(sessionId);
    assert.ok(response.status >= 400);
    assert.equal(calls, 0, "do not dispatch an alternate order while native draft remains unresolved");
    const stored = await kv.get(printOrderKey(sessionId));
    assert.equal(stored.merchDraftOrderId, 321);
    assert.notEqual(stored.status, "sent");
  } finally { process.env.PRINTFUL_API_TOKEN = saved; }
});
