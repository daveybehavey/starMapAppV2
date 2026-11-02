// S94-1 follow-up — behavioural coverage for the five leftover findings
// of the Slate 94 money-path adjacency audit (F2, F3, F5, F7, F9).
// F1/F4/F6/F8 were fixed in PR #476 (moneyPathS931.test.mjs).
// S96-1 continuation (final section): F2 — the F9 marker was
// check-then-write, so concurrent deliveries could both dispatch; the
// atomic authority claim now gates both dispatch sites. F1 — Printful
// order_put_hold was 200-ignored; it is now recorded + alerted.
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
const { kv, KvDurableWriteError, KvReadError } = await import("../../src/lib/kv.ts");
const { ENTITLEMENT_KV } = await import("../../src/lib/entitlementsStore.ts");
const { referralKey, referralRewardedKey } = await import("../../src/lib/referrals.ts");
const {
  appendReferralEvent,
  appendReferralRewardGrant,
  countRecentReferralRewardGrants,
  getReferralEvents,
} = await import("../../src/lib/referralLedger.ts");
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
const printfulWebhookRoute = await import("../../src/app/api/printful/webhook/route.ts");

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

test("F9: a receiver that creates the order and then answers 500 has NOT provably rejected — the dispatch stays attempted (gate fix round 1 P1-C re-pin)", async () => {
  // RE-PINNED in gate fix round 1 (Codex P1-C on PR #477): this test
  // previously asserted that ANY non-2xx answer — the 500 below —
  // marked the dispatch "rejected" and allowed a redispatch. That
  // classification is the defect: a receiver can create the order and
  // THEN fail (exactly what this responder models), and an
  // intermediary can answer after the receiver accepted, so no
  // non-2xx status proves rejection (the receiver's contract defines
  // none, and receiver-side idempotency is optional). The dispatch
  // now stays "attempted" and the next pass refuses — an operator
  // reconciles instead of risking a duplicate physical order.
  installFakeKv();
  installFetchDouble();
  try {
    seedPrintOrder();
    stubStripeForRetry();
    let receiverCreations = 0;
    fulfillmentResponder = async () => {
      // The receiver creates the physical order, then its response
      // path fails — the order exists receiver-side despite the 500.
      receiverCreations += 1;
      return new Response("internal error after create", {
        status: 500,
        headers: { "content-type": "text/plain" },
      });
    };
    const first = await printRetryRoute.POST(retryRequest());
    assert.equal(first.status, 502);
    const afterFirst = data.get(printOrderKey(F9_SESSION));
    assert.equal(
      afterFirst.alternateDispatch?.state,
      "attempted",
      "an ambiguous non-2xx never moves the marker to rejected",
    );
    assert.equal(afterFirst.alternateDispatch?.httpStatus, 500, "the response facts are recorded");

    const second = await printRetryRoute.POST(retryRequest());
    assert.equal(second.status, 409);
    assert.equal((await second.json()).error, "alternate_dispatch_reconciliation_required");
    assert.equal(fulfillmentCalls().length, 1, "no second outbound dispatch");
    assert.equal(receiverCreations, 1, "the receiver never creates a duplicate");
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

/* ================= Gate fix round 1 — P1-A (F3): revocation vs previously-sealed writers ================= */

test("P1-A (F3): a consume that sealed before an authority outage cannot resurrect a revocation that landed unleased during it", async () => {
  installFakeKv();
  installFetchDouble();
  process.env.STARMAP_ENTITLEMENT_AUTHORITY_LOCAL = "1";
  try {
    const { __resetEntitlementAuthorityMemoryForTests } = await import(
      "../../src/lib/entitlementAuthority.ts"
    );
    __resetEntitlementAuthorityMemoryForTests();
    const buyerId = "cs_consume_p1a";
    seedPaidSession(buyerId, {
      creditsRemaining: 2,
      creditsTotal: 3,
      paymentIntentId: "pi_p1a",
      customerId: "cus_p1a",
    });
    data.set(ENTITLEMENT_KV.stripePaymentIntent("pi_p1a"), buyerId);

    // Park the consume inside its record read — it already holds the
    // accounting lease at this point and seals as soon as it resumes.
    // Its snapshot is pre-revocation.
    const park = armReadPark(sessionKey(buyerId));
    const consumePromise = consumeRoute.POST(
      cookieRequest("https://starmapco.test/api/entitlements/consume", buyerId, {
        token: "consume-token-p1a",
      }),
    );
    await park.enteredPromise;

    // The authority drops. The in-memory lease state survives the
    // outage (the consume's lease — and its seal when the authority
    // returns — remain valid), which is exactly the previously-sealed
    // window: the revocation can only proceed unleased, and
    // markSessionRevoked's "seals fail closed during an outage"
    // reasoning does not reach a writer that seals after it returns.
    delete process.env.STARMAP_ENTITLEMENT_AUTHORITY_LOCAL;
    const refund = await postEvent({
      id: "evt_p1a_refund",
      object: "event",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_p1a",
          object: "charge",
          amount_refunded: 2900,
          refunded: true,
          payment_intent: "pi_p1a",
        },
      },
    });
    assert.equal(
      refund.status,
      200,
      `the revocation lands unleased during the outage: ${JSON.stringify(refund.body)}`,
    );
    assert.equal(
      data.get(sessionKey(buyerId))?.revoked,
      true,
      "precondition: the revocation completed during the outage",
    );
    assert.equal(
      data.get(ENTITLEMENT_KV.sessionRevoked(buyerId))?.revoked,
      true,
      "precondition: durable revocation evidence landed during the outage",
    );

    // The authority returns; the consume resumes, seals its lease,
    // and — pre-fix — writes its stale pre-revocation snapshot,
    // resurrecting the entitlement (paid, un-revoked, debited).
    process.env.STARMAP_ENTITLEMENT_AUTHORITY_LOCAL = "1";
    park.release();
    const consumeRes = await consumePromise;
    assert.equal(
      consumeRes.status,
      403,
      "the previously-sealed consume must refuse once the revocation is durable",
    );
    const final = data.get(sessionKey(buyerId));
    assert.equal(final.revoked, true, "the revocation is NOT resurrected by the sealed writer");
    assert.equal(final.paid, false);
    assert.equal(final.creditsRemaining, 2, "no debit landed over the revocation");
  } finally {
    delete process.env.STARMAP_ENTITLEMENT_AUTHORITY_LOCAL;
    restoreKv();
  }
});

/* ================= Gate fix round 1 — P1-B (F5): reversal landing after the evidence consult ================= */

test("P1-B (F5): a reversal landing after the terminal evidence consult is merged by the terminal write, never erased", async () => {
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
    // Strike AFTER the terminal evidence consult returns clean. The
    // consult is the first error-preserving read of the buyer's
    // revocation-evidence key that follows the bookkeeping aggregate
    // write (visible in putLog) — every earlier evidence read belongs
    // to the settlement/decision phase. The hook returns the clean
    // snapshot, then lands the reversal exactly as the refund
    // invocation writes it: revocation evidence first
    // (markSessionRevoked), then the outcome-record flags and the
    // aggregate decrement (reverseReferralReward; counted-ness is
    // evidenced by the pass's own aggregate write). Pre-fix, the
    // terminal write then finalises from its stale snapshot and
    // erases the flags the reversal just wrote.
    let struck = false;
    epGetHook = async (key, read) => {
      const value = read();
      const aggregateWritten = putLog.some((entry) => entry.key === referralKey(REFERRAL_CODE));
      if (
        !struck &&
        key === ENTITLEMENT_KV.sessionRevoked(buyerId) &&
        aggregateWritten &&
        value === null
      ) {
        struck = true;
        data.set(ENTITLEMENT_KV.sessionRevoked(buyerId), {
          schemaVersion: 1,
          sessionId: buyerId,
          revoked: true,
          reason: "refund",
          paymentIntentId: "pi_buyer_main",
          revokedAt: 222,
        });
        const current = data.get(referralRewardedKey(buyerId));
        data.set(referralRewardedKey(buyerId), {
          ...current,
          conversionReversed: true,
          conversionReversedAt: 223,
          rewardReversed: true,
          rewardReversedAt: 223,
          reversalReason: "refund",
          rewardReclaimed: 0,
        });
        const referral = data.get(referralKey(REFERRAL_CODE));
        data.set(referralKey(REFERRAL_CODE), {
          ...referral,
          conversions: Math.max(0, (referral.conversions ?? 0) - 1),
          rewardsGranted: Math.max(0, (referral.rewardsGranted ?? 0) - 1),
        });
      }
      return value;
    };
    const session = checkoutSessionFixture({
      metadata: { plan: "pack3", credits: "3", qa_run: "true", ...referralMetadata() },
    });
    const first = await postEvent(completedEvent("evt_p1b_first", session));
    assert.equal(
      first.status,
      200,
      `the terminal write lands with the reversal merged: ${JSON.stringify(first.body)}`,
    );
    assert.ok(struck, "the interleave was actually driven (the evidence consult was struck)");
    const afterFirst = data.get(referralRewardedKey(buyerId));
    assert.equal(afterFirst.phase, "completed", "the conversion finalised");
    assert.equal(
      afterFirst.conversionReversed,
      true,
      "the reversal's flags survive the terminal write",
    );
    assert.equal(afterFirst.rewardReversed, true);
    assert.equal(afterFirst.reversalReason, "refund");

    // The refund event itself now finds the reversal already
    // recorded: it must not decrement the aggregates a second time.
    epGetHook = null;
    const refund = await postEvent({
      id: "evt_p1b_refund",
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
    const referralAfter = data.get(referralKey(REFERRAL_CODE));
    assert.equal(referralAfter.conversions, 0, "aggregate decremented exactly once across the interleave");
    assert.equal(referralAfter.rewardsGranted, 0, "reward counter decremented exactly once");
    const final = data.get(referralRewardedKey(buyerId));
    assert.equal(final.conversionReversed, true, "flags still stand after the refund delivery");
    assert.equal(final.rewardReversed, true);
  } finally {
    restoreKv();
  }
});

/* ================= Gate fix round 1 — BOT-P2 (F7): ledger history survives a failed read ================= */

test("BOT-P2 (F7): a failed grants-ledger read never overwrites the persisted grant history", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const grantsKey = `referral:reward-grants:${REFERRAL_CODE}`;
    const now = Date.now();
    for (const buyer of ["cs_old_buyer_1", "cs_old_buyer_2"]) {
      await appendReferralRewardGrant({
        code: REFERRAL_CODE,
        eventId: `reward_granted:${buyer}`,
        createdAt: now - 60_000,
        details: { checkoutSessionId: buyer, rewardGranted: 1 },
      });
    }
    assert.equal((data.get(grantsKey) ?? []).length, 2, "precondition: two grants persisted");

    // Transient read failure on the next append: the plain read
    // degrades to null (kv.get's failure mode on a Cloudflare read
    // error) and the error-preserving read throws (its failure
    // mode). Pre-fix the append consumed the degraded null as an
    // empty history and wrote it back over the persisted ledger,
    // permanently erasing both in-window grants.
    getHook = async (key, read) => (key === grantsKey ? null : read());
    epGetHook = async (key, read) => {
      if (key === grantsKey) throw new KvReadError("injected ledger read failure");
      return read();
    };
    await assert.rejects(
      () =>
        appendReferralRewardGrant({
          code: REFERRAL_CODE,
          eventId: "reward_granted:cs_new_buyer",
          createdAt: now,
          details: { checkoutSessionId: "cs_new_buyer", rewardGranted: 1 },
        }),
      "the append fails closed instead of replacing history it could not read",
    );
    getHook = null;
    epGetHook = null;

    const stored = data.get(grantsKey) ?? [];
    assert.deepEqual(
      stored.map((entry) => entry.id).sort(),
      ["reward_granted:cs_old_buyer_1", "reward_granted:cs_old_buyer_2"],
      "the persisted grants survive the failed append untouched",
    );
    assert.equal(
      await countRecentReferralRewardGrants(REFERRAL_CODE, 24 * 60 * 60 * 1000, now),
      2,
      "the cap count still sees the seeded grants",
    );

    // Once reads recover, the same grant appends WITHOUT losing the
    // history the failed attempt preserved.
    await appendReferralRewardGrant({
      code: REFERRAL_CODE,
      eventId: "reward_granted:cs_new_buyer",
      createdAt: now,
      details: { checkoutSessionId: "cs_new_buyer", rewardGranted: 1 },
    });
    assert.equal(
      await countRecentReferralRewardGrants(REFERRAL_CODE, 24 * 60 * 60 * 1000, now),
      3,
      "the recovered append unions with the preserved history",
    );
  } finally {
    restoreKv();
  }
});

