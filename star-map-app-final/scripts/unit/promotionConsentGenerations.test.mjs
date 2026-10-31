/**
 * promotionConsentGenerations.test.mjs — CASL RD-D build (issue #463).
 *
 * Governing basis: RD-A register §2.2 (the four RD-D rows), B1A-MODEL
 * §3.1 (coordinator-extension fields generation / consentEvents[] /
 * pendingConsent / welcomeState), A1 G-1..G-4, G-6, T-1, A2 GM-6, and
 * AM-09 **as replaced by the chair-accepted two-repairs cell**
 * (readiness ruling 2026-10-31; S81-5 §1 RD-D row).
 *
 * Pins:
 * - the generation counter (absent ⇒ 1; malformed present ⇒ invalid
 *   document) increments ONLY on a committed unsubscribe or a
 *   completed re-consent ceremony — negative controls: deliverability
 *   record/clear, subscribe alone, and RD-C's tombstone stamps never
 *   move it;
 * - consent events are appended by subscribe / committed unsubscribe /
 *   ceremony completion, stamped with the generation the act belongs
 *   to (for unsubscribe and completion, the generation created), carry
 *   caller evidence + the R-8 digest stamp when supplied, survive
 *   generation changes, and are removed by erasure's reduction;
 * - the T-1 lifecycle per the two-repairs acceptance cases: (a) a
 *   fresh explicit request on a SUPPRESSED address creates a
 *   current-generation pending request (the pre-repair "not created
 *   at all" cell was the defect the repair removed — it is NOT the
 *   behaviour built here), suppression fully in force and generation
 *   unchanged until completion; (b) repeat requests dedupe (G-6);
 *   (c) stale-generation tokens are inert. Plus: hash-only token
 *   storage, re-issuance superseding the prior token, atomic
 *   single-use consumption, 48h expiry judged on server time, and
 *   replay returning the recorded confirmed/expired/superseded
 *   result with ZERO mutation;
 * - ceremony completion (G-3): clears global suppression exactly
 *   once, increments exactly once, stamps the suppression record
 *   (generation + eventRef), and preserves welcomeState/coupon
 *   history (G-4) — no second coupon is minted by any RD-D path;
 * - welcomeState is a monotone derivation over the shipped facts
 *   (coupon job acceptance; legacy couponSentAt import), seeded —
 *   never forked;
 * - confirmation mail's classification constant (AM-09):
 *   transactional-class, frequency-exempt, suppression never blocks
 *   it; a pending request admits no marketing send of any class;
 * - pre-RD-D documents behave identically to before RD-D (derivation
 *   on read, no migration).
 *
 * Suite evidence discipline: synthetic records and disposable test
 * keys only, in the local in-memory coordinator + KV fallback.
 * Nothing here touches production state or sends anything.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);
register("./consistencyCoordinator.hooks.mjs", import.meta.url);

process.env.STARMAP_CONSISTENCY_COORDINATOR_LOCAL = "1";
process.env.STARMAP_KV_ALLOW_LOCAL = "1";
process.env.RESEND_API_KEY = "re_test_local";
process.env.PROMOTION_EMAIL_FROM = "StarMapCo <promo@starmapco.com>";
delete process.env.SENDGRID_API_KEY;
delete process.env.PROMOTION_AUTOMATION_WEBHOOK_URL;
delete process.env.PROMOTION_DIGEST_KEY_V1;
delete process.env.PROMOTION_DIGEST_KEY_V2;

const stateLib = await import("../../src/lib/consistencyCoordinatorState.ts");
const tombstoneLib = await import("../../src/lib/promotionTombstones.ts");
const clientLib = await import("../../src/lib/consistencyCoordinator.ts");
const flows = await import("../../src/lib/promotionCoordinator.ts");
const guardLib = await import("../../src/lib/promotionDispatchGuard.ts");
const { kv } = await import("../../src/lib/kv.ts");
const subsLib = await import("../../src/lib/promotionSubscriptions.ts");

const NOW = Date.UTC(2026, 9, 31, 17, 0, 0);
const HASH = "hash-rdd";
const EMAIL = "person@example.com";
const KEY_V1 = "test-digest-key-v1-0123456789";
const TTL = stateLib.PROMOTION_CONFIRMATION_TOKEN_TTL_MS;
const NO_FACTS = {
  state: null,
  inLegacySubscriptionList: null,
  inLegacySentList: null,
  inLegacyFollowupList: null,
};
const NO_TOMBSTONE_LOOKUP = {
  digestsByVersion: {},
  nonRetiredVersions: [1],
  resolvableVersions: [],
  retiredVersions: [],
};

function couponPayload(email = EMAIL) {
  return {
    email,
    couponCode: "FIRST50",
    kind: "coupon",
    subject: "Welcome",
    text: "welcome",
    html: "<p>welcome</p>",
  };
}

function subscribedState(now = NOW) {
  return stateLib.applySubscribePromotion(null, {
    tombstoneLookup: NO_TOMBSTONE_LOOKUP,
    emailHash: HASH,
    source: "homepage",
    now,
    facts: NO_FACTS,
    couponPayload: couponPayload(),
  }).state;
}

function unsubscribedState(now = NOW + 60_000) {
  return stateLib.applyUnsubscribePromotion(subscribedState(), {
    emailHash: HASH,
    now,
    reason: "email_link",
    facts: NO_FACTS,
  }).state;
}

function request(state, { now, requestId = "req-1", tokenHash = "hash-token-1" } = {}) {
  return stateLib.applyRequestPromotionConsent(state, {
    emailHash: HASH,
    now,
    facts: NO_FACTS,
    requestId,
    tokenHash,
  });
}

function confirm(state, { now, tokenHash = "hash-token-1", evidence } = {}) {
  return stateLib.applyConfirmPromotionConsent(state, { now, tokenHash, evidence });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/* --------------------- document shape / derivation --------------------- */

