// S93-1 money-path writer fixes — behavioural coverage per item.
//
// Design: seo-backlinks/codex-slate-queue-runs/slate-93/S93-1.md
// Evidence: slate-92/S92-1.md (verify-route item 1 is PR #465's — the
// verify route is not touched here).
//
// Harness notes:
// - The webhook route is driven through signed POSTs (Stripe webhook
//   signature = HMAC-SHA256 over "<t>.<payload>", verified locally by
//   the SDK's constructEvent). No prior repo test drove this route.
// - Session fixtures carry metadata.qa_run = "true" (analytics sink
//   skipped) and no customer email (account-lite upsert + post-purchase
//   access email are env-gated off in this harness).
// - The Durable-Object authority client falls back to its in-memory
//   implementation without a binding, so the routing-enabled tier runs
//   the real grant machine against the fake KV.
// - R2 is not injectable in this harness (bucket resolves only from
//   the Cloudflare context), so the archive-ready DISPATCH leg is
//   covered by structural pins + the reachable skip/read-failure paths;
//   the initial-email path (W2) is fully behavioural.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { register } from "node:module";

register(new URL("./moneyPathS931.hooks.mjs", import.meta.url));
register(new URL("./entitlementAuthority.hooks.mjs", import.meta.url));
register(new URL("./gaConsentMode.hooks.mjs", import.meta.url));
register(new URL("./dl1S4NextServer.hooks.mjs", import.meta.url));
register("./tsAliasLoader.mjs", import.meta.url);

process.env.STARMAP_KV_ALLOW_LOCAL = "1";
process.env.STRIPE_SECRET_KEY ??= "sk_test_placeholder_not_a_real_key";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_unit_test_placeholder";
process.env.ACCOUNT_RECOVERY_EMAIL_FROM ??= "StarMapCo <access@example.com>";
process.env.RESEND_API_KEY ??= "re_unit_test_placeholder";
delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
delete process.env.GA4_API_SECRET;
delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
delete process.env.POSTHOG_API_KEY;
delete process.env.DL1_AUTHORITY_ROUTING_ENABLED;

const { kv, KvDurableWriteError, KvReadError } = await import("../../src/lib/kv.ts");
const { ENTITLEMENT_KV, SETTLEMENT_SCHEMA_VERSION } = await import(
  "../../src/lib/entitlementsStore.ts"
);
const { referralKey, referralRewardedKey } = await import("../../src/lib/referrals.ts");
const { trySendInitialHdPurchaseEmail, trySendHdArchiveReadyEmail } = await import(
  "../../src/lib/hdDownloadEmailDispatch.ts"
);
const webhookRoute = await import("../../src/app/api/stripe/webhook/route.ts");

/* ---------------- fake KV ---------------- */

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
    // Match the real kv failure surface: durable writes surface as
    // KvDurableWriteError (the class the routes treat as retryable).
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

const sessionKey = (id) => ENTITLEMENT_KV.stripeSession(id);
const sessionPuts = (id) =>
  putLog.filter((entry) => entry.key === sessionKey(id) && (entry.op === "set" || entry.op === "setDurable"));
const eventMarkerKey = (eventId) => ENTITLEMENT_KV.stripeWebhookEvent(eventId);
const piRevokedKey = (piId) => `stripe:pi:revoked:${piId}`;
const referralEventsFor = (sessionId, type) =>
  (data.get(`referral:events:${REFERRAL_CODE}`) ?? []).filter(
    (event) => event.type === type && event.details?.checkoutSessionId === sessionId,
  );

/* ---------------- fetch double (Resend + Stripe API) ---------------- */

let fetchLog;
let resendResponder;

function installFetchDouble() {
  fetchLog = [];
  resendResponder = async () =>
    new Response(JSON.stringify({ id: "msg_unit" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input.url;
    fetchLog.push(url);
    if (url.startsWith("https://api.resend.com/")) return resendResponder();
    throw new Error(`moneyPathS931 harness: unexpected fetch ${url}`);
  };
}

/* ---------------- fixtures ---------------- */

const SITE_ORIGIN = "https://starmapco.test";
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

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
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

/* ================= Item 2 — HD email bookkeeping (W2–W4) ================= */

test("item 2: initial HD email writes only its result record; a concurrent session write survives byte-for-byte", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const sessionId = "cs_hd_w2";
    const callerSnapshot = seedPaidSession(sessionId, {
      customerId: "cus_hd",
      customerEmail: "buyer@example.com",
      paymentIntentId: "pi_hd_w2",
    });
    const concurrent = { ...callerSnapshot, creditsRemaining: 1, lastWriter: "concurrent" };
    // The concurrent writer lands while the provider dispatch is in
    // flight (after the caller's read, before bookkeeping).
    resendResponder = async () => {
      data.set(sessionKey(sessionId), structuredClone(concurrent));
      return new Response(JSON.stringify({ id: "msg_w2" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const result = await trySendInitialHdPurchaseEmail({
      siteOrigin: SITE_ORIGIN,
      email: "buyer@example.com",
      sessionId,
      record: callerSnapshot,
    });

    assert.equal(result.delivered, true);
    assert.equal(result.includedArchiveLink, false);
    // Session record is the concurrent writer's, exactly — bookkeeping
    // performed no session write at all.
    assert.deepEqual(data.get(sessionKey(sessionId)), concurrent);
    assert.equal(sessionPuts(sessionId).length, 0);
    // The outcome lives only in the allowlisted result record.
    const outcome = data.get(ENTITLEMENT_KV.hdInitialEmailResult(sessionId));
    assert.ok(outcome, "initial email result record written");
    assert.deepEqual(Object.keys(outcome).sort(), [
      "deliveredAt",
      "error",
      "includedArchive",
      "provider",
      "recordedAt",
      "schemaVersion",
      "sessionId",
      "variant",
    ]);
    assert.equal(outcome.error, undefined);
    assert.equal(outcome.variant, "initial");
    assert.equal(outcome.provider, "resend");
    assert.equal(outcome.includedArchive, false);
    assert.equal(outcome.schemaVersion, SETTLEMENT_SCHEMA_VERSION);
    assert.ok(Number.isFinite(outcome.deliveredAt));
  } finally {
    restoreKv();
  }
});

test("item 2: initial HD result-record write failure propagates after a successful dispatch (no session write)", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const sessionId = "cs_hd_w2_fail";
    const record = seedPaidSession(sessionId, {
      customerId: "cus_hd",
      customerEmail: "buyer@example.com",
      paymentIntentId: "pi_hd_w2_fail",
    });
    failRules.push({
      op: "setDurable",
      match: (key) => key === ENTITLEMENT_KV.hdInitialEmailResult(sessionId),
      times: 1,
    });
    await assert.rejects(
      () =>
        trySendInitialHdPurchaseEmail({
          siteOrigin: SITE_ORIGIN,
          email: "buyer@example.com",
          sessionId,
          record,
        }),
      /injected setDurable failure/,
    );
    assert.equal(fetchLog.filter((url) => url.includes("api.resend.com")).length, 1);
    assert.equal(sessionPuts(sessionId).length, 0);
    assert.deepEqual(data.get(sessionKey(sessionId)), record);
  } finally {
    restoreKv();
  }
});

test("item 2: archive-ready is skipped when a prior sidecar result already carried the archive (legacy flag absent)", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const sessionId = "cs_hd_w3";
    const record = seedPaidSession(sessionId, {
      customerId: "cus_hd",
      customerEmail: "buyer@example.com",
      paymentIntentId: "pi_hd_w3",
    });
    assert.equal(record.accessEmailHadArchive, undefined);
    data.set(ENTITLEMENT_KV.hdInitialEmailResult(sessionId), {
      schemaVersion: SETTLEMENT_SCHEMA_VERSION,
      sessionId,
      variant: "initial",
      provider: "resend",
      deliveredAt: 1767225700000,
      includedArchive: true,
      recordedAt: 1767225700000,
    });
    const result = await trySendHdArchiveReadyEmail({
      siteOrigin: SITE_ORIGIN,
      record,
      sessionId,
    });
    assert.equal(result.delivered, false);
    assert.equal(result.reason, "archive_already_emailed");
    assert.equal(fetchLog.length, 0);
    assert.equal(sessionPuts(sessionId).length, 0);
  } finally {
    restoreKv();
  }
});

test("item 2: archive-ready still honours the legacy accessEmailHadArchive flag (behaviour preservation)", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const sessionId = "cs_hd_w3_legacy";
    const record = seedPaidSession(sessionId, {
      customerId: "cus_hd",
      customerEmail: "buyer@example.com",
      paymentIntentId: "pi_hd_w3_legacy",
      accessEmailHadArchive: true,
    });
    const result = await trySendHdArchiveReadyEmail({
      siteOrigin: SITE_ORIGIN,
      record,
      sessionId,
    });
    assert.equal(result.delivered, false);
    assert.equal(result.reason, "archive_already_emailed");
    assert.equal(fetchLog.length, 0);
  } finally {
    restoreKv();
  }
});

test("item 2: an unreadable email result record stops archive dispatch (fail closed, no session write)", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const sessionId = "cs_hd_w4";
    const record = seedPaidSession(sessionId, {
      customerId: "cus_hd",
      customerEmail: "buyer@example.com",
      paymentIntentId: "pi_hd_w4",
    });
    epGetHook = (key, read) => {
      if (
        key === ENTITLEMENT_KV.hdArchiveEmailResult(sessionId) ||
        key === ENTITLEMENT_KV.hdInitialEmailResult(sessionId)
      ) {
        throw new Error("injected result read failure");
      }
      return read();
    };
    await assert.rejects(
      () => trySendHdArchiveReadyEmail({ siteOrigin: SITE_ORIGIN, record, sessionId }),
      /injected result read failure/,
    );
    assert.equal(fetchLog.length, 0);
    assert.equal(sessionPuts(sessionId).length, 0);
  } finally {
    restoreKv();
  }
});

/* ============ Items 3/4/5 — referral seam (routing disabled) ============ */

