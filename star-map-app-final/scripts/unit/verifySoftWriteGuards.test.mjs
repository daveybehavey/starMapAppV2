/**
 * verifySoftWriteGuards.test.mjs — S74-1 fault-injection acceptance tests
 * for the verify route's post-settlement auxiliary guards.
 *
 * Defect (proven S73-4, briefed S74-1): after settleSessionPurchase
 * returned `initialized`, three auxiliary operations in
 * src/app/api/stripe/verify/route.ts were awaited unguarded — the
 * recordPaymentVerifiedOnce analytics call (funnel kv.incr), the
 * payment-intent mapping kv.set, and the subscription mapping kv.set.
 * Any ordinary-KV soft-write rejection propagated into the route's outer
 * catch and converted a settled payment into a definitive
 * { paid: false }.
 *
 * These tests drive the REAL verify GET handler (dl1Slice4Route /
 * reviewProofSidecar harness pattern) against:
 *   - a fault-injecting fake KV (the real kv object's methods are
 *     replaced, following the settlementMitigation pattern) with an
 *     operation ledger and per-(operation, key) fault rules, so an
 *     auxiliary outage never becomes a settlement outage;
 *   - a fetch-level Stripe double (the route's module-private Stripe
 *     client is built on the fetch HTTP client, so stubbing
 *     globalThis.fetch before import answers its API calls).
 *
 * The storage double injects at the kv boundary: persistOrdinaryKvIncr's
 * internal remote get/put phases (kv.ts) both surface to the route as
 * the single kv.incr rejection, so the dedupe read-phase and put-phase
 * scenarios below are exercised as boundary rejections with distinct
 * injected errors. The route guards catch ALL failures at the boundary,
 * not only KvSoftWriteError — one scenario injects a generic Error.
 *
 * Negative controls: the fault-injection PASS tests fail on the pre-fix
 * route (each degraded call answered { paid: false }); the genuinely
 * unpaid, revocation, reconciliation_required and
 * persistence_ambiguous controls pin the behaviors the fix must NOT
 * change. The metadata-completion persistence_ambiguous control sits at
 * the settlement surface (per the brief: verify's builder supplies none
 * of the six completion fields, so no natural verify fixture exists).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";

register("./tsAliasLoader.mjs", import.meta.url);
// The route's dependency graph carries literal-.mjs alias imports
// (e.g. "@/lib/commerceAnalyticsQa.mjs") that tsAliasLoader does not
// resolve; the gaConsentMode hook maps those to the literal file.
register("./gaConsentMode.hooks.mjs", import.meta.url);
// Plain Node cannot resolve the `next/server` package subpath; the S4
// route tests' hook maps it to the package's server.js entry.
register("./dl1S4NextServer.hooks.mjs", import.meta.url);

process.env.STARMAP_KV_ALLOW_LOCAL = "1";
// Placeholder so the route module constructs its (fetch-stubbed) Stripe
// client. Not a credential; no network call leaves the fetch double.
process.env.STRIPE_SECRET_KEY = "unit-test-placeholder-not-a-credential";
// GA4 / PostHog server purchases stay env-gated off in this harness.
delete process.env.NEXT_PUBLIC_GA_ID;
delete process.env.GA4_API_SECRET;
delete process.env.NEXT_PUBLIC_POSTHOG_KEY;

// ---------------------------------------------------------------------------
// Stripe double (fetch level, installed before the route import).
// ---------------------------------------------------------------------------
let stripeSessionFixture = null;
let stripeSessionError = null;
let stripePiFixture = null;
let stripePiError = null;

globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.startsWith("https://api.stripe.com/v1/checkout/sessions/")) {
    if (stripeSessionError) throw stripeSessionError;
    return new Response(JSON.stringify(stripeSessionFixture), {
      status: 200,
      headers: { "content-type": "application/json", "request-id": "req_guard_session" },
    });
  }
  if (url.startsWith("https://api.stripe.com/v1/payment_intents/")) {
    if (stripePiError) throw stripePiError;
    return new Response(JSON.stringify(stripePiFixture), {
      status: 200,
      headers: { "content-type": "application/json", "request-id": "req_guard_pi" },
    });
  }
  throw new Error(`unexpected fetch in verify guard harness: ${url}`);
};

const { NextRequest } = await import("next/server");
const route = await import("../../src/app/api/stripe/verify/route.ts");
const { kv, KvSoftWriteError } = await import("../../src/lib/kv.ts");
const { ENTITLEMENT_KV, settleSessionPurchase } = await import(
  "../../src/lib/entitlementsStore.ts"
);

// ---------------------------------------------------------------------------
// Fault-injecting storage double with an operation ledger.
// ---------------------------------------------------------------------------
const realKv = { get: kv.get, set: kv.set, setDurable: kv.setDurable, incr: kv.incr };

let data;
let opLog;
let faults;
let getHook;

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
  getHook = null;
  kv.get = async (key) => {
    opLog.push({ op: "get", key });
    const read = () => (data.has(key) ? structuredClone(data.get(key)) : null);
    return getHook ? getHook(key, read) : read();
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
  stripePiError = null;
});
test.after(() => restoreKv());

/**
 * Add a fault rule. `when: "before"` rejects without committing;
 * `when: "after"` commits, then rejects (the write may be durable even
 * though the caller saw a failure). Default error is KvSoftWriteError.
 */
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
// Keys, fixtures, request/response helpers.
// ---------------------------------------------------------------------------
const sessionKey = (id) => ENTITLEMENT_KV.stripeSession(id);
const intentKey = (id) => ENTITLEMENT_KV.settlementIntent(id);
const piKey = (pi) => ENTITLEMENT_KV.stripePaymentIntent(pi);
const subKey = (sub) => ENTITLEMENT_KV.stripeSubscription(sub);
const chargeKey = (charge) => ENTITLEMENT_KV.stripeCharge(charge);
const dedupeKey = (id) => `funnel:payment_verified:session:${id}`;
const MAP_ID = "11111111-2222-4333-8444-555555555555";