test("RD-D pre-RD-D documents stay valid and derive generation 1, no events, no pending request", () => {
  const legacy = subscribedState();
  delete legacy.generation;
  delete legacy.consentEvents;
  delete legacy.pendingConsent;
  delete legacy.welcomeState;
  assert.equal(stateLib.isValidPromotionState(legacy), true, "absent fields are valid");
  assert.equal(stateLib.promotionGenerationOf(legacy), 1);
  assert.deepEqual(stateLib.promotionConsentEventsOf(legacy), []);
  assert.equal(stateLib.promotionPendingConsentOf(legacy), null);
});

test("RD-D malformed RD-D fields fail document validation", () => {
  const badEvent = subscribedState();
  badEvent.consentEvents = [
    {
      kind: "subscribe",
      generation: 0,
      serverAt: NOW,
      surface: "homepage",
      source: "homepage",
      disclosureVersion: "",
      disclosureHash: "",
      affirmativeAction: "subscribe",
    },
  ];
  assert.equal(stateLib.isValidPromotionState(badEvent), false, "event generation 0 is malformed");

  const halfStamp = subscribedState();
  halfStamp.consentEvents = [
    { ...clone(halfStamp.consentEvents[0]), keyedDigest: "abc123" },
  ];
  assert.equal(
    stateLib.isValidPromotionState(halfStamp),
    false,
    "a digest stamp without its version is malformed",
  );

  const badPending = subscribedState();
  badPending.pendingConsent = {
    requestId: "req-x",
    generation: 1,
    createdAt: NOW,
    tokenHash: "hash-token-x",
    tokenExpiresAt: NOW + TTL,
    confirmationSendCount: 1,
    status: "confirmed",
    confirmedAt: null,
  };
  assert.equal(
    stateLib.isValidPromotionState(badPending),
    false,
    "a confirmed slot without confirmedAt is malformed",
  );

  const badWelcome = subscribedState();
  badWelcome.welcomeState = { sentAt: "yesterday" };
  assert.equal(stateLib.isValidPromotionState(badWelcome), false, "non-numeric sentAt is malformed");
});

/* ------------------------- generation counter ------------------------- */

test("RD-D committed unsubscribe increments the counter and stamps the created generation", () => {
  const state = unsubscribedState();
  assert.equal(state.generation, 2);
  assert.equal(stateLib.promotionGenerationOf(state), 2);
  assert.equal(state.suppressions.global.generation, 2);

  const again = stateLib.applyUnsubscribePromotion(state, {
    emailHash: HASH,
    now: NOW + 120_000,
    reason: "email_link",
    facts: NO_FACTS,
  });
  assert.equal(again.wasAlreadyUnsubscribed, true);
  assert.equal(again.state.generation, 2, "a repeat unsubscribe commits nothing and increments nothing");
});