test("item 3+4: routing-disabled eligible reward defers — pending state, no grant, no aggregates, no dedupe marker, retried on redelivery", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const referrer = seedPaidSession(REFERRER_ID);
    seedReferralRecord();
    const session = checkoutSessionFixture({
      metadata: { plan: "pack3", credits: "3", qa_run: "true", ...referralMetadata() },
    });

    const first = await postEvent(completedEvent("evt_defer_1", session));
    assert.equal(first.status, 503, "deferred legacy grant is Stripe-retryable");
    const state = data.get(referralRewardedKey(session.id));
    assert.equal(state.phase, "pending");
    assert.equal(state.rewarded, undefined, "eligibility is not consumed pre-grant");
    assert.equal(state.rewardGranted, undefined);
    // Referrer session never written; aggregates untouched; no marker.
    assert.deepEqual(data.get(sessionKey(REFERRER_ID)), referrer);
    assert.equal(sessionPuts(REFERRER_ID).length, 0);
    assert.equal(data.get(referralKey(REFERRAL_CODE)).conversions, 0);
    assert.equal(data.has(eventMarkerKey("evt_defer_1")), false);

    // Redelivery re-enters and defers again (not consumed, not wedged).
    const second = await postEvent(completedEvent("evt_defer_1", session));
    assert.equal(second.status, 503);
    assert.equal(data.get(referralRewardedKey(session.id)).phase, "pending");
    assert.deepEqual(data.get(sessionKey(REFERRER_ID)), referrer);
  } finally {
    restoreKv();
  }
});

test("item 4: poisoned legacy state (rewarded:true, no outcome fields) is surfaced for reconciliation, never granted or consumed", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const referrer = seedPaidSession(REFERRER_ID);
    seedReferralRecord();
    const session = checkoutSessionFixture({
      metadata: { plan: "pack3", credits: "3", qa_run: "true", ...referralMetadata() },
    });
    data.set(referralRewardedKey(session.id), {
      referralCode: REFERRAL_CODE,
      referrerSessionId: REFERRER_ID,
      rewarded: true,
      createdAt: 42,
    });
    const res = await postEvent(completedEvent("evt_legacy_ambiguous", session));
    assert.equal(res.status, 503);
    const state = data.get(referralRewardedKey(session.id));
    assert.equal(state.reconciliationRequired, true);
    assert.equal(state.createdAt, 42, "original state fields preserved");
    assert.deepEqual(data.get(sessionKey(REFERRER_ID)), referrer);
    assert.equal(data.get(referralKey(REFERRAL_CODE)).conversions, 0);
  } finally {
    restoreKv();
  }
});

test("item 4: finished legacy decision (rewarded:true + conversionRecorded:true) stands without reprocessing", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const referrer = seedPaidSession(REFERRER_ID);
    seedReferralRecord();
    const session = checkoutSessionFixture({
      metadata: { plan: "pack3", credits: "3", qa_run: "true", ...referralMetadata() },
    });
    data.set(referralRewardedKey(session.id), {
      referralCode: REFERRAL_CODE,
      referrerSessionId: REFERRER_ID,
      rewarded: true,
      rewardGranted: 1,
      conversionRecorded: true,
      createdAt: 42,
    });
    const res = await postEvent(completedEvent("evt_legacy_done", session));
    assert.equal(res.status, 200);
    assert.equal(data.get(referralKey(REFERRAL_CODE)).conversions, 0, "no double aggregate");
    assert.deepEqual(data.get(sessionKey(REFERRER_ID)), referrer);
  } finally {
    restoreKv();
  }
});

test("item 5: refund tombstone landed before fulfillment suppresses the referral reward end-to-end", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    seedPaidSession(REFERRER_ID);
    seedReferralRecord();
    const session = checkoutSessionFixture({
      metadata: { plan: "pack3", credits: "3", qa_run: "true", ...referralMetadata() },
    });
    // Refund processed with no session mapping yet: tombstone only.
    const refund = await postEvent({
      id: "evt_refund_first",
      object: "event",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_refund_first",
          object: "charge",
          amount_refunded: 2900,
          refunded: true,
          payment_intent: session.payment_intent,
          customer: "cus_buyer",
        },
      },
    });
    assert.equal(refund.status, 200);
    assert.ok(data.has(piRevokedKey(session.payment_intent)));

    const res = await postEvent(completedEvent("evt_refunded_fulfillment", session));
    assert.equal(res.status, 200);
    // Fulfillment itself is revoked and the reward never starts.
    assert.equal(data.get(sessionKey(session.id)).revoked, true);
    assert.equal(data.has(referralRewardedKey(session.id)), false);
    assert.equal(data.get(sessionKey(REFERRER_ID)).creditsRemaining, 3);
    assert.equal(data.get(referralKey(REFERRAL_CODE)).conversions, 0);
  } finally {
    restoreKv();
  }
});

test("item 5: revocation evidence arriving mid-flight (after settlement, before grant decision) yields a terminal purchaser_revoked skip, never a grant", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const referrer = seedPaidSession(REFERRER_ID);
    seedReferralRecord();
    const session = checkoutSessionFixture({
      metadata: { plan: "pack3", credits: "3", qa_run: "true", ...referralMetadata() },
    });
    // Interleave: the refund tombstone lands when the referral flow
    // first reads the conversion record — after markSessionPaid has
    // already settled the purchase in this same pass.
    let injected = false;
    getHook = (key, read) => {
      if (!injected && key === referralKey(REFERRAL_CODE)) {
        injected = true;
        data.set(piRevokedKey(session.payment_intent), {
          schemaVersion: SETTLEMENT_SCHEMA_VERSION,
          paymentIntentId: session.payment_intent,
          revoked: true,
          reason: "refund",
          revokedAt: Date.now(),
        });
      }
      return read();
    };
    const res = await postEvent(completedEvent("evt_midflight_revoke", session));
    assert.equal(res.status, 200, "a validation skip is terminal, not retryable");
    const state = data.get(referralRewardedKey(session.id));
    assert.equal(state.phase, "terminal_skip");
    assert.equal(state.rewardSkipReason, "purchaser_revoked");
    assert.equal(state.rewardGranted, 0);
    assert.equal(state.conversionRecorded, false);
    assert.deepEqual(data.get(sessionKey(REFERRER_ID)), referrer);
    assert.equal(data.get(referralKey(REFERRAL_CODE)).conversions, 0);
  } finally {
    restoreKv();
  }
});

test("item 5: revocation evidence inserted at the pre-grant recheck is caught (no grant)", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const referrer = seedPaidSession(REFERRER_ID);
    seedReferralRecord();
    const session = checkoutSessionFixture({
      metadata: { plan: "pack3", credits: "3", qa_run: "true", ...referralMetadata() },
    });
    // Entry check passes (first strict tombstone read: absent); the
    // tombstone lands before the pre-grant recheck's strict read.
    let tombstoneReads = 0;
    epGetHook = (key, read) => {
      if (key === piRevokedKey(session.payment_intent)) {
        tombstoneReads += 1;
        if (tombstoneReads === 2) {
          data.set(piRevokedKey(session.payment_intent), {
            schemaVersion: SETTLEMENT_SCHEMA_VERSION,
            paymentIntentId: session.payment_intent,
            revoked: true,
            reason: "refund",
            revokedAt: Date.now(),
          });
        }
      }
      return read();
    };
    const res = await postEvent(completedEvent("evt_recheck_revoke", session));
    assert.equal(res.status, 200);
    const state = data.get(referralRewardedKey(session.id));
    assert.equal(state.phase, "terminal_skip");
    assert.equal(state.rewardSkipReason, "purchaser_revoked");
    assert.deepEqual(data.get(sessionKey(REFERRER_ID)), referrer);
  } finally {
    restoreKv();
  }
});

test("item 5: unreadable purchaser revocation evidence is retryable — no grant, no terminal state, no pending write", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const referrer = seedPaidSession(REFERRER_ID);
    seedReferralRecord();
    const session = checkoutSessionFixture({
      metadata: { plan: "pack3", credits: "3", qa_run: "true", ...referralMetadata() },
    });
    epGetHook = (key, read) => {
      if (key === ENTITLEMENT_KV.sessionRevoked(session.id)) {
        throw new Error("injected evidence read failure");
      }
      return read();
    };
    const res = await postEvent(completedEvent("evt_evidence_unreadable", session));
    assert.equal(res.status, 503);
    assert.equal(data.has(referralRewardedKey(session.id)), false);
    assert.deepEqual(data.get(sessionKey(REFERRER_ID)), referrer);
  } finally {
    restoreKv();
  }
});

test("item 3/5: strict referrer revocation evidence produces a referrer_inactive validation skip (no grant)", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const referrer = seedPaidSession(REFERRER_ID);
    seedReferralRecord();
    // Referrer was revoked via side evidence only (record not flagged).
    data.set(ENTITLEMENT_KV.sessionRevoked(REFERRER_ID), {
      schemaVersion: SETTLEMENT_SCHEMA_VERSION,
      sessionId: REFERRER_ID,
      revoked: true,
      reason: "refund",
      revokedAt: 1767225700000,
    });
    const session = checkoutSessionFixture({
      metadata: { plan: "pack3", credits: "3", qa_run: "true", ...referralMetadata() },
    });
    const res = await postEvent(completedEvent("evt_referrer_revoked", session));
    assert.equal(res.status, 200);
    const state = data.get(referralRewardedKey(session.id));
    assert.equal(state.phase, "terminal_skip");
    assert.equal(state.rewardSkipReason, "referrer_inactive");
    assert.equal(state.rewardGranted, 0);
    assert.deepEqual(data.get(sessionKey(REFERRER_ID)), referrer);
    assert.equal(data.get(referralKey(REFERRAL_CODE)).conversions, 0);
  } finally {
    restoreKv();
  }
});

test("item 4.10: reversal recognises an authority-confirmed grant (grant_confirmed, conversionRecorded false) and claws back", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    seedPaidSession(REFERRER_ID);
    seedReferralRecord();
    const buyerId = "cs_buyer_reversal";
    data.set(ENTITLEMENT_KV.stripePaymentIntent("pi_buyer_reversal"), buyerId);
    data.set(referralRewardedKey(buyerId), {
      referralCode: REFERRAL_CODE,
      referrerSessionId: REFERRER_ID,
      phase: "grant_confirmed",
      rewardGranted: 1,
      conversionRecorded: false,
      createdAt: 7,
    });
    const res = await postEvent({
      id: "evt_reversal_confirmed",
      object: "event",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_reversal_confirmed",
          object: "charge",
          amount_refunded: 2900,
          refunded: true,
          payment_intent: "pi_buyer_reversal",
          customer: "cus_buyer",
        },
      },
    });
    assert.equal(res.status, 200);
    const state = data.get(referralRewardedKey(buyerId));
    assert.equal(state.conversionReversed, true, "confirmed grant is reversible despite conversionRecorded false");
    // S94-1-F1 (supersedes the #471-era pin): with routing disabled
    // the reversal never debits the combined KV counter — a legacy
    // balance commingles purchased and reward value with no split,
    // so the reclaim is zero (see the S94-1 section below).
    assert.equal(state.rewardReclaimed, 0);
    assert.equal(data.get(sessionKey(REFERRER_ID)).creditsRemaining, 3, "S94-1: combined counter is never debited");
  } finally {
    restoreKv();
  }
});

