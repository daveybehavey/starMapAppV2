/**
 * promotionTombstones.test.mjs — CASL RD-C build (issue #458).
 *
 * Pins the GM-7 tombstone mechanism against the S88-6 suite spec:
 * - §3.1 schema & retention: GM-7A records carry exactly six fields —
 *   address-, token-, content- or extra-field-bearing records are
 *   rejected; tombstones have NO expiry path; rotation records its
 *   act (chosen retirement date, interval/window as recorded
 *   parameters, never hard-coded) and re-keys nothing; retirement is
 *   refused on elapsed time or an unscoped basis and permitted only
 *   on a completed sweep or a gate-recorded acceptance of lookup loss.
 * - §3.2 lookup & re-key: a hit under any non-retired digest-key
 *   version is a hit, before/during/after rotation; an unavailable
 *   required key or an unaccountable stored record resolves
 *   INDETERMINATE, never as a miss; the sweep re-stamps only from a
 *   legitimately held address, never reacquires an erased one, and
 *   lookup equivalence is verified after migration.
 * - §3.3 creation & reconstruction (incl. AT-13): erasure reduces the
 *   identity's evidence to its tombstone and nothing else; creation
 *   consults the tombstone store first — a hit creates the identity
 *   already-suppressed at tombstone generation + 1; an indeterminate
 *   lookup REFUSES the creation (negative control: no eligible
 *   identity, no mutation); both race orderings, plus concurrent
 *   creation through the actual coordinator boundary; deleted or
 *   missing evidence never establishes consent (no deletion path
 *   exists in the candidate, and unverifiable evidence refuses).
 * - Production-safety pin: with the digest-key system entirely
 *   unprovisioned, an ordinary tombstone-free subscribe proceeds
 *   exactly as before RD-C.
 *
 * Suite evidence discipline (S88-6 §3): synthetic records and
 * disposable test keys only, in the local in-memory coordinator + KV
 * fallback. Nothing here touches production state or sends anything.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);
register("./consistencyCoordinator.hooks.mjs", import.meta.url);

process.env.STARMAP_CONSISTENCY_COORDINATOR_LOCAL = "1";
process.env.STARMAP_KV_ALLOW_LOCAL = "1";
process.env.RESEND_API_KEY = "resend_test_key";
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
const { kv, KvReadError } = await import("../../src/lib/kv.ts");
const subsLib = await import("../../src/lib/promotionSubscriptions.ts");

const KEY_V1 = "test-digest-key-v1-0123456789";
const KEY_V2 = "test-digest-key-v2-0123456789";
const T0 = Date.UTC(2026, 9, 31, 18, 0, 0);
const NO_FACTS = {
  state: null,
  inLegacySubscriptionList: null,
  inLegacySentList: null,
  inLegacyFollowupList: null,
};

let emailCounter = 0;
function freshEmail() {
  emailCounter += 1;
  return `rdc-${emailCounter}@example.com`;
}

function couponPayload(email) {
  return {
    email,
    couponCode: "FIRST50",
    kind: "coupon",
    subject: "Welcome",
    text: "welcome",
    html: "<p>welcome</p>",
  };
}

function factsFor(email, register, env) {
  return tombstoneLib.gatherPromotionTombstoneLookupFactsSync({
    normalizedEmail: email,
    register,
    env,
  });
}

function envWithKeys(map) {
  const env = {};
  if (map.v1) env.PROMOTION_DIGEST_KEY_V1 = map.v1;
  if (map.v2) env.PROMOTION_DIGEST_KEY_V2 = map.v2;
  return env;
}

function makeTombstone(email, { version = 1, key = KEY_V1, generation = 1, at = T0 } = {}) {
  return {
    keyedDigest: tombstoneLib.computePromotionKeyedDigest(email, key),
    digestKeyVersion: version,
    generation,
    terminalEventClass: "erasure_with_suppression",
    terminalAt: at,
    authorityId: `promotion:v1:${clientLib.coordinatorEmailHash(email)}`,
  };
}

function subscribeInput(email, facts, now = T0) {
  return {
    emailHash: clientLib.coordinatorEmailHash(email),
    source: "test",
    now,
    facts: NO_FACTS,
    couponPayload: couponPayload(email),
    tombstoneLookup: facts,
  };
}

function eraseInput(email, { version = 1, key = KEY_V1, now = T0 } = {}) {
  const emailHash = clientLib.coordinatorEmailHash(email);
  return {
    emailHash,
    now,
    facts: NO_FACTS,
    keyedDigest: tombstoneLib.computePromotionKeyedDigest(email, key),
    digestKeyVersion: version,
    authorityId: clientLib.promotionCoordinatorName(emailHash),
  };
}

/* ------------------------- §3.1 schema ------------------------- */

test("GM-7A schema: exactly six fields validate, for each terminal class", () => {
  const email = freshEmail();
  for (const terminalEventClass of tombstoneLib.PROMOTION_TERMINAL_EVENT_CLASSES) {
    const tombstone = { ...makeTombstone(email), terminalEventClass };
    assert.equal(tombstoneLib.isValidPromotionTombstone(tombstone), true, terminalEventClass);
    assert.deepEqual(Object.keys(tombstone).sort(), [
      "authorityId",
      "digestKeyVersion",
      "generation",
      "keyedDigest",
      "terminalAt",
      "terminalEventClass",
    ]);
  }
});

test("GM-7A schema: address, token, content, reason, or any extra field is rejected", () => {
  const email = freshEmail();
  const good = makeTombstone(email);
  const rejected = [
    { ...good, email },
    { ...good, address: email },
    { ...good, token: "unsubscribe-token" },
    { ...good, content: "message body" },
    { ...good, reason: "user asked" },
    { ...good, note: "extra" },
    { ...good, keyedDigest: "" },
    { ...good, digestKeyVersion: 0 },
    { ...good, digestKeyVersion: "1" },
    { ...good, generation: 0 },
    { ...good, generation: 1.5 },
    { ...good, terminalEventClass: "something_else" },
    { ...good, terminalAt: "now" },
    { ...good, authorityId: "" },
  ];
  for (const candidate of rejected) {
    assert.equal(tombstoneLib.isValidPromotionTombstone(candidate), false, JSON.stringify(candidate));
  }
  const { authorityId, ...missingField } = good;
  void authorityId;
  assert.equal(tombstoneLib.isValidPromotionTombstone(missingField), false);
});

