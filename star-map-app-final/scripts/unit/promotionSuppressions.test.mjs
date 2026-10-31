/**
 * promotionSuppressions.test.mjs — CASL RD-B: contact authority &
 * identity/purpose boundaries.
 *
 * Governing basis: RD-A register §2.1/§2.3 (rows RD-B owns), A1 §4
 * (I-1…I-5), A1 §5 (P-1/P-2/P-3/P-5), A1 §8 (C-1/C-2), B1A-MODEL §3.1
 * (the coordinator document's `suppressions` extension is RD-B's).
 *
 * Pins:
 * - the three suppression scopes are DISTINCT records in the
 *   coordinator document (global / reviewOnly / deliverability),
 *   stamped by the authority's own transitions in step with the
 *   legacy subscription stamps — never a second store, never KV;
 * - pre-RD-B documents (no `suppressions` field) stay valid and read
 *   through derivation; malformed records fail validation;
 * - the deliverability axis never moves a consent fact, and clearing
 *   it never clears a consent suppression (I-5);
 * - a deliverability record that CREATES the document imports the
 *   legacy permission facts (the same import subscribe/unsubscribe
 *   run), so legacy consent is carried into the document — never
 *   shadowed by it (PR #457 P2 regression pins);
 * - purpose classification lives in the authority (P-1: promotional
 *   content reclassifies a message as commercial in whole);
 * - the suppression gate's scope discipline (P-3/P-5): global
 *   dominates commercial purposes only, review-only gates review
 *   only, transactional/service are never consent-gated;
 * - the dispatch fence consumes the records: a deliverability
 *   suppression refuses lifecycle dispatch with ZERO provider calls.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);
register("./consistencyCoordinator.hooks.mjs", import.meta.url);

process.env.STARMAP_CONSISTENCY_COORDINATOR_LOCAL = "1";
process.env.STARMAP_KV_ALLOW_LOCAL = "1";
process.env.RESEND_API_KEY = "re_test_promotion_rdb";
process.env.PROMOTION_EMAIL_FROM = "StarMapCo <promo@starmapco.com>";
delete process.env.SENDGRID_API_KEY;
delete process.env.PROMOTION_AUTOMATION_WEBHOOK_URL;

const stateLib = await import("../../src/lib/consistencyCoordinatorState.ts");
const clientLib = await import("../../src/lib/consistencyCoordinator.ts");
const guardLib = await import("../../src/lib/promotionDispatchGuard.ts");
const { drivePromotionJobs } = await import("../../src/lib/promotionCoordinator.ts");
const { ConsistencyCoordinatorDO } = await import(
  "../../src/durable-objects/ConsistencyCoordinatorDO.ts"
);

const NOW = Date.UTC(2026, 9, 31, 17, 0, 0);
const HASH = "hash-rdb";
const EMAIL = "person@example.com";
const NO_FACTS = {
  state: null,
  inLegacySubscriptionList: null,
  inLegacySentList: null,
  inLegacyFollowupList: null,
};
/** RD-C: creation-gate lookup facts for documents that carry no
 *  tombstones (the gate consults them only when a tombstone exists). */
const NO_TOMBSTONE_LOOKUP = { digestsByVersion: {}, nonRetiredVersions: [1], resolvableVersions: [] };
const EMPTY_RECORD = { active: false, setAt: null, generation: 1, eventRef: null };

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

/* ------------------------- document shape ------------------------- */

test("RD-B new documents carry the three scoped suppression records, all inactive", () => {
  const state = subscribedState();
  assert.deepEqual(state.suppressions, {
    global: EMPTY_RECORD,
    reviewOnly: EMPTY_RECORD,
    deliverability: EMPTY_RECORD,
  });
  assert.equal(stateLib.isValidPromotionState(state), true);
});

