/**
 * consistencyCoordinator.test.mjs — T-SM-KVRACE (audit A2-1/A2-2/A2-3).
 *
 * Pins, per the S3-A fix design:
 * - A2-1 magic claim: consumption is committed by the per-token
 *   coordinator BEFORE a session can be issued; concurrent claims yield
 *   exactly one consumption; a late/stale legacy import can never clear
 *   consumed state; legacy used/expired/unbounded records fail closed.
 *   (Plus an in-test simulation of the LEGACY claim sequence showing it
 *   mints two sessions under the same interleaving — the defect.)
 * - A2-2 account index: concurrent purchases for one email both survive;
 *   legacy import is insert-if-absent and preserves live rows; the view
 *   is the latest 40 with deterministic ties; empty index reads null.
 * - A2-3 promotions: concurrent subscribes create exactly ONE coupon
 *   job and drive exactly one provider send; retries of an ambiguous
 *   attempt reuse the identical idempotency key + payload inside the
 *   provider's 24h window and block after it; an ambiguous outcome
 *   without an idempotency guarantee blocks immediately; coupon
 *   acceptance atomically creates the followup job; legacy sent markers
 *   suppress both sends; unsubscribe cancels pending jobs; the DO
 *   alarm recovers a job whose driver crashed before the send.
 * - Wiring: binding + migration exist, the worker exports the class,
 *   and the legacy KV write paths are gone from the three call sites.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);
register("./consistencyCoordinator.hooks.mjs", import.meta.url);

process.env.STARMAP_CONSISTENCY_COORDINATOR_LOCAL = "1";
process.env.STARMAP_KV_ALLOW_LOCAL = "1";
process.env.RESEND_API_KEY = "test-resend-key";
process.env.PROMOTION_EMAIL_FROM = "StarMapCo <promo@starmapco.com>";
delete process.env.SENDGRID_API_KEY;
delete process.env.PROMOTION_AUTOMATION_WEBHOOK_URL;

const stateLib = await import("../../src/lib/consistencyCoordinatorState.ts");
const { ConsistencyCoordinatorDO } = await import(
  "../../src/durable-objects/ConsistencyCoordinatorDO.ts"
);
const clientLib = await import("../../src/lib/consistencyCoordinator.ts");
const { drivePromotionJobs, unsubscribePromotionFlow } = await import(
  "../../src/lib/promotionCoordinator.ts"
);
const { kv } = await import("../../src/lib/kv.ts");
const { emailStateKey } = await import("../../src/lib/promotionSubscriptions.ts");
const {
  preparePromotionCouponPayload,
  preparePromotionFollowupPayload,
  getPromotionFollowupDelaySeconds,
  selectPromotionProvider,
} = await import("../../src/lib/promotions.ts");

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NOW = Date.UTC(2026, 9, 23, 19, 0, 0);
const TTL_MS = 15 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/* ------------------------------ fakes ------------------------------ */

class FakeSqlStorage {
  constructor(rows = new Map()) {
    this.rows = rows;
    this.failNextWrite = false;
  }

  exec(sql, ...params) {
    const head = sql.trimStart().slice(0, 6).toUpperCase();
    if (head.startsWith("CREATE")) return { toArray: () => [] };
    if (head.startsWith("SELECT")) {
      const row = this.rows.get(params[0]);
      return { toArray: () => (row ? [row] : []) };
    }
    if (head.startsWith("INSERT")) {
      if (this.failNextWrite) {
        this.failNextWrite = false;
        throw new Error("injected storage failure");
      }
      const [objectId, stateJson, updatedAt] = params;
      this.rows.set(objectId, {
        object_id: objectId,
        state_json: stateJson,
        updated_at: updatedAt,
      });
      return { toArray: () => [] };
    }
    throw new Error(`unexpected SQL in fake: ${sql.slice(0, 80)}`);
  }
}

function fakeCtx(sql, name) {
  let alarmAt = null;
  return {
    id: { name },
    storage: {
      sql,
      async getAlarm() {
        return alarmAt;
      },
      async setAlarm(t) {
        alarmAt = t;
      },
      async deleteAlarm() {
        alarmAt = null;
      },
    },
    blockConcurrencyWhile(fn) {
      return fn();
    },
  };
}

function newCoordinator(sql, name) {
  return new ConsistencyCoordinatorDO(fakeCtx(sql, name), {});
}

const okJson = (obj) => ({
  ok: true,
  status: 200,
  json: async () => obj,
  text: async () => JSON.stringify(obj),
  headers: { get: () => null },
});
const errResp = (status, text = "err") => ({
  ok: false,
  status,
  json: async () => ({}),
  text: async () => text,
  headers: { get: () => null },
});

/** Install a fetch stub that only tolerates Resend calls. Returns the
 *  recorded calls: { url, headers, rawBody, body }. */
function installFetchFake(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    assert.ok(u.startsWith("https://api.resend.com/"), `unexpected fetch: ${u}`);
    const call = { url: u, headers: init.headers, rawBody: init.body, body: JSON.parse(init.body) };
    calls.push(call);
    return handler(call, calls);
  };
  return calls;
}

function barrier(parties) {
  let arrived = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  return async () => {
    arrived += 1;
    if (arrived >= parties) release();
    await gate;
  };
}

const legacyMagic = (over = {}) => ({
  email: "buyer@example.com",
  emailHash: "hash-buyer",
  createdAt: NOW - 60_000,
  ...over,
});

const sessionItem = (sessionId, createdAt, over = {}) => ({ sessionId, createdAt, ...over });

/* ------------------------------ A2-1 ------------------------------ */

test("A2-1 legacy claim sequence mints two sessions under concurrency (the defect)", async () => {
  // Faithful simulation of the pre-fix claim route: read usedAt, check,
  // mint, then write usedAt — with both readers released together.
  const store = new Map([["tok", legacyMagic()]]);
  const sessions = [];
  const gate = barrier(2);
  const legacyClaim = async () => {
    const magic = store.get("tok");
    if (!magic?.email || magic.usedAt) return "invalid";
    await gate();
    sessions.push(crypto.randomUUID());
    store.set("tok", { ...magic, usedAt: Date.now() });
    return "ok";
  };
  const results = await Promise.all([legacyClaim(), legacyClaim()]);
  assert.deepEqual(results, ["ok", "ok"]);
  assert.equal(sessions.length, 2, "legacy sequence double-mints: this is A2-1");
});

test("A2-1 concurrent claims issue exactly one consumption", async () => {
  const sql = new FakeSqlStorage();
  const coord = newCoordinator(sql, "magic:v1:tok-a");
  const input = { legacyRecord: legacyMagic(), legacyTtlMs: TTL_MS, now: NOW };
  const [r1, r2] = await Promise.all([coord.consumeMagicToken(input), coord.consumeMagicToken(input)]);
  const statuses = [r1.status, r2.status].sort();
  assert.deepEqual(statuses, ["already_consumed", "consumed"]);
});

test("A2-1 registered token: consume once, DO state alone decides afterwards", async () => {
  const sql = new FakeSqlStorage();
  const coord = newCoordinator(sql, "magic:v1:tok-b");
  await coord.registerMagicToken({
    email: "buyer@example.com",
    emailHash: "hash-buyer",
    expiresAt: NOW + TTL_MS,
    now: NOW,
  });
  const first = await coord.consumeMagicToken({ legacyRecord: null, legacyTtlMs: TTL_MS, now: NOW });
  assert.equal(first.status, "consumed");
  // No legacy record on the retry (a stale KV read): still consumed.
  const retry = await coord.consumeMagicToken({ legacyRecord: null, legacyTtlMs: TTL_MS, now: NOW });
  assert.equal(retry.status, "already_consumed");
});

test("A2-1 late import cannot clear consumed state", async () => {
  const sql = new FakeSqlStorage();
  const coord = newCoordinator(sql, "magic:v1:tok-c");
  const first = await coord.consumeMagicToken({
    legacyRecord: legacyMagic(),
    legacyTtlMs: TTL_MS,
    now: NOW,
  });
  assert.equal(first.status, "consumed");
  // A stale legacy snapshot (no usedAt) arriving afterwards must not
  // resurrect the token.
  const again = await coord.consumeMagicToken({
    legacyRecord: legacyMagic(),
    legacyTtlMs: TTL_MS,
    now: NOW + 1000,
  });
  assert.equal(again.status, "already_consumed");
});

test("A2-1 legacy consumed marker is honoured (monotone merge adds consumption)", async () => {
  const sql = new FakeSqlStorage();
  const coord = newCoordinator(sql, "magic:v1:tok-d");
  await coord.registerMagicToken({
    email: "buyer@example.com",
    emailHash: "hash-buyer",
    expiresAt: NOW + TTL_MS,
    now: NOW,
  });
  // A pre-cutover claim consumed the token during the deploy overlap;
  // its usedAt reaches the coordinator as an import fact.
  const result = await coord.consumeMagicToken({
    legacyRecord: legacyMagic({ usedAt: NOW + 500 }),
    legacyTtlMs: TTL_MS,
    now: NOW + 1000,
  });
  assert.equal(result.status, "already_consumed");
});

test("A2-1 legacy used token is rejected", async () => {
  const coord = newCoordinator(new FakeSqlStorage(), "magic:v1:tok-e");
  const result = await coord.consumeMagicToken({
    legacyRecord: legacyMagic({ usedAt: NOW - 1000 }),
    legacyTtlMs: TTL_MS,
    now: NOW,
  });
  assert.equal(result.status, "already_consumed");
});

test("A2-1 expired legacy token is rejected even if KV returns it", async () => {
  const coord = newCoordinator(new FakeSqlStorage(), "magic:v1:tok-f");
  const result = await coord.consumeMagicToken({
    legacyRecord: legacyMagic({ createdAt: NOW - 2 * TTL_MS }),
    legacyTtlMs: TTL_MS,
    now: NOW,
  });
  assert.equal(result.status, "expired");
});