test("item 4.10: reversal still no-ops for a merely pending conversion (no grant effect exists)", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    seedPaidSession(REFERRER_ID);
    seedReferralRecord();
    const buyerId = "cs_buyer_pending";
    data.set(ENTITLEMENT_KV.stripePaymentIntent("pi_buyer_pending"), buyerId);
    data.set(referralRewardedKey(buyerId), {
      referralCode: REFERRAL_CODE,
      referrerSessionId: REFERRER_ID,
      phase: "pending",
      createdAt: 7,
    });
    const res = await postEvent({
      id: "evt_reversal_pending",
      object: "event",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_reversal_pending",
          object: "charge",
          amount_refunded: 2900,
          refunded: true,
          payment_intent: "pi_buyer_pending",
          customer: "cus_buyer",
        },
      },
    });
    assert.equal(res.status, 200);
    const state = data.get(referralRewardedKey(buyerId));
    assert.equal(state.conversionReversed, undefined);
    assert.equal(data.get(sessionKey(REFERRER_ID)).creditsRemaining, 3);
  } finally {
    restoreKv();
  }
});

/* ======== Items 3/4 — referral seam (authority routing enabled) ======== */
// Harness boundary (stated, not assumed): no repo test mocks the
// Cloudflare context, so the route's authority client cannot reach a
// Durable Object here and a live grant invocation is not drivable at
// route level (the grant machine's own suites cover it). What IS
// drivable — and what S93-1 item 4 actually changes — is the
// grant_confirmed resume seam and the safe-deferral behaviour.

test("item 3: routing enabled but authority unavailable defers safely — pending state, no legacy fallback grant", async () => {
  installFakeKv();
  installFetchDouble();
  process.env.DL1_AUTHORITY_ROUTING_ENABLED = "1";
  try {
    const referrer = seedPaidSession(REFERRER_ID);
    seedReferralRecord();
    const session = checkoutSessionFixture({
      metadata: { plan: "pack3", credits: "3", qa_run: "true", ...referralMetadata() },
    });
    const res = await postEvent(completedEvent("evt_authority_unavailable", session));
    assert.equal(res.status, 503, "authority_unavailable is a transient skip");
    const state = data.get(referralRewardedKey(session.id));
    assert.equal(state.phase, "pending");
    assert.equal(state.rewarded, undefined);
    assert.deepEqual(data.get(sessionKey(REFERRER_ID)), referrer);
    assert.equal(data.get(referralKey(REFERRAL_CODE)).conversions, 0);
  } finally {
    restoreKv();
  }
});

test("item 4: a grant_confirmed state resumes at bookkeeping — the grant seam is not re-entered and aggregates apply exactly once", async () => {
  installFakeKv();
  installFetchDouble();
  process.env.DL1_AUTHORITY_ROUTING_ENABLED = "1";
  try {
    seedPaidSession(REFERRER_ID);
    seedReferralRecord();
    const session = checkoutSessionFixture({
      metadata: { plan: "pack3", credits: "3", qa_run: "true", ...referralMetadata() },
    });
    data.set(referralRewardedKey(session.id), {
      referralCode: REFERRAL_CODE,
      referrerSessionId: REFERRER_ID,
      phase: "grant_confirmed",
      rewardGranted: 1,
      conversionRecorded: false,
      createdAt: 9,
    });
    const res = await postEvent(completedEvent("evt_resume_confirmed", session));
    assert.equal(res.status, 200, `resume completes: ${JSON.stringify(res.body)}`);
    const state = data.get(referralRewardedKey(session.id));
    assert.equal(state.phase, "completed");
    assert.equal(state.rewardGranted, 1);
    assert.equal(state.conversionRecorded, true);
    assert.equal(state.aggregateApplied, true);
    assert.equal(state.createdAt, 9, "original state identity preserved");
    const referral = data.get(referralKey(REFERRAL_CODE));
    assert.equal(referral.conversions, 1);
    assert.equal(referral.rewardsGranted, 1);
  } finally {
    restoreKv();
  }
});

test("item 4: terminal-put failure after the bookkeeping effects replays bookkeeping only — no double aggregate, no duplicate events", async () => {
  installFakeKv();
  installFetchDouble();
  process.env.DL1_AUTHORITY_ROUTING_ENABLED = "1";
  try {
    seedPaidSession(REFERRER_ID);
    seedReferralRecord();
    const session = checkoutSessionFixture({
      metadata: { plan: "pack3", credits: "3", qa_run: "true", ...referralMetadata() },
    });
    data.set(referralRewardedKey(session.id), {
      referralCode: REFERRAL_CODE,
      referrerSessionId: REFERRER_ID,
      phase: "grant_confirmed",
      rewardGranted: 1,
      conversionRecorded: false,
      createdAt: 9,
    });
    failRules.push({
      op: "setDurable",
      match: (key) => key === referralRewardedKey(session.id),
      valueMatch: (value) => value?.phase === "completed",
      times: 1,
    });
    const first = await postEvent(completedEvent("evt_outcome_fail_1", session));
    assert.equal(first.status, 503, "terminal persistence failure is retryable");
    // Fix round (Codex P2): the effects land BEFORE the terminal
    // write, so the failed delivery leaves them recorded exactly
    // once — evidenced by the aggregate marker — with the record
    // still resumable rather than terminally marked.
    assert.equal(data.get(referralRewardedKey(session.id)).phase, "grant_confirmed");
    assert.equal(data.get(referralKey(REFERRAL_CODE)).conversions, 1, "aggregate delta landed before the terminal write");
    assert.deepEqual(data.get(referralKey(REFERRAL_CODE)).recentConversionSessionIds, [session.id]);
    assert.equal(referralEventsFor(session.id, "conversion_recorded").length, 1);
    assert.equal(referralEventsFor(session.id, "reward_granted").length, 1);

    const second = await postEvent(completedEvent("evt_outcome_fail_2", session));
    assert.equal(second.status, 200);
    const state = data.get(referralRewardedKey(session.id));
    assert.equal(state.phase, "completed");
    assert.equal(state.rewardGranted, 1);
    assert.equal(data.get(referralKey(REFERRAL_CODE)).conversions, 1, "aggregate applied exactly once");
    assert.equal(data.get(referralKey(REFERRAL_CODE)).rewardsGranted, 1);
    assert.equal(referralEventsFor(session.id, "conversion_recorded").length, 1, "no duplicate conversion_recorded event");
    assert.equal(referralEventsFor(session.id, "reward_granted").length, 1, "no duplicate reward_granted event (cap count stays exact)");
  } finally {
    restoreKv();
  }
});

test("item 4 (fix round): aggregate-write failure during a grant_confirmed resume stays resumable — the retry completes bookkeeping exactly once", async () => {
  installFakeKv();
  installFetchDouble();
  process.env.DL1_AUTHORITY_ROUTING_ENABLED = "1";
  try {
    seedPaidSession(REFERRER_ID);
    seedReferralRecord();
    const session = checkoutSessionFixture({
      metadata: { plan: "pack3", credits: "3", qa_run: "true", ...referralMetadata() },
    });
    data.set(referralRewardedKey(session.id), {
      referralCode: REFERRAL_CODE,
      referrerSessionId: REFERRER_ID,
      phase: "grant_confirmed",
      rewardGranted: 1,
      conversionRecorded: false,
      createdAt: 9,
    });
    // Codex P2-1 reproduction: the aggregate write itself fails on
    // the first resume delivery.
    failRules.push({
      op: "set",
      match: (key) => key === referralKey(REFERRAL_CODE),
      times: 1,
      error: new KvDurableWriteError("injected aggregate write failure"),
    });
    const first = await postEvent(completedEvent("evt_aggregate_fail_1", session));
    assert.equal(first.status, 503, "aggregate persistence failure is retryable");
    assert.equal(
      data.get(referralRewardedKey(session.id)).phase,
      "grant_confirmed",
      "the conversion stays resumable — never terminally marked before its effects",
    );
    assert.equal(data.get(referralKey(REFERRAL_CODE)).conversions, 0, "the failed delta left nothing behind");
    assert.equal(data.get(referralKey(REFERRAL_CODE)).recentConversionSessionIds, undefined);

    const second = await postEvent(completedEvent("evt_aggregate_fail_2", session));
    assert.equal(second.status, 200, `retry completes bookkeeping: ${JSON.stringify(second.body)}`);
    const state = data.get(referralRewardedKey(session.id));
    assert.equal(state.phase, "completed");
    assert.equal(state.conversionRecorded, true);
    assert.equal(state.aggregateApplied, true);
    const referral = data.get(referralKey(REFERRAL_CODE));
    assert.equal(referral.conversions, 1, "aggregate applied exactly once after the retry");
    assert.equal(referral.rewardsGranted, 1);
    assert.deepEqual(referral.recentConversionSessionIds, [session.id]);
    // The reward_granted event is what countRecentReferralRewards
    // counts toward the reward caps — it must exist exactly once.
    assert.equal(referralEventsFor(session.id, "conversion_recorded").length, 1);
    assert.equal(referralEventsFor(session.id, "reward_granted").length, 1, "cap counting sees the grant exactly once");

    const third = await postEvent(completedEvent("evt_aggregate_fail_3", session));
    assert.equal(third.status, 200);
    assert.equal(data.get(referralKey(REFERRAL_CODE)).conversions, 1, "a further replay is a no-op");
    assert.equal(referralEventsFor(session.id, "reward_granted").length, 1);
  } finally {
    restoreKv();
  }
});

/* ======== Item 4 (fix round) — reversal aggregate gating ======== */

function refundEvent(eventId, piId, chargeId) {
  return {
    id: eventId,
    object: "event",
    type: "charge.refunded",
    data: {
      object: {
        id: chargeId,
        object: "charge",
        amount_refunded: 2900,
        refunded: true,
        payment_intent: piId,
        customer: "cus_buyer",
      },
    },
  };
}

function seedCountedReferralRecord(overrides = {}) {
  data.set(referralKey(REFERRAL_CODE), {
    code: REFERRAL_CODE,
    sessionId: REFERRER_ID,
    createdAt: 1,
    visits: 0,
    conversions: 5,
    rewardsGranted: 5,
    ...overrides,
  });
}

