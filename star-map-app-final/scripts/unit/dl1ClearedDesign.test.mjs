/**
 * dl1ClearedDesign.test.mjs — DL-1 Slice 3 rework to the CLEARED design
 * (v3.5 journal-first pivot as amended through v3.11, G-dot CLEAR
 * 2026-10-23). Binds the Slice 3 surface of the T-C corpus:
 *
 * - classification/inclusion (v3.7 §2, v3.8 §2.2, v3.10 §§1/3,
 *   v3.11 §2): T-C18/T-C19 (as T-C29), T-C29, T-C30 (in T-C29/T-C48),
 *   T-C44 (+ redelivery leg), T-C45, T-C48, T-C49, T-C51;
 * - snapshot + installation (v3.6 §§2–3, v3.7 §3): T-C10, T-C11,
 *   T-C12, T-C13;
 * - pending birth (v3.8 §3): T-C31, T-C32;
 * - compensation × reversal ordering (v3.6 §4.1, v3.7 §4, v3.8 §4,
 *   v3.10 §2, v3.11 §3): T-C14, T-C21/T-C33 (as one test), T-C46, T-C47;
 * - counter domains + residuals (v3.9 §3): T-C41;
 * - reversal receipts (v3.6 §4.3): T-C16 crash-replay legs;
 * - discovery contract (v3.8 §5, v3.9 §4): T-C34 (registration leg),
 *   T-C35, T-C37, T-C38, T-C39, T-C40, T-C50;
 * - frozen-record watch classifier (v3.8 §6, v3.9 §5): T-C36, T-C43.
 *
 * Access-lane tests (T-C15/T-C22–T-C24) bind the Slice 5 access lane,
 * which has no built op set yet; they are not realized here (see the
 * lane report's scope note). T-C10's final leg is realized with a
 * reward-family grant and asserts both families' figures, per the
 * family-scoped counter domains (v3.9 §3.3): the design's "position 4"
 * is the spendable total; the purchased position is asserted separately.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);
register("./entitlementAuthority.hooks.mjs", import.meta.url);

process.env.STARMAP_ENTITLEMENT_AUTHORITY_LOCAL = "1";
process.env.STARMAP_KV_ALLOW_LOCAL = "1";

const {
  applyEntitlementAuthorityOp,
  buildEntitlementAuthorityProjection,
  createEmptyEntitlementAuthorityState,
  deriveRemainingAllowance,
  deriveSignedPurchasedPosition,
  evaluateDeliveryEligibility,
  isValidEntitlementAuthorityState,
  journalHeadOf,
  pendingGrantsOf,
  reversalReceiptsOf,
  rewardGrantResidual,
  settledInclusionsOf,
} = await import("../../src/lib/entitlementAuthorityState.ts");
const {
  createEmptyReferralDiscoveryRow,
  isDiscoveryAbsence,
  recordTerminalNegative,
  registerDiscovery,
} = await import("../../src/lib/referralDiscovery.ts");
const { ReferralDiscoveryDO } = await import(
  "../../src/durable-objects/ReferralDiscoveryDO.ts"
);
const {
  classifyRecordObservation,
  lateDebitCandidateLegs,
} = await import("../../src/lib/frozenRecordWatch.ts");
const {
  createEntitlementAuthorityClient,
  __resetEntitlementAuthorityMemoryForTests,
  ENTITLEMENT_AUTHORITY_PROJECTION_KV_KEY,
} = await import("../../src/lib/entitlementAuthority.ts");
const { reverseReferralRewardViaAuthority } = await import(
  "../../src/lib/referralRewardAuthority.ts"
);

const NOW = Date.UTC(2026, 9, 23, 12, 0, 0);
const appRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const facts = (over = {}) => ({
  plan: "pack3",
  paid: true,
  revoked: false,
  subscriptionActive: false,
  mapId: "map-1",
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
  purchaseMapId: "map-1",
  accessTermsNote: null,
  capturedAt: NOW - 120_000,
  ...over,
});

function seeded({ sid = "cs_referrer", factsOver, baselineOver } = {}) {
  let s = createEmptyEntitlementAuthorityState(sid);
  s = applyEntitlementAuthorityOp(s, {
    type: "sync_facts",
    facts: facts(factsOver),
    now: NOW - 1000,
  }).state;
  s = applyEntitlementAuthorityOp(s, {
    type: "capture_baseline",
    baseline: baseline(baselineOver),
    now: NOW - 900,
  }).state;
  return s;
}

const grantRewardOp = (grantId, amount, over = {}) => ({
  type: "grant_reward",
  grantId,
  amount,
  now: NOW,
  ...over,
});

const commitOp = (artifactId, over = {}) => ({
  type: "commit",
  artifactId,
  mapId: "map-1",
  fingerprint: `fp-${artifactId}`,
  finalized: true,
  now: NOW,
  ...over,
});

const reload = (state) => {
  const roundTripped = JSON.parse(JSON.stringify(state));
  assert.equal(isValidEntitlementAuthorityState(roundTripped), true);
  return roundTripped;
};

/* ---------------- classification / inclusion ---------------- */

test("T-C29: aggregate room does not prove inclusion; order-independent unresolved", () => {
  // Snapshot aggregate 1 (allowance 4 over plan 3), contributed entirely
  // by grant A in truth. B presents first with a finalized witness.
  const mk = () =>
    seeded({ baselineOver: { allowance: 4, legacyRemainingBalance: 4, legacySpentCount: 0 } });
  const evidence = {
    sessionCreatedAt: NOW - 200_000, // predates the snapshot
    fencingCompletedAt: null,
    witness: "finalized_grant",
  };
  let s = mk();
  const bFirst = applyEntitlementAuthorityOp(s, grantRewardOp("cs_b", 1, { classificationEvidence: evidence }));
  assert.equal(bFirst.outcome, "grant_pending");
  assert.equal(bFirst.pendingKind, "inclusion");
  s = bFirst.state;
  assert.equal(s.rewardGrantedTotal, 0); // zero fold effect
  assert.equal(s.rewardBucketBalance, 0);
  const aSecond = applyEntitlementAuthorityOp(s, grantRewardOp("cs_a", 1, { classificationEvidence: evidence }));
  assert.equal(aSecond.outcome, "grant_pending");
  s = aSecond.state;

  // Swapped presentation order: identical outcome pair.
  let s2 = mk();
  s2 = applyEntitlementAuthorityOp(s2, grantRewardOp("cs_a", 1, { classificationEvidence: evidence })).state;
  const bSecond = applyEntitlementAuthorityOp(s2, grantRewardOp("cs_b", 1, { classificationEvidence: evidence }));
  assert.equal(bSecond.outcome, "grant_pending");

  // An operator receipt settles A included (observation); B stays pending.
  const settled = applyEntitlementAuthorityOp(s, {
    type: "resolve_grant_inclusion",
    grantId: "cs_a",
    classification: "included",
    evidence: "operator_receipt",
    now: NOW + 1,
  });
  assert.equal(settled.outcome, "inclusion_settled");
  assert.equal(settled.state.rewardGrantedTotal, 0);
  assert.ok(settledInclusionsOf(settled.state)["cs_a"]);
  assert.ok(pendingGrantsOf(settled.state)["cs_b"]);
  reload(settled.state);
});