test("RD-B pre-RD-B documents stay valid; malformed suppression records fail validation", () => {
  const legacy = subscribedState();
  delete legacy.suppressions;
  assert.equal(stateLib.isValidPromotionState(legacy), true, "absent field is valid");

  const badGeneration = subscribedState();
  badGeneration.suppressions = {
    ...badGeneration.suppressions,
    global: { active: true, setAt: NOW, generation: 0, eventRef: "email_link" },
  };
  assert.equal(stateLib.isValidPromotionState(badGeneration), false, "generation 0 is malformed");

  const missingScope = subscribedState();
  missingScope.suppressions = {
    global: EMPTY_RECORD,
    deliverability: EMPTY_RECORD,
  };
  assert.equal(stateLib.isValidPromotionState(missingScope), false, "a missing scope is malformed");

  const badSetAt = subscribedState();
  badSetAt.suppressions = {
    ...badSetAt.suppressions,
    deliverability: { active: true, setAt: "yesterday", generation: 1, eventRef: "bounce" },
  };
  assert.equal(stateLib.isValidPromotionState(badSetAt), false, "a non-numeric setAt is malformed");
});

/* --------------------- unsubscribe / resubscribe --------------------- */

test("RD-B unsubscribe stamps the global record in the committing transition", () => {
  const at = NOW + 60_000;
  const state = unsubscribedState(at);
  assert.deepEqual(state.suppressions.global, {
    active: true,
    setAt: at,
    generation: 1,
    eventRef: "email_link",
  });
  assert.deepEqual(state.suppressions.reviewOnly, EMPTY_RECORD);
  assert.deepEqual(state.suppressions.deliverability, EMPTY_RECORD);
  // The record and the legacy stamp are one fact in two shapes.
  assert.equal(state.suppressions.global.active, state.unsubscribedAt !== null);
});

test("RD-B repeat unsubscribe leaves the original global stamp standing", () => {
  const first = unsubscribedState(NOW + 60_000);
  const again = stateLib.applyUnsubscribePromotion(first, {
    emailHash: HASH,
    now: NOW + 120_000,
    reason: "other_surface",
    facts: NO_FACTS,
  });
  assert.equal(again.wasAlreadyUnsubscribed, true);
  assert.deepEqual(again.state.suppressions.global, {
    active: true,
    setAt: NOW + 60_000,
    generation: 1,
    eventRef: "email_link",
  });
});

test("RD-B resubscribe clears only the global record's active flag; its history stands", () => {
  const unsub = unsubscribedState(NOW + 60_000);
  const resub = stateLib.applySubscribePromotion(unsub, {
    tombstoneLookup: NO_TOMBSTONE_LOOKUP,
    emailHash: HASH,
    source: "homepage",
    now: NOW + 120_000,
    facts: NO_FACTS,
    couponPayload: couponPayload(),
  }).state;
  assert.equal(resub.unsubscribedAt, null);
  assert.deepEqual(resub.suppressions.global, {
    active: false,
    setAt: NOW + 60_000,
    generation: 1,
    eventRef: "email_link",
  });
});

test("RD-B unsubscribe on a pre-RD-B document materializes the records", () => {
  const legacy = subscribedState();
  delete legacy.suppressions;
  const state = stateLib.applyUnsubscribePromotion(legacy, {
    emailHash: HASH,
    now: NOW + 60_000,
    reason: "email_link",
    facts: NO_FACTS,
  }).state;
  assert.equal(state.suppressions.global.active, true);
  assert.equal(state.suppressions.global.setAt, NOW + 60_000);
});

test("RD-B legacy import of an unsubscribed legacy state stamps the global record", () => {
  const legacyAt = NOW - 86_400_000;
  const result = stateLib.applyUnsubscribePromotion(null, {
    emailHash: HASH,
    now: NOW,
    reason: "email_link",
    facts: {
      state: {
        subscribedAt: legacyAt - 60_000,
        unsubscribedAt: legacyAt,
        unsubscribeReason: "email_link",
        updatedAt: legacyAt,
      },
      inLegacySubscriptionList: null,
      inLegacySentList: null,
      inLegacyFollowupList: null,
    },
  });
  assert.equal(result.wasAlreadyUnsubscribed, true);
  assert.deepEqual(result.state.suppressions.global, {
    active: true,
    setAt: legacyAt,
    generation: 1,
    eventRef: "legacy_import",
  });
});

