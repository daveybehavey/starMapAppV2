/**
 * Pure ledger state machine for ONE DL-1 entitlement authority, keyed by
 * Stripe checkout session id. Used by the SQLite Durable Object
 * (EntitlementAuthorityDO) and by deterministic unit tests.
 *
 * CITATION CONFORMANCE (DL-1 v3.10 §8(d) pass, 2026-10-23): this file
 * was first written against the pre-pivot design ("v3 §…" / "v3.1 §A"
 * citations). The CLEARED design is v3.5 (journal-first pivot) as
 * amended through v3.11. Surviving pre-pivot rules and their governing
 * final sections: baseline/snapshot — v3.6 §2.1, v3.7 §§2–3;
 * compensation as a restoration op — v3.5 §2.4, v3.6 §4.1;
 * reversal receipts/classification — v3.6 §4.3; projection — v3.5
 * §6.3; access validity axes — v3.7 §5.3; the no-expiry policy is
 * David's decision (2026-10-22), carried by the build plan. Citations
 * below have been re-pointed where a final section governs; the
 * journal surface added by the cleared design cites its sections
 * inline.
 *
 * Why a Durable Object and not KV (DL-1 v3.5 §2, journal-first axiom): KV read-modify-write
 * cannot make a debit atomic — eventual consistency plus no CAS means a
 * stale read can double-spend a credit (the A→B→retry-A sequence defeats the
 * legacy last-token dedupe in entitlementConsume.mjs). This ledger is the
 * sole accounting authority for HD downloads: ownership, the recovery
 * decision, and usage change atomically inside one DO instance. KV may hold
 * only a non-authoritative read projection of this state (see
 * entitlementAuthority.ts); a stale or failed projection write cannot
 * authorize a purchase, grant, compensation, or delivery.
 *
 * Grant-side facts (plan / paid / revoked / subscription state) are INPUTS
 * recorded into the authority from the Stripe session record (build plan
 * overlap contract O1: DL-1 reads grant facts, it never writes grant state).
 * Every decision is therefore reproducible from authoritative state alone.
 *
 * No expiry (David, 2026-10-22 — the proposed 180-day branch was not adopted): entitlements do
 * NOT expire with age — the proposed 180-day-from-issuance cutoff was
 * rejected, so this state deliberately carries no entitlement expiry.
 * Credentials (claim tokens, read capabilities) still expire and rotate;
 * `capabilityGeneration` is the counter delivery checks against, and
 * rotation increments it atomically here so previously issued read
 * capabilities die with the rotation (v3.6 §6.3 rotation op).
 * Credential renewal never extends or restarts an entitlement term.
 *
 * Slice 3 adds the migration trigger's counterpart state and the R1 reward
 * bucket (David's decision, 2026-10-22 — option A): referral reward credits
 * granted AFTER baseline capture live in a bucket separate from purchased
 * allowance. Commits spend the bucket first; a referral reversal (clawback)
 * may remove ONLY unspent bucket credits — it can never touch purchased
 * credits, remove an owned file, or create a negative balance/debt. The
 * pre-migration balance is NOT split retroactively: the baseline captures
 * the customer's existing total intact as the legacy (purchased-side)
 * bucket, historical referral rewards included (see entitlementMigration.ts).
 */
import { createHash } from "node:crypto";
import type { CheckoutPlan } from "@/lib/pricing";
import {
  ARCHIVE_PROTOCOL_MARKER,
  DESCRIPTOR_TTL_MS,
} from "@/lib/downloadArchiveIdentity";

/** Facts about the entitlement as last observed from the grant-side record. */
export type EntitlementFacts = {
  plan: CheckoutPlan;
  paid: boolean;
  /** Recorded refund/dispute revocation (affirmative termination). */
  revoked: boolean;
  /**
   * Subscription currently active per the record. NOTE (build plan R9): the
   * session record carries no paid-period-end fact today, so subscription
   * validity is evaluated from this boolean — the record's fact as given.
   */
  subscriptionActive: boolean;
  /** Purchase-bound map on the record, when present. */
  mapId: string | null;
};

/**
 * One-time migration baseline (DL-1 v3.6 §2.1 creation snapshot). The SHAPE is defined here;
 * Slice 3 populates it from the settled legacy record (fenced capture,
 * fail-closed on ambiguity). The baseline records established access terms
 * as evidence — it never synthesises an expiry boundary from claim-token
 * expiry and never resets an established term (David's no-expiry decision, 2026-10-22).
 */
export type EntitlementBaseline = {
  plan: CheckoutPlan;
  /** Original finite allowance; null for a subscription baseline. */
  allowance: number | null;
  legacyRemainingBalance: number | null;
  /** Resulting legacy spent count from the settled record. */
  legacySpentCount: number;
  lastConsumeToken: string | null;
  lastConsumeAt: number | null;
  lastCompensatedToken: string | null;
  purchaseMapId: string | null;
  /** Established access terms/evidence note for support; opaque. */
  accessTermsNote: string | null;
  capturedAt: number;
};

export type OwnedFileSource = "commit" | "legacy";

export type OwnedFileEntry = {
  mapId: string;
  fingerprint: string;
  committedAt: number;
  source: OwnedFileSource;
  /**
   * True when this commit was funded from the referral reward bucket
   * (Slice 3, R1-A): commits spend reward-bucket credits first, so a later
   * clawback of that reward finds the bucket already spent and reclaims
   * nothing — it never reaches purchased value or this file.
   */
  rewardFunded: boolean;
  /**
   * Journal-debit detail (DL-1 v3.5 journal-first accounting; v3.7
   * §4.3 attribution). Optional for entries written before the cleared
   * design; the portion helpers below derive the legacy defaults
   * (a unit commit, reward-funded iff `rewardFunded`).
   */
  credits?: number;
  /** The consume token this debit is keyed by (restoration identity). */
  consumeToken?: string | null;
  /** Portion of this debit funded from the reward bucket, at commit. */
  rewardPortion?: number;
  /** Portion funded from the purchased/opening side, at commit. */
  purchasedPortion?: number;
  /**
   * The grant the reward portion is attributed to — selected FIFO at
   * COMMIT time only, recorded immutably (v3.7 §4.3, v3.10 §2).
   * Compensation performs no selection: it reads this record.
   */
  fundingGrantId?: string | null;
  restoredRewardPortion?: number;
  restoredPurchasedPortion?: number;
  committedSeq?: number;
  restorationSeq?: number | null;
};

/** Portions of a commit entry, with pre-journal defaults applied. */
export function commitEntryPortions(entry: OwnedFileEntry): {
  credits: number;
  rewardPortion: number;
  purchasedPortion: number;
  restoredRewardPortion: number;
  restoredPurchasedPortion: number;
} {
  const credits = entry.credits ?? 1;
  const rewardPortion = entry.rewardPortion ?? (entry.rewardFunded ? 1 : 0);
  return {
    credits,
    rewardPortion,
    purchasedPortion: entry.purchasedPortion ?? credits - rewardPortion,
    restoredRewardPortion: entry.restoredRewardPortion ?? 0,
    restoredPurchasedPortion: entry.restoredPurchasedPortion ?? 0,
  };
}

/**
 * One referral reward grant tracked in the reward bucket (R1-A). Keyed in
 * `rewardGrants` by a caller-supplied idempotency id (the webhook uses the
 * referred checkout session id — the same dedupe domain as its legacy
 * `referral:rewarded:{sessionId}` record). `clawedAmount` is what a
 * reversal actually removed (bounded by the unspent bucket at reversal
 * time); `reversed` marks the grant's reversal as processed even when it
 * reclaimed zero, so a replay is an idempotent no-op.
 */
export type RewardGrantEntry = {
  amount: number;
  grantedAt: number;
  clawedAmount: number;
  reversed: boolean;
  /**
   * Reward value of journal debits attributed to this grant at commit
   * time (DL-1 v3.7 §4.3: FIFO attribution is recorded once, at the
   * debit, and never revised). Optional for states written before the
   * cleared design; readers treat an absent field as 0.
   */
  attributedSpent?: number;
  /**
   * Reward value of this grant's attributed debits since RESTORED by
   * compensation (Codex re-gate F-A). A restoration is the
   * un-spending of a recorded debit portion (v3.10 §2.2), and the
   * pool's spend identity is net of restored portions (v3.9 §3.3) —
   * the per-grant shadow nets the same way, so a restored credit
   * makes its funding grant selectable again under §4.3's "unspent
   * remainder". The debit's own record (fundingGrantId) is never
   * revised; this counter only tracks what restorations un-spent.
   * Optional for states written before the fix; absent reads as 0.
   */
  attributedRestored?: number;
  /** Journal sequence of this grant's reversal entry, when reversed. */
  reversedSeq?: number | null;
  /** Journal sequence of the grant entry itself. */
  seq?: number;
};

/**
 * Per-grant attribution residual (DL-1 v3.9 §3.1, as corrected): a
 * SIGNED bookkeeping quantity — foldedAmount − outstanding
 * attribution − clawedAmount, where outstanding attribution is
 * `attributedSpent − attributedRestored` (restorations un-spend,
 * v3.10 §2.2; the pool identity nets identically, v3.9 §3.3). It may
 * be negative under the pooled claw (R1) and is NOT a balance: no op
 * may read it as spendable, as a restoration budget, or as a claw
 * floor. The only spendable reward quantity is the pooled bucket
 * identity. Its one eligibility use is the §4.3 selection predicate
 * (oldest grant with unspent remainder) — a REMAINDER test over the
 * net figure, not a balance read.
 */
export function rewardGrantResidual(grant: RewardGrantEntry): number {
  const outstandingAttribution =
    (grant.attributedSpent ?? 0) - (grant.attributedRestored ?? 0);
  return grant.amount - outstandingAttribution - grant.clawedAmount;
}

/** How the entitlement's journal was born (DL-1 v3.7 §2.4, v3.11 §2). */
export type CreationProvenance = "snapshot" | "authority_native" | "birth_unresolved";

/** Three-state inclusion classification (DL-1 v3.7 §2, v3.8 §2.2). */
export type GrantClassification = "included" | "excluded" | "unresolved";

export type PendingGrantKind = "inclusion" | "birth" | "discovery";

/**
 * A grant that journaled with ZERO fold effect pending classification
 * or birth/discovery resolution (DL-1 v3.7 §2.2 grant_pending_inclusion,
 * v3.8 §3.2 grant_pending_birth, v3.8 §5.3 grant_pending_discovery).
 * Pending entries contribute to NO counter identity of either family
 * (v3.8 §4.3 item 2, v3.9 §3.3) until a settlement entry confers their
 * effect. A pending entry is a state, not a proof (v3.11 §2.2): its
 * existence is never provenance for the identity it names.
 */
export type PendingGrantEntry = {
  grantId: string;
  kind: PendingGrantKind;
  family: "reward" | "own_purchase";
  amount: number;
  presentedAt: number;
  presentingWriter: string | null;
  /**
   * Terminal obligation carried on the pending entry (DL-1 v3.10 §5):
   * when the grant was admitted after a terminal negative decision was
   * recorded in the ReferralDiscoveryDO, an excluded settlement is
   * atomically born-reversed and its reversal receipt cites this
   * record. Disposition bookkeeping only — never a balance fact.
   */
  terminalObligation: {
    referredSessionId: string;
    lineageRef: string;
    recordedAt: number;
  } | null;
  /**
   * For kind "discovery" entries only: the registration leg has
   * completed successfully at least once (on admission's retry
   * dispatch — the first attempt is what pended the entry). The
   * §5.1 invariant spends fold effect only when an association was
   * registered in or before the conferring op; a settlement of a
   * discovery pendency refuses until this stands recorded (Codex
   * re-gate F-E), because the receipt an operator presents proves
   * exclusion from the opening — never registration, and never the
   * absence of a terminal-negative record. Absent/false for entries
   * written before the fix; meaningless for other kinds (their
   * association preceded the entry by the same leg).
   */
  discoveryRegistered?: boolean;
};

/** An identity settled `included` (zero fold effect throughout). */
export type SettledInclusionEntry = {
  grantId: string;
  amount: number;
  settledAt: number;
  /** "operator_receipt" | "by_construction" (own purchase). */
  basis: string;
  /**
   * The terminal-obligation lineage citation the identity carried
   * into its included settlement (DL-1 v3.10 §5), preserved durably
   * on the settlement record: an included settlement retires the
   * pending entry, and the citation must survive that retirement —
   * it is the reconciliation record's proof of which terminal
   * decision the identity was admitted under. Null when the identity
   * carried no terminal obligation (the ordinary case); absent on
   * entries written before the citation was preserved.
   */
  terminalObligation?: {
    referredSessionId: string;
    lineageRef: string;
    recordedAt: number;
  } | null;
};

/**
 * The creation snapshot (DL-1 v3.6 §2.1 as amended by v3.7 §2.1): the
 * legacy record image taken inside the journal-creating op. It claims
 * NO identity set. Installation reads its stored figure and nothing
 * else (v3.7 §3.1). The unexplained reward aggregate is recorded as an
 * aggregate with no identity content; after v3.10 §3.3 it is a census
 * figure only and NEVER a classification input.
 */
export type CreationSnapshot = {
  /** The record's remaining balance as captured (null: subscription). */
  figure: number | null;
  allowance: number | null;
  unexplainedRewardAggregate: number;
  accountingFingerprint: {
    creditsRemaining: number | null;
    lastConsumeToken: string | null;
    lastCompensatedToken: string | null;
  };
  accessFingerprint: {
    revoked: boolean;
    revokedAt: number | null;
    reason: string | null;
    subscriptionActive: boolean;
  };
  snapshotJournalHead: number;
  capturedAt: number;
};

/**
 * The installation receipt (DL-1 v3.6 §3): journaled by
 * record_checkpoint with ZERO fold effect. Installation replaces the
 * opening figure exactly once: position_after = O_v + F + S, where S
 * is the one-time shortfall absorption (the business absorbs a
 * negative verified position in full; no customer debt is created and
 * future grants are never offset against it).
 */
export type OpeningVerificationReceipt = {
  unverifiedOpening: number;
  verifiedOpening: number;
  journalFoldAtInstall: number;
  shortfallAbsorption: number;
  attestedJournalHead: number;
  installedAt: number;
};

/**
 * The journaled reversal receipt (DL-1 v3.6 §4.3): a reversal's
 * classification is an op outcome inside the serialized stream, and
 * its receipt is journaled with the clawed amount the reversal
 * ACTUALLY took, so a replay returns the original persisted amount
 * verbatim instead of re-deriving zero.
 */
export type ReversalReceipt = {
  grantId: string;
  clawedAmount: number;
  /** "bucket_grant" | "pre_bucket_in_opening" | "operator_receipt" | "born_reversed_terminal". */
  basis: string;
  seq: number;
  committedAt: number;
  /** For born-reversed admissions: the terminal record this reversal
   *  cites (DL-1 v3.9 §4.3 — referred session id, lineageRef,
   *  recordedAt). */
  terminalCitation?: {
    referredSessionId: string;
    lineageRef: string;
    recordedAt: number;
  } | null;
};

/**
 * A durable reconciliation record for an UNRESOLVED reversal absence
 * (DL-1 v3.7 §2.3 outcome 3, conformance round 2 F3 residual): when a
 * reversal defers because the identity has no journal presence to
 * classify against — no baseline at all, or a baselined journal in
 * which the grant is simply unknown — the deferral itself persists
 * this record, keyed by grant id on the referrer's authority state,
 * BEFORE the caller returns the deferral. Without it the deferral
 * existed only in a webhook log line: after the request ended, no
 * keyed record named the unresolved identity for the census /
 * operator workflow to find (the census is a per-identity
 * classification pass over authority states; keyed lookup is
 * getState(referrer).unresolvedReversals[grantId]).
 *
 * ZERO accounting effect, by construction: no derivation (fold,
 * opening, bucket, eligibility, validity) reads this map, and
 * recording one never advances the journal head — it is not an
 * accounting mutation, so it is outside the exact-head attestation's
 * coverage (v3.6 §2.4 binds mutations OF THE FOLD). It is an
 * observation log, not a classification: it asserts only that the
 * absence was observed at the recorded times. It is NOT a baseline,
 * NOT a terminal receipt, and NOT a Discovery negative decision —
 * uncertainty is recorded as uncertainty, and the identity's live
 * classification is always read from the journal itself (a record
 * may therefore outlive the resolution it once described).
 */
export type UnresolvedReversalRecord = {
  grantId: string;
  /** The absence the deferral rested on, as most recently observed. */
  absence: "no_baseline" | "unknown_grant";
  /** When the unresolved absence was first recorded (ms). */
  recordedAt: number;
  /** When it was most recently re-observed (ms; repeat delivery). */
  lastObservedAt: number;
};

/** The mutually exclusive legacy recovery decision (v3.5 §2.4). */
export type RecoveryDecision = "unresolved" | "granted" | "compensated";

/**
 * Short-lived accounting exclusion lease (Slice 3, Codex P1 fix on
 * PR #367). The legacy consume/compensate routes mutate the KV record
 * OUTSIDE this authority, so a read-only fence cannot exclude them from
 * an in-flight baseline capture: a route could load its record, observe
 * "no baseline", and write its debit back after migration captured the
 * pre-debit record — leaving the authority's baseline one credit richer
 * than reality, with the consume token lost. The lease makes the two
 * critical sections mutually exclusive through the DO (which serializes
 * every op): a legacy writer holds kind "legacy_write" across its
 * load→mutate→write, and migration holds kind "migration" across its
 * load→capture. An expired lease is treated as free (a crashed holder
 * can block accounting only until its TTL lapses).
 *
 * CONFORMANCE SCOPE (cleared design, v3.7 §7.2 matrix): the lease
 * governs the S-OFF world only — pre-activation, the legacy writers
 * are the accounting writers and exclusion against migration is the
 * mechanism the matrix names ("LEGACY under lease + baseline
 * fence"). At S-ACTIVE/S-SAFE no cell routes an accounting effect to
 * an unjournaled writer: the legacy consume route REFUSES
 * (legacy_consume_disabled; the built fence's 409 once a baseline
 * exists is its pre-activation form), and the lease confers no
 * authority there.
 */
export type AccountingLease = {
  leaseId: string;
  kind: "legacy_write" | "migration";
  expiresAt: number;
};

/* ---------------- DL-1 Slice 4 publication surface (brief §5.3) ----------------
 * Artifact publication state, additive on the entitlement document
 * (absent = empty, the journal-surface precedent). Publication ops write
 * ONLY these fields: they never write accounting fields (baseline,
 * ownedFiles, the reward bucket, the recovery decision,
 * capabilityGeneration) and never advance journalHead — the §5.3 purity
 * fence, test-asserted in scripts/unit/dl1Slice4Publication.test.mjs. */

export type PublicationIntent = {
  /** = descriptorId for descriptor-form prepares; route-minted unique id
   * for the fused form. */
  intentId: string;
  /** §5.1 artifactId. */
  artifactKey: string;
  sessionId: string;
  mapId: string;
  /** Verbatim canonical binding (§5.1), persisted — reconciliation never
   * re-derives it (§5.2). */
  canonicalBinding: string;
  fingerprint: string;
  contractVersion: number;
  rendererVersion: number;
  /** SHA-256 hex of the validated bytes (§5.10 step 4). */
  digest: string;
  stagingKey: string;
  /** Binding-derived (§5.1); derived by the machine on every path,
   * never copied, never trusted from a presentation (v3.2 clause V-6). */
  expectedWidth: number;
  expectedHeight: number;
  createdAt: number;
  expiresAt: number;
  /** ALLOCATED BY THE MACHINE inside apply — never caller-supplied. */
  generation: number;
};

export type PublicationIntentJoin = {
  /** The JOINING descriptor's id — the record's key. */
  intentId: string;
  /** The intent joined at join time (audit reference; intents are never
   * deleted, so it always resolves). */
  governingIntentId: string;
  artifactKey: string;
  sessionId: string;
  mapId: string;
  canonicalBinding: string;
  fingerprint: string;
  contractVersion: number;
  rendererVersion: number;
  /** THE digest this descriptor is permanently bound to (§5.7). */
  digest: string;
  stagingKey: string;
  /** The descriptor's signed expiry (§5.7 payload) — a descriptor fact;
   * a JN1→R7 promotion does NOT inherit it (v3.2 V-2β as corrected by
   * v3.3 W-1: the promoted intent's expiry is machine-stamped). */
  expiresAt: number;
  joinedAt: number;
};

export type ArchiveEmailRecord = {
  state: "pending" | "claimed" | "dispatched";
  claimedAt: number | null;
  dispatchedAt: number | null;
  /** Generation fencing (v3.2 clause V-10): 0 while pending before any
   * claim; +1 on every claim/re-claim; a record is accepted only from
   * the claim whose generation it carries. */
  claimGeneration: number;
};

