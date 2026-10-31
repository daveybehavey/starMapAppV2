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

const { kv, KvDurableWriteError } = await import("../../src/lib/kv.ts");
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
    assert.equal(data.get(sessionKey(REFERRER_ID)).creditsRemaining, 2, "legacy clawback applied once");
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

test("item 4: outcome-put failure after grant confirmation replays bookkeeping only — no double aggregate", async () => {
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
    assert.equal(first.status, 503, "outcome persistence failure is retryable");
    assert.equal(data.get(referralRewardedKey(session.id)).phase, "grant_confirmed");
    assert.equal(data.get(referralKey(REFERRAL_CODE)).conversions, 0);

    const second = await postEvent(completedEvent("evt_outcome_fail_2", session));
    assert.equal(second.status, 200);
    const state = data.get(referralRewardedKey(session.id));
    assert.equal(state.phase, "completed");
    assert.equal(state.rewardGranted, 1);
    assert.equal(data.get(referralKey(REFERRAL_CODE)).conversions, 1, "aggregate applied exactly once");
    assert.equal(data.get(referralKey(REFERRAL_CODE)).rewardsGranted, 1);
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