let seq = 0;
function ids() {
  seq += 1;
  return {
    session: `cs_guard_${seq}`,
    pi: `pi_guard_${seq}`,
    sub: `sub_guard_${seq}`,
    charge: `ch_guard_${seq}`,
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
    customer: "cus_guard",
    metadata: { plan: "pack3", credits: "3", map_id: MAP_ID },
    total_details: { breakdown: { discounts: [] } },
  };
}

function subscriptionSession(id, pi, sub) {
  return {
    id,
    object: "checkout.session",
    mode: "subscription",
    payment_status: "paid",
    status: "complete",
    amount_total: 1900,
    currency: "usd",
    payment_intent: pi,
    subscription: sub,
    customer: "cus_guard",
    metadata: { plan: "subscription", map_id: MAP_ID },
    total_details: { breakdown: { discounts: [] } },
  };
}

function printSession(id, pi, { addon = false } = {}) {
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
    customer: "cus_guard",
    metadata: {
      order_type: "print",
      print_variant: "poster_unframed",
      ...(addon ? { print_include_digital: "true", plan: "single", credits: "1" } : {}),
    },
    total_details: { breakdown: { discounts: [] } },
  };
}

function setStripe(session, charge) {
  stripeSessionFixture = session;
  stripeSessionError = null;
  stripePiError = null;
  stripePiFixture = session?.payment_intent
    ? { id: session.payment_intent, object: "payment_intent", latest_charge: charge }
    : null;
}

let ipSeq = 0;
function verifyRequest(id, { cookie } = {}) {
  ipSeq += 1;
  const headers = { "x-forwarded-for": `10.7.0.${ipSeq}` };
  if (cookie) headers.cookie = cookie;
  return new NextRequest(
    `https://starmapco.com/api/stripe/verify?session_id=${encodeURIComponent(id)}`,
    { headers },
  );
}

/** Remove wall-clock fields so cross-run storage snapshots can deep-equal. */
function stripVolatile(value) {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      if (["created", "initializedAt", "recordedAt", "observedAt", "updatedAt"].includes(key)) {
        continue;
      }
      out[key] = stripVolatile(entry);
    }
    return out;
  }
  return value;
}

function settlementSnapshot(id) {
  return {
    session: stripVolatile(data.get(sessionKey(id)) ?? null),
    intent: stripVolatile(data.get(intentKey(id)) ?? null),
  };
}

/** Run the same fixture with healthy storage; capture the baseline. */
async function healthyBaseline(id, session, charge) {
  installFakeKv();
  setStripe(session, charge);
  const res = await route.GET(verifyRequest(id));
  const body = await res.json();
  assert.equal(res.status, 200, "healthy baseline must succeed");
  assert.equal(body.paid, true, "healthy baseline must be paid");
  return {
    body,
    cookie: res.cookies.get("starmap_premium")?.value ?? null,
    snapshot: settlementSnapshot(id),
  };
}