test("GM-7A: a real tombstone carries no address material anywhere in its serialization", () => {
  const email = freshEmail();
  const tombstone = makeTombstone(email);
  assert.ok(!JSON.stringify(tombstone).includes(email));
  assert.ok(!JSON.stringify(tombstone).includes("example.com"));
});

/* --------------------- §3.1 register / retention --------------------- */

test("GM-7C rotation: creates the new version, records the act and its parameters, re-keys nothing", () => {
  const register = tombstoneLib.initialPromotionDigestKeyRegister(T0);
  const tombstoneBefore = makeTombstone(freshEmail());
  const rotated = tombstoneLib.applyRotatePromotionDigestKeys(register, {
    now: T0 + 1000,
    expectedRevision: 0,
    outgoingChosenRetirementAt: T0 + 90 * 24 * 3600 * 1000,
    rotationIntervalDays: 90,
    rotationWindowDays: 14,
  });
  assert.equal(rotated.changed, true);
  assert.equal(rotated.register.currentVersion, 2);
  const v1 = rotated.register.versions["1"];
  assert.equal(v1.status, "active");
  assert.equal(v1.chosenRetirementAt, T0 + 90 * 24 * 3600 * 1000);
  assert.equal(v1.rotationIntervalDays, 90);
  assert.equal(v1.rotationWindowDays, 14);
  assert.deepEqual(rotated.register.events, [
    {
      kind: "rotation",
      at: T0 + 1000,
      version: 1,
      newVersion: 2,
      outgoingChosenRetirementAt: T0 + 90 * 24 * 3600 * 1000,
    },
  ]);
  // Re-keys nothing in place: an existing record keeps its v1 stamp.
  assert.equal(tombstoneBefore.digestKeyVersion, 1);
  assert.deepEqual(tombstoneLib.nonRetiredDigestKeyVersions(rotated.register), [2, 1]);
});

test("GM-7C rotation: interval/window are recorded parameters — absent means null, never a code default", () => {
  const register = tombstoneLib.initialPromotionDigestKeyRegister(T0);
  const rotated = tombstoneLib.applyRotatePromotionDigestKeys(register, {
    now: T0 + 1000,
    expectedRevision: 0,
    outgoingChosenRetirementAt: null,
  });
  assert.equal(rotated.register.versions["1"].rotationIntervalDays, null);
  assert.equal(rotated.register.versions["1"].rotationWindowDays, null);
  assert.equal(rotated.register.versions["1"].chosenRetirementAt, null);
});

test("GM-7C retirement: refused without a permitted basis — a passed retirement date alone retires nothing", () => {
  let register = tombstoneLib.initialPromotionDigestKeyRegister(T0);
  register = tombstoneLib.applyRotatePromotionDigestKeys(register, {
    now: T0 + 1000,
    expectedRevision: 0,
    outgoingChosenRetirementAt: T0 + 2000, // already in the past by decision time
  }).register;
  const refused = tombstoneLib.applyRetirePromotionDigestKeyVersion(register, {
    now: T0 + 3000,
    expectedRevision: register.revision,
    version: 1,
    basis: null,
  });
  assert.equal(refused.changed, false);
  assert.equal(refused.refusal, "retirement_basis_required");
  assert.equal(refused.register.versions["1"].status, "active");
});

test("GM-7C retirement: permitted on sweep-complete and on gate-accepted lookup loss; current version and stale acts refused", () => {
  const base = () =>
    tombstoneLib.applyRotatePromotionDigestKeys(
      tombstoneLib.initialPromotionDigestKeyRegister(T0),
      { now: T0 + 1000, expectedRevision: 0, outgoingChosenRetirementAt: null },
    ).register;

  const swept = tombstoneLib.applyRetirePromotionDigestKeyVersion(base(), {
    now: T0 + 2000,
    expectedRevision: 1,
    version: 1,
    basis: "rekey_sweep_complete",
  });
  assert.equal(swept.changed, true);
  assert.equal(swept.register.versions["1"].status, "retired");
  assert.equal(swept.register.versions["1"].retirementBasis, "rekey_sweep_complete");
  assert.deepEqual(tombstoneLib.nonRetiredDigestKeyVersions(swept.register), [2]);

  const accepted = tombstoneLib.applyRetirePromotionDigestKeyVersion(base(), {
    now: T0 + 2000,
    expectedRevision: 1,
    version: 1,
    basis: "gate_accepted_lookup_loss",
  });
  assert.equal(accepted.changed, true);

  const current = tombstoneLib.applyRetirePromotionDigestKeyVersion(base(), {
    now: T0 + 2000,
    expectedRevision: 1,
    version: 2,
    basis: "rekey_sweep_complete",
  });
  assert.equal(current.changed, false);
  assert.equal(current.refusal, "cannot_retire_current_version");

  const stale = tombstoneLib.applyRetirePromotionDigestKeyVersion(base(), {
    now: T0 + 2000,
    expectedRevision: 99,
    version: 1,
    basis: "rekey_sweep_complete",
  });
  assert.equal(stale.changed, false);
  assert.match(stale.refusal, /stale_register_revision/);
});

test("GM-7B(a): no expiry mechanism exists on the register or the tombstone record", () => {
  const register = tombstoneLib.initialPromotionDigestKeyRegister(T0);
  const serialized = JSON.stringify(register) + JSON.stringify(makeTombstone(freshEmail()));
  assert.ok(!/ttl|expiresAt|expiry/i.test(serialized), serialized);
});

/* ------------------------- §3.2 lookup ------------------------- */