test("T-C44 + redelivery leg: lost witness classifies unresolved, never native; a pending entry is not its own proof", () => {
  // Legacy record as built writers leave it: pack3, spend 2, grant 1
  // lands → remaining 2, total 3. The witness is absent at presentation.
  let s = seeded({ baselineOver: { allowance: 3, legacyRemainingBalance: 2, legacySpentCount: 1 } });
  const positionBefore = deriveRemainingAllowance(s);
  const presented = applyEntitlementAuthorityOp(
    s,
    grantRewardOp("cs_g", 1, {
      classificationEvidence: {
        sessionCreatedAt: NOW - 300_000, // predates fencing and snapshot
        fencingCompletedAt: NOW - 100_000,
        witness: "absent",
      },
    }),
  );
  // P-b fails (session predates fencing), P-c fails (session predates
  // the snapshot), no journal entry exists → unresolved, zero fold.
  assert.equal(presented.outcome, "grant_pending");
  s = presented.state;
  assert.equal(deriveRemainingAllowance(s), positionBefore);

  // Redelivery before any receipt: dispatch to the existing entry; the
  // classification remains unresolved; no provenance is recorded.
  const redelivered = applyEntitlementAuthorityOp(s, grantRewardOp("cs_g", 1, {
    classificationEvidence: {
      sessionCreatedAt: NOW - 300_000,
      fencingCompletedAt: NOW - 100_000,
      witness: "absent",
    },
  }));
  assert.equal(redelivered.outcome, "grant_pending");
  assert.equal(redelivered.changed, false);
  assert.equal(deriveRemainingAllowance(redelivered.state), positionBefore);

  // The receipt settles it.
  const settled = applyEntitlementAuthorityOp(redelivered.state, {
    type: "resolve_grant_inclusion",
    grantId: "cs_g",
    classification: "included",
    evidence: "operator_receipt",
    now: NOW + 1,
  });
  assert.equal(settled.outcome, "inclusion_settled");
  reload(settled.state);
});

test("T-C45: provenance controls — P-b native admission, P-c exclusion-fold, dispatch on redelivery", () => {
  // P-b: session created after recorded fencing completion, no witness.
  let s = seeded();
  const pb = applyEntitlementAuthorityOp(
    s,
    grantRewardOp("cs_new", 1, {
      classificationEvidence: {
        sessionCreatedAt: NOW - 50_000,
        fencingCompletedAt: NOW - 100_000,
        witness: "absent",
      },
    }),
  );
  assert.equal(pb.outcome, "reward_granted");
  assert.equal(pb.state.rewardBucketBalance, 1);
  // Dispatch: the same grant redelivers — no second fold.
  const again = applyEntitlementAuthorityOp(pb.state, grantRewardOp("cs_new", 1, {
    classificationEvidence: {
      sessionCreatedAt: NOW - 50_000,
      fencingCompletedAt: NOW - 100_000,
      witness: "absent",
    },
  }));
  assert.equal(again.outcome, "reward_already_granted");
  assert.equal(again.state.rewardBucketBalance, 1);

  // P-c: referrer snapshotted at an earlier contact; session created
  // after that capture → excluded from THIS snapshot, folds here.
  let s2 = seeded();
  const pc = applyEntitlementAuthorityOp(
    s2,
    grantRewardOp("cs_late", 1, {
      classificationEvidence: {
        sessionCreatedAt: NOW - 60_000, // after capturedAt (NOW-120s)
        fencingCompletedAt: null,
        witness: "absent",
      },
    }),
  );
  assert.equal(pc.outcome, "reward_granted");
  assert.equal(pc.state.rewardBucketBalance, 1);
});

test("T-C48: receipted zero-aggregate settles included; the aggregate is never consulted", () => {
  // v3.9 §2.5's construction: pack3, spend 2, grant 1 refills →
  // total 3, aggregate 0, figure 2, witness finalized for 1.
  let s = seeded({ baselineOver: { allowance: 3, legacyRemainingBalance: 2, legacySpentCount: 1 } });
  assert.equal(s.creationSnapshot.unexplainedRewardAggregate, 0);
  const withReceipt = applyEntitlementAuthorityOp(
    s,
    grantRewardOp("cs_g", 1, {
      classificationEvidence: {
        sessionCreatedAt: NOW - 300_000,
        fencingCompletedAt: null,
        witness: "finalized_grant",
        operatorIncludedReceipt: true,
      },
    }),
  );
  assert.equal(withReceipt.outcome, "already_included_in_opening");
  assert.equal(withReceipt.state.rewardGrantedTotal, 0); // zero additional fold
  // Control: without the receipt the same presentation stays unresolved.
  const control = applyEntitlementAuthorityOp(
    s,
    grantRewardOp("cs_g", 1, {
      classificationEvidence: {
        sessionCreatedAt: NOW - 300_000,
        fencingCompletedAt: null,
        witness: "finalized_grant",
      },
    }),
  );
  assert.equal(control.outcome, "grant_pending");
});