function assertDegradedPaid(res, body, healthy, { cookie }) {
  assert.equal(res.status, 200);
  assert.deepEqual(body, healthy.body, "degraded body must equal the healthy initialized body");
  assert.equal(body.pending, undefined, "degraded body carries no pending field");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.cookies.get("starmap_premium")?.value ?? null, cookie);
}

const opsOn = (key) => opLog.filter((entry) => entry.key === key);

// ---------------------------------------------------------------------------
// Fault injection on the initialized path (the fix).
// ---------------------------------------------------------------------------

test("PASS healthy initialized path: paid body, cookie, mappings, analytics", async () => {
  const { session, pi, charge } = ids();
  setStripe(digitalSession(session, pi), charge);
  const res = await route.GET(verifyRequest(session));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(body, {
    paid: true,
    mapId: MAP_ID,
    amountTotal: 2900,
    currency: "usd",
    plan: "pack3",
    creditsRemaining: 3,
    subscriptionActive: false,
    orderType: "digital",
    printVariant: null,
    includesDigitalAddOn: false,
    isQa: false,
  });
  assert.equal(res.cookies.get("starmap_premium")?.value, session);
  assert.equal(data.get(piKey(pi)), session);
  assert.equal(data.get(chargeKey(charge)), session);
  assert.equal(data.get(dedupeKey(session)), 1);
});

test("PASS analytics dedupe remote-read failure: settled payment stays paid", async () => {
  const { session, pi, charge } = ids();
  const fixture = digitalSession(session, pi);
  const healthy = await healthyBaseline(session, fixture, charge);

  installFakeKv();
  setStripe(fixture, charge);
  addFault({
    op: "incr",
    match: (key) => key === dedupeKey(session),
    makeError: () => new KvSoftWriteError("injected dedupe remote-read failure"),
  });
  const res = await route.GET(verifyRequest(session));
  assertDegradedPaid(res, await res.json(), healthy, { cookie: session });
  assert.deepEqual(settlementSnapshot(session), healthy.snapshot);
  assert.equal(data.get(dedupeKey(session)), undefined, "dedupe value unchanged");
  assert.equal(data.get(piKey(pi)), session, "later mappings still attempted");
});

test("PASS analytics dedupe remote-put failure: settled payment stays paid", async () => {
  const { session, pi, charge } = ids();
  const fixture = digitalSession(session, pi);
  const healthy = await healthyBaseline(session, fixture, charge);

  installFakeKv();
  setStripe(fixture, charge);
  addFault({
    op: "incr",
    match: (key) => key === dedupeKey(session),
    makeError: () => new KvSoftWriteError("injected dedupe remote-put failure"),
  });
  const res = await route.GET(verifyRequest(session));
  assertDegradedPaid(res, await res.json(), healthy, { cookie: session });
  assert.deepEqual(settlementSnapshot(session), healthy.snapshot);
  assert.equal(data.get(dedupeKey(session)), undefined, "dedupe value unchanged");
  assert.equal(data.get(piKey(pi)), session, "later mappings still attempted");
});

test("PASS later funnel increment failure: dedupe stays committed, payment stays paid", async () => {
  const { session, pi, charge } = ids();
  const fixture = digitalSession(session, pi);
  const healthy = await healthyBaseline(session, fixture, charge);

  installFakeKv();
  setStripe(fixture, charge);
  addFault({ op: "incr", match: (key) => key === "funnel:total:payment_verified" });
  const res = await route.GET(verifyRequest(session));
  assertDegradedPaid(res, await res.json(), healthy, { cookie: session });
  assert.equal(data.get(dedupeKey(session)), 1, "dedupe remains committed; no rollback");
  assert.deepEqual(settlementSnapshot(session), healthy.snapshot);
  assert.equal(data.get(piKey(pi)), session, "later mappings still attempted");
});

test("PASS analytics boundary rejects with a generic error: contained", async () => {
  const { session, pi, charge } = ids();
  const fixture = digitalSession(session, pi);
  const healthy = await healthyBaseline(session, fixture, charge);

  installFakeKv();
  setStripe(fixture, charge);
  addFault({
    op: "incr",
    match: (key) => key.startsWith("funnel:"),
    makeError: () => new Error("generic analytics boundary failure"),
  });
  const res = await route.GET(verifyRequest(session));
  assertDegradedPaid(res, await res.json(), healthy, { cookie: session });
  assert.deepEqual(settlementSnapshot(session), healthy.snapshot);
});

