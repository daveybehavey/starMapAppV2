/**
 * promotionDispatchGuard.test.mjs — CASL gate-1 fencing build
 * (evidence design S91-4; sender inventory S90-3).
 *
 * Pins the dispatch fence on the promotional transport:
 * - the pure decision table over coordinator / legacy authority facts;
 * - deliverPromotionSend refuses BEFORE any provider leg runs when the
 *   authority says no (negative control: zero provider fetches), for an
 *   injected checker and for the default production checker alike;
 * - the legacy wrappers — previously callable with no permission check
 *   at all — are fenced end-to-end: an unsubscribed contact is refused
 *   with a distinguishable error, a subscribed contact still receives
 *   the send;
 * - the post-claim race the fence exists for: a job claimed while
 *   subscribed, then unsubscribed before delivery, is refused at
 *   dispatch (the claim-time check alone cannot close this hole);
 * - the checker fails closed when the authority cannot be read;
 * - a legacy-only subscriber (KV state, no coordinator object) is
 *   still permitted — the fence reads the legacy facts when, and only
 *   when, the coordinator has never seen the recipient.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);
register("./consistencyCoordinator.hooks.mjs", import.meta.url);

process.env.STARMAP_CONSISTENCY_COORDINATOR_LOCAL = "1";
process.env.STARMAP_KV_ALLOW_LOCAL = "1";
process.env.RESEND_API_KEY = "re_test_promotion_fence";
process.env.PROMOTION_EMAIL_FROM = "StarMapCo <promo@starmapco.com>";
delete process.env.SENDGRID_API_KEY;
delete process.env.PROMOTION_AUTOMATION_WEBHOOK_URL;

const guardLib = await import("../../src/lib/promotionDispatchGuard.ts");
const clientLib = await import("../../src/lib/consistencyCoordinator.ts");
const promotionsLib = await import("../../src/lib/promotions.ts");
const { drivePromotionJobs, unsubscribePromotionFlow } = await import(
  "../../src/lib/promotionCoordinator.ts"
);
const { kv } = await import("../../src/lib/kv.ts");
const { emailStateKey, LEGACY_SUBSCRIPTION_KEY } = await import(
  "../../src/lib/promotionSubscriptions.ts"
);

const okJson = (obj) => ({
  ok: true,
  status: 200,
  json: async () => obj,
  text: async () => JSON.stringify(obj),
  headers: { get: () => null },
});

/** Install a fetch stub that only tolerates Resend calls; returns the
 *  recorded calls. A refusal must leave this array EMPTY. */
function installFetchFake(handler = async () => okJson({ id: "email_1" })) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    assert.ok(u.startsWith("https://api.resend.com/"), `unexpected fetch: ${u}`);
    const call = { url: u, headers: init.headers, body: JSON.parse(init.body) };
    calls.push(call);
    return handler(call, calls);
  };
  return calls;
}

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

async function subscribeViaClient(client, email) {
  const emailHash = clientLib.coordinatorEmailHash(email);
  const name = clientLib.promotionCoordinatorName(emailHash);
  const result = await client.subscribePromotion(name, {
    emailHash,
    source: "test",
    now: Date.now(),
    facts: noFacts,
    couponPayload: promotionsLib.preparePromotionCouponPayload(email, "FIRST50"),
  });
  return { name, emailHash, ...result };
}

const coordinatorState = (over = {}) => ({
  kind: "promotion",
  emailHash: "hash",
  subscribedAt: null,
  unsubscribedAt: null,
  unsubscribeReason: null,
  lastSource: null,
  legacySubscribed: false,
  legacyImportCompleted: true,
  updatedAt: 1,
  jobs: {},
  ...over,
});

/* ------------------------- decision table ------------------------- */

test("fence decision table: coordinator state is authoritative when present", () => {
  const { evaluatePromotionDispatchPermission: evaluate } = guardLib;
  // Unsubscribed in the coordinator: refused even if legacy facts would permit.
  assert.deepEqual(
    evaluate({
      coordinatorState: coordinatorState({ subscribedAt: 10, unsubscribedAt: 20 }),
      legacyState: { subscribedAt: 5 },
      legacyListMember: true,
    }),
    { permitted: false, reason: "unsubscribed" },
  );
  // Subscribed in the coordinator: permitted even if a stale legacy row disagrees.
  assert.deepEqual(
    evaluate({
      coordinatorState: coordinatorState({ subscribedAt: 30, unsubscribedAt: null }),
      legacyState: { unsubscribedAt: 25 },
      legacyListMember: false,
    }),
    { permitted: true },
  );
  // Legacy import established the subscription: permitted.
  assert.deepEqual(
    evaluate({
      coordinatorState: coordinatorState({ legacySubscribed: true }),
      legacyState: null,
      legacyListMember: false,
    }),
    { permitted: true },
  );
  // A coordinator object with no subscription fact at all: refused.
  assert.deepEqual(
    evaluate({
      coordinatorState: coordinatorState({}),
      legacyState: { subscribedAt: 5 },
      legacyListMember: true,
    }),
    { permitted: false, reason: "no_permission_record" },
  );
});

