/**
 * Pure ledger state machine for ONE DL-1 entitlement authority, keyed by
 * Stripe checkout session id. Used by the SQLite Durable Object
 * (EntitlementAuthorityDO) and by deterministic unit tests.
 *
 * Why a Durable Object and not KV (DL-1 v3 §2.2, P1-1): KV read-modify-write
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
 * No expiry (David, 2026-10-22; v3.1 §A not-adopted branch): entitlements do
 * NOT expire with age — the proposed 180-day-from-issuance cutoff was
 * rejected, so this state deliberately carries no entitlement expiry.
 * Credentials (claim tokens, read capabilities) still expire and rotate;
 * `capabilityGeneration` is the counter delivery checks against, and
 * rotation increments it atomically here so previously issued read
 * capabilities die with the rotation (v3 §2.3, overlap contract O4).
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
import type { CheckoutPlan } from "@/lib/pricing";

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
 * One-time migration baseline (DL-1 v3 §2.6). The SHAPE is defined here;
 * Slice 3 populates it from the settled legacy record (fenced capture,
 * fail-closed on ambiguity). The baseline records established access terms
 * as evidence — it never synthesises an expiry boundary from claim-token
 * expiry and never resets an established term (v3.1 §A).
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
};

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
};

/** The mutually exclusive legacy recovery decision (v3 §2.6). */
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
 */
export type AccountingLease = {
  leaseId: string;
  kind: "legacy_write" | "migration";
  expiresAt: number;
};

export type EntitlementAuthorityState = {
  sessionId: string;
  facts: EntitlementFacts | null;
  baseline: EntitlementBaseline | null;
  /**
   * Successful compensations performed against the baseline BY THIS
   * authority (formula input, v3 §2.6). A compensation already reflected in
   * the settled legacy record at capture time is NOT counted here — the
   * baseline's spent count is already net of it.
   */
  baselineCompensationCount: number;
  /** Token whose baseline consume this authority compensated, if any. */
  compensatedConsumeToken: string | null;
  ownedFiles: Record<string, OwnedFileEntry>;
  recoveryDecision: RecoveryDecision;
  /** Incremented atomically on every claim-token rotation (v3 §2.3). */
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
};

/** Finite plan allowances (v3 §2.2): single = 1 file, pack3 = 3 files. */
export const PLAN_ALLOWANCE: Record<Exclude<CheckoutPlan, "subscription">, number> = {
  single: 1,
  pack3: 3,
};

/** Legacy compensate window, widened from 15 minutes (v3 §2.4). */
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
  };
}

/**
 * Access check 1 (v3 §2.6): entitlement validity, evaluated against the
 * record as given. Revocation (affirmative termination) and subscription
 * lapse (neutral, paid period ended) are DISTINCT reasons (v3.1 §A);
 * neither is inferred from an expired credential. There is deliberately no
 * age-based expiry (David's no-expiry decision, v3.1 §A).
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
 *  again (v3 §2.6). */
export function countPaidCommits(state: EntitlementAuthorityState): number {
  let count = 0;
  for (const entry of Object.values(state.ownedFiles)) {
    if (entry.source === "commit") count += 1;
  }
  return count;
}

/**
 * The purchased-side remainder (v3 §2.6 formula):
 *   purchased = allowance − baseline legacy spent
 *             + successful baseline compensations − new paid commit count
 * Reward-bucket credits spent by commits are NOT subtracted here: the
 * commit count includes reward-funded commits, but their cost is carried
 * by `rewardSpentTotal` — subtracting them from the purchased side too
 * would double-count. Equivalently: total remaining (below) counts each
 * commit once, against whichever bucket funded it.
 * Returns null for an active subscription (unlimited while active) and 0
 * when no entitlement facts exist. Never negative.
 */