export type ArtifactRegistryEntry = {
  artifactKey: string;
  sessionId: string;
  mapId: string;
  canonicalBinding: string;
  fingerprint: string;
  contractVersion: number;
  rendererVersion: number;
  digest: string;
  /** Copied from the governing intent at finalize. */
  expectedWidth: number;
  expectedHeight: number;
  state: "finalized" | "conflicted";
  finalizedAt: number | null;
  /** Structured, support-readable (§5.5 Table 2 F7 evidence). */
  conflictEvidence: unknown | null;
  archiveEmail: ArchiveEmailRecord;
  /** Post-finalization contradictions (§5.5 F1/F2), append-only, cap 8. */
  integrityAlerts: unknown[];
  /** Saturation signal (v3.2 clause V-11.3): absent = false; set when an
   * append would exceed the cap of 8 — the append is dropped, the eight
   * retained verbatim, and the transition reports changed = true once. */
  integrityAlertsSaturated?: boolean;
};

/** The finalize observation (§5.4 — complete; the only transport). */
export type FinalizeObservation = {
  finalObjectPresent: boolean;
  /** Null when the object is absent OR its metadata is unreadable /
   * incomplete; the storage layer never fabricates fields. */
  finalMetadata: {
    protocol: string;
    artifactKey: string;
    digest: string;
    bindingDigest: string;
  } | null;
  /** Set ONLY when the caller actually read and hashed the final
   * object's body in this request. */
  bodyVerifiedDigest: string | null;
};

/** The intent as presented to register_publication_intent: the machine
 * allocates `generation` and stamps `createdAt` from `now` (§5.4). */
export type PublicationIntentInput = Omit<PublicationIntent, "generation" | "createdAt">;

/** Op-specific payload carried on publication apply results (§5.4). */
export type PublicationApplyDetail = {
  intentId: string | null;
  governingIntentId: string | null;
  generation: number | null;
  entry: ArtifactRegistryEntry | null;
  claimGeneration: number | null;
  /** For claim outcomes: the entry was already dispatched (the outcome
   * is an idempotence receipt, NOT a send authorisation — v3.2 V-10). */
  dispatched: boolean;
};

/**
 * Archive-email claim lease (§5.9 / RES-3 rule-specified constant, set by
 * the lane): a claimed entry whose claimedAt is older than this at a
 * later claim attempt is re-claimable. Must exceed the dispatch path's
 * worst-case send duration (Resend send + record write) by a stated
 * margin: 120 s is >10× that path's worst case.
 */
export const DISPATCH_CLAIM_LEASE_MS = 120_000;

export type EntitlementAuthorityState = {
  sessionId: string;
  facts: EntitlementFacts | null;
  baseline: EntitlementBaseline | null;
  /**
   * Successful compensations performed against the baseline BY THIS
   * authority (formula input, v3.5 §2.4). A compensation already reflected in
   * the settled legacy record at capture time is NOT counted here — the
   * baseline's spent count is already net of it.
   */
  baselineCompensationCount: number;
  /** Token whose baseline consume this authority compensated, if any. */
  compensatedConsumeToken: string | null;
  ownedFiles: Record<string, OwnedFileEntry>;
  recoveryDecision: RecoveryDecision;
  /** Incremented atomically on every claim-token rotation (v3.6 §6.3). */
  capabilityGeneration: number;
  /**
   * Referral reward bucket (Slice 3, R1-A): credits granted after baseline
   * capture, tracked apart from purchased allowance. Invariant, enforced
   * by the state validator:
   *   rewardBucketBalance = rewardGrantedTotal − rewardSpentTotal
   *                         − rewardClawedTotal   (all ≥ 0)
   * A reversal may only decrease the balance; it can never reach purchased
   * value (see reverseReward).
   */
  rewardBucketBalance: number;
  rewardGrantedTotal: number;
  /** Bucket credits spent by commits (commits spend the bucket first). */
  rewardSpentTotal: number;
  /** Bucket credits removed by referral reversals. */
  rewardClawedTotal: number;
  /** Per-grant bookkeeping for idempotent grants and bounded clawbacks. */
  rewardGrants: Record<string, RewardGrantEntry>;
  /** Accounting exclusion lease (see AccountingLease); null when free. */
  accountingLease: AccountingLease | null;
  createdAt: number | null;
  updatedAt: number | null;
  /* ---- Cleared-design journal surface (v3.5–v3.11). All fields are
   * optional in stored documents: states written before this surface
   * carry none of them and read as the empty values (head 0, no
   * snapshot, no pendings, no receipts). ---- */
  /** Monotonic journal sequence; the head attestations bind to. */
  journalHead?: number;
  creationProvenance?: CreationProvenance | null;
  creationSnapshot?: CreationSnapshot | null;
  pendingGrants?: Record<string, PendingGrantEntry>;
  settledInclusions?: Record<string, SettledInclusionEntry>;
  reversalReceipts?: Record<string, ReversalReceipt>;
  /** Unresolved reversal-absence reconciliation records, by grantId
   *  (observation log only — see UnresolvedReversalRecord). */
  unresolvedReversals?: Record<string, UnresolvedReversalRecord>;
  /** Late-grant incidents (grant after a terminal receipt), by grantId. */
  lateGrantIncidents?: Record<string, number>;
  verificationReceipt?: OpeningVerificationReceipt | null;
  /**
   * Installed opening base (O_v + S) once record_checkpoint has run;
   * replaces the snapshot-derived opening figure in every derivation.
   * Null until installation.
   */
  installedOpeningBase?: number | null;
  /** Folded own-purchase grant total (grant_fact initializations). */
  foldedOwnGrantTotal?: number;
  /* ---- DL-1 Slice 4 publication surface (§5.3). All optional in stored
   * documents: pre-S4 documents carry none of them and read as empty. ---- */
  publicationIntents?: Record<string, PublicationIntent>;
  /** artifactKey → governing (latest-registered) intentId. Governance is
   * a transition-time derivation over liveness (§5.5), never this field
   * alone (RES-2). Structural rule: absent when a registry entry exists. */
  publicationIntentByArtifact?: Record<string, string>;
  artifactRegistry?: Record<string, ArtifactRegistryEntry>;
  publicationGenerations?: Record<string, number>;
  publicationIntentJoins?: Record<string, PublicationIntentJoin>;
  /**
   * The most recently REGISTERED canonical candidate per map (pointer
   * amendment P-1): values are §5.1 artifactIds, never storage paths.
   * Written ONLY by register_publication_intent's R7 transition (P-3),
   * atomically with intent creation. Absent = empty (P-1:
   * createEmptyEntitlementAuthorityState omits the field).
   */
  canonicalArtifactByMap?: Record<string, string>;
};

/** Finite plan allowances (build plan): single = 1 file, pack3 = 3 files. */
export const PLAN_ALLOWANCE: Record<Exclude<CheckoutPlan, "subscription">, number> = {
  single: 1,
  pack3: 3,
};

/** Legacy compensate window (DL-1 v3.5 §2.4: LEGACY_COMPENSATE_WINDOW_MS). */
export const LEGACY_COMPENSATE_WINDOW_MS = 72 * 60 * 60 * 1000;

export function createEmptyEntitlementAuthorityState(
  sessionId: string,
): EntitlementAuthorityState {
  return {
    sessionId,
    facts: null,
    baseline: null,
    baselineCompensationCount: 0,
    compensatedConsumeToken: null,
    ownedFiles: {},
    recoveryDecision: "unresolved",
    capabilityGeneration: 0,
    rewardBucketBalance: 0,
    rewardGrantedTotal: 0,
    rewardSpentTotal: 0,
    rewardClawedTotal: 0,
    rewardGrants: {},
    accountingLease: null,
    createdAt: null,
    updatedAt: null,
    journalHead: 0,
    creationProvenance: null,
    creationSnapshot: null,
    pendingGrants: {},
    settledInclusions: {},
    reversalReceipts: {},
    unresolvedReversals: {},
    lateGrantIncidents: {},
    verificationReceipt: null,
    installedOpeningBase: null,
    foldedOwnGrantTotal: 0,
    publicationIntents: {},
    publicationIntentByArtifact: {},
    artifactRegistry: {},
    publicationGenerations: {},
    publicationIntentJoins: {},
    // canonicalArtifactByMap deliberately omitted (pointer amendment
    // P-1: absent = empty; the first R7 write creates the field).
  };
}

/** Accessors tolerating pre-journal stored documents (absent = empty). */
export function journalHeadOf(state: EntitlementAuthorityState): number {
  return state.journalHead ?? 0;
}
export function pendingGrantsOf(
  state: EntitlementAuthorityState,
): Record<string, PendingGrantEntry> {
  return state.pendingGrants ?? {};
}
export function settledInclusionsOf(
  state: EntitlementAuthorityState,
): Record<string, SettledInclusionEntry> {
  return state.settledInclusions ?? {};
}
export function reversalReceiptsOf(
  state: EntitlementAuthorityState,
): Record<string, ReversalReceipt> {
  return state.reversalReceipts ?? {};
}
export function unresolvedReversalsOf(
  state: EntitlementAuthorityState,
): Record<string, UnresolvedReversalRecord> {
  return state.unresolvedReversals ?? {};
}

/**
 * Access check 1: entitlement validity, evaluated against the
 * record as given. Revocation (affirmative termination) and subscription
 * lapse (neutral, paid period ended) are DISTINCT reasons (v3.7 §5.3 two axes);
 * neither is inferred from an expired credential. There is deliberately no
 * age-based expiry (David's no-expiry decision, 2026-10-22).
 */
export type EntitlementValidity =
  | { valid: true }
  | {
      valid: false;
      reason: "no_facts" | "revoked" | "not_paid" | "subscription_inactive";
    };

export function evaluateEntitlementValidity(
  state: EntitlementAuthorityState,
): EntitlementValidity {
  const facts = state.facts;
  if (!facts) return { valid: false, reason: "no_facts" };
  if (facts.revoked) return { valid: false, reason: "revoked" };
  if (!facts.paid) return { valid: false, reason: "not_paid" };
  if (facts.plan === "subscription" && !facts.subscriptionActive) {
    return { valid: false, reason: "subscription_inactive" };
  }
  return { valid: true };
}

/** The plan accounting runs against: the baseline's original plan wins. */
function effectivePlan(state: EntitlementAuthorityState): CheckoutPlan | null {
  return state.baseline?.plan ?? state.facts?.plan ?? null;
}

/** Entries with source "commit" are new paid acquisitions; a "legacy" entry
 *  represents an already-counted baseline spend and is never subtracted
 *  again (v3.6 §2.1). */
export function countPaidCommits(state: EntitlementAuthorityState): number {
  let count = 0;
  for (const entry of Object.values(state.ownedFiles)) {
    if (entry.source === "commit") count += 1;
  }
  return count;
}

/**
 * The journal fold F over the purchased side (DL-1 v3.6 §3): folded
 * own-purchase grants + baseline compensations − gross purchased
 * portions of journal debits + restored purchased portions. The
 * opening figure is NOT part of F; position = opening + F.
 */
export function derivePurchasedFold(state: EntitlementAuthorityState): number {
  let grossPurchased = 0;
  let restoredPurchased = 0;
  for (const entry of Object.values(state.ownedFiles)) {
    if (entry.source !== "commit") continue;
    const portions = commitEntryPortions(entry);
    grossPurchased += portions.purchasedPortion;
    restoredPurchased += portions.restoredPurchasedPortion;
  }
  return (
    (state.foldedOwnGrantTotal ?? 0) +
    state.baselineCompensationCount -
    grossPurchased +
    restoredPurchased
  );
}

/** The opening figure the position is computed from: the installed
 *  base (O_v + S) once record_checkpoint has run, else the
 *  snapshot-derived figure (allowance − legacy spent), else the plan
 *  allowance for an authority-born entitlement. */
export function deriveOpeningFigure(state: EntitlementAuthorityState): number {
  if (state.installedOpeningBase !== null && state.installedOpeningBase !== undefined) {
    return state.installedOpeningBase;
  }
  // An unresolved birth contributes NO opening figure (DL-1 v3.8
  // §3.2): while birth is unproven, the journal must not derive the
  // plan's allowance as spendable — that is the phantom-value
  // execution the pending-birth rule exists to close. Value folded
  // from proven sources in the same journal still counts (it enters
  // through the fold, not the opening).
  if (state.creationProvenance === "birth_unresolved") return 0;
  // An authority-native birth likewise has no opening figure: the
  // grant IS the initialization and its value enters through the
  // fold — deriving the plan allowance as well would count it twice.
  if (state.creationProvenance === "authority_native") return 0;
  const plan = effectivePlan(state);
  if (!plan || plan === "subscription") return 0;
  const allowance = state.baseline?.allowance ?? PLAN_ALLOWANCE[plan];
  const legacySpent = state.baseline?.legacySpentCount ?? 0;
  return allowance - legacySpent;
}

/**
 * The SIGNED purchased position (DL-1 v3.6 §3): preserved signed in
 * state and read models. The floor applies to the spendable VIEW
 * only, never to the stored figure — silently clamping the position
 * itself (the pre-journal derivation's Math.max) is the named
 * anti-pattern. Negative position is carried entirely by the
 * purchased/legacy side; the reward bucket is fold-only, always ≥ 0,
 * and the opening contributes 0 to it (v3.6 §4.2: the opening is a
 * single legacy-bucket figure, never a (purchased, reward) pair).
 * Returns null for an active subscription (unlimited while active).
 */
export function deriveSignedPurchasedPosition(
  state: EntitlementAuthorityState,
): number | null {
  const plan = effectivePlan(state);
  if (plan === "subscription") {
    return state.facts?.subscriptionActive ? null : 0;
  }
  if (!plan) return 0;
  return deriveOpeningFigure(state) + derivePurchasedFold(state);
}

/** Spendable purchased view: the signed position floored at zero. */
export function deriveSpendablePurchased(state: EntitlementAuthorityState): number | null {
  const signed = deriveSignedPurchasedPosition(state);
  if (signed === null) return null;
  return Math.max(0, signed);
}

/**
 * The purchased-side remainder: the spendable view of the signed
 * position (opening + journal fold, floored at zero for display and
 * admission). Reward-bucket credits are NOT subtracted here: a
 * commit's cost is carried by whichever portion funded it, so each
 * debit is counted exactly once (v3.6 §3, T-C13).
 */
export function derivePurchasedRemainingAllowance(
  state: EntitlementAuthorityState,
): number | null {
  return deriveSpendablePurchased(state);
}

/**
 * Total spendable remainder: purchased side plus the unspent referral
 * reward bucket (R1-A — reward credits remain spendable on HD files,
 * tracked separately). Null for an active subscription. Never negative.
 */
export function deriveRemainingAllowance(state: EntitlementAuthorityState): number | null {
  const purchased = derivePurchasedRemainingAllowance(state);
  if (purchased === null) return null;
  return purchased + state.rewardBucketBalance;
}

/**
 * Access check 2: delivery eligibility for an owned artifact —
 * entitlement validity + ledger ownership. It must NOT consult the
 * remaining balance: a zero-balance customer who owns the file gets their
 * file. Finalization is verified by the delivery path against the artifact
 * registry (Slice 4/5); this slice's ledger owns the ownership half.
 */
export function evaluateDeliveryEligibility(
  state: EntitlementAuthorityState,
  artifactId: string,
): { ok: true } | { ok: false; reason: "invalid" | "not_owned" } {
  if (!evaluateEntitlementValidity(state).valid) return { ok: false, reason: "invalid" };
  if (!state.ownedFiles[artifactId]) return { ok: false, reason: "not_owned" };
  return { ok: true };
}

/**
 * §E groundwork ("Cleanup retains valid owned files"): the ledger — never a
 * KV projection — is the eligibility source for any future cleanup sweep
 * (Slice 9 enforces the full §D invariant). An artifact is cleanup-safe
 * only when it is not owned under a currently valid entitlement.
 */
export function isOwnedUnderValidEntitlement(
  state: EntitlementAuthorityState,
  artifactId: string,
): boolean {
  return evaluateDeliveryEligibility(state, artifactId).ok;
}

export type EntitlementAuthorityOp =
  | { type: "sync_facts"; facts: EntitlementFacts; now: number }
  | {
      type: "capture_baseline";
      baseline: EntitlementBaseline;
      /**
       * The accounting lease the capturer believes it holds. When
       * supplied, capture is atomically conditional on that lease still
       * being held and unexpired — a capturer that stalled past its TTL
       * can never land a stale baseline over an interleaved writer
       * (Codex P2, PR #367). When omitted, capture is still refused
       * while ANY lease is actively held.
       */
      expectedLeaseId?: string;
      /**
       * The creation snapshot taken in the same read unit as the
       * baseline figure (DL-1 v3.6 §2.1 / v3.7 §2.1). When supplied it
       * is stored verbatim and the journal's provenance is "snapshot";
       * when omitted the machine derives it from baseline + facts.
       */
      snapshot?: CreationSnapshot;
      now: number;
    }
  | {
      type: "commit";
      artifactId: string;
      mapId: string;
      fingerprint: string;
      /** Artifact durably finalized (Slice 4 registry fact, passed in). */
      finalized: boolean;
      /** Credits this debit consumes (default 1; journal debits may be >1). */
      credits?: number;
      /** Consume token keying this debit for later restoration. */
      consumeToken?: string;
      now: number;
    }
  | {
      /**
       * Compensate a JOURNAL debit (DL-1 v3.5 §2.4 restoration op;
       * v3.6 §4.1 reversal-status clause; v3.10 §2 FIFO-at-commit).
       * Distinct from the legacy baseline `compensate` above: this op
       * restores the portions recorded on one journal debit entry.
       */
      type: "compensate_debit";
      consumeToken: string;
      now: number;
    }
  | {
      /**
       * Own-purchase grant (W1/W5 grant_fact, DL-1 v3.5 §4.1 identity
       * domain: the entitlement's own Checkout Session id). With a
       * snapshot present the purchase is included by construction
       * (observation, zero fold). Without one it is the entitlement's
       * initialization — at full effect only on positive D1-era
       * provenance (authority_native); otherwise it journals as
       * grant_pending_birth with zero fold effect (v3.8 §3.2).
       */
      type: "purchase_grant";
      amount: number;
      /** Stripe creation time of this session, when known. */
      sessionCreatedAt?: number | null;
      /** Activation record's D1-serving start, when known. */
      authorityEraStart?: number | null;
      presentingWriter?: string;
      now: number;
    }
  | {
      /**
       * Installation (DL-1 v3.6 §2.4/§3): replaces the opening figure
       * with the attested verified figure — the checkpoint's ONLY
       * monetary effect. The proposed figure must trace to the
       * creation snapshot (snapshot-only rule, v3.7 §3.1) and the
       * attestation is bound to the exact journal head.
       */
      type: "record_checkpoint";
      verifiedOpening: number;
      attestedJournalHead: number;
      /** The snapshot figure the bundle derives its opening from. */
      snapshotFigureEcho: number | null;
      now: number;
    }
  | {
      /**
       * Settle a pending grant (DL-1 v3.7 §2.3, v3.8 §2.3): to
       * `included` (retires as an observation, zero fold throughout)
       * or to `excluded` (the grant takes its fold effect in THIS
       * settlement entry — v3.11 §1.2: excluded settlement CONFERS
       * the amount; included settlement only confirms). A pending
       * entry carrying a terminal obligation settles excluded as the
       * atomically born-reversed pair (v3.10 §5).
       */
      type: "resolve_grant_inclusion";
      grantId: string;
      classification: "included" | "excluded";
      evidence: "operator_receipt" | "era_proof" | "non_grant_witness" | "late_snapshot";
      now: number;
    }
  | {
      type: "grant";
      artifactId: string;
      mapId: string;
      fingerprint: string;
      finalized: boolean;
      now: number;
    }
  | { type: "compensate"; consumeToken: string; now: number }
  | { type: "rotate_capability"; now: number }
  | {
      type: "grant_reward";
      /** Idempotency id for this grant (webhook: referred checkout session id). */
      grantId: string;
      amount: number;
      /**
       * Shell-attested discovery registration outcome (DL-1 v3.8
       * §5.3): produced only by the grant shell's ReferralDiscoveryDO
       * leg, which runs BEFORE the state machine is invoked for the
       * fold. REQUIRED at the machine boundary: an op that reaches a
       * conferring path without it is refused
       * (discovery_attestation_missing) — the leg's absence is never
       * a silent pass. When present the machine decides on it:
       * unavailable pends the grant, conflict refuses,
       * registered_after_terminal admits born-reversed (or pends with
       * the terminal obligation).
       */
      discoveryRegistration?:
        | "registered"
        | "already_registered"
        | "unavailable"
        | "conflict"
        | "registered_after_terminal";
      /** The terminal record, when discoveryRegistration is registered_after_terminal. */
      terminalRecord?: { lineageRef: string; recordedAt: number } | null;
      /**
       * Classification evidence for this identity (DL-1 v3.8 §2.2 as
       * amended by v3.10 §3 receipt precedence and v3.11 §2
       * provenance). When supplied, the op classifies the grant
       * against the creation snapshot before any fold effect. When
       * absent, the classification is UNRESOLVED — missing evidence
       * pends the grant, never native admission (the lost-witness
       * rule: omission is not provenance).
       */
      classificationEvidence?: {
        /** The referred session's Stripe creation time. */
        sessionCreatedAt: number;
        /** Activation record's fencing-completion time (P-b ground). */
        fencingCompletedAt: number | null;
        witness:
          | "finalized_grant"
          | "finalized_non_grant"
          | "unfinalized"
          | "absent";
        operatorIncludedReceipt?: boolean;
        operatorExcludedReceipt?: boolean;
      };
      presentingWriter?: string;
      now: number;
    }
  | {
      type: "reverse_reward";
      /** The grant id being reversed (same id domain as grant_reward). */
      grantId: string;
      /**
       * Positive evidence for the not-a-bucket-grant classification,
       * evaluated INSIDE the op (DL-1 v3.6 §4.3: classification is an
       * op outcome in the serialized stream; the wrapper's former
       * getState pre-check is deleted as a classification source — a
       * read may route, never decide). Settled inclusions are read
       * from the journal itself; an operator receipt is the caller's
       * evidence input.
       */
      operatorReceipt?: boolean;
      now: number;
    }
  | {
      /**
       * Persist the reconciliation record for an unresolved reversal
       * absence (see UnresolvedReversalRecord): the deferral a
       * reverse_reward refusal (unknown_reward_grant) or a
       * no-baseline routing produces must leave a durable, keyed
       * record of the unresolved identity BEFORE the caller returns
       * the deferral — a log line is not reconciliation. Zero
       * accounting effect: the op writes only the observation map,
       * never advances the journal head, and refuses
       * (unresolved_absence_resolved) when the identity meanwhile
       * gained a journal presence, so a record is written only while
       * the absence it names still holds in the serialized stream.
       */
      type: "record_unresolved_reversal";
      /** The grant id whose reversal deferred unresolved. */
      grantId: string;
      /** The absence the deferral rests on. */
      absence: "no_baseline" | "unknown_grant";
      now: number;
    }
  | {
      type: "acquire_accounting_lease";
      leaseId: string;
      kind: "legacy_write" | "migration";
      ttlMs: number;
      now: number;
    }
  | { type: "release_accounting_lease"; leaseId: string; now: number }
  | {
      type: "seal_accounting_lease";
      leaseId: string;
      /** Fresh TTL granted from `now` when the seal succeeds. */
      ttlMs: number;
      now: number;
    }
  /* ---- DL-1 Slice 4 publication ops (§5.4) — a closed list (source
   * pin (iv)). All R2/storage reads complete BEFORE apply; observations
   * ride as op inputs. The AccountingLease is never used here. ---- */
  | {
      type: "register_publication_intent";
      intent: PublicationIntentInput;
      now: number;
    }
  | {
      type: "finalize_publication";
      artifactKey: string;
      /** Presenter pair: correlates the caller's retry, never arbitrates
       * (§5.5 presenter independence). */
      intentId: string;
      generation: number;
      observation: FinalizeObservation;
      /** The binding string the caller derived in this request (upload /
       * fused paths); absent on standalone reconcile (§5.4, v3.1 A-2). */
      presentedBinding?: string | null;
      now: number;
    }
  | { type: "claim_archive_email_dispatch"; artifactKey: string; now: number }
  | {
      type: "record_archive_email_dispatch";
      artifactKey: string;
      /** The generation the caller's own claim outcome carried (V-10). */
      claimGeneration: number;
      now: number;
    };

