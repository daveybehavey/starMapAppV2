/**
 * DL-1 Slice 3 — one-time migration baseline + legacy writer fencing.
 *
 * The migration half of the entitlement authority: it converts a settled
 * legacy KV session record (`stripe:session:{id}`) into the authority's
 * facts + immutable baseline (shapes in entitlementAuthorityState.ts), and
 * it is the ONLY bridge between the two accounting worlds.
 *
 * Safety posture (v3 §2.6, v3.1 §A):
 * - Lazy trigger: migration runs before the first accounting operation for
 *   an entitlement (the referral grant/reversal path in the webhook), never
 *   from a projection/display read.
 * - Fail closed: a record whose settled history cannot be established
 *   unambiguously yields `migration_pending` with a reason, and accounting
 *   stays on the legacy path only where the fence allows (see below) — the
 *   baseline is never guessed. Ambiguous records are a support-resolution
 *   path, not a silent approximation.
 * - No term synthesis: the baseline records established access terms as
 *   evidence; it never derives an access-expiry boundary from claim-token
 *   expiry and never resets an established term (no-expiry decision).
 * - Idempotent: the baseline is immutable once captured (the authority
 *   refuses a second capture), so re-running migration — including against
 *   a KV record changed after capture — can never reset the baseline or
 *   restore spent credits.
 *
 * R1 (David, 2026-10-22 — option A): the pre-migration balance is captured
 * WHOLE as the baseline's legacy bucket. Historical referral rewards are
 * indistinguishable from purchased credits in the legacy record (the old
 * writers mixed them into one counter), so no retroactive paid-vs-reward
 * split is attempted or fabricated. Only grants made after capture land in
 * the authority's separate reward bucket.
 *
 * Fencing: once a baseline exists, the legacy consume/compensate routes
 * must not mutate accounting state outside the authority. They consult
 * `checkLegacyWriterFence` before applying the legacy helpers; the
 * referral grant/reversal writers are routed through the authority
 * outright (referralRewardAuthority.ts), so after capture no legacy
 * writer can move a migrated entitlement's balance at all. When the
 * authority cannot be reached, the fence reports `authority_unavailable`
 * and callers fail closed — an unreachable authority is never treated as
 * proof that no baseline exists.
 */
import {
  PLAN_ALLOWANCE,
  type EntitlementAuthorityState,
  type EntitlementBaseline,
  type EntitlementFacts,
} from "@/lib/entitlementAuthorityState";
import type { EntitlementAuthorityClient } from "@/lib/entitlementAuthority";
import type { StripeSessionEntitlement } from "@/lib/entitlementsStore";

/** Reasons a legacy record cannot be baselined yet (support resolution). */
export type MigrationPendingReason =
  | "record_not_paid"
  | "missing_plan"
  | "missing_credits_total"
  | "missing_credits_remaining"
  | "allowance_below_plan"
  | "balance_out_of_range"
  | "inconsistent_consume_evidence";

export type BaselineBuildResult =
  | { status: "ready"; facts: EntitlementFacts; baseline: EntitlementBaseline }
  | { status: "pending"; reason: MigrationPendingReason };

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/** Grant-side facts (overlap contract O1) read straight off the record. */
export function buildEntitlementFactsFromRecord(
  record: StripeSessionEntitlement,
): EntitlementFacts | null {
  if (!record.plan) return null;
  return {
    plan: record.plan,
    paid: record.paid === true,
    revoked: record.revoked === true,
    subscriptionActive: record.subscriptionActive === true,
    mapId: typeof record.mapId === "string" && record.mapId ? record.mapId : null,
  };
}

/**
 * Derive facts + baseline from a settled legacy record. Pure and total:
 * every ambiguous shape returns a named pending reason instead of a guess.
 */