test("item 4 (fix round): reversal of an uncounted confirmed grant keeps other conversions' aggregate intact while the credit clawback lands", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    seedPaidSession(REFERRER_ID);
    // Five previously counted rewards from OTHER conversions.
    seedCountedReferralRecord();
    const buyerId = "cs_buyer_uncounted";
    data.set(ENTITLEMENT_KV.stripePaymentIntent("pi_buyer_uncounted"), buyerId);
    data.set(referralRewardedKey(buyerId), {
      referralCode: REFERRAL_CODE,
      referrerSessionId: REFERRER_ID,
      phase: "grant_confirmed",
      rewardGranted: 1,
      conversionRecorded: false,
      createdAt: 7,
    });
    const res = await postEvent(refundEvent("evt_reversal_uncounted", "pi_buyer_uncounted", "ch_uncounted"));
    assert.equal(res.status, 200);
    const state = data.get(referralRewardedKey(buyerId));
    assert.equal(state.conversionReversed, true, "the confirmed grant is still reversed (reversal bookkeeping path)");
    assert.equal(state.rewardReclaimed, 0, "S94-1: routing-disabled reclaim is zero — the combined counter is never debited");
    assert.equal(data.get(sessionKey(REFERRER_ID)).creditsRemaining, 3, "S94-1: combined counter is never debited");
    const referral = data.get(referralKey(REFERRAL_CODE));
    assert.equal(referral.rewardsGranted, 5, "an uncounted grant must not subtract other conversions' rewards");
    assert.equal(referral.conversions, 5, "an uncounted conversion must not decrement the conversion counter");
  } finally {
    restoreKv();
  }
});

test("item 4 (fix round): reversal of a counted completed grant decrements the aggregate by exactly one (control)", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    seedPaidSession(REFERRER_ID);
    // Five other counted conversions plus this one.
    seedCountedReferralRecord({ conversions: 6, rewardsGranted: 6 });
    const buyerId = "cs_buyer_counted";
    data.set(ENTITLEMENT_KV.stripePaymentIntent("pi_buyer_counted"), buyerId);
    data.set(referralRewardedKey(buyerId), {
      referralCode: REFERRAL_CODE,
      referrerSessionId: REFERRER_ID,
      phase: "completed",
      rewardGranted: 1,
      conversionRecorded: true,
      aggregateApplied: true,
      rewarded: true,
      createdAt: 7,
    });
    const res = await postEvent(refundEvent("evt_reversal_counted", "pi_buyer_counted", "ch_counted"));
    assert.equal(res.status, 200);
    const state = data.get(referralRewardedKey(buyerId));
    assert.equal(state.conversionReversed, true);
    assert.equal(state.rewardReclaimed, 0, "S94-1: routing-disabled reclaim is zero");
    assert.equal(data.get(sessionKey(REFERRER_ID)).creditsRemaining, 3, "S94-1: combined counter is never debited");
    const referral = data.get(referralKey(REFERRAL_CODE));
    assert.equal(referral.conversions, 5, "counted conversion decremented exactly once");
    assert.equal(referral.rewardsGranted, 5, "counted reward decremented exactly once");
  } finally {
    restoreKv();
  }
});

test("item 4 (fix round): reversal of a mid-bookkeeping grant (aggregate marker landed, terminal outstanding) decrements by exactly one", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    seedPaidSession(REFERRER_ID);
    const buyerId = "cs_buyer_midbook";
    // The aggregate delta for THIS conversion already landed — the
    // ReferralRecord marker is the evidence — but its terminal
    // outcome write is still outstanding.
    seedCountedReferralRecord({
      conversions: 6,
      rewardsGranted: 6,
      recentConversionSessionIds: [buyerId],
    });
    data.set(ENTITLEMENT_KV.stripePaymentIntent("pi_buyer_midbook"), buyerId);
    data.set(referralRewardedKey(buyerId), {
      referralCode: REFERRAL_CODE,
      referrerSessionId: REFERRER_ID,
      phase: "grant_confirmed",
      rewardGranted: 1,
      conversionRecorded: false,
      createdAt: 7,
    });
    const res = await postEvent(refundEvent("evt_reversal_midbook", "pi_buyer_midbook", "ch_midbook"));
    assert.equal(res.status, 200);
    const state = data.get(referralRewardedKey(buyerId));
    assert.equal(state.conversionReversed, true);
    assert.equal(state.rewardReclaimed, 0, "S94-1: routing-disabled reclaim is zero");
    assert.equal(data.get(sessionKey(REFERRER_ID)).creditsRemaining, 3, "S94-1: combined counter is never debited");
    const referral = data.get(referralKey(REFERRAL_CODE));
    assert.equal(referral.conversions, 5, "the landed conversion is un-counted exactly once");
    assert.equal(referral.rewardsGranted, 5, "the landed reward is un-counted exactly once");
  } finally {
    restoreKv();
  }
});

test("item 4 (fix round): reversal of a finished legacy decision (no phase, conversionRecorded) still decrements the aggregate (control)", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    seedPaidSession(REFERRER_ID);
    seedCountedReferralRecord({ conversions: 6, rewardsGranted: 6 });
    const buyerId = "cs_buyer_legacy_counted";
    data.set(ENTITLEMENT_KV.stripePaymentIntent("pi_buyer_legacy_counted"), buyerId);
    data.set(referralRewardedKey(buyerId), {
      referralCode: REFERRAL_CODE,
      referrerSessionId: REFERRER_ID,
      rewarded: true,
      rewardGranted: 1,
      conversionRecorded: true,
      createdAt: 7,
    });
    const res = await postEvent(refundEvent("evt_reversal_legacy", "pi_buyer_legacy_counted", "ch_legacy"));
    assert.equal(res.status, 200);
    const state = data.get(referralRewardedKey(buyerId));
    assert.equal(state.conversionReversed, true);
    assert.equal(state.rewardReclaimed, 0, "S94-1: routing-disabled reclaim is zero");
    assert.equal(data.get(sessionKey(REFERRER_ID)).creditsRemaining, 3, "S94-1: combined counter is never debited");
    const referral = data.get(referralKey(REFERRAL_CODE));
    assert.equal(referral.conversions, 5, "legacy counted conversion decremented exactly once");
    assert.equal(referral.rewardsGranted, 5, "legacy counted reward decremented exactly once");
  } finally {
    restoreKv();
  }
});

/* ======== Item 4 (fix round 2) — read discipline, marker retention, reversal interleave ======== */

function seedGrantConfirmed(sessionId, overrides = {}) {
  data.set(referralRewardedKey(sessionId), {
    referralCode: REFERRAL_CODE,
    referrerSessionId: REFERRER_ID,
    phase: "grant_confirmed",
    rewardGranted: 1,
    conversionRecorded: false,
    createdAt: 9,
    ...overrides,
  });
}

test("item 4 (fix round 2): an unreadable referral record during a grant_confirmed resume is retryable — nothing terminal is claimed, the healthy retry completes exactly once", async () => {
  installFakeKv();
  installFetchDouble();
  process.env.DL1_AUTHORITY_ROUTING_ENABLED = "1";
  try {
    seedPaidSession(REFERRER_ID);
    seedReferralRecord();
    const session = checkoutSessionFixture({
      metadata: { plan: "pack3", credits: "3", qa_run: "true", ...referralMetadata() },
    });
    seedGrantConfirmed(session.id);
    // Codex P2-3 reproduction: the aggregate read fails transiently.
    // Plain kv.get answers null (its local-fallback degradation on a
    // remote read failure) and the error-preserving read throws —
    // exactly how the real kv layer behaves in a Cloudflare outage.
    getHook = (key, read) => (key === referralKey(REFERRAL_CODE) ? null : read());
    epGetHook = (key, read) => {
      if (key === referralKey(REFERRAL_CODE)) {
        throw new KvReadError("injected referral record read failure");
      }
      return read();
    };
    const first = await postEvent(completedEvent("evt_unreadable_aggregate_1", session));
    assert.equal(first.status, 503, "an unreadable aggregate record leaves the event retryable");
    const stalled = data.get(referralRewardedKey(session.id));
    assert.equal(stalled.phase, "grant_confirmed", "no terminal write from a record that was never read");
    assert.equal(stalled.aggregateApplied, undefined, "completion is never claimed for an unlanded delta");
    assert.equal(data.get(referralKey(REFERRAL_CODE)).conversions, 0, "counters untouched");
    assert.equal(data.get(referralKey(REFERRAL_CODE)).rewardsGranted, 0);
    assert.equal(referralEventsFor(session.id, "conversion_recorded").length, 0);
    assert.equal(referralEventsFor(session.id, "reward_granted").length, 0);

    getHook = null;
    epGetHook = null;
    const second = await postEvent(completedEvent("evt_unreadable_aggregate_2", session));
    assert.equal(second.status, 200, `healthy retry completes bookkeeping: ${JSON.stringify(second.body)}`);
    const state = data.get(referralRewardedKey(session.id));
    assert.equal(state.phase, "completed");
    assert.equal(state.aggregateApplied, true);
    const referral = data.get(referralKey(REFERRAL_CODE));
    assert.equal(referral.conversions, 1, "aggregate applied exactly once after the retry");
    assert.equal(referral.rewardsGranted, 1);
    assert.deepEqual(referral.recentConversionSessionIds, [session.id]);
    assert.equal(referralEventsFor(session.id, "conversion_recorded").length, 1);
    assert.equal(referralEventsFor(session.id, "reward_granted").length, 1);
  } finally {
    restoreKv();
  }
});

test("item 4 (fix round 2): aggregate evidence is not evicted by later conversions — a stalled conversion retries without double-counting", async () => {
  installFakeKv();
  installFetchDouble();
  process.env.DL1_AUTHORITY_ROUTING_ENABLED = "1";
  try {
    seedPaidSession(REFERRER_ID);
    seedReferralRecord();
    const target = checkoutSessionFixture({
      id: "cs_buyer_stalled",
      payment_intent: "pi_buyer_stalled",
      metadata: { plan: "pack3", credits: "3", qa_run: "true", ...referralMetadata() },
    });
    seedGrantConfirmed(target.id);
    // Codex P2-4 reproduction: the target's aggregate delta lands
    // but its terminal-state write fails, leaving the applied-session
    // marker as the only counted-ness evidence.
    failRules.push({
      op: "setDurable",
      match: (key) => key === referralRewardedKey(target.id),
      valueMatch: (value) => value?.phase === "completed",
      times: 1,
    });
    const first = await postEvent(completedEvent("evt_stalled_1", target));
    assert.equal(first.status, 503, "terminal persistence failure is retryable");
    assert.equal(data.get(referralKey(REFERRAL_CODE)).conversions, 1, "target delta landed");
    assert.deepEqual(data.get(referralKey(REFERRAL_CODE)).recentConversionSessionIds, [target.id]);

    // 51 further conversions for the same code complete normally —
    // more than the old marker bound, so the stalled conversion's
    // evidence would have been evicted by truncation.
    for (let i = 0; i < 51; i += 1) {
      const other = checkoutSessionFixture({
        id: `cs_buyer_other_${i}`,
        payment_intent: `pi_buyer_other_${i}`,
        metadata: { plan: "pack3", credits: "3", qa_run: "true", ...referralMetadata() },
      });
      seedGrantConfirmed(other.id);
      const res = await postEvent(completedEvent(`evt_other_${i}`, other));
      assert.equal(res.status, 200, `intervening conversion ${i} completes`);
    }
    const before = data.get(referralKey(REFERRAL_CODE));
    assert.equal(before.conversions, 52, "52 unique conversions counted");
    assert.equal(before.rewardsGranted, 52);
    assert.ok(
      before.recentConversionSessionIds.includes(target.id),
      "the stalled conversion's counted-ness evidence is retained",
    );
    assert.equal(before.recentConversionSessionIds.length, 52, "no marker is truncated away");

    const second = await postEvent(completedEvent("evt_stalled_2", target));
    assert.equal(second.status, 200);
    const after = data.get(referralKey(REFERRAL_CODE));
    assert.equal(after.conversions, 52, "the retry does not apply the target's delta a second time");
    assert.equal(after.rewardsGranted, 52);
    assert.equal(data.get(referralRewardedKey(target.id)).phase, "completed");
    assert.equal(data.get(referralRewardedKey(target.id)).aggregateApplied, true);
    assert.equal(referralEventsFor(target.id, "conversion_recorded").length, 1);
    assert.equal(referralEventsFor(target.id, "reward_granted").length, 1, "cap counting sees the grant exactly once");
  } finally {
    restoreKv();
  }
});

