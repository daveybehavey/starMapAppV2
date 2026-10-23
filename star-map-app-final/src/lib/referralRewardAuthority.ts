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
 *
 * ACTIVATION GATE (Codex P1, PR #367): this routing stays DISABLED until
 * the Slice 6 cutover gives downloads an authority-backed debit path.
 * Today the download flow delivers the file BEFORE its consume call and,
 * when consume fails, refreshes the balance from the legacy KV record —
 * so a referrer migrated by a referral grant would see every consume
 * refused (409, fenced) while their downloads kept succeeding and their
 * KV balance never moved: unlimited undebited exports. The webhook
 * therefore keeps the legacy KV writers until the owner enables
 * DL1_AUTHORITY_ROUTING_ENABLED (dashboard-set at Slice 6 activation,
 * deliberately NOT a wrangler [vars] entry — activation is an explicit
 * owner action, never a deploy side effect).
 */

/**
 * Whether referral grants/reversals route through the entitlement
 * authority. Default OFF — see the activation gate note above. Follows
 * the codebase's boolean env pattern (BULK_EVENT_ORDERS_ENABLED etc.).
 */
export function isEntitlementAuthorityRoutingEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return /^(1|true|yes)$/i.test((env.DL1_AUTHORITY_ROUTING_ENABLED || "").trim());
}
import type { EntitlementAuthorityClient } from "@/lib/entitlementAuthority";
import {
  ensureEntitlementMigrated,
  type MigrationPendingReason,
} from "@/lib/entitlementMigration";
import type { StripeSessionEntitlement } from "@/lib/entitlementsStore";

export type ReferralGrantSkipReason =
  | MigrationPendingReason
  | "invalid_baseline"
  | "no_record"
  | "authority_unavailable"
  | "migration_busy"
  | "refused";

export type ReferralRewardGrantResult =
  | { status: "granted" }
  | { status: "already_granted" }
  | { status: "skipped"; reason: ReferralGrantSkipReason };

/**
 * Skip reasons that are TRANSIENT (Codex P2, PR #367): the grant failed
 * only because the authority was contended or briefly unreachable, so
 * the reward must stay retryable — the webhook rolls back its
 * idempotency claim and lets Stripe redelivery complete the grant.
 * Every other skip is a settled fact about the record (ambiguous
 * history, no record, a state-machine refusal) and is terminal.
 */
export function isTransientReferralGrantReason(reason: ReferralGrantSkipReason): boolean {
  return reason === "migration_busy" || reason === "authority_unavailable";
}

/**
 * Thrown by the webhook's grant path after a transient skip (with the
 * idempotency claim already rolled back) so the fulfillment pass can
 * answer Stripe with its retryable outcome instead of finalizing.
 */
export class ReferralGrantTransientError extends Error {
  readonly code = "referral_grant_transient";
  constructor(reason: string) {
    super(`referral grant transiently skipped: ${reason}`);
    this.name = "ReferralGrantTransientError";
  }
}

export function isReferralGrantTransientError(error: unknown): boolean {
  return (
    error instanceof ReferralGrantTransientError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === "referral_grant_transient")
  );
}

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
  if (ensured.status === "migration_busy") {
    // A legacy consume/compensate held the accounting lease past the
    // wait window. The grant is skipped for this delivery; the webhook's
    // recorded skip keeps it visible and a redelivery can retry.
    return { status: "skipped", reason: "migration_busy" };
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
