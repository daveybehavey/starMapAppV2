/**
 * verifyPrintSummaryGuard.test.mjs — fault-injection acceptance tests
 * for the verify route's print-summary guard (issue #464, S92-1).
 *
 * Defect (proven S92-1): PR #450 guarded the initialized path's
 * post-settlement auxiliary writes, but two success branches still
 * awaited `loadPrintSummary(sessionId)` unguarded inside the route's
 * outer try — the `already_settled` response and the final initialized
 * response. The helper's own `kv.get` (print-order record read) can
 * reject (the kv fallback path itself throwing), and that rejection
 * reached the outer catch, converting a settled payment into a
 * definitive { paid: false }.
 *
 * Fix: the helper catches the read rejection, logs a bounded warning,
 * and degrades the auxiliary summary to null — the #450 pattern — so
 * the already-authorized paid response proceeds.
 *
 * These tests drive the REAL verify GET handler against the same
 * harness as verifySoftWriteGuards.test.mjs: a fault-injecting fake KV
 * (the real kv object's methods are replaced) and a fetch-level Stripe
 * double. Read faults are injected through the fake's getHook.
 *
 * Negative controls: both fault-injection PASS tests fail on the
 * pre-fix route (each degraded call answered { paid: false }); the
 * healthy controls pin the behavior the fix must NOT change (settled
 * sessions still answer paid: true with the real print summary).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);
register("./gaConsentMode.hooks.mjs", import.meta.url);
register("./dl1S4NextServer.hooks.mjs", import.meta.url);

process.env.STARMAP_KV_ALLOW_LOCAL = "1";
// Placeholder so the route module constructs its (fetch-stubbed) Stripe
// client. Not a credential; no network call leaves the fetch double.
process.env.STRIPE_SECRET_KEY = "unit-test-placeholder-not-a-credential";
delete process.env.NEXT_PUBLIC_GA_ID;
delete process.env.GA4_API_SECRET;
delete process.env.NEXT_PUBLIC_POSTHOG_KEY;

// ---------------------------------------------------------------------------
// Stripe double (fetch level, installed before the route import).
// ---------------------------------------------------------------------------
let stripeSessionFixture = null;
let stripePiFixture = null;
let stripeSessionFetches = 0;

globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.startsWith("https://api.stripe.com/v1/checkout/sessions/")) {
    stripeSessionFetches += 1;
    return new Response(JSON.stringify(stripeSessionFixture), {
      status: 200,
      headers: { "content-type": "application/json", "request-id": "req_summary_session" },
    });
  }
  if (url.startsWith("https://api.stripe.com/v1/payment_intents/")) {
    return new Response(JSON.stringify(stripePiFixture), {
      status: 200,
      headers: { "content-type": "application/json", "request-id": "req_summary_pi" },
    });
  }
  throw new Error(`unexpected fetch in verify print-summary harness: ${url}`);
};

const { NextRequest } = await import("next/server");
const route = await import("../../src/app/api/stripe/verify/route.ts");
const { kv, KvSoftWriteError } = await import("../../src/lib/kv.ts");
const { ENTITLEMENT_KV } = await import("../../src/lib/entitlementsStore.ts");

// ---------------------------------------------------------------------------
// Fault-injecting storage double (same shape as the #450 harness).
// ---------------------------------------------------------------------------
const realKv = { get: kv.get, set: kv.set, setDurable: kv.setDurable, incr: kv.incr };

let data;
let opLog;
let getHook;

function installFakeKv() {
  data = new Map();
  opLog = [];
  getHook = null;
  kv.get = async (key) => {
    opLog.push({ op: "get", key });
    const read = () => (data.has(key) ? structuredClone(data.get(key)) : null);
    return getHook ? getHook(key, read) : read();
  };
  kv.set = async (key, value) => {
    opLog.push({ op: "set", key });
    data.set(key, structuredClone(value));
    return "OK";
  };
  kv.setDurable = async (key, value) => {
    opLog.push({ op: "setDurable", key });
    data.set(key, structuredClone(value));
    return "OK";
  };
  kv.incr = async (key, by = 1) => {
    opLog.push({ op: "incr", key });
    const next = Number(data.get(key) ?? 0) + by;
    data.set(key, next);
    return next;
  };
}

function restoreKv() {
  kv.get = realKv.get;
  kv.set = realKv.set;
  kv.setDurable = realKv.setDurable;
  kv.incr = realKv.incr;
}

test.beforeEach(() => {
  installFakeKv();
  stripeSessionFixture = null;
  stripePiFixture = null;
  stripeSessionFetches = 0;
});
test.after(() => restoreKv());

// ---------------------------------------------------------------------------
// Keys, fixtures, request helpers.
// ---------------------------------------------------------------------------
const sessionKey = (id) => ENTITLEMENT_KV.stripeSession(id);
const printOrderKey = (id) => `print:order:${id}`;
const MAP_ID = "11111111-2222-4333-8444-555555555555";

let seq = 0;
function ids() {
  seq += 1;
  return {
    session: `cs_summary_${seq}`,
    pi: `pi_summary_${seq}`,
    charge: `ch_summary_${seq}`,
  };
}

function printSession(id, pi) {
  return {
    id,
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    status: "complete",
    amount_total: 4900,
    currency: "usd",
    payment_intent: pi,
    subscription: null,
    customer: "cus_summary",
    metadata: {
      order_type: "print",
      print_variant: "poster_unframed",
      map_id: MAP_ID,
    },
    total_details: { breakdown: { discounts: [] } },
  };
}

function printOrderRecord(id) {
  return {
    status: "sent",
    sessionId: id,
    printVariant: "poster_unframed",
    includesDigitalAddOn: false,
    printfulOrderId: 98765,
    printConfirmationSentAt: 1_730_000_000_000,
    shippingNotificationSentAt: 1_730_000_100_000,
    shippingDetails: { address: { country: "ca" } },
  };
}

const EXPECTED_SUMMARY = {
  kvStatus: "sent",
  printfulOrderId: 98765,
  confirmationEmailSent: true,
  shippingNotificationSent: true,
  shippingCountry: "CA",
};

function setStripe(session, charge) {
  stripeSessionFixture = session;
  stripePiFixture = session?.payment_intent
    ? { id: session.payment_intent, object: "payment_intent", latest_charge: charge }
    : null;
}

let ipSeq = 0;
function verifyRequest(id) {
  ipSeq += 1;
  return new NextRequest(
    `https://starmapco.com/api/stripe/verify?session_id=${encodeURIComponent(id)}`,
    { headers: { "x-forwarded-for": `10.9.0.${ipSeq}` } },
  );
}

// ---------------------------------------------------------------------------
// Healthy controls — settled print sessions answer paid with the summary.
// ---------------------------------------------------------------------------

test("PASS healthy initialized print path: paid body carries the real print summary", async () => {
  const { session, pi, charge } = ids();
  data.set(printOrderKey(session), printOrderRecord(session));
  setStripe(printSession(session, pi), charge);
  const res = await route.GET(verifyRequest(session));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.paid, true);
  assert.deepEqual(body.printSummary, EXPECTED_SUMMARY);
});

test("PASS healthy already-paid fast path: paid body carries the real print summary", async () => {
  const { session, pi, charge } = ids();
  data.set(printOrderKey(session), printOrderRecord(session));
  setStripe(printSession(session, pi), charge);
  const first = await route.GET(verifyRequest(session));
  assert.equal((await first.json()).paid, true);
  assert.equal(stripeSessionFetches, 1);

  const res = await route.GET(verifyRequest(session));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.paid, true);
  assert.deepEqual(body.printSummary, EXPECTED_SUMMARY);
  assert.equal(stripeSessionFetches, 1, "fast path must not re-retrieve the Stripe session");
});

// ---------------------------------------------------------------------------
// Fault injection — a print-summary read rejection must never convert a
// settled payment into a definitive { paid: false }.
// ---------------------------------------------------------------------------

test("PASS print-summary read failure on the initialized path: settled payment stays paid", async () => {
  const { session, pi, charge } = ids();
  const fixture = printSession(session, pi);

  // Healthy baseline for the same fixture (real summary in the body).
  data.set(printOrderKey(session), printOrderRecord(session));
  setStripe(fixture, charge);
  const healthyRes = await route.GET(verifyRequest(session));
  const healthyBody = await healthyRes.json();
  assert.equal(healthyRes.status, 200);
  assert.deepEqual(healthyBody.printSummary, EXPECTED_SUMMARY);

  // Fresh storage, same fixture, print-order read rejects.
  installFakeKv();
  data.set(printOrderKey(session), printOrderRecord(session));
  setStripe(fixture, charge);
  getHook = (key, read) => {
    if (key === printOrderKey(session)) {
      throw new KvSoftWriteError("injected print-order read failure");
    }
    return read();
  };
  const res = await route.GET(verifyRequest(session));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.paid, true, "settled payment must not answer definitive unpaid");
  assert.equal(body.pending, undefined, "degraded body carries no pending field");
  assert.equal(body.printSummary, null, "summary degrades to null, payment stands");
  assert.deepEqual(body, { ...healthyBody, printSummary: null });
  assert.ok(data.get(sessionKey(session))?.paid, "settlement record remains paid");
});

test("PASS print-summary read failure on the already_settled path: settled payment stays paid", async () => {
  const { session, pi, charge } = ids();
  const fixture = printSession(session, pi);
  data.set(printOrderKey(session), printOrderRecord(session));
  setStripe(fixture, charge);

  // Settle the session through the real handler first.
  const first = await route.GET(verifyRequest(session));
  assert.equal((await first.json()).paid, true);
  assert.equal(stripeSessionFetches, 1);

  // Probe call: hide the session record from the route's first read so
  // the flow reaches settleSessionPurchase (which observes the settled
  // record and answers already_settled), and make the print-order read
  // reject with a generic error at the summary boundary.
  let sessionReads = 0;
  getHook = (key, read) => {
    if (key === printOrderKey(session)) {
      throw new Error("generic print-order read failure");
    }
    if (key === sessionKey(session)) {
      sessionReads += 1;
      if (sessionReads === 1) return null;
    }
    return read();
  };
  const res = await route.GET(verifyRequest(session));
  const body = await res.json();
  assert.equal(stripeSessionFetches, 2, "probe must reach the Stripe/settle flow, not the fast path");
  assert.equal(res.status, 200);
  assert.equal(body.paid, true, "already-settled payment must not answer definitive unpaid");
  assert.equal(body.pending, undefined, "degraded body carries no pending field");
  assert.equal(body.printSummary, null, "summary degrades to null, payment stands");
  assert.equal(body.orderType, "print");
});

test("PASS already_settled path with healthy storage: paid body carries the real print summary", async () => {
  const { session, pi, charge } = ids();
  const fixture = printSession(session, pi);
  data.set(printOrderKey(session), printOrderRecord(session));
  setStripe(fixture, charge);

  const first = await route.GET(verifyRequest(session));
  assert.equal((await first.json()).paid, true);

  let sessionReads = 0;
  getHook = (key, read) => {
    if (key === sessionKey(session)) {
      sessionReads += 1;
      if (sessionReads === 1) return null;
    }
    return read();
  };
  const res = await route.GET(verifyRequest(session));
  const body = await res.json();
  assert.equal(stripeSessionFetches, 2, "probe must reach the Stripe/settle flow, not the fast path");
  assert.equal(res.status, 200);
  assert.equal(body.paid, true);
  assert.deepEqual(body.printSummary, EXPECTED_SUMMARY);
});
