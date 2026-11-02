/**
 * S96 follow-up F-1 (P1, conditional) — route-level regression tests.
 *
 * The defect (whole-record writer audit, base 755e81b1ad): the admin
 * retry route performed its authority lifecycle checks BEFORE its
 * long awaits (Stripe payment gate, recipient hydration) and never
 * re-read the authority before submitPrintfulOrder. An operator
 * resolve landing mid-pass (the resolve route records a manually
 * created Printful order; it never calls Printful and never
 * establishes that manual order's external_id) therefore did not stop
 * the resumed pass, which submitted a SECOND created+confirmed
 * Printful order (submitPrintfulOrder reconciles only an existing
 * order with the SAME external_id = sessionId). The hydrate persist
 * additionally reverted the resolve in KV in the same flow.
 *
 * These tests drive the REAL retry route and the REAL resolve route
 * against the local KV fallback and the in-memory authority client,
 * with only the external-service seams stubbed (Stripe retrieve,
 * Printful submit, alerts, confirmation, asset TTL, post-submit
 * review). The interleavings are deterministic: the resolve is
 * performed INSIDE the stubbed Stripe retrieve, i.e. provably during
 * the retry pass's own awaits.
 *
 * Assertions: after a mid-pass resolve, ZERO outbound Printful
 * submits and the resolved KV record stands unreverted; with no
 * resolve, the happy path is unchanged (exactly one submit).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

register("./tsAliasLoader.mjs", import.meta.url);
// Registered last so its resolve hook runs first for the stubbed seams.
register("./printRetryResolveRace.hooks.mjs", import.meta.url);

const RUN = Date.now().toString(36);
process.env.STARMAP_KV_ALLOW_LOCAL = "1";
process.env.STARMAP_KV_DIR = fs.mkdtempSync(path.join(os.tmpdir(), `f1-retry-kv-${RUN}-`));
process.env.STARMAP_PRINT_ORDER_AUTHORITY_LOCAL = "1";
process.env.PRINT_ADMIN_TOKEN = "f1-test-admin-token";
process.env.PRINT_ORDER_SUBMISSION_ENABLED = "1";
process.env.STRIPE_SECRET_KEY = "sk_test_f1_placeholder";
delete process.env.PRINT_FULFILLMENT_WEBHOOK_URL;

const { NextRequest } = await import("next/server");
const retryRoute = await import("../../src/app/api/print/orders/retry/route.ts");
const resolveRoute = await import("../../src/app/api/print/orders/resolve/route.ts");
const { kv } = await import("../../src/lib/kv.ts");
const { printOrderKey } = await import("../../src/lib/printOrders.ts");
const { getPrintOrderAuthorityState } = await import("../../src/lib/printOrderAuthority.ts");

const ADMIN = { "x-print-admin-token": "f1-test-admin-token" };

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
    customer_details: { email: "buyer@example.com", name: "Buyer", phone: "+[REDACTED_PHONE]" },
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
    mapId: "map_f1",
    printVariant: "poster_framed",
    includesDigitalAddOn: false,
    amountTotal: 10600,
    currency: "usd",
    customerEmail: "buyer@example.com",
    customerName: "Buyer",
    customerPhone: "+[REDACTED_PHONE]",
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
    printAssetId: "asset_f1",
    attempts: 1,
    createdAt: Date.now(),
    error: "printful_order_failed",
    // Explicitly present and null: no terminal authority evidence on
    // seed, so the pass is admitted exactly as in the audit's flow.
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

/** The operator resolve, through the REAL resolve route. */
async function operatorResolve(sessionId, printfulOrderId) {
  const res = await resolveRoute.POST(
    postJson("https://starmapco.com/api/print/orders/resolve", { sessionId, printfulOrderId }, ADMIN),
  );
  assert.equal(res.status, 200, "resolve route must accept the manual order");
  return res;
}

async function runRetry(sessionId) {
  return retryRoute.POST(
    postJson("https://starmapco.com/api/print/orders/retry", { sessionId }, ADMIN),
  );
}

let counter = 0;
async function seedRecord(overrides = {}) {
  counter += 1;
  const sessionId = `cs_test_f1race${RUN}${counter}`;
  const record = retryableRecord(sessionId, overrides);
  await kv.set(printOrderKey(sessionId), record);
  globalThis.__f1SubmitCalls = [];
  return { sessionId, record };
}

test("F-1: resolve lands during the Stripe payment-gate await -> zero Printful submits, resolved record stands", async () => {
  const { sessionId } = await seedRecord();
  let resolved = false;
  globalThis.__f1StripeRetrieve = async () => {
    if (!resolved) {
      resolved = true;
      // The retry pass is suspended in its payment-gate retrieve;
      // the operator manually fulfils and resolves the same order.
      await operatorResolve(sessionId, "777001");
    }
    return paidSession({ id: sessionId });
  };

  const res = await runRetry(sessionId);
  const body = await res.json();

  assert.equal(globalThis.__f1SubmitCalls.length, 0, "no Printful submission after a mid-pass resolve");
  assert.equal(res.status, 200);
  assert.equal(body.status, "already_bound");
  const stored = await kv.get(printOrderKey(sessionId));
  assert.equal(stored.status, "sent");
  assert.equal(String(stored.printfulOrderId), "777001");
  assert.equal(typeof stored.operatorResolvedAt, "number");
  const authority = await getPrintOrderAuthorityState(sessionId);
  assert.equal(authority.lifecycle, "bound");
  assert.equal(authority.printfulOrderId, "777001");
});

