/**
 * verifyCarryRefusal.test.mjs — fault-injection acceptance tests for
 * the verify route's carry-refusal companion (S93-1 item 8, issue #466).
 *
 * Defect (proven S93-1 §8): the carry refusal was persisted only inside
 * Stripe retrieval processing (after the discount gate), so the
 * already-paid fast path, the revoked returns, nonfulfillable sessions
 * and discount rejections left NO refusal evidence at all — and once
 * recordTransferRefusal stopped swallowing its durable-write errors
 * (the item-8 store half), that late unguarded attempt would have
 * thrown into the route's outer catch and converted a settled payment
 * into a definitive { paid: false }.
 *
 * Fix (design §8): the refusal is attempted once, at handler entry —
 * immediately after destination session_id parsing, before any session
 * read or entitlement response — whenever the premium cookie names a
 * different source session. A persistence failure is caught locally
 * (outside the Stripe catch) and answers 503
 * carry_refusal_persistence_pending: retryable, no paid assertion, no
 * cookie mutation, no settlement.
 *
 * These tests drive the REAL verify GET handler against the same
 * harness as verifySoftWriteGuards.test.mjs: a fault-injecting fake KV
 * (the real kv object's methods are replaced) and a fetch-level Stripe
 * double. The `!stripe` branch cannot be driven in this harness (the
 * route's Stripe client is a module-level constant built from env at
 * import); the Stripe-retrieval-failure control plus the source-order
 * pin cover that seam — the refusal attempt precedes every return
 * except rate-limit and missing-session_id, which design §8 counts as
 * rejected requests, not accepted carry processing.
 *
 * Negative controls: the already-paid and revoked tests fail on the
 * pre-fix route (zero refusal attempts on those paths), and the
 * 503-pending test fails there too (the late attempt is either
 * swallowed silently or throws into the outer catch's { paid: false }).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";

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
let stripeSessionError = null;
let stripePiFixture = null;
let stripeSessionFetches = 0;

globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.startsWith("https://api.stripe.com/v1/checkout/sessions/")) {
    stripeSessionFetches += 1;
    if (stripeSessionError) throw stripeSessionError;
    return new Response(JSON.stringify(stripeSessionFixture), {
      status: 200,
      headers: { "content-type": "application/json", "request-id": "req_carry_session" },
    });
  }
  if (url.startsWith("https://api.stripe.com/v1/payment_intents/")) {
    return new Response(JSON.stringify(stripePiFixture), {
      status: 200,
      headers: { "content-type": "application/json", "request-id": "req_carry_pi" },
    });
  }
  throw new Error(`unexpected fetch in verify carry-refusal harness: ${url}`);
};

const { NextRequest } = await import("next/server");
const route = await import("../../src/app/api/stripe/verify/route.ts");
const { kv, KvSoftWriteError } = await import("../../src/lib/kv.ts");
const { ENTITLEMENT_KV } = await import("../../src/lib/entitlementsStore.ts");

// ---------------------------------------------------------------------------
// Fault-injecting storage double with an operation ledger (the #450
// harness shape, as in verifySoftWriteGuards.test.mjs).
// ---------------------------------------------------------------------------
const realKv = { get: kv.get, set: kv.set, setDurable: kv.setDurable, incr: kv.incr };

let data;
let opLog;
let faults;

function takeFault(op, key) {
  const index = faults.findIndex((fault) => fault.op === op && fault.match(key));
  if (index === -1) return null;
  const fault = faults[index];
  fault.times -= 1;
  if (fault.times <= 0) faults.splice(index, 1);
  return fault;
}

function installFakeKv() {
  data = new Map();
  opLog = [];
  faults = [];
  kv.get = async (key) => {
    opLog.push({ op: "get", key });
    return data.has(key) ? structuredClone(data.get(key)) : null;
  };
  kv.set = async (key, value) => {
    opLog.push({ op: "set", key });
    const fault = takeFault("set", key);
    if (fault && fault.when === "before") throw fault.makeError();
    data.set(key, structuredClone(value));
    if (fault && fault.when === "after") throw fault.makeError();
    return "OK";
  };
  kv.setDurable = async (key, value) => {
    opLog.push({ op: "setDurable", key });
    const fault = takeFault("setDurable", key);
    if (fault && fault.when === "before") throw fault.makeError();
    data.set(key, structuredClone(value));
    if (fault && fault.when === "after") throw fault.makeError();
    return "OK";
  };
  kv.incr = async (key, by = 1) => {
    opLog.push({ op: "incr", key });
    const fault = takeFault("incr", key);
    if (fault) throw fault.makeError();
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
  stripeSessionError = null;
  stripePiFixture = null;
  stripeSessionFetches = 0;
});
test.after(() => restoreKv());

/** Add a fault rule; `when: "before"` rejects without committing. */
function addFault({ op, match, when = "before", times = Number.POSITIVE_INFINITY, makeError }) {
  faults.push({
    op,
    match,
    when,
    times,
    makeError: makeError ?? (() => new KvSoftWriteError(`injected ${op} failure`)),
  });
}