test("A2-1 legacy record without a bounded expiry is never imported", async () => {
  const coord = newCoordinator(new FakeSqlStorage(), "magic:v1:tok-g");
  const noCreatedAt = legacyMagic();
  delete noCreatedAt.createdAt;
  const result = await coord.consumeMagicToken({
    legacyRecord: noCreatedAt,
    legacyTtlMs: TTL_MS,
    now: NOW,
  });
  assert.equal(result.status, "unknown");
});

test("A2-1 unknown token stays unknown; state survives a restart", async () => {
  const sql = new FakeSqlStorage();
  const coord = newCoordinator(sql, "magic:v1:tok-h");
  const miss = await coord.consumeMagicToken({ legacyRecord: null, legacyTtlMs: TTL_MS, now: NOW });
  assert.equal(miss.status, "unknown");
  await coord.registerMagicToken({
    email: "buyer@example.com",
    emailHash: "hash-buyer",
    expiresAt: NOW + TTL_MS,
    now: NOW,
  });
  await coord.consumeMagicToken({ legacyRecord: null, legacyTtlMs: TTL_MS, now: NOW });
  const restarted = newCoordinator(sql, "magic:v1:tok-h");
  const after = await restarted.consumeMagicToken({
    legacyRecord: null,
    legacyTtlMs: TTL_MS,
    now: NOW,
  });
  assert.equal(after.status, "already_consumed");
});

/* ------------------------------ A2-2 ------------------------------ */

test("A2-2 concurrent distinct purchases both survive", async () => {
  const coord = newCoordinator(new FakeSqlStorage(), "account:v1:hash-buyer");
  const base = { emailHash: "hash-buyer", legacySessions: [], legacyUpdatedAt: NOW - 1000 };
  const [a, b] = await Promise.all([
    coord.upsertAccountSession({ ...base, session: sessionItem("cs_a", NOW - 10), now: NOW }),
    coord.upsertAccountSession({ ...base, session: sessionItem("cs_b", NOW - 5), now: NOW }),
  ]);
  const ids = new Set([...(a.view?.sessions ?? []), ...(b.view?.sessions ?? [])].map((s) => s.sessionId));
  const { view } = await coord.getAccountSessions({
    emailHash: "hash-buyer",
    legacySessions: null,
    legacyUpdatedAt: null,
  });
  assert.deepEqual(
    (view?.sessions ?? []).map((s) => s.sessionId).sort(),
    ["cs_a", "cs_b"],
  );
  assert.ok(ids.has("cs_a") && ids.has("cs_b"));
});

test("A2-2 legacy import preserves a live session (insert-if-absent)", async () => {
  const coord = newCoordinator(new FakeSqlStorage(), "account:v1:hash-imp");
  await coord.upsertAccountSession({
    emailHash: "hash-imp",
    session: sessionItem("cs_live", NOW),
    legacySessions: null,
    legacyUpdatedAt: null,
    now: NOW,
  });
  const { view } = await coord.getAccountSessions({
    emailHash: "hash-imp",
    legacySessions: [sessionItem("cs_old", NOW - 5000), sessionItem("cs_live", NOW - 9999)],
    legacyUpdatedAt: NOW - 4000,
  });
  assert.deepEqual(
    (view?.sessions ?? []).map((s) => s.sessionId),
    ["cs_live", "cs_old"],
    "import adds the missing row and never overwrites the live one",
  );
});

test("A2-2 repeated upsert of one session keeps one row (replacement wins)", async () => {
  const coord = newCoordinator(new FakeSqlStorage(), "account:v1:hash-rep");
  const input = {
    emailHash: "hash-rep",
    legacySessions: null,
    legacyUpdatedAt: null,
    now: NOW,
  };
  await coord.upsertAccountSession({ ...input, session: sessionItem("cs_x", NOW, { amountTotal: 100 }) });
  const { view } = await coord.upsertAccountSession({
    ...input,
    session: sessionItem("cs_x", NOW, { amountTotal: 200 }),
  });
  assert.equal(view?.sessions.length, 1);
  assert.equal(view?.sessions[0].amountTotal, 200);
});

test("A2-2 listing returns the latest 40 with deterministic ties", async () => {
  const coord = newCoordinator(new FakeSqlStorage(), "account:v1:hash-many");
  for (let i = 0; i < 45; i += 1) {
    await coord.upsertAccountSession({
      emailHash: "hash-many",
      session: sessionItem(`cs_${String(i).padStart(2, "0")}`, NOW),
      legacySessions: null,
      legacyUpdatedAt: null,
      now: NOW,
    });
  }
  const first = await coord.getAccountSessions({
    emailHash: "hash-many",
    legacySessions: null,
    legacyUpdatedAt: null,
  });
  const second = await coord.getAccountSessions({
    emailHash: "hash-many",
    legacySessions: null,
    legacyUpdatedAt: null,
  });
  assert.equal(first.view?.sessions.length, 40);
  assert.deepEqual(
    first.view?.sessions.map((s) => s.sessionId),
    second.view?.sessions.map((s) => s.sessionId),
    "tie order (sessionId desc) is stable across reads",
  );
  assert.equal(first.view?.sessions[0].sessionId, "cs_44");
});

test("A2-2 empty email index returns null", async () => {
  const coord = newCoordinator(new FakeSqlStorage(), "account:v1:hash-none");
  const { view } = await coord.getAccountSessions({
    emailHash: "hash-none",
    legacySessions: null,
    legacyUpdatedAt: null,
  });
  assert.equal(view, null);
});

/* ------------------------------ A2-3 ------------------------------ */

const noFacts = {
  state: null,
  inLegacySubscriptionList: null,
  inLegacySentList: null,
  inLegacyFollowupList: null,
};

function freshClient() {
  clientLib.__resetConsistencyCoordinatorMemoryForTests();
  return clientLib.createConsistencyCoordinatorClient();
}

async function subscribeViaClient(client, email, over = {}) {
  const emailHash = clientLib.coordinatorEmailHash(email);
  const name = clientLib.promotionCoordinatorName(emailHash);
  const result = await client.subscribePromotion(name, {
    emailHash,
    source: "test",
    now: Date.now(),
    facts: noFacts,
    couponPayload: preparePromotionCouponPayload(email, "FIRST50"),
    ...over,
  });
  return { name, emailHash, ...result };
}

test("A2-3 concurrent subscribes create one job and send exactly one coupon", async () => {
  const calls = installFetchFake(async () => okJson({ id: "email_1" }));
  const client = freshClient();
  const email = "promo@example.com";
  const emailHash = clientLib.coordinatorEmailHash(email);
  const name = clientLib.promotionCoordinatorName(emailHash);

  const [s1, s2] = await Promise.all([
    subscribeViaClient(client, email),
    subscribeViaClient(client, email),
  ]);
  assert.notEqual(
    s1.isNewSubscriber,
    s2.isNewSubscriber,
    "exactly one of the concurrent subscribes is the new subscriber",
  );

  const state = await client.getPromotionState(name);
  assert.ok(state?.jobs.coupon, "exactly one coupon job object exists");
  assert.equal(state?.jobs.followup, undefined, "followup is created only on coupon acceptance");

  const [d1, d2] = await Promise.all([
    drivePromotionJobs(client, name, email),
    drivePromotionJobs(client, name, email),
  ]);
  const couponCalls = calls.filter((c) => !c.body.scheduled_at);
  const followupCalls = calls.filter((c) => Boolean(c.body.scheduled_at));
  assert.equal(couponCalls.length, 1, "the coupon email is sent exactly once");
  assert.equal(followupCalls.length, 1, "the followup is scheduled exactly once");
  assert.ok(d1.couponDelivered || d2.couponDelivered);
  assert.equal(
    couponCalls[0].headers["Idempotency-Key"],
    `promotion:v1:coupon:${emailHash}`,
    "the send carries the job's stable idempotency key",
  );
  const after = await client.getPromotionState(name);
  assert.equal(after?.jobs.coupon?.status, "accepted");
  assert.equal(after?.jobs.followup?.status, "accepted");
});

test("A2-3 ambiguous retry reuses the identical key and payload inside the window", async () => {
  let attempt = 0;
  const calls = installFetchFake(async () => {
    attempt += 1;
    return attempt === 1 ? errResp(500, "boom") : okJson({ id: "email_retry" });
  });
  const client = freshClient();
  const email = "retry@example.com";
  const { name } = await subscribeViaClient(client, email);

  const drive1 = await drivePromotionJobs(client, name, email);
  assert.equal(drive1.couponDelivered, false);
  let state = await client.getPromotionState(name);
  assert.equal(state?.jobs.coupon?.status, "pending", "ambiguous + guaranteed = retryable pending");
  const firstAttemptAt = state?.jobs.coupon?.firstAttemptAt;
  assert.ok(firstAttemptAt);

  // Inside the window, past the backoff: claim and deliver manually
  // with the job's frozen payload + key (what the alarm does).
  const { claim } = await client.claimPromotionJob(name, {
    kind: "coupon",
    now: firstAttemptAt + stateLib.PROMOTION_JOB_RETRY_DELAY_MS + 1000,
  });
  assert.ok(claim, "job is claimable again after the backoff");
  const { deliverPromotionSend } = await import("../../src/lib/promotions.ts");
  const delivery = await deliverPromotionSend(claim.payload, claim.providerIdempotencyKey);
  assert.equal(delivery.outcome, "accepted");
  const completedAt = Date.now();
  await client.completePromotionJob(name, {
    kind: "coupon",
    outcome: { type: "accepted", provider: "resend", providerMessageId: "email_retry" },
    now: completedAt,
    // The caller contract (driver + DO alarm both do this): acceptance
    // creates the followup atomically from a payload prepared here.
    followupPayload: preparePromotionFollowupPayload(
      email,
      "FIRST50",
      new Date(completedAt + getPromotionFollowupDelaySeconds() * 1000).toISOString(),
    ),
  });

  assert.equal(calls.length, 2);
  assert.equal(
    calls[0].headers["Idempotency-Key"],
    calls[1].headers["Idempotency-Key"],
    "identical idempotency key across the retry",
  );
  assert.equal(calls[0].rawBody, calls[1].rawBody, "identical payload bytes across the retry");
  state = await client.getPromotionState(name);
  assert.equal(state?.jobs.coupon?.status, "accepted");
  assert.ok(state?.jobs.followup, "coupon acceptance created the followup job atomically");
});