export type EntitlementAuthorityOutcome =
  | "facts_synced"
  | "baseline_captured"
  | "baseline_already_captured"
  | "committed"
  | "already_owned"
  | "granted"
  | "already_granted"
  | "compensated"
  | "already_compensated"
  | "rotated"
  | "reward_granted"
  | "reward_already_granted"
  | "reward_reversed"
  | "reward_reversal_already_applied"
  | "lease_acquired"
  | "lease_released"
  | "lease_sealed"
  /** Zero-fold-effect pending entry journaled (inclusion/birth/discovery). */
  | "grant_pending"
  /** Grant admitted born-reversed against a terminal record (v3.9 §4.3). */
  | "reward_granted_born_reversed"
  /** Observation journaled: the identity was already inside the opening. */
  | "already_included_in_opening"
  /** Terminal zero: positively not a bucket grant (v3.6 §4.3 outcomes). */
  | "not_bucket_grant"
  /** Unresolved reversal-absence reconciliation record persisted
   *  (zero accounting effect; see UnresolvedReversalRecord). */
  | "unresolved_reversal_recorded"
  /** A pending grant settled by resolve_grant_inclusion. */
  | "inclusion_settled"
  /** record_checkpoint installed the verified opening (v3.6 §3). */
  | "checkpoint_recorded"
  /* DL-1 Slice 4 publication outcomes (§5.4). */
  | "publication_intent_recorded"
  | "publication_intent_joined"
  | "publication_finalized"
  | "publication_already_finalized"
  | "publication_conflicted"
  | "archive_email_claimed"
  | "archive_email_dispatch_recorded"
  | "refused";

export type EntitlementAuthorityRefusal =
  | "no_facts"
  | "revoked"
  | "not_paid"
  | "subscription_inactive"
  | "not_finalized"
  | "no_credits"
  | "no_baseline"
  | "invalid_facts"
  | "invalid_baseline"
  | "already_granted"
  | "already_compensated"
  | "no_legacy_spend"
  | "grant_requires_support"
  | "grant_map_mismatch"
  | "subscription_plan"
  | "token_mismatch"
  | "window_expired"
  | "invalid_reward"
  | "unknown_reward_grant"
  | "lease_held"
  | "already_migrated"
  | "invalid_lease"
  | "lease_expired"
  | "lease_not_held"
  /** Reward portion's recorded funding grant already reversed (v3.6 §4.1 op rule). */
  | "funding_grant_reversed"
  /** Attestation names a journal head that has since moved (v3.6 §2.4). */
  | "attestation_head_mismatch"
  /** Checkpoint bundle does not trace to the creation snapshot (v3.7 §3.1). */
  | "opening_not_from_snapshot"
  /** No derivable opening exists to install (migration pending). */
  | "opening_underivable"
  /** Grant presented for an identity holding a terminal reversal receipt. */
  | "grant_after_terminal_receipt"
  /** Discovery registration reports a conflicting association (v3.8 §5.2). */
  | "discovery_conflict"
  /** Grant presented with NO shell-attested discovery registration:
   *  the registration leg never ran, so no conferring path may
   *  proceed — registration is required at the machine boundary,
   *  not only in the wrapper (v3.8 §5.1/§5.3). */
  | "discovery_attestation_missing"
  /** Compensating reversal carried under a non-terminal attestation. */
  | "discovery_attestation_mismatch"
  /** Terminal-attested grant presented without its compensating reversal path. */
  | "terminal_negative_unconsumed"
  /** compensate_debit named a token with no journal debit. */
  | "unknown_debit"
  /** Reversal arrived while the grant's inclusion is still pending (§2.3 pairing). */
  | "reversal_deferred"
  /** An unresolved-absence record was requested for an identity that
   *  meanwhile gained a journal presence (folded, pending, settled,
   *  or receipted): the absence it would name no longer holds, so no
   *  record is written. */
  | "unresolved_absence_resolved"
  /** Commit only a pending amount could fund (v3.8 §3.5 matrix cell). */
  | "insufficient_balance_pending"
  /** Settlement evidence cannot settle to `included` (v3.8 §2.3). */
  | "grant_inclusion_unresolved"
  /** Settlement of a discovery pendency before its registration leg completed (v3.8 §5.1). */
  | "discovery_registration_required"
  /* DL-1 Slice 4 publication refusals (§5.4). */
  | "publication_conflict"
  | "intent_payload_conflict"
  | "already_finalized"
  | "finalization_pending"
  | "identity_rejected"
  | "archive_email_already_claimed"
  | "archive_email_not_claimed"
  | "archive_email_claim_stale";

export type EntitlementAuthorityApplyResult = {
  state: EntitlementAuthorityState;
  changed: boolean;
  outcome: EntitlementAuthorityOutcome;
  /** Set iff outcome === "refused". */
  refusal: EntitlementAuthorityRefusal | null;
  /** Derived remaining allowance after the op (null = unlimited). */
  creditsRemaining: number | null;
  /**
   * Bucket credits a reverse_reward op actually removed (0 for every other
   * op and for reversals that found the bucket already spent). Callers
   * (the webhook) record this as the reclaimed amount. On a REPLAY of a
   * reversal this carries the ORIGINAL journaled receipt's amount
   * verbatim (DL-1 v3.6 §4.3) — never a re-derived zero.
   */
  rewardClawed: number;
  /** Basis of a not_bucket_grant outcome / journaled receipt, when any. */
  reversalBasis: string | null;
  /** Pending kind when outcome === "grant_pending". */
  pendingKind: PendingGrantKind | null;
  /** Portion detail when a compensate_debit partially refuses. */
  restoration: {
    purchasedRestored: number;
    rewardRestored: number;
    rewardRefusal: "funding_grant_reversed" | null;
    fundingGrantId: string | null;
  } | null;
  /** DL-1 Slice 4 publication detail (§5.4): intent/generation carried by
   * register outcomes, the registry entry carried by R3/R4 refusals and
   * finalize outcomes, the claim generation + dispatched fact carried by
   * claim outcomes. Null for every accounting op. */
  publication: PublicationApplyDetail | null;
};

function result(
  state: EntitlementAuthorityState,
  changed: boolean,
  outcome: EntitlementAuthorityOutcome,
  refusal: EntitlementAuthorityRefusal | null = null,
  rewardClawed = 0,
  extra: {
    reversalBasis?: string | null;
    pendingKind?: PendingGrantKind | null;
    restoration?: EntitlementAuthorityApplyResult["restoration"];
    publication?: PublicationApplyDetail | null;
  } = {},
): EntitlementAuthorityApplyResult {
  return {
    state,
    changed,
    outcome,
    refusal,
    creditsRemaining: deriveRemainingAllowance(state),
    rewardClawed,
    reversalBasis: extra.reversalBasis ?? null,
    pendingKind: extra.pendingKind ?? null,
    restoration: extra.restoration ?? null,
    publication: extra.publication ?? null,
  };
}

/** Advance the journal head and return the new sequence number. */
function nextSeq(state: EntitlementAuthorityState): number {
  return journalHeadOf(state) + 1;
}

function refused(
  state: EntitlementAuthorityState,
  refusal: EntitlementAuthorityRefusal,
): EntitlementAuthorityApplyResult {
  return result(state, false, "refused", refusal);
}

function validityRefusal(
  state: EntitlementAuthorityState,
): EntitlementAuthorityApplyResult | null {
  const validity = evaluateEntitlementValidity(state);
  return validity.valid ? null : refused(state, validity.reason);
}

/* ------------- Authority-boundary validation (G-dot P2 fix, PR #362) -------------
 * The DO's stored document and every incoming facts/baseline payload are
 * validated structurally BEFORE any accounting runs: a cast is not
 * validation. Malformed numbers (a missing count field deriving to NaN),
 * invalid enums, and inconsistent allowance/spend/recovery combinations
 * fail closed — persisted state throws at read; op payloads are refused. */

const CHECKOUT_PLAN_VALUES: ReadonlySet<string> = new Set([
  "single",
  "pack3",
  "subscription",
]);

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidEntitlementFacts(facts: unknown): facts is EntitlementFacts {
  if (!isRecord(facts)) return false;
  return (
    typeof facts.plan === "string" &&
    CHECKOUT_PLAN_VALUES.has(facts.plan) &&
    typeof facts.paid === "boolean" &&
    typeof facts.revoked === "boolean" &&
    typeof facts.subscriptionActive === "boolean" &&
    isNullableString(facts.mapId)
  );
}

export function isValidEntitlementBaseline(
  baseline: unknown,
): baseline is EntitlementBaseline {
  if (!isRecord(baseline)) return false;
  if (
    !(
      typeof baseline.plan === "string" &&
      CHECKOUT_PLAN_VALUES.has(baseline.plan) &&
      (baseline.allowance === null || isNonNegativeInt(baseline.allowance)) &&
      (baseline.legacyRemainingBalance === null ||
        isFiniteNumber(baseline.legacyRemainingBalance)) &&
      isNonNegativeInt(baseline.legacySpentCount) &&
      isNullableString(baseline.lastConsumeToken) &&
      (baseline.lastConsumeAt === null || isFiniteNumber(baseline.lastConsumeAt)) &&
      isNullableString(baseline.lastCompensatedToken) &&
      isNullableString(baseline.purchaseMapId) &&
      isNullableString(baseline.accessTermsNote) &&
      isFiniteNumber(baseline.capturedAt)
    )
  ) {
    return false;
  }
  const settled = baseline as EntitlementBaseline;
  // Baseline conservation (G-dot P2 round 2, PR #362): the baseline is a
  // SETTLED record, so its fields must agree with each other, not merely
  // be well-typed. A finite plan's remaining balance is exactly its
  // allowance minus its (net) spent count — a baseline that asserts
  // allowance 1, spent 0, remaining 0 simultaneously claims a credit was
  // both never spent and no longer available, and the derivation would
  // silently mint the credit back.
  if (settled.plan === "subscription") {
    // A subscription baseline carries no finite allowance by definition.
    if (settled.allowance !== null) return false;
  } else {
    if (settled.allowance === null) return false;
    if (settled.legacySpentCount > settled.allowance) return false;
    if (
      settled.legacyRemainingBalance !== null &&
      settled.legacyRemainingBalance !== settled.allowance - settled.legacySpentCount
    ) {
      return false;
    }
  }
  // A compensated consume is a consume: the baseline cannot record a
  // compensated token while recording no last consume token at all.
  if (settled.lastCompensatedToken !== null && settled.lastConsumeToken === null) {
    return false;
  }
  return true;
}