// ---------------------------------------------------------------------------
// Keys, fixtures, request helpers.
// ---------------------------------------------------------------------------
const sessionKey = (id) => ENTITLEMENT_KV.stripeSession(id);
const refusalKey = (source, dest) => ENTITLEMENT_KV.transferRefused(source, dest);
const refusalOps = (source, dest) =>
  opLog.filter((entry) => entry.key === refusalKey(source, dest));
const MAP_ID = "11111111-2222-4333-8444-555555555555";
const CARRY_FORWARD = { outcome: "carry_not_supported_interim", movedCredits: 0 };

let seq = 0;
function ids() {
  seq += 1;
  return {
    session: `cs_carry_${seq}`,
    pi: `pi_carry_${seq}`,
    charge: `ch_carry_${seq}`,
  };
}

function digitalSession(id, pi) {
  return {
    id,
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    status: "complete",
    amount_total: 2900,
    currency: "usd",
    payment_intent: pi,
    subscription: null,
    customer: "cus_carry",
    metadata: { plan: "pack3", credits: "3", map_id: MAP_ID },
    total_details: { breakdown: { discounts: [] } },
  };
}

/** A source session holding live entitlement (cookie preservation on). */
function liveEntitlementRecord(pi) {
  return {
    paid: true,
    plan: "pack3",
    creditsRemaining: 2,
    creditsTotal: 3,
    orderType: "digital",
    includesDigitalAddOn: false,
    paymentIntentId: pi,
  };
}

function setStripe(session, charge) {
  stripeSessionFixture = session;
  stripeSessionError = null;
  stripePiFixture = session?.payment_intent
    ? { id: session.payment_intent, object: "payment_intent", latest_charge: charge }
    : null;
}

let ipSeq = 0;
function verifyRequest(id, { cookie } = {}) {
  ipSeq += 1;
  const headers = { "x-forwarded-for": `10.11.0.${ipSeq}` };
  if (cookie) headers.cookie = cookie;
  return new NextRequest(
    `https://starmapco.com/api/stripe/verify?session_id=${encodeURIComponent(id)}`,
    { headers },
  );
}
const carryCookie = (sourceId) => `starmap_premium=${sourceId}`;

// ---------------------------------------------------------------------------
// The refusal attempt now precedes every entitlement answer.
// ---------------------------------------------------------------------------

test("PASS already-paid destination + different incoming cookie: one durable refusal attempt precedes the paid answer", async () => {
  const a = ids();
  const b = ids();
  setStripe(digitalSession(b.session, b.pi), b.charge);

  // Settle B through the real handler first (no carry presentation).
  const settleRes = await route.GET(verifyRequest(b.session));
  assert.equal((await settleRes.json()).paid, true);

  // A presents its cookie against the settled B.
  data.set(sessionKey(a.session), liveEntitlementRecord(a.pi));
  opLog = [];
  stripeSessionFetches = 0;
  const res = await route.GET(verifyRequest(b.session, { cookie: carryCookie(a.session) }));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.paid, true);
  assert.deepEqual(body.carryForward, CARRY_FORWARD);
  assert.equal(stripeSessionFetches, 0, "fast path must not re-retrieve the Stripe session");
  assert.equal(
    res.cookies.get("starmap_premium"),
    undefined,
    "incoming live-entitlement cookie is preserved, not overwritten",
  );
  const attempts = refusalOps(a.session, b.session).filter((entry) => entry.op === "setDurable");
  assert.equal(attempts.length, 1, "exactly one durable refusal attempt on the fast path");
  const record = data.get(refusalKey(a.session, b.session));
  assert.equal(record.sourceSessionId, a.session);
  assert.equal(record.destinationSessionId, b.session);
  assert.equal(record.outcome, "carry_not_supported_interim");
  assert.equal(record.movedCredits, 0);
});