test("A2-3 lost acceptance response: provider dedupe keeps it one send", async () => {
  // Provider fake with a real idempotency memory: a key accepted once
  // replays the original response without counting a new send.
  const acceptedKeys = new Map();
  let sends = 0;
  installFetchFake(async (call) => {
    const key = call.headers["Idempotency-Key"];
    if (acceptedKeys.has(key)) return okJson({ id: acceptedKeys.get(key) });
    sends += 1;
    acceptedKeys.set(key, "email_once");
    // The send happened but the response is lost (HTTP 500 surface) —
    // the driver can only record an ambiguous outcome.
    return errResp(500, "response lost");
  });
  const client = freshClient();
  const email = "lost@example.com";
  const { name } = await subscribeViaClient(client, email);
  await drivePromotionJobs(client, name, email);
  let state = await client.getPromotionState(name);
  const firstAttemptAt = state?.jobs.coupon?.firstAttemptAt;
  const { claim } = await client.claimPromotionJob(name, {
    kind: "coupon",
    now: firstAttemptAt + stateLib.PROMOTION_JOB_RETRY_DELAY_MS + 1000,
  });
  assert.ok(claim);
  const { deliverPromotionSend } = await import("../../src/lib/promotions.ts");
  const replay = await deliverPromotionSend(claim.payload, claim.providerIdempotencyKey);
  assert.equal(replay.outcome, "accepted");
  assert.equal(replay.providerMessageId, "email_once");
  assert.equal(sends, 1, "the provider sent once despite two submissions");
});

test("A2-3 ambiguous retry after the idempotency window blocks instead of resending", async () => {
  const client = freshClient();
  const email = "window@example.com";
  const { name } = await subscribeViaClient(client, email);
  const t0 = Date.now();
  const { claim } = await client.claimPromotionJob(name, { kind: "coupon", now: t0 });
  assert.ok(claim);
  await client.completePromotionJob(name, {
    kind: "coupon",
    outcome: { type: "ambiguous", provider: "resend", idempotencyGuaranteed: true },
    now: t0,
  });
  const late = await client.claimPromotionJob(name, {
    kind: "coupon",
    now: t0 + stateLib.PROVIDER_IDEMPOTENCY_WINDOW_MS + 1000,
  });
  assert.equal(late.claim, null);
  const state = await client.getPromotionState(name);
  assert.equal(state?.jobs.coupon?.status, "blocked");
});

test("A2-3 ambiguous outcome without an idempotency guarantee blocks immediately", async () => {
  const client = freshClient();
  const email = "noguarantee@example.com";
  const { name } = await subscribeViaClient(client, email);
  const { claim } = await client.claimPromotionJob(name, { kind: "coupon", now: Date.now() });
  assert.ok(claim);
  await client.completePromotionJob(name, {
    kind: "coupon",
    outcome: { type: "ambiguous", provider: "sendgrid", idempotencyGuaranteed: false },
    now: Date.now(),
  });
  const state = await client.getPromotionState(name);
  assert.equal(state?.jobs.coupon?.status, "blocked");
});

test("A2-3 legacy sent markers suppress both sends", async () => {
  const calls = installFetchFake(async () => okJson({ id: "should_not_happen" }));
  const client = freshClient();
  const email = "legacy@example.com";
  const emailHash = clientLib.coordinatorEmailHash(email);
  const name = clientLib.promotionCoordinatorName(emailHash);
  await client.subscribePromotion(name, {
    emailHash,
    source: "test",
    now: Date.now(),
    facts: {
      state: {
        subscribedAt: NOW - 30 * 24 * HOUR,
        couponSentAt: NOW - 29 * 24 * HOUR,
        followupSentAt: NOW - 28 * 24 * HOUR,
        updatedAt: NOW - 28 * 24 * HOUR,
      },
      inLegacySubscriptionList: null,
      inLegacySentList: null,
      inLegacyFollowupList: null,
    },
    couponPayload: preparePromotionCouponPayload(email, "FIRST50"),
  });
  const drive = await drivePromotionJobs(client, name, email);
  assert.equal(calls.length, 0, "no provider call for legacy-accepted jobs");
  assert.equal(drive.couponDelivered, true);
  const state = await client.getPromotionState(name);
  assert.equal(state?.jobs.coupon?.provider, "legacy");
  assert.equal(state?.jobs.followup?.status, "accepted");
});

test("A2-3 late legacy import cannot clear an acceptance", async () => {
  installFetchFake(async () => okJson({ id: "email_live" }));
  const client = freshClient();
  const email = "lateimport@example.com";
  const { name } = await subscribeViaClient(client, email);
  await drivePromotionJobs(client, name, email);
  let state = await client.getPromotionState(name);
  assert.equal(state?.jobs.coupon?.status, "accepted");
  // A stale fact set (markers absent) on a later subscribe changes nothing.
  await subscribeViaClient(client, email);
  state = await client.getPromotionState(name);
  assert.equal(state?.jobs.coupon?.status, "accepted");
  assert.equal(state?.jobs.coupon?.provider, "resend");
});

test("A2-3 unsubscribe cancels pending jobs; resubscribe revives them under the same job", async () => {
  const calls = installFetchFake(async () => okJson({ id: "email_back" }));
  const client = freshClient();
  const email = "unsub@example.com";
  const emailHash = clientLib.coordinatorEmailHash(email);
  const name = clientLib.promotionCoordinatorName(emailHash);
  await subscribeViaClient(client, email);

  const un = await client.unsubscribePromotion(name, {
    emailHash,
    now: Date.now(),
    reason: "email_link",
    facts: noFacts,
  });
  assert.equal(un.wasAlreadyUnsubscribed, false);
  let state = await client.getPromotionState(name);
  assert.equal(state?.jobs.coupon?.status, "cancelled");
  const driveWhileUnsubbed = await drivePromotionJobs(client, name, email);
  assert.equal(calls.length, 0, "a cancelled job is never driven");
  assert.equal(driveWhileUnsubbed.couponDelivered, false);

  const un2 = await client.unsubscribePromotion(name, {
    emailHash,
    now: Date.now() + 1000,
    reason: "email_link",
    facts: noFacts,
  });
  assert.equal(un2.wasAlreadyUnsubscribed, true, "repeat unsubscribe is a no-op");

  const re = await subscribeViaClient(client, email);
  assert.equal(re.isNewSubscriber, false);
  state = await client.getPromotionState(name);
  assert.equal(state?.jobs.coupon?.status, "pending");
  assert.equal(state?.unsubscribedAt, null);
  const drive = await drivePromotionJobs(client, name, email);
  assert.equal(drive.couponDelivered, true);
  assert.equal(calls.filter((c) => !c.body.scheduled_at).length, 1);
});

test("A2-3 DO alarm recovers a job whose driver crashed before the send", async () => {
  const calls = installFetchFake(async () => okJson({ id: "email_alarm" }));
  const sql = new FakeSqlStorage();
  const name = "promotion:v1:hash-alarm";
  const coord = newCoordinator(sql, name);
  const emailHash = "hash-alarm";
  await coord.subscribePromotion({
    emailHash,
    source: "test",
    now: NOW,
    facts: noFacts,
    couponPayload: preparePromotionCouponPayload("alarm@example.com", "FIRST50"),
  });
  // Driver claims the job, then crashes: no completion is recorded.
  const { claim } = await coord.claimPromotionJob({ kind: "coupon", now: NOW });
  assert.ok(claim);
  // The claim is now stale (the DO clamps alarm state to real time via
  // Date.now() in syncAlarm; the op-level times are what matter here).
  const restarted = newCoordinator(sql, name);
  const before = await restarted.getPromotionState();
  assert.equal(before?.jobs.coupon?.status, "attempting");

  // Simulate the stale-claim alarm by driving the pure alarm op through
  // a fresh claim cycle: expire via complete-ambiguous is NOT what
  // happened — instead verify syncAlarm armed an alarm and the state
  // machine reclaims stale claims.
  const reclaimed = stateLib.applyPromotionAlarm(before, {
    now: NOW + stateLib.PROMOTION_JOB_ATTEMPT_STALE_MS + 1000,
  });
  assert.equal(reclaimed.state.jobs.coupon?.status, "pending");
  assert.deepEqual(reclaimed.dueKinds, ["coupon"]);

  // Full DO alarm with a due (pending, backoff-elapsed) job delivers it.
  const sql2 = new FakeSqlStorage();
  const coord2 = newCoordinator(sql2, "promotion:v1:hash-alarm2");
  await coord2.subscribePromotion({
    emailHash: "hash-alarm2",
    source: "test",
    now: Date.now(),
    facts: noFacts,
    couponPayload: preparePromotionCouponPayload("alarm2@example.com", "FIRST50"),
  });
  await coord2.alarm();
  const after = await coord2.getPromotionState();
  assert.equal(after?.jobs.coupon?.status, "accepted");
  assert.equal(after?.jobs.followup?.status, "accepted");
  assert.equal(calls.length, 2, "alarm delivered the coupon and scheduled the followup");
});

test("A2-3 definitive failure is terminal for the drive but recorded", async () => {
  installFetchFake(async () => errResp(422, "invalid recipient"));
  const client = freshClient();
  const email = "bad@example.com";
  const { name } = await subscribeViaClient(client, email);
  const drive = await drivePromotionJobs(client, name, email);
  assert.equal(drive.couponDelivered, false);
  assert.equal(drive.couponProvider, "resend");
  const state = await client.getPromotionState(name);
  assert.equal(state?.jobs.coupon?.status, "failed");
  assert.match(state?.jobs.coupon?.lastError ?? "", /resend_http_422/);
});

