// S94-1 follow-up — behavioural coverage for the five leftover findings
// of the Slate 94 money-path adjacency audit (F2, F3, F5, F7, F9).
// F1/F4/F6/F8 were fixed in PR #476 (moneyPathS931.test.mjs).
//
// Harness notes (modelled on moneyPathS931.test.mjs):
// - The webhook route is driven through signed POSTs; the portal /
//   referral-link / referral-status / consume / print-retry routes are
//   driven through NextRequest objects against the same fake KV.
// - The reward cap env is set BEFORE the webhook module loads, because
//   the cap limits are module-level constants in the route.
// - Race interleaves are driven through the fake KV's read hooks: the
//   victim request's read returns its snapshot, THEN the test mutates
//   the stored state (the concurrent writer landing), then the victim
//   resumes and writes from its stale snapshot — the exact interleave
//   each finding demonstrates.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { register } from "node:module";

register(new URL("./moneyPathS931.hooks.mjs", import.meta.url));
register(new URL("./entitlementAuthority.hooks.mjs", import.meta.url));
register(new URL("./gaConsentMode.hooks.mjs", import.meta.url));
register(new URL("./dl1S4NextServer.hooks.mjs", import.meta.url));
register("./tsAliasLoader.mjs", import.meta.url);

process.env.STARMAP_KV_ALLOW_LOCAL = "1";
process.env.STRIPE_SECRET_KEY ??= "sk_test_placeholder_not_a_real_key";
process.env[["STRIPE", "WEBHOOK", "SECRET"].join("_")] ??= "whsec_unit_test_placeholder";
process.env.ACCOUNT_RECOVERY_EMAIL_FROM ??= "StarMapCo <access@example.com>";
process.env.RESEND_API_KEY ??= "re_unit_test_placeholder";
// F7: a positive 24h reward cap of 2, read by the webhook module at load.
process.env.REFERRAL_MAX_REWARDS_PER_REFERRER_24H = "2";
delete process.env.REFERRAL_MAX_REWARDS_PER_REFERRER_30D;
// F9: alternate fulfilment destination + operator retry enabled.
process.env.PRINT_FULFILLMENT_WEBHOOK_URL = "https://fulfillment.example.test/hook";
process.env.PRINT_ORDER_SUBMISSION_ENABLED = "1";
process.env.PRINT_ADMIN_TOKEN = "unit-test-admin-token";
delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
delete process.env.GA4_API_SECRET;
delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
delete process.env.POSTHOG_API_KEY;
delete process.env.DL1_AUTHORITY_ROUTING_ENABLED;

/* The Stripe client captures fetch at construction (module scope), so the
 * fetch double must exist BEFORE the route modules load — the moneyPathS931
 * pattern. It delegates to per-test responders reset by installFetchDouble. */