test("fence decision table: legacy facts decide only when the coordinator has never seen the recipient", () => {
  const { evaluatePromotionDispatchPermission: evaluate } = guardLib;
  assert.deepEqual(
    evaluate({
      coordinatorState: null,
      legacyState: { subscribedAt: 5, unsubscribedAt: 9 },
      legacyListMember: true,
    }),
    { permitted: false, reason: "unsubscribed" },
  );
  assert.deepEqual(
    evaluate({
      coordinatorState: null,
      legacyState: { subscribedAt: 5 },
      legacyListMember: false,
    }),
    { permitted: true },
  );
  assert.deepEqual(
    evaluate({ coordinatorState: null, legacyState: null, legacyListMember: true }),
    { permitted: true },
  );
  assert.deepEqual(
    evaluate({ coordinatorState: null, legacyState: null, legacyListMember: false }),
    { permitted: false, reason: "no_permission_record" },
  );
  assert.deepEqual(
    evaluate({ coordinatorState: null, legacyState: {}, legacyListMember: false }),
    { permitted: false, reason: "no_permission_record" },
  );
});

/* --------------------- transport-level fence ---------------------- */

test("deliverPromotionSend: an injected refusal stops every leg (zero provider calls)", async () => {
  const calls = installFetchFake();
  const payload = promotionsLib.preparePromotionCouponPayload("someone@example.com", "FIRST50");
  const refused = await promotionsLib.deliverPromotionSend(payload, "idem-1", {
    checkDispatchPermission: async () => ({ permitted: false, reason: "unsubscribed" }),
  });
  assert.deepEqual(refused, { outcome: "refused", provider: "none", reason: "unsubscribed" });
  assert.equal(calls.length, 0, "a refused dispatch must not touch any provider leg");

  const permitted = await promotionsLib.deliverPromotionSend(payload, "idem-2", {
    checkDispatchPermission: async () => ({ permitted: true }),
  });
  assert.equal(permitted.outcome, "accepted");
  assert.equal(calls.length, 1, "a permitted dispatch through the same entry point still sends");
});

test("deliverPromotionSend: a throwing checker fails closed (authority_unavailable)", async () => {
  const calls = installFetchFake();
  const payload = promotionsLib.preparePromotionCouponPayload("someone@example.com", "FIRST50");
  const outcome = await promotionsLib.deliverPromotionSend(payload, "idem-3", {
    checkDispatchPermission: async () => {
      throw new Error("authority exploded");
    },
  });
  assert.deepEqual(outcome, {
    outcome: "refused",
    provider: "none",
    reason: "authority_unavailable",
  });
  assert.equal(calls.length, 0);
});

test("checker: an unreadable authority refuses with authority_unavailable", async () => {
  const brokenClient = {
    async getPromotionState() {
      throw new Error("coordinator down");
    },
  };
  const checker = guardLib.createPromotionDispatchPermissionChecker(brokenClient);
  assert.deepEqual(await checker("anyone@example.com"), {
    permitted: false,
    reason: "authority_unavailable",
  });
});

/* ---------------- default checker against real state --------------- */

test("default checker: no permission record anywhere refuses, with zero provider calls", async () => {
  freshClient();
  const calls = installFetchFake();
  const payload = promotionsLib.preparePromotionCouponPayload("ghost@example.com", "FIRST50");
  const outcome = await promotionsLib.deliverPromotionSend(payload, "idem-4");
  assert.deepEqual(outcome, {
    outcome: "refused",
    provider: "none",
    reason: "no_permission_record",
  });
  assert.equal(calls.length, 0);
});

test("post-claim race: claimed while subscribed, unsubscribed before delivery — refused at dispatch", async () => {
  const client = freshClient();
  const email = "racer@example.com";
  const { name } = await subscribeViaClient(client, email);
  const { claim } = await client.claimPromotionJob(name, {
    kind: "coupon",
    now: Date.now(),
    attemptProvider: "resend",
    attemptIdempotencyGuaranteed: true,
  });
  assert.ok(claim, "the job claims while subscribed");
  await unsubscribePromotionFlow({ email, reason: "email_link" });

  const calls = installFetchFake();
  const outcome = await promotionsLib.deliverPromotionSend(
    claim.payload,
    claim.providerIdempotencyKey,
  );
  assert.deepEqual(outcome, { outcome: "refused", provider: "none", reason: "unsubscribed" });
  assert.equal(calls.length, 0, "the in-flight claim must not become a send after unsubscribe");
});

test("driver: after unsubscribe, driving the jobs sends nothing and no job completes as accepted", async () => {
  const client = freshClient();
  const email = "driver@example.com";
  const { name } = await subscribeViaClient(client, email);
  await unsubscribePromotionFlow({ email, reason: "email_link" });

  const calls = installFetchFake();
  const drive = await drivePromotionJobs(client, name, email);
  assert.equal(drive.couponDelivered, false);
  assert.equal(calls.length, 0);
  const state = await client.getPromotionState(name);
  assert.notEqual(state?.jobs.coupon?.status, "accepted");
});