/* ================= Gate fix round 1 — F9 webhook path: BOT-P1 + P1-C ================= */

const WH_PRINT_ASSET_ID = "123e4567-e89b-42d3-a456-426614174000";

function printCheckoutSessionFixture(sessionId, overrides = {}) {
  return checkoutSessionFixture({
    id: sessionId,
    payment_intent: `pi_${sessionId}`,
    amount_total: 9900,
    // No customer email: markSessionPaid's account-lite upsert needs a
    // consistency-coordinator binding this harness does not provide,
    // and nothing on the print path requires the email (the recipient
    // comes from shipping_details).
    customer_details: { email: null, name: "Buyer One" },
    shipping_details: {
      name: "Buyer One",
      address: { line1: "1 Main St", city: "Victoria", state: "BC", country: "US", postal_code: "90210" },
    },
    metadata: {
      order_type: "print",
      print_variant: "poster_framed",
      print_asset_id: WH_PRINT_ASSET_ID,
      qa_run: "true",
    },
    ...overrides,
  });
}

test("BOT-P1 (F9): the webhook's pending rebuild never erases the dispatch marker — a failed reconciliation write cannot reopen dispatch", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const sessionId = "cs_wh_botp1";
    __resetPrintOrderAuthorityMemoryForTests();
    // A prior delivery dispatched to the alternate receiver and its
    // outcome was never durably resolved: the marker stands at
    // "attempted" (the receiver may already hold the order).
    data.set(printOrderKey(sessionId), {
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
      printAssetId: WH_PRINT_ASSET_ID,
      attempts: 1,
      error: "webhook_failed",
      terminalEventType: null,
      createdAt: Date.now(),
      alternateDispatch: {
        dispatchId: `alt-fulfillment:${sessionId}`,
        state: "attempted",
        attemptedAt: Date.now() - 60_000,
      },
    });
    // The replay reaches the dispatch check and tries to persist the
    // reconciliation problem record — that ONE write fails.
    failRules.push({
      op: "setDurable",
      match: (key) => key === printOrderKey(sessionId),
      valueMatch: (value) => value?.error === "alternate_dispatch_reconciliation_required",
      times: 1,
    });
    const first = await postEvent(
      completedEvent("evt_botp1_first", printCheckoutSessionFixture(sessionId)),
    );
    assert.notEqual(
      first.status,
      200,
      `the failed reconciliation write leaves the event retryable: ${JSON.stringify(first.body)}`,
    );
    assert.equal(
      data.get(printOrderKey(sessionId))?.alternateDispatch?.state,
      "attempted",
      "the marker survives the replay's rebuild writes even though the reconciliation write failed",
    );

    // Redelivery: the stored marker still refuses dispatch. Pre-fix
    // the rebuild had already erased the marker, so this redelivery
    // dispatched into a receiver that may already hold the order.
    const second = await postEvent(
      completedEvent("evt_botp1_second", printCheckoutSessionFixture(sessionId)),
    );
    assert.equal(second.status, 200, `redelivery finalises as a refusal: ${JSON.stringify(second.body)}`);
    assert.equal(fulfillmentCalls().length, 0, "no outbound dispatch on either delivery");
    assert.equal(
      data.get(printOrderKey(sessionId))?.alternateDispatch?.state,
      "attempted",
      "the marker still stands for the operator",
    );
  } finally {
    restoreKv();
  }
});