test("RD-D negative control: deliverability record and clear never move the counter", () => {
  const base = unsubscribedState(); // generation 2
  const recorded = stateLib.applyRecordDeliverabilitySuppression(base, {
    emailHash: HASH,
    now: NOW + 120_000,
    eventRef: "bounce:provider",
    facts: NO_FACTS,
  });
  assert.equal(recorded.state.generation, 2, "recording does not increment");
  // The deliverability stamp reads the CURRENT counter — it is a
  // generation-2 record of a generation-2 identity.
  assert.equal(recorded.state.suppressions.deliverability.generation, 2);
  const cleared = stateLib.applyClearDeliverabilitySuppression(recorded.state, {
    now: NOW + 180_000,
  });
  assert.equal(cleared.state.generation, 2, "clearing does not increment");
});

test("RD-D negative control: subscribe alone never increments, including the shipped re-consent", () => {
  const fresh = subscribedState();
  assert.equal(fresh.generation, undefined, "no incrementing event has run; the counter stays unmaterialized");
  assert.equal(stateLib.promotionGenerationOf(fresh), 1);

  const unsub = unsubscribedState(); // generation 2
  const resub = stateLib.applySubscribePromotion(unsub, {
    tombstoneLookup: NO_TOMBSTONE_LOOKUP,
    emailHash: HASH,
    source: "homepage",
    now: NOW + 120_000,
    facts: NO_FACTS,
    couponPayload: couponPayload(),
  }).state;
  assert.equal(resub.suppressions.global.active, false, "the shipped subscribe still clears the flag");
  assert.equal(resub.generation, 2, "but only the completed CEREMONY increments toward consent (G-3)");
});

test("RD-D consistency: erasure after an unsubscribe tombstones at the current counter, never counter + 1", () => {
  const unsub = unsubscribedState(); // generation 2
  const erased = stateLib.applyErasePromotionIdentity(unsub, {
    emailHash: HASH,
    now: NOW + 120_000,
    facts: NO_FACTS,
    keyedDigest: tombstoneLib.computePromotionKeyedDigest(EMAIL, KEY_V1),
    digestKeyVersion: 1,
    authorityId: "promotion:v1:hash-rdd",
  });
  assert.equal(erased.erasureRefused, undefined);
  assert.equal(erased.state.tombstones[0].generation, 2);
  assert.equal(erased.state.generation, 2, "erasure is not an incrementing event class");
});

/* --------------------------- consent events --------------------------- */

test("RD-D subscribe and unsubscribe append evidence at their generations; history survives", () => {
  const sub = subscribedState();
  assert.equal(sub.consentEvents.length, 1);
  assert.deepEqual(sub.consentEvents[0], {
    kind: "subscribe",
    generation: 1,
    serverAt: NOW,
    surface: "homepage",
    source: "homepage",
    disclosureVersion: "",
    disclosureHash: "",
    affirmativeAction: "subscribe",
  });

  const unsub = stateLib.applyUnsubscribePromotion(sub, {
    emailHash: HASH,
    now: NOW + 60_000,
    reason: "email_link",
    facts: NO_FACTS,
    evidence: { surface: "email", source: "unsubscribe_link", disclosureVersion: "v3" },
  }).state;
  assert.equal(unsub.consentEvents.length, 2);
  assert.equal(unsub.consentEvents[1].kind, "unsubscribe");
  assert.equal(unsub.consentEvents[1].generation, 2, "stamped with the generation it creates");
  assert.equal(unsub.consentEvents[1].surface, "email");
  assert.equal(unsub.consentEvents[1].disclosureVersion, "v3");

  const resub = stateLib.applySubscribePromotion(unsub, {
    tombstoneLookup: NO_TOMBSTONE_LOOKUP,
    emailHash: HASH,
    source: "homepage",
    now: NOW + 120_000,
    facts: NO_FACTS,
    couponPayload: couponPayload(),
  }).state;
  assert.deepEqual(
    resub.consentEvents.map((e) => [e.kind, e.generation]),
    [
      ["subscribe", 1],
      ["unsubscribe", 2],
      ["subscribe", 2],
    ],
    "the full history survives generation changes, in order (G-4)",
  );
});

test("RD-D events carry the R-8 digest stamp pair when the flow supplies one", () => {
  const digest = tombstoneLib.computePromotionKeyedDigest(EMAIL, KEY_V1);
  const sub = stateLib.applySubscribePromotion(null, {
    tombstoneLookup: NO_TOMBSTONE_LOOKUP,
    emailHash: HASH,
    source: "homepage",
    now: NOW,
    facts: NO_FACTS,
    couponPayload: couponPayload(),
    evidence: { digestStamp: { keyedDigest: digest, digestKeyVersion: 1 }, orderRef: "order-9" },
  }).state;
  assert.equal(sub.consentEvents[0].keyedDigest, digest);
  assert.equal(sub.consentEvents[0].digestKeyVersion, 1);
  assert.equal(sub.consentEvents[0].orderRef, "order-9");
  assert.equal(stateLib.isValidPromotionState(sub), true);
});