test("PASS payment-intent mapping failure: retrieval/charge still attempted, payment stays paid", async () => {
  const { session, pi, charge } = ids();
  const fixture = digitalSession(session, pi);
  const healthy = await healthyBaseline(session, fixture, charge);

  installFakeKv();
  setStripe(fixture, charge);
  addFault({ op: "set", match: (key) => key === piKey(pi) });
  const res = await route.GET(verifyRequest(session));
  assertDegradedPaid(res, await res.json(), healthy, { cookie: session });
  assert.equal(data.get(piKey(pi)), undefined, "failed mapping unchanged");
  assert.equal(data.get(chargeKey(charge)), session, "charge mapping still executed");
  assert.deepEqual(settlementSnapshot(session), healthy.snapshot);
});

test("PASS payment-intent mapping put commits then rejects: payment stays paid", async () => {
  const { session, pi, charge } = ids();
  const fixture = digitalSession(session, pi);
  const healthy = await healthyBaseline(session, fixture, charge);

  installFakeKv();
  setStripe(fixture, charge);
  addFault({ op: "set", match: (key) => key === piKey(pi), when: "after" });
  const res = await route.GET(verifyRequest(session));
  assertDegradedPaid(res, await res.json(), healthy, { cookie: session });
  assert.equal(data.get(piKey(pi)), session, "committed mapping may remain");
  assert.deepEqual(settlementSnapshot(session), healthy.snapshot);
});

test("PASS subscription mapping failure: payment stays paid, earlier mappings retained", async () => {
  const { session, pi, sub, charge } = ids();
  const fixture = subscriptionSession(session, pi, sub);
  const healthy = await healthyBaseline(session, fixture, charge);

  installFakeKv();
  setStripe(fixture, charge);
  addFault({ op: "set", match: (key) => key === subKey(sub) });
  const res = await route.GET(verifyRequest(session));
  assertDegradedPaid(res, await res.json(), healthy, { cookie: session });
  assert.equal(data.get(subKey(sub)), undefined, "failed mapping unchanged");
  assert.equal(data.get(piKey(pi)), session, "successful earlier mapping retained");
  assert.deepEqual(settlementSnapshot(session), healthy.snapshot);
});

test("PASS subscription mapping put commits then rejects: payment stays paid", async () => {
  const { session, pi, sub, charge } = ids();
  const fixture = subscriptionSession(session, pi, sub);
  const healthy = await healthyBaseline(session, fixture, charge);

  installFakeKv();
  setStripe(fixture, charge);
  addFault({ op: "set", match: (key) => key === subKey(sub), when: "after" });
  const res = await route.GET(verifyRequest(session));
  assertDegradedPaid(res, await res.json(), healthy, { cookie: session });
  assert.equal(data.get(subKey(sub)), session, "committed mapping may remain");
  assert.deepEqual(settlementSnapshot(session), healthy.snapshot);
});

test("PASS all three auxiliary boundaries reject: each attempted independently, no extra grant", async () => {
  const { session, pi, sub, charge } = ids();
  const fixture = subscriptionSession(session, pi, sub);
  const healthy = await healthyBaseline(session, fixture, charge);

  installFakeKv();
  setStripe(fixture, charge);
  addFault({ op: "incr", match: (key) => key.startsWith("funnel:") });
  addFault({ op: "set", match: (key) => key === piKey(pi) });
  addFault({ op: "set", match: (key) => key === subKey(sub) });
  const res = await route.GET(verifyRequest(session));
  assertDegradedPaid(res, await res.json(), healthy, { cookie: session });
  assert.ok(opsOn(dedupeKey(session)).some((e) => e.op === "incr"), "analytics attempted");
  assert.ok(opsOn(piKey(pi)).some((e) => e.op === "set"), "payment-intent mapping attempted");
  assert.ok(opsOn(subKey(sub)).some((e) => e.op === "set"), "subscription mapping attempted");
  assert.equal(opsOn(sessionKey(session)).filter((e) => e.op === "set").length, 1, "one session write");
  assert.equal(
    opsOn(intentKey(session)).filter((e) => e.op === "setDurable").length,
    1,
    "one intent write — no settlement retry",
  );
  assert.deepEqual(settlementSnapshot(session), healthy.snapshot);
});