/* ------------- A2-3 gate fix round 1 (Codex findings) ------------- */

function saveEnv() {
  return {
    resend: process.env.RESEND_API_KEY,
    sendgrid: process.env.SENDGRID_API_KEY,
    webhook: process.env.PROMOTION_AUTOMATION_WEBHOOK_URL,
  };
}

function restoreEnv(saved) {
  if (saved.resend === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = saved.resend;
  if (saved.sendgrid === undefined) delete process.env.SENDGRID_API_KEY;
  else process.env.SENDGRID_API_KEY = saved.sendgrid;
  if (saved.webhook === undefined) delete process.env.PROMOTION_AUTOMATION_WEBHOOK_URL;
  else process.env.PROMOTION_AUTOMATION_WEBHOOK_URL = saved.webhook;
}

function setProviderEnv({ resend = false, sendgrid = false, webhook = false }) {
  if (resend) process.env.RESEND_API_KEY = "test-resend-key";
  else delete process.env.RESEND_API_KEY;
  if (sendgrid) process.env.SENDGRID_API_KEY = "test-sendgrid-key";
  else delete process.env.SENDGRID_API_KEY;
  if (webhook) process.env.PROMOTION_AUTOMATION_WEBHOOK_URL = "https://example.invalid/hook";
  else delete process.env.PROMOTION_AUTOMATION_WEBHOOK_URL;
}

function subscribedState(emailHash, now) {
  return stateLib.applySubscribePromotion(null, {
    emailHash,
    source: "test",
    now,
    facts: noFacts,
    couponPayload: preparePromotionCouponPayload("pure@example.com", "FIRST50"),
  }).state;
}

test("A2-3 provider selection mirrors the delivery chain order and guarantees", () => {
  const saved = saveEnv();
  try {
    setProviderEnv({ resend: true, sendgrid: true, webhook: true });
    assert.deepEqual(selectPromotionProvider(), {
      provider: "resend",
      idempotencyGuaranteed: true,
    });
    setProviderEnv({ sendgrid: true, webhook: true });
    assert.deepEqual(selectPromotionProvider(), {
      provider: "sendgrid",
      idempotencyGuaranteed: false,
    });
    setProviderEnv({ webhook: true });
    assert.deepEqual(selectPromotionProvider(), {
      provider: "webhook",
      idempotencyGuaranteed: false,
    });
    setProviderEnv({});
    assert.equal(selectPromotionProvider(), null);
  } finally {
    restoreEnv(saved);
  }
});

test("A2-3 stale claim on a provider without an idempotency guarantee blocks instead of resending", () => {
  const t0 = NOW;
  const state = subscribedState("hash-stale-sg", t0);
  const claimed = stateLib.applyClaimPromotionJob(state, {
    kind: "coupon",
    now: t0,
    attemptProvider: "sendgrid",
    attemptIdempotencyGuaranteed: false,
  });
  assert.ok(claimed.claim);
  assert.equal(
    claimed.state.jobs.coupon?.attemptProvider,
    "sendgrid",
    "the claim stamps the selected provider before any provider call",
  );
  assert.equal(claimed.state.jobs.coupon?.attemptIdempotencyGuaranteed, false);
  // The driver dies after SendGrid accepted but before recording the
  // completion: the attempt's outcome is uncertain and SendGrid has no
  // idempotency guarantee to make a retry safe.
  const alarmed = stateLib.applyPromotionAlarm(claimed.state, {
    now: t0 + stateLib.PROMOTION_JOB_ATTEMPT_STALE_MS + 1000,
  });
  assert.equal(
    alarmed.state.jobs.coupon?.status,
    "blocked",
    "an uncertain attempt without a guarantee is never made retryable",
  );
  assert.deepEqual(alarmed.dueKinds, []);
  const reclaim = stateLib.applyClaimPromotionJob(alarmed.state, {
    kind: "coupon",
    now: t0 + stateLib.PROMOTION_JOB_ATTEMPT_STALE_MS + 2000,
  });
  assert.equal(reclaim.claim, null);
});

test("A2-3 stale claim with an unrecorded guarantee blocks (fail closed)", () => {
  const t0 = NOW;
  const state = subscribedState("hash-stale-unknown", t0);
  const claimed = stateLib.applyClaimPromotionJob(state, { kind: "coupon", now: t0 });
  assert.ok(claimed.claim);
  const alarmed = stateLib.applyPromotionAlarm(claimed.state, {
    now: t0 + stateLib.PROMOTION_JOB_ATTEMPT_STALE_MS + 1000,
  });
  assert.equal(alarmed.state.jobs.coupon?.status, "blocked");
  assert.deepEqual(alarmed.dueKinds, []);
});

test("A2-3 stale claim under Resend's guarantee reclaims to a retry and clears the stamp", () => {
  const t0 = NOW;
  const state = subscribedState("hash-stale-rs", t0);
  const claimed = stateLib.applyClaimPromotionJob(state, {
    kind: "coupon",
    now: t0,
    attemptProvider: "resend",
    attemptIdempotencyGuaranteed: true,
  });
  assert.ok(claimed.claim);
  const alarmed = stateLib.applyPromotionAlarm(claimed.state, {
    now: t0 + stateLib.PROMOTION_JOB_ATTEMPT_STALE_MS + 1000,
  });
  assert.equal(alarmed.state.jobs.coupon?.status, "pending");
  assert.deepEqual(alarmed.dueKinds, ["coupon"]);
  assert.equal(alarmed.state.jobs.coupon?.attemptProvider, null);
  assert.equal(alarmed.state.jobs.coupon?.attemptIdempotencyGuaranteed, null);
});

test("A2-3 DO claim stamps the selected provider; the reclaim honours its guarantee", async () => {
  const saved = saveEnv();
  try {
    // SendGrid is the only configured provider: no idempotency guarantee.
    setProviderEnv({ sendgrid: true });
    const coordSg = newCoordinator(new FakeSqlStorage(), "promotion:v1:hash-stamp-sg");
    await coordSg.subscribePromotion({
      emailHash: "hash-stamp-sg",
      source: "test",
      now: NOW,
      facts: noFacts,
      couponPayload: preparePromotionCouponPayload("sg@example.com", "FIRST50"),
    });
    const { claim } = await coordSg.claimPromotionJob({ kind: "coupon", now: NOW });
    assert.ok(claim);
    const attempting = await coordSg.getPromotionState();
    assert.equal(attempting?.jobs.coupon?.attemptProvider, "sendgrid");
    assert.equal(attempting?.jobs.coupon?.attemptIdempotencyGuaranteed, false);
    // Driver dies mid-attempt; the stale-claim reclaim must block, not resend.
    const reclaimed = stateLib.applyPromotionAlarm(attempting, {
      now: NOW + stateLib.PROMOTION_JOB_ATTEMPT_STALE_MS + 1000,
    });
    assert.equal(reclaimed.state.jobs.coupon?.status, "blocked");
    assert.deepEqual(reclaimed.dueKinds, []);

    // Resend selected: its 24h guarantee covers the reclaim.
    setProviderEnv({ resend: true });
    const coordRs = newCoordinator(new FakeSqlStorage(), "promotion:v1:hash-stamp-rs");
    await coordRs.subscribePromotion({
      emailHash: "hash-stamp-rs",
      source: "test",
      now: NOW,
      facts: noFacts,
      couponPayload: preparePromotionCouponPayload("rs@example.com", "FIRST50"),
    });
    await coordRs.claimPromotionJob({ kind: "coupon", now: NOW });
    const attemptingRs = await coordRs.getPromotionState();
    assert.equal(attemptingRs?.jobs.coupon?.attemptProvider, "resend");
    assert.equal(attemptingRs?.jobs.coupon?.attemptIdempotencyGuaranteed, true);
    const reclaimedRs = stateLib.applyPromotionAlarm(attemptingRs, {
      now: NOW + stateLib.PROMOTION_JOB_ATTEMPT_STALE_MS + 1000,
    });
    assert.equal(reclaimedRs.state.jobs.coupon?.status, "pending");
    assert.deepEqual(reclaimedRs.dueKinds, ["coupon"]);
  } finally {
    restoreEnv(saved);
  }
});

test("A2-3 late coupon acceptance after an unsubscribe creates no followup", async () => {
  const calls = installFetchFake(async () => okJson({ id: "should_not_send" }));
  const client = freshClient();
  const email = "lateaccept@example.com";
  const emailHash = clientLib.coordinatorEmailHash(email);
  const name = clientLib.promotionCoordinatorName(emailHash);
  await subscribeViaClient(client, email);
  const { claim } = await client.claimPromotionJob(name, { kind: "coupon", now: Date.now() });
  assert.ok(claim);
  // The user opts out while the coupon send is in flight.
  await client.unsubscribePromotion(name, {
    emailHash,
    now: Date.now(),
    reason: "email_link",
    facts: noFacts,
  });
  let state = await client.getPromotionState(name);
  assert.ok(state?.unsubscribedAt, "unsubscribe landed mid-attempt");
  assert.equal(state?.jobs.coupon?.status, "attempting", "the in-flight job is left alone");
  // The send then completes as accepted.
  const completedAt = Date.now();
  const { state: after } = await client.completePromotionJob(name, {
    kind: "coupon",
    outcome: { type: "accepted", provider: "resend", providerMessageId: "email_late" },
    now: completedAt,
    followupPayload: preparePromotionFollowupPayload(
      email,
      "FIRST50",
      new Date(completedAt + getPromotionFollowupDelaySeconds() * 1000).toISOString(),
    ),
  });
  assert.equal(after?.jobs.coupon?.status, "accepted", "the completed send is recorded truthfully");
  assert.equal(
    after?.jobs.followup,
    undefined,
    "no followup is scheduled for an opted-out account",
  );
  const drive = await drivePromotionJobs(client, name, email);
  assert.equal(calls.length, 0, "nothing further is delivered");
  assert.equal(drive.couponDelivered, true);
  state = await client.getPromotionState(name);
  assert.ok(state?.unsubscribedAt, "the opt-out stands");
});

test("A2-3 ambiguous completion after an unsubscribe cancels instead of restoring a retry", async () => {
  installFetchFake(async () => okJson({ id: "unused" }));
  const client = freshClient();
  const email = "lateambiguous@example.com";
  const emailHash = clientLib.coordinatorEmailHash(email);
  const name = clientLib.promotionCoordinatorName(emailHash);
  await subscribeViaClient(client, email);
  const { claim } = await client.claimPromotionJob(name, { kind: "coupon", now: Date.now() });
  assert.ok(claim);
  await client.unsubscribePromotion(name, {
    emailHash,
    now: Date.now(),
    reason: "email_link",
    facts: noFacts,
  });
  const { state: after } = await client.completePromotionJob(name, {
    kind: "coupon",
    outcome: { type: "ambiguous", provider: "resend", idempotencyGuaranteed: true, error: "timeout" },
    now: Date.now(),
  });
  assert.equal(
    after?.jobs.coupon?.status,
    "cancelled",
    "a late ambiguous completion must not restore a deliverable retry for an opted-out account",
  );
  assert.equal(after?.jobs.coupon?.nextAttemptAt, null);
  const alarmed = stateLib.applyPromotionAlarm(after, { now: Date.now() + 60 * 60 * 1000 });
  assert.deepEqual(alarmed.dueKinds, []);
  // Only a later explicit subscribe makes the job eligible again.
  await subscribeViaClient(client, email);
  const revived = await client.getPromotionState(name);
  assert.equal(revived?.jobs.coupon?.status, "pending");
  assert.equal(revived?.unsubscribedAt, null);
});

test("A2-3 imported coupon acceptance without a followup marker recovers the followup on subscribe", async () => {
  const calls = installFetchFake(async () => okJson({ id: "email_followup_recovered" }));
  const client = freshClient();
  const email = "partial-legacy@example.com";
  const emailHash = clientLib.coordinatorEmailHash(email);
  const name = clientLib.promotionCoordinatorName(emailHash);
  const now = Date.now();
  const { state } = await client.subscribePromotion(name, {
    emailHash,
    source: "test",
    now,
    facts: {
      state: {
        subscribedAt: NOW - 30 * 24 * HOUR,
        couponSentAt: NOW - 29 * 24 * HOUR,
        updatedAt: NOW - 29 * 24 * HOUR,
      },
      inLegacySubscriptionList: null,
      inLegacySentList: null,
      inLegacyFollowupList: null,
    },
    couponPayload: preparePromotionCouponPayload(email, "FIRST50"),
    followupPayload: preparePromotionFollowupPayload(
      email,
      "FIRST50",
      new Date(now + getPromotionFollowupDelaySeconds() * 1000).toISOString(),
    ),
  });
  assert.equal(state.jobs.coupon?.status, "accepted");
  assert.equal(state.jobs.coupon?.provider, "legacy");
  assert.equal(
    state.jobs.followup?.status,
    "pending",
    "the missing followup is created so the drive can send it (the legacy route's recovery path)",
  );
  const drive = await drivePromotionJobs(client, name, email);
  assert.equal(drive.couponDelivered, true);
  assert.equal(calls.length, 1, "only the followup is sent — the coupon is never resent");
  assert.ok(calls[0].body.scheduled_at, "the single send is the scheduled followup");
  const after = await client.getPromotionState(name);
  assert.equal(after?.jobs.followup?.status, "accepted");
});

test("A2-3 legacy sent-list membership without a followup marker recovers the followup on subscribe", async () => {
  const calls = installFetchFake(async () => okJson({ id: "email_followup_list" }));
  const client = freshClient();
  const email = "partial-list@example.com";
  const emailHash = clientLib.coordinatorEmailHash(email);
  const name = clientLib.promotionCoordinatorName(emailHash);
  const now = Date.now();
  const { state } = await client.subscribePromotion(name, {
    emailHash,
    source: "test",
    now,
    facts: {
      state: null,
      inLegacySubscriptionList: true,
      inLegacySentList: true,
      inLegacyFollowupList: false,
    },
    couponPayload: preparePromotionCouponPayload(email, "FIRST50"),
    followupPayload: preparePromotionFollowupPayload(
      email,
      "FIRST50",
      new Date(now + getPromotionFollowupDelaySeconds() * 1000).toISOString(),
    ),
  });
  assert.equal(state.jobs.coupon?.status, "accepted");
  assert.equal(state.jobs.coupon?.provider, "legacy");
  assert.equal(state.jobs.followup?.status, "pending");
  await drivePromotionJobs(client, name, email);
  assert.equal(calls.length, 1, "only the followup is sent");
  assert.ok(calls[0].body.scheduled_at);
});

test("A2-3 DO alarm completion cannot erase a concurrent unsubscribe", async () => {
  let enteredSend;
  let releaseSend;
  const sendEntered = new Promise((resolve) => {
    enteredSend = resolve;
  });
  let blockFirstSend = true;
  const calls = installFetchFake(async () => {
    if (blockFirstSend) {
      blockFirstSend = false;
      enteredSend();
      await new Promise((resolve) => {
        releaseSend = resolve;
      });
    }
    return okJson({ id: "email_race" });
  });
  const sql = new FakeSqlStorage();
  const name = "promotion:v1:hash-race";
  const coord = newCoordinator(sql, name);
  await coord.subscribePromotion({
    emailHash: "hash-race",
    source: "test",
    now: Date.now(),
    facts: noFacts,
    couponPayload: preparePromotionCouponPayload("race@example.com", "FIRST50"),
  });
  const alarmRun = coord.alarm();
  await sendEntered; // the alarm is parked inside the provider call
  const un = await coord.unsubscribePromotion({
    emailHash: "hash-race",
    now: Date.now(),
    reason: "email_link",
    facts: noFacts,
  });
  assert.equal(un.wasAlreadyUnsubscribed, false);
  releaseSend();
  await alarmRun;
  const after = await coord.getPromotionState();
  assert.ok(
    after?.unsubscribedAt,
    "the unsubscribe committed during the provider call survives the alarm's completion",
  );
  assert.equal(after?.jobs.coupon?.status, "accepted");
  assert.equal(
    after?.jobs.followup,
    undefined,
    "the late completion schedules no followup for the opted-out account",
  );
  assert.equal(calls.length, 1, "only the in-flight coupon was sent");
});

/* ------------- A2-3 gate fix round 2 (Codex findings) ------------- */

test("A2-3 stale claim after an unsubscribe is cancelled by the alarm, never claimable", () => {
  const t0 = NOW;
  let state = subscribedState("hash-r2-unsub-stale", t0);
  const claimed = stateLib.applyClaimPromotionJob(state, {
    kind: "coupon",
    now: t0,
    attemptProvider: "resend",
    attemptIdempotencyGuaranteed: true,
  });
  assert.ok(claimed.claim);
  state = claimed.state;
  // The driver dies before submitting. The subscriber opts out while
  // the claim is in flight: unsubscribe cancels PENDING jobs only, so
  // the attempting job survives it — the crash-recovery path must not
  // resurrect it into a deliverable retry.
  const un = stateLib.applyUnsubscribePromotion(state, {
    emailHash: "hash-r2-unsub-stale",
    now: t0 + 1000,
    reason: "email_link",
    facts: noFacts,
  });
  state = un.state;
  assert.ok(state.unsubscribedAt);
  assert.equal(state.jobs.coupon?.status, "attempting");
  const alarmed = stateLib.applyPromotionAlarm(state, {
    now: t0 + stateLib.PROMOTION_JOB_ATTEMPT_STALE_MS + 2000,
  });
  assert.equal(
    alarmed.state.jobs.coupon?.status,
    "cancelled",
    "an opted-out stale claim is cancelled, not made retryable",
  );
  assert.deepEqual(alarmed.dueKinds, []);
  const reclaim = stateLib.applyClaimPromotionJob(alarmed.state, {
    kind: "coupon",
    now: t0 + stateLib.PROMOTION_JOB_ATTEMPT_STALE_MS + 3000,
    attemptProvider: "resend",
    attemptIdempotencyGuaranteed: true,
  });
  assert.equal(reclaim.claim, null, "a cancelled job is never claimable");
  // Only an explicit resubscribe re-arms the job, under the same job id.
  const re = stateLib.applySubscribePromotion(alarmed.state, {
    emailHash: "hash-r2-unsub-stale",
    source: "test",
    now: t0 + stateLib.PROMOTION_JOB_ATTEMPT_STALE_MS + 4000,
    facts: noFacts,
    couponPayload: preparePromotionCouponPayload("pure@example.com", "FIRST50"),
  });
  assert.equal(re.state.unsubscribedAt, null);
  assert.equal(re.state.jobs.coupon?.status, "pending");
});

test("A2-3 an opted-out account's pending job is never due and never claimable", () => {
  const t0 = NOW;
  const base = subscribedState("hash-r2-unsub-pending", t0);
  // A pending job coexisting with an opt-out should be unreachable
  // (unsubscribe cancels pending jobs); if state ever lands there, the
  // alarm's due set and the claim must still refuse to deliver it.
  const state = { ...base, unsubscribedAt: t0 + 1000, unsubscribeReason: "email_link" };
  const alarmed = stateLib.applyPromotionAlarm(state, { now: t0 + 2000 });
  assert.deepEqual(alarmed.dueKinds, [], "no kind is due on an opted-out account");
  const { claim, changed } = stateLib.applyClaimPromotionJob(state, {
    kind: "coupon",
    now: t0 + 2000,
    attemptProvider: "resend",
    attemptIdempotencyGuaranteed: true,
  });
  assert.equal(claim, null, "no claim is granted on an opted-out account");
  assert.equal(changed, false);
});

test("A2-3 DO alarm never sends to a subscriber who opted out during a crashed attempt", async () => {
  const calls = installFetchFake(async () => okJson({ id: "should_not_send" }));
  const emailHash = "hash-r2-crash-unsub";
  const name = `promotion:v1:${emailHash}`;
  // Seed the object with a claim that went stale mid-flight: subscribed
  // and claimed ~15 minutes ago, unsubscribed while attempting.
  const tPast = Date.now() - stateLib.PROMOTION_JOB_ATTEMPT_STALE_MS - 5000;
  let seed = stateLib.applySubscribePromotion(null, {
    emailHash,
    source: "test",
    now: tPast,
    facts: noFacts,
    couponPayload: preparePromotionCouponPayload("crashunsub@example.com", "FIRST50"),
  }).state;
  seed = stateLib.applyClaimPromotionJob(seed, {
    kind: "coupon",
    now: tPast,
    attemptProvider: "resend",
    attemptIdempotencyGuaranteed: true,
  }).state;
  seed = stateLib.applyUnsubscribePromotion(seed, {
    emailHash,
    now: tPast + 1000,
    reason: "email_link",
    facts: noFacts,
  }).state;
  assert.equal(seed.jobs.coupon?.status, "attempting");
  const sql = new FakeSqlStorage();
  sql.rows.set(name, {
    object_id: name,
    state_json: JSON.stringify(seed),
    updated_at: tPast,
  });
  const coord = newCoordinator(sql, name);
  await coord.alarm();
  assert.equal(calls.length, 0, "the alarm sends nothing to the opted-out subscriber");
  const after = await coord.getPromotionState();
  assert.ok(after?.unsubscribedAt, "the opt-out stands");
  assert.equal(after?.jobs.coupon?.status, "cancelled");
});

test("A2-3 a retry claim under a different provider than the recorded one is refused", () => {
  const t0 = NOW;
  let state = subscribedState("hash-r2-pin", t0);
  const claimed = stateLib.applyClaimPromotionJob(state, {
    kind: "coupon",
    now: t0,
    attemptProvider: "resend",
    attemptIdempotencyGuaranteed: true,
  });
  assert.ok(claimed.claim);
  // Resend accepted the send but its response was lost: the job is
  // retryable, with resend recorded as the provider covering its key.
  const completed = stateLib.applyCompletePromotionJob(claimed.state, {
    kind: "coupon",
    now: t0 + 1000,
    outcome: {
      type: "ambiguous",
      provider: "resend",
      idempotencyGuaranteed: true,
      error: "response lost",
    },
  });
  state = completed.state;
  assert.equal(state.jobs.coupon?.status, "pending");
  assert.equal(state.jobs.coupon?.provider, "resend");
  const retryAt = state.jobs.coupon?.nextAttemptAt;
  assert.ok(retryAt);
  // Provider configuration changed before the retry: a claim under
  // SendGrid is refused — SendGrid cannot dedupe the Resend attempt.
  const refused = stateLib.applyClaimPromotionJob(state, {
    kind: "coupon",
    now: retryAt,
    attemptProvider: "sendgrid",
    attemptIdempotencyGuaranteed: false,
  });
  assert.equal(refused.claim, null, "no claim is granted under a different provider");
  assert.equal(refused.state.jobs.coupon?.status, "pending", "the job waits for its own provider");
  assert.equal(refused.state.jobs.coupon?.provider, "resend");
  assert.equal(refused.state.jobs.coupon?.lastError, "pinned_provider_unavailable");
  assert.ok(
    (refused.state.jobs.coupon?.nextAttemptAt ?? 0) > retryAt,
    "the refused claim backs the job off instead of spinning the alarm",
  );
  // A claim under the recorded provider still goes through, with the
  // job's identical idempotency key.
  const accepted = stateLib.applyClaimPromotionJob(refused.state, {
    kind: "coupon",
    now: refused.state.jobs.coupon?.nextAttemptAt ?? 0,
    attemptProvider: "resend",
    attemptIdempotencyGuaranteed: true,
  });
  assert.ok(accepted.claim, "a same-provider retry still works");
  assert.equal(accepted.claim?.providerIdempotencyKey, state.jobs.coupon?.providerIdempotencyKey);
});

test("A2-3 the reclaim preserves the provider record so a crashed attempt stays pinned", () => {
  const t0 = NOW;
  const state = subscribedState("hash-r2-pin-crash", t0);
  const claimed = stateLib.applyClaimPromotionJob(state, {
    kind: "coupon",
    now: t0,
    attemptProvider: "resend",
    attemptIdempotencyGuaranteed: true,
  });
  assert.ok(claimed.claim);
  // The driver dies mid-attempt; the alarm reclaims the job to a retry.
  const alarmed = stateLib.applyPromotionAlarm(claimed.state, {
    now: t0 + stateLib.PROMOTION_JOB_ATTEMPT_STALE_MS + 1000,
  });
  assert.equal(alarmed.state.jobs.coupon?.status, "pending");
  assert.equal(alarmed.state.jobs.coupon?.attemptProvider, null, "the in-flight stamp is cleared");
  assert.equal(
    alarmed.state.jobs.coupon?.provider,
    "resend",
    "the provider covering the uncertain attempt survives the reclaim",
  );
  const refused = stateLib.applyClaimPromotionJob(alarmed.state, {
    kind: "coupon",
    now: t0 + stateLib.PROMOTION_JOB_ATTEMPT_STALE_MS + 2000,
    attemptProvider: "sendgrid",
    attemptIdempotencyGuaranteed: false,
  });
  assert.equal(refused.claim, null, "the reclaimed job cannot be retried under another provider");
});

test("A2-3 driver never submits an uncertain retry through a different provider", async () => {
  const saved = saveEnv();
  const calls = [];
  let resendAttempts = 0;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const call = { url: u, headers: init.headers, body: JSON.parse(init.body) };
    calls.push(call);
    if (u.startsWith("https://api.resend.com/")) {
      resendAttempts += 1;
      // The first Resend submission is accepted but its response is
      // lost (500 surface): the driver records an ambiguous outcome.
      return resendAttempts === 1 ? errResp(500, "response lost") : okJson({ id: "email_pinned" });
    }
    return okJson({ id: "sg_must_not_happen" });
  };
  try {
    setProviderEnv({ resend: true });
    const client = freshClient();
    const email = "pinned@example.com";
    const { name } = await subscribeViaClient(client, email);
    // Attempt 1 (ten minutes ago): claimed under Resend and submitted;
    // the provider accepted it but the response was lost, so the
    // completion records an ambiguous outcome and the job is left
    // pending, pinned to resend, its retry backoff already elapsed.
    const tPast = Date.now() - 10 * 60 * 1000;
    const { claim: firstClaim } = await client.claimPromotionJob(name, {
      kind: "coupon",
      now: tPast,
      attemptProvider: "resend",
      attemptIdempotencyGuaranteed: true,
    });
    assert.ok(firstClaim);
    const { deliverPromotionSend } = await import("../../src/lib/promotions.ts");
    const first = await deliverPromotionSend(
      firstClaim.payload,
      firstClaim.providerIdempotencyKey,
    );
    assert.equal(first.outcome, "ambiguous");
    assert.equal(first.provider, "resend");
    await client.completePromotionJob(name, {
      kind: "coupon",
      outcome: {
        type: "ambiguous",
        provider: "resend",
        idempotencyGuaranteed: true,
        error: "response lost",
      },
      now: tPast + 1000,
    });
    let state = await client.getPromotionState(name);
    assert.equal(state?.jobs.coupon?.status, "pending");
    assert.equal(state?.jobs.coupon?.provider, "resend");

    // Provider configuration changes before the retry: Resend is gone,
    // only SendGrid remains. The retry must not be submitted there —
    // SendGrid cannot dedupe the original Resend attempt.
    setProviderEnv({ sendgrid: true });
    const callsBefore = calls.length;
    const driveSg = await drivePromotionJobs(client, name, email);
    assert.equal(driveSg.couponDelivered, false);
    assert.equal(calls.length, callsBefore, "no submission under the replacement provider");
    state = await client.getPromotionState(name);
    assert.equal(state?.jobs.coupon?.status, "pending");
    assert.equal(state?.jobs.coupon?.provider, "resend");

    // Resend returns: the drive retries under the original provider
    // with the job's identical idempotency key and payload.
    setProviderEnv({ resend: true });
    const driveRs = await drivePromotionJobs(client, name, email);
    assert.equal(driveRs.couponDelivered, true);
    const couponCalls = calls.filter(
      (c) => c.url.startsWith("https://api.resend.com/") && !c.body.scheduled_at,
    );
    assert.equal(couponCalls.length, 2, "the coupon was submitted to Resend twice in total");
    assert.equal(
      couponCalls[0].headers["Idempotency-Key"],
      couponCalls[1].headers["Idempotency-Key"],
      "the retry reuses the identical idempotency key",
    );
    assert.equal(couponCalls[0].rawBody ?? JSON.stringify(couponCalls[0].body), couponCalls[1].rawBody ?? JSON.stringify(couponCalls[1].body), "the retry reuses the identical payload");
    assert.equal(
      calls.filter((c) => c.url.includes("sendgrid")).length,
      0,
      "SendGrid was never submitted to",
    );
    state = await client.getPromotionState(name);
    assert.equal(state?.jobs.coupon?.status, "accepted");
  } finally {
    restoreEnv(saved);
  }
});

