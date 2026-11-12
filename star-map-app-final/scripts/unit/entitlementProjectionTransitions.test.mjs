/**
 * Entitlement authority — projection watermark + state-transition pins
 * that deepen the least-tested seams of entitlementAuthorityState.ts.
 *
 * Regression targets (contracts established from source + existing suite):
 * - `includedThroughSeq` mirrors `journalHeadOf` at publish time.
 * - Journal head advances on commit/grant/reward journal entries; facts
 *   sync and baseline capture do NOT journal (watermark stays put).
 * - Legal: legacy grant, revoke-at-redemption-time (facts sync), reward
 *   grant with discovery attestation.
 * - Illegal/duplicate: double-grant, re-commit (`already_owned`, no
 *   re-debit), redeem after revoke, reward after revoke, reward replay,
 *   grant↔compensate exclusivity.
 *
 * Fixtures are synthetic (`cs_test_*` / `art-*`); no bearer material,
 * real session ids, or customer data.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const {
  applyEntitlementAuthorityOp,
  buildEntitlementAuthorityProjection,
  createEmptyEntitlementAuthorityState,
  deriveRemainingAllowance,
  evaluateDeliveryEligibility,
  evaluateEntitlementValidity,
  journalHeadOf,
} = await import("../../src/lib/entitlementAuthorityState.ts");

const NOW = Date.UTC(2026, 10, 8, 15, 0, 0);
const SID = "cs_test_coverage_expansion";

const facts = (over = {}) => ({
  plan: "pack3",
  paid: true,
  revoked: false,
  subscriptionActive: false,
  mapId: "map-coverage-1",
  ...over,
});

const baseline = (over = {}) => ({
  plan: "pack3",
  allowance: 3,
  legacyRemainingBalance: 2,
  legacySpentCount: 1,
  lastConsumeToken: "tok-1",
  lastConsumeAt: NOW - 60_000,
  lastCompensatedToken: null,
  purchaseMapId: "map-coverage-1",
  accessTermsNote: null,
  capturedAt: NOW - 120_000,
  ...over,
});

function seeded({ factsOver, baselineOver, withBaseline = true } = {}) {
  let s = createEmptyEntitlementAuthorityState(SID);
  s = applyEntitlementAuthorityOp(s, {
    type: "sync_facts",
    facts: facts(factsOver),
    now: NOW - 1000,
  }).state;
  if (withBaseline) {
    s = applyEntitlementAuthorityOp(s, {
      type: "capture_baseline",
      baseline: baseline(baselineOver),
      now: NOW - 900,
    }).state;
  }
  return s;
}

const commitOp = (artifactId, over = {}) => ({
  type: "commit",
  artifactId,
  mapId: "map-coverage-1",
  fingerprint: `fp-${artifactId}`,
  finalized: true,
  now: NOW,
  ...over,
});

const grantOp = (artifactId, over = {}) => ({
  type: "grant",
  artifactId,
  mapId: "map-coverage-1",
  fingerprint: `fp-${artifactId}`,
  finalized: true,
  now: NOW,
  ...over,
});

const grantRewardOp = (grantId, amount = 1, over = {}) => ({
  type: "grant_reward",
  grantId,
  amount,
  now: NOW,
  // Supported-path defaults (same posture as entitlementAuthority.test.mjs):
  discoveryRegistration: "registered",
  classificationEvidence: {
    sessionCreatedAt: NOW + 86_400_000,
    fencingCompletedAt: null,
    witness: "absent",
  },
  ...over,
});

/* ---------------- projection watermark (includedThroughSeq) ---------------- */

test("projection: empty authority publishes includedThroughSeq === journal head (0) and zero remainders", () => {
  const s = createEmptyEntitlementAuthorityState(SID);
  const projection = buildEntitlementAuthorityProjection(s);
  assert.equal(journalHeadOf(s), 0);
  assert.equal(projection.includedThroughSeq, 0);
  assert.equal(projection.authorityStateVersion, 0);
  assert.equal(projection.sessionId, SID);
  // deriveRemainingAllowance on a factless empty state is 0 (not null) —
  // the projection surfaces that derived zero rather than inventing null.
  assert.equal(projection.creditsRemaining, 0);
  assert.equal(projection.purchasedCreditsRemaining, 0);
  assert.equal(projection.rewardCreditsRemaining, 0);
  assert.deepEqual(projection.ownedArtifactIds, []);
});

