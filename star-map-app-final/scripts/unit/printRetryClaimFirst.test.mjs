/** Real retry route + real local KV/serialized authority; external services are fakes. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { register } from "node:module";


register("./tsAliasLoader.mjs", import.meta.url);
register("./printRetryResolveRace.hooks.mjs", import.meta.url);
register("./printRetryClaimFirst.hooks.mjs", import.meta.url);

const RUN = Date.now().toString(36);
process.env.STARMAP_KV_ALLOW_LOCAL = "1";
process.env.STARMAP_KV_DIR = fs.mkdtempSync(path.join(os.tmpdir(), `a3-retry-kv-${RUN}-`));
process.env.STARMAP_PRINT_ORDER_AUTHORITY_LOCAL = "1";
process.env.PRINT_ADMIN_TOKEN = "a3-test-admin-token";
process.env.PRINT_ORDER_SUBMISSION_ENABLED = "1";
process.env.STRIPE_SECRET_KEY = "sk_test_a3_placeholder";
process.env.PRINT_FULFILLMENT_WEBHOOK_URL = "https://alternate.invalid/fulfill";

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
} = await import("../../src/lib/printOrderAuthority.ts");

const ADMIN = { "x-print-admin-token": "a3-test-admin-token" };

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
  globalThis.__claimFirstNative = true;
  globalThis.__claimFirstSubmit = null;
  globalThis.__f1SubmitOrderId = 555301;
  globalThis.__f1StripeRetrieve = async () => paidSession({ id: sessionId });
  return { sessionId, record, dispatchId };
}


for (const merch of [false, true]) {
  const label = merch ? "V2" : "V1";
  const recordOptions = merch ? { merchCatalogVariantId: 10163, merchFamily: "sticker_kisscut" } : {};

  test(label + ": alternate wins after native standing read; native submits zero", async (t) => {
    const { sessionId, dispatchId } = await seedCase(recordOptions);
    const originalGet = kv.get.bind(kv);
    let reads = 0;
    let winner;
    t.mock.method(kv, "get", async (key, ...args) => {
      const snapshot = await originalGet(key, ...args);
      if (key === printOrderKey(sessionId) && ++reads === 4) {
        // Snapshot used by the #641 standing guard is already computed.
        winner = await claimAlternateFulfillmentDispatch(sessionId, dispatchId);
      }
      return snapshot;
    });
    const response = await runRetry(sessionId);
    assert.equal(winner?.claimAcquired, true);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "alternate_dispatch_reconciliation_required");
    assert.equal(globalThis.__f1SubmitCalls.length, 0);
  });

  test(label + ": native holds claim across submission; alternate retry cannot dispatch", async (t) => {
    const { sessionId, dispatchId } = await seedCase(recordOptions);
    let alternateCalls = 0;
    t.mock.method(globalThis, "fetch", async () => { alternateCalls++; return new Response("ok"); });
    globalThis.__claimFirstSubmit = async () => {
      assert.equal((await getPrintOrderAuthorityState(sessionId)).alternateDispatchClaim.dispatchId, dispatchId);
      assert.equal((await kv.get(printOrderKey(sessionId))).alternateDispatch.state, "attempted");
      const alternateClaim = await claimAlternateFulfillmentDispatch(sessionId, dispatchId);
      assert.equal(alternateClaim.claimAcquired, false);
      globalThis.__claimFirstNative = false;
      const loser = await runRetry(sessionId);
      assert.equal(loser.status, 409);
      assert.equal((await loser.json()).error, "alternate_dispatch_reconciliation_required");
      globalThis.__claimFirstNative = true;
      return { ok: true, status: 200, orderId: 555301 };
    };
    assert.equal((await runRetry(sessionId)).status, 200);
    assert.equal(globalThis.__f1SubmitCalls.length, 1);
    assert.equal(globalThis.__f1SubmitCalls[0].externalId, sessionId);
    assert.equal(alternateCalls, 0);
    assert.equal((await kv.get(printOrderKey(sessionId))).alternateDispatch.state, "accepted");
    assert.equal((await getPrintOrderAuthorityState(sessionId)).lifecycle, "bound");
  });

  for (const failure of ["timeout", "throw", "non-2xx"]) {
    test(label + ": " + failure + " blocks subsequent native and alternate attempts", async (t) => {
      const { sessionId, dispatchId } = await seedCase(recordOptions);
      let alternateCalls = 0;
      t.mock.method(globalThis, "fetch", async () => { alternateCalls++; return new Response("ok"); });
      globalThis.__claimFirstSubmit = async () => {
        if (failure === "throw") throw new Error("lost response");
        return { ok: false, status: failure === "timeout" ? 503 : 500, error: "ambiguous_provider_response" };
      };
      if (failure === "throw") await assert.rejects(runRetry(sessionId), /lost response/);
      else assert.equal((await runRetry(sessionId)).status, 502);
      assert.equal((await kv.get(printOrderKey(sessionId))).alternateDispatch.state, "attempted");
      assert.equal((await getPrintOrderAuthorityState(sessionId)).alternateDispatchClaim.dispatchId, dispatchId);
      for (const native of [true, false]) {
        globalThis.__claimFirstNative = native;
        const refused = await runRetry(sessionId);
        assert.equal(refused.status, 409);
        const body = await refused.json();
        assert.equal(body.error, "alternate_dispatch_reconciliation_required");
        assert.equal(body.dispatchId, dispatchId);
      }
      assert.equal(globalThis.__f1SubmitCalls.length, 1);
      assert.equal(alternateCalls, 0);
    });
  }

  test(label + ": native claim alone bars alternate retry before marker persistence", async (t) => {
    const { sessionId } = await seedCase(recordOptions);
    const originalSet = kv.setDurable.bind(kv);
    let alternateCalls = 0;
    let checked = false;
    t.mock.method(globalThis, "fetch", async () => { alternateCalls++; return new Response("ok"); });
    t.mock.method(kv, "setDurable", async (key, value, ...args) => {
      if (key === printOrderKey(sessionId) && value.alternateDispatch?.state === "attempted" && !checked) {
        checked = true;
        assert.equal((await kv.get(key)).alternateDispatch, undefined);
        assert.ok((await getPrintOrderAuthorityState(sessionId)).alternateDispatchClaim);
        globalThis.__claimFirstNative = false;
        const loser = await runRetry(sessionId);
        assert.equal(loser.status, 409);
        assert.equal((await loser.json()).error, "alternate_dispatch_reconciliation_required");
        globalThis.__claimFirstNative = true;
      }
      return originalSet(key, value, ...args);
    });
    assert.equal((await runRetry(sessionId)).status, 200);
    assert.equal(checked, true);
    assert.equal(globalThis.__f1SubmitCalls.length, 1);
    assert.equal(alternateCalls, 0);
  });

  test(label + ": marker persistence failure submits nothing and retains claim", async (t) => {
    const { sessionId } = await seedCase(recordOptions);
    const originalSet = kv.setDurable.bind(kv);
    t.mock.method(kv, "setDurable", async (key, value, ...args) => {
      if (key === printOrderKey(sessionId) && value.alternateDispatch?.state === "attempted") {
        throw new Error("marker storage unavailable");
      }
      return originalSet(key, value, ...args);
    });
    await assert.rejects(runRetry(sessionId), /marker storage unavailable/);
    assert.equal(globalThis.__f1SubmitCalls.length, 0);
    assert.ok((await getPrintOrderAuthorityState(sessionId)).alternateDispatchClaim);
    for (const native of [true, false]) {
      globalThis.__claimFirstNative = native;
      const refused = await runRetry(sessionId);
      assert.equal(refused.status, 409);
      assert.equal((await refused.json()).error, "alternate_dispatch_reconciliation_required");
    }
  });

  test(label + ": advancement after native claim releases without submitting", async (t) => {
    const { sessionId } = await seedCase(recordOptions);
    const originalGet = kv.get.bind(kv);
    let reads = 0;
    t.mock.method(kv, "get", async (key, ...args) => {
      const snapshot = await originalGet(key, ...args);
      if (key === printOrderKey(sessionId) && ++reads === 5) {
        assert.ok((await getPrintOrderAuthorityState(sessionId)).alternateDispatchClaim);
        return { ...snapshot, operatorResolvedAt: Date.now() };
      }
      return snapshot;
    });
    assert.equal((await runRetry(sessionId)).status, 409);
    assert.equal(globalThis.__f1SubmitCalls.length, 0);
    assert.equal((await getPrintOrderAuthorityState(sessionId)).alternateDispatchClaim, null);
  });
}