test("GM-7C(b) lookup: a hit under an old non-retired version is a hit after rotation", () => {
  const email = freshEmail();
  const tombstone = makeTombstone(email, { version: 1, key: KEY_V1 });
  let register = tombstoneLib.initialPromotionDigestKeyRegister(T0);
  register = tombstoneLib.applyRotatePromotionDigestKeys(register, {
    now: T0 + 1000,
    expectedRevision: 0,
    outgoingChosenRetirementAt: null,
  }).register;
  const facts = factsFor(email, register, envWithKeys({ v1: KEY_V1, v2: KEY_V2 }));
  const outcome = tombstoneLib.evaluatePromotionTombstoneLookup({
    tombstones: [tombstone],
    facts,
  });
  assert.equal(outcome.outcome, "hit");
  assert.equal(outcome.tombstone, tombstone);
});

test("GM-7C(b) lookup: a tombstone under a retired version is invisible only via the retirement act's basis", () => {
  const email = freshEmail();
  const tombstone = makeTombstone(email, { version: 1, key: KEY_V1 });
  let register = tombstoneLib.initialPromotionDigestKeyRegister(T0);
  register = tombstoneLib.applyRotatePromotionDigestKeys(register, {
    now: T0 + 1000,
    expectedRevision: 0,
    outgoingChosenRetirementAt: null,
  }).register;
  register = tombstoneLib.applyRetirePromotionDigestKeyVersion(register, {
    now: T0 + 2000,
    expectedRevision: register.revision,
    version: 1,
    basis: "gate_accepted_lookup_loss",
  }).register;
  const facts = factsFor(email, register, envWithKeys({ v1: KEY_V1, v2: KEY_V2 }));
  assert.equal(
    tombstoneLib.evaluatePromotionTombstoneLookup({ tombstones: [tombstone], facts }).outcome,
    "no_hit",
  );
});

test("AC-17 lookup: a tombstone under a version the snapshot never saw resolves indeterminate, never invisible", () => {
  const email = freshEmail();
  const tombstone = makeTombstone(email, { version: 2, key: KEY_V2 });
  // The caller's register snapshot predates the rotation that created
  // v2: it records v1 only, so v2 is NEITHER live NOR affirmatively
  // retired in the gathered evidence. Absence from the snapshot is
  // not retirement — the tombstone cannot be acquitted by it.
  const staleRegister = tombstoneLib.initialPromotionDigestKeyRegister(T0);
  const facts = factsFor(email, staleRegister, envWithKeys({ v1: KEY_V1 }));
  const outcome = tombstoneLib.evaluatePromotionTombstoneLookup({
    tombstones: [tombstone],
    facts,
  });
  assert.equal(outcome.outcome, "indeterminate");
  assert.match(outcome.reason, /digest_key_version_unknown:v2/);
});

test("AC-17 lookup: a live version whose key is unavailable resolves indeterminate, never a miss", () => {
  const email = freshEmail();
  const tombstone = makeTombstone(email, { version: 1, key: KEY_V1 });
  let register = tombstoneLib.initialPromotionDigestKeyRegister(T0);
  register = tombstoneLib.applyRotatePromotionDigestKeys(register, {
    now: T0 + 1000,
    expectedRevision: 0,
    outgoingChosenRetirementAt: null,
  }).register;
  // v1 is non-retired but its key material is gone from the environment.
  const facts = factsFor(email, register, envWithKeys({ v2: KEY_V2 }));
  const outcome = tombstoneLib.evaluatePromotionTombstoneLookup({
    tombstones: [tombstone],
    facts,
  });
  assert.equal(outcome.outcome, "indeterminate");
  assert.match(outcome.reason, /digest_key_unavailable:v1/);
});

test("AC-17 lookup: a stored tombstone that does not verify under its live version resolves indeterminate", () => {
  const email = freshEmail();
  const foreign = makeTombstone("someone-else@example.com", { version: 1, key: KEY_V1 });
  const register = tombstoneLib.initialPromotionDigestKeyRegister(T0);
  const facts = factsFor(email, register, envWithKeys({ v1: KEY_V1 }));
  const outcome = tombstoneLib.evaluatePromotionTombstoneLookup({
    tombstones: [foreign],
    facts,
  });
  assert.equal(outcome.outcome, "indeterminate");
  assert.match(outcome.reason, /tombstone_digest_mismatch:v1/);
});

test("AC-17 lookup: an unresolvable newer tombstone dominates an older verified hit", () => {
  const email = freshEmail();
  const older = makeTombstone(email, { version: 1, key: KEY_V1, generation: 1, at: T0 });
  const newer = makeTombstone(email, { version: 2, key: KEY_V2, generation: 2, at: T0 + 1000 });
  let register = tombstoneLib.initialPromotionDigestKeyRegister(T0);
  register = tombstoneLib.applyRotatePromotionDigestKeys(register, {
    now: T0 + 500,
    expectedRevision: 0,
    outgoingChosenRetirementAt: null,
  }).register;
  // v1 verifies (a hit exists), but v2 — possibly the governing
  // terminal event — cannot be resolved: the outcome is indeterminate.
  const facts = factsFor(email, register, envWithKeys({ v1: KEY_V1 }));
  const outcome = tombstoneLib.evaluatePromotionTombstoneLookup({
    tombstones: [older, newer],
    facts,
  });
  assert.equal(outcome.outcome, "indeterminate");
  assert.match(outcome.reason, /digest_key_unavailable:v2/);
});

/* ------------------- §3.3 erasure + creation gate ------------------- */