test("P1-C (F9): a webhook dispatch answered 500 stays attempted and is never redispatched on redelivery", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const sessionId = "cs_wh_p1c";
    __resetPrintOrderAuthorityMemoryForTests();
    let receiverCreations = 0;
    fulfillmentResponder = async () => {
      // The receiver creates the order, then its response path fails.
      receiverCreations += 1;
      return new Response("internal error after create", {
        status: 500,
        headers: { "content-type": "text/plain" },
      });
    };
    const first = await postEvent(
      completedEvent("evt_p1c_first", printCheckoutSessionFixture(sessionId)),
    );
    assert.equal(first.status, 200, `first delivery completes: ${JSON.stringify(first.body)}`);
    assert.equal(fulfillmentCalls().length, 1, "the first delivery dispatched once");
    const afterFirst = data.get(printOrderKey(sessionId));
    assert.equal(
      afterFirst?.alternateDispatch?.state,
      "attempted",
      "an ambiguous non-2xx leaves the marker attempted, not rejected",
    );
    assert.equal(afterFirst?.alternateDispatch?.httpStatus, 500);

    const second = await postEvent(
      completedEvent("evt_p1c_second", printCheckoutSessionFixture(sessionId)),
    );
    assert.equal(second.status, 200, `redelivery completes: ${JSON.stringify(second.body)}`);
    assert.equal(fulfillmentCalls().length, 1, "no second outbound dispatch on redelivery");
    assert.equal(receiverCreations, 1, "the receiver never creates a duplicate");
  } finally {
    restoreKv();
  }
});