test("RD-B promotionSuppressionsOf derives the global record for unstamped documents", () => {
  const legacy = subscribedState();
  delete legacy.suppressions;
  legacy.unsubscribedAt = NOW + 5_000;
  legacy.unsubscribeReason = "email_link";
  const derived = stateLib.promotionSuppressionsOf(legacy);
  assert.deepEqual(derived.global, {
    active: true,
    setAt: NOW + 5_000,
    generation: 1,
    eventRef: "email_link",
  });
  assert.deepEqual(derived.reviewOnly, EMPTY_RECORD);
  assert.deepEqual(derived.deliverability, EMPTY_RECORD);

  const active = subscribedState();
  delete active.suppressions;
  assert.deepEqual(stateLib.promotionSuppressionsOf(active).global, EMPTY_RECORD);
});

/* ------------------------- deliverability axis ------------------------- */

test("RD-B recording a deliverability suppression moves no consent fact", () => {
  const before = subscribedState();
  const { state, changed } = stateLib.applyRecordDeliverabilitySuppression(before, {
    emailHash: HASH,
    now: NOW + 30_000,
    eventRef: "resend:bounce",
    facts: NO_FACTS,
  });
  assert.equal(changed, true);
  assert.deepEqual(state.suppressions.deliverability, {
    active: true,
    setAt: NOW + 30_000,
    generation: 1,
    eventRef: "resend:bounce",
  });
  assert.equal(state.subscribedAt, before.subscribedAt);
  assert.equal(state.unsubscribedAt, null);
  assert.deepEqual(state.suppressions.global, EMPTY_RECORD);
  assert.deepEqual(state.suppressions.reviewOnly, EMPTY_RECORD);

  const again = stateLib.applyRecordDeliverabilitySuppression(state, {
    emailHash: HASH,
    now: NOW + 40_000,
    eventRef: "resend:complaint",
    facts: NO_FACTS,
  });
  assert.equal(again.changed, false, "recording is idempotent");
  assert.equal(again.state.suppressions.deliverability.eventRef, "resend:bounce");
});

test("RD-B clearing deliverability never clears a consent suppression", () => {
  let state = unsubscribedState();
  state = stateLib.applyRecordDeliverabilitySuppression(state, {
    emailHash: HASH,
    now: NOW + 90_000,
    eventRef: "resend:bounce",
    facts: NO_FACTS,
  }).state;
  const cleared = stateLib.applyClearDeliverabilitySuppression(state, { now: NOW + 100_000 });
  assert.equal(cleared.changed, true);
  assert.equal(cleared.state.suppressions.deliverability.active, false);
  assert.equal(
    cleared.state.suppressions.global.active,
    true,
    "the global unsubscribe stands (negative control)",
  );
  assert.notEqual(cleared.state.unsubscribedAt, null);

  const noop = stateLib.applyClearDeliverabilitySuppression(cleared.state, { now: NOW + 110_000 });
  assert.equal(noop.changed, false, "clearing an inactive record is a no-op");
});

/* ------- deliverability-created documents and legacy consent ------- */
/* Codex P2 on PR #457: a deliverability record that first creates the
 * coordinator document used to create it EMPTY — the legacy consent
 * stayed in KV, but the dispatch fence reads legacy facts only when
 * NO document exists, so the empty document shadowed the legacy
 * record and, once the flag cleared, refused the subscriber
 * no_permission_record indefinitely. The creating record now imports
 * the legacy permission facts, exactly as subscribe/unsubscribe do. */

