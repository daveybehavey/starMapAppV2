/**
 * DL-1 Slice 3 — referral reward grants/reversals routed through the
 * entitlement authority (R1 option A, David 2026-10-22).
 *
 * The legacy writers (webhook W13 grant / W14 clawback) mutated the
 * referrer's combined KV balance directly: a grant vanished into the same
 * counter purchased credits live in, and a clawback debited whatever
 * balance happened to be there — including purchased credits. From this
 * slice on, the credit effect of both writers goes through the authority:
 *
 * - Grant: the referrer is migrated first (lazy trigger — the grant IS an
 *   accounting operation), then the reward lands in the separate reward
 *   bucket, keyed by the referred checkout session id for idempotence.
 * - Reversal: removes only unspent bucket credits for that grant id. A
 *   grant made before the bucket existed (pre-migration, inside the
 *   legacy combined balance) is NOT a bucket grant: its reversal reclaims
 *   zero from the authority — the legacy bucket captured at migration is
 *   never debited by a clawback (R1-A).
 *
 * Fail-closed throughout: if the referrer's record cannot be baselined
 * (ambiguous legacy history) or the authority is unreachable, the grant is
 * SKIPPED rather than written to the legacy counter behind the authority's
 * back. The webhook records the skip with the reason, exactly like its
 * other reward-skip paths. Nothing here ever writes a balance to KV.
 */
import type { EntitlementAuthorityClient } from "@/lib/entitlementAuthority";
import {
  ensureEntitlementMigrated,
  type MigrationPendingReason,
} from "@/lib/entitlementMigration";
import type { StripeSessionEntitlement } from "@/lib/entitlementsStore";

export type ReferralRewardGrantResult =
  | { status: "granted" }
  | { status: "already_granted" }
  | {
      status: "skipped";
      reason:
        | MigrationPendingReason
        | "invalid_baseline"
        | "no_record"
        | "authority_unavailable"
        | "refused";
    };

export async function grantReferralRewardViaAuthority(
  client: EntitlementAuthorityClient,
  referrerSessionId: string,
  grantId: string,
  amount: number,
  loadRecord: () => Promise<StripeSessionEntitlement | null>,
  now: number = Date.now(),
): Promise<ReferralRewardGrantResult> {
  const ensured = await ensureEntitlementMigrated(client, referrerSessionId, loadRecord, now);
  if (ensured.status === "authority_unavailable") {
    return { status: "skipped", reason: "authority_unavailable" };
  }
  if (ensured.status === "no_record") return { status: "skipped", reason: "no_record" };
  if (ensured.status === "migration_pending") {
    return { status: "skipped", reason: ensured.reason };
  }

  const applied = await client.apply(referrerSessionId, {
    type: "grant_reward",
    grantId,
    amount,
    now,
  });
  if (!applied) return { status: "skipped", reason: "authority_unavailable" };
  if (applied.outcome === "reward_granted") return { status: "granted" };
  if (applied.outcome === "reward_already_granted") return { status: "already_granted" };
  return { status: "skipped", reason: "refused" };
}

export type ReferralRewardReversalResult =
  | { status: "reversed"; clawed: number }
  | { status: "already_reversed" }
  /**
   * The grant predates the reward bucket (or the referrer was never
   * migrated): nothing in the authority corresponds to it, and a clawback
   * must not reach the legacy bucket — reclaimed is zero by policy.
   */
  | { status: "not_bucket_grant" }
  | { status: "authority_unavailable" };

export async function reverseReferralRewardViaAuthority(
  client: EntitlementAuthorityClient,
  referrerSessionId: string,
  grantId: string,
  now: number = Date.now(),
): Promise<ReferralRewardReversalResult> {
  // Deliberately NO migration attempt here: a bucket grant can only exist
  // on an already-migrated entitlement (the grant path migrates first),
  // so a referrer without a baseline holds no bucket grant — and a
  // reversal must not create a baseline as a side effect.
  const state = await client.getState(referrerSessionId);
  if (!state) return { status: "authority_unavailable" };
  if (!state.baseline || !state.rewardGrants[grantId]) {
    return { status: "not_bucket_grant" };
  }

  const applied = await client.apply(referrerSessionId, {
    type: "reverse_reward",
    grantId,
    now,
  });
  if (!applied) return { status: "authority_unavailable" };
  if (applied.outcome === "reward_reversed") {
    return { status: "reversed", clawed: applied.rewardClawed };
  }
  if (applied.outcome === "reward_reversal_already_applied") {
    return { status: "already_reversed" };
  }
  // The pre-check found the grant, so a refusal here means the state moved
  // under us or disagrees with itself — fail closed, reclaim nothing.
  return { status: "authority_unavailable" };
}