/* ================= Gate fix round 2 — F9: a legacy "rejected" marker refuses like "attempted" ================= */

test("Gate round 2 (F9): a legacy 'rejected' marker refuses at BOTH dispatch sites — it encodes an ambiguous response, not a proven refusal", async () => {
  // Round 1 (P1-C) established the doctrine: NO non-2xx answer proves
  // the receiver rejected the dispatch, so no new "rejected" markers
  // are written. But records already carrying the legacy state kept a
  // "retryable reading" at both dispatch sites — and that state
  // encodes exactly an ambiguous response (the receiver may have
  // created the order before its 500). Round 2 closes the gap: a
  // "rejected" marker now refuses exactly like "attempted" — the
  // retry route answers 409 alternate_dispatch_reconciliation_required
  // and the webhook pass persists the reconciliation problem record —
  // with zero outbound dispatches at either site. An operator
  // reconciles; nothing redispatches blind.
  installFakeKv();
  installFetchDouble();
  try {
    const rejectedMarker = (sessionId) => ({
      dispatchId: `alt-fulfillment:${sessionId}`,
      state: "rejected",
      attemptedAt: Date.now() - 60_000,
      respondedAt: Date.now() - 59_000,
      httpStatus: 500,
    });

    // --- operator retry route ---
    const seeded = seedPrintOrder();
    data.set(printOrderKey(F9_SESSION), {
      ...seeded,
      alternateDispatch: rejectedMarker(F9_SESSION),
    });
    stubStripeForRetry();
    const retry = await printRetryRoute.POST(retryRequest());
    assert.equal(retry.status, 409, "the retry route refuses a legacy rejected marker");
    assert.equal(
      (await retry.json()).error,
      "alternate_dispatch_reconciliation_required",
    );
    assert.equal(fulfillmentCalls().length, 0, "the retry route never dispatches");
    assert.equal(
      data.get(printOrderKey(F9_SESSION))?.alternateDispatch?.state,
      "rejected",
      "the marker stands untouched for the operator",
    );

    // --- webhook pass ---
    const sessionId = "cs_wh_gate2_rejected";
    __resetPrintOrderAuthorityMemoryForTests();
    data.set(printOrderKey(sessionId), {
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
      printAssetId: WH_PRINT_ASSET_ID,
      attempts: 1,
      error: "webhook_failed",
      terminalEventType: null,
      createdAt: Date.now(),
      alternateDispatch: rejectedMarker(sessionId),
    });
    const delivered = await postEvent(
      completedEvent("evt_gate2_rejected", printCheckoutSessionFixture(sessionId)),
    );
    assert.equal(
      delivered.status,
      200,
      `the delivery finalises as a refusal: ${JSON.stringify(delivered.body)}`,
    );
    assert.equal(fulfillmentCalls().length, 0, "the webhook pass never dispatches either");
    const stored = data.get(printOrderKey(sessionId));
    assert.equal(
      stored?.error,
      "alternate_dispatch_reconciliation_required",
      "the pass persists the reconciliation problem record",
    );
    assert.equal(
      stored?.alternateDispatch?.state,
      "rejected",
      "the marker survives the pass for the operator",
    );
  } finally {
    restoreKv();
  }
});

/* ================= Gate fix round 3 — F9: a present marker with a missing/unrecognized state fails closed ================= */