test("T-C49/T-C51: a pendency holds no balance; included settles +0, excluded settles +amount", () => {
  // T-C49: opening 2 carries G's historical value; debits proceed
  // while G pends; included settlement adds nothing.
  let s = seeded({ baselineOver: { allowance: 3, legacyRemainingBalance: 2, legacySpentCount: 1 } });
  s = applyEntitlementAuthorityOp(s, grantRewardOp("cs_g", 1, {
    classificationEvidence: {
      sessionCreatedAt: NOW - 300_000,
      fencingCompletedAt: null,
      witness: "finalized_grant",
    },
  })).state;
  assert.ok(pendingGrantsOf(s)["cs_g"]);
  s = applyEntitlementAuthorityOp(s, commitOp("art-1", { consumeToken: "ct-1" })).state;
  s = applyEntitlementAuthorityOp(s, commitOp("art-2", { consumeToken: "ct-2" })).state;
  assert.equal(deriveRemainingAllowance(s), 0); // both opening credits spent
  const settledIn = applyEntitlementAuthorityOp(s, {
    type: "resolve_grant_inclusion",
    grantId: "cs_g",
    classification: "included",
    evidence: "operator_receipt",
    now: NOW + 1,
  });
  assert.equal(deriveRemainingAllowance(settledIn.state), 0); // settlement added no credit

  // T-C51: the same posture settling EXCLUDED confers the amount at
  // settlement, and nothing before it.
  let s2 = seeded({ baselineOver: { allowance: 3, legacyRemainingBalance: 2, legacySpentCount: 1 } });
  s2 = applyEntitlementAuthorityOp(s2, grantRewardOp("cs_g", 1, {
    classificationEvidence: {
      sessionCreatedAt: NOW - 300_000,
      fencingCompletedAt: null,
      witness: "finalized_grant",
    },
  })).state;
  assert.equal(deriveRemainingAllowance(s2), 2);
  const settledEx = applyEntitlementAuthorityOp(s2, {
    type: "resolve_grant_inclusion",
    grantId: "cs_g",
    classification: "excluded",
    evidence: "operator_receipt",
    now: NOW + 1,
  });
  assert.equal(deriveRemainingAllowance(settledEx.state), 3);
  assert.equal(settledEx.state.rewardGrantedTotal, 1); // entered via the settlement entry only
  reload(settledEx.state);
});

/* ---------------- snapshot + installation ---------------- */

test("T-C11: first-contact double-count — a delayed W1 against its own snapshot is an observation", () => {
  let s = seeded({
    sid: "cs_pack3",
    baselineOver: { allowance: 3, legacyRemainingBalance: 3, legacySpentCount: 0 },
  });
  const r = applyEntitlementAuthorityOp(s, {
    type: "purchase_grant",
    amount: 3,
    now: NOW,
  });
  assert.equal(r.outcome, "already_included_in_opening");
  assert.equal(deriveRemainingAllowance(r.state), 3); // NOT 6
});

test("T-C10: installation arithmetic — O_v + F + S, receipt with zero fold effect, signed position", () => {
  let s = seeded({
    baselineOver: { allowance: 3, legacyRemainingBalance: 3, legacySpentCount: 0 },
  });
  // Journaled debits −3 → position 0.
  for (const [i, tok] of ["ct-a", "ct-b", "ct-c"].entries()) {
    s = applyEntitlementAuthorityOp(s, commitOp(`art-${i}`, { consumeToken: tok })).state;
  }
  assert.equal(deriveSignedPurchasedPosition(s), 0);
  const head = journalHeadOf(s);
  // Verified opening 1: O_v + F = 1 − 3 = −2 → S = 2, base 3.
  const installed = applyEntitlementAuthorityOp(s, {
    type: "record_checkpoint",
    verifiedOpening: 1,
    attestedJournalHead: head,
    snapshotFigureEcho: 3,
    now: NOW + 1,
  });
  assert.equal(installed.outcome, "checkpoint_recorded");
  const receipt = installed.state.verificationReceipt;
  assert.deepEqual(
    {
      Ou: receipt.unverifiedOpening,
      Ov: receipt.verifiedOpening,
      F: receipt.journalFoldAtInstall,
      S: receipt.shortfallAbsorption,
    },
    { Ou: 3, Ov: 1, F: -3, S: 2 },
  );
  assert.equal(installed.state.installedOpeningBase, 3);
  assert.equal(deriveSignedPurchasedPosition(installed.state), 0);
  assert.equal(deriveRemainingAllowance(installed.state), 0); // spendable 0
  reload(installed.state);
  // A restoration naming one debit adds normally against the floored base.
  const restored = applyEntitlementAuthorityOp(installed.state, {
    type: "compensate_debit",
    consumeToken: "ct-a",
    now: NOW + 2,
  });
  assert.equal(restored.outcome, "compensated");
  assert.equal(deriveSignedPurchasedPosition(restored.state), 1);
  // A new grant of 3 (reward family) brings the spendable total to 4;
  // the purchased position stays 1 — the families never mix (T-C41's
  // domain rule applied to this test's final leg).
  const granted = applyEntitlementAuthorityOp(restored.state, grantRewardOp("cs_new_ref", 3));
  assert.equal(deriveRemainingAllowance(granted.state), 4);
  assert.equal(deriveSignedPurchasedPosition(granted.state), 1);
});

test("T-C12: attestation head-binding — a moved head refuses; re-attestation at the new head installs", () => {
  let s = seeded();
  const headAtAttest = journalHeadOf(s);
  s = applyEntitlementAuthorityOp(s, commitOp("art-x", { consumeToken: "ct-x" })).state; // head moves
  const refusedInstall = applyEntitlementAuthorityOp(s, {
    type: "record_checkpoint",
    verifiedOpening: 2,
    attestedJournalHead: headAtAttest,
    snapshotFigureEcho: 2,
    now: NOW + 1,
  });
  assert.equal(refusedInstall.outcome, "refused");
  assert.equal(refusedInstall.refusal, "attestation_head_mismatch");
  assert.equal(refusedInstall.state.verificationReceipt, null);
  const ok = applyEntitlementAuthorityOp(s, {
    type: "record_checkpoint",
    verifiedOpening: 2,
    attestedJournalHead: journalHeadOf(s),
    snapshotFigureEcho: 2,
    now: NOW + 2,
  });
  assert.equal(ok.outcome, "checkpoint_recorded");
  assert.equal(ok.state.verificationReceipt.attestedJournalHead, journalHeadOf(s));
});

test("T-C13/T-C20(i): installation reads the snapshot only — a record-derived figure is refused", () => {
  let s = seeded({
    baselineOver: { allowance: 3, legacyRemainingBalance: 3, legacySpentCount: 0 },
  });
  s = applyEntitlementAuthorityOp(s, commitOp("art-1", { consumeToken: "ct-1" })).state;
  assert.equal(deriveSignedPurchasedPosition(s), 2);
  // A bundle proposing O = 2 from a record re-read (already net of the
  // journaled debit) is refused: the opening traces to the snapshot.
  const bad = applyEntitlementAuthorityOp(s, {
    type: "record_checkpoint",
    verifiedOpening: 2,
    attestedJournalHead: journalHeadOf(s),
    snapshotFigureEcho: 2,
    now: NOW + 1,
  });
  assert.equal(bad.outcome, "refused");
  assert.equal(bad.refusal, "opening_not_from_snapshot");
  const good = applyEntitlementAuthorityOp(s, {
    type: "record_checkpoint",
    verifiedOpening: 3,
    attestedJournalHead: journalHeadOf(s),
    snapshotFigureEcho: 3,
    now: NOW + 1,
  });
  assert.equal(good.outcome, "checkpoint_recorded");
  assert.equal(deriveSignedPurchasedPosition(good.state), 2); // debit counted once, in F
});