test("GM-7B(c) erasure: the identity's evidence reduces to its tombstone and nothing else", () => {
  const email = freshEmail();
  const emailHash = clientLib.coordinatorEmailHash(email);
  const idleFacts = { digestsByVersion: {}, nonRetiredVersions: [1], resolvableVersions: [], retiredVersions: [] };
  const subscribed = stateLib.applySubscribePromotion(null, {
    ...subscribeInput(email, idleFacts, T0),
  }).state;
  assert.ok(subscribed.jobs.coupon);
  const erased = stateLib.applyErasePromotionIdentity(subscribed, eraseInput(email, { now: T0 + 5000 }));
  assert.equal(erased.changed, true);
  assert.equal(erased.alreadyErased, false);
  const state = erased.state;
  assert.equal(stateLib.isValidPromotionState(state), true);
  assert.equal(stateLib.isReducedPromotionState(state), true);
  assert.deepEqual(state.jobs, {});
  assert.equal(state.subscribedAt, null);
  assert.equal(state.unsubscribedAt, null);
  assert.equal(state.unsubscribeReason, null);
  assert.equal(state.lastSource, null);
  assert.equal(state.legacySubscribed, false);
  const suppressions = stateLib.promotionSuppressionsOf(state);
  assert.equal(suppressions.global.active, false);
  assert.equal(suppressions.reviewOnly.active, false);
  assert.equal(suppressions.deliverability.active, false);
  assert.equal(state.tombstones.length, 1);
  const tombstone = state.tombstones[0];
  assert.equal(stateLib.isValidPromotionState(state), true);
  assert.equal(tombstone.terminalEventClass, "erasure_with_suppression");
  assert.equal(tombstone.generation, 1);
  assert.equal(tombstone.terminalAt, T0 + 5000);
  assert.equal(tombstone.authorityId, clientLib.promotionCoordinatorName(emailHash));
  assert.equal(state.tombstoneRef, tombstone.keyedDigest);
  assert.ok(!JSON.stringify(state.tombstones).includes(email));

  // Idempotent: a second erasure leaves the original tombstone standing.
  const again = stateLib.applyErasePromotionIdentity(state, eraseInput(email, { now: T0 + 9000 }));
  assert.equal(again.alreadyErased, true);
  assert.equal(again.changed, false);
  assert.equal(again.state.tombstones[0].terminalAt, T0 + 5000);
});

test("GM-7B(c) erasure of a never-seen identity tombstones at generation 1; a malformed digest refuses", () => {
  const email = freshEmail();
  const erased = stateLib.applyErasePromotionIdentity(null, eraseInput(email));
  assert.equal(erased.changed, true);
  assert.equal(erased.state.tombstones[0].generation, 1);
  const refused = stateLib.applyErasePromotionIdentity(null, {
    ...eraseInput(email),
    keyedDigest: "",
  });
  assert.equal(refused.changed, false);
  assert.equal(refused.erasureRefused, "invalid_tombstone");
});

test("AT-13 ordering B (erasure, then creation): the gate creates already-suppressed at tombstone generation + 1", () => {
  const email = freshEmail();
  const erased = stateLib.applyErasePromotionIdentity(null, eraseInput(email)).state;
  const register = tombstoneLib.initialPromotionDigestKeyRegister(T0);
  const facts = factsFor(email, register, envWithKeys({ v1: KEY_V1 }));
  const created = stateLib.applySubscribePromotion(erased, subscribeInput(email, facts, T0 + 1000));
  assert.equal(created.creationGate, "tombstone_hit");
  assert.equal(created.isNewSubscriber, false);
  const state = created.state;
  assert.equal(state.subscribedAt, null);
  assert.equal(state.unsubscribedAt, T0 + 1000);
  assert.deepEqual(state.jobs, {});
  const suppressions = stateLib.promotionSuppressionsOf(state);
  assert.equal(suppressions.global.active, true);
  assert.equal(suppressions.global.generation, 2);
  assert.equal(suppressions.global.eventRef, "tombstone_reconstruction");
  assert.equal(state.generation, 2);
  assert.equal(stateLib.isReducedPromotionState(state), false);
  assert.equal(state.tombstoneRef, state.tombstones[0].keyedDigest);
});

test("AT-13 ordering A (creation, then erasure): the new record converts — covered by the reduction test; concurrent creation through the coordinator boundary observes one tombstone", async () => {
  clientLib.__resetConsistencyCoordinatorMemoryForTests();
  const client = clientLib.createConsistencyCoordinatorClient();
  const email = freshEmail();
  const emailHash = clientLib.coordinatorEmailHash(email);
  const name = clientLib.promotionCoordinatorName(emailHash);
  await client.erasePromotionIdentity(name, eraseInput(email));
  const register = tombstoneLib.initialPromotionDigestKeyRegister(T0);
  const facts = factsFor(email, register, envWithKeys({ v1: KEY_V1 }));
  const input = { ...subscribeInput(email, facts, T0 + 1000) };
  const [first, second] = await Promise.all([
    client.subscribePromotion(name, input),
    client.subscribePromotion(name, { ...input, now: T0 + 2000 }),
  ]);
  assert.equal(first.creationGate, "tombstone_hit");
  assert.equal(second.creationGate, "tombstone_hit");
  const state = await client.getPromotionState(name);
  // Both serialized creations reconstruct at the SAME generation —
  // the tombstone's generation + 1 — never a double increment.
  assert.equal(state.generation, 2);
  assert.equal(stateLib.promotionSuppressionsOf(state).global.generation, 2);
  assert.deepEqual(state.jobs, {});
});

test("AC-17/AC-18 negative control: indeterminate lookup refuses creation — no mutation, no eligible identity", async () => {
  clientLib.__resetConsistencyCoordinatorMemoryForTests();
  const client = clientLib.createConsistencyCoordinatorClient();
  const email = freshEmail();
  const emailHash = clientLib.coordinatorEmailHash(email);
  const name = clientLib.promotionCoordinatorName(emailHash);
  await client.erasePromotionIdentity(name, eraseInput(email));
  // The v1 key is now unavailable: the stored tombstone cannot be
  // resolved either way.
  const register = tombstoneLib.initialPromotionDigestKeyRegister(T0);
  const blindFacts = factsFor(email, register, envWithKeys({}));
  const refused = await client.subscribePromotion(name, subscribeInput(email, blindFacts, T0 + 1000));
  assert.equal(refused.creationGate, "refused_indeterminate");
  const state = await client.getPromotionState(name);
  assert.equal(stateLib.isReducedPromotionState(state), true);
  assert.equal(state.tombstones.length, 1);
  assert.deepEqual(state.jobs, {});
});