test("Gate round 3 (F9): a present dispatch marker whose state is missing or unrecognized refuses at BOTH dispatch sites — only an absent marker may dispatch", async (t) => {
  // Gate confirmation P1 on round 2: alternateDispatchBlocksRedispatch
  // compared the marker's state string, so a PRESENT durable marker
  // whose state is absent or unrecognized returned false at both
  // dispatch guards and fell through to redispatch. The TypeScript
  // type requires `state`, but persisted KV data is not validated at
  // runtime — a legacy, partial, or hand-written record can carry a
  // marker with no usable state, and that marker is exactly as
  // ambiguous as "attempted"/"rejected" (an outbound dispatch may
  // already have happened). Round 3 fails closed: ANY present marker
  // blocks redispatch, in every state — attempted, rejected,
  // accepted, missing, or unrecognized — and outbound dispatch is
  // permitted only when NO marker exists (the first-dispatch case).
  installFakeKv();
  installFetchDouble();
  try {
    const malformedMarkers = [
      [
        "missing state",
        (sessionId) => ({
          dispatchId: `alt-fulfillment:${sessionId}`,
          attemptedAt: Date.now() - 60_000,
        }),
      ],
      [
        "unrecognized state",
        (sessionId) => ({
          dispatchId: `alt-fulfillment:${sessionId}`,
          state: "dispatched_maybe",
          attemptedAt: Date.now() - 60_000,
          httpStatus: 500,
        }),
      ],
    ];
    for (const [label, markerFor] of malformedMarkers) {
      await t.test(`${label}: operator retry route refuses`, async () => {
        const callsBefore = fulfillmentCalls().length;
        const seeded = seedPrintOrder();
        data.set(printOrderKey(F9_SESSION), {
          ...seeded,
          alternateDispatch: markerFor(F9_SESSION),
        });
        stubStripeForRetry();
        const retry = await printRetryRoute.POST(retryRequest());
        assert.equal(
          retry.status,
          409,
          "the retry route refuses a present marker with no usable state",
        );
        assert.equal(
          (await retry.json()).error,
          "alternate_dispatch_reconciliation_required",
        );
        assert.equal(
          fulfillmentCalls().length,
          callsBefore,
          "the retry route never dispatches",
        );
        assert.equal(
          data.get(printOrderKey(F9_SESSION))?.alternateDispatch?.dispatchId,
          `alt-fulfillment:${F9_SESSION}`,
          "the marker stands untouched for the operator",
        );
      });

      await t.test(`${label}: webhook pass refuses`, async () => {
        const callsBefore = fulfillmentCalls().length;
        const sessionId =
          label === "missing state" ? "cs_wh_gate3_nostate" : "cs_wh_gate3_badstate";
        __resetPrintOrderAuthorityMemoryForTests();
        data.set(printOrderKey(sessionId), {
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
          printAssetId: WH_PRINT_ASSET_ID,
          attempts: 1,
          error: "webhook_failed",
          terminalEventType: null,
          createdAt: Date.now(),
          alternateDispatch: markerFor(sessionId),
        });
        const delivered = await postEvent(
          completedEvent(
            label === "missing state" ? "evt_gate3_nostate" : "evt_gate3_badstate",
            printCheckoutSessionFixture(sessionId),
          ),
        );
        assert.equal(
          delivered.status,
          200,
          `the delivery finalises as a refusal: ${JSON.stringify(delivered.body)}`,
        );
        assert.equal(
          fulfillmentCalls().length,
          callsBefore,
          "the webhook pass never dispatches either",
        );
        const stored = data.get(printOrderKey(sessionId));
        assert.equal(
          stored?.error,
          "alternate_dispatch_reconciliation_required",
          "the pass persists the reconciliation problem record",
        );
        assert.equal(
          stored?.alternateDispatch?.dispatchId,
          `alt-fulfillment:${sessionId}`,
          "the marker survives the pass for the operator",
        );
      });
    }
  } finally {
    restoreKv();
  }
});

/* ================= 2026-11-02 lane — merch fall-through + feed/count read hardening =================
 * Item 1: a PAID merch order in the alternate-webhook-only
 * configuration (Printful V2 unconfigured — this harness sets no
 * PRINTFUL_API_TOKEN / PRINTFUL_STORE_ID — with
 * PRINT_FULFILLMENT_WEBHOOK_URL set) stranded at "pending": the
 * merch branch of queuePrintOrder returned unconditionally, no
 * error, no alert, no automatic dispatch path. Fixed-variant merch
 * families resolve at checkout with no Printful credentials, and
 * merch sellability is gated by catalog flags, not V2 config, so
 * the configuration sells real orders.
 * Item 2: appendReferralEvent's read had the BOT-P2 shape (plain
 * kv.get degrades to null; the write-back erased the stored feed),
 * and the cap count decided on plain reads. Both are now
 * error-preserving; the append skips its write on an unreadable
 * history (never throws into the non-retryable link/visit routes),
 * and the count fails closed (the grant flow defers). */

function merchCheckoutSessionFixture(sessionId, overrides = {}) {
  return printCheckoutSessionFixture(sessionId, {
    metadata: {
      order_type: "print",
      print_variant: "poster_framed",
      print_asset_id: WH_PRINT_ASSET_ID,
      // sticker_kisscut 3x3 — a fixed-variant family: checkout
      // resolves it from the curated map with no Printful token.
      print_merch_family: "sticker_kisscut",
      print_merch_catalog_variant_id: "10163",
      print_merch_size: "3×3",
      qa_run: "true",
    },
    ...overrides,
  });
}