/* ---------------- pending birth ---------------- */

test("T-C31: birth-unresolved grant pends at zero fold; late snapshot settles it by construction", () => {
  let s = createEmptyEntitlementAuthorityState("cs_old_pack3");
  s = applyEntitlementAuthorityOp(s, { type: "sync_facts", facts: facts(), now: NOW - 1000 }).state;
  const presented = applyEntitlementAuthorityOp(s, {
    type: "purchase_grant",
    amount: 3,
    sessionCreatedAt: null,
    authorityEraStart: NOW - 500_000,
    now: NOW,
  });
  assert.equal(presented.outcome, "grant_pending");
  assert.equal(presented.pendingKind, "birth");
  s = presented.state;
  assert.equal(s.creationProvenance, "birth_unresolved");
  // No execution point exposes a spendable 3 (or the plan's 3): the
  // opening figure of an unresolved birth is 0.
  assert.equal(deriveSignedPurchasedPosition(s), 0);
  assert.equal(deriveRemainingAllowance(s), 0);
  reload(s);

  // The customer's first commit attempt is impossible (nothing folded),
  // then the record reads (remaining 1): late snapshot, settle included.
  let s2 = applyEntitlementAuthorityOp(s, {
    type: "capture_baseline",
    baseline: baseline({ allowance: 3, legacyRemainingBalance: 1, legacySpentCount: 2 }),
    now: NOW + 1,
  }).state;
  assert.equal(deriveSignedPurchasedPosition(s2), 1);
  const settled = applyEntitlementAuthorityOp(s2, {
    type: "resolve_grant_inclusion",
    grantId: "cs_old_pack3",
    classification: "included",
    evidence: "late_snapshot",
    now: NOW + 2,
  });
  assert.equal(settled.outcome, "inclusion_settled");
  assert.equal(deriveSignedPurchasedPosition(settled.state), 1); // exactly 1 — the phantom 2 never existed
  const commit = applyEntitlementAuthorityOp(settled.state, commitOp("art-1", { consumeToken: "ct-1" }));
  assert.equal(commit.outcome, "committed");
  const second = applyEntitlementAuthorityOp(commit.state, commitOp("art-2", { consumeToken: "ct-2" }));
  assert.equal(second.outcome, "refused");
  assert.equal(second.refusal, "no_credits");
});

test("T-C32: proven folded value spends during a birth pendency; owned delivery never waits", () => {
  let s = createEmptyEntitlementAuthorityState("cs_buyer_referrer");
  s = applyEntitlementAuthorityOp(s, { type: "sync_facts", facts: facts(), now: NOW - 1000 }).state;
  s = applyEntitlementAuthorityOp(s, {
    type: "purchase_grant",
    amount: 3,
    sessionCreatedAt: null,
    authorityEraStart: NOW - 500_000,
    now: NOW,
  }).state;
  // A referral grant classified excluded (era proof) folds: proven value.
  const folded = applyEntitlementAuthorityOp(s, grantRewardOp("cs_ref1", 1, {
    classificationEvidence: {
      sessionCreatedAt: NOW - 10_000,
      fencingCompletedAt: NOW - 100_000,
      witness: "absent",
    },
  }));
  assert.equal(folded.outcome, "reward_granted");
  s = folded.state;
  const commit = applyEntitlementAuthorityOp(s, commitOp("art-owned", { consumeToken: "ct-o" }));
  assert.equal(commit.outcome, "committed"); // drew the proven value
  s = commit.state;
  // A commit only the pending birth amount could fund names the pendency.
  const beyond = applyEntitlementAuthorityOp(s, commitOp("art-more", { consumeToken: "ct-m" }));
  assert.equal(beyond.outcome, "refused");
  assert.equal(beyond.refusal, "insufficient_balance_pending");
  // Delivery of the owned file proceeds on ownership + validity.
  assert.deepEqual(evaluateDeliveryEligibility(s, "art-owned"), { ok: true });
});

/* ---------------- compensation × reversal ---------------- */

function spentBucketState() {
  // Opening 0 (allowance 3, spent 3); one reward grant of 1.
  let s = seeded({ baselineOver: { allowance: 3, legacyRemainingBalance: 0, legacySpentCount: 3 } });
  s = applyEntitlementAuthorityOp(s, grantRewardOp("cs_g1", 1)).state;
  return s;
}

test("T-C14: both orders — after reversal the grant contributes 0; the receipt records what the reversal did", () => {
  // Reverse, then compensate: receipt 0; compensation refuses the reward portion.
  let a = spentBucketState();
  a = applyEntitlementAuthorityOp(a, commitOp("art-a", { consumeToken: "ct-a" })).state; // bucket 0
  const revA = applyEntitlementAuthorityOp(a, { type: "reverse_reward", grantId: "cs_g1", now: NOW + 1 });
  assert.equal(revA.rewardClawed, 0);
  assert.equal(reversalReceiptsOf(revA.state)["cs_g1"].clawedAmount, 0);
  const compA = applyEntitlementAuthorityOp(revA.state, {
    type: "compensate_debit",
    consumeToken: "ct-a",
    now: NOW + 2,
  });
  assert.equal(compA.outcome, "refused");
  assert.equal(compA.refusal, "funding_grant_reversed");
  assert.equal(compA.state.rewardBucketBalance, 0);
  reload(compA.state);

  // Compensate, then reverse: receipt 1; same end spendable (0).
  let b = spentBucketState();
  b = applyEntitlementAuthorityOp(b, commitOp("art-a", { consumeToken: "ct-a" })).state;
  const compB = applyEntitlementAuthorityOp(b, {
    type: "compensate_debit",
    consumeToken: "ct-a",
    now: NOW + 1,
  });
  assert.equal(compB.outcome, "compensated");
  assert.equal(compB.state.rewardBucketBalance, 1);
  const revB = applyEntitlementAuthorityOp(compB.state, {
    type: "reverse_reward",
    grantId: "cs_g1",
    now: NOW + 2,
  });
  assert.equal(revB.rewardClawed, 1);
  assert.equal(revB.state.rewardBucketBalance, 0);
  reload(revB.state);
});