test("item 4 (fix round 2): a reversal landing mid-bookkeeping (after the delta, before the terminal write) survives the terminal write — no second reversal", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    seedPaidSession(REFERRER_ID);
    seedReferralRecord();
    const session = checkoutSessionFixture({
      metadata: { plan: "pack3", credits: "3", qa_run: "true", ...referralMetadata() },
    });
    data.set(ENTITLEMENT_KV.stripePaymentIntent(session.payment_intent), session.id);
    seedGrantConfirmed(session.id);
    // Lane observation, staged at its real interleave: the reversal
    // lands INSIDE the bookkeeping pass — after the aggregate delta
    // write, before the terminal outcome write. The bookkeeping
    // pass reads the referral ledger (for its appends) after the
    // delta at both the old and new heads, so the ledger read is
    // the injection point: when the delta is already visible, the
    // reversal's own writes are applied to the store first, exactly
    // as reverseReferralReward would write them at that moment
    // (marker observed -> decrement, flags persisted; S94-1: the
    // reversal no longer writes the referrer session record — the
    // combined counter is never debited).
    let reversalLanded = false;
    getHook = (key, read) => {
      const referral = data.get(referralKey(REFERRAL_CODE));
      if (
        !reversalLanded &&
        key === `referral:events:${REFERRAL_CODE}` &&
        (referral?.recentConversionSessionIds ?? []).includes(session.id)
      ) {
        reversalLanded = true;
        data.set(referralKey(REFERRAL_CODE), {
          ...referral,
          conversions: referral.conversions - 1,
          rewardsGranted: referral.rewardsGranted - 1,
        });
        data.set(referralRewardedKey(session.id), {
          ...data.get(referralRewardedKey(session.id)),
          conversionReversed: true,
          conversionReversedAt: 4242,
          rewardReversed: true,
          rewardReversedAt: 4242,
          reversalReason: "refund",
          rewardReclaimed: 0,
        });
        const ledger = data.get(`referral:events:${REFERRAL_CODE}`) ?? [];
        data.set(`referral:events:${REFERRAL_CODE}`, [
          {
            id: `conversion_reversed:${session.id}`,
            code: REFERRAL_CODE,
            type: "conversion_reversed",
            createdAt: 4242,
            details: { checkoutSessionId: session.id, reason: "refund" },
          },
          ...ledger,
        ]);
      }
      return read();
    };
    const res = await postEvent(completedEvent("evt_midbook_rev_1", session));
    assert.equal(res.status, 200, `bookkeeping completes: ${JSON.stringify(res.body)}`);
    assert.equal(reversalLanded, true, "the staged interleave actually occurred");
    const state = data.get(referralRewardedKey(session.id));
    assert.equal(state.phase, "completed");
    assert.equal(state.conversionReversed, true, "reversal flags survive the terminal write");
    assert.equal(state.rewardReversed, true);
    assert.equal(state.reversalReason, "refund");
    assert.equal(state.aggregateApplied, true, "the delta genuinely landed (and was reversed out)");
    assert.equal(data.get(referralKey(REFERRAL_CODE)).conversions, 0, "delta and decrement net to zero");
    assert.equal(data.get(referralKey(REFERRAL_CODE)).rewardsGranted, 0);
    assert.equal(data.get(sessionKey(REFERRER_ID)).creditsRemaining, 3, "S94-1: the combined counter is never debited");
    assert.equal(referralEventsFor(session.id, "conversion_recorded").length, 1);
    assert.equal(referralEventsFor(session.id, "conversion_reversed").length, 1);
    getHook = null;

    // A later refund delivery now sees the preserved flags and
    // no-ops — no second clawback, no second decrement.
    const refund = await postEvent(refundEvent("evt_midbook_rev_refund", session.payment_intent, "ch_midbook_rev"));
    assert.equal(refund.status, 200);
    assert.equal(data.get(sessionKey(REFERRER_ID)).creditsRemaining, 3, "no clawback on the redelivery either");
    assert.equal(data.get(referralKey(REFERRAL_CODE)).conversions, 0, "no second decrement");
    assert.equal(data.get(referralKey(REFERRAL_CODE)).rewardsGranted, 0);
  } finally {
    restoreKv();
  }
});

test("item 4 (fix round 2): a conversion already reversed when bookkeeping resumes closes without the aggregate delta ever applying", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    // Five previously counted conversions from other buyers; this
    // buyer's grant was reversed BEFORE any bookkeeping pass ran
    // (flags persisted on its outcome record, credit already
    // clawed back) — the reversal gated its decrements on the
    // delta never having landed.
    seedCountedReferralRecord();
    seedPaidSession(REFERRER_ID, { creditsRemaining: 2 });
    const buyerId = "cs_buyer_reversed_first";
    seedGrantConfirmed(buyerId, {
      conversionReversed: true,
      conversionReversedAt: 4242,
      rewardReversed: true,
      rewardReversedAt: 4242,
      reversalReason: "refund",
      rewardReclaimed: 1,
    });

    // The bookkeeping resume must close the record WITHOUT applying
    // the delta, WITHOUT grant-side ledger entries after the
    // reversal, and WITHOUT erasing the reversal disposition.
    const session = checkoutSessionFixture({
      id: buyerId,
      payment_intent: "pi_buyer_reversed_first",
      metadata: { plan: "pack3", credits: "3", qa_run: "true", ...referralMetadata() },
    });
    const res = await postEvent(completedEvent("evt_reversed_first_resume", session));
    assert.equal(res.status, 200, `resume completes: ${JSON.stringify(res.body)}`);
    const state = data.get(referralRewardedKey(buyerId));
    assert.equal(state.phase, "completed");
    assert.equal(state.conversionReversed, true, "reversal flags survive the terminal write");
    assert.equal(state.rewardReversed, true);
    assert.equal(state.reversalReason, "refund");
    assert.equal(state.aggregateApplied, false, "the delta never landed — never claimed");
    const referral = data.get(referralKey(REFERRAL_CODE));
    assert.equal(referral.conversions, 5, "the reversed conversion is never counted");
    assert.equal(referral.rewardsGranted, 5);
    assert.equal(data.get(sessionKey(REFERRER_ID)).creditsRemaining, 2, "no further clawback");
    assert.equal(referralEventsFor(buyerId, "conversion_recorded").length, 0, "no grant-side ledger entries after a reversal");
    assert.equal(referralEventsFor(buyerId, "reward_granted").length, 0);
  } finally {
    restoreKv();
  }
});

/* ======== S94-1 — legacy clawback bucket discipline + same-surface P2s ======== */
// S94-1-F1 (P1): with authority routing disabled, the legacy reversal
// debited the referrer's COMBINED KV counter — the same counter
// purchased credits live in. Legacy grants raised creditsTotal
// alongside the balance, so a spent reward is indistinguishable from
// purchased value (the migration doctrine in entitlementMigration.ts
// records the legacy balance WHOLE as the legacy bucket for exactly
// this reason). DL-1 R1 Option A: a clawback may only remove
// positively identified, unspent reward value; in a legacy record
// there is none, so the routing-disabled reclaim is ZERO — the same
// answer the authority path gives for a pre-bucket grant
// (not_bucket_grant). The reversal's bookkeeping (flags, aggregate
// decrements, ledger) still lands; only the debit is removed.

test("S94-1-F1: routing-disabled reversal of a legacy rewarded conversion reclaims ZERO from the combined balance — purchased credits are unreachable", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    // Legacy shape: the pre-bucket grant raised the combined counter
    // (creditsTotal 4 = 3 purchased + 1 reward) and one credit was
    // consumed. Which of the remaining 3 is the reward is unknowable.
    seedPaidSession(REFERRER_ID, { creditsTotal: 4, creditsRemaining: 3 });
    seedCountedReferralRecord({ conversions: 6, rewardsGranted: 6 });
    const buyerId = "cs_buyer_s941_legacy";
    data.set(ENTITLEMENT_KV.stripePaymentIntent("pi_buyer_s941_legacy"), buyerId);
    data.set(referralRewardedKey(buyerId), {
      referralCode: REFERRAL_CODE,
      referrerSessionId: REFERRER_ID,
      rewarded: true,
      rewardGranted: 1,
      conversionRecorded: true,
      createdAt: 7,
    });
    const res = await postEvent(refundEvent("evt_s941_legacy_refund", "pi_buyer_s941_legacy", "ch_s941_legacy"));
    assert.equal(res.status, 200);
    const state = data.get(referralRewardedKey(buyerId));
    assert.equal(state.conversionReversed, true, "the conversion is still reversed");
    assert.equal(state.rewardReversed, true);
    assert.equal(state.rewardReclaimed, 0, "no positively identified unspent reward value exists in a legacy record");
    assert.equal(data.get(sessionKey(REFERRER_ID)).creditsRemaining, 3, "the combined balance is never debited");
    assert.equal(sessionPuts(REFERRER_ID).length, 0, "the reversal does not write the referrer session record at all");
    const referral = data.get(referralKey(REFERRAL_CODE));
    assert.equal(referral.conversions, 5, "counted conversion decremented exactly once");
    assert.equal(referral.rewardsGranted, 5, "counted reward decremented exactly once");

    // Redelivery: no second decrement, no late debit.
    const again = await postEvent(refundEvent("evt_s941_legacy_refund2", "pi_buyer_s941_legacy", "ch_s941_legacy"));
    assert.equal(again.status, 200);
    assert.equal(data.get(sessionKey(REFERRER_ID)).creditsRemaining, 3);
    assert.equal(data.get(referralKey(REFERRAL_CODE)).conversions, 5);
  } finally {
    restoreKv();
  }
});