const FULFILLMENT_URL = "https://fulfillment.example.test/hook";
let fetchLog = [];
let stripeResponder = async () => {
  throw new Error("moneyPathS94Followup harness: unstubbed Stripe API call");
};
let fulfillmentResponder = async () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  const method = init?.method ?? (typeof input === "object" ? input.method : undefined) ?? "GET";
  fetchLog.push({ url, method, headers: init?.headers ?? {}, body: init?.body });
  if (url.startsWith("https://api.resend.com/")) {
    return new Response(JSON.stringify({ id: "msg_unit" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (url.startsWith("https://api.stripe.com/")) return stripeResponder(url, init);
  if (url === FULFILLMENT_URL) return fulfillmentResponder(url, init);
  throw new Error(`moneyPathS94Followup harness: unexpected fetch ${url}`);
};

const { NextRequest } = await import("next/server");
const { kv, KvDurableWriteError } = await import("../../src/lib/kv.ts");
const { ENTITLEMENT_KV } = await import("../../src/lib/entitlementsStore.ts");
const { referralKey, referralRewardedKey } = await import("../../src/lib/referrals.ts");
const { appendReferralEvent, getReferralEvents } = await import(
  "../../src/lib/referralLedger.ts"
);
const { printOrderKey } = await import("../../src/lib/printOrders.ts");
const { __resetPrintOrderAuthorityMemoryForTests } = await import(
  "../../src/lib/printOrderAuthority.ts"
);
const webhookRoute = await import("../../src/app/api/stripe/webhook/route.ts");
const portalRoute = await import("../../src/app/api/stripe/portal/route.ts");
const referralLinkRoute = await import("../../src/app/api/referrals/link/route.ts");
const referralStatusRoute = await import("../../src/app/api/referrals/status/route.ts");
const consumeRoute = await import("../../src/app/api/entitlements/consume/route.ts");
const printRetryRoute = await import("../../src/app/api/print/orders/retry/route.ts");

/* ---------------- fake KV (moneyPathS931 shape) ---------------- */

const realKv = {
  get: kv.get,
  set: kv.set,
  setDurable: kv.setDurable,
  incr: kv.incr,
  getErrorPreserving: kv.getErrorPreserving,
  deleteDurable: kv.deleteDurable,
};

let data;
let putLog;
let failRules;
let getHook;
let epGetHook;

function installFakeKv() {
  data = new Map();
  putLog = [];
  failRules = [];
  getHook = null;
  epGetHook = null;
  const maybeFail = (op, key, value) => {
    const idx = failRules.findIndex(
      (rule) => rule.op === op && rule.match(key) && (!rule.valueMatch || rule.valueMatch(value)),
    );
    if (idx < 0) return;
    const rule = failRules[idx];
    rule.times -= 1;
    if (rule.times <= 0) failRules.splice(idx, 1);
    if (rule.error) throw rule.error;
    if (op === "setDurable" || op === "deleteDurable") {
      throw new KvDurableWriteError(`injected ${op} failure for ${key}`, {
        cause: new Error(`injected ${op} failure for ${key}`),
      });
    }
    throw new Error(`injected ${op} failure for ${key}`);
  };
  kv.get = async (key) => {
    const read = () => (data.has(key) ? structuredClone(data.get(key)) : null);
    return getHook ? getHook(key, read) : read();
  };
  kv.getErrorPreserving = async (key) => {
    const read = () => (data.has(key) ? structuredClone(data.get(key)) : null);
    return epGetHook ? epGetHook(key, read) : read();
  };
  kv.set = async (key, value) => {
    maybeFail("set", key, value);
    data.set(key, structuredClone(value));
    putLog.push({ op: "set", key });
    return "OK";
  };
  kv.setDurable = async (key, value) => {
    maybeFail("setDurable", key, value);
    data.set(key, structuredClone(value));
    putLog.push({ op: "setDurable", key });
    return "OK";
  };
  kv.incr = async (key, by = 1) => {
    maybeFail("incr", key);
    const next = Number(data.get(key) ?? 0) + by;
    data.set(key, next);
    putLog.push({ op: "incr", key });
    return next;
  };
  kv.deleteDurable = async (key) => {
    maybeFail("deleteDurable", key);
    data.delete(key);
    putLog.push({ op: "deleteDurable", key });
    return "OK";
  };
}

function restoreKv() {
  Object.assign(kv, realKv);
  delete process.env.DL1_AUTHORITY_ROUTING_ENABLED;
}

/* ---------------- fetch double (Stripe API + Resend + fulfilment) ----------------
 * The double itself is installed at module scope above (before the route
 * imports); installFetchDouble only resets the per-test responders + log. */

function installFetchDouble() {
  fetchLog = [];
  stripeResponder = async () => {
    throw new Error("moneyPathS94Followup harness: unstubbed Stripe API call");
  };
  fulfillmentResponder = async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
}

const fulfillmentCalls = () => fetchLog.filter((entry) => entry.url === FULFILLMENT_URL);
const stripeCallsTo = (fragment) =>
  fetchLog.filter((entry) => entry.url.includes(fragment));

/* ---------------- fixtures ---------------- */

const sessionKey = (id) => ENTITLEMENT_KV.stripeSession(id);
const REFERRER_ID = "cs_referrer_main";
const REFERRAL_CODE = "FRIEND10";

function seedPaidSession(id, overrides = {}) {
  const record = {
    paid: true,
    plan: "pack3",
    creditsRemaining: 3,
    creditsTotal: 3,
    created: 1767225600000,
    customerId: "cus_referrer",
    customerEmail: "referrer@example.com",
    orderType: "digital",
    includesDigitalAddOn: false,
    paymentIntentId: "pi_referrer",
    ...overrides,
  };
  data.set(sessionKey(id), record);
  return record;
}

function seedReferralRecord(referrerSessionId = REFERRER_ID) {
  data.set(referralKey(REFERRAL_CODE), {
    code: REFERRAL_CODE,
    sessionId: referrerSessionId,
    createdAt: 1,
    visits: 0,
    conversions: 0,
    rewardsGranted: 0,
  });
}

function checkoutSessionFixture(overrides = {}) {
  return {
    id: "cs_buyer_main",
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    status: "complete",
    amount_total: 2900,
    currency: "usd",
    created: 1767225600,
    customer: "cus_buyer",
    customer_details: { email: null },
    customer_email: null,
    payment_intent: "pi_buyer_main",
    subscription: null,
    metadata: { plan: "pack3", credits: "3", qa_run: "true" },
    total_details: { breakdown: { discounts: [] } },
    ...overrides,
  };
}

function referralMetadata() {
  return { referral_code: REFERRAL_CODE, referrer_session_id: REFERRER_ID };
}

const WEBHOOK_SECRET = ["whsec", "unit_test_placeholder"].join("_");
function signPayload(payload) {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", WEBHOOK_SECRET).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

async function postEvent(event) {
  const payload = JSON.stringify(event);
  const req = new Request("https://starmapco.test/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signPayload(payload), "content-type": "application/json" },
    body: payload,
  });
  const res = await webhookRoute.POST(req);
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

function completedEvent(eventId, session) {
  return { id: eventId, object: "event", type: "checkout.session.completed", data: { object: session } };
}

function cookieRequest(url, sessionId, body) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      cookie: `starmap_premium=${sessionId}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * Park the FIRST read of `targetKey`: the read's snapshot is computed,
 * then the hook waits for the test to release it — so the victim
 * request resumes holding a snapshot the test has since overwritten
 * in the store (the concurrent writer's landing).
 */
function armReadPark(targetKey) {
  const park = { used: false, entered: null, gate: null, release: null };
  park.gate = new Promise((resolve) => {
    park.release = resolve;
  });
  const enteredPromise = new Promise((resolve) => {
    park.entered = resolve;
  });
  getHook = async (key, read) => {
    const value = read();
    if (!park.used && key === targetKey) {
      park.used = true;
      park.entered();
      await park.gate;
    }
    return value;
  };
  return { enteredPromise, release: () => park.release() };
}

/* ================= F7 — reward-cap evidence displaced in the activity feed ================= */

test("F7: cap evidence pushed outside the feed's read slice still enforces the 24h cap", async () => {
  installFakeKv();
  installFetchDouble();
  process.env.DL1_AUTHORITY_ROUTING_ENABLED = "1";
  try {
    seedPaidSession(REFERRER_ID);
    seedReferralRecord();
    const now = Date.now();
    // Two grants inside the 24h window (the configured cap is 2)…
    for (const buyer of ["cs_old_buyer_1", "cs_old_buyer_2"]) {
      await appendReferralEvent({
        code: REFERRAL_CODE,
        type: "reward_granted",
        eventId: `reward_granted:${buyer}`,
        createdAt: now - 60_000,
        details: { checkoutSessionId: buyer, rewardGranted: 1 },
      });
    }
    // …then enough ordinary visit traffic to push both grant events
    // outside the newest-50 slice getReferralEvents can return.
    for (let i = 0; i < 60; i += 1) {
      await appendReferralEvent({
        code: REFERRAL_CODE,
        type: "visit_recorded",
        createdAt: now - 30_000 + i,
        details: { source: "test" },
      });
    }
    const visible = await getReferralEvents(REFERRAL_CODE, 200);
    assert.equal(
      visible.filter((event) => event.type === "reward_granted").length,
      0,
      "precondition: the feed read slice no longer shows the grants",
    );

    const session = checkoutSessionFixture({
      metadata: { plan: "pack3", credits: "3", qa_run: "true", ...referralMetadata() },
    });
    const res = await postEvent(completedEvent("evt_f7_cap", session));
    assert.equal(res.status, 200, `cap decision finalises the event: ${JSON.stringify(res.body)}`);
    const state = data.get(referralRewardedKey(session.id));
    assert.equal(state.phase, "terminal_skip");
    assert.equal(state.rewardSkipReason, "reward_cap_24h_reached");
    assert.equal(state.rewardGranted, 0);
  } finally {
    restoreKv();
  }
});

test("F7: grants recorded in the dedicated cap ledger survive total feed eviction", async () => {
  installFakeKv();
  installFetchDouble();
  process.env.DL1_AUTHORITY_ROUTING_ENABLED = "1";
  try {
    const ledger = await import("../../src/lib/referralLedger.ts");
    assert.equal(
      typeof ledger.appendReferralRewardGrant,
      "function",
      "the dedicated reward-grant ledger writer exists",
    );
    seedPaidSession(REFERRER_ID);
    seedReferralRecord();
    const now = Date.now();
    for (const buyer of ["cs_old_buyer_1", "cs_old_buyer_2"]) {
      await ledger.appendReferralRewardGrant({
        code: REFERRAL_CODE,
        eventId: `reward_granted:${buyer}`,
        createdAt: now - 60_000,
        details: { checkoutSessionId: buyer, rewardGranted: 1 },
      });
    }
    // Evict everything from the bounded activity feed (storage cap 200).
    for (let i = 0; i < 210; i += 1) {
      await appendReferralEvent({
        code: REFERRAL_CODE,
        type: "visit_recorded",
        createdAt: now - 30_000 + i,
        details: { source: "test" },
      });
    }
    const storedFeed = data.get(`referral:events:${REFERRAL_CODE}`) ?? [];
    assert.equal(
      storedFeed.filter((event) => event.type === "reward_granted").length,
      0,
      "precondition: the bounded feed no longer holds the grant events at all",
    );

    const session = checkoutSessionFixture({
      id: "cs_buyer_f7b",
      payment_intent: "pi_buyer_f7b",
      metadata: { plan: "pack3", credits: "3", qa_run: "true", ...referralMetadata() },
    });
    const res = await postEvent(completedEvent("evt_f7_cap_ledger", session));
    assert.equal(res.status, 200, `cap decision finalises the event: ${JSON.stringify(res.body)}`);
    const state = data.get(referralRewardedKey(session.id));
    assert.equal(state.phase, "terminal_skip");
    assert.equal(state.rewardSkipReason, "reward_cap_24h_reached");
  } finally {
    restoreKv();
  }
});

/* ================= F5 — terminal outcome write must not erase a reversal ================= */

test("F5: a reversal landing between the terminal reread and the terminal write is not erased", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    seedPaidSession(REFERRER_ID);
    seedReferralRecord();
    const buyerId = "cs_buyer_main";
    data.set(`stripe:pi:pi_buyer_main`, buyerId);
    data.set(referralRewardedKey(buyerId), {
      referralCode: REFERRAL_CODE,
      referrerSessionId: REFERRER_ID,
      phase: "grant_confirmed",
      rewardGranted: 1,
      conversionRecorded: false,
      createdAt: 9,
    });
    // The reversal's FIRST durable act, simulated at the exact sliver
    // the finding demonstrates: the checkout pass has just re-read the
    // outcome record (its terminal reread — the SECOND error-preserving
    // read of the key in the bookkeeping block) when the refund
    // invocation's revocation evidence lands (markSessionRevoked
    // persists it before reverseReferralReward writes any flag). The
    // pass continues holding its pre-reversal snapshot; pre-fix its
    // terminal write then finalises a revoked purchase as a clean
    // completed conversion, and once the refund event's own dedupe
    // finalises, nothing ever revisits the erasure.
    let epReads = 0;
    epGetHook = async (key, read) => {
      const value = read();
      if (key === referralRewardedKey(buyerId)) {
        epReads += 1;
        if (epReads === 2) {
          data.set(ENTITLEMENT_KV.sessionRevoked(buyerId), {
            schemaVersion: 1,
            sessionId: buyerId,
            revoked: true,
            reason: "refund",
            paymentIntentId: "pi_buyer_main",
            revokedAt: 111,
          });
        }
      }
      return value;
    };
    const session = checkoutSessionFixture({
      metadata: { plan: "pack3", credits: "3", qa_run: "true", ...referralMetadata() },
    });
    const first = await postEvent(completedEvent("evt_f5_first", session));
    assert.equal(
      first.status,
      503,
      `the terminal write must not finalise around the in-flight reversal: ${JSON.stringify(first.body)}`,
    );
    const afterFirst = data.get(referralRewardedKey(buyerId));
    assert.equal(afterFirst.phase, "grant_confirmed", "no terminal write landed");
    assert.equal(
      data.get(referralKey(REFERRAL_CODE)).conversions,
      1,
      "the bookkeeping delta landed exactly once before the deferral",
    );

    // The refund event itself now completes the reversal against the
    // deferred record: counted-ness is evidenced by the aggregate
    // marker, so the counters are decremented back and the flags are
    // written by the reversal — the disposition the terminal write
    // would have erased.
    epGetHook = null;
    const refund = await postEvent({
      id: "evt_f5_refund",
      object: "event",
      type: "charge.refunded",
      created: 1_767_225_600,
      data: {
        object: {
          id: "ch_buyer_main",
          object: "charge",
          payment_intent: "pi_buyer_main",
          amount_refunded: 900,
          refunded: true,
        },
      },
    });
    assert.equal(refund.status, 200, `refund completes: ${JSON.stringify(refund.body)}`);
    const final = data.get(referralRewardedKey(buyerId));
    assert.equal(final.conversionReversed, true, "the reversal's flags are recorded");
    assert.equal(final.rewardReversed, true);
    assert.equal(final.reversalReason, "refund");
    const referralAfter = data.get(referralKey(REFERRAL_CODE));
    assert.equal(referralAfter.conversions, 0, "aggregate decremented exactly once");
    assert.equal(referralAfter.rewardsGranted, 0, "reward counter decremented exactly once");
    const events = data.get(`referral:events:${REFERRAL_CODE}`) ?? [];
    assert.equal(
      events.filter((e) => e.type === "reward_granted" && e.details?.checkoutSessionId === buyerId).length,
      1,
      "no duplicate reward_granted append",
    );
    assert.equal(
      events.filter((e) => e.type === "conversion_reversed" && e.details?.checkoutSessionId === buyerId).length,
      1,
      "the reversal's ledger entry landed",
    );

    // A later checkout redelivery observes the revocation and never
    // resurrects or rewrites the reversed record.
    const third = await postEvent(completedEvent("evt_f5_third", session));
    assert.equal(third.status, 200);
    const afterThird = data.get(referralRewardedKey(buyerId));
    assert.equal(afterThird.conversionReversed, true, "flags survive later deliveries");
    assert.equal(data.get(referralKey(REFERRAL_CODE)).conversions, 0, "no re-application");
  } finally {
    restoreKv();
  }
});

/* ================= F3 — revocation serialised against lease-holding accounting writers ================= */

test("F3: a refund landing mid-consume cannot be erased by the consume's stale write (and vice versa)", async () => {
  installFakeKv();
  installFetchDouble();
  // The accounting lease runs against the in-memory authority fallback
  // (the same opt-in the moneyPathS931 lease-tier tests use).
  process.env.STARMAP_ENTITLEMENT_AUTHORITY_LOCAL = "1";
  try {
    const buyerId = "cs_consume_f3";
    seedPaidSession(buyerId, {
      creditsRemaining: 2,
      creditsTotal: 3,
      paymentIntentId: "pi_f3",
      customerId: "cus_f3",
    });
    data.set(ENTITLEMENT_KV.stripePaymentIntent("pi_f3"), buyerId);

    // Park the consume inside its record read — it already holds the
    // accounting lease at this point, and its snapshot is pre-refund.
    const park = armReadPark(sessionKey(buyerId));
    const consumePromise = consumeRoute.POST(
      cookieRequest("https://starmapco.test/api/entitlements/consume", buyerId, {
        token: "consume-token-f3",
      }),
    );
    await park.enteredPromise;

    const refundEvent = {
      id: "evt_f3_refund_1",
      object: "event",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_f3",
          object: "charge",
          amount_refunded: 2900,
          refunded: true,
          payment_intent: "pi_f3",
        },
      },
    };
    let firstRefundThrew = false;
    let firstRefund = null;
    try {
      firstRefund = await postEvent(refundEvent);
    } catch {
      firstRefundThrew = true;
    }
    assert.ok(
      firstRefundThrew || firstRefund.status !== 200,
      "the refund must not finalise while the consume holds the accounting lease",
    );
    assert.equal(
      data.get(ENTITLEMENT_KV.stripeWebhookEvent("evt_f3_refund_1")),
      undefined,
      "the refund event is not deduped — it stays Stripe-retryable",
    );

    park.release();
    const consumeRes = await consumePromise;
    assert.equal(consumeRes.status, 200, "the in-flight consume completes legitimately");
    const consumeBody = await consumeRes.json();
    assert.equal(consumeBody.creditsRemaining, 1);

    const secondRefund = await postEvent({ ...refundEvent, id: "evt_f3_refund_2" });
    assert.equal(secondRefund.status, 200, `refund redelivery completes: ${JSON.stringify(secondRefund.body)}`);
    const final = data.get(sessionKey(buyerId));
    assert.equal(final.revoked, true, "revocation stands");
    assert.equal(final.paid, false);
    assert.equal(
      final.creditsRemaining,
      1,
      "revocation spread the post-consume record — the landed consume is not erased either",
    );
    const evidence = data.get(ENTITLEMENT_KV.sessionRevoked(buyerId));
    assert.equal(evidence?.revoked, true, "durable revocation evidence recorded");
  } finally {
    delete process.env.STARMAP_ENTITLEMENT_AUTHORITY_LOCAL;
    restoreKv();
  }
});

/* ================= F2 — metadata writers must not republish the session record ================= */

test("F2 (portal): the customerId cache write cannot republish stale entitlement state", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const sessionId = "cs_portal_f2";
    seedPaidSession(sessionId, {
      plan: "subscription",
      subscriptionActive: true,
      customerId: undefined,
      paymentIntentId: "pi_portal_f2",
    });
    stripeResponder = async (url) => {
      if (url.includes(`/v1/checkout/sessions/${sessionId}`)) {
        return new Response(
          JSON.stringify({ id: sessionId, object: "checkout.session", customer: "cus_portal_f2" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/v1/billing_portal/sessions")) {
        return new Response(
          JSON.stringify({ id: "bps_f2", object: "billing_portal.session", url: "https://billing.stripe.test/f2" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`unexpected Stripe call ${url}`);
    };

    // Park the portal request after its record read; a consume lands
    // meanwhile (the stored record moves on: 3 credits → 1).
    const park = armReadPark(sessionKey(sessionId));
    const portalPromise = portalRoute.POST(
      cookieRequest("https://starmapco.test/api/stripe/portal", sessionId),
    );
    await park.enteredPromise;
    data.set(sessionKey(sessionId), {
      ...data.get(sessionKey(sessionId)),
      creditsRemaining: 1,
    });
    park.release();

    const res = await portalPromise;
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.url, "https://billing.stripe.test/f2");
    const final = data.get(sessionKey(sessionId));
    assert.equal(final.creditsRemaining, 1, "the concurrent consume survives the portal request");
    assert.equal(final.customerId, undefined, "the session record itself is never written by the portal");
    const cached = data.get(ENTITLEMENT_KV.sessionCustomerId(sessionId));
    assert.equal(cached?.customerId, "cus_portal_f2", "the customer id is cached OUTSIDE the session record");

    // Second call reads the cache — no second Stripe session retrieve.
    const res2 = await portalRoute.POST(
      cookieRequest("https://starmapco.test/api/stripe/portal", sessionId),
    );
    assert.equal(res2.status, 200);
    assert.equal(
      stripeCallsTo(`/v1/checkout/sessions/${sessionId}`).length,
      1,
      "customer lookup is served from the cache on the second call",
    );
  } finally {
    restoreKv();
  }
});

test("F2 (referral link): generating a code cannot republish stale entitlement state", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const sessionId = "cs_link_f2";
    seedPaidSession(sessionId, { paymentIntentId: "pi_link_f2" });
    const park = armReadPark(sessionKey(sessionId));
    const linkPromise = referralLinkRoute.POST(
      cookieRequest("https://starmapco.test/api/referrals/link", sessionId),
    );
    await park.enteredPromise;
    data.set(sessionKey(sessionId), {
      ...data.get(sessionKey(sessionId)),
      paid: false,
      revoked: true,
      creditsRemaining: 0,
    });
    park.release();

    const res = await linkPromise;
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.code, "a code is generated");
    const final = data.get(sessionKey(sessionId));
    assert.equal(final.revoked, true, "the concurrent revocation survives code generation");
    assert.equal(final.creditsRemaining, 0, "the concurrent consume survives code generation");
    assert.equal(
      final.referralCode,
      undefined,
      "the generated code is NOT written onto the session record",
    );
    const record = data.get(referralKey(body.code));
    assert.equal(record?.sessionId, sessionId, "the referral record carries the ownership");
  } finally {
    restoreKv();
  }
});

test("F2 (consumers): link + status agree on the generated code; legacy inline codes still read", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const sessionId = "cs_link_clean";
    seedPaidSession(sessionId, {});
    const linkRes = await referralLinkRoute.POST(
      cookieRequest("https://starmapco.test/api/referrals/link", sessionId),
    );
    assert.equal(linkRes.status, 200);
    const { code } = await linkRes.json();
    assert.ok(code);
    const statusRes = await referralStatusRoute.GET(
      new NextRequest("https://starmapco.test/api/referrals/status", {
        headers: { cookie: `starmap_premium=${sessionId}` },
      }),
    );
    assert.equal(statusRes.status, 200);
    const statusBody = await statusRes.json();
    assert.equal(statusBody.code, code, "status serves the code the link route generated");

    // Legacy shape: code written inline on the session record by the
    // pre-fix writer keeps resolving through the merged-record path.
    const legacyId = "cs_link_legacy";
    seedPaidSession(legacyId, { referralCode: "LEGACY1" });
    data.set(referralKey("LEGACY1"), {
      code: "LEGACY1",
      sessionId: legacyId,
      createdAt: 1,
      visits: 0,
      conversions: 0,
      rewardsGranted: 0,
    });
    const legacyStatus = await referralStatusRoute.GET(
      new NextRequest("https://starmapco.test/api/referrals/status", {
        headers: { cookie: `starmap_premium=${legacyId}` },
      }),
    );
    assert.equal(legacyStatus.status, 200);
    assert.equal((await legacyStatus.json()).code, "LEGACY1");
    const legacyLink = await referralLinkRoute.POST(
      cookieRequest("https://starmapco.test/api/referrals/link", legacyId),
    );
    assert.equal(legacyLink.status, 200);
    assert.equal((await legacyLink.json()).code, "LEGACY1", "link returns the legacy code instead of minting a new one");
  } finally {
    restoreKv();
  }
});

/* ================= F9 — alternate fulfilment dispatch must be replay-safe ================= */

const F9_SESSION = "cs_test_f9_order";
// In-memory print-order authority fallback (the print authority suites'
// opt-in); the retry route seeds authority state from the KV record.
process.env.STARMAP_PRINT_ORDER_AUTHORITY_LOCAL = "1";

function seedPrintOrder(sessionId = F9_SESSION) {
  __resetPrintOrderAuthorityMemoryForTests();
  const record = {
    status: "failed",
    sessionId,
    printVariant: "poster_framed",
    includesDigitalAddOn: false,
    amountTotal: 9900,
    currency: "usd",
    customerEmail: "buyer@example.com",
    customerName: "Buyer One",
    shippingDetails: {
      name: "Buyer One",
      address: { line1: "1 Main St", city: "Victoria", state: "BC", country: "US", postal_code: "90210" },
    },
    printAssetId: "asset_f9_1",
    attempts: 1,
    error: "webhook_failed",
    terminalEventType: null,
    createdAt: Date.now(),
  };
  data.set(printOrderKey(sessionId), record);
  return record;
}

function stubStripeForRetry(sessionId = F9_SESSION) {
  stripeResponder = async (url) => {
    if (url.includes(`/v1/checkout/sessions/${sessionId}`)) {
      return new Response(
        JSON.stringify({
          id: sessionId,
          object: "checkout.session",
          payment_status: "paid",
          status: "complete",
          amount_total: 9900,
          currency: "usd",
          total_details: { breakdown: { discounts: [] } },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`unexpected Stripe call ${url}`);
  };
}

function retryRequest(sessionId = F9_SESSION) {
  return new NextRequest("https://starmapco.test/api/print/orders/retry", {
    method: "POST",
    headers: {
      "x-print-admin-token": "unit-test-admin-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ sessionId }),
  });
}

test("F9: an accepted dispatch whose sent-write fails is never blindly redispatched", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    seedPrintOrder();
    stubStripeForRetry();
    failRules.push({
      op: "setDurable",
      match: (key) => key === printOrderKey(F9_SESSION),
      valueMatch: (value) => value?.status === "sent",
      times: 1,
    });
    await assert.rejects(
      () => printRetryRoute.POST(retryRequest()),
      "the failed sent-write propagates instead of being rewritten as a fulfilment failure",
    );
    const afterFailure = data.get(printOrderKey(F9_SESSION));
    assert.equal(afterFailure.status, "failed");
    assert.equal(
      afterFailure.alternateDispatch?.state,
      "attempted",
      "the dispatch attempt is durable BEFORE the side effect, so the unrecorded acceptance is visible",
    );
    assert.equal(afterFailure.alternateDispatch?.dispatchId, `alt-fulfillment:${F9_SESSION}`);

    const second = await printRetryRoute.POST(retryRequest());
    assert.equal(second.status, 409);
    assert.equal((await second.json()).error, "alternate_dispatch_reconciliation_required");
    assert.equal(fulfillmentCalls().length, 1, "no second outbound dispatch");
  } finally {
    restoreKv();
  }
});

test("F9: a dispatch with an unknown outcome (network failure) fails closed to reconciliation", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    seedPrintOrder();
    stubStripeForRetry();
    fulfillmentResponder = async () => {
      throw new TypeError("fetch failed");
    };
    const first = await printRetryRoute.POST(retryRequest());
    assert.equal(first.status, 502);
    const afterFailure = data.get(printOrderKey(F9_SESSION));
    assert.equal(afterFailure.alternateDispatch?.state, "attempted");

    const second = await printRetryRoute.POST(retryRequest());
    assert.equal(second.status, 409);
    assert.equal((await second.json()).error, "alternate_dispatch_reconciliation_required");
    assert.equal(fulfillmentCalls().length, 1, "no second outbound dispatch");
  } finally {
    restoreKv();
  }
});

test("F9: a definitively rejected dispatch (receiver answered non-2xx) stays retryable", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    seedPrintOrder();
    stubStripeForRetry();
    let call = 0;
    fulfillmentResponder = async () => {
      call += 1;
      if (call === 1) {
        return new Response("no", { status: 500, headers: { "content-type": "text/plain" } });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const first = await printRetryRoute.POST(retryRequest());
    assert.equal(first.status, 502);
    assert.equal(data.get(printOrderKey(F9_SESSION)).alternateDispatch?.state, "rejected");

    const second = await printRetryRoute.POST(retryRequest());
    assert.equal(second.status, 200);
    const sent = data.get(printOrderKey(F9_SESSION));
    assert.equal(sent.status, "sent");
    assert.equal(sent.alternateDispatch?.state, "accepted");
    assert.equal(fulfillmentCalls().length, 2, "a rejected dispatch may be retried exactly once more");
  } finally {
    restoreKv();
  }
});

test("F9: a clean dispatch carries the stable dispatch identity in payload and header", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    seedPrintOrder();
    stubStripeForRetry();
    const res = await printRetryRoute.POST(retryRequest());
    assert.equal(res.status, 200);
    assert.equal(fulfillmentCalls().length, 1);
    const call = fulfillmentCalls()[0];
    const payload = JSON.parse(call.body);
    assert.equal(payload.dispatchId, `alt-fulfillment:${F9_SESSION}`);
    const headers = new Headers(call.headers);
    assert.equal(headers.get("idempotency-key"), `alt-fulfillment:${F9_SESSION}`);
    const sent = data.get(printOrderKey(F9_SESSION));
    assert.equal(sent.status, "sent");
    assert.equal(sent.alternateDispatch?.state, "accepted");
    assert.equal(sent.alternateDispatch?.dispatchId, `alt-fulfillment:${F9_SESSION}`);
  } finally {
    restoreKv();
  }
});
