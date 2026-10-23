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
};

/** The mutually exclusive legacy recovery decision (v3 §2.6). */
export type RecoveryDecision = "unresolved" | "granted" | "compensated";

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
 * Derived remaining allowance (v3 §2.6 formula):
 *   remaining = allowance − baseline legacy spent
 *             + successful baseline compensations − new paid commit count
 * Returns null for an active subscription (unlimited while active) and 0
 * when no entitlement facts exist. Never negative.
 */
export function deriveRemainingAllowance(state: EntitlementAuthorityState): number | null {
  const plan = effectivePlan(state);
  if (plan === "subscription") {
    return state.facts?.subscriptionActive ? null : 0;
  }
  if (!plan) return 0;
  const allowance = state.baseline?.allowance ?? PLAN_ALLOWANCE[plan];
  const legacySpent = state.baseline?.legacySpentCount ?? 0;
  const remaining =
    allowance - legacySpent + state.baselineCompensationCount - countPaidCommits(state);
  return Math.max(0, remaining);
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
  | { type: "rotate_capability"; now: number };

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
  | "window_expired";

export type EntitlementAuthorityApplyResult = {
  state: EntitlementAuthorityState;
  changed: boolean;
  outcome: EntitlementAuthorityOutcome;
  /** Set iff outcome === "refused". */
  refusal: EntitlementAuthorityRefusal | null;
  /** Derived remaining allowance after the op (null = unlimited). */
  creditsRemaining: number | null;
};

function result(
  state: EntitlementAuthorityState,
  changed: boolean,
  outcome: EntitlementAuthorityOutcome,
  refusal: EntitlementAuthorityRefusal | null = null,
): EntitlementAuthorityApplyResult {
  return {
    state,
    changed,
    outcome,
    refusal,
    creditsRemaining: deriveRemainingAllowance(state),
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
    // Cross-field recovery consistency (G-dot + Codex P2 round 2, PR #362):
    // the compensation counter, the recorded compensated token, and the
    // recovery decision are three views of ONE fact — this authority either
    // compensated the baseline's last consume or it did not — and every
    // view must agree with the others. Per-field checks alone admitted a
    // compensated count beside an "unresolved" decision, which let a grant
    // (or a second compensate) run on top of a compensation that had
    // already restored the credit: double recovery for a single spend.
    if (state.baselineCompensationCount > 0) {
      if (state.recoveryDecision !== "compensated") return false;
      if (state.compensatedConsumeToken === null) return false;
      if (state.compensatedConsumeToken !== baseline.lastConsumeToken) return false;
    }
    if (state.compensatedConsumeToken !== null) {
      // A recorded compensated token is only ever the baseline's last
      // consume (compensate refuses any other token), and it exists only
      // alongside the compensated decision.
      if (state.recoveryDecision !== "compensated") return false;
      if (state.compensatedConsumeToken !== baseline.lastConsumeToken) return false;
    }
    if (state.recoveryDecision === "compensated") {
      // The compensated decision must name its consume, and the credit it
      // restored must be accounted for: either by this authority's own
      // compensation counter (the checks above), or because the consume was
      // already compensated in the settled legacy record at capture time —
      // the legitimate pre-compensated case, whose restore is already
      // netted in the baseline's spent count and whose authority count
      // therefore stays 0.
      if (state.compensatedConsumeToken === null) return false;
      if (state.compensatedConsumeToken !== baseline.lastConsumeToken) return false;
      if (
        state.baselineCompensationCount === 0 &&
        baseline.lastCompensatedToken !== baseline.lastConsumeToken
      ) {
        return false;
      }
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

  const entry: OwnedFileEntry = {
    mapId: op.mapId,
    fingerprint: op.fingerprint,
    committedAt: op.now,
    source: "commit",
  };
  return result(
    {
      ...state,
      ownedFiles: { ...state.ownedFiles, [op.artifactId]: entry },
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
  }
}

/** Non-authoritative display projection of the authority state (v3 §2.2:
 *  `creditsRemaining` is a derived value wherever displayed). */
export type EntitlementAuthorityProjection = {
  sessionId: string;
  plan: CheckoutPlan | null;
  creditsRemaining: number | null;
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
    ownedArtifactIds: Object.keys(state.ownedFiles).sort(),
    recoveryDecision: state.recoveryDecision,
    capabilityGeneration: state.capabilityGeneration,
    updatedAt: state.updatedAt,
  };
}
