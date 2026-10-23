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
 *
 * Codex re-gate FIX ROUND 1 (2026-10-23): five P2 findings against
 * c37aaaf, each source-verified and fixed within the cleared design —
 * the RG1 tests at the end of this file pin them: F-A (restorations
 * un-spend attribution: net selection), F-B (terminal status survives
 * registration retries), F-C (by-construction settlement retires the
 * birth pendency atomically), F-D (pending authority grants defer
 * their reversal at the webhook), F-E (no settlement of a discovery
 * pendency before its registration leg completes).
 *
 * Codex re-gate FIX ROUND 2 (2026-10-23): one P2 against 5439513 —
 * checkpoint acceptance vs persisted-state validation. v3.6 §3.2
 * preserves the position signed and floors only the spendable view,
 * so the installed base (O_v + S) is signed too; the validator's
 * non-negativity demand on it was the misaligned side. The RG2 test
 * pins Codex's reproduction (negative verified opening covered by
 * the fold installs a signed base that persists validly).
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
  unresolvedReversalsOf,
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
const {
  grantReferralRewardViaAuthority,
  reverseReferralRewardViaAuthority,
} = await import("../../src/lib/referralRewardAuthority.ts");
const { createReferralDiscoveryClient } = await import(
  "../../src/lib/referralDiscoveryClient.ts"
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
  // Supported-path defaults (G-dot conformance fix round): the
  // machine requires the shell-attested registration outcome, and
  // missing classification evidence is unresolved — never native
  // admission. Bare calls present the attested leg plus P-c
  // snapshot-order evidence (the identity postdates the seeded
  // snapshot), the ordinary grant posture; classification and
  // registration tests override either field explicitly.
  discoveryRegistration: "registered",
  classificationEvidence: {
    sessionCreatedAt: NOW + 86_400_000,
    fencingCompletedAt: null,
    witness: "absent",
  },
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

  // Conflict leg: re-registering the same triple is idempotent —
  // and because the row carries the terminal record, the answer
  // keeps naming it (RG1 F-B); a different referrer conflicts.
  const sameAgain = registerDiscovery(reg.row, {
    referrerSessionId: "cs_r",
    grantId: "cs_s",
    now: NOW + 4,
  });
  assert.equal(sameAgain.outcome, "registered_after_terminal");
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

/* ---------------- Codex re-gate round 1 (RG1) ---------------- */

test("RG1 F-A: a restoration un-spends attribution — the restored grant funds the next debit, and its reversal then refuses that debit's compensation", () => {
  // Opening 0 (allowance 3, spent 3): every commit draws the bucket.
  let s = seeded({ baselineOver: { allowance: 3, legacyRemainingBalance: 0, legacySpentCount: 3 } });
  s = applyEntitlementAuthorityOp(s, grantRewardOp("cs_g", 1)).state; // bucket 1
  const a = applyEntitlementAuthorityOp(s, commitOp("art-a", { consumeToken: "ct-a" }));
  assert.equal(a.outcome, "committed");
  assert.equal(a.state.ownedFiles["art-a"].fundingGrantId, "cs_g");
  assert.equal(a.state.rewardBucketBalance, 0);
  // Compensate A: the bucket refills AND the grant's attribution
  // un-spends (v3.10 §2.2) — its unspent remainder is 1 again.
  const compA = applyEntitlementAuthorityOp(a.state, {
    type: "compensate_debit",
    consumeToken: "ct-a",
    now: NOW + 1,
  });
  assert.equal(compA.outcome, "compensated");
  assert.equal(compA.state.rewardBucketBalance, 1);
  assert.equal(rewardGrantResidual(compA.state.rewardGrants["cs_g"]), 1);
  // Commit B spends the restored credit: §4.3 selection must name
  // the grant (pre-fix: fundingGrantId null — no grant had remainder
  // under gross attribution, so §4.2 had nothing to read).
  const b = applyEntitlementAuthorityOp(compA.state, commitOp("art-b", { consumeToken: "ct-b" }));
  assert.equal(b.outcome, "committed");
  assert.equal(b.state.ownedFiles["art-b"].fundingGrantId, "cs_g");
  // Reverse G, then compensate B: the claw takes 0 (B already spent
  // the credit — the pooled bound), but the grant stands REVERSED,
  // so B's reward portion is non-restorable (pre-fix: the null
  // attribution let the compensation restore a reversed reward,
  // raising the bucket to 1).
  const rev = applyEntitlementAuthorityOp(b.state, {
    type: "reverse_reward",
    grantId: "cs_g",
    now: NOW + 2,
  });
  assert.equal(rev.rewardClawed, 0);
  assert.equal(rev.state.rewardGrants["cs_g"].reversed, true);
  const compB = applyEntitlementAuthorityOp(rev.state, {
    type: "compensate_debit",
    consumeToken: "ct-b",
    now: NOW + 3,
  });
  assert.equal(compB.outcome, "refused");
  assert.equal(compB.refusal, "funding_grant_reversed");
  assert.equal(compB.state.rewardBucketBalance, 0);
  reload(compB.state);
});

test("RG1 F-B: re-registration over a standing terminal record still answers registered_after_terminal", () => {
  let row = createEmptyReferralDiscoveryRow("cs_s");
  row = recordTerminalNegative(row, { lineageRef: "lin-1", now: NOW }).row;
  const first = registerDiscovery(row, {
    referrerSessionId: "cs_r",
    grantId: "cs_s",
    now: NOW + 1,
  });
  assert.equal(first.outcome, "registered_after_terminal");
  // The grant op failed before committing; the redelivery re-runs
  // the leg against the now-registered row. The terminal fact is
  // part of the leg's answer on every delivery (pre-fix: the retry
  // heard only "already_registered" and admitted an ordinary grant
  // where v3.9 §4 mandates the born-reversed one).
  const retry = registerDiscovery(first.row, {
    referrerSessionId: "cs_r",
    grantId: "cs_s",
    now: NOW + 2,
  });
  assert.equal(retry.outcome, "registered_after_terminal");
  assert.equal(retry.row.terminalNegative.lineageRef, "lin-1");
  // Control: without a terminal record the retry stays plain.
  let plain = createEmptyReferralDiscoveryRow("cs_t");
  plain = registerDiscovery(plain, {
    referrerSessionId: "cs_r",
    grantId: "cs_t",
    now: NOW,
  }).row;
  const plainRetry = registerDiscovery(plain, {
    referrerSessionId: "cs_r",
    grantId: "cs_t",
    now: NOW + 1,
  });
  assert.equal(plainRetry.outcome, "already_registered");
});

test("RG1 F-C: purchase_grant replay after a late baseline retires the birth pendency in the same commit", () => {
  let s = createEmptyEntitlementAuthorityState("cs_old2");
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
  s = applyEntitlementAuthorityOp(presented.state, {
    type: "capture_baseline",
    baseline: baseline({ allowance: 3, legacyRemainingBalance: 1, legacySpentCount: 2 }),
    now: NOW + 1,
  }).state;
  assert.ok(pendingGrantsOf(s)["cs_old2"]); // the pendency still stands
  // W1 redelivery: the by-construction inclusion must retire the
  // pendency atomically (pre-fix: settled written, pending kept —
  // a persisted state the exactly-one-home validator rejects).
  const replay = applyEntitlementAuthorityOp(s, {
    type: "purchase_grant",
    amount: 3,
    sessionCreatedAt: null,
    authorityEraStart: NOW - 500_000,
    now: NOW + 2,
  });
  assert.equal(replay.outcome, "already_included_in_opening");
  assert.equal(pendingGrantsOf(replay.state)["cs_old2"], undefined);
  assert.equal(settledInclusionsOf(replay.state)["cs_old2"].basis, "by_construction");
  reload(replay.state); // exactly one home per identity
  const again = applyEntitlementAuthorityOp(replay.state, {
    type: "purchase_grant",
    amount: 3,
    sessionCreatedAt: null,
    authorityEraStart: NOW - 500_000,
    now: NOW + 3,
  });
  assert.equal(again.outcome, "already_included_in_opening");
  assert.equal(again.changed, false);
});

test("RG1 F-E: a discovery pendency cannot settle before its registration leg completes; the retry records the leg, then settlement folds", () => {
  let s = seeded({ sid: "cs_r" });
  const pended = applyEntitlementAuthorityOp(s, grantRewardOp("cs_s", 1, {
    discoveryRegistration: "unavailable",
  }));
  assert.equal(pended.outcome, "grant_pending");
  assert.equal(pended.pendingKind, "discovery");
  s = pended.state;
  // The Codex reproduction: an operator receipt settles `excluded`
  // and folds — with no registration ever recorded. The receipt
  // proves exclusion from the opening, not registration (§5.1).
  const early = applyEntitlementAuthorityOp(s, {
    type: "resolve_grant_inclusion",
    grantId: "cs_s",
    classification: "excluded",
    evidence: "operator_receipt",
    now: NOW + 1,
  });
  assert.equal(early.outcome, "refused");
  assert.equal(early.refusal, "discovery_registration_required");
  assert.equal(early.state.rewardBucketBalance, 0);
  assert.ok(pendingGrantsOf(early.state)["cs_s"]);
  const earlyIn = applyEntitlementAuthorityOp(s, {
    type: "resolve_grant_inclusion",
    grantId: "cs_s",
    classification: "included",
    evidence: "operator_receipt",
    now: NOW + 1,
  });
  assert.equal(earlyIn.outcome, "refused");
  assert.equal(earlyIn.refusal, "discovery_registration_required");
  // The designed resolution (§5.3): redelivery re-runs the leg; its
  // completion is recorded on the entry...
  const retry = applyEntitlementAuthorityOp(s, grantRewardOp("cs_s", 1, {
    discoveryRegistration: "registered",
  }));
  assert.equal(retry.outcome, "grant_pending");
  assert.equal(pendingGrantsOf(retry.state)["cs_s"].discoveryRegistered, true);
  // ...and only then may settlement confer the value.
  const settled = applyEntitlementAuthorityOp(retry.state, {
    type: "resolve_grant_inclusion",
    grantId: "cs_s",
    classification: "excluded",
    evidence: "operator_receipt",
    now: NOW + 2,
  });
  assert.equal(settled.outcome, "inclusion_settled");
  assert.equal(settled.state.rewardBucketBalance, 1);
  assert.ok(settled.state.rewardGrants["cs_s"]);
  reload(settled.state);
});

test("RG1 F-D: the wrapper defers a pending grant's reversal until settlement, then reverses the folded grant", async () => {
  __resetEntitlementAuthorityMemoryForTests();
  const client = createEntitlementAuthorityClient();
  const REF = "cs_fd_referrer";
  await client.apply(REF, { type: "sync_facts", facts: facts(), now: NOW - 1000 });
  await client.apply(REF, { type: "capture_baseline", baseline: baseline(), now: NOW - 900 });
  await client.apply(REF, grantRewardOp("cs_fd", 1, { discoveryRegistration: "unavailable" }));
  // The refund reaches the authority while the grant pends:
  // outcome 3 — deferred, dedupe must not finalize (v3.7 §2.3).
  const d1 = await reverseReferralRewardViaAuthority(client, REF, "cs_fd", NOW + 1);
  assert.deepEqual(d1, { status: "deferred" });
  // Settlement (leg recorded on retry, then excluded): the grant
  // folds — and the still-retryable reversal now claws it.
  await client.apply(REF, grantRewardOp("cs_fd", 1, { discoveryRegistration: "registered" }));
  await client.apply(REF, {
    type: "resolve_grant_inclusion",
    grantId: "cs_fd",
    classification: "excluded",
    evidence: "operator_receipt",
    now: NOW + 2,
  });
  const d2 = await reverseReferralRewardViaAuthority(client, REF, "cs_fd", NOW + 3);
  assert.deepEqual(d2, { status: "reversed", clawed: 1 });
});

test("RG1 F-D wiring: the webhook reversal consults the authority for pending-grant records before finalizing", () => {
  const route = readFileSync(
    path.join(appRoot, "src", "app", "api", "stripe", "webhook", "route.ts"),
    "utf8",
  );
  // The pending/terminal distinction is the recorded skip reason,
  // and the consult gate includes the pending case (KV granted 0).
  assert.match(route, /authority_grant_discovery_unresolved/);
  assert.match(route, /authority_grant_inclusion_unresolved/);
  assert.match(route, /pendingAuthorityGrant/);
});

/* ---------------- Codex re-gate round 2 (RG2) ---------------- */

test("RG2: checkpoint acceptance aligns with persisted-state validation — a negative verified opening covered by the fold installs a signed base", () => {
  // Codex's reproduction: exhausted pack3 baseline (allowance 3,
  // spent 3 → snapshot figure 0), then a successful legacy
  // compensation (F = +1).
  let s = seeded({
    baselineOver: { allowance: 3, legacyRemainingBalance: 0, legacySpentCount: 3 },
  });
  const comp = applyEntitlementAuthorityOp(s, {
    type: "compensate",
    consumeToken: "tok-1",
    now: NOW,
  });
  assert.equal(comp.outcome, "compensated");
  s = comp.state;
  // Attestation proves the opening was −1; the fold already covers
  // it, so S = 0 and the installed base is O_v + S = −1 — signed,
  // exactly as v3.6 §3.2 preserves the position signed (the floor
  // lives on the spendable view only). Before the fix the
  // checkpoint recorded this state and the persisted-state
  // validator then rejected it, wedging the entitlement.
  const installed = applyEntitlementAuthorityOp(s, {
    type: "record_checkpoint",
    verifiedOpening: -1,
    attestedJournalHead: journalHeadOf(s),
    snapshotFigureEcho: 0,
    now: NOW + 1,
  });
  assert.equal(installed.outcome, "checkpoint_recorded");
  const receipt = installed.state.verificationReceipt;
  assert.deepEqual(
    {
      Ov: receipt.verifiedOpening,
      F: receipt.journalFoldAtInstall,
      S: receipt.shortfallAbsorption,
    },
    { Ov: -1, F: 1, S: 0 },
  );
  assert.equal(installed.state.installedOpeningBase, -1);
  assert.equal(installed.state.installedOpeningBase, receipt.verifiedOpening + receipt.shortfallAbsorption);
  assert.equal(deriveSignedPurchasedPosition(installed.state), 0);
  assert.equal(deriveRemainingAllowance(installed.state), 0); // spendable view floored at 0
  reload(installed.state); // persisted-state validation accepts the signed base
  // The entitlement is not wedged: a later grant journals normally
  // on top of the signed base (future grants are never offset).
  const granted = applyEntitlementAuthorityOp(installed.state, grantRewardOp("cs_rg2_ref", 1));
  assert.equal(deriveSignedPurchasedPosition(granted.state), 0); // purchased side unchanged
  assert.equal(deriveRemainingAllowance(granted.state), 1); // reward credit spendable in full
  reload(granted.state);
});

/* ---------------- G-dot conformance fix round (RG3) ----------------
 *
 * The conformance recheck at a656b7f returned BLOCK with six findings.
 * Each test below pins one finding's cleared requirement: RG3-F1a/F1b
 * (classification is not bypassable at admission or settlement),
 * RG3-F2 (registration is required at the machine boundary), RG3-F3
 * (unresolved absence defers — no terminal zero without a serialized
 * ground), RG3-F4 (every attestation-covered accounting mutation
 * advances the journal head), RG3-F5 (FIFO is journal order, with the
 * unsequenced-compatibility rule), RG3-F6 (included settlement keeps
 * the terminal-obligation citation — T-C50's pair, extended).
 *
 * Conformance recheck round 2 narrowed the BLOCK to one F3 residual:
 * the deferral was correct but left no DURABLE reconciliation record.
 * RG3-F3 now also pins the record: persisted keyed by grant id for
 * both absence kinds, findable after reload, zero accounting effect,
 * never duplicated on redelivery, refreshed in place when the
 * absence progresses, and refused once the identity has a journal
 * presence to classify against.
 *
 * Gate fix round (local substitute Codex pass on the F3 diff, the
 * GitHub bot not having engaged at 31704f9): two P2s against the F3
 * record machinery itself, both source-verified — RG3-F3b (the
 * record refresh is monotonic and one-way: an out-of-order caller
 * timestamp can no longer set lastObservedAt < recordedAt, which
 * the persisted-state validator rejects, nor regress the absence
 * unknown_grant → no_baseline) and RG3-F3c (the wrapper no longer
 * discards the note-write result: a lost or unexpectedly-refused
 * write fails the deferral closed as authority_unavailable instead
 * of returning a deferral nothing persisted behind; the presence-
 * guard refusal still defers).
 */

test("RG3-F1a: missing classification evidence pends — never native admission, even in the lost-witness posture", () => {
  const s = seeded({
    baselineOver: { allowance: 4, legacyRemainingBalance: 4, legacySpentCount: 0 },
  });
  // Registration attested, evidence omitted entirely: the grant pends
  // unresolved with zero fold effect. Before the fix, omission
  // selected native admission and folded.
  const pended = applyEntitlementAuthorityOp(s, grantRewardOp("cs_rg3a", 1, {
    classificationEvidence: undefined,
  }));
  assert.equal(pended.outcome, "grant_pending");
  assert.equal(pended.pendingKind, "inclusion");
  assert.equal(pended.state.rewardBucketBalance, 0);
  assert.equal(pended.state.rewardGrants["cs_rg3a"], undefined);

  // The lost-witness posture (the construction the cleared text
  // returns for a legacy grant already contributing to the opening):
  // the same pend — never a second fold of that grant — and the
  // terminal obligation rides the pending entry.
  const pended2 = applyEntitlementAuthorityOp(s, grantRewardOp("cs_rg3a2", 1, {
    classificationEvidence: undefined,
    discoveryRegistration: "registered_after_terminal",
    terminalRecord: { lineageRef: "lin-rg3", recordedAt: NOW - 5_000 },
  }));
  assert.equal(pended2.outcome, "grant_pending");
  assert.deepEqual(
    pendingGrantsOf(pended2.state)["cs_rg3a2"].terminalObligation,
    { referredSessionId: "cs_rg3a2", lineageRef: "lin-rg3", recordedAt: NOW - 5_000 },
  );
  assert.equal(pended2.state.rewardBucketBalance, 0);
});

test("RG3-F1b: late_snapshot settles only the own-purchase path under its snapshot — reward-family inclusion keeps its receipt requirement", () => {
  // Reward-family pendency: late_snapshot inclusion refuses (the
  // family has no snapshot of the referred purchase; before the fix
  // it settled included/by_construction — even with no snapshot in
  // the state at all).
  const s = seeded({
    baselineOver: { allowance: 4, legacyRemainingBalance: 4, legacySpentCount: 0 },
  });
  const pended = applyEntitlementAuthorityOp(s, grantRewardOp("cs_rg3b", 1, {
    classificationEvidence: {
      sessionCreatedAt: NOW - 300_000,
      fencingCompletedAt: null,
      witness: "unfinalized",
    },
  }));
  assert.equal(pended.outcome, "grant_pending");
  const refusedSettle = applyEntitlementAuthorityOp(pended.state, {
    type: "resolve_grant_inclusion",
    grantId: "cs_rg3b",
    classification: "included",
    evidence: "late_snapshot",
    now: NOW + 1,
  });
  assert.equal(refusedSettle.outcome, "refused");
  assert.equal(refusedSettle.refusal, "grant_inclusion_unresolved");
  assert.ok(pendingGrantsOf(refusedSettle.state)["cs_rg3b"]); // nothing finalized

  // The cleared own-purchase path is unchanged (T-C31's shape): a
  // birth pendency settles included/by_construction once its own
  // baseline snapshot exists.
  let own = createEmptyEntitlementAuthorityState("cs_rg3b_own_er");
  own = applyEntitlementAuthorityOp(own, {
    type: "sync_facts",
    facts: facts(),
    now: NOW - 1000,
  }).state;
  const presented = applyEntitlementAuthorityOp(own, {
    type: "purchase_grant",
    amount: 3,
    sessionCreatedAt: null,
    authorityEraStart: NOW - 500_000,
    now: NOW,
  });
  assert.equal(presented.outcome, "grant_pending");
  assert.equal(presented.pendingKind, "birth");
  own = applyEntitlementAuthorityOp(presented.state, {
    type: "capture_baseline",
    baseline: baseline({ allowance: 3, legacyRemainingBalance: 1, legacySpentCount: 2 }),
    now: NOW + 1,
  }).state;
  const ownPending = Object.keys(pendingGrantsOf(own));
  assert.equal(ownPending.length, 1);
  const settled = applyEntitlementAuthorityOp(own, {
    type: "resolve_grant_inclusion",
    grantId: ownPending[0],
    classification: "included",
    evidence: "late_snapshot",
    now: NOW + 2,
  });
  assert.equal(settled.outcome, "inclusion_settled");
  assert.equal(settledInclusionsOf(settled.state)[ownPending[0]].basis, "by_construction");
});

test("RG3-F2: registration is required at the machine boundary — refusal via the DO apply path, the client, and the wrapper", async () => {
  // Pure machine: no discoveryRegistration → dedicated refusal, no fold.
  const s = seeded();
  const refused = applyEntitlementAuthorityOp(s, {
    type: "grant_reward",
    grantId: "cs_rg3f2",
    amount: 1,
    now: NOW,
    classificationEvidence: {
      sessionCreatedAt: NOW + 86_400_000,
      fencingCompletedAt: null,
      witness: "absent",
    },
  });
  assert.equal(refused.outcome, "refused");
  assert.equal(refused.refusal, "discovery_attestation_missing");
  assert.equal(refused.state.rewardBucketBalance, 0);

  // The supported DO apply path (client.apply — the DO's own route
  // into the machine) refuses identically; the wrapper without a
  // discovery input surfaces the refusal as a skip, fail-closed.
  __resetEntitlementAuthorityMemoryForTests();
  const client = createEntitlementAuthorityClient();
  const REF = "cs_rg3f2_referrer";
  await client.apply(REF, { type: "sync_facts", facts: facts(), now: NOW - 1000 });
  await client.apply(REF, { type: "capture_baseline", baseline: baseline(), now: NOW - 900 });
  const viaClient = await client.apply(REF, {
    type: "grant_reward",
    grantId: "cs_rg3f2c",
    amount: 1,
    now: NOW,
  });
  assert.equal(viaClient.outcome, "refused");
  assert.equal(viaClient.refusal, "discovery_attestation_missing");
  const viaWrapper = await grantReferralRewardViaAuthority(
    client,
    REF,
    "cs_rg3f2w",
    1,
    async () => null,
    NOW,
  );
  // The wrapper's public skip vocabulary collapses machine refusals
  // to the settled "refused" skip — the specific refusal is pinned
  // at the machine and client layers above; the funding failure is
  // the observable fact here: nothing landed.
  assert.equal(viaWrapper.status, "skipped");
  assert.equal(viaWrapper.reason, "refused");
  assert.equal((await client.getState(REF)).rewardBucketBalance, 0);

  // With the discovery input present (registration attested by the
  // shell leg), the same grant funds.
  const funded = await grantReferralRewardViaAuthority(
    client,
    REF,
    "cs_rg3f2w",
    1,
    async () => null,
    NOW,
    {
      discoveryClient: createReferralDiscoveryClient(),
      sessionCreatedAt: NOW + 86_400_000,
      fencingCompletedAt: null,
    },
  );
  assert.equal(funded.status, "granted");
  const after = await client.getState(REF);
  assert.equal(after.rewardBucketBalance, 1);
});

test("RG3-F3: unresolved absence defers in the authority-routed path; a terminal zero needs its serialized ground", async () => {
  __resetEntitlementAuthorityMemoryForTests();
  const client = createEntitlementAuthorityClient();
  const REF = "cs_rg3f3_referrer";
  await client.apply(REF, { type: "sync_facts", facts: facts(), now: NOW - 1000 });
  await client.apply(REF, { type: "capture_baseline", baseline: baseline(), now: NOW - 900 });

  // Baseline standing, grant unknown to the journal: DEFERRED (the
  // webhook leaves dedupe unfinalized) — never a terminal zero with
  // no serialized reversal receipt behind it.
  const headBeforeDeferral = journalHeadOf(await client.getState(REF));
  const unknown = await reverseReferralRewardViaAuthority(client, REF, "cs_rg3f3_unknown", NOW);
  assert.equal(unknown.status, "deferred");

  // F3 residual (conformance round 2): the deferral is DURABLE.
  // Reloading the authority state finds the reconciliation record
  // keyed by grant id — the census/operator workflow's lookup — and
  // recording it moved nothing: no journal head advance, no bucket
  // or fold change (zero accounting effect).
  const refAfterDeferral = reload(await client.getState(REF));
  const unknownRecord = unresolvedReversalsOf(refAfterDeferral)["cs_rg3f3_unknown"];
  assert.ok(unknownRecord, "unresolved record persisted for the unknown grant");
  assert.equal(unknownRecord.absence, "unknown_grant");
  assert.equal(unknownRecord.recordedAt, NOW);
  assert.equal(journalHeadOf(refAfterDeferral), headBeforeDeferral);
  assert.equal(refAfterDeferral.rewardBucketBalance, 0);

  // No baseline at all: likewise deferred. No baseline is created —
  // the ONLY thing persisted is the reconciliation record.
  const stranger = "cs_rg3f3_stranger";
  const noBaseline = await reverseReferralRewardViaAuthority(client, stranger, "cs_rg3f3_unknown", NOW);
  assert.equal(noBaseline.status, "deferred");
  const strangerState = reload(await client.getState(stranger));
  assert.equal(strangerState?.baseline ?? null, null);
  const noBaselineRecord = unresolvedReversalsOf(strangerState)["cs_rg3f3_unknown"];
  assert.ok(noBaselineRecord, "unresolved record persisted for the no-baseline deferral");
  assert.equal(noBaselineRecord.absence, "no_baseline");
  assert.equal(noBaselineRecord.recordedAt, NOW);
  assert.equal(journalHeadOf(strangerState), 0);

  // Repeated delivery: still deferred (dedupe never finalizes on a
  // deferral), and the record is NOT duplicated — one keyed entry
  // per grant id, its first observation preserved.
  const unknownAgain = await reverseReferralRewardViaAuthority(client, REF, "cs_rg3f3_unknown", NOW + 10);
  assert.equal(unknownAgain.status, "deferred");
  const noBaselineAgain = await reverseReferralRewardViaAuthority(client, stranger, "cs_rg3f3_unknown", NOW + 10);
  assert.equal(noBaselineAgain.status, "deferred");
  const refAfterRepeat = await client.getState(REF);
  assert.deepEqual(Object.keys(unresolvedReversalsOf(refAfterRepeat)), ["cs_rg3f3_unknown"]);
  assert.equal(unresolvedReversalsOf(refAfterRepeat)["cs_rg3f3_unknown"].recordedAt, NOW);
  const strangerAfterRepeat = await client.getState(stranger);
  assert.deepEqual(Object.keys(unresolvedReversalsOf(strangerAfterRepeat)), ["cs_rg3f3_unknown"]);
  assert.equal(unresolvedReversalsOf(strangerAfterRepeat)["cs_rg3f3_unknown"].recordedAt, NOW);

  // A progressed absence refreshes the SAME record in place: the
  // stranger gains a baseline (the grant still unknown to its
  // journal), the next deferral updates the absence kind and the
  // last-observed time — recordedAt, and the single keyed entry,
  // survive.
  await client.apply(stranger, { type: "sync_facts", facts: facts(), now: NOW + 20 });
  await client.apply(stranger, { type: "capture_baseline", baseline: baseline(), now: NOW + 30 });
  const progressed = await reverseReferralRewardViaAuthority(client, stranger, "cs_rg3f3_unknown", NOW + 40);
  assert.equal(progressed.status, "deferred");
  const strangerProgressed = reload(await client.getState(stranger));
  assert.deepEqual(Object.keys(unresolvedReversalsOf(strangerProgressed)), ["cs_rg3f3_unknown"]);
  const progressedRecord = unresolvedReversalsOf(strangerProgressed)["cs_rg3f3_unknown"];
  assert.equal(progressedRecord.absence, "unknown_grant");
  assert.equal(progressedRecord.recordedAt, NOW);
  assert.equal(progressedRecord.lastObservedAt, NOW + 40);

  // The terminal zero survives exactly where its ground is
  // serialized: an operator-receipt reversal journals the receipt and
  // answers not_bucket_grant from inside the op.
  const s = seeded();
  const receipted = applyEntitlementAuthorityOp(s, {
    type: "reverse_reward",
    grantId: "cs_rg3f3_receipted",
    now: NOW,
    operatorReceipt: { basis: "operator_excluded_receipt", lineageRef: "lin-rg3f3", recordedAt: NOW },
  });
  assert.equal(receipted.outcome, "not_bucket_grant");
  assert.equal(receipted.rewardClawed, 0);
  assert.equal(
    reversalReceiptsOf(receipted.state)["cs_rg3f3_receipted"].basis,
    "operator_receipt",
  );

  // Presence guard: once a terminal ground stands in the journal,
  // the identity is classifiable — an unresolved-absence record for
  // it is refused and nothing is written.
  const staleNote = applyEntitlementAuthorityOp(receipted.state, {
    type: "record_unresolved_reversal",
    grantId: "cs_rg3f3_receipted",
    absence: "unknown_grant",
    now: NOW,
  });
  assert.equal(staleNote.outcome, "refused");
  assert.equal(staleNote.refusal, "unresolved_absence_resolved");
  assert.equal(staleNote.changed, false);
  assert.deepEqual(Object.keys(unresolvedReversalsOf(staleNote.state)), []);
});

test("RG3-F3b: the unresolved-record refresh is monotonic and one-way — stale observations never wedge or regress it", () => {
  // Gate fix round (substitute Codex P2-A): the refresh branch
  // rewrote the record with the caller's `now` unconditionally.
  // Caller timestamps are not serialized in order, so an
  // out-of-order redelivery could set lastObservedAt below
  // recordedAt — a state the persisted-state validator rejects,
  // wedging the entitlement on its next load — and could regress
  // the absence unknown_grant → no_baseline, against the design's
  // one-way progression.
  const G = "cs_rg3f3b_grant";
  const t1 = NOW + 1_000;
  const t2 = NOW + 2_000;
  const t3 = NOW + 3_000;
  const t4 = NOW + 4_000;
  const note = (absence, now) => ({
    type: "record_unresolved_reversal",
    grantId: G,
    absence,
    now,
  });
  let s = createEmptyEntitlementAuthorityState("cs_rg3f3b_er");

  // t2: the first observation — no baseline.
  let r = applyEntitlementAuthorityOp(s, note("no_baseline", t2));
  assert.equal(r.outcome, "unresolved_reversal_recorded");
  s = reload(r.state);
  assert.equal(unresolvedReversalsOf(s)[G].recordedAt, t2);
  assert.equal(unresolvedReversalsOf(s)[G].lastObservedAt, t2);

  // t3: the absence progresses — a baseline landed, the grant is
  // still unknown to its journal.
  r = applyEntitlementAuthorityOp(s, note("unknown_grant", t3));
  assert.equal(r.outcome, "unresolved_reversal_recorded");
  s = reload(r.state);
  let rec = unresolvedReversalsOf(s)[G];
  assert.equal(rec.absence, "unknown_grant");
  assert.equal(rec.recordedAt, t2);
  assert.equal(rec.lastObservedAt, t3);

  // t1: the stale no_baseline observation redelivers out of order,
  // older than recordedAt itself. reload() asserts the persisted
  // state still validates (before the fix this load is exactly
  // where the wedge bit); the absence does not regress and neither
  // timestamp moves backwards.
  r = applyEntitlementAuthorityOp(s, note("no_baseline", t1));
  assert.equal(r.outcome, "unresolved_reversal_recorded");
  s = reload(r.state);
  rec = unresolvedReversalsOf(s)[G];
  assert.equal(rec.absence, "unknown_grant");
  assert.equal(rec.recordedAt, t2);
  assert.equal(rec.lastObservedAt, t3);

  // t4: the same stale observation, now ahead of the record — the
  // progressed absence still stands, recordedAt is untouched, and
  // the last-observed time refreshes forward.
  r = applyEntitlementAuthorityOp(s, note("no_baseline", t4));
  assert.equal(r.outcome, "unresolved_reversal_recorded");
  s = reload(r.state);
  rec = unresolvedReversalsOf(s)[G];
  assert.equal(rec.absence, "unknown_grant");
  assert.equal(rec.recordedAt, t2);
  assert.equal(rec.lastObservedAt, t4);
});

test("RG3-F3c: a lost or unexpectedly-refused note write fails the deferral closed — authority_unavailable, never an unpersisted deferred", async () => {
  // Gate fix round (substitute Codex P2-B): the wrapper awaited the
  // note write and discarded its result, so a write lost between
  // the read and the write (a null result — the same signal the
  // reverse_reward path treats as authority_unavailable) still
  // returned deferred with nothing persisted, against the
  // persist-before-deferral guarantee. Stub clients pin the
  // wrapper's handling of every note outcome at BOTH absence sites.
  const withBaseline = () => {
    let s = createEmptyEntitlementAuthorityState("cs_rg3f3c_er");
    s = applyEntitlementAuthorityOp(s, { type: "sync_facts", facts: facts(), now: NOW - 1000 }).state;
    s = applyEntitlementAuthorityOp(s, { type: "capture_baseline", baseline: baseline(), now: NOW - 900 }).state;
    return s;
  };
  const stubClient = ({ state, noteResult, reverseResult }) => ({
    getState: async () => state,
    apply: async (_sessionId, op) => {
      if (op.type === "record_unresolved_reversal") return noteResult;
      if (op.type === "reverse_reward") return reverseResult;
      throw new Error(`unexpected op: ${op.type}`);
    },
  });
  const NOTE_RECORDED = { outcome: "unresolved_reversal_recorded" };
  const NOTE_GUARD_REFUSAL = { outcome: "refused", refusal: "unresolved_absence_resolved" };
  const NOTE_OTHER_REFUSAL = { outcome: "refused", refusal: "invalid_reward" };
  const REVERSE_UNKNOWN = { outcome: "refused", refusal: "unknown_reward_grant" };
  const noBaselineState = createEmptyEntitlementAuthorityState("cs_rg3f3c_er");

  // No-baseline site: the note write is lost (null) → the answer
  // fails closed, it does NOT defer.
  const lostNoBaseline = await reverseReferralRewardViaAuthority(
    stubClient({ state: noBaselineState, noteResult: null }),
    "cs_rg3f3c_er",
    "cs_rg3f3c_g",
    NOW,
  );
  assert.equal(lostNoBaseline.status, "authority_unavailable");

  // Unknown-grant site: the note write is lost (null) → same.
  const lostUnknown = await reverseReferralRewardViaAuthority(
    stubClient({ state: withBaseline(), noteResult: null, reverseResult: REVERSE_UNKNOWN }),
    "cs_rg3f3c_er",
    "cs_rg3f3c_g",
    NOW,
  );
  assert.equal(lostUnknown.status, "authority_unavailable");

  // Unknown-grant site: a note refusal that is neither the recorded
  // success nor the presence guard → fails closed too.
  const refusedUnknown = await reverseReferralRewardViaAuthority(
    stubClient({ state: withBaseline(), noteResult: NOTE_OTHER_REFUSAL, reverseResult: REVERSE_UNKNOWN }),
    "cs_rg3f3c_er",
    "cs_rg3f3c_g",
    NOW,
  );
  assert.equal(refusedUnknown.status, "authority_unavailable");

  // Presence-guard refusal at either site: the identity resolved
  // meanwhile, so there is no absence left to record — the
  // deferral stands.
  const guardUnknown = await reverseReferralRewardViaAuthority(
    stubClient({ state: withBaseline(), noteResult: NOTE_GUARD_REFUSAL, reverseResult: REVERSE_UNKNOWN }),
    "cs_rg3f3c_er",
    "cs_rg3f3c_g",
    NOW,
  );
  assert.equal(guardUnknown.status, "deferred");
  const guardNoBaseline = await reverseReferralRewardViaAuthority(
    stubClient({ state: noBaselineState, noteResult: NOTE_GUARD_REFUSAL }),
    "cs_rg3f3c_er",
    "cs_rg3f3c_g",
    NOW,
  );
  assert.equal(guardNoBaseline.status, "deferred");

  // Controls: a recorded note defers at both sites.
  const okNoBaseline = await reverseReferralRewardViaAuthority(
    stubClient({ state: noBaselineState, noteResult: NOTE_RECORDED }),
    "cs_rg3f3c_er",
    "cs_rg3f3c_g",
    NOW,
  );
  assert.equal(okNoBaseline.status, "deferred");
  const okUnknown = await reverseReferralRewardViaAuthority(
    stubClient({ state: withBaseline(), noteResult: NOTE_RECORDED, reverseResult: REVERSE_UNKNOWN }),
    "cs_rg3f3c_er",
    "cs_rg3f3c_g",
    NOW,
  );
  assert.equal(okUnknown.status, "deferred");
});

test("RG3-F4: a monetary mutation invalidates exact-head attestation — the interleaved compensation", () => {
  let s = seeded({
    baselineOver: { allowance: 3, legacyRemainingBalance: 0, legacySpentCount: 3 },
  });
  const headBefore = journalHeadOf(s);
  // Attestation is prepared against headBefore; the legacy
  // compensation then lands (fold 0 → 1). Before the fix the head
  // stayed put and the stale attestation recorded against fold 1.
  const comp = applyEntitlementAuthorityOp(s, {
    type: "compensate",
    consumeToken: "tok-1", // the seeded baseline's last consume token
    now: NOW,
  });
  assert.equal(comp.outcome, "compensated");
  assert.equal(journalHeadOf(comp.state), headBefore + 1);
  s = comp.state;
  const stale = applyEntitlementAuthorityOp(s, {
    type: "record_checkpoint",
    verifiedOpening: -1,
    attestedJournalHead: headBefore,
    snapshotFigureEcho: 0,
    now: NOW + 1,
  });
  assert.equal(stale.outcome, "refused");
  assert.equal(stale.refusal, "attestation_head_mismatch");
  // Re-attested at the new head, the checkpoint records — and its
  // receipt honestly reports the fold it installed against.
  const fresh = applyEntitlementAuthorityOp(s, {
    type: "record_checkpoint",
    verifiedOpening: -1,
    attestedJournalHead: journalHeadOf(s),
    snapshotFigureEcho: 0,
    now: NOW + 2,
  });
  assert.equal(fresh.outcome, "checkpoint_recorded");
  assert.equal(fresh.state.verificationReceipt.journalFoldAtInstall, 1);
  reload(fresh.state);

  // The legacy grant decision is head-binding the same way (audit
  // companion): it consumes the mutually exclusive recovery decision,
  // so it too advances the head.
  const s2 = seeded(); // default baseline carries a legacy spend
  const h2 = journalHeadOf(s2);
  const g = applyEntitlementAuthorityOp(s2, {
    type: "grant",
    artifactId: "art-rg3f4",
    mapId: "map-1",
    fingerprint: "fp-art-rg3f4",
    finalized: true,
    now: NOW,
  });
  assert.equal(g.outcome, "granted");
  assert.ok(journalHeadOf(g.state) > h2);
});

test("RG3-F5: FIFO attribution is journal order — equal timestamps, reverse-lexical ids, through persist/reload", () => {
  let s = seeded({
    baselineOver: { allowance: 4, legacyRemainingBalance: 4, legacySpentCount: 0 },
  });
  // Journal order: cs_z_first folds first (lower sequence),
  // cs_a_second second — at the SAME grantedAt timestamp. Lexical
  // order would pick cs_a_second; journal order must pick cs_z_first.
  s = applyEntitlementAuthorityOp(s, grantRewardOp("cs_z_first", 1)).state;
  s = applyEntitlementAuthorityOp(s, grantRewardOp("cs_a_second", 1)).state;
  s = reload(s); // sequences survive persist/reload
  const c = applyEntitlementAuthorityOp(s, commitOp("art-rg3f5", { consumeToken: "ct-rg3f5" }));
  assert.equal(c.outcome, "committed");
  assert.equal(c.state.ownedFiles["art-rg3f5"].fundingGrantId, "cs_z_first");

  // Compatibility rule: an entry WITHOUT a sequence (a pre-sequence
  // journal fold) precedes every sequenced entry.
  let m = seeded({
    baselineOver: { allowance: 4, legacyRemainingBalance: 4, legacySpentCount: 0 },
  });
  m = applyEntitlementAuthorityOp(m, grantRewardOp("cs_seq_a", 1)).state;
  m = applyEntitlementAuthorityOp(m, grantRewardOp("cs_seq_b", 1)).state;
  const stripped = JSON.parse(JSON.stringify(m));
  delete stripped.rewardGrants["cs_seq_b"].seq;
  const cm = applyEntitlementAuthorityOp(stripped, commitOp("art-rg3f5m", { consumeToken: "ct-rg3f5m" }));
  assert.equal(cm.state.ownedFiles["art-rg3f5m"].fundingGrantId, "cs_seq_b");

  // Both unsequenced: the legacy (grantedAt, grantId) order is the
  // reconstruction — equal timestamps fall to lexical, as before.
  const strippedBoth = JSON.parse(JSON.stringify(m));
  delete strippedBoth.rewardGrants["cs_seq_a"].seq;
  delete strippedBoth.rewardGrants["cs_seq_b"].seq;
  const cb = applyEntitlementAuthorityOp(strippedBoth, commitOp("art-rg3f5b", { consumeToken: "ct-rg3f5b" }));
  assert.equal(cb.state.ownedFiles["art-rg3f5b"].fundingGrantId, "cs_seq_a");
});

test("RG3-F6: included settlement preserves the terminal-obligation citation — the T-C50 pair, asserted after reload", () => {
  const s = seeded({
    baselineOver: { allowance: 4, legacyRemainingBalance: 4, legacySpentCount: 0 },
  });
  const pended = applyEntitlementAuthorityOp(s, grantRewardOp("cs_rg3f6", 1, {
    discoveryRegistration: "registered_after_terminal",
    terminalRecord: { lineageRef: "lin-rg3f6", recordedAt: NOW - 1_000 },
    classificationEvidence: {
      sessionCreatedAt: NOW - 300_000,
      fencingCompletedAt: null,
      witness: "unfinalized",
    },
  }));
  assert.equal(pended.outcome, "grant_pending");
  const settled = applyEntitlementAuthorityOp(reload(pended.state), {
    type: "resolve_grant_inclusion",
    grantId: "cs_rg3f6",
    classification: "included",
    evidence: "operator_receipt",
    now: NOW + 1,
  });
  assert.equal(settled.outcome, "inclusion_settled");
  // The citation pair survives on the settlement record — and after
  // persist/reload, not just in the returned state.
  const citation = {
    referredSessionId: "cs_rg3f6",
    lineageRef: "lin-rg3f6",
    recordedAt: NOW - 1_000,
  };
  assert.deepEqual(settledInclusionsOf(settled.state)["cs_rg3f6"].terminalObligation, citation);
  assert.deepEqual(
    settledInclusionsOf(reload(settled.state))["cs_rg3f6"].terminalObligation,
    citation,
  );

  // Immediate included admission carries the citation too.
  const immediate = applyEntitlementAuthorityOp(s, grantRewardOp("cs_rg3f6b", 1, {
    discoveryRegistration: "registered_after_terminal",
    terminalRecord: { lineageRef: "lin-rg3f6b", recordedAt: NOW - 2_000 },
    classificationEvidence: {
      sessionCreatedAt: NOW - 300_000,
      fencingCompletedAt: null,
      witness: "finalized_grant",
      operatorIncludedReceipt: true,
    },
  }));
  assert.equal(immediate.outcome, "already_included_in_opening");
  assert.deepEqual(
    settledInclusionsOf(immediate.state)["cs_rg3f6b"].terminalObligation,
    { referredSessionId: "cs_rg3f6b", lineageRef: "lin-rg3f6b", recordedAt: NOW - 2_000 },
  );
});