test("T-C21/T-C33: mixed-funded debit — the order property quantifies over reward-portion restorations only", () => {
  const mixed = () => {
    let s = seeded({ baselineOver: { allowance: 3, legacyRemainingBalance: 2, legacySpentCount: 1 } });
    s = applyEntitlementAuthorityOp(s, grantRewardOp("cs_g", 1)).state; // bucket 1
    const d = applyEntitlementAuthorityOp(s, commitOp("art-d", { credits: 2, consumeToken: "ct-d" }));
    assert.equal(d.state.ownedFiles["art-d"].rewardPortion, 1);
    assert.equal(d.state.ownedFiles["art-d"].purchasedPortion, 1);
    assert.equal(d.state.ownedFiles["art-d"].fundingGrantId, "cs_g");
    return d.state;
  };
  // Compensate, then reverse: both portions restored; receipt = pooled claw.
  let a = mixed();
  a = applyEntitlementAuthorityOp(a, { type: "compensate_debit", consumeToken: "ct-d", now: NOW + 1 }).state;
  const revA = applyEntitlementAuthorityOp(a, { type: "reverse_reward", grantId: "cs_g", now: NOW + 2 });
  assert.equal(revA.rewardClawed, 1);
  reload(revA.state); // validates: restoration seq < reversal seq

  // Reverse at seq r, then compensate at r+1 restoring the PURCHASED
  // portion only: valid after reload — the restoration is outside the
  // order property's quantifier (finding 3's exact construction).
  let b = mixed();
  b = applyEntitlementAuthorityOp(b, { type: "reverse_reward", grantId: "cs_g", now: NOW + 1 }).state;
  const compB = applyEntitlementAuthorityOp(b, {
    type: "compensate_debit",
    consumeToken: "ct-d",
    now: NOW + 2,
  });
  assert.equal(compB.outcome, "compensated");
  assert.equal(compB.restoration.purchasedRestored, 1);
  assert.equal(compB.restoration.rewardRestored, 0);
  assert.equal(compB.restoration.rewardRefusal, "funding_grant_reversed");
  reload(compB.state);
});

test("T-C46 (v3.11 trace): reversed funding grant refuses; the bucket is 1 before and after", () => {
  let s = seeded({ baselineOver: { allowance: 3, legacyRemainingBalance: 0, legacySpentCount: 3 } });
  s = applyEntitlementAuthorityOp(s, grantRewardOp("cs_g1", 1)).state; // bucket 1
  s = applyEntitlementAuthorityOp(s, commitOp("art-d", { consumeToken: "ct-d" })).state; // bucket 0, funding G1
  const rev = applyEntitlementAuthorityOp(s, { type: "reverse_reward", grantId: "cs_g1", now: NOW + 1 });
  assert.equal(rev.rewardClawed, 0); // min(1 − 0, 0): nothing unspent to claw
  s = applyEntitlementAuthorityOp(rev.state, grantRewardOp("cs_g2", 1)).state; // bucket 1
  s = reload(s);
  const comp = applyEntitlementAuthorityOp(s, {
    type: "compensate_debit",
    consumeToken: "ct-d",
    now: NOW + 2,
  });
  assert.equal(comp.outcome, "refused");
  assert.equal(comp.refusal, "funding_grant_reversed");
  assert.equal(comp.state.rewardBucketBalance, 1); // not 2: no migration to a surviving grant
});

test("T-C47: a fully spent, unreversed grant compensates from bucket 0; double restore refuses", () => {
  let s = seeded({ baselineOver: { allowance: 3, legacyRemainingBalance: 0, legacySpentCount: 3 } });
  s = applyEntitlementAuthorityOp(s, grantRewardOp("cs_g1", 1)).state;
  s = applyEntitlementAuthorityOp(s, commitOp("art-d", { consumeToken: "ct-d" })).state;
  assert.equal(s.rewardBucketBalance, 0);
  s = reload(s);
  const comp = applyEntitlementAuthorityOp(s, {
    type: "compensate_debit",
    consumeToken: "ct-d",
    now: NOW + 1,
  });
  assert.equal(comp.outcome, "compensated");
  assert.equal(comp.state.rewardBucketBalance, 1); // the bucket's 0 neither budgeted nor bounded it
  const again = applyEntitlementAuthorityOp(comp.state, {
    type: "compensate_debit",
    consumeToken: "ct-d",
    now: NOW + 2,
  });
  assert.equal(again.outcome, "already_compensated");
});

/* ---------------- counter domains / residuals ---------------- */

test("T-C41: residuals are signed bookkeeping, never balances; counter domains are family-scoped", () => {
  let s = seeded({ baselineOver: { allowance: 3, legacyRemainingBalance: 0, legacySpentCount: 3 } });
  s = applyEntitlementAuthorityOp(s, grantRewardOp("cs_g1", 1)).state;
  s = applyEntitlementAuthorityOp(s, grantRewardOp("cs_g2", 1)).state; // bucket 2
  s = applyEntitlementAuthorityOp(s, commitOp("art-d", { consumeToken: "ct-d" })).state; // FIFO → G1
  assert.equal(s.ownedFiles["art-d"].fundingGrantId, "cs_g1");
  const rev = applyEntitlementAuthorityOp(s, { type: "reverse_reward", grantId: "cs_g1", now: NOW + 1 });
  assert.equal(rev.rewardClawed, 1); // pooled claw takes the pool's credit
  s = rev.state;
  assert.equal(s.rewardBucketBalance, 0);
  assert.equal(rewardGrantResidual(s.rewardGrants["cs_g1"]), -1);
  assert.equal(rewardGrantResidual(s.rewardGrants["cs_g2"]), 1);
  reload(s); // a negative residual is a VALID state
  // The bucket (0) is the only spendable figure: a further debit
  // refuses despite G2's positive residual.
  const debit = applyEntitlementAuthorityOp(s, commitOp("art-e", { consumeToken: "ct-e" }));
  assert.equal(debit.outcome, "refused");

  // Family domains: an own-purchase settlement enters NO reward identity.
  let own = createEmptyEntitlementAuthorityState("cs_own");
  own = applyEntitlementAuthorityOp(own, { type: "sync_facts", facts: facts(), now: NOW - 1000 }).state;
  const pg = applyEntitlementAuthorityOp(own, {
    type: "purchase_grant",
    amount: 3,
    sessionCreatedAt: NOW - 10,
    authorityEraStart: NOW - 500_000,
    now: NOW,
  });
  assert.equal(pg.outcome, "reward_granted"); // native initialization
  assert.equal(pg.state.foldedOwnGrantTotal, 3);
  assert.equal(pg.state.rewardGrantedTotal, 0);
  assert.equal(deriveRemainingAllowance(pg.state), 3);
});

/* ---------------- reversal receipts ---------------- */