test("PASS payment-intent retrieval failure keeps its existing catch: payment stays paid", async () => {
  const { session, pi, sub, charge } = ids();
  const fixture = subscriptionSession(session, pi, sub);
  const healthy = await healthyBaseline(session, fixture, charge);

  installFakeKv();
  setStripe(fixture, charge);
  stripePiError = new Error("injected payment-intent retrieval failure");
  const res = await route.GET(verifyRequest(session));
  assertDegradedPaid(res, await res.json(), healthy, { cookie: session });
  assert.equal(data.get(piKey(pi)), session, "payment-intent mapping still written");
  assert.equal(data.get(subKey(sub)), session, "subscription mapping still executed");
});

// Cookie decisions under auxiliary failure, parameterized by purchase shape.
const cookieVariants = [
  {
    name: "digital credit purchase sets the cookie",
    make: (v) => digitalSession(v.session, v.pi),
    cookie: (v) => v.session,
  },
  {
    name: "subscription sets the cookie",
    make: (v) => subscriptionSession(v.session, v.pi, v.sub),
    cookie: (v) => v.session,
  },
  {
    name: "print-only sets NO cookie",
    make: (v) => printSession(v.session, v.pi),
    cookie: () => null,
  },
  {
    name: "print with digital add-on sets the cookie",
    make: (v) => printSession(v.session, v.pi, { addon: true }),
    cookie: (v) => v.session,
  },
];
for (const variant of cookieVariants) {
  test(`PASS cookie variant under mapping failure: ${variant.name}`, async () => {
    const v = ids();
    const fixture = variant.make(v);
    const healthy = await healthyBaseline(v.session, fixture, v.charge);
    assert.equal(healthy.cookie, variant.cookie(v), "healthy cookie decision");

    installFakeKv();
    setStripe(fixture, v.charge);
    addFault({ op: "set", match: (key) => key === piKey(v.pi) });
    const res = await route.GET(verifyRequest(v.session));
    assertDegradedPaid(res, await res.json(), healthy, { cookie: variant.cookie(v) });
  });
}

test("PASS cookie variant: preserved incoming live-entitlement cookie under mapping failure", async () => {
  const a = ids();
  const b = ids();
  // Session A already settled with live entitlement.
  const aRecord = {
    paid: true,
    plan: "pack3",
    creditsRemaining: 2,
    creditsTotal: 3,
    orderType: "digital",
    includesDigitalAddOn: false,
    paymentIntentId: a.pi,
  };
  const fixture = digitalSession(b.session, b.pi);

  installFakeKv();
  setStripe(fixture, b.charge);
  data.set(sessionKey(a.session), structuredClone(aRecord));
  const controlRes = await route.GET(
    verifyRequest(b.session, { cookie: `starmap_premium=${a.session}` }),
  );
  const controlBody = await controlRes.json();
  assert.equal(controlBody.paid, true);
  assert.deepEqual(controlBody.carryForward, {
    outcome: "carry_not_supported_interim",
    movedCredits: 0,
  });
  assert.equal(
    controlRes.cookies.get("starmap_premium"),
    undefined,
    "healthy path preserves the incoming cookie (no overwrite)",
  );
  const controlSnapshot = settlementSnapshot(b.session);

  installFakeKv();
  setStripe(fixture, b.charge);
  data.set(sessionKey(a.session), structuredClone(aRecord));
  addFault({ op: "set", match: (key) => key === piKey(b.pi) });
  const res = await route.GET(verifyRequest(b.session, { cookie: `starmap_premium=${a.session}` }));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(body, controlBody, "degraded body equals the healthy carry-refusal body");
  assert.equal(
    res.cookies.get("starmap_premium"),
    undefined,
    "degraded path still preserves the incoming cookie",
  );
  assert.deepEqual(data.get(sessionKey(a.session)), aRecord, "no balances moved between sessions");
  assert.deepEqual(settlementSnapshot(b.session), controlSnapshot);
});

// ---------------------------------------------------------------------------
// Retry behavior after a degraded success.
// ---------------------------------------------------------------------------