const LEGACY_STATE_FACTS = {
  state: {
    subscribedAt: NOW - 86_400_000,
    unsubscribedAt: null,
    unsubscribeReason: null,
    updatedAt: NOW - 86_400_000,
  },
  inLegacySubscriptionList: null,
  inLegacySentList: null,
  inLegacyFollowupList: null,
};
const LEGACY_LIST_FACTS = {
  state: null,
  inLegacySubscriptionList: true,
  inLegacySentList: null,
  inLegacyFollowupList: null,
};
const dispatchDecision = (coordinatorState) =>
  guardLib.evaluatePromotionDispatchPermission({
    coordinatorState,
    legacyState: null,
    legacyListMember: false,
  });

test("RD-B regression (PR #457): recording deliverability on a legacy-only subscriber refuses as deliverability_suppressed while the flag stands", () => {
  const { state } = stateLib.applyRecordDeliverabilitySuppression(null, {
    emailHash: HASH,
    now: NOW,
    eventRef: "resend:bounce",
    facts: LEGACY_STATE_FACTS,
  });
  // The creating record imported the legacy consent fact: the
  // document was born carrying the identity's subscription rather
  // than shadowing it.
  assert.equal(state.subscribedAt, NOW - 86_400_000);
  assert.equal(state.suppressions.deliverability.active, true);
  assert.deepEqual(dispatchDecision(state), {
    permitted: false,
    reason: "deliverability_suppressed",
  });
});

test("RD-B regression (PR #457): clearing deliverability restores a legacy-only subscriber's permission", () => {
  const recorded = stateLib.applyRecordDeliverabilitySuppression(null, {
    emailHash: HASH,
    now: NOW,
    eventRef: "resend:bounce",
    facts: LEGACY_LIST_FACTS,
  }).state;
  assert.equal(recorded.legacySubscribed, true, "list-proved consent imported at creation");
  assert.deepEqual(dispatchDecision(recorded), {
    permitted: false,
    reason: "deliverability_suppressed",
  });
  const cleared = stateLib.applyClearDeliverabilitySuppression(recorded, {
    now: NOW + 60_000,
  }).state;
  // The regression pin: before the fix this decision was
  // no_permission_record — the deliverability-created document
  // carried no subscription fact, permanently stripping the legacy
  // subscriber's sending permission.
  assert.deepEqual(dispatchDecision(cleared), { permitted: true });
});

test("RD-B regression (PR #457): a deliverability-created document manufactures no consent", () => {
  const recorded = stateLib.applyRecordDeliverabilitySuppression(null, {
    emailHash: HASH,
    now: NOW,
    eventRef: "resend:bounce",
    facts: NO_FACTS,
  }).state;
  assert.equal(recorded.subscribedAt, null);
  assert.equal(recorded.legacySubscribed, false);
  const cleared = stateLib.applyClearDeliverabilitySuppression(recorded, {
    now: NOW + 60_000,
  }).state;
  // Negative control: with no legacy consent anywhere, clearing the
  // flag must NOT conjure permission — the import preserves facts,
  // it never invents them.
  assert.deepEqual(dispatchDecision(cleared), {
    permitted: false,
    reason: "no_permission_record",
  });
});