/* ------------- A2-3 gate fix round 3 (Codex findings) ------------- */

test("A2-3 an uncertain cancellation without a guarantee rearms to blocked, never claimable", () => {
  const t0 = NOW;
  let state = subscribedState("hash-r3-unsub-ambiguous-sg", t0);
  const claimed = stateLib.applyClaimPromotionJob(state, {
    kind: "coupon",
    now: t0,
    attemptProvider: "sendgrid",
    attemptIdempotencyGuaranteed: false,
  });
  assert.ok(claimed.claim);
  state = claimed.state;
  // The subscriber opts out while the SendGrid submission is in flight.
  state = stateLib.applyUnsubscribePromotion(state, {
    emailHash: "hash-r3-unsub-ambiguous-sg",
    now: t0 + 1000,
    reason: "email_link",
    facts: noFacts,
  }).state;
  assert.equal(state.jobs.coupon?.status, "attempting");
  // The response is lost: SendGrid may have accepted the send, and it
  // offers no idempotency guarantee to dedupe a second submission.
  state = stateLib.applyCompletePromotionJob(state, {
    kind: "coupon",
    now: t0 + 2000,
    outcome: {
      type: "ambiguous",
      provider: "sendgrid",
      idempotencyGuaranteed: false,
      error: "response lost",
    },
  }).state;
  assert.equal(state.jobs.coupon?.status, "cancelled");
  assert.deepEqual(
    state.jobs.coupon?.uncertainCancellation,
    { provider: "sendgrid", idempotencyGuaranteed: false },
    "the cancellation records the attempt's uncertainty",
  );
  // Renewed consent does not prove the original attempt was not
  // accepted: the resubscribe rearms the job to blocked, not pending.
  const re = stateLib.applySubscribePromotion(state, {
    emailHash: "hash-r3-unsub-ambiguous-sg",
    source: "test",
    now: t0 + 3000,
    facts: noFacts,
    couponPayload: preparePromotionCouponPayload("pure@example.com", "FIRST50"),
  });
  assert.equal(re.state.unsubscribedAt, null);
  assert.equal(
    re.state.jobs.coupon?.status,
    "blocked",
    "an uncovered uncertain cancellation rearms to blocked",
  );
  const claim = stateLib.applyClaimPromotionJob(re.state, {
    kind: "coupon",
    now: t0 + 4000,
    attemptProvider: "sendgrid",
    attemptIdempotencyGuaranteed: false,
  });
  assert.equal(claim.claim, null, "a blocked job is never claimable");
});