test("RD-D erasure removes the consent history with everything else (GM-7B(c))", () => {
  const unsub = unsubscribedState();
  assert.equal(unsub.consentEvents.length, 2);
  const erased = stateLib.applyErasePromotionIdentity(unsub, {
    emailHash: HASH,
    now: NOW + 120_000,
    facts: NO_FACTS,
    keyedDigest: tombstoneLib.computePromotionKeyedDigest(EMAIL, KEY_V1),
    digestKeyVersion: 1,
    authorityId: "promotion:v1:hash-rdd",
  }).state;
  assert.deepEqual(stateLib.promotionConsentEventsOf(erased), []);
  assert.equal(erased.pendingConsent, undefined);
});

/* ----------------- pending requests: creation and dedupe ----------------- */

test("RD-D case (a): a fresh explicit request on a SUPPRESSED address creates a current-generation pending request; suppression and generation stand", () => {
  const unsub = unsubscribedState(); // globally suppressed, generation 2
  const result = request(unsub, { now: NOW + 120_000 });
  assert.equal(result.outcome, "created");
  assert.equal(result.pendingConsent.generation, 2, "stamped with the CURRENT generation");
  assert.equal(result.pendingConsent.confirmationSendCount, 1, "the creation issuance");
  assert.equal(result.pendingConsent.tokenExpiresAt, NOW + 120_000 + TTL, "48h from issuance (T-1)");
  assert.equal(result.pendingConsent.status, "pending");
  assert.equal(result.state.generation, 2, "the request alone does not increment (G-6)");
  assert.equal(result.state.suppressions.global.active, true, "suppression remains fully in force");
  assert.notEqual(result.state.unsubscribedAt, null);
});

test("RD-D case (b): a repeat request dedupes — the live request stands, nothing is minted, nothing mutates", () => {
  const first = request(unsubscribedState(), { now: NOW + 120_000 });
  const before = clone(first.state);
  const second = request(first.state, {
    now: NOW + 180_000,
    requestId: "req-2",
    tokenHash: "hash-token-2",
  });
  assert.equal(second.outcome, "existing");
  assert.equal(second.pendingConsent.requestId, "req-1");
  assert.equal(second.pendingConsent.tokenHash, "hash-token-1");
  assert.equal(second.pendingConsent.confirmationSendCount, 1);
  assert.deepEqual(second.state, before, "zero mutation on a deduped repeat");
});

test("RD-D a fresh request replaces an expired slot and a confirmed slot", () => {
  const first = request(subscribedState(), { now: NOW });
  const expiredAt = NOW + TTL + 1;
  const replaced = request(first.state, {
    now: expiredAt,
    requestId: "req-2",
    tokenHash: "hash-token-2",
  });
  assert.equal(replaced.outcome, "created");
  assert.equal(replaced.pendingConsent.requestId, "req-2");
  assert.equal(replaced.pendingConsent.createdAt, expiredAt);

  const done = confirm(replaced.state, { now: expiredAt + 1_000, tokenHash: "hash-token-2" });
  assert.equal(done.result, "confirmed");
  const again = request(done.state, {
    now: expiredAt + 2_000,
    requestId: "req-3",
    tokenHash: "hash-token-3",
  });
  assert.equal(again.outcome, "created", "a completed ceremony does not block a later fresh request");
  assert.equal(again.pendingConsent.status, "pending");
});

test("RD-D request creation on a reduced (erased) identity is refused with zero mutation", () => {
  const erased = stateLib.applyErasePromotionIdentity(unsubscribedState(), {
    emailHash: HASH,
    now: NOW + 120_000,
    facts: NO_FACTS,
    keyedDigest: tombstoneLib.computePromotionKeyedDigest(EMAIL, KEY_V1),
    digestKeyVersion: 1,
    authorityId: "promotion:v1:hash-rdd",
  }).state;
  const before = clone(erased);
  const result = request(erased, { now: NOW + 180_000 });
  assert.equal(result.outcome, "not_created_reduced");
  assert.equal(result.pendingConsent, null);
  assert.deepEqual(result.state, before);
});

test("RD-D request creation for a new identity creates the document and stamps generation 1", () => {
  const result = request(null, { now: NOW });
  assert.equal(result.outcome, "created");
  assert.equal(result.pendingConsent.generation, 1);
  assert.equal(stateLib.isValidPromotionState(result.state), true);
});

/* --------------------------- token lifecycle --------------------------- */