export function buildBaselineFromLegacyRecord(
  record: StripeSessionEntitlement,
  now: number,
): BaselineBuildResult {
  const facts = buildEntitlementFactsFromRecord(record);
  if (!facts) return { status: "pending", reason: "missing_plan" };
  if (record.paid !== true) return { status: "pending", reason: "record_not_paid" };

  const lastConsumeToken =
    typeof record.lastConsumeToken === "string" && record.lastConsumeToken
      ? record.lastConsumeToken
      : null;
  const lastCompensatedToken =
    typeof record.lastCompensatedToken === "string" && record.lastCompensatedToken
      ? record.lastCompensatedToken
      : null;
  // A compensated consume is a consume: compensation evidence without a
  // consume token is an inconsistent record (the authority's baseline
  // validator rejects the same shape).
  if (lastCompensatedToken && !lastConsumeToken) {
    return { status: "pending", reason: "inconsistent_consume_evidence" };
  }
  const lastConsumeAt = isInt(record.lastConsumeAt) ? record.lastConsumeAt : null;

  const createdNote =
    typeof record.created === "number" && Number.isFinite(record.created)
      ? `legacy record created ${new Date(record.created).toISOString()}`
      : "legacy record creation time unknown";
  const r1Note =
    "pre-migration balance captured whole as the legacy bucket, historical referral rewards included (DL-1 R1 option A)";

  if (facts.plan === "subscription") {
    // A subscription's access is unlimited-while-active; the legacy consume
    // helper never debited it, so any consume/compensate evidence on the
    // record contradicts the plan and cannot be baselined safely. (Credit
    // counters, when present, are checkout-derivation leftovers the
    // subscription flow never reads — they are ignored, not evidence.)
    if (lastConsumeToken || lastCompensatedToken) {
      return { status: "pending", reason: "inconsistent_consume_evidence" };
    }
    return {
      status: "ready",
      facts,
      baseline: {
        plan: "subscription",
        allowance: null,
        legacyRemainingBalance: null,
        legacySpentCount: 0,
        lastConsumeToken: null,
        lastConsumeAt: null,
        lastCompensatedToken: null,
        purchaseMapId: facts.mapId,
        accessTermsNote: `${createdNote}; subscription access through the paid period per the record's facts; ${r1Note}`,
        capturedAt: now,
      },
    };
  }

  // Finite plans. The settled original allowance is the record's
  // creditsTotal: markSessionPaid writes it from the plan/credits metadata,
  // and the legacy referral grant RAISED it alongside the balance — so a
  // total above the plan's nominal allowance is the settled record of
  // historical rewards inside the legacy bucket, not an inconsistency. A
  // total BELOW the plan allowance can never be a settled purchase record.
  if (record.creditsTotal === undefined || record.creditsTotal === null) {
    return { status: "pending", reason: "missing_credits_total" };
  }
  if (!isInt(record.creditsTotal) || record.creditsTotal < 0) {
    return { status: "pending", reason: "balance_out_of_range" };
  }
  const allowance = record.creditsTotal;
  if (allowance < PLAN_ALLOWANCE[facts.plan]) {
    return { status: "pending", reason: "allowance_below_plan" };
  }
  if (record.creditsRemaining === undefined || record.creditsRemaining === null) {
    return { status: "pending", reason: "missing_credits_remaining" };
  }
  if (!isInt(record.creditsRemaining)) {
    return { status: "pending", reason: "balance_out_of_range" };
  }
  const legacyRemainingBalance = record.creditsRemaining;
  if (legacyRemainingBalance < 0 || legacyRemainingBalance > allowance) {
    return { status: "pending", reason: "balance_out_of_range" };
  }
  const legacySpentCount = allowance - legacyRemainingBalance;
  const abovePlanNote =
    allowance > PLAN_ALLOWANCE[facts.plan]
      ? `; settled total ${allowance} exceeds the ${facts.plan} plan allowance ${PLAN_ALLOWANCE[facts.plan]} (historical referral rewards inside the legacy balance)`
      : "";
  return {
    status: "ready",
    facts,
    baseline: {
      plan: facts.plan,
      allowance,
      legacyRemainingBalance,
      legacySpentCount,
      lastConsumeToken,
      lastConsumeAt,
      lastCompensatedToken,
      purchaseMapId: facts.mapId,
      accessTermsNote: `${createdNote}; ${r1Note}${abovePlanNote}`,
      capturedAt: now,
    },
  };
}

export type EnsureMigratedResult =
  | { status: "already_migrated"; state: EntitlementAuthorityState }
  | { status: "migrated"; state: EntitlementAuthorityState }
  | { status: "migration_pending"; reason: MigrationPendingReason | "invalid_baseline" }
  | { status: "no_record" }
  | { status: "authority_unavailable" };

/**
 * The lazy migration trigger. Runs before an entitlement's first
 * accounting operation; safe to call repeatedly and concurrently — the
 * authority serializes captures and an existing baseline is returned
 * untouched (a changed KV record afterwards is never re-imported).
 */
export async function ensureEntitlementMigrated(
  client: EntitlementAuthorityClient,
  sessionId: string,
  loadRecord: () => Promise<StripeSessionEntitlement | null>,
  now: number = Date.now(),
): Promise<EnsureMigratedResult> {
  const existing = await client.getState(sessionId);
  if (!existing) return { status: "authority_unavailable" };
  if (existing.baseline) return { status: "already_migrated", state: existing };

  const record = await loadRecord();
  if (!record) return { status: "no_record" };

  const built = buildBaselineFromLegacyRecord(record, now);
  if (built.status === "pending") {
    return { status: "migration_pending", reason: built.reason };
  }

  const synced = await client.apply(sessionId, {
    type: "sync_facts",
    facts: built.facts,
    now,
  });
  if (!synced) return { status: "authority_unavailable" };

  const captured = await client.apply(sessionId, {
    type: "capture_baseline",
    baseline: built.baseline,
    now,
  });
  if (!captured) return { status: "authority_unavailable" };
  if (captured.outcome === "baseline_captured") {
    return { status: "migrated", state: captured.state };
  }
  if (captured.outcome === "baseline_already_captured") {
    // A concurrent trigger won the capture race; its baseline governs.
    return { status: "already_migrated", state: captured.state };
  }
  // The builder pre-validates, so a refusal here means the record and the
  // authority disagree about validity — fail closed as pending/support.
  return { status: "migration_pending", reason: "invalid_baseline" };
}

export type LegacyWriterFenceResult =
  | { status: "fenced" }
  | { status: "open" }
  | { status: "authority_unavailable" };

/**
 * The fence the legacy consume/compensate routes consult before mutating:
 * `fenced` once a baseline exists (accounting belongs to the authority),
 * `open` when the entitlement is still purely legacy, and
 * `authority_unavailable` when no authoritative answer exists — callers
 * must fail closed on it, never treat it as `open`.
 */
export async function checkLegacyWriterFence(
  client: EntitlementAuthorityClient,
  sessionId: string,
): Promise<LegacyWriterFenceResult> {
  const state = await client.getState(sessionId);
  if (!state) return { status: "authority_unavailable" };
  return state.baseline ? { status: "fenced" } : { status: "open" };
}