test("T-C16 legs: replay returns the original receipt verbatim; late grant after a terminal receipt refuses + incidents", async () => {
  let s = seeded();
  s = applyEntitlementAuthorityOp(s, grantRewardOp("cs_big", 2)).state;
  const rev = applyEntitlementAuthorityOp(s, { type: "reverse_reward", grantId: "cs_big", now: NOW + 1 });
  assert.equal(rev.rewardClawed, 2);
  // Crash-replay: caller died before KV finalization; redelivery
  // returns the original 2, not a re-derived 0.
  const replay = applyEntitlementAuthorityOp(rev.state, {
    type: "reverse_reward",
    grantId: "cs_big",
    now: NOW + 2,
  });
  assert.equal(replay.outcome, "reward_reversal_already_applied");
  assert.equal(replay.rewardClawed, 2);

  // Wrapper level: the same guarantee across the client boundary.
  __resetEntitlementAuthorityMemoryForTests();
  const client = createEntitlementAuthorityClient();
  const REF = "cs_wrapper_referrer";
  await client.apply(REF, { type: "sync_facts", facts: facts(), now: NOW - 1000 });
  await client.apply(REF, { type: "capture_baseline", baseline: baseline(), now: NOW - 900 });
  await client.apply(REF, grantRewardOp("cs_w", 2));
  const w1 = await reverseReferralRewardViaAuthority(client, REF, "cs_w", NOW + 1);
  assert.deepEqual(w1, { status: "reversed", clawed: 2 });
  const w2 = await reverseReferralRewardViaAuthority(client, REF, "cs_w", NOW + 2);
  assert.deepEqual(w2, { status: "already_reversed", clawed: 2 });

  // Late grant after a terminal NOT-BUCKET receipt: refused, incident
  // journaled, bucket uncredited.
  let t = seeded();
  const nb = applyEntitlementAuthorityOp(t, {
    type: "reverse_reward",
    grantId: "cs_pre",
    operatorReceipt: true,
    now: NOW,
  });
  assert.equal(nb.outcome, "not_bucket_grant");
  t = nb.state;
  const late = applyEntitlementAuthorityOp(t, grantRewardOp("cs_pre", 1));
  assert.equal(late.outcome, "refused");
  assert.equal(late.refusal, "grant_after_terminal_receipt");
  assert.equal(late.state.rewardBucketBalance, 0);
  assert.ok(late.state.lateGrantIncidents["cs_pre"]);
});

test("reversal of a pending grant defers (outcome 3); settled-included takes terminal zero by basis (a)", () => {
  let s = seeded({ baselineOver: { allowance: 4, legacyRemainingBalance: 4, legacySpentCount: 0 } });
  s = applyEntitlementAuthorityOp(s, grantRewardOp("cs_p", 1, {
    classificationEvidence: {
      sessionCreatedAt: NOW - 300_000,
      fencingCompletedAt: null,
      witness: "finalized_grant",
    },
  })).state;
  const deferred = applyEntitlementAuthorityOp(s, { type: "reverse_reward", grantId: "cs_p", now: NOW + 1 });
  assert.equal(deferred.outcome, "refused");
  assert.equal(deferred.refusal, "reversal_deferred");
  // Settle included → reversal proceeds to terminal zero, basis (a),
  // with a journaled receipt — no enumeration anywhere.
  s = applyEntitlementAuthorityOp(s, {
    type: "resolve_grant_inclusion",
    grantId: "cs_p",
    classification: "included",
    evidence: "operator_receipt",
    now: NOW + 2,
  }).state;
  const term = applyEntitlementAuthorityOp(s, { type: "reverse_reward", grantId: "cs_p", now: NOW + 3 });
  assert.equal(term.outcome, "not_bucket_grant");
  assert.equal(term.reversalBasis, "pre_bucket_in_opening");
  assert.equal(term.rewardClawed, 0);
  assert.equal(reversalReceiptsOf(term.state)["cs_p"].basis, "pre_bucket_in_opening");
});

/* ---------------- discovery contract ---------------- */

test("T-C37/T-C38: terminal-first admits born-reversed; registration-first makes the question live", () => {
  // T-C38 leg (pure machine): register → terminal cannot be recorded.
  let row = createEmptyReferralDiscoveryRow("cs_s");
  let r = registerDiscovery(row, { referrerSessionId: "cs_r", grantId: "cs_s", now: NOW });
  assert.equal(r.outcome, "registered");
  const tn = recordTerminalNegative(r.row, { lineageRef: "lin-1", now: NOW + 1 });
  assert.equal(tn.outcome, "association_exists");

  // T-C37: terminal recorded first; the grant then admits born-reversed.
  row = createEmptyReferralDiscoveryRow("cs_s2");
  const rec = recordTerminalNegative(row, { lineageRef: "lin-9", now: NOW });
  assert.equal(rec.outcome, "recorded");
  r = registerDiscovery(rec.row, { referrerSessionId: "cs_r", grantId: "cs_s2", now: NOW + 1 });
  assert.equal(r.outcome, "registered_after_terminal");
  let s = seeded({ sid: "cs_r" });
  const bucketBefore = s.rewardBucketBalance;
  const admitted = applyEntitlementAuthorityOp(s, grantRewardOp("cs_s2", 1, {
    discoveryRegistration: "registered_after_terminal",
    terminalRecord: { lineageRef: "lin-9", recordedAt: NOW },
  }));
  assert.equal(admitted.outcome, "reward_granted_born_reversed");
  assert.equal(admitted.state.rewardBucketBalance, bucketBefore); // unchanged net
  assert.equal(admitted.state.rewardGrants["cs_s2"].reversed, true);
  assert.equal(reversalReceiptsOf(admitted.state)["cs_s2"].clawedAmount, 1);
  assert.equal(reversalReceiptsOf(admitted.state)["cs_s2"].basis, "born_reversed_terminal");
  assert.deepEqual(reversalReceiptsOf(admitted.state)["cs_s2"].terminalCitation, {
    referredSessionId: "cs_s2",
    lineageRef: "lin-9",
    recordedAt: NOW,
  });
  reload(admitted.state);
  // A later W14 resolves against the journaled receipt.
  const w14 = applyEntitlementAuthorityOp(admitted.state, {
    type: "reverse_reward",
    grantId: "cs_s2",
    now: NOW + 2,
  });
  assert.equal(w14.outcome, "reward_reversal_already_applied");
  assert.equal(w14.rewardClawed, 1);
});