export function derivePurchasedRemainingAllowance(
  state: EntitlementAuthorityState,
): number | null {
  const plan = effectivePlan(state);
  if (plan === "subscription") {
    return state.facts?.subscriptionActive ? null : 0;
  }
  if (!plan) return 0;
  const allowance = state.baseline?.allowance ?? PLAN_ALLOWANCE[plan];
  const legacySpent = state.baseline?.legacySpentCount ?? 0;
  const purchasedFundedCommits = countPaidCommits(state) - state.rewardSpentTotal;
  const remaining =
    allowance - legacySpent + state.baselineCompensationCount - purchasedFundedCommits;
  return Math.max(0, remaining);
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
 * Access check 2 (v3 §2.6): delivery eligibility for an owned artifact —
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
  | { type: "capture_baseline"; baseline: EntitlementBaseline; now: number }
  | {
      type: "commit";
      artifactId: string;
      mapId: string;
      fingerprint: string;
      /** Artifact durably finalized (Slice 4 registry fact, passed in). */
      finalized: boolean;
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
      now: number;
    }
  | {
      type: "reverse_reward";
      /** The grant id being reversed (same id domain as grant_reward). */
      grantId: string;
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
  | "lease_not_held";

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
   * (the webhook) record this as the reclaimed amount.
   */
  rewardClawed: number;
};

function result(
  state: EntitlementAuthorityState,
  changed: boolean,
  outcome: EntitlementAuthorityOutcome,
  refusal: EntitlementAuthorityRefusal | null = null,
  rewardClawed = 0,
): EntitlementAuthorityApplyResult {
  return {
    state,
    changed,
    outcome,
    refusal,
    creditsRemaining: deriveRemainingAllowance(state),
    rewardClawed,
  };
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
  // Bucket spend is carried by commit entries: the spent total can never
  // exceed the number of reward-funded commits actually in the ledger.
  let rewardFundedCommits = 0;
  for (const entry of Object.values(state.ownedFiles)) {
    if (isRecord(entry) && entry.rewardFunded === true) rewardFundedCommits += 1;
  }
  if (state.rewardSpentTotal !== rewardFundedCommits) return false;
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
  // resets it or restores spent credits (v3 §2.6, §3.2). Slice 3 adds the
  // migration trigger and writer fencing around this op.
  if (state.baseline) {
    return result(state, false, "baseline_already_captured");
  }
  if (!isValidEntitlementBaseline(op.baseline)) {
    return refused(state, "invalid_baseline");
  }
  const baseline = { ...op.baseline };
  let { recoveryDecision, compensatedConsumeToken } = state;
  // A consume already compensated in the settled legacy record is marked
  // compensated at capture: it can never receive a grant (v3 §2.6). Its
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
  return result(
    {
      ...state,
      baseline,
      recoveryDecision,
      compensatedConsumeToken,
      createdAt: state.createdAt ?? op.now,
      updatedAt: op.now,
    },
    true,
    "baseline_captured",
  );
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
  // (v3 §2.2, §3.1(viii)): no durable finalization, no debit path.
  if (!op.finalized) return refused(state, "not_finalized");

  const remaining = deriveRemainingAllowance(state);
  if (remaining !== null && remaining <= 0) return refused(state, "no_credits");

  // Reward-first funding (R1-A): on a finite plan the commit is funded
  // from the reward bucket while it has an unspent credit, so a later
  // referral clawback finds the reward already spent and can never reach
  // purchased value. A subscription commit is unlimited and never touches
  // the bucket (subscription entitlements hold no bucket credits — grants
  // refuse them — so the bucket is always empty here in practice).
  const plan = effectivePlan(state);
  const rewardFunded = plan !== "subscription" && state.rewardBucketBalance > 0;
  const entry: OwnedFileEntry = {
    mapId: op.mapId,
    fingerprint: op.fingerprint,
    committedAt: op.now,
    source: "commit",
    rewardFunded,
  };
  return result(
    {
      ...state,
      ownedFiles: { ...state.ownedFiles, [op.artifactId]: entry },
      rewardBucketBalance: rewardFunded
        ? state.rewardBucketBalance - 1
        : state.rewardBucketBalance,
      rewardSpentTotal: rewardFunded
        ? state.rewardSpentTotal + 1
        : state.rewardSpentTotal,
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

  // Grant and compensate are mutually exclusive (v3 §2.6): a compensated
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
  // Records lacking a mapId fall back to support (v3 §2.6) — the authority
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
    return result(
      { ...state, recoveryDecision: "granted", updatedAt: op.now },
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
  return result(
    {
      ...state,
      ownedFiles: { ...state.ownedFiles, [op.artifactId]: entry },
      recoveryDecision: "granted",
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
  // the decision. It NEVER removes a ledger entry (v3 §2.4, §3.1(vi)).
  return result(
    {
      ...state,
      recoveryDecision: "compensated",
      compensatedConsumeToken: op.consumeToken,
      baselineCompensationCount: state.baselineCompensationCount + 1,
      updatedAt: op.now,
    },
    true,
    "compensated",
  );
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
  // Idempotent replay: the same grant id with the same amount is the same
  // webhook event redelivered — no double grant. The same id with a
  // DIFFERENT amount is a conflicting fact and fails closed.
  const existing = state.rewardGrants[op.grantId];
  if (existing) {
    if (existing.amount !== op.amount) return refused(state, "invalid_reward");
    return result(state, false, "reward_already_granted");
  }
  const invalid = validityRefusal(state);
  if (invalid) return invalid;
  // Matches the legacy writer (W13): subscription referrers receive no
  // finite reward credit — an unlimited plan has no bucket to hold one.
  if (effectivePlan(state) === "subscription") {
    return refused(state, "subscription_plan");
  }
  const grant: RewardGrantEntry = {
    amount: op.amount,
    grantedAt: op.now,
    clawedAmount: 0,
    reversed: false,
  };
  return result(
    {
      ...state,
      rewardGrants: { ...state.rewardGrants, [op.grantId]: grant },
      rewardBucketBalance: state.rewardBucketBalance + op.amount,
      rewardGrantedTotal: state.rewardGrantedTotal + op.amount,
      createdAt: state.createdAt ?? op.now,
      updatedAt: op.now,
    },
    true,
    "reward_granted",
  );
}

function reverseReward(
  state: EntitlementAuthorityState,
  op: Extract<EntitlementAuthorityOp, { type: "reverse_reward" }>,
): EntitlementAuthorityApplyResult {
  const grant =
    typeof op.grantId === "string" ? state.rewardGrants[op.grantId] : undefined;
  if (!grant) return refused(state, "unknown_reward_grant");
  if (grant.reversed) {
    return result(state, false, "reward_reversal_already_applied");
  }
  // R1-A clawback bound — the entire point of the separate bucket: a
  // reversal removes at most this grant's still-unreversed amount, and
  // only from the UNSPENT bucket. What the bucket no longer holds (spent
  // on files, or clawed by an earlier reversal) is never collected from
  // purchased credits, owned files are never removed, and no negative
  // balance/debt is created. Deliberately NOT validity-gated: a reversal
  // only ever shrinks the bucket, and gating it (e.g. on the referrer's
  // own later revocation) could strand a reversal the ledger owes.
  const clawed = Math.min(grant.amount - grant.clawedAmount, state.rewardBucketBalance);
  return result(
    {
      ...state,
      rewardGrants: {
        ...state.rewardGrants,
        [op.grantId]: { ...grant, clawedAmount: grant.clawedAmount + clawed, reversed: true },
      },
      rewardBucketBalance: state.rewardBucketBalance - clawed,
      rewardClawedTotal: state.rewardClawedTotal + clawed,
      updatedAt: op.now,
    },
    true,
    "reward_reversed",
    null,
    clawed,
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
    case "acquire_accounting_lease":
      return acquireAccountingLease(state, op);
    case "release_accounting_lease":
      return releaseAccountingLease(state, op);
    case "seal_accounting_lease":
      return sealAccountingLease(state, op);
  }
}

/** Non-authoritative display projection of the authority state (v3 §2.2:
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
  };
}