test("A2-3 an uncertain cancellation under a live guarantee rearms to pending and retries with the identical key", () => {
  const t0 = NOW;
  let state = subscribedState("hash-r3-unsub-ambiguous-rs", t0);
  const claimed = stateLib.applyClaimPromotionJob(state, {
    kind: "coupon",
    now: t0,
    attemptProvider: "resend",
    attemptIdempotencyGuaranteed: true,
  });
  assert.ok(claimed.claim);
  const key = claimed.claim.providerIdempotencyKey;
  state = claimed.state;
  state = stateLib.applyUnsubscribePromotion(state, {
    emailHash: "hash-r3-unsub-ambiguous-rs",
    now: t0 + 1000,
    reason: "email_link",
    facts: noFacts,
  }).state;
  // Resend accepted the send but its response was lost while the
  // subscriber was opting out: the job cancels, with the guarantee
  // covering its key recorded.
  state = stateLib.applyCompletePromotionJob(state, {
    kind: "coupon",
    now: t0 + 2000,
    outcome: {
      type: "ambiguous",
      provider: "resend",
      idempotencyGuaranteed: true,
      error: "response lost",
    },
  }).state;
  assert.equal(state.jobs.coupon?.status, "cancelled");
  assert.deepEqual(state.jobs.coupon?.uncertainCancellation, {
    provider: "resend",
    idempotencyGuaranteed: true,
  });
  // Inside the guarantee window, the resubscribe rearms to pending…
  const re = stateLib.applySubscribePromotion(state, {
    emailHash: "hash-r3-unsub-ambiguous-rs",
    source: "test",
    now: t0 + 3000,
    facts: noFacts,
    couponPayload: preparePromotionCouponPayload("pure@example.com", "FIRST50"),
  });
  assert.equal(
    re.state.jobs.coupon?.status,
    "pending",
    "a guarantee-covered cancellation rearms to pending",
  );
  // …and the retry is claimable under the same provider, reusing the
  // job's identical idempotency key (the provider dedupes it).
  const retry = stateLib.applyClaimPromotionJob(re.state, {
    kind: "coupon",
    now: t0 + 3000,
    attemptProvider: "resend",
    attemptIdempotencyGuaranteed: true,
  });
  assert.ok(retry.claim, "the covered retry is claimable");
  assert.equal(retry.claim.providerIdempotencyKey, key);
});