test("RD-D ceremony completion (G-3): clears suppression once, increments once, stamps the record, appends the reconsent event", () => {
  const unsub = unsubscribedState(); // generation 2, suppressed at NOW+60_000
  const asked = request(unsub, { now: NOW + 120_000 });
  const done = confirm(asked.state, { now: NOW + 180_000 });
  assert.equal(done.result, "confirmed");
  const state = done.state;
  assert.equal(state.generation, 3, "exactly one increment, at completion (GM-6: completes at n+1)");
  assert.deepEqual(state.suppressions.global, {
    active: false,
    setAt: NOW + 60_000,
    generation: 3,
    eventRef: "reconsent_ceremony:req-1",
  });
  assert.equal(state.unsubscribedAt, null);
  assert.equal(state.subscribedAt, NOW + 180_000);
  assert.equal(state.pendingConsent.status, "confirmed");
  assert.equal(state.pendingConsent.confirmedAt, NOW + 180_000);
  const last = state.consentEvents[state.consentEvents.length - 1];
  assert.equal(last.kind, "reconsent");
  assert.equal(last.generation, 3);
  // And the suppression gate now admits commercial purposes again.
  assert.deepEqual(
    stateLib.evaluateSuppressionGate({
      suppressions: stateLib.promotionSuppressionsOf(state),
      purpose: "lifecycle_commercial",
    }),
    { permitted: true },
  );
});

test("RD-D replay of a completed token returns the recorded result with zero mutation (T-1)", () => {
  const asked = request(unsubscribedState(), { now: NOW + 120_000 });
  const done = confirm(asked.state, { now: NOW + 180_000 });
  const before = clone(done.state);
  const replay = confirm(done.state, { now: NOW + 240_000 });
  assert.equal(replay.result, "already_confirmed");
  assert.equal(replay.changed, false);
  assert.deepEqual(replay.state, before, "no new consent, no increment, no second event, no welcome issuance");
});

test("RD-D expiry is judged on server time: at tokenExpiresAt the token is expired, one ms earlier it completes", () => {
  const asked = request(subscribedState(), { now: NOW });
  const expiresAt = asked.pendingConsent.tokenExpiresAt;
  const before = clone(asked.state);
  const late = confirm(asked.state, { now: expiresAt });
  assert.equal(late.result, "expired");
  assert.deepEqual(late.state, before, "expiry mutates nothing — every replay returns the same result");

  const inTime = confirm(asked.state, { now: expiresAt - 1 });
  assert.equal(inTime.result, "confirmed");
});

test("RD-D case (c): a stale-generation token is inert — superseded, zero mutation, suppression intact", () => {
  // Pending request stamped generation 1; an unsubscribe then moves
  // the identity to generation 2 (the request's token is now stale).
  const asked = request(subscribedState(), { now: NOW });
  const unsub = stateLib.applyUnsubscribePromotion(asked.state, {
    emailHash: HASH,
    now: NOW + 60_000,
    reason: "email_link",
    facts: NO_FACTS,
  }).state;
  assert.equal(unsub.generation, 2);
  const before = clone(unsub);
  const presented = confirm(unsub, { now: NOW + 120_000 });
  assert.equal(presented.result, "superseded");
  assert.deepEqual(presented.state, before, "the presentation has no operative effect (G-2)");
  assert.equal(presented.state.suppressions.global.active, true);
});

test("RD-D an unrecognized token hash resolves as superseded with zero mutation; no slot resolves as no_pending_request", () => {
  const asked = request(subscribedState(), { now: NOW });
  const before = clone(asked.state);
  const wrong = confirm(asked.state, { now: NOW + 1_000, tokenHash: "hash-token-other" });
  assert.equal(wrong.result, "superseded");
  assert.deepEqual(wrong.state, before);

  const none = confirm(subscribedState(), { now: NOW });
  assert.equal(none.result, "no_pending_request");
});

test("RD-D re-issuance rotates the token: the old one is superseded, the new one completes, the count and expiry move", () => {
  const asked = request(subscribedState(), { now: NOW });
  const rotated = stateLib.applyReissuePromotionConfirmation(asked.state, {
    now: NOW + 60_000,
    tokenHash: "hash-token-2",
  });
  assert.equal(rotated.outcome, "reissued");
  assert.equal(rotated.state.pendingConsent.confirmationSendCount, 2);
  assert.equal(rotated.state.pendingConsent.tokenExpiresAt, NOW + 60_000 + TTL);

  const before = clone(rotated.state);
  const oldToken = confirm(rotated.state, { now: NOW + 120_000, tokenHash: "hash-token-1" });
  assert.equal(oldToken.result, "superseded");
  assert.deepEqual(oldToken.state, before, "presenting the rotated-away token mutates nothing");

  const newToken = confirm(rotated.state, { now: NOW + 120_000, tokenHash: "hash-token-2" });
  assert.equal(newToken.result, "confirmed");
});