test("Merch fall-through: a paid merch order in the alternate-only configuration dispatches once, under the marker discipline", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const sessionId = "cs_wh_merch_fallthrough";
    __resetPrintOrderAuthorityMemoryForTests();
    const first = await postEvent(
      completedEvent("evt_merch_ft_first", merchCheckoutSessionFixture(sessionId)),
    );
    assert.equal(first.status, 200, `delivery finalises: ${JSON.stringify(first.body)}`);
    assert.equal(
      fulfillmentCalls().length,
      1,
      "the paid merch order is dispatched to the alternate webhook exactly once",
    );
    const call = fulfillmentCalls()[0];
    const payload = JSON.parse(call.body);
    assert.equal(payload.merchCatalogVariantId, 10163, "the dispatch payload carries the merch catalog variant");
    assert.equal(payload.dispatchId, `alt-fulfillment:${sessionId}`);
    const headers = new Headers(call.headers);
    assert.equal(headers.get("idempotency-key"), `alt-fulfillment:${sessionId}`);
    const sent = data.get(printOrderKey(sessionId));
    assert.equal(sent.status, "sent");
    assert.equal(sent.alternateDispatch?.state, "accepted");
    assert.equal(sent.merchCatalogVariantId, 10163);

    // Redelivery: the visible sent record stops any second dispatch.
    const second = await postEvent(
      completedEvent("evt_merch_ft_second", merchCheckoutSessionFixture(sessionId)),
    );
    assert.equal(second.status, 200);
    assert.equal(fulfillmentCalls().length, 1, "redelivery dispatches nothing further");
  } finally {
    restoreKv();
  }
});

test("Merch fall-through: a standing attempted marker refuses the webhook pass instead of dispatching", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const sessionId = "cs_wh_merch_marker";
    __resetPrintOrderAuthorityMemoryForTests();
    data.set(printOrderKey(sessionId), {
      status: "failed",
      sessionId,
      printVariant: "poster_framed",
      merchCatalogVariantId: 10163,
      includesDigitalAddOn: false,
      amountTotal: 9900,
      currency: "usd",
      customerEmail: "buyer@example.com",
      customerName: "Buyer One",
      shippingDetails: {
        name: "Buyer One",
        address: { line1: "1 Main St", city: "Victoria", state: "BC", country: "US", postal_code: "90210" },
      },
      printAssetId: WH_PRINT_ASSET_ID,
      attempts: 1,
      error: "webhook_failed",
      terminalEventType: null,
      createdAt: Date.now(),
      alternateDispatch: {
        dispatchId: `alt-fulfillment:${sessionId}`,
        state: "attempted",
        attemptedAt: Date.now() - 60_000,
      },
    });
    const res = await postEvent(
      completedEvent("evt_merch_marker", merchCheckoutSessionFixture(sessionId)),
    );
    assert.equal(res.status, 200, `the delivery finalises as a refusal: ${JSON.stringify(res.body)}`);
    assert.equal(fulfillmentCalls().length, 0, "no outbound dispatch while the marker is unresolved");
    const stored = data.get(printOrderKey(sessionId));
    assert.equal(stored?.error, "alternate_dispatch_reconciliation_required");
    assert.equal(stored?.alternateDispatch?.state, "attempted", "the marker survives for the operator");
  } finally {
    restoreKv();
  }
});

test("Feed append hardening: an unreadable feed history is preserved — the append skips instead of overwriting", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const feedKey = `referral:events:${REFERRAL_CODE}`;
    const seeded = [
      {
        id: "reward_granted:cs_legacy_buyer",
        code: REFERRAL_CODE,
        type: "reward_granted",
        createdAt: Date.now() - 60_000,
        details: { checkoutSessionId: "cs_legacy_buyer", rewardGranted: 1 },
      },
      {
        id: "conversion_reversed:cs_legacy_buyer",
        code: REFERRAL_CODE,
        type: "conversion_reversed",
        createdAt: Date.now() - 30_000,
        details: { checkoutSessionId: "cs_legacy_buyer" },
      },
    ];
    data.set(feedKey, seeded);

    // Transient Cloudflare read failure: the plain read degrades to
    // null (kv.get's failure mode) and the error-preserving read
    // throws (its failure mode). Pre-fix the append consumed the
    // degraded null as an empty history and wrote it back, erasing
    // both seeded entries.
    getHook = async (key, read) => (key === feedKey ? null : read());
    epGetHook = async (key, read) => {
      if (key === feedKey) throw new KvReadError("injected feed read failure");
      return read();
    };
    const skipped = await appendReferralEvent({
      code: REFERRAL_CODE,
      type: "visit_recorded",
      eventId: "visit_recorded:cs_probe",
      createdAt: Date.now(),
    });
    assert.equal(skipped, null, "the append reports itself unrecorded instead of writing truncated history");
    assert.deepEqual(
      data.get(feedKey),
      seeded,
      "the stored feed survives the failed append byte-identical",
    );
    getHook = null;
    epGetHook = null;

    // Once reads recover, appends resume on top of the preserved history.
    const appended = await appendReferralEvent({
      code: REFERRAL_CODE,
      type: "visit_recorded",
      eventId: "visit_recorded:cs_probe",
      createdAt: Date.now(),
    });
    assert.equal(appended?.id, "visit_recorded:cs_probe");
    assert.equal((data.get(feedKey) ?? []).length, 3, "the recovered append unions with the preserved history");
  } finally {
    restoreKv();
  }
});