export function isValidEntitlementAuthorityState(
  state: unknown,
): state is EntitlementAuthorityState {
  if (!isRecord(state)) return false;
  if (typeof state.sessionId !== "string" || state.sessionId.length === 0) return false;
  if (state.facts !== null && !isValidEntitlementFacts(state.facts)) return false;
  if (state.baseline !== null && !isValidEntitlementBaseline(state.baseline)) {
    return false;
  }
  if (!isNonNegativeInt(state.baselineCompensationCount)) return false;
  const baseline = state.baseline as EntitlementBaseline | null;
  if (baseline === null) {
    // Compensations exist only against a baseline; without one, any
    // compensation bookkeeping is an inconsistent record.
    if (state.baselineCompensationCount !== 0) return false;
    if (state.compensatedConsumeToken !== null) return false;
  } else {
    if (state.baselineCompensationCount > baseline.legacySpentCount) {
      // The authority cannot have compensated more baseline spends than the
      // baseline records.
      return false;
    }
    // Compensation cardinality (G-dot P2 round 3, PR #362): the count,
    // the recorded compensated token, the recovery decision, and the
    // baseline's own compensation evidence are four views of one fact and
    // must agree EXACTLY, in both directions. This authority can compensate
    // only the baseline's last consume, and only once, so the count is
    // fully determined by which case holds:
    //   - decision unresolved or granted → count 0, no compensated token;
    //   - decision compensated, and the last consume was already
    //     compensated in the settled legacy record at capture (the
    //     pre-compensated case — its restore is netted in the baseline's
    //     spent count) → count exactly 0;
    //   - decision compensated by this authority → count exactly 1, and
    //     the token names the baseline's last consume.
    // Anything else double-counts a restore: count 2 beside a compensated
    // decision derives a third credit from a 3-credit pack with two
    // spends, and count 1 on a pre-compensated consume counts the same
    // restore once in the baseline and once locally.
    const lastConsumePreCompensated =
      baseline.lastConsumeToken !== null &&
      baseline.lastCompensatedToken === baseline.lastConsumeToken;
    if (state.recoveryDecision === "compensated" || lastConsumePreCompensated) {
      // Reverse implication (G-dot P2 round 4, PR #362): a baseline whose
      // latest consume was already compensated in the settled record
      // FORCES the compensated shape on the whole state. An unresolved or
      // granted decision beside such a baseline — count 0, no token —
      // would let grant/compensate recover that already-compensated
      // consume a second time whenever another historical spend remains.
      if (lastConsumePreCompensated && state.recoveryDecision !== "compensated") {
        return false;
      }
      if (state.compensatedConsumeToken === null) return false;
      if (state.compensatedConsumeToken !== baseline.lastConsumeToken) return false;
      const expectedCount = lastConsumePreCompensated ? 0 : 1;
      if (state.baselineCompensationCount !== expectedCount) return false;
    } else {
      if (state.baselineCompensationCount !== 0) return false;
      if (state.compensatedConsumeToken !== null) return false;
    }
  }
  if (!isNullableString(state.compensatedConsumeToken)) return false;
  if (!isRecord(state.ownedFiles)) return false;
  for (const entry of Object.values(state.ownedFiles)) {
    if (!isRecord(entry)) return false;
    if (typeof entry.mapId !== "string") return false;
    if (typeof entry.fingerprint !== "string") return false;
    if (!isFiniteNumber(entry.committedAt)) return false;
    if (entry.source !== "commit" && entry.source !== "legacy") return false;
    if (typeof entry.rewardFunded !== "boolean") return false;
    // Only a paid commit can be reward-funded; a legacy grant entry is an
    // already-counted baseline spend and is never bucket-funded.
    if (entry.rewardFunded && entry.source !== "commit") return false;
    // Journal-debit detail (cleared design): when present, portions must
    // be well-formed and sum to the debit's credits; restored portions
    // can never exceed the portions they restore.
    const e = entry as OwnedFileEntry;
    if (e.credits !== undefined && (!isNonNegativeInt(e.credits) || e.credits <= 0)) {
      return false;
    }
    if (e.rewardPortion !== undefined && !isNonNegativeInt(e.rewardPortion)) return false;
    if (e.purchasedPortion !== undefined && !isNonNegativeInt(e.purchasedPortion)) {
      return false;
    }
    if (e.restoredRewardPortion !== undefined && !isNonNegativeInt(e.restoredRewardPortion)) {
      return false;
    }
    if (
      e.restoredPurchasedPortion !== undefined &&
      !isNonNegativeInt(e.restoredPurchasedPortion)
    ) {
      return false;
    }
    if (e.source === "commit") {
      const portions = commitEntryPortions(e);
      if (portions.rewardPortion + portions.purchasedPortion !== portions.credits) {
        return false;
      }
      if (portions.restoredRewardPortion > portions.rewardPortion) return false;
      if (portions.restoredPurchasedPortion > portions.purchasedPortion) return false;
      if (portions.rewardPortion > 0 && e.rewardFunded !== true) return false;
    }
  }
  // Reward bucket conservation (Slice 3, R1-A): the four bucket counters
  // and the per-grant records are views of one fact and must agree
  // exactly. A persisted state that overstates the bucket (or understates
  // what was spent/clawed) would let a clawback reach purchased value or
  // resurrect spent rewards, so it fails closed like every other
  // accounting inconsistency at this boundary.
  if (!isNonNegativeInt(state.rewardBucketBalance)) return false;
  if (!isNonNegativeInt(state.rewardGrantedTotal)) return false;
  if (!isNonNegativeInt(state.rewardSpentTotal)) return false;
  if (!isNonNegativeInt(state.rewardClawedTotal)) return false;
  if (!isRecord(state.rewardGrants)) return false;
  let grantedSum = 0;
  let clawedSum = 0;
  for (const grant of Object.values(state.rewardGrants)) {
    if (!isRecord(grant)) return false;
    if (!isNonNegativeInt(grant.amount) || grant.amount <= 0) return false;
    if (!isFiniteNumber(grant.grantedAt)) return false;
    if (!isNonNegativeInt(grant.clawedAmount)) return false;
    if (grant.clawedAmount > grant.amount) return false;
    if (typeof grant.reversed !== "boolean") return false;
    // A grant not yet reversed cannot have been clawed: clawback happens
    // only as part of a reversal.
    if (!grant.reversed && grant.clawedAmount !== 0) return false;
    const g = grant as RewardGrantEntry;
    if (g.attributedSpent !== undefined && !isNonNegativeInt(g.attributedSpent)) {
      return false;
    }
    if (g.attributedRestored !== undefined && !isNonNegativeInt(g.attributedRestored)) {
      return false;
    }
    // NOTE: attributedSpent is NOT bounded by the grant amount and the
    // residual (amount − outstanding attribution − clawedAmount) may be
    // negative under the pooled claw (v3.9 §3.1) — a negative residual
    // is a valid state, never a validity violation.
    grantedSum += grant.amount;
    clawedSum += grant.clawedAmount;
  }
  if (grantedSum !== state.rewardGrantedTotal) return false;
  if (clawedSum !== state.rewardClawedTotal) return false;
  if (
    state.rewardBucketBalance !==
    state.rewardGrantedTotal - state.rewardSpentTotal - state.rewardClawedTotal
  ) {
    return false;
  }
  // Counter identity over PORTIONS (DL-1 v3.6 §4.1 counter contract;
  // v3.8 §4.3 item 1's warning): rewardSpentTotal = Σ reward-funded
  // commit portions − Σ restored reward portions. The pre-journal
  // flag-count form was exact only at unit commit cost; the identity
  // is the portion sum, and the flag is a commit-time attribution
  // record, never a summand.
  let grossRewardPortions = 0;
  let restoredRewardPortions = 0;
  for (const entry of Object.values(state.ownedFiles)) {
    if (!isRecord(entry) || entry.source !== "commit") continue;
    const portions = commitEntryPortions(entry as OwnedFileEntry);
    grossRewardPortions += portions.rewardPortion;
    restoredRewardPortions += portions.restoredRewardPortion;
  }
  if (state.rewardSpentTotal !== grossRewardPortions - restoredRewardPortions) {
    return false;
  }
  // The order property (DL-1 v3.8 §4.1 restated): for every restoration
  // entry OF THE REWARD PORTION attributed to grant G, if G's reversal
  // entry R exists then seq(restoration) < seq(R). Restorations of
  // purchased portions are outside the quantifier entirely. The
  // violating state is unreachable (the restoration op refuses a
  // reward portion whose funding grant is already reversed); this
  // assertion is defence-in-depth over loaded state, checked only
  // where both sequences were recorded.
  for (const entry of Object.values(state.ownedFiles)) {
    if (!isRecord(entry) || entry.source !== "commit") continue;
    const e = entry as OwnedFileEntry;
    const portions = commitEntryPortions(e);
    if (portions.restoredRewardPortion <= 0) continue;
    if (!e.fundingGrantId) continue;
    const grant = (state.rewardGrants as Record<string, RewardGrantEntry>)[
      e.fundingGrantId
    ];
    if (!grant || !grant.reversed) continue;
    if (
      typeof e.restorationSeq === "number" &&
      typeof grant.reversedSeq === "number" &&
      !(e.restorationSeq < grant.reversedSeq)
    ) {
      return false;
    }
  }
  // Accounting lease (Slice 3, PR #367): structural only. States stored
  // before the lease existed carry no field at all — an absent field is
  // the free state, not corruption (the machine reads it as null and
  // every apply writes it explicitly going forward). A PRESENT lease
  // must be well-formed: a malformed holder record could otherwise lock
  // accounting forever or be mistaken for a live exclusion.
  if (state.accountingLease !== undefined && state.accountingLease !== null) {
    const lease = state.accountingLease;
    if (!isRecord(lease)) return false;
    if (typeof lease.leaseId !== "string" || lease.leaseId.length === 0) return false;
    if (lease.kind !== "legacy_write" && lease.kind !== "migration") return false;
    if (!isFiniteNumber(lease.expiresAt)) return false;
  }
  // Cleared-design journal surface (v3.5–v3.11): structural validation
  // only, and only when a field is present — pre-journal documents
  // carry none of them. One cross-field rule IS enforced: a grant
  // identity lives in exactly one of {pending, folded, settled} —
  // a pending entry contributes to no counter identity (v3.9 §3.3),
  // which the counter identities above already guarantee by summing
  // only the folded record.
  const s = state as EntitlementAuthorityState;
  if (s.journalHead !== undefined && !isNonNegativeInt(s.journalHead)) return false;
  if (
    s.creationProvenance !== undefined &&
    s.creationProvenance !== null &&
    s.creationProvenance !== "snapshot" &&
    s.creationProvenance !== "authority_native" &&
    s.creationProvenance !== "birth_unresolved"
  ) {
    return false;
  }
  if (s.creationSnapshot !== undefined && s.creationSnapshot !== null) {
    const snap = s.creationSnapshot;
    if (!isRecord(snap)) return false;
    if (snap.figure !== null && !isFiniteNumber(snap.figure)) return false;
    if (snap.allowance !== null && !isNonNegativeInt(snap.allowance)) return false;
    if (!isNonNegativeInt(snap.unexplainedRewardAggregate)) return false;
    if (!isRecord(snap.accountingFingerprint)) return false;
    if (!isRecord(snap.accessFingerprint)) return false;
    if (!isNonNegativeInt(snap.snapshotJournalHead)) return false;
    if (!isFiniteNumber(snap.capturedAt)) return false;
  }
  const pending = s.pendingGrants ?? {};
  if (!isRecord(pending)) return false;
  for (const [grantId, entry] of Object.entries(pending)) {
    if (!isRecord(entry)) return false;
    const p = entry as PendingGrantEntry;
    if (p.grantId !== grantId) return false;
    if (p.kind !== "inclusion" && p.kind !== "birth" && p.kind !== "discovery") {
      return false;
    }
    if (p.family !== "reward" && p.family !== "own_purchase") return false;
    if (!isNonNegativeInt(p.amount) || p.amount <= 0) return false;
    if (!isFiniteNumber(p.presentedAt)) return false;
    if (p.discoveryRegistered !== undefined && typeof p.discoveryRegistered !== "boolean") {
      return false;
    }
    // Exactly one home per identity (see above).
    if ((state.rewardGrants as Record<string, unknown>)[grantId]) return false;
    if ((s.settledInclusions ?? {})[grantId]) return false;
  }
  const settled = s.settledInclusions ?? {};
  if (!isRecord(settled)) return false;
  for (const [grantId, entry] of Object.entries(settled)) {
    if (!isRecord(entry)) return false;
    if ((entry as SettledInclusionEntry).grantId !== grantId) return false;
    if (!isNonNegativeInt((entry as SettledInclusionEntry).amount)) return false;
    // The preserved terminal-obligation citation (v3.10 §5), when the
    // entry carries the field, must be a well-formed citation or null.
    const obligation = (entry as SettledInclusionEntry).terminalObligation;
    if (obligation !== undefined && obligation !== null) {
      if (!isRecord(obligation)) return false;
      if (typeof obligation.referredSessionId !== "string") return false;
      if (typeof obligation.lineageRef !== "string") return false;
      if (!isFiniteNumber(obligation.recordedAt)) return false;
    }
  }
  const receipts = s.reversalReceipts ?? {};
  if (!isRecord(receipts)) return false;
  for (const [grantId, receipt] of Object.entries(receipts)) {
    if (!isRecord(receipt)) return false;
    const r = receipt as ReversalReceipt;
    if (r.grantId !== grantId) return false;
    if (!isNonNegativeInt(r.clawedAmount)) return false;
    if (typeof r.basis !== "string" || r.basis.length === 0) return false;
    // A bucket-grant receipt must agree with the grant's own claw
    // record — the receipt is the journaled form of the same fact.
    const grant = (state.rewardGrants as Record<string, RewardGrantEntry>)[grantId];
    if (grant && r.basis === "bucket_grant" && grant.clawedAmount !== r.clawedAmount) {
      return false;
    }
  }
  const unresolved = s.unresolvedReversals ?? {};
  if (!isRecord(unresolved)) return false;
  for (const [grantId, entry] of Object.entries(unresolved)) {
    if (!isRecord(entry)) return false;
    const u = entry as UnresolvedReversalRecord;
    if (u.grantId !== grantId) return false;
    if (u.absence !== "no_baseline" && u.absence !== "unknown_grant") return false;
    if (!isFiniteNumber(u.recordedAt)) return false;
    if (!isFiniteNumber(u.lastObservedAt)) return false;
    if (u.lastObservedAt < u.recordedAt) return false;
    // Structural only, deliberately: NO cross-check against the
    // journal maps. The record is an observation of a past absence;
    // the identity may since have folded, pended, settled, or been
    // receipted, and the record standing beside that resolution is
    // history, not inconsistency (see UnresolvedReversalRecord).
  }
  if (s.foldedOwnGrantTotal !== undefined && !isNonNegativeInt(s.foldedOwnGrantTotal)) {
    return false;
  }
  // The installed base is O_v + S — a SIGNED figure like the
  // position it feeds (v3.6 §3.2): when the verified opening is
  // negative but the journal fold already covers it (S = 0), the
  // base is negative and valid; the floor lives on the spendable
  // view, never on the stored figure. The receipt-arithmetic check
  // below binds the base to O_v + S exactly.
  if (
    s.installedOpeningBase !== undefined &&
    s.installedOpeningBase !== null &&
    !Number.isInteger(s.installedOpeningBase)
  ) {
    return false;
  }
  if (s.verificationReceipt !== undefined && s.verificationReceipt !== null) {
    const v = s.verificationReceipt;
    if (!isRecord(v)) return false;
    if (!isFiniteNumber(v.unverifiedOpening)) return false;
    if (!isFiniteNumber(v.verifiedOpening)) return false;
    if (!isFiniteNumber(v.journalFoldAtInstall)) return false;
    if (!isNonNegativeInt(v.shortfallAbsorption)) return false;
    // The receipt's arithmetic is its substance (v3.6 §3): the
    // absorption is fixed exactly when the verified position is
    // negative, and the installed base is O_v + S.
    const expectedS =
      v.verifiedOpening + v.journalFoldAtInstall < 0
        ? -(v.verifiedOpening + v.journalFoldAtInstall)
        : 0;
    if (v.shortfallAbsorption !== expectedS) return false;
    if (
      s.installedOpeningBase !== null &&
      s.installedOpeningBase !== undefined &&
      s.installedOpeningBase !== v.verifiedOpening + v.shortfallAbsorption
    ) {
      return false;
    }
  }
  // DL-1 Slice 4 publication surface — validator rules 1–9 (§5.3, as
  // amended by pointer P-2 and v3.2 clauses V-1/V-5/V-10/V-11.3). All
  // publication fields are optional in stored documents (absent =
  // empty); a PRESENT field must be well-formed and cross-consistent —
  // a document violating any rule fails closed at load.
  const HEX64 = /^[0-9a-f]{64}$/;
  const pubIntents = s.publicationIntents ?? {};
  const pubJoins = s.publicationIntentJoins ?? {};
  const pubRegistry = s.artifactRegistry ?? {};
  const pubByArtifact = s.publicationIntentByArtifact ?? {};
  const pubGenerations = s.publicationGenerations ?? {};
  if (s.publicationIntents !== undefined && !isRecord(s.publicationIntents)) return false;
  if (s.publicationIntentJoins !== undefined && !isRecord(s.publicationIntentJoins)) {
    return false;
  }
  if (s.artifactRegistry !== undefined && !isRecord(s.artifactRegistry)) return false;
  if (
    s.publicationIntentByArtifact !== undefined &&
    !isRecord(s.publicationIntentByArtifact)
  ) {
    return false;
  }
  if (s.publicationGenerations !== undefined && !isRecord(s.publicationGenerations)) {
    return false;
  }
  if (s.canonicalArtifactByMap !== undefined && !isRecord(s.canonicalArtifactByMap)) {
    return false;
  }
  const bindingByArtifact = new Map<string, string>();
  const noteBinding = (artifactKey: string, binding: unknown): boolean => {
    if (typeof binding !== "string" || binding.length === 0) return false;
    const seen = bindingByArtifact.get(artifactKey);
    if (seen !== undefined && seen !== binding) return false; // rule 6
    bindingByArtifact.set(artifactKey, binding);
    return true;
  };
  // Rules 1 + 9 (intents).
  for (const [intentId, raw] of Object.entries(pubIntents)) {
    if (!isRecord(raw)) return false;
    const intent = raw as unknown as PublicationIntent;
    if (intent.intentId !== intentId) return false;
    if (intent.sessionId !== state.sessionId) return false; // rule 9
    if (typeof intent.mapId !== "string" || intent.mapId.length === 0) return false;
    if (!HEX64.test(intent.fingerprint) || !HEX64.test(intent.digest)) return false;
    if (!isNonNegativeInt(intent.contractVersion)) return false;
    if (!isNonNegativeInt(intent.rendererVersion)) return false;
    if (
      intent.artifactKey !==
      publicationArtifactId(
        intent.sessionId,
        intent.mapId,
        intent.fingerprint,
        intent.contractVersion,
        intent.rendererVersion,
      )
    ) {
      return false; // rule 1: artifactId recomputes from the fields
    }
    const dims = publicationDimsForBinding(intent.canonicalBinding);
    if (!dims) return false;
    if (intent.expectedWidth !== dims.expectedWidth) return false;
    if (intent.expectedHeight !== dims.expectedHeight) return false;
    if (intent.stagingKey !== publicationStagingKey(intentId)) return false;
    if (!isFiniteNumber(intent.createdAt) || !isFiniteNumber(intent.expiresAt)) {
      return false;
    }
    if (!isNonNegativeInt(intent.generation) || intent.generation < 1) return false;
    const genCap = pubGenerations[intent.artifactKey];
    if (genCap === undefined || intent.generation > genCap) return false;
    if (!noteBinding(intent.artifactKey, intent.canonicalBinding)) return false;
  }
  // Rule 2: the generations map is exactly the per-artifact maximum.
  for (const [artifactKey, gen] of Object.entries(pubGenerations)) {
    if (!isNonNegativeInt(gen) || gen < 1) return false;
    let max = 0;
    for (const intent of Object.values(pubIntents)) {
      const i = intent as unknown as PublicationIntent;
      if (i.artifactKey === artifactKey && i.generation > max) max = i.generation;
    }
    if (max !== gen) return false;
  }
  // Rule 3 (structural only): the by-artifact pointer names an existing
  // intent for the artifact at the current generation; when a registry
  // entry exists for the artifactKey the pointer is ABSENT.
  for (const [artifactKey, intentId] of Object.entries(pubByArtifact)) {
    if (typeof intentId !== "string") return false;
    const intent = pubIntents[intentId] as unknown as PublicationIntent | undefined;
    if (!intent || intent.artifactKey !== artifactKey) return false;
    if (intent.generation !== pubGenerations[artifactKey]) return false;
    if (pubRegistry[artifactKey] !== undefined) return false;
  }
  // Rule 4 (+ V-10 claimGeneration, + V-11.3 saturation) and rule 9
  // (registry entries).
  for (const [artifactKey, raw] of Object.entries(pubRegistry)) {
    if (!isRecord(raw)) return false;
    const entry = raw as unknown as ArtifactRegistryEntry;
    if (entry.artifactKey !== artifactKey) return false;
    if (entry.sessionId !== state.sessionId) return false; // rule 9
    if (
      artifactKey !==
      publicationArtifactId(
        entry.sessionId,
        entry.mapId,
        entry.fingerprint,
        entry.contractVersion,
        entry.rendererVersion,
      )
    ) {
      return false;
    }
    if (!HEX64.test(entry.fingerprint) || !HEX64.test(entry.digest)) return false;
    const entryDims = publicationDimsForBinding(entry.canonicalBinding);
    if (!entryDims) return false;
    if (entry.expectedWidth !== 6000) return false;
    if (entry.expectedHeight !== entryDims.expectedHeight) return false;
    if (!Number.isInteger(entry.expectedWidth) || entry.expectedWidth <= 0) return false;
    if (!Number.isInteger(entry.expectedHeight) || entry.expectedHeight <= 0) return false;
    if (entry.state === "finalized") {
      if (entry.finalizedAt === null || !isFiniteNumber(entry.finalizedAt)) return false;
      if (entry.conflictEvidence !== null) return false;
      if (!isRecord(entry.archiveEmail)) return false;
    } else if (entry.state === "conflicted") {
      if (entry.finalizedAt !== null) return false;
      if (entry.conflictEvidence === null || entry.conflictEvidence === undefined) {
        return false;
      }
    } else {
      return false;
    }
    if (!Array.isArray(entry.integrityAlerts) || entry.integrityAlerts.length > 8) {
      return false;
    }
    if (entry.integrityAlertsSaturated === true && entry.integrityAlerts.length !== 8) {
      return false; // V-11.3: saturated ⟹ length 8
    }
    if (entry.integrityAlertsSaturated !== undefined &&
        typeof entry.integrityAlertsSaturated !== "boolean") {
      return false;
    }
    const email = entry.archiveEmail as ArchiveEmailRecord;
    if (!isRecord(email)) return false;
    if (!isNonNegativeInt(email.claimGeneration)) return false; // V-10
    if (email.state === "pending") {
      if (email.claimedAt !== null || email.dispatchedAt !== null) return false;
    } else if (email.state === "claimed") {
      if (email.claimedAt === null || !isFiniteNumber(email.claimedAt)) return false;
      if (email.dispatchedAt !== null) return false;
      if (email.claimGeneration < 1) return false; // V-10: claimed ⟹ ≥ 1
    } else if (email.state === "dispatched") {
      if (email.dispatchedAt === null || !isFiniteNumber(email.dispatchedAt)) {
        return false;
      }
    } else {
      return false;
    }
    if (!noteBinding(artifactKey, entry.canonicalBinding)) return false;
  }
  // Rule 7 (+ the V-1 sole exception) and rule 9 (join records).
  for (const [intentId, raw] of Object.entries(pubJoins)) {
    if (!isRecord(raw)) return false;
    const join = raw as unknown as PublicationIntentJoin;
    if (join.intentId !== intentId) return false;
    if (join.sessionId !== state.sessionId) return false; // rule 9
    if (!pubIntents[join.governingIntentId]) return false;
    if (
      join.artifactKey !==
      publicationArtifactId(
        join.sessionId,
        join.mapId,
        join.fingerprint,
        join.contractVersion,
        join.rendererVersion,
      )
    ) {
      return false;
    }
    if (!HEX64.test(join.fingerprint) || !HEX64.test(join.digest)) return false;
    if (join.stagingKey !== publicationStagingKey(intentId)) return false;
    if (!isFiniteNumber(join.expiresAt) || !isFiniteNumber(join.joinedAt)) return false;
    // V-1 sole exception: after a JN1→R7 promotion the descriptorId owns
    // BOTH the retained join record (audit) and the promoted intent (the
    // classifying record) — and then the intent's payload must equal the
    // join record's payload on every field the join record carries
    // (expiresAt excluded: it is machine-stamped at promotion, W-1;
    // dimensions excluded: they are binding-derived, V-6).
    const coexisting = pubIntents[intentId] as unknown as PublicationIntent | undefined;
    if (coexisting) {
      const carried = [
        "artifactKey",
        "sessionId",
        "mapId",
        "canonicalBinding",
        "fingerprint",
        "contractVersion",
        "rendererVersion",
        "digest",
        "stagingKey",
      ] as const;
      for (const field of carried) {
        if (coexisting[field] !== join[field]) return false;
      }
    }
    if (!noteBinding(join.artifactKey, join.canonicalBinding)) return false;
  }
  // Rule 8 (pointer amendment P-2): every pointer entry must be warranted
  // by a retained intent in the same document with matching mapId +
  // artifactKey (recomputed per rule 1 above). A registry entry alone
  // does NOT satisfy the rule. Absence is valid.
  for (const [mapId, artifactKey] of Object.entries(s.canonicalArtifactByMap ?? {})) {
    if (typeof artifactKey !== "string") return false;
    const warranted = Object.values(pubIntents).some((raw) => {
      const intent = raw as unknown as PublicationIntent;
      return intent.mapId === mapId && intent.artifactKey === artifactKey;
    });
    if (!warranted) return false;
  }
  if (
    state.recoveryDecision !== "unresolved" &&
    state.recoveryDecision !== "granted" &&
    state.recoveryDecision !== "compensated"
  ) {
    return false;
  }
  if (!isNonNegativeInt(state.capabilityGeneration)) return false;
  if (state.createdAt !== null && !isFiniteNumber(state.createdAt)) return false;
  if (state.updatedAt !== null && !isFiniteNumber(state.updatedAt)) return false;
  return true;
}

function factsEqual(a: EntitlementFacts, b: EntitlementFacts): boolean {
  return (
    a.plan === b.plan &&
    a.paid === b.paid &&
    a.revoked === b.revoked &&
    a.subscriptionActive === b.subscriptionActive &&
    a.mapId === b.mapId
  );
}

/**
 * Refresh the grant-side facts. NOTE (RG3 F4 audit clarification):
 * this op carries no timing guard and none is enforced — nothing
 * here prevents a facts rewrite from landing after the opening is
 * installed, and the rewrite does not advance the journal head
 * because it is not an accounting mutation. The accepted protection
 * is not timing: derivations are baseline-fixed (the opening derives
 * from the creation snapshot / installed base, never from a facts
 * rewrite), and record_checkpoint preserves the standing facts
 * rather than restoring snapshot-time facts, so a later rewrite
 * cannot resurrect a superseded opening or falsify an installed one.
 */
function syncFacts(
  state: EntitlementAuthorityState,
  op: Extract<EntitlementAuthorityOp, { type: "sync_facts" }>,
): EntitlementAuthorityApplyResult {
  if (!isValidEntitlementFacts(op.facts)) return refused(state, "invalid_facts");
  if (state.facts && factsEqual(state.facts, op.facts)) {
    return result(state, false, "facts_synced");
  }
  return result(
    {
      ...state,
      facts: { ...op.facts },
      createdAt: state.createdAt ?? op.now,
      updatedAt: op.now,
    },
    true,
    "facts_synced",
  );
}