test("AC-17 creation gate: a stale snapshot refuses creation over a newer-version tombstone — zero mutation, no jobs", () => {
  const email = freshEmail();
  // The erasure committed under v2 — the version a rotation created.
  const erased = stateLib.applyErasePromotionIdentity(
    null,
    eraseInput(email, { version: 2, key: KEY_V2, now: T0 + 1000 }),
  ).state;
  // The subscribe gathered its lookup facts from a register snapshot
  // taken BEFORE that rotation: it knows v1 only, so the v2 tombstone
  // is neither live nor affirmatively retired in its evidence. The
  // gate must refuse — treating the tombstone as retired would clear
  // the ref/suppression and create a coupon job for an erased
  // identity.
  const staleRegister = tombstoneLib.initialPromotionDigestKeyRegister(T0);
  const staleFacts = factsFor(email, staleRegister, envWithKeys({ v1: KEY_V1 }));
  const refused = stateLib.applySubscribePromotion(erased, subscribeInput(email, staleFacts, T0 + 2000));
  assert.equal(refused.creationGate, "refused_indeterminate");
  assert.equal(refused.changed, false);
  assert.equal(refused.isNewSubscriber, false);
  // Zero mutation: the returned state IS the reduced record the
  // erasure committed — tombstone standing, ref intact, no jobs.
  assert.equal(refused.state, erased);
  assert.equal(stateLib.isReducedPromotionState(refused.state), true);
  assert.deepEqual(refused.state.jobs, {});
  assert.equal(refused.state.tombstoneRef, erased.tombstones[0].keyedDigest);
});

test("GM-7C(b) creation gate: a snapshot that affirmatively retires the tombstone's version lets creation proceed as before", () => {
  const email = freshEmail();
  const erased = stateLib.applyErasePromotionIdentity(null, eraseInput(email, { now: T0 + 1000 })).state;
  // Rotate, then RETIRE v1 on a permitted basis: the snapshot now
  // affirmatively records the retirement (with its basis), which is
  // the one evidence on which the v1 tombstone stops answering.
  let register = tombstoneLib.initialPromotionDigestKeyRegister(T0);
  register = tombstoneLib.applyRotatePromotionDigestKeys(register, {
    now: T0 + 1500,
    expectedRevision: 0,
    outgoingChosenRetirementAt: null,
  }).register;
  register = tombstoneLib.applyRetirePromotionDigestKeyVersion(register, {
    now: T0 + 1600,
    expectedRevision: register.revision,
    version: 1,
    basis: "rekey_sweep_complete",
  }).register;
  const facts = factsFor(email, register, envWithKeys({ v1: KEY_V1, v2: KEY_V2 }));
  const created = stateLib.applySubscribePromotion(erased, subscribeInput(email, facts, T0 + 2000));
  assert.equal(created.creationGate, "proceeded");
  assert.equal(created.state.subscribedAt, T0 + 2000);
  assert.ok(!created.state.tombstoneRef);
  assert.ok(created.state.jobs.coupon);
});

test("Production-safety pin: an unprovisioned digest-key system leaves ordinary subscribes untouched", () => {
  const email = freshEmail();
  const idleFacts = { digestsByVersion: {}, nonRetiredVersions: [1], resolvableVersions: [], retiredVersions: [] };
  const created = stateLib.applySubscribePromotion(null, subscribeInput(email, idleFacts));
  assert.equal(created.creationGate, "proceeded");
  assert.equal(created.isNewSubscriber, true);
  assert.ok(created.state.jobs.coupon);
});

test("GM-7B(c) guards: unsubscribe and deliverability transitions cannot resurrect a reduced identity", () => {
  const email = freshEmail();
  const erased = stateLib.applyErasePromotionIdentity(null, eraseInput(email)).state;
  const unsub = stateLib.applyUnsubscribePromotion(erased, {
    emailHash: erased.emailHash,
    now: T0 + 1000,
    reason: "email_link",
    facts: NO_FACTS,
  });
  assert.equal(unsub.changed, false);
  assert.equal(unsub.wasAlreadyUnsubscribed, true);
  assert.equal(unsub.state.subscribedAt, null);
  const deliverability = stateLib.applyRecordDeliverabilitySuppression(erased, {
    emailHash: erased.emailHash,
    now: T0 + 1000,
    eventRef: "bounce",
    facts: NO_FACTS,
  });
  assert.equal(deliverability.changed, false);
  assert.equal(stateLib.isReducedPromotionState(deliverability.state), true);
});

test("GM-7B(b) projection: a reduced identity projects its derived suppression, not a live subscription", async () => {
  clientLib.__resetConsistencyCoordinatorMemoryForTests();
  const client = clientLib.createConsistencyCoordinatorClient();
  const email = freshEmail();
  const emailHash = clientLib.coordinatorEmailHash(email);
  const name = clientLib.promotionCoordinatorName(emailHash);
  const { state } = await client.erasePromotionIdentity(name, eraseInput(email, { now: T0 + 7000 }));
  const view = stateLib.promotionStateView(state);
  assert.equal(view.unsubscribedAt, T0 + 7000);
  // The dispatch fence over the committed authority refuses, with a
  // distinguishable no-permission reason (nothing about the erased
  // identity can be marketed to).
  const checker = guardLib.createPromotionDispatchPermissionChecker(client);
  const decision = await checker(email);
  assert.equal(decision.permitted, false);
  assert.equal(decision.reason, "no_permission_record");
});

test("GM-7B(b) distinguishability: coordinator commit and projection convergence are observably separate states", async () => {
  clientLib.__resetConsistencyCoordinatorMemoryForTests();
  const client = clientLib.createConsistencyCoordinatorClient();
  const email = freshEmail();
  const emailHash = clientLib.coordinatorEmailHash(email);
  const name = clientLib.promotionCoordinatorName(emailHash);
  await kv.set(subsLib.emailStateKey(email), {
    subscribedAt: T0 - 1000,
    updatedAt: T0 - 1000,
  });
  // Transition commits through the coordinator ONLY: the projection
  // still shows the pre-erasure view — the incomplete state AC-12
  // requires to stay distinguishable from a completed erasure.
  await client.erasePromotionIdentity(name, eraseInput(email, { now: T0 + 1000 }));
  const projection = await kv.get(subsLib.emailStateKey(email));
  assert.equal(projection.unsubscribedAt, undefined);
  const committed = await client.getPromotionState(name);
  assert.equal(stateLib.isReducedPromotionState(committed), true);
});