test("RD-D re-issuance refuses a confirmed, expired, stale-generation, or absent request", () => {
  const asked = request(subscribedState(), { now: NOW });
  const expired = stateLib.applyReissuePromotionConfirmation(asked.state, {
    now: NOW + TTL,
    tokenHash: "hash-token-2",
  });
  assert.equal(expired.outcome, "not_live");

  const done = confirm(asked.state, { now: NOW + 1_000 });
  const afterConfirm = stateLib.applyReissuePromotionConfirmation(done.state, {
    now: NOW + 2_000,
    tokenHash: "hash-token-2",
  });
  assert.equal(afterConfirm.outcome, "no_pending_request");

  const unsub = stateLib.applyUnsubscribePromotion(asked.state, {
    emailHash: HASH,
    now: NOW + 60_000,
    reason: "email_link",
    facts: NO_FACTS,
  }).state;
  const stale = stateLib.applyReissuePromotionConfirmation(unsub, {
    now: NOW + 120_000,
    tokenHash: "hash-token-2",
  });
  assert.equal(stale.outcome, "not_live", "no token is minted for an inert request (G-2)");

  const absent = stateLib.applyReissuePromotionConfirmation(subscribedState(), {
    now: NOW,
    tokenHash: "hash-token-2",
  });
  assert.equal(absent.outcome, "no_pending_request");
});

/* --------------- suppression in force / classification --------------- */

test("RD-D a pending request admits no marketing send: the dispatch decision still refuses a suppressed identity", () => {
  const asked = request(unsubscribedState(), { now: NOW + 120_000 });
  const decision = guardLib.evaluatePromotionDispatchPermission({
    coordinatorState: asked.state,
    legacyState: null,
    legacyListMember: false,
  });
  assert.deepEqual(decision, { permitted: false, reason: "unsubscribed" });
  assert.deepEqual(
    stateLib.evaluateSuppressionGate({
      suppressions: stateLib.promotionSuppressionsOf(asked.state),
      purpose: "lifecycle_commercial",
    }),
    { permitted: false, reason: "globally_suppressed" },
  );
});

test("RD-D confirmation classification (AM-09): its own row — transactional-class quota, frequency-exempt, never suppression-blocked", () => {
  assert.equal(
    stateLib.classifyPromotionPurpose({ flow: "confirmation", containsPromotionalContent: false }),
    "confirmation",
  );
  assert.equal(stateLib.isCommercialPromotionPurpose("confirmation"), false);
  const suppressed = stateLib.promotionSuppressionsOf(unsubscribedState());
  assert.deepEqual(
    stateLib.evaluateSuppressionGate({ suppressions: suppressed, purpose: "confirmation" }),
    { permitted: true },
    "suppression does not block issuance to a live pending request (AM-09)",
  );
});

/* ----------------------------- welcomeState ----------------------------- */

test("RD-D welcomeState derives from the shipped facts: legacy couponSentAt import is the sent fact", () => {
  const couponSentAt = NOW - 86_400_000;
  const imported = stateLib.applySubscribePromotion(null, {
    tombstoneLookup: NO_TOMBSTONE_LOOKUP,
    emailHash: HASH,
    source: "homepage",
    now: NOW,
    facts: {
      state: {
        subscribedAt: NOW - 90_000_000,
        couponSentAt,
        updatedAt: couponSentAt,
      },
      inLegacySubscriptionList: null,
      inLegacySentList: null,
      inLegacyFollowupList: null,
    },
    couponPayload: couponPayload(),
  }).state;
  const welcome = stateLib.promotionWelcomeStateOf(imported);
  assert.equal(welcome.sentAt, couponSentAt);
  assert.equal(welcome.couponRef, stateLib.promotionJobId(HASH, "coupon"));
  assert.equal(imported.welcomeState?.sentAt, couponSentAt, "materialized by the subscribe transition");
});