test("RD-B deliverability RPCs round-trip through the client and the DO", async () => {
  clientLib.__resetConsistencyCoordinatorMemoryForTests();
  const client = clientLib.createConsistencyCoordinatorClient();
  const name = clientLib.promotionCoordinatorName(clientLib.coordinatorEmailHash(EMAIL));

  const recorded = await client.recordDeliverabilitySuppression(name, {
    emailHash: clientLib.coordinatorEmailHash(EMAIL),
    now: NOW,
    eventRef: "resend:bounce",
    facts: NO_FACTS,
  });
  assert.equal(recorded.state.suppressions.deliverability.active, true);
  assert.equal(recorded.state.subscribedAt, null, "a deliverability-only document holds no consent");

  const cleared = await client.clearDeliverabilitySuppression(name, { now: NOW + 1_000 });
  assert.equal(cleared.state.suppressions.deliverability.active, false);

  const missing = await client.clearDeliverabilitySuppression(
    clientLib.promotionCoordinatorName("nonexistent"),
    { now: NOW },
  );
  assert.equal(missing.state, null);

  // DO round-trip: the record persists through storage and validates on load.
  const rows = new Map();
  const sql = {
    exec(sqlText, ...params) {
      const head = sqlText.trimStart().slice(0, 6).toUpperCase();
      if (head.startsWith("CREATE")) return { toArray: () => [] };
      if (head.startsWith("SELECT")) {
        const row = rows.get(params[0]);
        return { toArray: () => (row ? [row] : []) };
      }
      if (head.startsWith("INSERT")) {
        const [objectId, stateJson, updatedAt] = params;
        rows.set(objectId, { object_id: objectId, state_json: stateJson, updated_at: updatedAt });
        return { toArray: () => [] };
      }
      throw new Error(`unexpected SQL: ${sqlText.slice(0, 60)}`);
    },
  };
  const ctx = {
    id: { name },
    storage: {
      sql,
      async getAlarm() {
        return null;
      },
      async setAlarm() {},
      async deleteAlarm() {},
    },
    blockConcurrencyWhile(fn) {
      return fn();
    },
  };
  const coord = new ConsistencyCoordinatorDO(ctx, {});
  await coord.recordDeliverabilitySuppression({
    emailHash: clientLib.coordinatorEmailHash(EMAIL),
    now: NOW,
    eventRef: "resend:complaint",
    facts: NO_FACTS,
  });
  const loaded = await coord.getPromotionState();
  assert.equal(loaded.suppressions.deliverability.active, true);
  assert.equal(loaded.suppressions.deliverability.eventRef, "resend:complaint");
});

/* ------------------------- purpose classification ------------------------- */

test("RD-B P-1 classification: promotional content reclassifies the whole message", () => {
  const classify = stateLib.classifyPromotionPurpose;
  assert.equal(classify({ flow: "transactional", containsPromotionalContent: false }), "transactional");
  assert.equal(classify({ flow: "transactional", containsPromotionalContent: true }), "lifecycle_commercial");
  assert.equal(classify({ flow: "service", containsPromotionalContent: false }), "service");
  assert.equal(classify({ flow: "service", containsPromotionalContent: true }), "lifecycle_commercial");
  assert.equal(classify({ flow: "checkout_recovery", containsPromotionalContent: false }), "service");
  assert.equal(
    classify({ flow: "checkout_recovery", containsPromotionalContent: true }),
    "checkout_recovery_promotional",
  );
  assert.equal(classify({ flow: "lifecycle", containsPromotionalContent: false }), "lifecycle_commercial");
  assert.equal(classify({ flow: "review", containsPromotionalContent: false }), "review_request");
});

/* ----------------------------- suppression gate ----------------------------- */

function suppressionsWith(overrides) {
  return {
    global: { ...EMPTY_RECORD, ...(overrides.global ?? {}) },
    reviewOnly: { ...EMPTY_RECORD, ...(overrides.reviewOnly ?? {}) },
    deliverability: { ...EMPTY_RECORD, ...(overrides.deliverability ?? {}) },
  };
}
const gate = (suppressions, purpose) =>
  stateLib.evaluateSuppressionGate({ suppressions, purpose });
const COMMERCIAL = ["checkout_recovery_promotional", "lifecycle_commercial", "review_request"];

test("RD-B gate: no suppression permits every purpose", () => {
  for (const purpose of [...COMMERCIAL, "transactional", "service"]) {
    assert.deepEqual(gate(suppressionsWith({}), purpose), { permitted: true });
  }
});

test("RD-B gate: global suppression dominates commercial purposes only (P-3/P-5)", () => {
  const suppressions = suppressionsWith({ global: { active: true, setAt: NOW, eventRef: "email_link" } });
  for (const purpose of COMMERCIAL) {
    assert.deepEqual(gate(suppressions, purpose), {
      permitted: false,
      reason: "globally_suppressed",
    });
  }
  // Negative control: a marketing unsubscribe never blocks the
  // customer's own transactional or service mail.
  assert.deepEqual(gate(suppressions, "transactional"), { permitted: true });
  assert.deepEqual(gate(suppressions, "service"), { permitted: true });
});