function captureBaseline(
  state: EntitlementAuthorityState,
  op: Extract<EntitlementAuthorityOp, { type: "capture_baseline" }>,
): EntitlementAuthorityApplyResult {
  // The baseline is immutable once captured: re-running migration never
  // resets it or restores spent credits (v3.6 §2.1). Slice 3 adds the
  // migration trigger and writer fencing around this op.
  if (state.baseline) {
    return result(state, false, "baseline_already_captured");
  }
  // Lease-conditional capture (Codex P2, PR #367): the record this
  // baseline was built from was loaded under a lease; if that lease is
  // no longer the live one, the record may be stale (an interleaved
  // writer settled in between) and the capture must not land — the
  // caller retries from a fresh load. The check is atomic with the
  // capture because both happen inside this op.
  const heldLease = state.accountingLease;
  if (op.expectedLeaseId !== undefined) {
    if (!heldLease || heldLease.leaseId !== op.expectedLeaseId) {
      return refused(state, "lease_not_held");
    }
    if (heldLease.expiresAt <= op.now) {
      return refused(state, "lease_expired");
    }
  } else if (heldLease && heldLease.expiresAt > op.now) {
    return refused(state, "lease_not_held");
  }
  if (!isValidEntitlementBaseline(op.baseline)) {
    return refused(state, "invalid_baseline");
  }
  const baseline = { ...op.baseline };
  let { recoveryDecision, compensatedConsumeToken } = state;
  // A consume already compensated in the settled legacy record is marked
  // compensated at capture: it can never receive a grant (v3.5 §2.4). Its
  // restore is already reflected in the baseline's spent count, so the
  // authority's own compensation counter is NOT incremented for it.
  if (
    baseline.lastCompensatedToken &&
    baseline.lastConsumeToken &&
    baseline.lastCompensatedToken === baseline.lastConsumeToken
  ) {
    recoveryDecision = "compensated";
    compensatedConsumeToken = baseline.lastConsumeToken;
  }
  // The creation snapshot (v3.6 §2.1 / v3.7 §2.1): stored with the
  // baseline, in the same op — the snapshot is the opening's single
  // immutable source and installation reads its figure and nothing
  // else. It claims no identity set. The unexplained reward aggregate
  // is max(0, allowance − plan allowance): the amount by which the
  // settled total exceeds the plan's nominal allowance, recorded as a
  // census figure only (never a classification input — v3.10 §3.3).
  const snapshot: CreationSnapshot = op.snapshot
    ? { ...op.snapshot, snapshotJournalHead: journalHeadOf(state) }
    : buildCreationSnapshotFromBaseline(baseline, state.facts, journalHeadOf(state), op.now);
  return result(
    {
      ...state,
      baseline,
      recoveryDecision,
      compensatedConsumeToken,
      creationSnapshot: snapshot,
      creationProvenance: "snapshot",
      createdAt: state.createdAt ?? op.now,
      updatedAt: op.now,
    },
    true,
    "baseline_captured",
  );
}

/**
 * Derive the creation snapshot from a captured baseline + facts when
 * the caller did not supply one (legacy capture callers). The access
 * fingerprint carries only what the facts hold; the migration bridge
 * supplies the full snapshot (with the record's revocation fields)
 * when it captures.
 */
export function buildCreationSnapshotFromBaseline(
  baseline: EntitlementBaseline,
  facts: EntitlementFacts | null,
  journalHead: number,
  now: number,
): CreationSnapshot {
  const aggregate =
    baseline.plan !== "subscription" && baseline.allowance !== null
      ? Math.max(0, baseline.allowance - PLAN_ALLOWANCE[baseline.plan])
      : 0;
  return {
    figure: baseline.legacyRemainingBalance,
    allowance: baseline.allowance,
    unexplainedRewardAggregate: aggregate,
    accountingFingerprint: {
      creditsRemaining: baseline.legacyRemainingBalance,
      lastConsumeToken: baseline.lastConsumeToken,
      lastCompensatedToken: baseline.lastCompensatedToken,
    },
    accessFingerprint: {
      revoked: facts?.revoked ?? false,
      revokedAt: null,
      reason: null,
      subscriptionActive: facts?.subscriptionActive ?? false,
    },
    snapshotJournalHead: journalHead,
    capturedAt: baseline.capturedAt ?? now,
  };
}

/**
 * FIFO attribution at COMMIT time only (DL-1 v3.7 §4.3, v3.10 §2):
 * the debit's reward portion is attributed to the oldest folded grant
 * with unspent, unreversed-at-commit remainder, and the attribution
 * is recorded immutably on the debit entry. No later op re-selects.
 *
 * "Oldest" is JOURNAL order — the grant entry's own sequence —
 * never wall-clock timestamps or identity strings: two grants folded
 * in the same millisecond still have a journal order, and it is the
 * order the ledger committed them in. Compatibility rule for entries
 * written before grant sequences were recorded: an entry WITHOUT a
 * sequence predates every sequenced entry (its fold belongs to the
 * pre-sequence journal), and unsequenced entries order among
 * themselves by the legacy (grantedAt, grantId) order — the best
 * available reconstruction of their journal order, superseded the
 * moment any sequenced entry exists.
 */
function selectFundingGrant(
  state: EntitlementAuthorityState,
): { grantId: string; grant: RewardGrantEntry } | null {
  const candidates = Object.entries(state.rewardGrants)
    .filter(([, g]) => !g.reversed && rewardGrantResidual(g) > 0)
    .sort((a, b) => {
      const aSeq = a[1].seq;
      const bSeq = b[1].seq;
      if (aSeq !== undefined && bSeq !== undefined) return aSeq - bSeq;
      if (aSeq !== undefined) return 1; // b is unsequenced → older
      if (bSeq !== undefined) return -1; // a is unsequenced → older
      return a[1].grantedAt - b[1].grantedAt || a[0].localeCompare(b[0]);
    });
  if (candidates.length === 0) return null;
  return { grantId: candidates[0][0], grant: candidates[0][1] };
}

function commit(
  state: EntitlementAuthorityState,
  op: Extract<EntitlementAuthorityOp, { type: "commit" }>,
): EntitlementAuthorityApplyResult {
  const invalid = validityRefusal(state);
  if (invalid) return invalid;

  // The ledger is the idempotency mechanism: re-committing an owned
  // artifact (double-click, refresh, second device, A→B→retry-A) never
  // re-debits, whatever token or order the retry arrives in.
  if (state.ownedFiles[op.artifactId]) {
    return result(state, false, "already_owned");
  }

  // Unfinalized artifacts and transient blobs can never satisfy commit
  // (journal-first axiom, v3.5 §2): no durable finalization, no debit path.
  if (!op.finalized) return refused(state, "not_finalized");

  const credits = op.credits ?? 1;
  if (!isNonNegativeInt(credits) || credits <= 0) return refused(state, "no_credits");

  const remaining = deriveRemainingAllowance(state);
  if (remaining !== null && remaining < credits) {
    // A commit only a PENDING amount could fund names the pendency
    // (v3.8 §3.5 matrix cell): pending grants fold nothing, so the
    // folded position is the whole story — but the refusal tells the
    // customer surface which state they are waiting on.
    if (remaining <= 0 && Object.keys(pendingGrantsOf(state)).length > 0) {
      return refused(state, "insufficient_balance_pending");
    }
    return refused(state, "no_credits");
  }

  // Reward-first funding (R1-A): on a finite plan the commit is funded
  // from the reward bucket while it has unspent credit, so a later
  // referral clawback finds the reward already spent and can never reach
  // purchased value. A subscription commit is unlimited and never touches
  // the bucket (subscription entitlements hold no bucket credits — grants
  // refuse them — so the bucket is always empty here in practice).
  const plan = effectivePlan(state);
  const rewardPortion =
    plan !== "subscription" ? Math.min(credits, state.rewardBucketBalance) : 0;
  const purchasedPortion = credits - rewardPortion;
  const rewardFunded = rewardPortion > 0;
  const funding = rewardFunded ? selectFundingGrant(state) : null;
  const seq = nextSeq(state);
  const entry: OwnedFileEntry = {
    mapId: op.mapId,
    fingerprint: op.fingerprint,
    committedAt: op.now,
    source: "commit",
    rewardFunded,
    credits,
    consumeToken: op.consumeToken ?? null,
    rewardPortion,
    purchasedPortion,
    fundingGrantId: funding?.grantId ?? null,
    restoredRewardPortion: 0,
    restoredPurchasedPortion: 0,
    committedSeq: seq,
    restorationSeq: null,
  };
  const rewardGrants = funding
    ? {
        ...state.rewardGrants,
        [funding.grantId]: {
          ...funding.grant,
          attributedSpent: (funding.grant.attributedSpent ?? 0) + rewardPortion,
        },
      }
    : state.rewardGrants;
  return result(
    {
      ...state,
      ownedFiles: { ...state.ownedFiles, [op.artifactId]: entry },
      rewardGrants,
      rewardBucketBalance: state.rewardBucketBalance - rewardPortion,
      rewardSpentTotal: state.rewardSpentTotal + rewardPortion,
      journalHead: seq,
      updatedAt: op.now,
    },
    true,
    "committed",
  );
}

function grant(
  state: EntitlementAuthorityState,
  op: Extract<EntitlementAuthorityOp, { type: "grant" }>,
): EntitlementAuthorityApplyResult {
  const invalid = validityRefusal(state);
  if (invalid) return invalid;

  // Grant and compensate are mutually exclusive (v3.5 §2.4): a compensated
  // spend can never receive a grant, and a granted spend's ownership can
  // never be re-granted to another fingerprint.
  if (state.recoveryDecision === "compensated") {
    return refused(state, "already_compensated");
  }
  if (state.recoveryDecision === "granted") {
    if (state.ownedFiles[op.artifactId]?.source === "legacy") {
      return result(state, false, "already_granted");
    }
    return refused(state, "already_granted");
  }

  if (!state.baseline) return refused(state, "no_baseline");
  if (state.baseline.legacySpentCount <= 0) return refused(state, "no_legacy_spend");
  // The grant delivers the artifact for the baseline's purchase-bound map.
  // Records lacking a mapId fall back to support — the authority
  // never guesses a binding.
  if (!state.baseline.purchaseMapId) return refused(state, "grant_requires_support");
  // A spent baseline whose consume carries no token has an incomplete
  // evidence chain: the spend remains spent, but recovery for it is
  // support-only — it cannot authorize a grant (G-dot P2 fix, PR #362).
  if (!state.baseline.lastConsumeToken) return refused(state, "grant_requires_support");
  if (op.mapId !== state.baseline.purchaseMapId) {
    return refused(state, "grant_map_mismatch");
  }
  if (!op.finalized) return refused(state, "not_finalized");

  // An artifact the customer already owns via a paid commit needs no
  // grant: consume the one-time recovery decision (nothing remains owed)
  // and preserve the paid entry byte-for-byte — a real purchase's
  // provenance, fingerprint and commit time are never rewritten by
  // recovery. (Codex P2 on PR #362.)
  if (state.ownedFiles[op.artifactId]) {
    const seq = nextSeq(state);
    return result(
      { ...state, recoveryDecision: "granted", journalHead: seq, updatedAt: op.now },
      true,
      "already_owned",
    );
  }

  const entry: OwnedFileEntry = {
    mapId: op.mapId,
    fingerprint: op.fingerprint,
    committedAt: op.now,
    source: "legacy",
    rewardFunded: false,
  };
  // The grant consumes the mutually exclusive recovery decision and
  // records ownership — an accounting mutation in the attested
  // journal, so it advances the journal head like every other
  // mutation the exact-head attestation covers (v3.6 §2.4).
  const seq = nextSeq(state);
  return result(
    {
      ...state,
      ownedFiles: { ...state.ownedFiles, [op.artifactId]: entry },
      recoveryDecision: "granted",
      journalHead: seq,
      updatedAt: op.now,
    },
    true,
    "granted",
  );
}

function compensate(
  state: EntitlementAuthorityState,
  op: Extract<EntitlementAuthorityOp, { type: "compensate" }>,
): EntitlementAuthorityApplyResult {
  const invalid = validityRefusal(state);
  if (invalid) return invalid;

  if (effectivePlan(state) === "subscription") {
    return refused(state, "subscription_plan");
  }
  if (!state.baseline) return refused(state, "no_baseline");

  if (state.recoveryDecision === "granted") {
    return refused(state, "already_granted");
  }
  if (state.recoveryDecision === "compensated") {
    // Idempotent replay for the same consume token; any other token is a
    // different spend and stays refused.
    if (op.consumeToken && op.consumeToken === state.baseline.lastConsumeToken) {
      return result(state, false, "already_compensated");
    }
    return refused(state, "already_compensated");
  }

  // Compensation restores a credit for a spend that actually happened:
  // a token recorded against a zero-spend baseline is an inconsistent
  // record, never a compensable spend (G-dot P2 fix, PR #362).
  if (state.baseline.legacySpentCount <= 0) return refused(state, "no_legacy_spend");
  if (!op.consumeToken || op.consumeToken !== state.baseline.lastConsumeToken) {
    return refused(state, "token_mismatch");
  }
  const lastConsumeAt = state.baseline.lastConsumeAt ?? 0;
  if (!lastConsumeAt || op.now - lastConsumeAt > LEGACY_COMPENSATE_WINDOW_MS) {
    return refused(state, "window_expired");
  }

  // Restores exactly one baseline credit via the derived formula and marks
  // the decision. It NEVER removes a ledger entry (v3.5 §2.4). The
  // compensation ADVANCES THE JOURNAL HEAD: it changes the fold
  // (baselineCompensationCount is a fold input), and every accounting
  // mutation the exact-head attestation covers must move its binding
  // version — otherwise a checkpoint prepared before the compensation
  // would record against the new fold while citing the old head,
  // certifying an unchanged head across a monetary mutation
  // (v3.6 §2.4/§3; T-C12's binding applied to every covered op).
  const seq = nextSeq(state);
  return result(
    {
      ...state,
      recoveryDecision: "compensated",
      compensatedConsumeToken: op.consumeToken,
      baselineCompensationCount: state.baselineCompensationCount + 1,
      journalHead: seq,
      updatedAt: op.now,
    },
    true,
    "compensated",
  );
}

/**
 * Compensate a JOURNAL debit (DL-1 v3.5 §2.4; v3.6 §4.1; v3.10 §2).
 * The op performs NO selection: it reads the debit's recorded
 * portions and its recorded funding grant. The reward portion is
 * restorable iff that grant stands unreversed AT THIS MOMENT; if it
 * stands reversed the reward portion is refused
 * (funding_grant_reversed) — finally, and with the grant identity
 * operator-visible — while the purchased portion (if any) still
 * restores. The bucket's current value neither budgets nor bounds a
 * restoration: a fully spent, unreversed grant compensates from
 * bucket 0, and the restoration raises the bucket (v3.10 §2.2).
 * Delivery of the file itself never depends on any of this
 * (ownership + validity, never balance).
 */
function compensateDebit(
  state: EntitlementAuthorityState,
  op: Extract<EntitlementAuthorityOp, { type: "compensate_debit" }>,
): EntitlementAuthorityApplyResult {
  const invalid = validityRefusal(state);
  if (invalid) return invalid;

  const artifactId = Object.keys(state.ownedFiles).find((id) => {
    const e = state.ownedFiles[id];
    return e.source === "commit" && (e.consumeToken ?? id) === op.consumeToken;
  });
  if (!artifactId) return refused(state, "unknown_debit");
  const entry = state.ownedFiles[artifactId];
  const portions = commitEntryPortions(entry);

  const purchasedOutstanding = portions.purchasedPortion - portions.restoredPurchasedPortion;
  const rewardOutstanding = portions.rewardPortion - portions.restoredRewardPortion;
  if (purchasedOutstanding <= 0 && rewardOutstanding <= 0) {
    return result(state, false, "already_compensated");
  }

  const fundingGrant =
    portions.rewardPortion > 0 && entry.fundingGrantId
      ? state.rewardGrants[entry.fundingGrantId]
      : undefined;
  const rewardRefused =
    rewardOutstanding > 0 && fundingGrant !== undefined && fundingGrant.reversed;

  if (rewardRefused && purchasedOutstanding <= 0) {
    // Fully reward-funded debit whose funding grant is reversed:
    // refused whole; the refusal is the op's final answer.
    return result(state, false, "refused", "funding_grant_reversed", 0, {
      restoration: {
        purchasedRestored: 0,
        rewardRestored: 0,
        rewardRefusal: "funding_grant_reversed",
        fundingGrantId: entry.fundingGrantId ?? null,
      },
    });
  }

  const restoreReward = rewardRefused ? 0 : rewardOutstanding;
  const seq = nextSeq(state);
  const nextEntry: OwnedFileEntry = {
    ...entry,
    restoredPurchasedPortion: portions.restoredPurchasedPortion + purchasedOutstanding,
    restoredRewardPortion: portions.restoredRewardPortion + restoreReward,
    restorationSeq: seq,
  };
  // The restoration un-spends the recorded funding grant's
  // attribution by the restored amount (Codex re-gate F-A): the
  // grant's outstanding attribution nets down, so a later commit can
  // select it again under §4.3's unspent-remainder rule and the new
  // debit records the funding grant whose reversal state §4.2 will
  // read. A refused reward portion (funding grant reversed) restores
  // nothing and nets nothing.
  const rewardGrants =
    restoreReward > 0 && fundingGrant && entry.fundingGrantId
      ? {
          ...state.rewardGrants,
          [entry.fundingGrantId]: {
            ...fundingGrant,
            attributedRestored:
              (fundingGrant.attributedRestored ?? 0) + restoreReward,
          },
        }
      : state.rewardGrants;
  return result(
    {
      ...state,
      ownedFiles: { ...state.ownedFiles, [artifactId]: nextEntry },
      rewardGrants,
      rewardBucketBalance: state.rewardBucketBalance + restoreReward,
      rewardSpentTotal: state.rewardSpentTotal - restoreReward,
      journalHead: seq,
      updatedAt: op.now,
    },
    true,
    "compensated",
    null,
    0,
    {
      restoration: {
        purchasedRestored: purchasedOutstanding,
        rewardRestored: restoreReward,
        rewardRefusal: rewardRefused ? "funding_grant_reversed" : null,
        fundingGrantId: entry.fundingGrantId ?? null,
      },
    },
  );
}

/**
 * Classify a presenting referral grant against the creation snapshot
 * (DL-1 v3.8 §2.2 as amended by v3.10 §§1/3 and v3.11 §2).
 *
 * - `included` requires BOTH a positive landing witness (finalized
 *   form) AND an operator receipt naming the identity — receipt
 *   precedence: no figure, aggregate, or netting computation may
 *   override, gate, or annotate against a receipt, and the aggregate
 *   is NEVER a classification input (both aggregate legs deleted).
 * - `excluded` requires positive proof: era proof (== P-c snapshot
 *   order), a positive non-grant witness, or an operator receipt.
 * - Native admission (fold, no classification) requires positive
 *   provenance that no legacy landing occurred: P-b fencing (the
 *   session was created after fencing completed, as recorded) or
 *   P-c snapshot order. A prior journal entry is DISPATCH ONLY,
 *   never provenance (v3.11 §2.2). Missing evidence is `unresolved`,
 *   never native — the lost-witness rule.
 *
 * Returns the classification plus whether native admission applies.
 */
export function classifyReferralGrant(
  state: EntitlementAuthorityState,
  evidence: NonNullable<
    Extract<EntitlementAuthorityOp, { type: "grant_reward" }>["classificationEvidence"]
  >,
): { classification: GrantClassification; nativeAdmission: boolean } {
  const snapshot = state.creationSnapshot ?? null;
  const hasLandingEvidence =
    evidence.witness === "finalized_grant" ||
    evidence.witness === "finalized_non_grant" ||
    evidence.operatorIncludedReceipt === true ||
    evidence.operatorExcludedReceipt === true;

  if (!hasLandingEvidence) {
    // Provenance gate for native admission (v3.10 §1.2, v3.11 §2.2).
    // P-b: fencing provenance — available ONLY on genuine completed
    // fencing as recorded in the activation record.
    if (
      evidence.fencingCompletedAt !== null &&
      evidence.sessionCreatedAt > evidence.fencingCompletedAt
    ) {
      return { classification: "excluded", nativeAdmission: true };
    }
    // P-c: snapshot-order — proof of exclusion from THIS snapshot
    // only; it asserts nothing about any other snapshot.
    if (snapshot && evidence.sessionCreatedAt > snapshot.capturedAt) {
      return { classification: "excluded", nativeAdmission: true };
    }
    return { classification: "unresolved", nativeAdmission: false };
  }

  // Included: finalized landing witness + operator receipt (both legs).
  if (evidence.witness === "finalized_grant" && evidence.operatorIncludedReceipt) {
    return { classification: "included", nativeAdmission: false };
  }
  // Excluded: operator receipt, positive non-grant witness, era proof.
  if (evidence.operatorExcludedReceipt) {
    return { classification: "excluded", nativeAdmission: false };
  }
  if (evidence.witness === "finalized_non_grant") {
    return { classification: "excluded", nativeAdmission: false };
  }
  if (snapshot && evidence.sessionCreatedAt > snapshot.capturedAt) {
    return { classification: "excluded", nativeAdmission: false };
  }
  return { classification: "unresolved", nativeAdmission: false };
}

function journalPendingGrant(
  state: EntitlementAuthorityState,
  pending: PendingGrantEntry,
  now: number,
): EntitlementAuthorityApplyResult {
  const seq = nextSeq(state);
  return result(
    {
      ...state,
      pendingGrants: { ...pendingGrantsOf(state), [pending.grantId]: pending },
      journalHead: seq,
      createdAt: state.createdAt ?? now,
      updatedAt: now,
    },
    true,
    "grant_pending",
    null,
    0,
    { pendingKind: pending.kind },
  );
}