test("projection: facts sync + baseline capture do not journal; commit advances includedThroughSeq by 1", () => {
  let s = seeded();
  assert.equal(journalHeadOf(s), 0, "sync_facts/capture_baseline are non-journal mutations");
  const before = buildEntitlementAuthorityProjection(s);
  assert.equal(before.includedThroughSeq, 0);
  assert.equal(before.creditsRemaining, 2); // pack3 allowance 3 − legacy spent 1

  const committed = applyEntitlementAuthorityOp(s, commitOp("art-a"));
  assert.equal(committed.outcome, "committed");
  s = committed.state;
  const after = buildEntitlementAuthorityProjection(s);
  assert.equal(after.includedThroughSeq, 1);
  assert.equal(after.includedThroughSeq, journalHeadOf(s));
  assert.equal(after.authorityStateVersion, 1);
  assert.deepEqual(after.ownedArtifactIds, ["art-a"]);
  assert.equal(after.creditsRemaining, 1);
  assert.equal(after.purchasedCreditsRemaining, 1);
});

test("projection: a refused / already_owned op does not advance the watermark", () => {
  let s = seeded();
  s = applyEntitlementAuthorityOp(s, commitOp("art-a")).state;
  const watermark = buildEntitlementAuthorityProjection(s).includedThroughSeq;
  assert.equal(watermark, 1);

  const replay = applyEntitlementAuthorityOp(s, commitOp("art-a"));
  assert.equal(replay.outcome, "already_owned");
  assert.equal(replay.refusal, null);
  assert.equal(buildEntitlementAuthorityProjection(replay.state).includedThroughSeq, watermark);
  assert.equal(deriveRemainingAllowance(replay.state), 1);
});

/* ---------------- legal transitions ---------------- */

test("legal: grant of a legacy artifact records ownership without double-debiting allowance", () => {
  let s = seeded();
  assert.equal(deriveRemainingAllowance(s), 2);
  const granted = applyEntitlementAuthorityOp(s, grantOp("art-legacy"));
  assert.equal(granted.outcome, "granted");
  s = granted.state;
  assert.equal(s.recoveryDecision, "granted");
  assert.equal(deriveRemainingAllowance(s), 2, "grant must not consume another purchased credit");
  assert.equal(evaluateDeliveryEligibility(s, "art-legacy").ok, true);
  const projection = buildEntitlementAuthorityProjection(s);
  assert.ok(projection.ownedArtifactIds.includes("art-legacy"));
  // grant journals — watermark advances from 0 → 1
  assert.equal(projection.includedThroughSeq, journalHeadOf(s));
  assert.ok(projection.includedThroughSeq >= 1);
});

test("legal: revoke-at-redemption-time refuses further commit/grant/delivery; facts sync does not journal", () => {
  let s = seeded();
  s = applyEntitlementAuthorityOp(s, commitOp("art-a")).state;
  const watermarkAfterCommit = buildEntitlementAuthorityProjection(s).includedThroughSeq;
  assert.equal(evaluateDeliveryEligibility(s, "art-a").ok, true);

  const revoked = applyEntitlementAuthorityOp(s, {
    type: "sync_facts",
    facts: facts({ revoked: true }),
    now: NOW + 1,
  });
  s = revoked.state;
  assert.equal(revoked.outcome, "facts_synced");
  assert.deepEqual(evaluateEntitlementValidity(s), { valid: false, reason: "revoked" });
  assert.equal(applyEntitlementAuthorityOp(s, commitOp("art-b")).refusal, "revoked");
  assert.equal(applyEntitlementAuthorityOp(s, grantOp("art-l")).refusal, "revoked");
  assert.equal(evaluateDeliveryEligibility(s, "art-a").ok, false);

  // Intended contract: sync_facts is non-journal; the watermark of the
  // prior commit stays put even though validity flipped to revoked.
  const projection = buildEntitlementAuthorityProjection(s);
  assert.equal(projection.includedThroughSeq, watermarkAfterCommit);
  assert.deepEqual(projection.ownedArtifactIds, ["art-a"]);
});