test("Generation continuity: erasure after reconstruction tombstones at the reconstructed generation", () => {
  const email = freshEmail();
  const register = tombstoneLib.initialPromotionDigestKeyRegister(T0);
  const facts = factsFor(email, register, envWithKeys({ v1: KEY_V1 }));
  const erased = stateLib.applyErasePromotionIdentity(null, eraseInput(email)).state;
  const reconstructed = stateLib.applySubscribePromotion(
    erased,
    subscribeInput(email, facts, T0 + 1000),
  ).state;
  const reErased = stateLib.applyErasePromotionIdentity(
    reconstructed,
    eraseInput(email, { now: T0 + 2000 }),
  ).state;
  assert.equal(reErased.tombstones.length, 2);
  assert.equal(reErased.tombstones[1].generation, 2);
  const reReconstructed = stateLib.applySubscribePromotion(
    reErased,
    subscribeInput(email, facts, T0 + 3000),
  );
  assert.equal(reReconstructed.creationGate, "tombstone_hit");
  assert.equal(stateLib.promotionSuppressionsOf(reReconstructed.state).global.generation, 3);
});

test("AC-20/AC-28 structure: no deletion path for tombstones or promotion state exists in the candidate surface", () => {
  const client = clientLib.createConsistencyCoordinatorClient();
  const surface = Object.keys(client).join(",");
  assert.ok(!/delete|remove|purge|destroy/i.test(surface), surface);
  // The register's acts are exactly rotation and retirement; neither
  // deletes a tombstone — retirement only narrows lookup coverage on
  // a recorded basis (tested above).
  assert.equal(typeof tombstoneLib.applyRotatePromotionDigestKeys, "function");
  assert.equal(typeof tombstoneLib.applyRetirePromotionDigestKeyVersion, "function");
});

/* ------------------- §3.2/§3.3 flow-level: sweep + erasure ------------------- */

test("GM-7C sweep step: re-stamps under the new version and verifies lookup equivalence (hit before, hit after)", async () => {
  process.env.PROMOTION_DIGEST_KEY_V1 = KEY_V1;
  process.env.PROMOTION_DIGEST_KEY_V2 = KEY_V2;
  try {
    clientLib.__resetConsistencyCoordinatorMemoryForTests();
    const email = freshEmail();
    await tombstoneLib.writePromotionDigestKeyRegister(
      tombstoneLib.initialPromotionDigestKeyRegister(T0),
    );
    await flows.erasePromotionIdentityFlow({ email });
    // Rotate the register (operator act): v2 becomes current, v1 stays live.
    const register = await tombstoneLib.readPromotionDigestKeyRegister(T0);
    const rotated = tombstoneLib.applyRotatePromotionDigestKeys(register, {
      now: T0 + 1000,
      expectedRevision: register.revision,
      outgoingChosenRetirementAt: null,
    });
    await tombstoneLib.writePromotionDigestKeyRegister(rotated.register);
    const step = await flows.rekeyPromotionTombstoneSweepStep({
      email,
      fromVersion: 1,
      toVersion: 2,
    });
    assert.equal(step.disposition, "restamped");
    assert.equal(step.restamped, 1);
    assert.equal(step.lookupBefore, "hit");
    assert.equal(step.lookupAfter, "hit");
    assert.equal(step.state.tombstones[0].digestKeyVersion, 2);
    assert.equal(step.state.tombstoneRef, step.state.tombstones[0].keyedDigest);
    const proof = await flows.lookupPromotionTombstoneProof({ email });
    assert.equal(proof.outcome, "hit");
    assert.equal(proof.tombstone.digestKeyVersion, 2);
  } finally {
    delete process.env.PROMOTION_DIGEST_KEY_V1;
    delete process.env.PROMOTION_DIGEST_KEY_V2;
  }
});

test("GM-7C sweep step: an identity with no records under the version reports its disposition, and the sweep cannot be aimed from a tombstone", async () => {
  process.env.PROMOTION_DIGEST_KEY_V1 = KEY_V1;
  process.env.PROMOTION_DIGEST_KEY_V2 = KEY_V2;
  try {
    clientLib.__resetConsistencyCoordinatorMemoryForTests();
    const email = freshEmail();
    // The sweep target must be a live version: rotate first (v2
    // current), exactly as the happy-path sweep test does.
    let register = tombstoneLib.initialPromotionDigestKeyRegister(T0);
    register = tombstoneLib.applyRotatePromotionDigestKeys(register, {
      now: T0 + 500,
      expectedRevision: register.revision,
      outgoingChosenRetirementAt: null,
    }).register;
    await tombstoneLib.writePromotionDigestKeyRegister(register);
    const idleFacts = { digestsByVersion: {}, nonRetiredVersions: [1], resolvableVersions: [], retiredVersions: [] };
    const client = clientLib.createConsistencyCoordinatorClient();
    const emailHash = clientLib.coordinatorEmailHash(email);
    const name = clientLib.promotionCoordinatorName(emailHash);
    await client.subscribePromotion(name, subscribeInput(email, idleFacts));
    const step = await flows.rekeyPromotionTombstoneSweepStep({
      email,
      fromVersion: 1,
      toVersion: 2,
    });
    assert.equal(step.disposition, "no_records_under_version");
    assert.equal(step.restamped, 0);
    // Reacquisition structure: the only sweep input is an address the
    // caller already holds; nothing in the module maps a digest back
    // to an address.
    const tombstoneExports = Object.keys(tombstoneLib).join(",");
    assert.ok(!/address|email.*from|reverse/i.test(tombstoneExports), tombstoneExports);
  } finally {
    delete process.env.PROMOTION_DIGEST_KEY_V1;
    delete process.env.PROMOTION_DIGEST_KEY_V2;
  }
});