test("F-1: resolve lands during the hydration await -> zero Printful submits, hydrate persist does not revert the resolve", async () => {
  // customerPhone absent -> hydration must call Stripe even though a
  // recipient is present, opening the hydration window.
  const { sessionId } = await seedRecord({ customerPhone: undefined });
  let retrieveCount = 0;
  globalThis.__f1StripeRetrieve = async () => {
    retrieveCount += 1;
    if (retrieveCount === 2) {
      // First retrieve was the payment gate; this one is hydration.
      // The resolve lands while hydration is in flight.
      await operatorResolve(sessionId, "777002");
    }
    return paidSession({ id: sessionId });
  };

  const res = await runRetry(sessionId);
  const body = await res.json();

  assert.ok(retrieveCount >= 2, "hydration retrieve must have run (the interleaving window)");
  assert.equal(globalThis.__f1SubmitCalls.length, 0, "no Printful submission after a mid-pass resolve");
  assert.equal(res.status, 200);
  assert.equal(body.status, "already_bound");
  const stored = await kv.get(printOrderKey(sessionId));
  // The pre-fix hydrate persist rewrote the handler-start snapshot:
  // status back to failed, provider ID and resolve stamps erased,
  // and the session's phone merged in. None of that may happen now.
  assert.equal(stored.status, "sent");
  assert.equal(String(stored.printfulOrderId), "777002");
  assert.equal(typeof stored.operatorResolvedAt, "number");
  assert.equal(stored.customerPhone ?? null, null);
});

test("F-1: resolve with NO provider ID lands during the payment-gate await -> authority stays unbound, KV mirror still stands the pass down", async () => {
  // A resolve carrying no Printful ID performs no authority bind:
  // the lifecycle remains unbound, so an authority-only re-read
  // would miss it. The resolved KV mirror (sent + operatorResolvedAt)
  // is the evidence the pre-dispatch re-read must also consult.
  const { sessionId } = await seedRecord();
  let resolved = false;
  globalThis.__f1StripeRetrieve = async () => {
    if (!resolved) {
      resolved = true;
      await operatorResolve(sessionId, "");
    }
    return paidSession({ id: sessionId });
  };

  const res = await runRetry(sessionId);
  const body = await res.json();

  assert.equal(globalThis.__f1SubmitCalls.length, 0, "no Printful submission after a mid-pass resolve");
  assert.equal(res.status, 409);
  assert.equal(body.error, "reconciliation_required");
  assert.equal(body.reason, "operator_resolved_during_retry");
  const authority = await getPrintOrderAuthorityState(sessionId);
  assert.equal(authority.lifecycle, "unbound");
  const stored = await kv.get(printOrderKey(sessionId));
  assert.equal(stored.status, "sent");
  assert.equal(typeof stored.operatorResolvedAt, "number");
});

test("F-1 happy path: no resolve -> exactly one Printful submit, order sent with the submitted provider ID", async () => {
  const { sessionId } = await seedRecord();
  globalThis.__f1SubmitOrderId = 555001;
  globalThis.__f1StripeRetrieve = async () => paidSession({ id: sessionId });

  const res = await runRetry(sessionId);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.status, "sent");
  assert.equal(globalThis.__f1SubmitCalls.length, 1, "exactly one outbound Printful submission");
  assert.equal(globalThis.__f1SubmitCalls[0].externalId, sessionId);
  const stored = await kv.get(printOrderKey(sessionId));
  assert.equal(stored.status, "sent");
  assert.equal(String(stored.printfulOrderId), "555001");
});

test("source: pre-dispatch re-read is positioned after hydration and immediately before the Printful submission", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const source = fs.readFileSync(path.join(root, "src/app/api/print/orders/retry/route.ts"), "utf8");
  const hydrateIdx = source.indexOf("await hydrateOrderRecipientData(existing)");
  const standDownDefIdx = source.indexOf("const standDownIfFulfillmentMoved");
  const afterHydrationIdx = source.indexOf("movedAfterHydration", hydrateIdx);
  const submitIdx = source.indexOf("await submitPrintfulOrder({");
  const beforeDispatchIdx = source.indexOf("movedBeforeDispatch", hydrateIdx);
  assert.ok(standDownDefIdx > 0, "stand-down helper present");
  assert.ok(afterHydrationIdx > hydrateIdx, "stand-down runs after hydration");
  assert.ok(beforeDispatchIdx > afterHydrationIdx, "final stand-down runs after the post-hydration stand-down");
  assert.ok(beforeDispatchIdx < submitIdx, "final stand-down runs before submitPrintfulOrder");
  const helper = source.slice(standDownDefIdx, source.indexOf("Payment gate (parity", standDownDefIdx));
  assert.match(helper, /getPrintOrderAuthorityState\(sessionId\)/);
  assert.match(helper, /operatorResolvedAt/);
  assert.match(helper, /alternateDispatchClaim/);
  // Hydrate persist merges onto the re-read latest record, not the snapshot.
  const hydrate = source.slice(source.indexOf("async function hydrateOrderRecipientData"), standDownDefIdx);
  assert.match(hydrate, /kv\.get<PrintOrderRecord>\(printOrderKey\(existing\.sessionId\)\)/);
  assert.match(hydrate, /advancedPastSnapshot/);
});