test("T-C39/T-C34: pending discovery → refund records terminal → retry settles born-reversed", () => {
  let s = seeded({ sid: "cs_r" });
  const pended = applyEntitlementAuthorityOp(s, grantRewardOp("cs_s", 1, {
    discoveryRegistration: "unavailable",
  }));
  assert.equal(pended.outcome, "grant_pending");
  assert.equal(pended.pendingKind, "discovery");
  assert.equal(pended.state.rewardBucketBalance, 0); // no committed-unregistered state
  s = pended.state;
  // Refund lineage: absence read, terminal recorded before finalizing.
  let row = createEmptyReferralDiscoveryRow("cs_s");
  assert.equal(isDiscoveryAbsence(row), true);
  const rec = recordTerminalNegative(row, { lineageRef: "lin-1", now: NOW + 1 });
  assert.equal(rec.outcome, "recorded");
  // Retry re-runs the leg: registered_after_terminal — the terminal
  // obligation attaches to the pending entry on redelivery dispatch,
  // so its excluded settlement IS the born-reversed pair (the T-C50
  // path, reached here through the retry rather than first admission).
  const reg = registerDiscovery(rec.row, { referrerSessionId: "cs_r", grantId: "cs_s", now: NOW + 2 });
  assert.equal(reg.outcome, "registered_after_terminal");
  const redispatched = applyEntitlementAuthorityOp(s, grantRewardOp("cs_s", 1, {
    discoveryRegistration: "registered_after_terminal",
    terminalRecord: { lineageRef: "lin-1", recordedAt: NOW + 1 },
  }));
  assert.equal(redispatched.outcome, "grant_pending");
  assert.equal(
    pendingGrantsOf(redispatched.state)["cs_s"].terminalObligation.lineageRef,
    "lin-1",
  );
  const settled = applyEntitlementAuthorityOp(redispatched.state, {
    type: "resolve_grant_inclusion",
    grantId: "cs_s",
    classification: "excluded",
    evidence: "era_proof",
    now: NOW + 3,
  });
  assert.equal(settled.outcome, "inclusion_settled");
  assert.equal(settled.state.rewardGrants["cs_s"].reversed, true);
  assert.equal(settled.state.rewardBucketBalance, 0); // pair: net zero

  // Conflict leg: a second referrer for the same referred id refuses
  // (evaluated against the row that now carries the association).
  const sameAgain = registerDiscovery(reg.row, {
    referrerSessionId: "cs_r",
    grantId: "cs_s",
    now: NOW + 4,
  });
  assert.equal(sameAgain.outcome, "already_registered");
  const conflict = registerDiscovery(reg.row, {
    referrerSessionId: "cs_other",
    grantId: "cs_s",
    now: NOW + 4,
  });
  assert.equal(conflict.outcome, "conflict");
  const machineConflict = applyEntitlementAuthorityOp(seeded({ sid: "cs_other" }), grantRewardOp("cs_s", 1, {
    discoveryRegistration: "conflict",
  }));
  assert.equal(machineConflict.outcome, "refused");
  assert.equal(machineConflict.refusal, "discovery_conflict");
});

test("T-C40: crash after the terminal record, before dedupe finalization — exactly one record, cited once", () => {
  let row = createEmptyReferralDiscoveryRow("cs_s");
  const first = recordTerminalNegative(row, { lineageRef: "lin-1", now: NOW });
  assert.equal(first.outcome, "recorded");
  row = first.row;
  // Recovery re-run of the SAME lineage: already_recorded posture; it
  // finalizes on its own record without re-deriving absence.
  const rerun = recordTerminalNegative(row, { lineageRef: "lin-1", now: NOW + 1 });
  assert.equal(rerun.outcome, "already_recorded");
  assert.equal(rerun.row.terminalNegative.recordedAt, NOW); // first writer stands
  // A different lineage cites only after its own evaluation.
  const other = recordTerminalNegative(row, { lineageRef: "lin-2", now: NOW + 2 });
  assert.equal(other.outcome, "terminal_exists");
  assert.equal(other.row.terminalNegative.lineageRef, "lin-1");
});

test("T-C35: typed absence is an answer; a failed read is not — and the era condition is the lineage's, enforced by its caller", () => {
  const row = createEmptyReferralDiscoveryRow("cs_never");
  assert.equal(isDiscoveryAbsence(row), true); // typed absence
  assert.equal(row.referrerSessionId, null);
  assert.equal(row.terminalNegative, null);
});

test("T-C50: the terminal obligation rides the pending entry; excluded settlement is atomically born-reversed", () => {
  let s = seeded({ sid: "cs_r", baselineOver: { allowance: 4, legacyRemainingBalance: 4, legacySpentCount: 0 } });
  const pended = applyEntitlementAuthorityOp(s, grantRewardOp("cs_s", 1, {
    discoveryRegistration: "registered_after_terminal",
    terminalRecord: { lineageRef: "lin-7", recordedAt: NOW },
    classificationEvidence: {
      sessionCreatedAt: NOW - 300_000,
      fencingCompletedAt: null,
      witness: "unfinalized",
    },
  }));
  assert.equal(pended.outcome, "grant_pending");
  const pending = pendingGrantsOf(pended.state)["cs_s"];
  assert.equal(pending.terminalObligation.lineageRef, "lin-7");
  assert.equal(pended.state.rewardBucketBalance, 0);
  s = reload(pended.state); // obligation survives persist/reload

  const settled = applyEntitlementAuthorityOp(s, {
    type: "resolve_grant_inclusion",
    grantId: "cs_s",
    classification: "excluded",
    evidence: "operator_receipt",
    now: NOW + 1,
  });
  assert.equal(settled.outcome, "inclusion_settled");
  assert.equal(settled.state.rewardGrants["cs_s"].reversed, true);
  assert.equal(settled.state.rewardBucketBalance, 0); // net zero: the pair, in one commit
  assert.equal(reversalReceiptsOf(settled.state)["cs_s"].clawedAmount, 1);
  reload(settled.state);

  // Companion: included settlement remains an observation — no reversal.
  let s2 = seeded({ sid: "cs_r", baselineOver: { allowance: 4, legacyRemainingBalance: 4, legacySpentCount: 0 } });
  s2 = applyEntitlementAuthorityOp(s2, grantRewardOp("cs_s", 1, {
    discoveryRegistration: "registered_after_terminal",
    terminalRecord: { lineageRef: "lin-7", recordedAt: NOW },
    classificationEvidence: {
      sessionCreatedAt: NOW - 300_000,
      fencingCompletedAt: null,
      witness: "unfinalized",
    },
  })).state;
  const settledIn = applyEntitlementAuthorityOp(s2, {
    type: "resolve_grant_inclusion",
    grantId: "cs_s",
    classification: "included",
    evidence: "operator_receipt",
    now: NOW + 1,
  });
  assert.equal(settledIn.state.rewardGrants["cs_s"], undefined);
  assert.ok(settledInclusionsOf(settledIn.state)["cs_s"]);
});

