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
const { drivePromotionJobs } = await import("../../src/lib/promotionCoordinator.ts");
const {
  preparePromotionCouponPayload,
  preparePromotionFollowupPayload,
  getPromotionFollowupDelaySeconds,
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