test("PASS revoked destination + carry cookie: refusal attempted before the revoked answer", async () => {
  const a = ids();
  const b = ids();
  data.set(sessionKey(b.session), {
    paid: true,
    revoked: true,
    plan: "pack3",
    creditsRemaining: 3,
    orderType: "digital",
    paymentIntentId: b.pi,
  });
  const res = await route.GET(verifyRequest(b.session, { cookie: carryCookie(a.session) }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { paid: false, revoked: true });
  assert.equal(
    refusalOps(a.session, b.session).filter((entry) => entry.op === "setDurable").length,
    1,
    "the revoked return no longer precedes the refusal attempt",
  );
});

test("PASS nonfulfillable Stripe session + carry cookie: refusal attempted before the unpaid answer", async () => {
  const a = ids();
  const b = ids();
  setStripe(
    {
      id: b.session,
      object: "checkout.session",
      mode: "payment",
      payment_status: "unpaid",
      status: "open",
      amount_total: 2900,
      currency: "usd",
      payment_intent: null,
      subscription: null,
      customer: null,
      metadata: { plan: "pack3", credits: "3" },
      total_details: { breakdown: { discounts: [] } },
    },
    null,
  );
  const res = await route.GET(verifyRequest(b.session, { cookie: carryCookie(a.session) }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { paid: false });
  assert.equal(
    refusalOps(a.session, b.session).filter((entry) => entry.op === "setDurable").length,
    1,
  );
});

test("PASS Stripe retrieval failure + carry cookie: refusal attempted before the outer catch answers", async () => {
  const a = ids();
  const b = ids();
  stripeSessionError = new Error("injected Stripe retrieval failure");
  const res = await route.GET(verifyRequest(b.session, { cookie: carryCookie(a.session) }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { paid: false });
  assert.equal(
    refusalOps(a.session, b.session).filter((entry) => entry.op === "setDurable").length,
    1,
    "the local refusal attempt sits outside the Stripe catch",
  );
});

test("PASS discount-rejected session + carry cookie: refusal attempted before the gate answer", async () => {
  const a = ids();
  const b = ids();
  const fixture = digitalSession(b.session, b.pi);
  // A digital_comp coupon expanded inline; pack3 cannot use manual
  // promotion codes, so the fulfillment gate refuses terminally.
  fixture.discounts = [
    { coupon: { id: "coupon_carry_comp", object: "coupon", metadata: { digital_comp: "true" } } },
  ];
  fixture.total_details = { amount_discount: 100, breakdown: { discounts: [] } };
  setStripe(fixture, b.charge);
  const res = await route.GET(verifyRequest(b.session, { cookie: carryCookie(a.session) }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { paid: false });
  assert.equal(
    refusalOps(a.session, b.session).filter((entry) => entry.op === "setDurable").length,
    1,
    "the discount gate no longer precedes the refusal attempt",
  );
  assert.equal(data.get(sessionKey(b.session)), undefined, "no settlement on a rejected discount");
});

// ---------------------------------------------------------------------------
// Persistence failure: 503 pending — never a definitive not-paid.
// ---------------------------------------------------------------------------

test("PASS refusal persistence failure: 503 carry_refusal_persistence_pending, no paid assertion, no cookie, no settlement", async () => {
  const a = ids();
  const b = ids();
  setStripe(digitalSession(b.session, b.pi), b.charge);
  addFault({ op: "setDurable", match: (key) => key === refusalKey(a.session, b.session) });
  const res = await route.GET(verifyRequest(b.session, { cookie: carryCookie(a.session) }));
  const body = await res.json();
  assert.equal(res.status, 503);
  assert.deepEqual(body, {
    pending: true,
    reason: "carry_refusal_persistence_pending",
    carryForward: CARRY_FORWARD,
  });
  assert.equal("paid" in body, false, "the pending answer asserts no paid state at all");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("retry-after"), "2");
  assert.equal(
    res.cookies.get("starmap_premium"),
    undefined,
    "no premium cookie is set or cleared on the pending answer",
  );
  assert.equal(stripeSessionFetches, 0, "Stripe is never reached when the refusal cannot persist");
  assert.equal(data.get(refusalKey(a.session, b.session)), undefined, "refusal not committed");
  assert.equal(data.get(sessionKey(b.session)), undefined, "no settlement record written");
  assert.equal(
    opLog.filter(
      (entry) =>
        (entry.op === "set" || entry.op === "setDurable") && entry.key !== refusalKey(a.session, b.session),
    ).length,
    0,
    "no settlement or accounting writes of any kind",
  );
});

test("PASS retry after refusal persistence failure: ordinary verification resumes", async () => {
  const a = ids();
  const b = ids();
  setStripe(digitalSession(b.session, b.pi), b.charge);
  addFault({
    op: "setDurable",
    match: (key) => key === refusalKey(a.session, b.session),
    times: 1,
  });
  const first = await route.GET(verifyRequest(b.session, { cookie: carryCookie(a.session) }));
  assert.equal(first.status, 503);
  assert.equal((await first.json()).reason, "carry_refusal_persistence_pending");

  const retry = await route.GET(verifyRequest(b.session, { cookie: carryCookie(a.session) }));
  const body = await retry.json();
  assert.equal(retry.status, 200);
  assert.equal(body.paid, true, "settlement outcome is unaffected by the earlier pending answer");
  assert.deepEqual(body.carryForward, CARRY_FORWARD);
  assert.ok(data.get(refusalKey(a.session, b.session)), "refusal record durable after the retry");
  assert.ok(data.get(sessionKey(b.session))?.paid, "destination settled on the retry");
});

// ---------------------------------------------------------------------------
// No carry presentation, no refusal write; repeats re-attempt durably.
// ---------------------------------------------------------------------------

test("PASS same-session cookie: no refusal write", async () => {
  const b = ids();
  setStripe(digitalSession(b.session, b.pi), b.charge);
  const res = await route.GET(verifyRequest(b.session, { cookie: carryCookie(b.session) }));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.paid, true);
  assert.equal(body.carryForward, undefined);
  assert.equal(opLog.filter((entry) => entry.key.includes("stripe:transfer:refused:")).length, 0);
});

test("PASS no cookie: no refusal write", async () => {
  const b = ids();
  setStripe(digitalSession(b.session, b.pi), b.charge);
  const res = await route.GET(verifyRequest(b.session));
  assert.equal((await res.json()).paid, true);
  assert.equal(opLog.filter((entry) => entry.key.includes("stripe:transfer:refused:")).length, 0);
});

test("PASS repeated carry request: another durable attempt, same operation identity, zero movement", async () => {
  const a = ids();
  const b = ids();
  const aRecord = liveEntitlementRecord(a.pi);
  data.set(sessionKey(a.session), structuredClone(aRecord));
  setStripe(digitalSession(b.session, b.pi), b.charge);

  const first = await route.GET(verifyRequest(b.session, { cookie: carryCookie(a.session) }));
  assert.equal((await first.json()).paid, true);
  const second = await route.GET(verifyRequest(b.session, { cookie: carryCookie(a.session) }));
  const secondBody = await second.json();
  assert.equal(secondBody.paid, true);
  assert.deepEqual(secondBody.carryForward, CARRY_FORWARD);

  const attempts = refusalOps(a.session, b.session).filter((entry) => entry.op === "setDurable");
  assert.equal(attempts.length, 2, "each accepted carry request attempts the durable write");
  const record = data.get(refusalKey(a.session, b.session));
  assert.equal(record.movedCredits, 0);
  assert.deepEqual(data.get(sessionKey(a.session)), aRecord, "source balances never move");
});

// ---------------------------------------------------------------------------
// Structural pin: one attempt, at handler entry, outside the Stripe
// catch — covering the `!stripe` early return the harness cannot drive.
// ---------------------------------------------------------------------------

test("PIN route source: single handler-entry refusal attempt with the local 503 catch", () => {
  const source = readFileSync(
    new URL("../../src/app/api/stripe/verify/route.ts", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes("carry_refusal_persistence_pending"));
  assert.equal(source.split("await recordTransferRefusal(").length - 1, 1, "exactly one attempt");
  const attemptIndex = source.indexOf("await recordTransferRefusal(");
  const firstReadIndex = source.indexOf("const record = await kv.get");
  const stripeNullIndex = source.indexOf("if (!stripe)");
  const settleIndex = source.indexOf("await settleSessionPurchase(");
  assert.ok(attemptIndex !== -1 && firstReadIndex !== -1 && attemptIndex < firstReadIndex);
  assert.ok(stripeNullIndex !== -1 && attemptIndex < stripeNullIndex);
  assert.ok(settleIndex !== -1 && attemptIndex < settleIndex);
});