test("Erasure flow: commits the tombstone, removes the address from the legacy lists, and strictly publishes the derived suppression", async () => {
  process.env.PROMOTION_DIGEST_KEY_V1 = KEY_V1;
  try {
    clientLib.__resetConsistencyCoordinatorMemoryForTests();
    const email = freshEmail();
    await tombstoneLib.writePromotionDigestKeyRegister(
      tombstoneLib.initialPromotionDigestKeyRegister(T0),
    );
    await kv.set(subsLib.emailStateKey(email), { subscribedAt: T0 - 1000, updatedAt: T0 - 1000 });
    await kv.set(subsLib.LEGACY_SUBSCRIPTION_KEY, [email, "someone-else@example.com"]);
    await kv.set(subsLib.LEGACY_SENT_KEY, [email]);
    await kv.set(subsLib.LEGACY_FOLLOWUP_KEY, [email]);
    const result = await flows.erasePromotionIdentityFlow({ email });
    assert.equal(result.alreadyErased, false);
    assert.equal(stateLib.isReducedPromotionState(result.state), true);
    const projection = await kv.get(subsLib.emailStateKey(email));
    assert.equal(projection.unsubscribedAt, result.state.tombstones[0].terminalAt);
    for (const key of [
      subsLib.LEGACY_SUBSCRIPTION_KEY,
      subsLib.LEGACY_SENT_KEY,
      subsLib.LEGACY_FOLLOWUP_KEY,
    ]) {
      const list = await kv.get(key);
      assert.ok(!list.includes(email), key);
    }
    const again = await flows.erasePromotionIdentityFlow({ email });
    assert.equal(again.alreadyErased, true);
  } finally {
    delete process.env.PROMOTION_DIGEST_KEY_V1;
  }
});

test("Erasure flow refuses when the current digest key is not provisioned — and creates nothing", async () => {
  delete process.env.PROMOTION_DIGEST_KEY_V1;
  clientLib.__resetConsistencyCoordinatorMemoryForTests();
  const email = freshEmail();
  await tombstoneLib.writePromotionDigestKeyRegister(
    tombstoneLib.initialPromotionDigestKeyRegister(T0),
  );
  await assert.rejects(
    () => flows.erasePromotionIdentityFlow({ email }),
    (error) => error instanceof clientLib.ConsistencyCoordinatorUnavailableError,
  );
  const client = clientLib.createConsistencyCoordinatorClient();
  const name = clientLib.promotionCoordinatorName(clientLib.coordinatorEmailHash(email));
  assert.equal(await client.getPromotionState(name), null);
});

test("Subscribe flow fails closed when the tombstone lookup turns indeterminate after an erasure", async () => {
  process.env.PROMOTION_DIGEST_KEY_V1 = KEY_V1;
  try {
    clientLib.__resetConsistencyCoordinatorMemoryForTests();
    const email = freshEmail();
    await tombstoneLib.writePromotionDigestKeyRegister(
      tombstoneLib.initialPromotionDigestKeyRegister(T0),
    );
    await flows.erasePromotionIdentityFlow({ email });
    // The key vanishes (rotation mishap / secret removed): the stored
    // tombstone can no longer be resolved, so creation must refuse —
    // it must not fall through to an ordinary eligible subscribe.
    delete process.env.PROMOTION_DIGEST_KEY_V1;
    await assert.rejects(
      () => flows.subscribePromotionFlow({ email, source: "test", couponCode: "FIRST50" }),
      (error) => error instanceof clientLib.ConsistencyCoordinatorUnavailableError,
    );
    const client = clientLib.createConsistencyCoordinatorClient();
    const name = clientLib.promotionCoordinatorName(clientLib.coordinatorEmailHash(email));
    const state = await client.getPromotionState(name);
    assert.equal(stateLib.isReducedPromotionState(state), true);
  } finally {
    delete process.env.PROMOTION_DIGEST_KEY_V1;
  }
});

test("Subscribe flow on a tombstoned identity (keys provisioned) creates it already-suppressed and sends nothing", async () => {
  process.env.PROMOTION_DIGEST_KEY_V1 = KEY_V1;
  try {
    clientLib.__resetConsistencyCoordinatorMemoryForTests();
    const email = freshEmail();
    await tombstoneLib.writePromotionDigestKeyRegister(
      tombstoneLib.initialPromotionDigestKeyRegister(T0),
    );
    await flows.erasePromotionIdentityFlow({ email });
    const result = await flows.subscribePromotionFlow({
      email,
      source: "test",
      couponCode: "FIRST50",
    });
    assert.equal(result.tombstoneHit, true);
    assert.equal(result.isNewSubscriber, false);
    assert.equal(result.emailDelivered, false);
    assert.equal(result.deliveryProvider, "none");
    assert.deepEqual(result.state.jobs, {});
    assert.equal(stateLib.promotionSuppressionsOf(result.state).global.active, true);
  } finally {
    delete process.env.PROMOTION_DIGEST_KEY_V1;
  }
});

/* ------------- §3.3 flow-level: erasure cleanup races/failures ------------- */