test("S94-1-F4: routing-enabled reversal of a pending conversion defers — a committed-but-unconfirmed grant is never finalized around", async () => {
  installFakeKv();
  installFetchDouble();
  process.env.DL1_AUTHORITY_ROUTING_ENABLED = "1";
  try {
    seedPaidSession(REFERRER_ID);
    seedReferralRecord();
    const buyerId = "cs_buyer_s941_pending";
    data.set(ENTITLEMENT_KV.stripePaymentIntent("pi_buyer_s941_pending"), buyerId);
    // The S93-1 pending checkpoint: the authority may already have
    // accepted the grant while the grant_confirmed write is still
    // outstanding. Treating this as "nothing to reverse" would
    // finalize the refund with a live grant behind it.
    data.set(referralRewardedKey(buyerId), {
      referralCode: REFERRAL_CODE,
      referrerSessionId: REFERRER_ID,
      phase: "pending",
      createdAt: 7,
    });
    const res = await postEvent(refundEvent("evt_s941_pending_refund", "pi_buyer_s941_pending", "ch_s941_pending"));
    assert.equal(res.status, 503, "the refund stays retryable while the grant identity is unresolved");
    assert.equal(data.has(eventMarkerKey("evt_s941_pending_refund")), false, "dedupe must not finalize");
    const state = data.get(referralRewardedKey(buyerId));
    assert.equal(state.conversionReversed, undefined, "no reversal is recorded against an unresolved grant");
    assert.equal(data.get(sessionKey(REFERRER_ID)).creditsRemaining, 3);

    // The grant side settles as a terminal skip (nothing was ever
    // granted): the same refund now finalizes cleanly — the deferral
    // resolves instead of deadlocking.
    data.set(referralRewardedKey(buyerId), {
      referralCode: REFERRAL_CODE,
      referrerSessionId: REFERRER_ID,
      phase: "terminal_skip",
      rewarded: true,
      rewardGranted: 0,
      conversionRecorded: false,
      rewardSkipReason: "purchaser_revoked",
      createdAt: 7,
    });
    const settled = await postEvent(refundEvent("evt_s941_pending_refund2", "pi_buyer_s941_pending", "ch_s941_pending"));
    assert.equal(settled.status, 200);
    assert.equal(data.get(sessionKey(REFERRER_ID)).creditsRemaining, 3);
  } finally {
    restoreKv();
  }
});

test("S94-1-F6: a reversal ledger append that fails after the state finalizes is repaired on redelivery — events land exactly once", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    seedPaidSession(REFERRER_ID);
    seedCountedReferralRecord({ conversions: 6, rewardsGranted: 6 });
    const buyerId = "cs_buyer_s941_ledger";
    data.set(ENTITLEMENT_KV.stripePaymentIntent("pi_buyer_s941_ledger"), buyerId);
    data.set(referralRewardedKey(buyerId), {
      referralCode: REFERRAL_CODE,
      referrerSessionId: REFERRER_ID,
      rewarded: true,
      rewardGranted: 1,
      conversionRecorded: true,
      createdAt: 7,
    });
    // The first reversal ledger append (conversion_reversed) fails
    // AFTER the clawback + reversal-state write have landed.
    failRules.push({
      op: "set",
      match: (key) => key === `referral:events:${REFERRAL_CODE}`,
      times: 1,
    });
    // The append throw is uncaught inside the handler — in
    // production it surfaces as a 500 and Stripe redelivers; in this
    // harness it rejects the POST promise. Either way the event
    // stays retryable and unfinalized.
    let firstThrew = false;
    try {
      await postEvent(refundEvent("evt_s941_ledger_1", "pi_buyer_s941_ledger", "ch_s941_ledger"));
    } catch {
      firstThrew = true;
    }
    assert.ok(firstThrew, "the failed append keeps the event retryable");
    const stateAfterFirst = data.get(referralRewardedKey(buyerId));
    assert.equal(stateAfterFirst.conversionReversed, true, "the reversal state finalized before the ledger append (the defect's fingerprint)");
    assert.equal(referralEventsFor(buyerId, "conversion_reversed").length, 0, "the ledger evidence is missing after the failure");

    const second = await postEvent(refundEvent("evt_s941_ledger_2", "pi_buyer_s941_ledger", "ch_s941_ledger"));
    assert.equal(second.status, 200);
    assert.equal(referralEventsFor(buyerId, "conversion_reversed").length, 1, "the missing conversion_reversed event is repaired exactly once");
    assert.equal(referralEventsFor(buyerId, "reward_reversed").length, 1, "the missing reward_reversed event is repaired exactly once");
    const referral = data.get(referralKey(REFERRAL_CODE));
    assert.equal(referral.conversions, 5, "the aggregate decrement is not repeated by the repair");
    assert.equal(referral.rewardsGranted, 5);
  } finally {
    restoreKv();
  }
});

test("S94-1-F8: a birth-pending authority grant is paired with its reversal — the refund defers instead of finalizing unpaired", async () => {
  installFakeKv();
  installFetchDouble();
  process.env.DL1_AUTHORITY_ROUTING_ENABLED = "1";
  try {
    seedPaidSession(REFERRER_ID);
    seedReferralRecord();
    const buyerId = "cs_buyer_s941_birth";
    data.set(ENTITLEMENT_KV.stripePaymentIntent("pi_buyer_s941_birth"), buyerId);
    // The grant-side terminal shape for an authority grant_pending
    // (birth): zero KV grant, conversionRecorded true, the skip
    // reason recorded — the same shape the discovery/inclusion
    // pendings carry, which the reversal DOES pair with the
    // authority. The birth reason must be classified the same way.
    data.set(referralRewardedKey(buyerId), {
      referralCode: REFERRAL_CODE,
      referrerSessionId: REFERRER_ID,
      phase: "terminal_skip",
      rewarded: true,
      rewardGranted: 0,
      conversionRecorded: true,
      rewardSkipReason: "authority_grant_birth_unresolved",
      createdAt: 7,
    });
    const res = await postEvent(refundEvent("evt_s941_birth_refund", "pi_buyer_s941_birth", "ch_s941_birth"));
    assert.equal(res.status, 503, "the reversal consults the authority and defers on the unresolved identity instead of finalizing");
    assert.equal(data.has(eventMarkerKey("evt_s941_birth_refund")), false, "dedupe must not finalize");
    const state = data.get(referralRewardedKey(buyerId));
    assert.equal(state.conversionReversed, undefined, "no unpaired reversal is recorded");
  } finally {
    restoreKv();
  }
});

/* ======== S94-1 gate fix round 1 (PR #476) — Codex P1 + P2 ======== */

test("S94-1 gate fix round 1 (P1): an accepted grant whose grant_confirmed write failed is reversed through the authority before the reversal may finalize — the sequence the F4 deferral assumed, closed", async () => {
  installFakeKv();
  installFetchDouble();
  process.env.DL1_AUTHORITY_ROUTING_ENABLED = "1";
  process.env.STARMAP_ENTITLEMENT_AUTHORITY_LOCAL = "1";
  try {
    const { createEntitlementAuthorityClient, __resetEntitlementAuthorityMemoryForTests } =
      await import("../../src/lib/entitlementAuthority.ts");
    __resetEntitlementAuthorityMemoryForTests();
    seedPaidSession(REFERRER_ID);
    seedReferralRecord();
    const buyerId = "cs_buyer_s941fix_p1";
    // Created after the referral migration snapshot, so the
    // authority folds the grant immediately on native-admission
    // evidence — the acceptance below is real, not seeded.
    const session = checkoutSessionFixture({
      id: buyerId,
      payment_intent: "pi_buyer_s941fix_p1",
      created: Math.floor(Date.now() / 1000) + 86400,
      metadata: { plan: "pack3", credits: "3", qa_run: "true", ...referralMetadata() },
    });
    data.set(ENTITLEMENT_KV.stripePaymentIntent("pi_buyer_s941fix_p1"), buyerId);
    const client = createEntitlementAuthorityClient();

    // Delivery 1: authority acceptance SUCCEEDS; only the
    // grant_confirmed write fails. The record stays in the pending
    // checkpoint while the accepted grant is live in the bucket.
    failRules.push({
      op: "setDurable",
      match: (key) => key === referralRewardedKey(buyerId),
      valueMatch: (value) => value?.phase === "grant_confirmed",
      times: 1,
    });
    const first = await postEvent(completedEvent("evt_s941fix_p1_1", session));
    assert.equal(first.status, 503, "the failed grant_confirmed write stays retryable");
    assert.equal(data.get(referralRewardedKey(buyerId))?.phase, "pending");
    assert.equal(
      (await client.getState(REFERRER_ID))?.rewardBucketBalance,
      1,
      "the authority accepted the grant — one reward credit is live",
    );

    // The refund arrives while the record is still pending. The
    // reversal pairs the pending identity with the authority
    // instead of deferring on the F4 premise ("a checkout
    // redelivery will settle the record first"): the authority CAN
    // answer — the grant folded — so the accepted grant is reversed
    // on the spot and the reversal finalizes WITH the claw, never
    // around it. Deferral remains the disposition exactly when the
    // authority cannot answer (no baseline, journal pendency) —
    // pinned by the F4 and F8 tests above.
    const refund1 = await postEvent(refundEvent("evt_s941fix_p1_r1", "pi_buyer_s941fix_p1", "ch_s941fix_p1"));
    assert.equal(refund1.status, 200, "the reversal finalizes only with the accepted grant reversed");
    assert.equal(data.has(eventMarkerKey("evt_s941fix_p1_r1")), true, "dedupe finalized after reconciliation");
    let state = data.get(referralRewardedKey(buyerId));
    assert.equal(state.conversionReversed, true);
    assert.equal(state.rewardReversed, true);
    assert.equal(state.rewardReclaimed, 1, "the authority's clawed amount is recorded");
    assert.equal(
      (await client.getState(REFERRER_ID))?.rewardBucketBalance,
      0,
      "the accepted grant was clawed back through the authority",
    );

    // The checkout redelivery lands AFTER the refund: its settlement
    // pass observes the revocation and never reaches the grant side —
    // and it cannot resurrect anything. The record keeps its
    // reversal disposition and the bucket stays empty. (Under the
    // pre-fix F4 guard this ordering was the wedge: the redelivery
    // could not settle the record, so the refund deferred forever
    // with the accepted grant live behind it.)
    const redelivery = await postEvent(completedEvent("evt_s941fix_p1_2", session));
    assert.equal(redelivery.status, 200);
    state = data.get(referralRewardedKey(buyerId));
    assert.equal(state.conversionReversed, true);
    assert.equal((await client.getState(REFERRER_ID))?.rewardBucketBalance, 0);

    // The refund's redelivery is a clean no-op: no second claw, no
    // duplicate ledger evidence.
    const refund2 = await postEvent(refundEvent("evt_s941fix_p1_r2", "pi_buyer_s941fix_p1", "ch_s941fix_p1"));
    assert.equal(refund2.status, 200);
    state = data.get(referralRewardedKey(buyerId));
    assert.equal(state.rewardReclaimed, 1);
    assert.equal((await client.getState(REFERRER_ID))?.rewardBucketBalance, 0);
    // The grant side never completed bookkeeping, so the aggregates
    // carry no conversion to decrement, and the referrer's combined
    // KV balance is never debited.
    const referral = data.get(referralKey(REFERRAL_CODE));
    assert.equal(referral.conversions, 0);
    assert.equal(referral.rewardsGranted, 0);
    assert.equal(data.get(sessionKey(REFERRER_ID)).creditsRemaining, 3);
    assert.equal(referralEventsFor(buyerId, "conversion_reversed").length, 1);
    assert.equal(referralEventsFor(buyerId, "reward_reversed").length, 1);
  } finally {
    delete process.env.STARMAP_ENTITLEMENT_AUTHORITY_LOCAL;
    restoreKv();
  }
});