/** Fold a reward grant into the bucket (the ordinary true grant). */
function foldRewardGrant(
  state: EntitlementAuthorityState,
  grantId: string,
  amount: number,
  now: number,
): EntitlementAuthorityState {
  const seq = nextSeq(state);
  const grant: RewardGrantEntry = {
    amount,
    grantedAt: now,
    clawedAmount: 0,
    reversed: false,
    attributedSpent: 0,
    attributedRestored: 0,
    reversedSeq: null,
    seq,
  };
  return {
    ...state,
    rewardGrants: { ...state.rewardGrants, [grantId]: grant },
    rewardBucketBalance: state.rewardBucketBalance + amount,
    rewardGrantedTotal: state.rewardGrantedTotal + amount,
    journalHead: seq,
    createdAt: state.createdAt ?? now,
    updatedAt: now,
  };
}

/**
 * Admit a grant born-reversed (DL-1 v3.9 §4.3): grant entry and
 * compensating reversal journal in ONE commit — claw exactly the
 * grant amount (the fold precedes the claw in the same op, so the
 * pooled bound is the amount itself), receipt citing the terminal
 * record. Net bucket effect: zero (v3.9 §3.3 symmetric entry).
 */
function foldRewardGrantBornReversed(
  state: EntitlementAuthorityState,
  grantId: string,
  amount: number,
  now: number,
  terminalRecord: { lineageRef: string; recordedAt: number } | null,
): EntitlementAuthorityState {
  const folded = foldRewardGrant(state, grantId, amount, now);
  const grant = folded.rewardGrants[grantId];
  const seq = nextSeq(folded);
  const receipt: ReversalReceipt = {
    grantId,
    clawedAmount: amount,
    basis: "born_reversed_terminal",
    seq,
    committedAt: now,
    terminalCitation: terminalRecord
      ? {
          referredSessionId: grantId,
          lineageRef: terminalRecord.lineageRef,
          recordedAt: terminalRecord.recordedAt,
        }
      : null,
  };
  return {
    ...folded,
    rewardGrants: {
      ...folded.rewardGrants,
      [grantId]: { ...grant, clawedAmount: amount, reversed: true, reversedSeq: seq },
    },
    rewardBucketBalance: folded.rewardBucketBalance - amount,
    rewardClawedTotal: folded.rewardClawedTotal + amount,
    reversalReceipts: { ...reversalReceiptsOf(folded), [grantId]: receipt },
    journalHead: seq,
    updatedAt: now,
  };
}

function grantReward(
  state: EntitlementAuthorityState,
  op: Extract<EntitlementAuthorityOp, { type: "grant_reward" }>,
): EntitlementAuthorityApplyResult {
  // Shape first: a malformed grant is refused before any accounting.
  if (
    typeof op.grantId !== "string" ||
    op.grantId.trim().length === 0 ||
    !isNonNegativeInt(op.amount) ||
    op.amount <= 0
  ) {
    return refused(state, "invalid_reward");
  }
  // Late grant after a terminal receipt (DL-1 v3.6 §4.3): refused,
  // and a late_grant_incident reconciliation record is journaled.
  // (A born-reversed admission carries its OWN receipt, written by
  // the admission itself — the grant entry exists in that case, so
  // this branch fires only when no grant entry stands.)
  const terminalReceipt = reversalReceiptsOf(state)[op.grantId];
  if (terminalReceipt && !state.rewardGrants[op.grantId]) {
    const seq = nextSeq(state);
    return result(
      {
        ...state,
        lateGrantIncidents: {
          ...(state.lateGrantIncidents ?? {}),
          [op.grantId]: op.now,
        },
        journalHead: seq,
        updatedAt: op.now,
      },
      true,
      "refused",
      "grant_after_terminal_receipt",
    );
  }
  // Idempotent replay / prior-entry DISPATCH (v3.11 §2.2): an existing
  // entry resolves the presentation under the ordinary mechanics; an
  // unresolved entry stays unresolved — the presentation joins the
  // pendency and the entry's existence proves nothing.
  const existing = state.rewardGrants[op.grantId];
  if (existing) {
    if (existing.amount !== op.amount) return refused(state, "invalid_reward");
    return result(state, false, "reward_already_granted");
  }
  const existingPending = pendingGrantsOf(state)[op.grantId];
  if (existingPending) {
    if (existingPending.amount !== op.amount) return refused(state, "invalid_reward");
    // A discovery pendency's registration conflict surfaces on
    // retry exactly as at first admission (§5.3: refusal + incident).
    if (
      existingPending.kind === "discovery" &&
      op.discoveryRegistration === "conflict"
    ) {
      return refused(state, "discovery_conflict");
    }
    // Retry dispatch (v3.8 §5.3 retry + v3.10 §5): the redelivery
    // re-runs the registration leg, and its outcome updates the
    // pending entry in this same op —
    // (i) a COMPLETED leg is recorded for a discovery pendency
    //     (Codex re-gate F-E): settlement may spend the entry only
    //     once this stands, because the registration is the only
    //     evidence a settlement can lawfully rest on;
    // (ii) a terminal record that landed during the pendency
    //     attaches its obligation, so the excluded settlement is
    //     the born-reversed pair, exactly as if the obligation had
    //     been recorded at first admission.
    const legCompleted =
      op.discoveryRegistration === "registered" ||
      op.discoveryRegistration === "already_registered" ||
      op.discoveryRegistration === "registered_after_terminal";
    const attachObligation =
      op.discoveryRegistration === "registered_after_terminal" &&
      !existingPending.terminalObligation;
    const recordLeg =
      existingPending.kind === "discovery" &&
      legCompleted &&
      !existingPending.discoveryRegistered;
    if (attachObligation || recordLeg) {
      const seq = nextSeq(state);
      return result(
        {
          ...state,
          pendingGrants: {
            ...pendingGrantsOf(state),
            [op.grantId]: {
              ...existingPending,
              ...(recordLeg ? { discoveryRegistered: true } : {}),
              ...(attachObligation
                ? {
                    terminalObligation: {
                      referredSessionId: op.grantId,
                      lineageRef: op.terminalRecord?.lineageRef ?? "",
                      recordedAt: op.terminalRecord?.recordedAt ?? op.now,
                    },
                  }
                : {}),
            },
          },
          journalHead: seq,
          updatedAt: op.now,
        },
        true,
        "grant_pending",
        null,
        0,
        { pendingKind: existingPending.kind },
      );
    }
    return result(state, false, "grant_pending", null, 0, {
      pendingKind: existingPending.kind,
    });
  }
  const settled = settledInclusionsOf(state)[op.grantId];
  if (settled) {
    if (settled.amount !== op.amount) return refused(state, "invalid_reward");
    return result(state, false, "already_included_in_opening");
  }
  const invalid = validityRefusal(state);
  if (invalid) return invalid;
  // Matches the legacy writer (W13): subscription referrers receive no
  // finite reward credit — an unlimited plan has no bucket to hold one.
  if (effectivePlan(state) === "subscription") {
    return refused(state, "subscription_plan");
  }

  // Registration is required AT THE MACHINE BOUNDARY (v3.8 §5.1):
  // every path below this point confers or journals an accounting
  // fact (a fold, a born-reversed pair, a settled-inclusion
  // observation, a pendency). An op arriving without the shell's
  // attested registration outcome never ran the leg — it is refused,
  // not silently admitted. (The dispatch branches above confer
  // nothing: an existing entry, pendency, or settled inclusion
  // resolves the presentation without the leg's evidence.)
  if (op.discoveryRegistration === undefined) {
    return refused(state, "discovery_attestation_missing");
  }

  // Discovery attestation (v3.8 §5.3): the shell leg ran before this
  // op was invoked. Conflict refuses; unavailable pends.
  if (op.discoveryRegistration === "conflict") {
    return refused(state, "discovery_conflict");
  }
  if (op.discoveryRegistration === "unavailable") {
    return journalPendingGrant(
      state,
      {
        grantId: op.grantId,
        kind: "discovery",
        family: "reward",
        amount: op.amount,
        presentedAt: op.now,
        presentingWriter: op.presentingWriter ?? null,
        terminalObligation: null,
      },
      op.now,
    );
  }
  const afterTerminal = op.discoveryRegistration === "registered_after_terminal";
  // The born-reversed form is produced ONLY under the terminal
  // attestation (the fold paths below): a terminal-attested command
  // can never journal an uncompensated fold (terminal_negative_unconsumed
  // is unreachable by construction), and no other attestation carries
  // a compensating reversal (discovery_attestation_mismatch likewise).

  // Classification (v3.8 §2.2 as amended), inside the op, before any
  // fold effect. Missing evidence is UNRESOLVED, never native
  // admission (the lost-witness rule, v3.11 §2): an omitted evidence
  // bundle proves nothing about the identity's landing, so the grant
  // pends exactly as an explicitly unresolved classification does.
  const classification: GrantClassification = op.classificationEvidence
    ? classifyReferralGrant(state, op.classificationEvidence).classification
    : "unresolved";
  {
    if (classification === "included") {
      // Observation: zero fold effect, the identity is recorded as
      // settled-included so a later reversal takes basis (a).
      const seq = nextSeq(state);
      return result(
        {
          ...state,
          settledInclusions: {
            ...settledInclusionsOf(state),
            [op.grantId]: {
              grantId: op.grantId,
              amount: op.amount,
              settledAt: op.now,
              basis: "operator_receipt",
              // The terminal lineage citation survives the admission
              // on the settlement record itself (v3.10 §5): an
              // identity admitted included while a terminal record
              // stands keeps its reconciliation citation durably.
              terminalObligation: afterTerminal
                ? {
                    referredSessionId: op.grantId,
                    lineageRef: op.terminalRecord?.lineageRef ?? "",
                    recordedAt: op.terminalRecord?.recordedAt ?? op.now,
                  }
                : null,
            },
          },
          journalHead: seq,
          createdAt: state.createdAt ?? op.now,
          updatedAt: op.now,
        },
        true,
        "already_included_in_opening",
      );
    }
    if (classification === "unresolved") {
      return journalPendingGrant(
        state,
        {
          grantId: op.grantId,
          kind: "inclusion",
          family: "reward",
          amount: op.amount,
          presentedAt: op.now,
          presentingWriter: op.presentingWriter ?? null,
          // The terminal obligation rides the pending entry (v3.10 §5).
          terminalObligation: afterTerminal
            ? {
                referredSessionId: op.grantId,
                lineageRef: op.terminalRecord?.lineageRef ?? "",
                recordedAt: op.terminalRecord?.recordedAt ?? op.now,
              }
            : null,
        },
        op.now,
      );
    }
    // classification === "excluded": falls through to the fold, in
    // born-reversed form when a terminal record stands.
  }

  if (afterTerminal) {
    const next = foldRewardGrantBornReversed(
      state,
      op.grantId,
      op.amount,
      op.now,
      op.terminalRecord ?? null,
    );
    return result(next, true, "reward_granted_born_reversed");
  }
  const next = foldRewardGrant(state, op.grantId, op.amount, op.now);
  return result(next, true, "reward_granted");
}

function reverseReward(
  state: EntitlementAuthorityState,
  op: Extract<EntitlementAuthorityOp, { type: "reverse_reward" }>,
): EntitlementAuthorityApplyResult {
  const grantId = typeof op.grantId === "string" ? op.grantId : "";
  const grant = grantId ? state.rewardGrants[grantId] : undefined;
  if (!grant) {
    // Classification INSIDE the op (DL-1 v3.6 §4.3): the outcomes for
    // an identity with no folded grant entry are decided here, in the
    // serialized stream — never by a wrapper pre-check.
    // A pending entry pairs the reversal with the pendency (§2.3 of
    // v3.7): not a bucket grant (nothing to claw), not a proven
    // non-grant (no terminal zero from pendency) — outcome 3, defer.
    if (grantId && pendingGrantsOf(state)[grantId]) {
      return refused(state, "reversal_deferred");
    }
    // An existing terminal receipt replays verbatim.
    const priorReceipt = grantId ? reversalReceiptsOf(state)[grantId] : undefined;
    if (priorReceipt) {
      return result(state, false, "not_bucket_grant", null, priorReceipt.clawedAmount, {
        reversalBasis: priorReceipt.basis,
      });
    }
    // Positive presence: settled `included` in this snapshot's
    // opening → terminal zero, basis pre_bucket_in_opening (v3.6
    // §7.2, gated on classification by v3.7 §6.2). The receipt is
    // journaled here so the classification survives the caller.
    const settled = grantId ? settledInclusionsOf(state)[grantId] : undefined;
    if (settled || op.operatorReceipt) {
      const basis = settled ? "pre_bucket_in_opening" : "operator_receipt";
      const seq = nextSeq(state);
      const receipt: ReversalReceipt = {
        grantId,
        clawedAmount: 0,
        basis,
        seq,
        committedAt: op.now,
      };
      return result(
        {
          ...state,
          reversalReceipts: { ...reversalReceiptsOf(state), [grantId]: receipt },
          journalHead: seq,
          updatedAt: op.now,
        },
        true,
        "not_bucket_grant",
        null,
        0,
        { reversalBasis: basis },
      );
    }
    return refused(state, "unknown_reward_grant");
  }
  if (grant.reversed) {
    // Replay returns the JOURNALED RECEIPT verbatim (DL-1 v3.6 §4.3):
    // the original persisted clawedAmount — repairing the gap where
    // every layer of the pre-journal path re-derived zero on replay.
    const receipt = reversalReceiptsOf(state)[grantId];
    const originalClawed = receipt ? receipt.clawedAmount : grant.clawedAmount;
    return result(state, false, "reward_reversal_already_applied", null, originalClawed, {
      reversalBasis: receipt?.basis ?? null,
    });
  }
  // R1-A clawback bound — the entire point of the separate bucket: a
  // reversal removes at most this grant's still-unreversed amount, and
  // only from the UNSPENT bucket (the POOLED bound, v3.7 §4.3: the
  // per-grant record caps and receipts the claw; it does not segregate
  // funds). What the bucket no longer holds (spent on files, or clawed
  // by an earlier reversal) is never collected from purchased credits,
  // owned files are never removed, and no negative balance/debt is
  // created. Deliberately NOT validity-gated: a reversal only ever
  // shrinks the bucket, and gating it (e.g. on the referrer's own
  // later revocation) could strand a reversal the ledger owes.
  const clawed = Math.min(grant.amount - grant.clawedAmount, state.rewardBucketBalance);
  const seq = nextSeq(state);
  const receipt: ReversalReceipt = {
    grantId,
    clawedAmount: grant.clawedAmount + clawed,
    basis: "bucket_grant",
    seq,
    committedAt: op.now,
  };
  return result(
    {
      ...state,
      rewardGrants: {
        ...state.rewardGrants,
        [grantId]: {
          ...grant,
          clawedAmount: grant.clawedAmount + clawed,
          reversed: true,
          reversedSeq: seq,
        },
      },
      rewardBucketBalance: state.rewardBucketBalance - clawed,
      rewardClawedTotal: state.rewardClawedTotal + clawed,
      reversalReceipts: { ...reversalReceiptsOf(state), [grantId]: receipt },
      journalHead: seq,
      updatedAt: op.now,
    },
    true,
    "reward_reversed",
    null,
    clawed,
    { reversalBasis: "bucket_grant" },
  );
}

/**
 * Persist the reconciliation record for an unresolved reversal
 * absence (conformance round 2, F3 residual). Called by the reversal
 * wrapper on exactly the two deferral paths whose absence had no
 * durable form: no baseline (the op itself never ran) and
 * unknown_reward_grant (the op refused on unchanged state). The
 * third deferral path — reversal_deferred against a pending entry —
 * needs no record here: the pendency IS the durable, operator-visible
 * record of that identity.
 *
 * Idempotent and zero-effect: one record per grant id; a repeat
 * delivery with the same absence is a no-op replay, and a progressed
 * absence (a baseline landed, the grant still unknown) refreshes the
 * observation in place — recordedAt, the first observation, is
 * preserved. The refresh is monotonic and one-way: lastObservedAt
 * never moves backwards (caller timestamps are not serialized in
 * order, and the validator rejects lastObservedAt < recordedAt), and
 * absence never regresses from unknown_grant back to no_baseline.
 * The journal head is NOT advanced and no counter, fold
 * input, or validity input is touched: this is bookkeeping about an
 * absence, not an accounting mutation, so the exact-head attestation
 * neither covers it nor is invalidated by it (v3.6 §2.4; the lease
 * ops are the standing precedent for changed-but-unattested state).
 * Deliberately NOT validity-gated, like reverseReward itself: a
 * deferral must be recordable exactly when the state is at its least
 * classifiable.
 */
function recordUnresolvedReversal(
  state: EntitlementAuthorityState,
  op: Extract<EntitlementAuthorityOp, { type: "record_unresolved_reversal" }>,
): EntitlementAuthorityApplyResult {
  const grantId = typeof op.grantId === "string" ? op.grantId : "";
  if (!grantId) return refused(state, "invalid_reward");
  if (op.absence !== "no_baseline" && op.absence !== "unknown_grant") {
    return refused(state, "invalid_reward");
  }
  // Presence guard, judged inside the serialized stream: a record is
  // written only while the absence it names still holds. Any journal
  // presence — a folded grant, a pending entry, a settled inclusion,
  // a reversal receipt — means the identity is classifiable (or
  // already classified) and an "unresolved absence" record would be
  // false the moment it landed.
  if (
    state.rewardGrants[grantId] ||
    pendingGrantsOf(state)[grantId] ||
    settledInclusionsOf(state)[grantId] ||
    reversalReceiptsOf(state)[grantId]
  ) {
    return refused(state, "unresolved_absence_resolved");
  }
  const existing = unresolvedReversalsOf(state)[grantId];
  if (existing && existing.absence === op.absence) {
    // Idempotent replay: the record already stands as observed; a
    // redelivery must not duplicate it or churn the state.
    return result(state, false, "unresolved_reversal_recorded");
  }
  if (existing) {
    // A DIFFERENT absence than the standing record: a progression
    // (no_baseline → unknown_grant, when a baseline landed and the
    // grant is still unknown) or a stale regression attempt (a
    // no_baseline observation redelivered after the record already
    // progressed). The refresh is monotonic and one-way. Caller
    // timestamps are not serialized in order, so an out-of-order
    // observation can carry a `now` older than the standing record
    // — even older than recordedAt — and must never move the record
    // backwards: the persisted-state validator rejects
    // lastObservedAt < recordedAt, so a naive rewrite would wedge
    // the state on its next load. recordedAt (the first observation)
    // never changes and lastObservedAt only advances. Absence never
    // regresses: against a standing unknown_grant the incoming
    // no_baseline is stale — it refreshes the last-observed time
    // forward and leaves the progressed absence standing.
    const absence =
      existing.absence === "unknown_grant" ? "unknown_grant" : op.absence;
    const lastObservedAt = Math.max(existing.lastObservedAt, op.now);
    if (absence === existing.absence && lastObservedAt === existing.lastObservedAt) {
      // The stale observation advances nothing: no churn.
      return result(state, false, "unresolved_reversal_recorded");
    }
    const record: UnresolvedReversalRecord = {
      ...existing,
      absence,
      lastObservedAt,
    };
    return result(
      {
        ...state,
        unresolvedReversals: { ...unresolvedReversalsOf(state), [grantId]: record },
        updatedAt: op.now,
      },
      true,
      "unresolved_reversal_recorded",
    );
  }
  const record: UnresolvedReversalRecord = {
    grantId,
    absence: op.absence,
    recordedAt: op.now,
    lastObservedAt: op.now,
  };
  return result(
    {
      ...state,
      unresolvedReversals: { ...unresolvedReversalsOf(state), [grantId]: record },
      updatedAt: op.now,
    },
    true,
    "unresolved_reversal_recorded",
  );
}

/** The live lease, treating an absent (pre-lease) field as free. */
export function currentAccountingLease(
  state: EntitlementAuthorityState,
): AccountingLease | null {
  return state.accountingLease ?? null;
}

function acquireAccountingLease(
  state: EntitlementAuthorityState,
  op: Extract<EntitlementAuthorityOp, { type: "acquire_accounting_lease" }>,
): EntitlementAuthorityApplyResult {
  if (
    typeof op.leaseId !== "string" ||
    op.leaseId.trim().length === 0 ||
    (op.kind !== "legacy_write" && op.kind !== "migration") ||
    !isNonNegativeInt(op.ttlMs) ||
    op.ttlMs <= 0
  ) {
    return refused(state, "invalid_lease");
  }
  // A legacy writer arriving after capture is not "busy" — it is fenced
  // for good: the authority owns this entitlement's accounting now.
  if (op.kind === "legacy_write" && state.baseline) {
    return refused(state, "already_migrated");
  }
  const held = currentAccountingLease(state);
  if (held && held.expiresAt > op.now && held.leaseId !== op.leaseId) {
    return refused(state, "lease_held");
  }
  const lease: AccountingLease = {
    leaseId: op.leaseId,
    kind: op.kind,
    expiresAt: op.now + op.ttlMs,
  };
  return result(
    { ...state, accountingLease: lease, updatedAt: op.now },
    true,
    "lease_acquired",
  );
}

/**
 * Seal: the holder's final act before committing its external (KV)
 * write. Succeeds only while the lease is held and unexpired, and
 * extends it by a fresh short TTL — so a holder that stalled past its
 * original TTL (and let migration take ownership) is refused here and
 * never writes, instead of landing a stale mutation after the baseline
 * captured (Codex P2, PR #367). A refused seal aborts the write; the
 * accounting stays exactly as it was before the holder began.
 */