test("driver: a subscribed contact still receives the coupon through the fenced path", async () => {
  const client = freshClient();
  const email = "happy@example.com";
  const { name } = await subscribeViaClient(client, email);
  const calls = installFetchFake();
  const drive = await drivePromotionJobs(client, name, email);
  assert.equal(drive.couponDelivered, true);
  assert.ok(calls.length >= 1, "the permitted send reached the provider");
  const state = await client.getPromotionState(name);
  assert.equal(state?.jobs.coupon?.status, "accepted");
});

/* --------------------------- wrappers ------------------------------ */

test("legacy wrappers are fenced: unsubscribed refuses distinguishably, subscribed delivers", async () => {
  const client = freshClient();
  const email = "wrapper@example.com";
  await subscribeViaClient(client, email);
  await unsubscribePromotionFlow({ email, reason: "email_link" });

  const calls = installFetchFake();
  const refused = await promotionsLib.runPromotionAutomation(email, "FIRST50");
  assert.equal(refused.delivered, false);
  assert.equal(refused.provider, "none");
  assert.equal(refused.error, "promotion_dispatch_refused:unsubscribed");
  assert.equal(calls.length, 0, "the wrapper must not send to an unsubscribed contact");

  const refusedFollowup = await promotionsLib.runPromotionFollowup(email, "FIRST50");
  assert.equal(refusedFollowup.delivered, false);
  assert.equal(refusedFollowup.error, "promotion_dispatch_refused:unsubscribed");
  assert.equal(calls.length, 0);
});

test("legacy wrappers: a subscribed contact still receives the send", async () => {
  const client = freshClient();
  const email = "wrapper-ok@example.com";
  await subscribeViaClient(client, email);
  const calls = installFetchFake();
  const result = await promotionsLib.runPromotionAutomation(email, "FIRST50");
  assert.equal(result.delivered, true);
  assert.equal(result.provider, "resend");
  assert.equal(calls.length, 1);
});

/* --------------------- legacy-only subscribers --------------------- */

test("legacy-only subscriber (KV state, no coordinator object) is permitted; legacy unsubscribe refuses", async () => {
  freshClient();
  const email = "legacy@example.com";
  await kv.set(emailStateKey(email), {
    subscribedAt: Date.UTC(2026, 0, 1),
    updatedAt: Date.UTC(2026, 0, 1),
  });
  const calls = installFetchFake();
  const delivered = await promotionsLib.runPromotionAutomation(email, "FIRST50");
  assert.equal(delivered.delivered, true);
  assert.equal(calls.length, 1);

  const goneEmail = "legacy-gone@example.com";
  await kv.set(emailStateKey(goneEmail), {
    subscribedAt: Date.UTC(2026, 0, 1),
    unsubscribedAt: Date.UTC(2026, 1, 1),
    updatedAt: Date.UTC(2026, 1, 1),
  });
  const refused = await promotionsLib.runPromotionAutomation(goneEmail, "FIRST50");
  assert.equal(refused.delivered, false);
  assert.equal(refused.error, "promotion_dispatch_refused:unsubscribed");
  assert.equal(calls.length, 1, "no further provider call for the unsubscribed legacy contact");

  const listEmail = "legacy-list@example.com";
  const list = (await kv.get(LEGACY_SUBSCRIPTION_KEY)) ?? [];
  await kv.set(LEGACY_SUBSCRIPTION_KEY, [...list, listEmail]);
  const listDelivered = await promotionsLib.runPromotionAutomation(listEmail, "FIRST50");
  assert.equal(listDelivered.delivered, true);
});

test("legacy facts: an unreadable state record refuses as authority_unavailable even when the list read succeeds", async () => {
  // Codex P2 on PR #454: kv.get degrades a failed read to `null`, so an
  // unreadable suppression record was indistinguishable from an absent
  // one and list membership could permit the send. The legacy facts are
  // now read error-preserving: this state record is present but
  // unreadable (corrupt in the local fallback store), the list read
  // succeeds and contains the address — the dispatch must still refuse.
  freshClient();
  const email = "legacy-unreadable@example.com";
  const list = (await kv.get(LEGACY_SUBSCRIPTION_KEY)) ?? [];
  await kv.set(LEGACY_SUBSCRIPTION_KEY, [...list, email]);

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const kvDir =
    process.env.STARMAP_KV_DIR?.trim() || path.join(process.cwd(), ".tmp", "kv-store");
  await fs.mkdir(kvDir, { recursive: true });
  const stateFile = path.join(
    kvDir,
    `${Buffer.from(emailStateKey(email), "utf8").toString("base64url")}.json`,
  );
  await fs.writeFile(stateFile, "{unreadable", "utf8");

  const checker = guardLib.createPromotionDispatchPermissionChecker(freshClient());
  assert.deepEqual(await checker(email), {
    permitted: false,
    reason: "authority_unavailable",
  });

  const calls = installFetchFake();
  const refused = await promotionsLib.runPromotionAutomation(email, "FIRST50");
  assert.equal(refused.delivered, false);
  assert.equal(refused.error, "promotion_dispatch_refused:authority_unavailable");
  assert.equal(calls.length, 0, "no provider leg may run when the state record is unreadable");
});