test("RD-B gate: review-only suppression gates review sends only (U-7)", () => {
  const suppressions = suppressionsWith({ reviewOnly: { active: true, setAt: NOW } });
  assert.deepEqual(gate(suppressions, "review_request"), {
    permitted: false,
    reason: "review_suppressed",
  });
  // Negative control: a review-only opt-out is never read as a wider
  // suppression, in either direction.
  assert.deepEqual(gate(suppressions, "lifecycle_commercial"), { permitted: true });
  assert.deepEqual(gate(suppressions, "checkout_recovery_promotional"), { permitted: true });
});

test("RD-B gate: deliverability suppression blocks commercial sends (I-5)", () => {
  const suppressions = suppressionsWith({ deliverability: { active: true, setAt: NOW } });
  for (const purpose of COMMERCIAL) {
    assert.deepEqual(gate(suppressions, purpose), {
      permitted: false,
      reason: "deliverability_suppressed",
    });
  }
  assert.deepEqual(gate(suppressions, "transactional"), { permitted: true });
  assert.deepEqual(gate(suppressions, "service"), { permitted: true });
});

/* ------------------------------ dispatch fence ------------------------------ */

test("RD-B fence: a deliverability-suppressed subscriber is refused at dispatch", () => {
  const state = stateLib.applyRecordDeliverabilitySuppression(subscribedState(), {
    emailHash: HASH,
    now: NOW + 30_000,
    eventRef: "resend:bounce",
    facts: NO_FACTS,
  }).state;
  assert.deepEqual(
    guardLib.evaluatePromotionDispatchPermission({
      coordinatorState: state,
      legacyState: null,
      legacyListMember: false,
    }),
    { permitted: false, reason: "deliverability_suppressed" },
  );
});

test("RD-B fence: unstamped documents decide exactly as before RD-B", () => {
  const unsub = unsubscribedState();
  delete unsub.suppressions;
  assert.deepEqual(
    guardLib.evaluatePromotionDispatchPermission({
      coordinatorState: unsub,
      legacyState: null,
      legacyListMember: false,
    }),
    { permitted: false, reason: "unsubscribed" },
  );
  const active = subscribedState();
  delete active.suppressions;
  assert.deepEqual(
    guardLib.evaluatePromotionDispatchPermission({
      coordinatorState: active,
      legacyState: null,
      legacyListMember: false,
    }),
    { permitted: true },
  );
});

test("RD-B fence: a deliverability-suppressed drive makes zero provider calls", async () => {
  clientLib.__resetConsistencyCoordinatorMemoryForTests();
  const client = clientLib.createConsistencyCoordinatorClient();
  const emailHash = clientLib.coordinatorEmailHash(EMAIL);
  const name = clientLib.promotionCoordinatorName(emailHash);

  await client.subscribePromotion(name, {
    tombstoneLookup: NO_TOMBSTONE_LOOKUP,
    emailHash,
    source: "homepage",
    now: NOW,
    facts: NO_FACTS,
    couponPayload: couponPayload(),
  });
  await client.recordDeliverabilitySuppression(name, {
    emailHash,
    now: NOW + 1_000,
    eventRef: "resend:bounce",
    facts: NO_FACTS,
  });

  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: "email_1" }),
      text: async () => "{}",
      headers: { get: () => null },
    };
  };
  const drive = await drivePromotionJobs(client, name, EMAIL);
  assert.equal(calls.length, 0, "the fence refuses before any provider leg (negative control)");
  assert.equal(drive.couponDelivered, false);
  const state = await client.getPromotionState(name);
  assert.notEqual(
    state.jobs.coupon.status,
    "accepted",
    "a refused send records no acceptance; the claim restores for a later drive",
  );
});