test("S94-1 gate fix round 1 (P1): a purchaser_revoked skip over the pending checkpoint preserves the grant identity, and the refund reverses the accepted grant through it", async () => {
  installFakeKv();
  installFetchDouble();
  process.env.DL1_AUTHORITY_ROUTING_ENABLED = "1";
  process.env.STARMAP_ENTITLEMENT_AUTHORITY_LOCAL = "1";
  try {
    const { createEntitlementAuthorityClient, __resetEntitlementAuthorityMemoryForTests } =
      await import("../../src/lib/entitlementAuthority.ts");
    __resetEntitlementAuthorityMemoryForTests();
    seedPaidSession(REFERRER_ID);
    seedReferralRecord();
    const buyerId = "cs_buyer_s941fix_p1skip";
    const session = checkoutSessionFixture({
      id: buyerId,
      payment_intent: "pi_buyer_s941fix_p1skip",
      created: Math.floor(Date.now() / 1000) + 86400,
      metadata: { plan: "pack3", credits: "3", qa_run: "true", ...referralMetadata() },
    });
    data.set(ENTITLEMENT_KV.stripePaymentIntent("pi_buyer_s941fix_p1skip"), buyerId);
    const client = createEntitlementAuthorityClient();

    // Same opening as the sequence test: accepted grant, failed
    // grant_confirmed write, record pending, bucket holds 1.
    failRules.push({
      op: "setDurable",
      match: (key) => key === referralRewardedKey(buyerId),
      valueMatch: (value) => value?.phase === "grant_confirmed",
      times: 1,
    });
    const first = await postEvent(completedEvent("evt_s941fix_p1skip_1", session));
    assert.equal(first.status, 503);
    assert.equal((await client.getState(REFERRER_ID))?.rewardBucketBalance, 1);

    // A checkout redelivery whose grant side observes the revocation
    // MID-PASS — the refund's tombstone lands after this pass's
    // settlement reads but before the grant side's checks (the
    // interleave the item-5 tests model) — records the
    // purchaser_revoked skip over the pending checkpoint.
    let injected = false;
    getHook = (key, read) => {
      if (!injected && key === referralKey(REFERRAL_CODE)) {
        injected = true;
        data.set(piRevokedKey(session.payment_intent), {
          schemaVersion: SETTLEMENT_SCHEMA_VERSION,
          paymentIntentId: session.payment_intent,
          revoked: true,
          reason: "refund",
          revokedAt: Date.now(),
        });
      }
      return read();
    };
    const skipDelivery = await postEvent(completedEvent("evt_s941fix_p1skip_2", session));
    getHook = null;
    assert.equal(injected, true, "the interleave landed inside the grant side's pass");
    assert.equal(skipDelivery.status, 200, "a validation skip is terminal, not retryable");
    const skipped = data.get(referralRewardedKey(buyerId));
    assert.equal(skipped.phase, "terminal_skip");
    assert.equal(skipped.rewardSkipReason, "purchaser_revoked");
    assert.equal(
      skipped.authorityGrantUnresolved,
      true,
      "the skip preserves the unresolved grant identity instead of settling as an ordinary zero-grant decision",
    );
    assert.equal(
      (await client.getState(REFERRER_ID))?.rewardBucketBalance,
      1,
      "the skip itself does not reverse the accepted grant",
    );

    // The refund finalizes ONLY by pairing the preserved identity
    // with the authority: the accepted grant is reversed and the
    // clawed amount recorded — never finalized around.
    const refund = await postEvent(refundEvent("evt_s941fix_p1skip_r1", "pi_buyer_s941fix_p1skip", "ch_s941fix_p1skip"));
    assert.equal(refund.status, 200);
    const state = data.get(referralRewardedKey(buyerId));
    assert.equal(state.conversionReversed, true);
    assert.equal(state.rewardReversed, true);
    assert.equal(state.rewardReclaimed, 1);
    assert.equal(
      (await client.getState(REFERRER_ID))?.rewardBucketBalance,
      0,
      "the accepted grant was clawed back through the authority",
    );
    assert.equal(data.get(sessionKey(REFERRER_ID)).creditsRemaining, 3, "the combined KV balance is never debited");
  } finally {
    delete process.env.STARMAP_ENTITLEMENT_AUTHORITY_LOCAL;
    restoreKv();
  }
});

test("S94-1 gate fix round 1 (P2): the F6 repair does not duplicate legacy random-id reversal events on redelivery", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    seedPaidSession(REFERRER_ID);
    // This conversion was counted at 6/6 and reversed BEFORE the
    // deterministic-id repair existed: the state flags and the
    // decremented aggregates (5/5) landed, and the ledger events
    // were appended with random-UUID ids.
    seedCountedReferralRecord({ conversions: 5, rewardsGranted: 5 });
    const buyerId = "cs_buyer_s941fix_p2";
    data.set(ENTITLEMENT_KV.stripePaymentIntent("pi_buyer_s941fix_p2"), buyerId);
    const reversedAt = Date.now() - 86400000;
    data.set(referralRewardedKey(buyerId), {
      referralCode: REFERRAL_CODE,
      referrerSessionId: REFERRER_ID,
      rewarded: true,
      rewardGranted: 1,
      conversionRecorded: true,
      conversionReversed: true,
      conversionReversedAt: reversedAt,
      rewardReversed: true,
      rewardReversedAt: reversedAt,
      rewardReclaimed: 1,
      reversalReason: "charge_refunded",
      source: "checkout",
      createdAt: 7,
    });
    const legacyConversionEventId = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
    const legacyRewardEventId = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
    data.set(`referral:events:${REFERRAL_CODE}`, [
      {
        id: legacyRewardEventId,
        code: REFERRAL_CODE,
        type: "reward_reversed",
        createdAt: reversedAt,
        details: { checkoutSessionId: buyerId, reason: "charge_refunded", rewardGranted: 1, rewardReclaimed: 1 },
      },
      {
        id: legacyConversionEventId,
        code: REFERRAL_CODE,
        type: "conversion_reversed",
        createdAt: reversedAt,
        details: { checkoutSessionId: buyerId, reason: "charge_refunded" },
      },
    ]);

    const res = await postEvent(refundEvent("evt_s941fix_p2_r1", "pi_buyer_s941fix_p2", "ch_s941fix_p2"));
    assert.equal(res.status, 200);
    const conversions = referralEventsFor(buyerId, "conversion_reversed");
    const rewards = referralEventsFor(buyerId, "reward_reversed");
    assert.equal(conversions.length, 1, "no duplicate conversion_reversed alongside the legacy event");
    assert.equal(rewards.length, 1, "no duplicate reward_reversed alongside the legacy event");
    assert.equal(conversions[0].id, legacyConversionEventId, "the surviving event is the legacy original, unreplaced");
    assert.equal(rewards[0].id, legacyRewardEventId, "the surviving event is the legacy original, unreplaced");
    const referral = data.get(referralKey(REFERRAL_CODE));
    assert.equal(referral.conversions, 5, "aggregates untouched by the no-op repair");
    assert.equal(referral.rewardsGranted, 5);
    assert.equal(data.get(sessionKey(REFERRER_ID)).creditsRemaining, 3, "no second debit of the referrer");
  } finally {
    restoreKv();
  }
});

/* ============ Items 6/7 — subscription events + dedupe ============ */

const SUB_ID = "sub_unit_1";
const SUB_SESSION = "cs_sub_unit";

function seedSubscriptionSession(overrides = {}) {
  const record = {
    paid: true,
    plan: "single",
    creditsRemaining: 1,
    creditsTotal: 1,
    created: 1767225600000,
    customerId: "cus_sub",
    orderType: "digital",
    includesDigitalAddOn: false,
    paymentIntentId: "pi_sub_unit",
    subscriptionId: SUB_ID,
    subscriptionActive: true,
    ...overrides,
  };
  data.set(sessionKey(SUB_SESSION), record);
  data.set(ENTITLEMENT_KV.stripeSubscription(SUB_ID), SUB_SESSION);
  return record;
}

function subscriptionEvent(eventId, status, type = "customer.subscription.updated") {
  return {
    id: eventId,
    object: "event",
    type,
    data: { object: { id: SUB_ID, object: "subscription", status } },
  };
}

test("item 6: refund-revoked subscriber is never reactivated by a stale active subscription event (side evidence)", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const seed = seedSubscriptionSession({
      revoked: true,
      reason: "refund",
      revokedAt: 111222,
      subscriptionActive: true,
    });
    data.set(ENTITLEMENT_KV.sessionRevoked(SUB_SESSION), {
      schemaVersion: SETTLEMENT_SCHEMA_VERSION,
      sessionId: SUB_SESSION,
      revoked: true,
      reason: "refund",
      revokedAt: 111222,
    });
    const res = await postEvent(subscriptionEvent("evt_sub_refused_evidence", "active"));
    assert.equal(res.status, 200, "a refusal is terminal — the event finalises");
    assert.deepEqual(data.get(sessionKey(SUB_SESSION)), seed);
    assert.equal(sessionPuts(SUB_SESSION).length, 0);
    const marker = data.get(eventMarkerKey("evt_sub_refused_evidence"));
    assert.equal(marker?.received, true, "terminal dedupe marker persisted");
  } finally {
    restoreKv();
  }
});