test("A2-3 an uncertain cancellation whose guarantee window lapsed rearms to blocked", () => {
  const t0 = NOW;
  let state = subscribedState("hash-r3-unsub-ambiguous-expired", t0);
  const claimed = stateLib.applyClaimPromotionJob(state, {
    kind: "coupon",
    now: t0,
    attemptProvider: "resend",
    attemptIdempotencyGuaranteed: true,
  });
  assert.ok(claimed.claim);
  state = claimed.state;
  state = stateLib.applyUnsubscribePromotion(state, {
    emailHash: "hash-r3-unsub-ambiguous-expired",
    now: t0 + 1000,
    reason: "email_link",
    facts: noFacts,
  }).state;
  state = stateLib.applyCompletePromotionJob(state, {
    kind: "coupon",
    now: t0 + 2000,
    outcome: {
      type: "ambiguous",
      provider: "resend",
      idempotencyGuaranteed: true,
      error: "response lost",
    },
  }).state;
  assert.equal(state.jobs.coupon?.status, "cancelled");
  // The resubscribe arrives only after the 24h guarantee window has
  // lapsed: the same-key retry is no longer dedupe-safe, so the job
  // rearms to blocked for an operator instead of pending.
  const re = stateLib.applySubscribePromotion(state, {
    emailHash: "hash-r3-unsub-ambiguous-expired",
    source: "test",
    now: t0 + stateLib.PROVIDER_IDEMPOTENCY_WINDOW_MS + 1000,
    facts: noFacts,
    couponPayload: preparePromotionCouponPayload("pure@example.com", "FIRST50"),
  });
  assert.equal(re.state.jobs.coupon?.status, "blocked");
});

test("A2-3 a stale claim cancelled by the alarm without a guarantee rearms to blocked", () => {
  const t0 = NOW;
  let state = subscribedState("hash-r3-alarm-unsub-sg", t0);
  const claimed = stateLib.applyClaimPromotionJob(state, {
    kind: "coupon",
    now: t0,
    attemptProvider: "sendgrid",
    attemptIdempotencyGuaranteed: false,
  });
  assert.ok(claimed.claim);
  state = claimed.state;
  // The driver dies before the outcome is known; the subscriber opts
  // out while the claim is in flight, and the alarm cancels the stale
  // claim. The cancelled attempt is just as uncertain as a completed
  // one — SendGrid may have accepted it.
  state = stateLib.applyUnsubscribePromotion(state, {
    emailHash: "hash-r3-alarm-unsub-sg",
    now: t0 + 1000,
    reason: "email_link",
    facts: noFacts,
  }).state;
  const alarmed = stateLib.applyPromotionAlarm(state, {
    now: t0 + stateLib.PROMOTION_JOB_ATTEMPT_STALE_MS + 2000,
  });
  state = alarmed.state;
  assert.equal(state.jobs.coupon?.status, "cancelled");
  assert.deepEqual(
    state.jobs.coupon?.uncertainCancellation,
    { provider: "sendgrid", idempotencyGuaranteed: false },
    "the alarm's cancellation records the stale claim's uncertainty from its stamp",
  );
  const re = stateLib.applySubscribePromotion(state, {
    emailHash: "hash-r3-alarm-unsub-sg",
    source: "test",
    now: t0 + stateLib.PROMOTION_JOB_ATTEMPT_STALE_MS + 3000,
    facts: noFacts,
    couponPayload: preparePromotionCouponPayload("pure@example.com", "FIRST50"),
  });
  assert.equal(
    re.state.jobs.coupon?.status,
    "blocked",
    "the resubscribe cannot rearm an uncovered uncertain cancellation to a deliverable job",
  );
  const claim = stateLib.applyClaimPromotionJob(re.state, {
    kind: "coupon",
    now: t0 + stateLib.PROMOTION_JOB_ATTEMPT_STALE_MS + 4000,
    attemptProvider: "sendgrid",
    attemptIdempotencyGuaranteed: false,
  });
  assert.equal(claim.claim, null);
});

test("A2-3 a pending job carrying an uncovered uncertain cancellation is refused at claim and blocked", () => {
  const t0 = NOW;
  const base = subscribedState("hash-r3-backstop", t0);
  // A record that predates (or bypassed) the certainty-aware rearm: a
  // pending job whose earlier uncertain attempt has no idempotency
  // guarantee. The claim transition itself must fail closed on it.
  const coupon = base.jobs.coupon;
  assert.ok(coupon);
  const state = {
    ...base,
    jobs: {
      ...base.jobs,
      coupon: {
        ...coupon,
        provider: "sendgrid",
        firstAttemptAt: t0,
        attemptCount: 1,
        uncertainCancellation: { provider: "sendgrid", idempotencyGuaranteed: false },
      },
    },
  };
  const refused = stateLib.applyClaimPromotionJob(state, {
    kind: "coupon",
    now: t0 + 1000,
    attemptProvider: "sendgrid",
    attemptIdempotencyGuaranteed: false,
  });
  assert.equal(refused.claim, null, "the claim is refused (fail closed)");
  assert.equal(
    refused.state.jobs.coupon?.status,
    "blocked",
    "the job is blocked for an operator instead of left claimable",
  );
});