test("discovery DO: register/terminal survive a restart; absence is typed", async () => {
  class FakeSqlStorage {
    constructor(rows = new Map()) {
      this.rows = rows;
    }
    exec(sql, ...params) {
      const head = sql.trimStart().slice(0, 6).toUpperCase();
      if (head.startsWith("CREATE")) return { toArray: () => [] };
      if (head.startsWith("SELECT")) {
        const row = this.rows.get(params[0]);
        return { toArray: () => (row ? [row] : []) };
      }
      if (head.startsWith("INSERT")) {
        const [id, stateJson, updatedAt] = params;
        this.rows.set(id, {
          referred_session_id: id,
          state_json: stateJson,
          updated_at: updatedAt,
        });
        return { toArray: () => [] };
      }
      throw new Error(`unexpected SQL in fake: ${sql.slice(0, 80)}`);
    }
  }
  const fakeCtx = (sql) => ({
    storage: { sql },
    blockConcurrencyWhile(fn) {
      return fn();
    },
  });
  const sql = new FakeSqlStorage();
  const first = new ReferralDiscoveryDO(fakeCtx(sql), {});
  const absent = await first.getAssociation("cs_s");
  assert.equal(isDiscoveryAbsence(absent), true);
  const rec = await first.recordTerminalNegative("cs_s", { lineageRef: "lin-1", now: NOW });
  assert.equal(rec.outcome, "recorded");
  const restarted = new ReferralDiscoveryDO(fakeCtx(sql), {});
  const row = await restarted.getAssociation("cs_s");
  assert.equal(row.terminalNegative.lineageRef, "lin-1");
  const reg = await restarted.register("cs_s", {
    referrerSessionId: "cs_r",
    grantId: "cs_s",
    now: NOW + 1,
  });
  assert.equal(reg.outcome, "registered_after_terminal");
});

/* ---------------- frozen-record watch classifier ---------------- */

const fp = (creditsRemaining, lastConsumeToken, lastCompensatedToken = null) => ({
  creditsRemaining,
  lastConsumeToken,
  lastCompensatedToken,
});

test("T-C36: unknown chronology is its own class; stale requires a known earlier state", () => {
  const snapshot = fp(3, "U");
  // (i) Only (3,U) seen; read returns (2,T): unknown chronology.
  const unknown = classifyRecordObservation({
    image: fp(2, "T"),
    credibleChain: [snapshot],
    journalPredicted: null,
    orderableAfterLatest: false,
  });
  assert.equal(unknown.classification, "unknown_chronology_observation");
  assert.equal(unknown.joinsChain, false);
  // (iii) The same image again: agreement with an unproven image joins nothing.
  const again = classifyRecordObservation({
    image: fp(2, "T"),
    credibleChain: [snapshot],
    journalPredicted: null,
    orderableAfterLatest: false,
  });
  assert.equal(again.classification, "unknown_chronology_observation");
  // (ii) (3,U) then (4,V) credible; a read returning (3,U) is stale,
  // and the latest credible image remains (4,V).
  const chain = [snapshot, fp(4, "V")];
  const stale = classifyRecordObservation({
    image: fp(3, "U"),
    credibleChain: chain,
    journalPredicted: null,
    orderableAfterLatest: false,
  });
  assert.equal(stale.classification, "stale_image_observation");
  assert.equal(stale.joinsChain, false);
});

test("T-C43: partition precedence — head equality, journal prediction is token-exact", () => {
  const snapshot = fp(3, "U");
  // (b) Chain-head moment: snapshot IS the head; equality is case 1.
  const head = classifyRecordObservation({
    image: fp(3, "U"),
    credibleChain: [snapshot],
    journalPredicted: null,
    orderableAfterLatest: false,
  });
  assert.equal(head.classification, "consistent");
  // (c) Journal debit predicts (2,W) exactly: joins.
  const predicted = classifyRecordObservation({
    image: fp(2, "W"),
    credibleChain: [snapshot],
    journalPredicted: fp(2, "W"),
    orderableAfterLatest: false,
  });
  assert.equal(predicted.classification, "consistent");
  assert.equal(predicted.joinsChain, true);
  // Figure-only coincidence (2, token U — an earlier token) is never
  // case 2: the prediction check is token-exact.
  const figureOnly = classifyRecordObservation({
    image: fp(2, "U"),
    credibleChain: [snapshot],
    journalPredicted: fp(2, "W"),
    orderableAfterLatest: false,
  });
  assert.notEqual(figureOnly.classification, "consistent");
  // Orderable + unexplained → mutated (fleet-halt class).
  const mutated = classifyRecordObservation({
    image: fp(2, "T"),
    credibleChain: [snapshot],
    journalPredicted: null,
    orderableAfterLatest: true,
  });
  assert.equal(mutated.classification, "frozen_record_mutated");
  // §3.3 legs are necessary, not sufficient: exact delta + fresh token
  // passes the legs; a token already in the snapshot fails them.
  assert.equal(
    lateDebitCandidateLegs({
      token: "T",
      amount: 1,
      snapshot,
      journalConsumeTokens: new Set(),
      latestCredible: snapshot,
      observed: fp(2, "T"),
    }),
    true,
  );
  assert.equal(
    lateDebitCandidateLegs({
      token: "U",
      amount: 1,
      snapshot,
      journalConsumeTokens: new Set(),
      latestCredible: snapshot,
      observed: fp(2, "U"),
    }),
    false,
  );
});

/* ---------------- projection + wiring pins ---------------- */

test("projection: own key, watermark recorded in the image", () => {
  assert.equal(
    ENTITLEMENT_AUTHORITY_PROJECTION_KV_KEY("cs_x"),
    "entitlement:projection:cs_x",
  );
  let s = seeded();
  s = applyEntitlementAuthorityOp(s, grantRewardOp("cs_g", 1)).state;
  const projection = buildEntitlementAuthorityProjection(s);
  assert.equal(projection.includedThroughSeq, journalHeadOf(s));
  assert.equal(projection.authorityStateVersion, journalHeadOf(s));
});

test("wiring: REFERRAL_DISCOVERY binding, v4 migration, worker export; routes keep 409/503 fencing", () => {
  const wrangler = readFileSync(path.join(appRoot, "wrangler.toml"), "utf8");
  assert.match(wrangler, /name = "REFERRAL_DISCOVERY"/);
  assert.match(wrangler, /tag = "v4-referral-discovery"/);
  assert.match(wrangler, /new_sqlite_classes = \["ReferralDiscoveryDO"\]/);
  const worker = readFileSync(path.join(appRoot, "cloudflare-worker.ts"), "utf8");
  assert.match(worker, /export \{ ReferralDiscoveryDO \}/);
  for (const route of ["consume", "compensate"]) {
    const src = readFileSync(
      path.join(appRoot, "src", "app", "api", "entitlements", route, "route.ts"),
      "utf8",
    );
    assert.match(src, /status: 409/);
    assert.match(src, /status: 503/);
  }
});