test("RD-D welcome eligibility seeds at the subscription fact and is monotone across resubscribes", () => {
  const sub = subscribedState();
  assert.equal(stateLib.promotionWelcomeStateOf(sub).eligibleAt, NOW);
  assert.equal(stateLib.promotionWelcomeStateOf(sub).sentAt, undefined);

  const unsub = stateLib.applyUnsubscribePromotion(sub, {
    emailHash: HASH,
    now: NOW + 60_000,
    reason: "email_link",
    facts: NO_FACTS,
  }).state;
  const resub = stateLib.applySubscribePromotion(unsub, {
    tombstoneLookup: NO_TOMBSTONE_LOOKUP,
    emailHash: HASH,
    source: "homepage",
    now: NOW + 120_000,
    facts: NO_FACTS,
    couponPayload: couponPayload(),
  }).state;
  assert.equal(
    stateLib.promotionWelcomeStateOf(resub).eligibleAt,
    NOW,
    "the stored first eligibility stands; a moved subscribedAt never rewrites it",
  );
});

test("RD-D once-ever across a full unsubscribe → re-consent cycle: welcome history survives, no second coupon is minted (G-4)", () => {
  // Subscribe and let the coupon job be accepted (the welcome sent).
  let state = subscribedState();
  const claim = stateLib.applyClaimPromotionJob(state, { kind: "coupon", now: NOW + 1_000 });
  assert.notEqual(claim.claim, null);
  state = stateLib.applyCompletePromotionJob(claim.state, {
    kind: "coupon",
    outcome: { type: "accepted", provider: "resend", providerMessageId: "msg-1" },
    now: NOW + 2_000,
  }).state;
  const welcomeBefore = stateLib.promotionWelcomeStateOf(state);
  assert.equal(welcomeBefore.sentAt, NOW + 2_000);
  assert.equal(state.welcomeState?.sentAt, NOW + 2_000, "materialized at the acceptance commit");
  const couponJobBefore = clone(state.jobs.coupon);

  // Unsubscribe (generation 2), then the full ceremony (generation 3).
  state = stateLib.applyUnsubscribePromotion(state, {
    emailHash: HASH,
    now: NOW + 60_000,
    reason: "email_link",
    facts: NO_FACTS,
  }).state;
  const asked = request(state, { now: NOW + 120_000 });
  const done = confirm(asked.state, { now: NOW + 180_000 });
  assert.equal(done.result, "confirmed");
  state = done.state;

  assert.equal(state.generation, 3);
  assert.deepEqual(stateLib.promotionWelcomeStateOf(state), welcomeBefore, "history survives generations");
  assert.deepEqual(state.jobs.coupon, couponJobBefore, "the ceremony creates no job and re-mints no coupon");
  assert.equal(state.jobs.coupon.status, "accepted", "the once-ever job stands accepted, never rearmed by the ceremony");
});

/* ------------------------- flows through the client ------------------------- */

test("RD-D flows: the raw token exists only in the flow result; the stored document holds its hash alone", async () => {
  clientLib.__resetConsistencyCoordinatorMemoryForTests();
  const email = "ceremony@example.com";

  const asked = await flows.requestPromotionConsentFlow({ email });
  assert.equal(asked.outcome, "created");
  assert.equal(typeof asked.token, "string");
  assert.ok(asked.token.length >= 20);
  assert.equal(
    JSON.stringify(asked.state).includes(asked.token),
    false,
    "the raw token never enters stored state (T-1: hash only)",
  );
  assert.notEqual(asked.state.pendingConsent.tokenHash, asked.token);

  const repeat = await flows.requestPromotionConsentFlow({ email });
  assert.equal(repeat.outcome, "existing");
  assert.equal(repeat.token, null, "a deduped repeat returns no token — the original is unrecoverable by design");

  const wrong = await flows.confirmPromotionConsentFlow({ email, token: "not-the-token" });
  assert.equal(wrong.result, "superseded");

  const done = await flows.confirmPromotionConsentFlow({ email, token: asked.token });
  assert.equal(done.result, "confirmed");
  assert.equal(done.state.generation, 2, "a first ceremony completes at generation 2 (request at 1, +1)");

  const replay = await flows.confirmPromotionConsentFlow({ email, token: asked.token });
  assert.equal(replay.result, "already_confirmed");
});