test("Erasure flows: two concurrent erasures over the shared legacy lists never lose a deletion", async () => {
  process.env.PROMOTION_DIGEST_KEY_V1 = KEY_V1;
  try {
    clientLib.__resetConsistencyCoordinatorMemoryForTests();
    const emailA = freshEmail();
    const emailB = freshEmail();
    await tombstoneLib.writePromotionDigestKeyRegister(
      tombstoneLib.initialPromotionDigestKeyRegister(T0),
    );
    const listKeys = [
      subsLib.LEGACY_SUBSCRIPTION_KEY,
      subsLib.LEGACY_SENT_KEY,
      subsLib.LEGACY_FOLLOWUP_KEY,
    ];
    for (const key of listKeys) {
      await kv.set(key, [emailA, emailB, "someone-else@example.com"]);
    }
    // Deterministic stagger, on the WRITE side: park the FIRST
    // cleanup write to the subscription list until both flows have
    // completed their cleanup reads of it (four list reads in total:
    // a fact-gathering read and a cleanup read per flow), or until a
    // lapse window passes. Parking the write — not a read — is what
    // makes the reproduction deterministic: whichever flow writes
    // first cannot land its write until the other flow's cleanup has
    // read the same pre-deletion list, so the second flow's
    // read-modify-write is computed from stale contents and its
    // write resurrects the first flow's deletion. (Gating reads
    // instead does not reproduce it: the flows' cleanup phases do not
    // reliably overlap, and a read gate either serializes them or
    // deadlocks against the serialized cleanup — whose correctness
    // does not depend on the gate, which only ever delays a write,
    // hence the lapse: a serialized cleanup pays the lapse once and
    // proceeds.)
    let subReads = 0;
    let writeGateUsed = false;
    let writeReleased = false;
    const writeWaiters = [];
    const releaseWrite = () => {
      if (writeReleased) return;
      writeReleased = true;
      for (const resolve of writeWaiters) resolve();
      writeWaiters.length = 0;
    };
    const noteSubRead = () => {
      subReads += 1;
      if (subReads >= 4) releaseWrite();
    };
    const originalGet = kv.get;
    const originalGetErrorPreserving = kv.getErrorPreserving;
    const originalSet = kv.set;
    kv.get = async (key, ...rest) => {
      const value = await originalGet(key, ...rest);
      if (key === subsLib.LEGACY_SUBSCRIPTION_KEY) noteSubRead();
      return value;
    };
    kv.getErrorPreserving = async (key, ...rest) => {
      const value = await originalGetErrorPreserving(key, ...rest);
      if (key === subsLib.LEGACY_SUBSCRIPTION_KEY) noteSubRead();
      return value;
    };
    kv.set = async (key, value, ...rest) => {
      if (key === subsLib.LEGACY_SUBSCRIPTION_KEY && !writeGateUsed) {
        writeGateUsed = true;
        if (!writeReleased) {
          await new Promise((resolve) => {
            writeWaiters.push(resolve);
            setTimeout(releaseWrite, 300);
          });
        }
      }
      return originalSet(key, value, ...rest);
    };
    let resultA;
    let resultB;
    try {
      [resultA, resultB] = await Promise.all([
        flows.erasePromotionIdentityFlow({ email: emailA }),
        flows.erasePromotionIdentityFlow({ email: emailB }),
      ]);
    } finally {
      kv.get = originalGet;
      kv.getErrorPreserving = originalGetErrorPreserving;
      kv.set = originalSet;
    }
    assert.equal(resultA.alreadyErased, false);
    assert.equal(resultB.alreadyErased, false);
    // Neither deletion was lost, and no flow reported success while
    // its address remained: both addresses are gone from every list,
    // and the unrelated entry is untouched.
    for (const key of listKeys) {
      const list = await kv.get(key);
      assert.ok(!list.includes(emailA), `${key} still holds emailA`);
      assert.ok(!list.includes(emailB), `${key} still holds emailB`);
      assert.ok(list.includes("someone-else@example.com"), key);
    }
  } finally {
    delete process.env.PROMOTION_DIGEST_KEY_V1;
  }
});

test("Erasure flow: an unreadable legacy list fails the cleanup retryably — no success, no stale overwrite", async () => {
  process.env.PROMOTION_DIGEST_KEY_V1 = KEY_V1;
  try {
    clientLib.__resetConsistencyCoordinatorMemoryForTests();
    const email = freshEmail();
    await tombstoneLib.writePromotionDigestKeyRegister(
      tombstoneLib.initialPromotionDigestKeyRegister(T0),
    );
    const listKeys = [
      subsLib.LEGACY_SUBSCRIPTION_KEY,
      subsLib.LEGACY_SENT_KEY,
      subsLib.LEGACY_FOLLOWUP_KEY,
    ];
    for (const key of listKeys) {
      await kv.set(key, [email]);
    }
    // Inject the read failure at the cleanup's own read of the
    // subscription list: the error-preserving read throws KvReadError
    // (what a failed Cloudflare read produces), while the
    // error-swallowing kv.get keeps answering — which is precisely
    // the asymmetry the finding is about. Patch-level injection (not
    // a corrupted fallback file) because the list keys are shared
    // with other suites' processes; the failure stays inside this
    // one. Track writes to the list so "no write from stale data" is
    // asserted, not assumed.
    let subListWrites = 0;
    const originalGetErrorPreserving = kv.getErrorPreserving;
    const originalSet = kv.set;
    kv.getErrorPreserving = async (key, ...rest) => {
      if (key === subsLib.LEGACY_SUBSCRIPTION_KEY) {
        throw new KvReadError("injected legacy list read failure");
      }
      return originalGetErrorPreserving(key, ...rest);
    };
    kv.set = async (key, value, ...rest) => {
      if (key === subsLib.LEGACY_SUBSCRIPTION_KEY) subListWrites += 1;
      return originalSet(key, value, ...rest);
    };
    try {
      // The erasure FAILS on the unreadable list (KvReadError)
      // instead of treating it as absent and reporting success.
      await assert.rejects(
        () => flows.erasePromotionIdentityFlow({ email }),
        (error) => error instanceof KvReadError,
      );
    } finally {
      kv.getErrorPreserving = originalGetErrorPreserving;
      kv.set = originalSet;
    }
    // No list was written from stale data — the failing list saw zero
    // writes — and no cleanup completed behind the failure: every
    // list still holds the address, so nothing reported it erased.
    assert.equal(subListWrites, 0);
    for (const key of listKeys) {
      assert.ok((await kv.get(key)).includes(email), key);
    }
    // Retryable: with the read healthy again, the retry completes
    // the cleanup (the coordinator transition is idempotent — the
    // tombstone committed by the failed attempt stands).
    const retried = await flows.erasePromotionIdentityFlow({ email });
    assert.equal(retried.alreadyErased, true);
    for (const key of listKeys) {
      const list = await kv.get(key);
      assert.ok(!list.includes(email), key);
    }
  } finally {
    delete process.env.PROMOTION_DIGEST_KEY_V1;
  }
});