function sealAccountingLease(
  state: EntitlementAuthorityState,
  op: Extract<EntitlementAuthorityOp, { type: "seal_accounting_lease" }>,
): EntitlementAuthorityApplyResult {
  if (!isNonNegativeInt(op.ttlMs) || op.ttlMs <= 0) {
    return refused(state, "invalid_lease");
  }
  const held = currentAccountingLease(state);
  if (!held || held.leaseId !== op.leaseId) {
    return refused(state, "lease_not_held");
  }
  if (held.expiresAt <= op.now) {
    return refused(state, "lease_expired");
  }
  return result(
    {
      ...state,
      accountingLease: { ...held, expiresAt: op.now + op.ttlMs },
      updatedAt: op.now,
    },
    true,
    "lease_sealed",
  );
}

function releaseAccountingLease(
  state: EntitlementAuthorityState,
  op: Extract<EntitlementAuthorityOp, { type: "release_accounting_lease" }>,
): EntitlementAuthorityApplyResult {
  const held = currentAccountingLease(state);
  if (held && held.leaseId === op.leaseId) {
    return result(
      { ...state, accountingLease: null, updatedAt: op.now },
      true,
      "lease_released",
    );
  }
  // Idempotent: releasing a lease you do not hold (expired, already
  // released, or another holder's) changes nothing and never fails —
  // cleanup paths must be safe to retry.
  return result(state, false, "lease_released");
}

function rotateCapability(
  state: EntitlementAuthorityState,
  op: Extract<EntitlementAuthorityOp, { type: "rotate_capability" }>,
): EntitlementAuthorityApplyResult {
  // Rotation must succeed even on a revoked record — killing outstanding
  // read capabilities matters most exactly then — so it is not validity
  // gated. The increment and the claim-token replacement are one operation
  // from the caller's perspective (overlap contract O4).
  return result(
    {
      ...state,
      capabilityGeneration: state.capabilityGeneration + 1,
      createdAt: state.createdAt ?? op.now,
      updatedAt: op.now,
    },
    true,
    "rotated",
  );
}

/**
 * Own-purchase grant (W1/W5). Three cases (DL-1 v3.7 §2.2/§2.4,
 * v3.8 §3):
 * - a snapshot exists → the purchase is INCLUDED BY CONSTRUCTION
 *   (the snapshotted record is this purchase's record): observation,
 *   zero fold effect — a delayed W1 never double-counts (T-C11).
 * - no snapshot, but positive D1-era provenance (the session was
 *   created at/after the activation record's D1-serving start) →
 *   authority_native: the grant IS the initialization, full effect.
 * - neither → birth_unresolved: the grant journals as
 *   grant_pending_birth with ZERO fold effect. A KV null is an
 *   observation, never a fact about the world; an unproven birth
 *   creates no spendable value.
 */
function purchaseGrant(
  state: EntitlementAuthorityState,
  op: Extract<EntitlementAuthorityOp, { type: "purchase_grant" }>,
): EntitlementAuthorityApplyResult {
  if (!isNonNegativeInt(op.amount) || op.amount <= 0) {
    return refused(state, "invalid_reward");
  }
  const grantId = state.sessionId;
  if (state.baseline || state.creationSnapshot) {
    const settled = settledInclusionsOf(state)[grantId];
    if (!settled) {
      const seq = nextSeq(state);
      // A birth pendency for this same identity may still stand
      // (the grant pended before the baseline arrived): recording
      // the by-construction inclusion RETIRES it in the same commit
      // (Codex re-gate F-C). Leaving both would persist a state the
      // validator's exactly-one-home rule rejects, wedging every
      // later read and mutation of the entitlement.
      const pendings = { ...pendingGrantsOf(state) };
      if (pendings[grantId]?.family === "own_purchase") {
        delete pendings[grantId];
      }
      return result(
        {
          ...state,
          pendingGrants: pendings,
          settledInclusions: {
            ...settledInclusionsOf(state),
            [grantId]: {
              grantId,
              amount: op.amount,
              settledAt: op.now,
              basis: "by_construction",
            },
          },
          journalHead: seq,
          updatedAt: op.now,
        },
        true,
        "already_included_in_opening",
      );
    }
    return result(state, false, "already_included_in_opening");
  }
  if ((state.foldedOwnGrantTotal ?? 0) > 0 || state.creationProvenance === "authority_native") {
    // Redelivery of an already-initialized native grant: dispatch to
    // the existing entry (idempotency) — never a second fold.
    return result(state, false, "reward_already_granted");
  }
  const pending = pendingGrantsOf(state)[grantId];
  if (pending) {
    // Prior-entry dispatch (v3.11 §2.2): the pendency is a state, not
    // a proof — redelivery joins it and changes nothing.
    return result(state, false, "grant_pending", null, 0, { pendingKind: pending.kind });
  }
  const eraProven =
    op.sessionCreatedAt !== null &&
    op.sessionCreatedAt !== undefined &&
    op.authorityEraStart !== null &&
    op.authorityEraStart !== undefined &&
    op.sessionCreatedAt >= op.authorityEraStart;
  if (eraProven) {
    const seq = nextSeq(state);
    return result(
      {
        ...state,
        foldedOwnGrantTotal: (state.foldedOwnGrantTotal ?? 0) + op.amount,
        creationProvenance: "authority_native",
        journalHead: seq,
        createdAt: state.createdAt ?? op.now,
        updatedAt: op.now,
      },
      true,
      "reward_granted",
    );
  }
  // birth_unresolved: pending, zero fold effect (v3.8 §3.2).
  const withProvenance: EntitlementAuthorityState = {
    ...state,
    creationProvenance: "birth_unresolved",
  };
  return journalPendingGrant(
    withProvenance,
    {
      grantId,
      kind: "birth",
      family: "own_purchase",
      amount: op.amount,
      presentedAt: op.now,
      presentingWriter: op.presentingWriter ?? null,
      terminalObligation: null,
    },
    op.now,
  );
}

/**
 * Installation (DL-1 v3.6 §§2.4/3; v3.7 §3.1 snapshot-only rule).
 * Reads the creation snapshot's stored figure and NOTHING else: the
 * evidence bundle must echo that figure (opening_not_from_snapshot),
 * and the attestation must name the CURRENT journal head
 * (attestation_head_mismatch — a resume signal, never a park). The
 * checkpoint's only monetary effect is replacing the opening figure:
 * position_after = O_v + F + S with the receipt itself carrying zero
 * fold effect. Access facts are the lane's CURRENT folded state,
 * merged per-field and unconditionally — they already live in this
 * state, so installation re-derives nothing about them.
 */
function recordCheckpoint(
  state: EntitlementAuthorityState,
  op: Extract<EntitlementAuthorityOp, { type: "record_checkpoint" }>,
): EntitlementAuthorityApplyResult {
  const snapshot = state.creationSnapshot ?? null;
  if (!state.baseline || !snapshot) return refused(state, "opening_underivable");
  if (state.creationProvenance === "birth_unresolved") {
    return refused(state, "opening_underivable");
  }
  if (op.attestedJournalHead !== journalHeadOf(state)) {
    return refused(state, "attestation_head_mismatch");
  }
  // The snapshot figure the opening derives from, in position units
  // (allowance − legacy spent). A bundle tracing to anything else —
  // a live record re-read, a projection without its watermark — is
  // refused: input (i) is the snapshot alone (v3.7 §3.1, T-C13).
  const snapshotOpening =
    snapshot.allowance !== null
      ? snapshot.allowance - (state.baseline?.legacySpentCount ?? 0)
      : null;
  if (snapshotOpening === null || op.snapshotFigureEcho !== snapshotOpening) {
    return refused(state, "opening_not_from_snapshot");
  }
  if (!isNonNegativeInt(op.verifiedOpening) && !Number.isInteger(op.verifiedOpening)) {
    return refused(state, "invalid_baseline");
  }
  const unverifiedOpening = snapshotOpening;
  const fold = derivePurchasedFold(state);
  const verifiedPosition = op.verifiedOpening + fold;
  const shortfall = verifiedPosition < 0 ? -verifiedPosition : 0;
  const receipt: OpeningVerificationReceipt = {
    unverifiedOpening,
    verifiedOpening: op.verifiedOpening,
    journalFoldAtInstall: fold,
    shortfallAbsorption: shortfall,
    attestedJournalHead: op.attestedJournalHead,
    installedAt: op.now,
  };
  const seq = nextSeq(state);
  return result(
    {
      ...state,
      verificationReceipt: receipt,
      installedOpeningBase: op.verifiedOpening + shortfall,
      journalHead: seq,
      updatedAt: op.now,
    },
    true,
    "checkpoint_recorded",
  );
}

/**
 * Settle a pending grant (DL-1 v3.7 §2.3; v3.8 §2.3; v3.11 §1.2).
 * - to `included`: retires as an observation — zero fold effect
 *   throughout; the value was inside the opening all along.
 * - to `excluded`: the grant CONFERS its amount in this settlement
 *   entry (it was never inside the opening). A pending entry
 *   carrying a terminal obligation settles excluded as the
 *   atomically born-reversed pair (v3.10 §5), its reversal receipt
 *   citing the terminal record from the obligation field.
 * Settlement to `included` requires an operator receipt, or the
 * late-snapshot by-construction path — and that path belongs to the
 * OWN-PURCHASE family only, under its snapshot conditions (a
 * baseline/creation snapshot standing, the same ground on which
 * purchase_grant observes by construction). A reward-family grant
 * settles included on an operator receipt or not at all; late
 * evidence alone settles only to `excluded` (v3.8 §2.3).
 * An included settlement preserves the pending entry's terminal
 * obligation on the settlement record (v3.10 §5): retiring the
 * pendency must not drop the lineage citation.
 */
function resolveGrantInclusion(
  state: EntitlementAuthorityState,
  op: Extract<EntitlementAuthorityOp, { type: "resolve_grant_inclusion" }>,
): EntitlementAuthorityApplyResult {
  const pending = pendingGrantsOf(state)[op.grantId];
  if (!pending) return refused(state, "unknown_reward_grant");
  if (pending.kind === "discovery" && !pending.discoveryRegistered) {
    // §5.1's invariant spends fold effect only when an association
    // was registered in or before the conferring op. A discovery
    // pendency exists BECAUSE its registration leg never completed;
    // until a redelivery dispatch records the leg's completion on
    // the entry, no settlement — to either classification — may
    // confer or retire its value: the evidence an operator presents
    // proves exclusion from the opening, not registration, and not
    // the absence of a terminal-negative record (Codex re-gate F-E).
    return refused(state, "discovery_registration_required");
  }
  if (op.classification === "included" && op.evidence !== "operator_receipt") {
    // The by-construction path is the own-purchase family's alone,
    // and only on its actual snapshot conditions (a baseline or
    // creation snapshot standing — purchase_grant's observation
    // ground). A reward-family identity has no by-construction
    // inclusion: without an operator receipt it stays unresolved,
    // and a late-finalizing witness by itself settles nothing to
    // `included` (v3.8 §2.3).
    const lateSnapshotConforms =
      op.evidence === "late_snapshot" &&
      pending.family === "own_purchase" &&
      Boolean(state.baseline || state.creationSnapshot);
    if (!lateSnapshotConforms) {
      return refused(state, "grant_inclusion_unresolved");
    }
  }
  const restPending = { ...pendingGrantsOf(state) };
  delete restPending[op.grantId];
  const base: EntitlementAuthorityState = {
    ...state,
    pendingGrants: restPending,
    updatedAt: op.now,
  };
  if (op.classification === "included") {
    const seq = nextSeq(base);
    return result(
      {
        ...base,
        settledInclusions: {
          ...settledInclusionsOf(base),
          [op.grantId]: {
            grantId: op.grantId,
            amount: pending.amount,
            settledAt: op.now,
            basis: op.evidence === "late_snapshot" ? "by_construction" : "operator_receipt",
            // The pending entry's terminal obligation survives its
            // retirement on the settlement record (v3.10 §5) — the
            // reconciliation citation is durable, not a pendency
            // ephemeron.
            terminalObligation: pending.terminalObligation ?? null,
          },
        },
        journalHead: seq,
      },
      true,
      "inclusion_settled",
    );
  }
  // Excluded: confer at settlement.
  if (pending.family === "own_purchase") {
    const seq = nextSeq(base);
    return result(
      {
        ...base,
        foldedOwnGrantTotal: (base.foldedOwnGrantTotal ?? 0) + pending.amount,
        creationProvenance:
          base.creationProvenance === "birth_unresolved"
            ? "authority_native"
            : base.creationProvenance,
        journalHead: seq,
      },
      true,
      "inclusion_settled",
    );
  }
  if (pending.terminalObligation) {
    const next = foldRewardGrantBornReversed(
      base,
      op.grantId,
      pending.amount,
      op.now,
      {
        lineageRef: pending.terminalObligation.lineageRef,
        recordedAt: pending.terminalObligation.recordedAt,
      },
    );
    return result(next, true, "inclusion_settled");
  }
  const next = foldRewardGrant(base, op.grantId, pending.amount, op.now);
  return result(next, true, "inclusion_settled");
}

export function applyEntitlementAuthorityOp(
  state: EntitlementAuthorityState,
  op: EntitlementAuthorityOp,
): EntitlementAuthorityApplyResult {
  switch (op.type) {
    case "sync_facts":
      return syncFacts(state, op);
    case "capture_baseline":
      return captureBaseline(state, op);
    case "commit":
      return commit(state, op);
    case "compensate_debit":
      return compensateDebit(state, op);
    case "purchase_grant":
      return purchaseGrant(state, op);
    case "record_checkpoint":
      return recordCheckpoint(state, op);
    case "resolve_grant_inclusion":
      return resolveGrantInclusion(state, op);
    case "grant":
      return grant(state, op);
    case "compensate":
      return compensate(state, op);
    case "rotate_capability":
      return rotateCapability(state, op);
    case "grant_reward":
      return grantReward(state, op);
    case "reverse_reward":
      return reverseReward(state, op);
    case "record_unresolved_reversal":
      return recordUnresolvedReversal(state, op);
    case "acquire_accounting_lease":
      return acquireAccountingLease(state, op);
    case "release_accounting_lease":
      return releaseAccountingLease(state, op);
    case "seal_accounting_lease":
      return sealAccountingLease(state, op);
    case "register_publication_intent":
      return registerPublicationIntent(state, op);
    case "finalize_publication":
      return finalizePublication(state, op);
    case "claim_archive_email_dispatch":
      return claimArchiveEmailDispatch(state, op);
    case "record_archive_email_dispatch":
      return recordArchiveEmailDispatch(state, op);
  }
}

/* ================= DL-1 Slice 4 publication machine (§5.4/§5.5) =================
 * The transaction is the DO's serialized apply over freshly read state
 * (§4): all external reads complete before apply, and the machine
 * arbitrates observations against persisted state presenter-independently.
 * Publication ops never touch accounting fields or journalHead (purity
 * fence, §5.3) and never use the AccountingLease (DRIFT-3). */

function sha256HexOfString(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function publicationArtifactId(
  sessionId: string,
  mapId: string,
  fingerprint: string,
  contractVersion: number,
  rendererVersion: number,
): string {
  return `hd1:${sessionId}:${mapId}:${fingerprint}:c${contractVersion}:r${rendererVersion}`;
}

function publicationStagingKey(intentId: string): string {
  return `download-archive/staging/${intentId}.png`;
}

/** §5.1 derivation, asserted over persisted state by validator rule 1:
 * dimensions are a pure function of the binding's aspectRatio. */
function publicationDimsForBinding(
  canonicalBinding: string,
): { expectedWidth: number; expectedHeight: number } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(canonicalBinding);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const aspect = parsed.aspectRatio;
  const ratio = aspect === "3:4" ? 3 / 4 : aspect === "2:3" ? 2 / 3 : aspect === "4:5" ? 4 / 5 : 1;
  return { expectedWidth: 6000, expectedHeight: Math.max(1, Math.round(6000 / ratio)) };
}

function pubIntentsOf(
  state: EntitlementAuthorityState,
): Record<string, PublicationIntent> {
  return state.publicationIntents ?? {};
}
function pubJoinsOf(
  state: EntitlementAuthorityState,
): Record<string, PublicationIntentJoin> {
  return state.publicationIntentJoins ?? {};
}
function pubRegistryOf(
  state: EntitlementAuthorityState,
): Record<string, ArtifactRegistryEntry> {
  return state.artifactRegistry ?? {};
}

/** §5.5 governance derivation: the intent named by the by-artifact pointer
 * governs IFF live at `now` (live iff now < expiresAt; at now === expiresAt
 * it is expired). An expired named intent governs nothing until a fresh
 * R7 registration overwrites the pointer. No retirement write exists. */
function governingPublicationIntent(
  state: EntitlementAuthorityState,
  artifactKey: string,
  now: number,
): PublicationIntent | null {
  const intentId = (state.publicationIntentByArtifact ?? {})[artifactKey];
  if (!intentId) return null;
  const intent = pubIntentsOf(state)[intentId];
  if (!intent || intent.artifactKey !== artifactKey) return null;
  return now < intent.expiresAt ? intent : null;
}

/** The artifactId's persisted binding over the full retained record set
 * (v3.1 A-2): registry entry, every retained intent live or expired,
 * every join record. Validator rule 6 asserts they are one string. */
function persistedPublicationBinding(
  state: EntitlementAuthorityState,
  artifactKey: string,
): string | null {
  const entry = pubRegistryOf(state)[artifactKey];
  if (entry) return entry.canonicalBinding;
  for (const intent of Object.values(pubIntentsOf(state))) {
    if (intent.artifactKey === artifactKey) return intent.canonicalBinding;
  }
  for (const join of Object.values(pubJoinsOf(state))) {
    if (join.artifactKey === artifactKey) return join.canonicalBinding;
  }
  return null;
}

function pubDetail(
  partial: Partial<PublicationApplyDetail>,
): PublicationApplyDetail {
  return {
    intentId: null,
    governingIntentId: null,
    generation: null,
    entry: null,
    claimGeneration: null,
    dispatched: false,
    ...partial,
  };
}

function pubRefused(
  state: EntitlementAuthorityState,
  refusal: EntitlementAuthorityRefusal,
  detail: Partial<PublicationApplyDetail> = {},
): EntitlementAuthorityApplyResult {
  return result(state, false, "refused", refusal, 0, {
    publication: pubDetail(detail),
  });
}

const PUBLICATION_INTENT_COMPARED_FIELDS = [
  "artifactKey",
  "sessionId",
  "mapId",
  "canonicalBinding",
  "fingerprint",
  "contractVersion",
  "rendererVersion",
  "digest",
  "stagingKey",
  "expectedWidth",
  "expectedHeight",
  "expiresAt",
] as const;

/** The fields a join record carries (§5.4: for a join record, the
 * comparison runs over the fields it carries — dimensions are NOT
 * carried; they are derived from the binding, clause V-6). */
const PUBLICATION_JOIN_CARRIED_FIELDS = [
  "artifactKey",
  "sessionId",
  "mapId",
  "canonicalBinding",
  "fingerprint",
  "contractVersion",
  "rendererVersion",
  "digest",
  "stagingKey",
  "expiresAt",
] as const;