test("Cap count hardening: an unreadable grants ledger fails the count closed instead of under-enforcing", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const grantsKey = `referral:reward-grants:${REFERRAL_CODE}`;
    const now = Date.now();
    for (const buyer of ["cs_old_buyer_1", "cs_old_buyer_2"]) {
      await appendReferralRewardGrant({
        code: REFERRAL_CODE,
        eventId: `reward_granted:${buyer}`,
        createdAt: now - 60_000,
        details: { checkoutSessionId: buyer, rewardGranted: 1 },
      });
    }
    assert.equal(
      await countRecentReferralRewardGrants(REFERRAL_CODE, 24 * 60 * 60 * 1000, now),
      2,
      "precondition: the count sees both seeded grants",
    );

    // Degraded ledger read: plain get would return null (count falls
    // back to the feed side = 0 and the cap silently under-enforces);
    // the error-preserving read throws, and the count must surface
    // that so the webhook grant flow defers instead of deciding.
    getHook = async (key, read) => (key === grantsKey ? null : read());
    epGetHook = async (key, read) => {
      if (key === grantsKey) throw new KvReadError("injected ledger read failure");
      return read();
    };
    await assert.rejects(
      () => countRecentReferralRewardGrants(REFERRAL_CODE, 24 * 60 * 60 * 1000, now),
      "the cap count fails closed on an unreadable ledger",
    );
    getHook = null;
    epGetHook = null;

    assert.equal(
      await countRecentReferralRewardGrants(REFERRAL_CODE, 24 * 60 * 60 * 1000, now),
      2,
      "the count recovers once reads do",
    );
  } finally {
    restoreKv();
  }
});

/* ================= S96-1 F2 — concurrent alternate dispatch: the atomic claim admits exactly one ================= */

function seedRacePrintOrder(sessionId) {
  // seedPrintOrder plus the checkout phone already considered (null), so
  // the retry route's hydration is a no-op and cannot rewrite the record
  // mid-race — the race under test is the dispatch claim, nothing else.
  const record = seedPrintOrder(sessionId);
  const withPhone = { ...record, customerPhone: null };
  data.set(printOrderKey(sessionId), withPhone);
  return withPhone;
}

test("S96-1 F2: a webhook delivery parked mid-read cannot dispatch after a concurrent retry claimed the order", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const sessionId = "cs_test_s961_race_a";
    seedRacePrintOrder(sessionId);
    stubStripeForRetry(sessionId);

    // Park the webhook delivery inside queuePrintOrder's read of the
    // order record: it resumes holding the pre-race snapshot (status
    // failed, NO dispatch marker) — the exact interleave in which the
    // pre-fix check-then-write marker let both sides dispatch.
    const park = armReadPark(printOrderKey(sessionId));
    const deliveryPromise = postEvent(
      completedEvent("evt_s961_race_a", printCheckoutSessionFixture(sessionId)),
    );
    await park.enteredPromise;

    // The concurrent admin retry runs to completion: it wins the
    // atomic claim and dispatches — once.
    const retryRes = await printRetryRoute.POST(retryRequest(sessionId));
    assert.equal(retryRes.status, 200, "the retry winner completes");
    assert.equal(fulfillmentCalls().length, 1, "the winner dispatched exactly once");
    assert.equal(data.get(printOrderKey(sessionId))?.status, "sent");

    park.release();
    const delivery = await deliveryPromise;
    assert.equal(
      delivery.status,
      200,
      `the losing delivery finalises without a Stripe retry: ${JSON.stringify(delivery.body)}`,
    );
    assert.equal(
      fulfillmentCalls().length,
      1,
      "the parked delivery never dispatches — the authority claim, not the KV marker, excluded it",
    );

    // The loser's problem write is the honest end state for this
    // interleave (the whole-record projection posture predates this
    // fix): the order is flagged for operator reconciliation, and the
    // standing claim keeps every later pass out as well.
    const after = data.get(printOrderKey(sessionId));
    assert.equal(after.error, "alternate_dispatch_reconciliation_required");

    const redelivery = await postEvent(
      completedEvent("evt_s961_race_a2", printCheckoutSessionFixture(sessionId)),
    );
    assert.equal(redelivery.status, 200);
    assert.equal(fulfillmentCalls().length, 1, "no later delivery dispatches either");
  } finally {
    restoreKv();
  }
});