test("item 6: refund-revoked subscriber is never reactivated via the payment-intent tombstone alone", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const seed = seedSubscriptionSession({ subscriptionActive: true });
    data.set(piRevokedKey("pi_sub_unit"), {
      schemaVersion: SETTLEMENT_SCHEMA_VERSION,
      paymentIntentId: "pi_sub_unit",
      revoked: true,
      reason: "refund",
      revokedAt: 111222,
    });
    const res = await postEvent(subscriptionEvent("evt_sub_refused_tombstone", "active"));
    assert.equal(res.status, 200);
    assert.deepEqual(data.get(sessionKey(SUB_SESSION)), seed);
    assert.equal(sessionPuts(SUB_SESSION).length, 0);
  } finally {
    restoreKv();
  }
});

test("item 6: evidence landing before the activation re-check blocks the put", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const seed = seedSubscriptionSession({
      paid: false,
      revoked: true,
      reason: "subscription_inactive",
      revokedAt: 999,
      subscriptionActive: false,
    });
    let evidenceReads = 0;
    epGetHook = (key, read) => {
      if (key === ENTITLEMENT_KV.sessionRevoked(SUB_SESSION)) {
        evidenceReads += 1;
        if (evidenceReads >= 2) {
          return {
            schemaVersion: SETTLEMENT_SCHEMA_VERSION,
            sessionId: SUB_SESSION,
            revoked: true,
            reason: "dispute",
            revokedAt: 333444,
          };
        }
        return null;
      }
      return read();
    };
    const res = await postEvent(subscriptionEvent("evt_sub_recheck", "active"));
    assert.equal(res.status, 200);
    assert.deepEqual(data.get(sessionKey(SUB_SESSION)), seed);
    assert.equal(sessionPuts(SUB_SESSION).length, 0);
  } finally {
    restoreKv();
  }
});

test("item 6: evidence landing during the activation put converges to revoked and the event stays retryable", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    seedSubscriptionSession({
      paid: false,
      revoked: true,
      reason: "subscription_inactive",
      revokedAt: 999,
      subscriptionActive: false,
    });
    let evidenceReads = 0;
    epGetHook = (key, read) => {
      if (key === ENTITLEMENT_KV.sessionRevoked(SUB_SESSION)) {
        evidenceReads += 1;
        if (evidenceReads >= 3) {
          return {
            schemaVersion: SETTLEMENT_SCHEMA_VERSION,
            sessionId: SUB_SESSION,
            revoked: true,
            reason: "refund",
            revokedAt: 555666,
          };
        }
        return null;
      }
      return read();
    };
    const res = await postEvent(subscriptionEvent("evt_sub_converge", "active"));
    assert.equal(res.status, 503, "post-put divergence is retryable, never acknowledged");
    const record = data.get(sessionKey(SUB_SESSION));
    assert.equal(record.revoked, true, "state converged back to revoked");
    assert.equal(record.reason, "refund");
    assert.equal(data.has(eventMarkerKey("evt_sub_converge")), false, "no terminal marker for a retryable outcome");
  } finally {
    restoreKv();
  }
});

test("item 6: unreadable revocation evidence makes a subscription event retryable (no mutation, no marker)", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    const seed = seedSubscriptionSession({ subscriptionActive: false, paid: false });
    epGetHook = (key, read) => {
      if (key === ENTITLEMENT_KV.sessionRevoked(SUB_SESSION)) {
        throw new Error("injected evidence read failure");
      }
      return read();
    };
    const res = await postEvent(subscriptionEvent("evt_sub_unreadable", "active"));
    assert.equal(res.status, 503);
    assert.deepEqual(data.get(sessionKey(SUB_SESSION)), seed);
    assert.equal(data.has(eventMarkerKey("evt_sub_unreadable")), false);
  } finally {
    restoreKv();
  }
});

test("item 6: legitimate inactive-to-active transition still applies and finalises; replay is a duplicate", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    seedSubscriptionSession({
      paid: false,
      revoked: true,
      reason: "subscription_inactive",
      revokedAt: 999,
      subscriptionActive: false,
    });
    const event = subscriptionEvent("evt_sub_activate", "active");
    const res = await postEvent(event);
    assert.equal(res.status, 200);
    const record = data.get(sessionKey(SUB_SESSION));
    assert.equal(record.paid, true);
    assert.equal(record.revoked, false);
    assert.equal(record.reason, undefined);
    assert.equal(record.revokedAt, undefined);
    assert.equal(record.subscriptionActive, true);
    assert.equal(data.get(eventMarkerKey("evt_sub_activate"))?.received, true);

    const putsBefore = sessionPuts(SUB_SESSION).length;
    const replay = await postEvent(event);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.duplicate, true);
    assert.equal(sessionPuts(SUB_SESSION).length, putsBefore, "duplicate does not reprocess");
  } finally {
    restoreKv();
  }
});

test("item 6: an inactive transition preserves an existing refund revocation reason and timestamp", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    seedSubscriptionSession({
      revoked: true,
      reason: "refund",
      revokedAt: 555,
      subscriptionActive: true,
    });
    const res = await postEvent(
      subscriptionEvent("evt_sub_deleted_refund", "canceled", "customer.subscription.deleted"),
    );
    assert.equal(res.status, 200);
    const record = data.get(sessionKey(SUB_SESSION));
    assert.equal(record.subscriptionActive, false);
    assert.equal(record.paid, false);
    assert.equal(record.revoked, true);
    assert.equal(record.reason, "refund");
    assert.equal(record.revokedAt, 555);
  } finally {
    restoreKv();
  }
});

test("item 6: missing or mismatched subscription mapping is retryable, never silently dropped", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    // No mapping at all.
    const missing = await postEvent(subscriptionEvent("evt_sub_missing_map", "active"));
    assert.equal(missing.status, 503);
    assert.equal(data.has(eventMarkerKey("evt_sub_missing_map")), false);

    // Mapping exists but the record names a different subscription.
    seedSubscriptionSession({ subscriptionId: "sub_someone_else" });
    const mismatch = await postEvent(subscriptionEvent("evt_sub_mismatch", "active"));
    assert.equal(mismatch.status, 503);
    assert.equal(data.has(eventMarkerKey("evt_sub_mismatch")), false);
    assert.equal(sessionPuts(SUB_SESSION).length, 0);
  } finally {
    restoreKv();
  }
});

test("item 7: a legacy numeric dedupe counter does not suppress subscription processing", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    seedSubscriptionSession({
      paid: false,
      revoked: true,
      reason: "subscription_inactive",
      revokedAt: 999,
      subscriptionActive: false,
    });
    data.set(eventMarkerKey("evt_sub_legacy_counter"), 1);
    const res = await postEvent(subscriptionEvent("evt_sub_legacy_counter", "active"));
    assert.equal(res.status, 200);
    assert.equal(res.body.duplicate, undefined, "numeric counters are not terminal markers");
    assert.equal(data.get(sessionKey(SUB_SESSION)).subscriptionActive, true);
    assert.equal(data.get(eventMarkerKey("evt_sub_legacy_counter"))?.received, true);
  } finally {
    restoreKv();
  }
});

test("item 7: a failed subscription session write is answered retryable and the replay applies the update", async () => {
  installFakeKv();
  installFetchDouble();
  try {
    seedSubscriptionSession({
      paid: false,
      revoked: true,
      reason: "subscription_inactive",
      revokedAt: 999,
      subscriptionActive: false,
    });
    failRules.push({ op: "setDurable", match: (key) => key === sessionKey(SUB_SESSION), times: 1 });
    const event = subscriptionEvent("evt_sub_write_fail", "active");
    const first = await postEvent(event);
    assert.equal(first.status, 503);
    assert.equal(data.has(eventMarkerKey("evt_sub_write_fail")), false);
    assert.equal(data.get(sessionKey(SUB_SESSION)).subscriptionActive, false);

    const second = await postEvent(event);
    assert.equal(second.status, 200);
    assert.equal(data.get(sessionKey(SUB_SESSION)).subscriptionActive, true);
    assert.equal(data.get(eventMarkerKey("evt_sub_write_fail"))?.received, true);
  } finally {
    restoreKv();
  }
});

/* ================= Structural pins ================= */

test("pins: removed writers and new protocol markers are exactly as designed", async () => {
  const dispatchSource = readFileSync(
    new URL("../../src/lib/hdDownloadEmailDispatch.ts", import.meta.url),
    "utf8",
  );
  const webhookSource = readFileSync(
    new URL("../../src/app/api/stripe/webhook/route.ts", import.meta.url),
    "utf8",
  );
  const storeSource = readFileSync(
    new URL("../../src/lib/entitlementsStore.ts", import.meta.url),
    "utf8",
  );

  // Item 2: the dispatch module performs no plain session-style write
  // at all; bookkeeping is setDurable to the result records only.
  assert.equal(dispatchSource.includes("kv.set("), false, "HD dispatch must not kv.set");
  assert.equal(dispatchSource.includes("hdInitialEmailResult"), true);
  assert.equal(dispatchSource.includes("hdArchiveEmailResult"), true);

  // Items 3/4: the rollback-on-transient and the routing-disabled
  // stale-spread grant are gone; the deferral marker exists.
  assert.equal(webhookSource.includes("kv.deleteDurable(rewardStateKey)"), false);
  assert.equal(webhookSource.includes("legacy_referral_grant_requires_authority"), true);
  assert.equal(webhookSource.includes("grant_confirmed"), true);
  assert.equal(webhookSource.includes("legacy_reward_state_reconciliation_required"), true);

  // Items 5/6: strict evidence reader exists and the webhook consults it.
  assert.equal(storeSource.includes("readSessionRevocationEvidenceStrict"), true);
  assert.equal(webhookSource.includes("purchaser_revoked"), true);
  assert.equal(webhookSource.includes("applySubscriptionEvent"), true);
  assert.equal(webhookSource.includes("isSubscriptionEvent"), true);

  // Item 7: dedupe persistence is durable.
  const dedupeStart = webhookSource.indexOf("async function persistWebhookEventDedupe");
  const dedupeBody = webhookSource.slice(dedupeStart, dedupeStart + 600);
  assert.equal(dedupeBody.includes("kv.setDurable("), true);
  assert.equal(dedupeBody.includes("{ received: true"), true);

  // Item 8: the refusal record write no longer swallows failures.
  const refusalStart = storeSource.indexOf("export async function recordTransferRefusal");
  const refusalBody = storeSource.slice(refusalStart, refusalStart + 1600);
  assert.equal(refusalBody.includes("refusal-evidence-write"), false, "swallowing catch removed");
});