test("A2-3 an unconfigured completion backs off the next alarm instead of refiring immediately", () => {
  const t0 = NOW;
  let state = subscribedState("hash-r3-unconfigured-backoff", t0);
  // Attempt 1: ambiguous under Resend's guarantee → pending with a
  // scheduled retry.
  const claimed = stateLib.applyClaimPromotionJob(state, {
    kind: "coupon",
    now: t0,
    attemptProvider: "resend",
    attemptIdempotencyGuaranteed: true,
  });
  assert.ok(claimed.claim);
  state = stateLib.applyCompletePromotionJob(claimed.state, {
    kind: "coupon",
    now: t0,
    outcome: {
      type: "ambiguous",
      provider: "resend",
      idempotencyGuaranteed: true,
      error: "response lost",
    },
  }).state;
  assert.equal(state.jobs.coupon?.status, "pending");
  const retryAt = state.jobs.coupon?.nextAttemptAt;
  assert.equal(retryAt, t0 + stateLib.PROMOTION_JOB_RETRY_DELAY_MS);
  assert.ok(retryAt !== null);
  // The retry comes due and is claimed, but by then every provider is
  // unconfigured: the attempt resolves without any provider call.
  const claimed2 = stateLib.applyClaimPromotionJob(state, {
    kind: "coupon",
    now: retryAt,
    attemptProvider: null,
    attemptIdempotencyGuaranteed: null,
  });
  assert.ok(claimed2.claim);
  const completedAt = retryAt + 1000;
  state = stateLib.applyCompletePromotionJob(claimed2.state, {
    kind: "coupon",
    now: completedAt,
    outcome: { type: "unconfigured" },
  }).state;
  assert.equal(state.jobs.coupon?.status, "pending");
  assert.ok(
    (state.jobs.coupon?.nextAttemptAt ?? 0) > completedAt,
    "the restored job is backed off, not left with its already-due retry time",
  );
  const alarmAt = stateLib.nextPromotionAlarmAt(state, completedAt);
  assert.ok(
    alarmAt !== null && alarmAt > completedAt,
    "the next alarm is scheduled in the future, not in the past",
  );
});

test("A2-3 an unconfigured completion after an unsubscribe cancels with no retry scheduled", () => {
  const t0 = NOW;
  let state = subscribedState("hash-r3-unconfigured-unsub", t0);
  const claimed = stateLib.applyClaimPromotionJob(state, {
    kind: "coupon",
    now: t0,
    attemptProvider: "resend",
    attemptIdempotencyGuaranteed: true,
  });
  assert.ok(claimed.claim);
  state = stateLib.applyCompletePromotionJob(claimed.state, {
    kind: "coupon",
    now: t0,
    outcome: {
      type: "ambiguous",
      provider: "resend",
      idempotencyGuaranteed: true,
      error: "response lost",
    },
  }).state;
  const retryAt = state.jobs.coupon?.nextAttemptAt;
  assert.ok(retryAt !== null);
  // The retry is claimed (the job still carries its due retry time)…
  const claimed2 = stateLib.applyClaimPromotionJob(state, {
    kind: "coupon",
    now: retryAt,
    attemptProvider: null,
    attemptIdempotencyGuaranteed: null,
  });
  assert.ok(claimed2.claim);
  state = claimed2.state;
  // …the subscriber opts out mid-claim, and the attempt then resolves
  // unconfigured: the job cancels and keeps no schedule.
  state = stateLib.applyUnsubscribePromotion(state, {
    emailHash: "hash-r3-unconfigured-unsub",
    now: retryAt + 500,
    reason: "email_link",
    facts: noFacts,
  }).state;
  assert.equal(state.jobs.coupon?.status, "attempting");
  state = stateLib.applyCompletePromotionJob(state, {
    kind: "coupon",
    now: retryAt + 1000,
    outcome: { type: "unconfigured" },
  }).state;
  assert.equal(state.jobs.coupon?.status, "cancelled");
  assert.equal(
    state.jobs.coupon?.nextAttemptAt,
    null,
    "a cancelled job carries no retry schedule",
  );
});

/* ------------- A2-3 gate fix round 4 (Codex findings) ------------- */

test("A2-3 a definitively rejected first attempt rearms with a fresh retry window", () => {
  const t0 = NOW;
  let state = subscribedState("hash-r4-definitive-window", t0);
  const claimed = stateLib.applyClaimPromotionJob(state, {
    kind: "coupon",
    now: t0,
    attemptProvider: "resend",
    attemptIdempotencyGuaranteed: true,
  });
  assert.ok(claimed.claim);
  state = claimed.state;
  assert.equal(state.jobs.coupon?.firstAttemptAt, t0);
  // The provider answers definitively (HTTP 401: invalid key). The
  // request was rejected before processing — no acceptance is possible,
  // so this attempt carries no uncertainty for a retry window to bound.
  state = stateLib.applyCompletePromotionJob(state, {
    kind: "coupon",
    now: t0 + 1000,
    outcome: { type: "definitive_failure", provider: "resend", error: "resend_http_401" },
  }).state;
  assert.equal(state.jobs.coupon?.status, "failed");
  assert.equal(
    state.jobs.coupon?.attemptCount,
    1,
    "the attempt genuinely occurred, so its count is not unwound",
  );
  assert.equal(
    state.jobs.coupon?.firstAttemptAt,
    null,
    "a definitive rejection clears the uncertainty window anchor",
  );
  // The provider configuration is repaired and the subscriber
  // explicitly subscribes again 25 hours later — past the 24h window
  // the rejected attempt would otherwise still be anchoring.
  const t1 = t0 + 25 * HOUR;
  const re = stateLib.applySubscribePromotion(state, {
    emailHash: "hash-r4-definitive-window",
    source: "test",
    now: t1,
    facts: noFacts,
    couponPayload: preparePromotionCouponPayload("pure@example.com", "FIRST50"),
  });
  assert.equal(re.state.jobs.coupon?.status, "pending", "a failed job rearms to pending");
  const claim = stateLib.applyClaimPromotionJob(re.state, {
    kind: "coupon",
    now: t1,
    attemptProvider: "resend",
    attemptIdempotencyGuaranteed: true,
  });
  assert.ok(claim.claim, "the rearmed job is claimable under a fresh window");
  assert.equal(
    claim.state.jobs.coupon?.firstAttemptAt,
    t1,
    "the new claim stamps a fresh window anchor",
  );
});

test("A2-3 an ambiguous attempt keeps its uncertainty window across the same span (control)", () => {
  const t0 = NOW;
  let state = subscribedState("hash-r4-ambiguous-control", t0);
  const claimed = stateLib.applyClaimPromotionJob(state, {
    kind: "coupon",
    now: t0,
    attemptProvider: "resend",
    attemptIdempotencyGuaranteed: true,
  });
  assert.ok(claimed.claim);
  state = claimed.state;
  // The response is lost: acceptance stays uncertain, so the window
  // anchor must survive completion untouched.
  state = stateLib.applyCompletePromotionJob(state, {
    kind: "coupon",
    now: t0 + 1000,
    outcome: {
      type: "ambiguous",
      provider: "resend",
      idempotencyGuaranteed: true,
      error: "response lost",
    },
  }).state;
  assert.equal(state.jobs.coupon?.status, "pending");
  assert.equal(
    state.jobs.coupon?.firstAttemptAt,
    t0,
    "an ambiguous completion retains the window anchor",
  );
  const claim = stateLib.applyClaimPromotionJob(state, {
    kind: "coupon",
    now: t0 + 25 * HOUR,
    attemptProvider: "resend",
    attemptIdempotencyGuaranteed: true,
  });
  assert.equal(claim.claim, null, "a claim after the window is refused");
  assert.equal(
    claim.state.jobs.coupon?.status,
    "blocked",
    "the lapsed window blocks the job for an operator",
  );
});

test("A2-3 the unsubscribe flow surfaces a KV projection failure and a retry lands the opt-out", async () => {
  const email = "projretry@example.com";
  const originalSet = kv.set;
  kv.set = async () => {
    throw new Error("injected kv projection failure");
  };
  try {
    // Pre-fix the projection helper swallowed this failure and the
    // flow resolved as a success, leaving the authoritative opt-out
    // invisible to the KV-only review suppression check.
    await assert.rejects(
      unsubscribePromotionFlow({ email, reason: "email_link" }),
      /injected kv projection failure/,
      "a failed projection write must surface instead of resolving as success",
    );
  } finally {
    kv.set = originalSet;
  }
  // The coordinator committed the opt-out before the projection ran,
  // so a retry republishes from committed state: it reports the
  // already-recorded unsubscribe and lands the projection this time.
  const retry = await unsubscribePromotionFlow({ email, reason: "email_link" });
  assert.equal(retry.wasAlreadyUnsubscribed, true);
  const view = await kv.get(emailStateKey(email));
  assert.ok(
    view?.unsubscribedAt,
    "the KV projection now carries the opt-out the review suppression check reads",
  );
});

/* ------------------------------ wiring ------------------------------ */

test("wiring: coordinator binding, migration, and worker export exist", () => {
  const wrangler = readFileSync(path.join(APP_ROOT, "wrangler.toml"), "utf8");
  assert.match(wrangler, /name = "CONSISTENCY_COORDINATOR"/);
  assert.match(wrangler, /tag = "v5-consistency-coordinator"/);
  assert.match(wrangler, /new_sqlite_classes = \["ConsistencyCoordinatorDO"\]/);
  const worker = readFileSync(path.join(APP_ROOT, "cloudflare-worker.ts"), "utf8");
  assert.match(worker, /export \{ ConsistencyCoordinatorDO \}/);
});

test("wiring: legacy KV write paths are gone from the three call sites", () => {
  const claim = readFileSync(
    path.join(APP_ROOT, "src/app/api/account/magic/claim/route.ts"),
    "utf8",
  );
  assert.ok(!claim.includes("kv.set(accountLiteMagicKey"), "claim no longer writes usedAt to KV");
  assert.ok(claim.includes("consumeMagicToken"), "claim goes through the coordinator");

  const subscribe = readFileSync(
    path.join(APP_ROOT, "src/app/api/promotions/subscribe/route.ts"),
    "utf8",
  );
  assert.ok(!subscribe.includes("kv.set("), "subscribe route no longer writes KV state directly");
  assert.ok(subscribe.includes("subscribePromotionFlow"));

  const accountLite = readFileSync(path.join(APP_ROOT, "src/lib/accountLite.ts"), "utf8");
  assert.ok(!accountLite.includes("kv.set("), "account index no longer writes the shared KV array");
  assert.ok(accountLite.includes("upsertAccountSession"));
});