test("S96-1 F2: a retry parked mid-read loses cleanly to a concurrent webhook delivery", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const sessionId = "cs_test_s961_race_b";
    seedRacePrintOrder(sessionId);
    stubStripeForRetry(sessionId);

    // Park the admin retry inside its read of the order record; the
    // webhook delivery then runs to completion (claim + dispatch).
    const park = armReadPark(printOrderKey(sessionId));
    const retryPromise = printRetryRoute.POST(retryRequest(sessionId));
    await park.enteredPromise;

    const delivery = await postEvent(
      completedEvent("evt_s961_race_b", printCheckoutSessionFixture(sessionId)),
    );
    assert.equal(delivery.status, 200, `the webhook winner completes: ${JSON.stringify(delivery.body)}`);
    assert.equal(fulfillmentCalls().length, 1, "the winner dispatched exactly once");

    park.release();
    const retryRes = await retryPromise;
    assert.equal(retryRes.status, 409, "the losing retry is refused, not dispatched");
    assert.equal(
      (await retryRes.json()).error,
      "alternate_dispatch_reconciliation_required",
    );
    assert.equal(fulfillmentCalls().length, 1, "exactly one outbound dispatch across both racers");

    // The loser wrote nothing: the winner's record stands untouched.
    const after = data.get(printOrderKey(sessionId));
    assert.equal(after.status, "sent");
    assert.equal(after.alternateDispatch?.state, "accepted");
  } finally {
    restoreKv();
  }
});

/* ================= S96-1 F1 — Printful order_put_hold is recorded and alerted ================= */

const PRINTFUL_TEST_SECRET = "unit-test-printful-secret";

function postPrintfulEvent(payload) {
  return printfulWebhookRoute.POST(
    new NextRequest(`https://starmapco.test/api/printful/webhook?token=${PRINTFUL_TEST_SECRET}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

const resendCalls = () => fetchLog.filter((entry) => entry.url.startsWith("https://api.resend.com/"));

function seedSentPrintOrder(sessionId) {
  __resetPrintOrderAuthorityMemoryForTests();
  const record = {
    status: "sent",
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
    printfulOrderId: 9001,
    attempts: 1,
    sentAt: Date.now(),
    createdAt: Date.now(),
  };
  data.set(printOrderKey(sessionId), record);
  return record;
}

test("S96-1 F1: order_put_hold is recorded + alerted once, and a terminal failure supersedes and clears it", async () => {
  installFakeKv();
  installFetchDouble();
  process.env.PRINTFUL_WEBHOOK_SECRET = PRINTFUL_TEST_SECRET;
  process.env.PRINT_ORDER_ALERT_FROM = "StarMapCo <ops@example.com>";
  try {
    const sessionId = "cs_test_s961_hold";
    seedSentPrintOrder(sessionId);
    const holdPayload = {
      type: "order_put_hold",
      data: {
        reason: "address_issue",
        order: { id: 9001, external_id: sessionId, status: "onhold" },
      },
    };

    const first = await postPrintfulEvent(holdPayload);
    assert.equal(first.status, 200, `the hold is acknowledged as handled: ${first.status}`);
    assert.equal((await first.json()).status, "updated");
    const held = data.get(printOrderKey(sessionId));
    assert.equal(typeof held.providerHoldAt, "number", "the hold is visible state on the record");
    assert.equal(held.providerHoldReason, "address_issue");
    assert.equal(held.providerHoldOrderStatus, "onhold");
    assert.equal(held.status, "sent", "a hold is not a failure — the order stays sent");
    assert.equal(typeof held.operatorHoldAlertedAt, "number", "the operator was alerted");
    assert.equal(resendCalls().length, 1, "exactly one hold alert was sent");
    const alertBody = JSON.parse(resendCalls()[0].body);
    assert.match(alertBody.subject, /on hold at Printful/);

    // Redelivery: the first hold timestamp stands and no second alert goes out.
    const second = await postPrintfulEvent(holdPayload);
    assert.equal(second.status, 200);
    const heldAgain = data.get(printOrderKey(sessionId));
    assert.equal(heldAgain.providerHoldAt, held.providerHoldAt, "first hold wins");
    assert.equal(resendCalls().length, 1, "no duplicate hold alert on redelivery");

    // A terminal failure supersedes the hold and clears it from the record.
    const failure = await postPrintfulEvent({
      type: "order_failed",
      data: {
        reason: "file_failed",
        order: { id: 9001, external_id: sessionId, status: "failed" },
      },
    });
    assert.equal(failure.status, 200);
    const failed = data.get(printOrderKey(sessionId));
    assert.equal(failed.status, "failed");
    assert.equal(failed.providerHoldAt, undefined, "the terminal projection clears the hold");

    // A late hold after the terminal event is acknowledged but ignored.
    const late = await postPrintfulEvent(holdPayload);
    assert.equal(late.status, 200);
    const lateBody = await late.json();
    assert.equal(lateBody.status, "ignored");
    assert.equal(lateBody.reason, "superseded_by_terminal_failure");
    assert.equal(data.get(printOrderKey(sessionId)).providerHoldAt, undefined);
  } finally {
    delete process.env.PRINTFUL_WEBHOOK_SECRET;
    delete process.env.PRINT_ORDER_ALERT_FROM;
    restoreKv();
  }
});

test("S96-1 F1: a hold whose session cannot be resolved stays retryable (503), never ACKed away", async () => {
  installFakeKv();
  installFetchDouble();
  process.env.PRINTFUL_WEBHOOK_SECRET = PRINTFUL_TEST_SECRET;
  try {
    const res = await postPrintfulEvent({
      type: "order_put_hold",
      data: {
        reason: "address_issue",
        order: { id: 424242, external_id: "not-a-checkout-session", status: "onhold" },
      },
    });
    assert.equal(res.status, 503, "Printful must retry until the session resolves");
    assert.equal((await res.json()).status, "session_unresolved");
  } finally {
    delete process.env.PRINTFUL_WEBHOOK_SECRET;
    restoreKv();
  }
});