test("PASS retry after degraded success: stored balance served, auxiliaries not replayed", async () => {
  const { session, pi, charge } = ids();
  const fixture = digitalSession(session, pi);
  setStripe(fixture, charge);
  addFault({ op: "set", match: (key) => key === piKey(pi), times: 1 });
  const first = await route.GET(verifyRequest(session));
  assert.equal((await first.json()).paid, true);
  assert.equal(data.get(piKey(pi)), undefined, "mapping failed on the degraded call");

  // Consumption lands between calls.
  const settled = data.get(sessionKey(session));
  data.set(sessionKey(session), { ...settled, creditsRemaining: 2 });
  opLog = [];
  const retry = await route.GET(verifyRequest(session));
  const retryBody = await retry.json();
  assert.equal(retry.status, 200);
  assert.equal(retryBody.paid, true);
  assert.equal(retryBody.creditsRemaining, 2, "current stored balance; not replenished");
  assert.equal(
    opsOn(sessionKey(session)).filter((e) => e.op !== "get").length,
    0,
    "no session write on the retry",
  );
  assert.equal(
    opsOn(intentKey(session)).filter((e) => e.op !== "get").length,
    0,
    "no intent write on the retry",
  );
  assert.equal(data.get(piKey(pi)), undefined, "failed auxiliaries are not replayed");
});

test("PASS stale initial read, settlement sees settled record: already_settled response, no auxiliary calls", async () => {
  const { session, pi, charge } = ids();
  const fixture = digitalSession(session, pi);
  await healthyBaseline(session, fixture, charge);
  const settledRecord = structuredClone(data.get(sessionKey(session)));
  const settledIntent = structuredClone(data.get(intentKey(session)));

  installFakeKv();
  setStripe(fixture, charge);
  data.set(sessionKey(session), settledRecord);
  data.set(intentKey(session), settledIntent);
  let sessionReads = 0;
  getHook = (key, read) => {
    if (key === sessionKey(session)) {
      sessionReads += 1;
      if (sessionReads === 1) return null; // the route's initial read misses
    }
    return read();
  };
  const res = await route.GET(verifyRequest(session));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.paid, true);
  assert.equal(body.plan, "pack3");
  assert.equal(body.creditsRemaining, 3);
  assert.equal(body.mapId, MAP_ID);
  assert.equal(res.cookies.get("starmap_premium")?.value, session);
  assert.equal(
    opLog.filter((e) => e.op === "incr" && e.key.startsWith("funnel:")).length,
    0,
    "no analytics calls on already_settled",
  );
  assert.equal(opsOn(piKey(pi)).filter((e) => e.op === "set").length, 0, "no mapping calls");
  assert.equal(
    opsOn(sessionKey(session)).filter((e) => e.op !== "get").length,
    0,
    "no session rewrite",
  );
  assert.deepEqual(data.get(sessionKey(session)), settledRecord, "record preserved byte-for-byte");
});

// ---------------------------------------------------------------------------
// Negative controls: behaviors the fix must not change.
// ---------------------------------------------------------------------------

test("CONTROL genuinely unpaid session: definitive unpaid, no writes", async () => {
  const { session } = ids();
  setStripe(
    {
      id: session,
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
  const res = await route.GET(verifyRequest(session));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { paid: false });
  assert.equal(res.cookies.get("starmap_premium"), undefined);
  assert.equal(
    opLog.filter((e) => e.op === "set" || e.op === "setDurable").length,
    0,
    "no settlement intent, grant, or auxiliary writes",
  );
});

test("CONTROL genuinely unpaid fixture, Stripe retrieval rejects: outer-catch unpaid", async () => {
  const { session } = ids();
  stripeSessionError = new Error("injected Stripe retrieval failure");
  const res = await route.GET(verifyRequest(session));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { paid: false });
  assert.equal(res.cookies.get("starmap_premium"), undefined);
  assert.equal(opLog.filter((e) => e.op === "set" || e.op === "setDurable").length, 0);
});

test("CONTROL revocation via record flag: revoked body, no cookie", async () => {
  const { session, pi } = ids();
  data.set(sessionKey(session), {
    paid: true,
    revoked: true,
    plan: "pack3",
    creditsRemaining: 3,
    orderType: "digital",
    paymentIntentId: pi,
  });
  const res = await route.GET(verifyRequest(session));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { paid: false, revoked: true });
  assert.equal(res.cookies.get("starmap_premium"), undefined);
});