test("legal: reward grant adds bucket balance; projection separates purchased vs reward remainders", () => {
  let s = seeded(); // purchased remaining 2
  const rewarded = applyEntitlementAuthorityOp(s, grantRewardOp("reward-1"));
  assert.equal(rewarded.outcome, "reward_granted");
  s = rewarded.state;
  const projection = buildEntitlementAuthorityProjection(s);
  assert.equal(projection.purchasedCreditsRemaining, 2);
  assert.equal(projection.rewardCreditsRemaining, 1);
  assert.equal(projection.creditsRemaining, 3);
  assert.equal(projection.includedThroughSeq, journalHeadOf(s));
  assert.ok(projection.includedThroughSeq >= 1, "reward grant journals");
});

/* ---------------- illegal / duplicate transitions ---------------- */

test("illegal: double-grant of the same legacy fingerprint is already_granted; a second fingerprint is refused", () => {
  let s = seeded();
  s = applyEntitlementAuthorityOp(s, grantOp("art-legacy")).state;
  const replay = applyEntitlementAuthorityOp(s, grantOp("art-legacy"));
  assert.equal(replay.outcome, "already_granted");
  const other = applyEntitlementAuthorityOp(s, grantOp("art-other"));
  assert.equal(other.refusal, "already_granted");
});

test("illegal: double-redeem (re-commit) returns already_owned and never re-debits", () => {
  let s = seeded();
  const first = applyEntitlementAuthorityOp(s, commitOp("art-a"));
  assert.equal(first.outcome, "committed");
  assert.equal(deriveRemainingAllowance(first.state), 1);
  const second = applyEntitlementAuthorityOp(first.state, commitOp("art-a"));
  assert.equal(second.outcome, "already_owned");
  assert.equal(deriveRemainingAllowance(second.state), 1);
  assert.equal(buildEntitlementAuthorityProjection(second.state).ownedArtifactIds.length, 1);
  assert.equal(
    buildEntitlementAuthorityProjection(second.state).includedThroughSeq,
    buildEntitlementAuthorityProjection(first.state).includedThroughSeq,
  );
});

test("illegal: redeem after revoke is refused with reason revoked", () => {
  let s = seeded();
  s = applyEntitlementAuthorityOp(s, {
    type: "sync_facts",
    facts: facts({ revoked: true }),
    now: NOW,
  }).state;
  const result = applyEntitlementAuthorityOp(s, commitOp("art-a"));
  assert.equal(result.refusal, "revoked");
  assert.equal(deriveRemainingAllowance(result.state), deriveRemainingAllowance(s));
});

test("illegal: reward grant after revoke is refused; duplicate reward grant is reward_already_granted", () => {
  let s = seeded();
  s = applyEntitlementAuthorityOp(s, grantRewardOp("reward-dup")).state;
  const replay = applyEntitlementAuthorityOp(s, grantRewardOp("reward-dup"));
  assert.equal(replay.outcome, "reward_already_granted");
  assert.equal(replay.changed, false);

  const revoked = seeded({ factsOver: { revoked: true } });
  assert.equal(applyEntitlementAuthorityOp(revoked, grantRewardOp("reward-revoked")).refusal, "revoked");
});

test("illegal: grant after compensate (and the reverse) stay mutually exclusive", () => {
  const grantedFirst = applyEntitlementAuthorityOp(seeded(), grantOp("art-legacy")).state;
  assert.equal(
    applyEntitlementAuthorityOp(grantedFirst, {
      type: "compensate",
      consumeToken: "tok-1",
      now: NOW,
    }).refusal,
    "already_granted",
  );

  const compensatedFirst = applyEntitlementAuthorityOp(seeded(), {
    type: "compensate",
    consumeToken: "tok-1",
    now: NOW,
  }).state;
  assert.equal(
    applyEntitlementAuthorityOp(compensatedFirst, grantOp("art-legacy")).refusal,
    "already_compensated",
  );
});