test("RD-D flows: an already_confirmed retry repairs the projection when the first strict write failed", async () => {
  clientLib.__resetConsistencyCoordinatorMemoryForTests();
  const email = "projection-repair@example.com";
  const projectionKey = subsLib.emailStateKey(email);

  // Stage the identity from the Codex P2 reproduction: subscribed,
  // then unsubscribed, so the KV projection carries the unsubscribe
  // stamp legacy readers (incl. the review engine) suppress on.
  await flows.subscribePromotionFlow({ email, source: "homepage", couponCode: "FIRST50" });
  await flows.unsubscribePromotionFlow({ email, reason: "email_link" });
  const stale = await kv.get(projectionKey);
  assert.equal(typeof stale?.unsubscribedAt, "number", "the projection holds the unsubscribe stamp");

  const asked = await flows.requestPromotionConsentFlow({ email });
  assert.equal(asked.outcome, "created");

  // Inject the projection-write failure, scoped to this identity's
  // projection key; every other KV write passes through untouched.
  const originalSet = kv.set;
  let failProjection = true;
  kv.set = async (key, value, ...rest) => {
    if (failProjection && key === projectionKey) {
      throw new Error("injected projection write failure");
    }
    return originalSet(key, value, ...rest);
  };
  try {
    // First presentation: the coordinator commits the ceremony, the
    // strict republication fails, and the failure surfaces.
    await assert.rejects(flows.confirmPromotionConsentFlow({ email, token: asked.token }));
    // Nothing repaired the projection: it still shows the stale stamp.
    const stillStale = await kv.get(projectionKey);
    assert.equal(stillStale?.unsubscribedAt, stale.unsubscribedAt);

    // A non-confirmed replay performs zero mutation even while the
    // projection write is failing: it never reaches the projection
    // path (T-1 invariant — republication is confirmed-state only).
    const wrong = await flows.confirmPromotionConsentFlow({ email, token: "not-the-token" });
    assert.equal(wrong.result, "superseded");
    const untouched = await kv.get(projectionKey);
    assert.equal(untouched?.unsubscribedAt, stale.unsubscribedAt);

    // Retry with the same token while the write still fails: the
    // recorded result is already_confirmed, and its republication
    // failure surfaces exactly as the first attempt's did — never
    // swallowed into a success that leaves the projection stale.
    await assert.rejects(flows.confirmPromotionConsentFlow({ email, token: asked.token }));
  } finally {
    kv.set = originalSet;
  }

  // With the write healthy again, the same retry returns the
  // recorded completion AND repairs the projection to the
  // authoritative state: the unsubscribe stamp is gone.
  const retry = await flows.confirmPromotionConsentFlow({ email, token: asked.token });
  assert.equal(retry.result, "already_confirmed");
  assert.equal(retry.state.unsubscribedAt, null);
  const repaired = await kv.get(projectionKey);
  assert.equal(
    repaired?.unsubscribedAt,
    undefined,
    "the projection no longer suppresses the re-consented identity",
  );
});

test("RD-D flows: re-issuance rotates the token end to end", async () => {
  clientLib.__resetConsistencyCoordinatorMemoryForTests();
  const email = "rotation@example.com";
  const asked = await flows.requestPromotionConsentFlow({ email });
  const rotated = await flows.reissuePromotionConfirmationFlow({ email });
  assert.equal(rotated.outcome, "reissued");
  assert.notEqual(rotated.token, asked.token);

  const oldToken = await flows.confirmPromotionConsentFlow({ email, token: asked.token });
  assert.equal(oldToken.result, "superseded");
  const newToken = await flows.confirmPromotionConsentFlow({ email, token: rotated.token });
  assert.equal(newToken.result, "confirmed");
});

test("RD-D flows: subscribe events carry the R-8 digest stamp only when the register's current key is provisioned", async () => {
  clientLib.__resetConsistencyCoordinatorMemoryForTests();
  const email = "stamps@example.com";

  process.env.PROMOTION_DIGEST_KEY_V1 = KEY_V1;
  try {
    const stamped = await flows.subscribePromotionFlow({
      email,
      source: "homepage",
      couponCode: "FIRST50",
    });
    const event = stamped.state.consentEvents[stamped.state.consentEvents.length - 1];
    assert.equal(event.kind, "subscribe");
    assert.equal(event.digestKeyVersion, 1);
    assert.equal(event.keyedDigest, tombstoneLib.computePromotionKeyedDigest(email, KEY_V1));
  } finally {
    delete process.env.PROMOTION_DIGEST_KEY_V1;
  }

  const unstamped = await flows.subscribePromotionFlow({
    email: "stamps-two@example.com",
    source: "homepage",
    couponCode: "FIRST50",
  });
  const event = unstamped.state.consentEvents[unstamped.state.consentEvents.length - 1];
  assert.equal(event.keyedDigest, undefined, "unprovisioned register ⇒ no stamp");
  assert.equal(event.digestKeyVersion, undefined);
  assert.equal(
    unstamped.emailDelivered,
    false,
    "the subscribe itself proceeds exactly as before RD-D (no provider configured in this harness)",
  );
});