test("CONTROL revocation via side evidence record: revoked body, no cookie", async () => {
  const { session } = ids();
  data.set(ENTITLEMENT_KV.sessionRevoked(session), { revoked: true, reason: "refund" });
  const res = await route.GET(verifyRequest(session));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { paid: false, revoked: true });
  assert.equal(res.cookies.get("starmap_premium"), undefined);
});

test("CONTROL revocation via payment-intent tombstone: revoked body, no cookie", async () => {
  const { session, pi } = ids();
  data.set(sessionKey(session), {
    paid: true,
    plan: "pack3",
    creditsRemaining: 1,
    orderType: "digital",
    paymentIntentId: pi,
  });
  data.set(`stripe:pi:revoked:${pi}`, { revoked: true, reason: "refund" });
  const res = await route.GET(verifyRequest(session));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { paid: false, revoked: true });
  assert.equal(res.cookies.get("starmap_premium"), undefined);
});

test("CONTROL revocation lands at settlement's pre-put check: revoked body, intent retained, no session write", async () => {
  const { session, pi, charge } = ids();
  setStripe(digitalSession(session, pi), charge);
  const revokedKey = ENTITLEMENT_KV.sessionRevoked(session);
  let evidenceReads = 0;
  getHook = (key, read) => {
    if (key === revokedKey) {
      evidenceReads += 1;
      // Route read (1) and settlement's first read (2) see nothing; the
      // pre-put re-check (3) sees the revocation.
      if (evidenceReads >= 3) return { revoked: true, reason: "refund" };
      return null;
    }
    return read();
  };
  const res = await route.GET(verifyRequest(session));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { paid: false, revoked: true });
  assert.equal(res.cookies.get("starmap_premium"), undefined);
  assert.ok(data.get(intentKey(session)), "durable intent retained");
  assert.equal(data.get(sessionKey(session)), undefined, "no session initialization");
  assert.equal(
    opLog.filter((e) => e.op === "incr" && e.key.startsWith("funnel:")).length,
    0,
    "no auxiliary execution after the denying branch",
  );
});

test("CONTROL revocation lands after the session put: revoked body, session write preserved", async () => {
  const { session, pi, charge } = ids();
  setStripe(digitalSession(session, pi), charge);
  const revokedKey = ENTITLEMENT_KV.sessionRevoked(session);
  let evidenceReads = 0;
  getHook = (key, read) => {
    if (key === revokedKey) {
      evidenceReads += 1;
      // Only the post-write check (4) sees the revocation.
      if (evidenceReads >= 4) return { revoked: true, reason: "refund" };
      return null;
    }
    return read();
  };
  const res = await route.GET(verifyRequest(session));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { paid: false, revoked: true });
  assert.equal(res.cookies.get("starmap_premium"), undefined);
  assert.ok(data.get(sessionKey(session)), "the documented post-write session write remains");
});

test("CONTROL conflicting receipt (stale initial read): 503 reconciliation_required", async () => {
  const { session, pi, charge } = ids();
  const fixture = digitalSession(session, pi);
  await healthyBaseline(session, fixture, charge);
  const settledRecord = structuredClone(data.get(sessionKey(session)));
  settledRecord.settlementReceipt.purchaseTerms.purchasedCredits = 99;

  installFakeKv();
  setStripe(fixture, charge);
  data.set(sessionKey(session), settledRecord);
  let sessionReads = 0;
  getHook = (key, read) => {
    if (key === sessionKey(session)) {
      sessionReads += 1;
      if (sessionReads === 1) return null;
    }
    return read();
  };
  const res = await route.GET(verifyRequest(session));
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), {
    paid: false,
    pending: true,
    reason: "reconciliation_required",
  });
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("retry-after"), "2");
  assert.equal(res.cookies.get("starmap_premium"), undefined);
  assert.deepEqual(data.get(sessionKey(session)), settledRecord, "existing accounting preserved");
});

test("CONTROL unpaid record carrying accounting state: 503 reconciliation_required", async () => {
  const { session, pi, charge } = ids();
  setStripe(digitalSession(session, pi), charge);
  data.set(sessionKey(session), { paid: false, creditsRemaining: 2 });
  const res = await route.GET(verifyRequest(session));
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), {
    paid: false,
    pending: true,
    reason: "reconciliation_required",
  });
  assert.equal(res.headers.get("retry-after"), "2");
  assert.equal(res.cookies.get("starmap_premium"), undefined);
  assert.deepEqual(data.get(sessionKey(session)), { paid: false, creditsRemaining: 2 });
});