function registerPublicationIntent(
  state: EntitlementAuthorityState,
  op: Extract<EntitlementAuthorityOp, { type: "register_publication_intent" }>,
): EntitlementAuthorityApplyResult {
  const presented = op.intent;
  // Validator rule 9's transition guard (clause V-5): the persisted
  // record's sessionId is the document's session, never a presented
  // value — a mismatch is refused before the table is evaluated.
  if (presented.sessionId !== state.sessionId) {
    return pubRefused(state, "identity_rejected");
  }
  // Clause V-6: dimensions are derived on every path from the presented
  // binding — never copied, never trusted from the presentation.
  const dims = publicationDimsForBinding(presented.canonicalBinding);
  if (
    !dims ||
    presented.expectedWidth !== dims.expectedWidth ||
    presented.expectedHeight !== dims.expectedHeight
  ) {
    return pubRefused(state, "intent_payload_conflict");
  }
  // The artifactKey must recompute from the identity components
  // (validator rule 1 is maintained at the door).
  if (
    presented.artifactKey !==
    publicationArtifactId(
      presented.sessionId,
      presented.mapId,
      presented.fingerprint,
      presented.contractVersion,
      presented.rendererVersion,
    )
  ) {
    return pubRefused(state, "intent_payload_conflict");
  }

  const intents = pubIntentsOf(state);
  const joins = pubJoinsOf(state);
  const registry = pubRegistryOf(state);
  const artifactKey = presented.artifactKey;

  // R0 — the collision scan, evaluated FIRST (v3.1 A-1): any persisted
  // record for this artifactId (entry, live governing intent, retained
  // expired/superseded intent, join record) holding a DIFFERENT canonical
  // binding classifies the presentation as a collision — before the
  // payload-comparison rows R2/JN2 and every terminal refusal.
  const entry = registry[artifactKey];
  if (entry && entry.canonicalBinding !== presented.canonicalBinding) {
    return pubRefused(state, "publication_conflict", { entry });
  }
  for (const intent of Object.values(intents)) {
    if (
      intent.artifactKey === artifactKey &&
      intent.canonicalBinding !== presented.canonicalBinding
    ) {
      return pubRefused(state, "publication_conflict", { entry: entry ?? null });
    }
  }
  for (const join of Object.values(joins)) {
    if (
      join.artifactKey === artifactKey &&
      join.canonicalBinding !== presented.canonicalBinding
    ) {
      return pubRefused(state, "publication_conflict", { entry: entry ?? null });
    }
  }

  let effective: PublicationIntentInput = presented;
  let fromJoin = false;
  const existingIntent = intents[presented.intentId];
  const existingJoin = joins[presented.intentId];
  if (existingIntent) {
    // R1 — immutable payload identical → idempotent replay.
    const identical = PUBLICATION_INTENT_COMPARED_FIELDS.every(
      (field) => presented[field] === existingIntent[field],
    );
    // Clause V-1 coexistence: after a JN1→R7 promotion the descriptorId
    // owns BOTH the retained join record and the promoted intent, whose
    // expiresAt is machine-stamped (V-2 as corrected by W-1) rather than
    // copied from the record. A presentation identical to the JOIN
    // record on every carried field is the same replay — the stamp is
    // the one designed divergence, never a payload conflict.
    const identicalToJoin =
      existingJoin !== undefined &&
      PUBLICATION_JOIN_CARRIED_FIELDS.every(
        (field) => presented[field] === existingJoin[field],
      );
    if (identical || identicalToJoin) {
      return result(state, false, "publication_intent_recorded", null, 0, {
        publication: pubDetail({
          intentId: existingIntent.intentId,
          generation: existingIntent.generation,
        }),
      });
    }
    // R2 — payload differs (R0 did not fire: the divergence is in a
    // non-binding compared field).
    return pubRefused(state, "intent_payload_conflict");
  }
  if (existingJoin) {
    const identical = PUBLICATION_JOIN_CARRIED_FIELDS.every(
      (field) => presented[field] === existingJoin[field],
    );
    // JN2 — the descriptor is permanently bound to its recorded payload.
    if (!identical) return pubRefused(state, "intent_payload_conflict");
    // JN1 — proceed to rows R3–R7 with the RECORDED payload (R0 has
    // already been evaluated and did not fire; R1/R2 do not apply).
    fromJoin = true;
    const joinDims = publicationDimsForBinding(existingJoin.canonicalBinding);
    if (!joinDims) return pubRefused(state, "intent_payload_conflict");
    effective = {
      intentId: existingJoin.intentId,
      artifactKey: existingJoin.artifactKey,
      sessionId: existingJoin.sessionId,
      mapId: existingJoin.mapId,
      canonicalBinding: existingJoin.canonicalBinding,
      fingerprint: existingJoin.fingerprint,
      contractVersion: existingJoin.contractVersion,
      rendererVersion: existingJoin.rendererVersion,
      digest: existingJoin.digest,
      stagingKey: existingJoin.stagingKey,
      expectedWidth: joinDims.expectedWidth,
      expectedHeight: joinDims.expectedHeight,
      expiresAt: existingJoin.expiresAt,
    };
  }

  // R3 / R4 — terminal registry entry (R0 did not fire).
  if (entry) {
    if (entry.state === "finalized") {
      return pubRefused(state, "already_finalized", { entry });
    }
    return pubRefused(state, "publication_conflict", { entry });
  }

  const governing = governingPublicationIntent(state, artifactKey, op.now);
  if (governing) {
    // R5 — live governing intent, same binding, DIFFERENT digest: the
    // contender is refused at admission; no registry write.
    if (governing.digest !== effective.digest) {
      return pubRefused(state, "publication_conflict");
    }
    // R6 — same digest: persist the join record under the presented
    // intentId; no new intent. (JN1→R6: the record already persists
    // identically — a no-op carrying the current governing pair, and
    // the canonical pointer is unmoved, P-3/P-4.)
    if (fromJoin) {
      return result(state, false, "publication_intent_joined", null, 0, {
        publication: pubDetail({
          intentId: governing.intentId,
          governingIntentId: governing.intentId,
          generation: governing.generation,
        }),
      });
    }
    const join: PublicationIntentJoin = {
      intentId: presented.intentId,
      governingIntentId: governing.intentId,
      artifactKey: effective.artifactKey,
      sessionId: effective.sessionId,
      mapId: effective.mapId,
      canonicalBinding: effective.canonicalBinding,
      fingerprint: effective.fingerprint,
      contractVersion: effective.contractVersion,
      rendererVersion: effective.rendererVersion,
      digest: effective.digest,
      stagingKey: effective.stagingKey,
      expiresAt: presented.expiresAt,
      joinedAt: op.now,
    };
    const next: EntitlementAuthorityState = {
      ...state,
      publicationIntentJoins: { ...joins, [join.intentId]: join },
      updatedAt: op.now,
    };
    return result(next, true, "publication_intent_joined", null, 0, {
      publication: pubDetail({
        intentId: governing.intentId,
        governingIntentId: governing.intentId,
        generation: governing.generation,
      }),
    });
  }

  // R7 — no live governing intent. Expiry sourcing (§5.4 as amended by
  // V-2/W-1): descriptor-form first registration presents the
  // descriptor's signed expiresAt; the fused form is route-stamped
  // issuedAt + TTL; a JN1→R7 promotion is MACHINE-STAMPED
  // now + DESCRIPTOR_TTL_MS and never copies the join record's expiry.
  const effectiveExpiresAt = fromJoin ? op.now + DESCRIPTOR_TTL_MS : effective.expiresAt;
  // R7 guard (defence in depth, W-1.4): never persist an intent that is
  // non-governing at its own creation, and never burn a generation on one.
  if (!(effectiveExpiresAt > op.now)) {
    return pubRefused(state, "identity_rejected");
  }
  const generations = state.publicationGenerations ?? {};
  const generation = (generations[artifactKey] ?? 0) + 1;
  const intent: PublicationIntent = {
    ...effective,
    createdAt: op.now,
    expiresAt: effectiveExpiresAt,
    generation,
  };
  const next: EntitlementAuthorityState = {
    ...state,
    publicationIntents: { ...intents, [intent.intentId]: intent },
    publicationIntentByArtifact: {
      ...(state.publicationIntentByArtifact ?? {}),
      [artifactKey]: intent.intentId,
    },
    publicationGenerations: { ...generations, [artifactKey]: generation },
    // P-3: ONLY R7 moves the canonical pointer, atomically with intent
    // creation (JN1→R7 likewise).
    canonicalArtifactByMap: {
      ...(state.canonicalArtifactByMap ?? {}),
      [intent.mapId]: intent.artifactKey,
    },
    updatedAt: op.now,
  };
  return result(next, true, "publication_intent_recorded", null, 0, {
    publication: pubDetail({ intentId: intent.intentId, generation }),
  });
}

/** F1/F2 evidence append with V-11.3 saturation semantics. */
function appendIntegrityAlert(
  entry: ArtifactRegistryEntry,
  alert: Record<string, unknown>,
): { entry: ArtifactRegistryEntry; changed: boolean } {
  if (entry.integrityAlerts.length < 8) {
    return {
      entry: { ...entry, integrityAlerts: [...entry.integrityAlerts, alert] },
      changed: true,
    };
  }
  if (!entry.integrityAlertsSaturated) {
    // The append is dropped, the existing eight retained verbatim, and
    // saturation itself is the durable signal — reported changed once.
    return { entry: { ...entry, integrityAlertsSaturated: true }, changed: true };
  }
  return { entry, changed: false };
}

function finalizePublication(
  state: EntitlementAuthorityState,
  op: Extract<EntitlementAuthorityOp, { type: "finalize_publication" }>,
): EntitlementAuthorityApplyResult {
  const registry = pubRegistryOf(state);
  const entry = registry[op.artifactKey];

  // §5.5 presented-binding comparison (v3.1 A-2), computed BEFORE the
  // digest determination whenever a binding string is presented: the
  // target is the artifactId's persisted binding over the full record
  // set (retained expired intents and join records included). A
  // divergence is a collision refusal with no state change — in every
  // governance configuration, the retained-expired-only case included.
  // An absent string performs no comparison; an empty record set makes
  // it vacuous.
  if (op.presentedBinding !== undefined && op.presentedBinding !== null) {
    const persisted = persistedPublicationBinding(state, op.artifactKey);
    if (persisted !== null && persisted !== op.presentedBinding) {
      return pubRefused(state, "publication_conflict", { entry: entry ?? null });
    }
  }

  const governing = governingPublicationIntent(state, op.artifactKey, op.now);

  /* Digest determination (§5.5): exactly one per finalize call.
   * Trusted digest sources, in precedence: (a) bodyVerifiedDigest (the
   * body is ground truth and outranks metadata); (b) finalMetadata.digest
   * when the metadata is TRUSTED — protocol marker + artifactKey +
   * bindingDigest === SHA-256 of the persisted canonicalBinding.
   * Metadata failing any check is foreign/corrupt and supplies no digest,
   * ever: it can manufacture neither a finalization nor a conflict. */
  const obs = op.observation;
  const trustBinding = entry?.canonicalBinding ?? governing?.canonicalBinding ?? null;
  const metadata = obs.finalObjectPresent ? obs.finalMetadata : null;
  const metadataTrusted =
    metadata !== null &&
    trustBinding !== null &&
    metadata.protocol === ARCHIVE_PROTOCOL_MARKER &&
    metadata.artifactKey === op.artifactKey &&
    metadata.bindingDigest === sha256HexOfString(trustBinding);
  type Determination =
    | { kind: "absent" }
    | { kind: "trusted"; digest: string; source: "body" | "metadata" }
    | { kind: "undetermined" };
  let determination: Determination;
  if (!obs.finalObjectPresent) {
    determination = { kind: "absent" };
  } else if (obs.bodyVerifiedDigest) {
    determination = { kind: "trusted", digest: obs.bodyVerifiedDigest, source: "body" };
  } else if (metadataTrusted && metadata) {
    determination = { kind: "trusted", digest: metadata.digest, source: "metadata" };
  } else {
    determination = { kind: "undetermined" };
  }
  // Metadata-discrepancy flag: body hash exists, metadata is trusted,
  // and the two digests differ — the trusted digest is the body hash and
  // the divergence is recorded as metadata-integrity evidence on every
  // row that appends evidence.
  const metadataDiscrepancy =
    obs.bodyVerifiedDigest !== null &&
    metadataTrusted &&
    metadata !== null &&
    metadata.digest !== obs.bodyVerifiedDigest;

  if (entry) {
    if (entry.state === "conflicted") {
      // F4 — idempotent.
      return result(state, false, "publication_conflicted", null, 0, {
        publication: pubDetail({ entry }),
      });
    }
    // Entry finalized (F1–F3): the winner is never displaced.
    if (determination.kind !== "trusted") {
      // F3 — absence/inconclusiveness is not positive contradictory
      // evidence: no alert is appended.
      return result(state, false, "publication_already_finalized", null, 0, {
        publication: pubDetail({ entry }),
      });
    }
    if (determination.digest === entry.digest && !metadataDiscrepancy) {
      // F1 (clean) — no-op.
      return result(state, false, "publication_already_finalized", null, 0, {
        publication: pubDetail({ entry }),
      });
    }
    // F1-discrepancy (body agrees, trusted metadata names a different
    // digest) or F2 (trusted digest differs): append the evidence;
    // entry identity/digest/state unchanged.
    const alert: Record<string, unknown> =
      determination.digest === entry.digest
        ? {
            kind: "metadata_discrepancy",
            entryDigest: entry.digest,
            metadataDigest: metadata?.digest ?? null,
            bodyVerifiedDigest: obs.bodyVerifiedDigest,
            observedAt: op.now,
          }
        : {
            kind: "digest_contradiction",
            entryDigest: entry.digest,
            observedDigest: determination.digest,
            source: determination.source,
            metadataDiscrepancy,
            observedAt: op.now,
          };
    const appended = appendIntegrityAlert(entry, alert);
    if (!appended.changed) {
      return result(state, false, "publication_already_finalized", null, 0, {
        publication: pubDetail({ entry }),
      });
    }
    const next: EntitlementAuthorityState = {
      ...state,
      artifactRegistry: { ...registry, [entry.artifactKey]: appended.entry },
      updatedAt: op.now,
    };
    return result(next, true, "publication_already_finalized", null, 0, {
      publication: pubDetail({ entry: appended.entry }),
    });
  }

  // No entry: an expired intent can never finalize anything — every
  // entry-writing row below requires a LIVE governing intent.
  if (!governing) {
    // F5 — retryable; the stored object waits, unfinalized and unharmed.
    return pubRefused(state, "finalization_pending");
  }
  if (determination.kind !== "trusted") {
    // F8 — absent or undeterminable: never guessed in either direction.
    return pubRefused(state, "finalization_pending");
  }
  const byArtifact = { ...(state.publicationIntentByArtifact ?? {}) };
  delete byArtifact[op.artifactKey];
  if (determination.digest === governing.digest) {
    // F6 — write the finalized entry (identity + dimensions copied from
    // the governing intent); the durable email record opens "pending"
    // atomically with the entry (§5.9).
    const newEntry: ArtifactRegistryEntry = {
      artifactKey: governing.artifactKey,
      sessionId: governing.sessionId,
      mapId: governing.mapId,
      canonicalBinding: governing.canonicalBinding,
      fingerprint: governing.fingerprint,
      contractVersion: governing.contractVersion,
      rendererVersion: governing.rendererVersion,
      digest: governing.digest,
      expectedWidth: governing.expectedWidth,
      expectedHeight: governing.expectedHeight,
      state: "finalized",
      finalizedAt: op.now,
      conflictEvidence: null,
      archiveEmail: {
        state: "pending",
        claimedAt: null,
        dispatchedAt: null,
        claimGeneration: 0,
      },
      integrityAlerts: [],
    };
    const next: EntitlementAuthorityState = {
      ...state,
      artifactRegistry: { ...registry, [op.artifactKey]: newEntry },
      publicationIntentByArtifact: byArtifact,
      updatedAt: op.now,
    };
    return result(next, true, "publication_finalized", null, 0, {
      publication: pubDetail({
        intentId: governing.intentId,
        governingIntentId: governing.intentId,
        generation: governing.generation,
        entry: newEntry,
      }),
    });
  }
  // F7 — trusted digest differs from the governing digest: write the
  // conflicted entry with full evidence; the identity is terminal and
  // recovery is the support path. (Presenter-independent: a stale pair
  // presenting this state produces exactly this row — clause V-3.)
  const conflictedEntry: ArtifactRegistryEntry = {
    artifactKey: governing.artifactKey,
    sessionId: governing.sessionId,
    mapId: governing.mapId,
    canonicalBinding: governing.canonicalBinding,
    fingerprint: governing.fingerprint,
    contractVersion: governing.contractVersion,
    rendererVersion: governing.rendererVersion,
    digest: governing.digest,
    expectedWidth: governing.expectedWidth,
    expectedHeight: governing.expectedHeight,
    state: "conflicted",
    finalizedAt: null,
    conflictEvidence: {
      governingIntentId: governing.intentId,
      generation: governing.generation,
      governingDigest: governing.digest,
      observedDigest: determination.digest,
      source: determination.source,
      metadataDiscrepancy,
    },
    archiveEmail: {
      state: "pending",
      claimedAt: null,
      dispatchedAt: null,
      claimGeneration: 0,
    },
    integrityAlerts: [],
  };
  const next: EntitlementAuthorityState = {
    ...state,
    artifactRegistry: { ...registry, [op.artifactKey]: conflictedEntry },
    publicationIntentByArtifact: byArtifact,
    updatedAt: op.now,
  };
  return result(next, true, "publication_conflicted", null, 0, {
    publication: pubDetail({
      intentId: governing.intentId,
      governingIntentId: governing.intentId,
      generation: governing.generation,
      entry: conflictedEntry,
    }),
  });
}

function claimArchiveEmailDispatch(
  state: EntitlementAuthorityState,
  op: Extract<EntitlementAuthorityOp, { type: "claim_archive_email_dispatch" }>,
): EntitlementAuthorityApplyResult {
  const registry = pubRegistryOf(state);
  const entry = registry[op.artifactKey];
  if (!entry || entry.state !== "finalized") {
    return pubRefused(state, "not_finalized");
  }
  const email = entry.archiveEmail;
  if (email.state === "dispatched") {
    // Idempotent receipt carrying the dispatched fact (clause V-10
    // caller rule): an outcome a driver must NOT send on.
    return result(state, false, "archive_email_claimed", null, 0, {
      publication: pubDetail({
        entry,
        claimGeneration: email.claimGeneration,
        dispatched: true,
      }),
    });
  }
  if (email.state === "claimed") {
    // Lease live iff now - claimedAt < DISPATCH_CLAIM_LEASE_MS.
    const leaseLive =
      email.claimedAt !== null && op.now - email.claimedAt < DISPATCH_CLAIM_LEASE_MS;
    if (leaseLive) return pubRefused(state, "archive_email_already_claimed");
    // Lease expired: re-claim (the previous holder is presumed dead),
    // incrementing the claim generation (V-10).
  }
  const claimGeneration = email.claimGeneration + 1;
  const nextEntry: ArtifactRegistryEntry = {
    ...entry,
    archiveEmail: {
      state: "claimed",
      claimedAt: op.now,
      dispatchedAt: null,
      claimGeneration,
    },
  };
  const next: EntitlementAuthorityState = {
    ...state,
    artifactRegistry: { ...registry, [op.artifactKey]: nextEntry },
    updatedAt: op.now,
  };
  return result(next, true, "archive_email_claimed", null, 0, {
    publication: pubDetail({ entry: nextEntry, claimGeneration, dispatched: false }),
  });
}

function recordArchiveEmailDispatch(
  state: EntitlementAuthorityState,
  op: Extract<EntitlementAuthorityOp, { type: "record_archive_email_dispatch" }>,
): EntitlementAuthorityApplyResult {
  const registry = pubRegistryOf(state);
  const entry = registry[op.artifactKey];
  if (!entry || entry.state !== "finalized") {
    return pubRefused(state, "not_finalized");
  }
  const email = entry.archiveEmail;
  if (email.state === "dispatched") {
    return result(state, false, "archive_email_dispatch_recorded", null, 0, {
      publication: pubDetail({
        entry,
        claimGeneration: email.claimGeneration,
        dispatched: true,
      }),
    });
  }
  if (email.state === "pending") {
    // A record can never substitute for a send that bypassed the claim.
    return pubRefused(state, "archive_email_not_claimed");
  }
  // Generation fencing (clause V-10): a stale (less-than) generation's
  // record may not mark another holder's claim; a greater-than
  // generation is presentable by no honest caller and is refused
  // identically.
  if (op.claimGeneration !== email.claimGeneration) {
    return pubRefused(state, "archive_email_claim_stale");
  }
  const nextEntry: ArtifactRegistryEntry = {
    ...entry,
    archiveEmail: {
      state: "dispatched",
      claimedAt: email.claimedAt,
      dispatchedAt: op.now,
      claimGeneration: email.claimGeneration,
    },
  };
  const next: EntitlementAuthorityState = {
    ...state,
    artifactRegistry: { ...registry, [op.artifactKey]: nextEntry },
    updatedAt: op.now,
  };
  return result(next, true, "archive_email_dispatch_recorded", null, 0, {
    publication: pubDetail({
      entry: nextEntry,
      claimGeneration: email.claimGeneration,
      dispatched: true,
    }),
  });
}

/** Non-authoritative display projection of the authority state (v3.5 §6.3:
 *  `creditsRemaining` is a derived value wherever displayed). */
export type EntitlementAuthorityProjection = {
  sessionId: string;
  plan: CheckoutPlan | null;
  creditsRemaining: number | null;
  /** Purchased-side remainder only (excludes the reward bucket). */
  purchasedCreditsRemaining: number | null;
  /** Unspent referral reward-bucket credits (R1-A). */
  rewardCreditsRemaining: number;
  ownedArtifactIds: string[];
  recoveryDecision: RecoveryDecision;
  capabilityGeneration: number;
  updatedAt: number | null;
  /**
   * The publisher's inclusion watermark (DL-1 v3.6 §2.3 input (ii)):
   * the journal head at publish time, recorded IN the image. A
   * verifier may normalize a projection image only against journal
   * identities at or below this watermark; an image without a
   * verifiable watermark is refused (projection_unwatermarked) and
   * the verifier falls back to the creation snapshot.
   */
  includedThroughSeq: number;
  /** Diagnostics only (v3.5 §6.3): the journal head at publish time. */
  authorityStateVersion: number;
};

export function buildEntitlementAuthorityProjection(
  state: EntitlementAuthorityState,
): EntitlementAuthorityProjection {
  return {
    sessionId: state.sessionId,
    plan: effectivePlan(state),
    creditsRemaining: deriveRemainingAllowance(state),
    purchasedCreditsRemaining: derivePurchasedRemainingAllowance(state),
    rewardCreditsRemaining: state.rewardBucketBalance,
    ownedArtifactIds: Object.keys(state.ownedFiles).sort(),
    recoveryDecision: state.recoveryDecision,
    capabilityGeneration: state.capabilityGeneration,
    updatedAt: state.updatedAt,
    includedThroughSeq: journalHeadOf(state),
    authorityStateVersion: journalHeadOf(state),
  };
}