test("CONTROL durable intent write rejects before commit: 503 persistence_ambiguous", async () => {
  const { session, pi, charge } = ids();
  setStripe(digitalSession(session, pi), charge);
  addFault({ op: "setDurable", match: (key) => key === intentKey(session) });
  const res = await route.GET(verifyRequest(session));
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), {
    paid: false,
    pending: true,
    reason: "persistence_ambiguous",
  });
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("retry-after"), "2");
  assert.equal(res.cookies.get("starmap_premium"), undefined);
  assert.equal(data.get(intentKey(session)), undefined, "intent key unchanged");
  assert.equal(data.get(sessionKey(session)), undefined, "no session initialization");
});

test("CONTROL session put rejects before commit after intent commit: 503 persistence_ambiguous", async () => {
  const { session, pi, charge } = ids();
  setStripe(digitalSession(session, pi), charge);
  addFault({ op: "set", match: (key) => key === sessionKey(session) });
  const res = await route.GET(verifyRequest(session));
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), {
    paid: false,
    pending: true,
    reason: "persistence_ambiguous",
  });
  assert.ok(data.get(intentKey(session)), "intent retained");
  assert.equal(data.get(sessionKey(session)), undefined, "session absent on before-commit rejection");
  assert.equal(
    opLog.filter((e) => e.op === "incr" && e.key.startsWith("funnel:")).length,
    0,
    "no auxiliary execution",
  );
});

test("CONTROL session put rejects after commit: 503 persistence_ambiguous, session may be committed", async () => {
  const { session, pi, charge } = ids();
  setStripe(digitalSession(session, pi), charge);
  addFault({ op: "set", match: (key) => key === sessionKey(session), when: "after" });
  const res = await route.GET(verifyRequest(session));
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), {
    paid: false,
    pending: true,
    reason: "persistence_ambiguous",
  });
  assert.ok(data.get(intentKey(session)), "intent retained");
  assert.ok(data.get(sessionKey(session)), "session committed despite the rejection");
});

test("CONTROL metadata-completion sidecar write rejects (settlement surface): persistence_ambiguous", async () => {
  const { session, pi } = ids();
  const existing = {
    paid: true,
    created: 1_700_000_000_000,
    plan: "pack3",
    creditsRemaining: 3,
    creditsTotal: 3,
    orderType: "digital",
    includesDigitalAddOn: false,
    paymentIntentId: pi,
  };
  data.set(sessionKey(session), structuredClone(existing));
  addFault({
    op: "setDurable",
    match: (key) => key === ENTITLEMENT_KV.settlementMetadata(session),
  });
  const outcome = await settleSessionPurchase({
    sessionId: session,
    paymentIntentId: pi,
    purchaseTerms: {
      plan: "pack3",
      purchasedCredits: 3,
      orderType: "digital",
      printVariant: null,
      includesDigitalAddOn: false,
      subscription: false,
      amountTotal: 2900,
      currency: "usd",
      paymentIntentId: pi,
      subscriptionId: null,
      customerId: "cus_guard",
    },
    // Webhook-style builder: carries a completion field the existing
    // record lacks (verify's own builder never does — see header).
    buildInitialRecord: () => ({ ...existing, customerEmail: "buyer@example.test" }),
  });
  assert.equal(outcome.kind, "persistence_ambiguous");
  assert.deepEqual(data.get(sessionKey(session)), existing, "session accounting unchanged");
});

// ---------------------------------------------------------------------------
// Structural pins: the three guards exist at the route's auxiliary
// boundaries (these fail on the pre-fix route source).
// ---------------------------------------------------------------------------

test("PIN route source carries the three local auxiliary guards", () => {
  const source = readFileSync(
    new URL("../../src/app/api/stripe/verify/route.ts", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes("Stripe verify payment analytics recording failed"));
  assert.ok(source.includes("Stripe verify payment-intent mapping write failed"));
  assert.ok(source.includes("Stripe verify subscription mapping write failed"));
  // The guards sit AFTER settlement: the settlement call precedes the
  // analytics guard in source order.
  const settleIndex = source.indexOf("await settleSessionPurchase(");
  const guardIndex = source.indexOf("Stripe verify payment analytics recording failed");
  assert.ok(settleIndex !== -1 && guardIndex > settleIndex);
});
