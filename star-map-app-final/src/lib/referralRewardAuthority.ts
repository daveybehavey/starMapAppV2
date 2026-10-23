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
import type { ReferralDiscoveryClient } from "@/lib/referralDiscoveryClient";

/**
 * Discovery + classification inputs for the grant path (DL-1 v3.8
 * §5.3, §2.2). When supplied, the wrapper runs the ReferralDiscoveryDO
 * registration leg BEFORE the grant op (the shell leg: registration
 * precedes any fold effect) and presents the classification evidence
 * to the op, which classifies inside the serialized stream. The
 * evidence is presented on EVERY discovery-supplied grant: omitting
 * it never selects a native path (the machine treats missing
 * evidence as unresolved and missing registration as a refusal), so
 * a caller without a finalized witness presents the absence as the
 * witness value "absent" and lets the provenance forms (P-b fencing,
 * P-c snapshot order) decide — the grant pends when neither proves
 * exclusion, which is the cleared fail-closed posture. When the
 * discovery input itself is absent, the machine refuses the grant
 * (discovery_attestation_missing) and the wrapper reports the skip.
 */
export type ReferralGrantDiscoveryInput = {
  discoveryClient: ReferralDiscoveryClient;
  /** The referred session's Stripe creation time (ms). */
  sessionCreatedAt: number;
  /** Activation record's fencing-completion time; null until the
   *  activation record exists (P-b is unavailable without it — never
   *  approximated from deploy timestamps, v3.10 §8(a)). */
  fencingCompletedAt: number | null;
  /**
   * The identity's landing witness, in its finalized form, when the
   * caller has one. Omit when the caller has none: the wrapper then
   * presents "absent" (no landing evidence) rather than omitting
   * the evidence bundle — the webhook's grant-time claim is a claim,
   * not a finalized witness, and it is never dressed as one.
   */
  witness?:
    | "finalized_grant"
    | "finalized_non_grant"
    | "unfinalized"
    | "absent";
  operatorIncludedReceipt?: boolean;
  operatorExcludedReceipt?: boolean;
};

export type ReferralGrantSkipReason =
  | MigrationPendingReason
  | "invalid_baseline"
  | "no_record"
  | "authority_unavailable"
  | "migration_busy"
  | "refused"
  /**
   * The grant journaled as a zero-fold-effect PENDING entry
   * (inclusion/birth/discovery unresolved). Not a loss: the pending
   * entry is durable and operator-visible, the claim is NOT rolled
   * back, and settlement — not redelivery — is what resolves it
   * (though a redelivery dispatches to the same entry). Deliberately
   * NOT in the transient set below.
   */
  | "grant_inclusion_unresolved"
  | "grant_discovery_unresolved"
  | "grant_birth_unresolved";

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
  discovery?: ReferralGrantDiscoveryInput,
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

  // Discovery registration leg (DL-1 v3.8 §5.3): runs BEFORE the
  // state machine is invoked for the fold, so no grant can commit
  // unregistered. An unreachable discovery authority pends the grant
  // (fail-closed, durable, retryable) rather than mis-recording it.
  let discoveryRegistration:
    | "registered"
    | "already_registered"
    | "unavailable"
    | "conflict"
    | "registered_after_terminal"
    | undefined;
  let terminalRecord: { lineageRef: string; recordedAt: number } | null = null;
  if (discovery) {
    const registered = await discovery.discoveryClient.register(grantId, {
      referrerSessionId,
      grantId,
      now,
    });
    if (!registered) {
      discoveryRegistration = "unavailable";
    } else {
      discoveryRegistration = registered.outcome;
      if (registered.outcome === "registered_after_terminal") {
        terminalRecord = registered.row.terminalNegative;
      }
    }
  }

  const applied = await client.apply(referrerSessionId, {
    type: "grant_reward",
    grantId,
    amount,
    now,
    discoveryRegistration,
    terminalRecord,
    classificationEvidence: discovery
      ? {
          sessionCreatedAt: discovery.sessionCreatedAt,
          fencingCompletedAt: discovery.fencingCompletedAt,
          witness: discovery.witness ?? "absent",
          operatorIncludedReceipt: discovery.operatorIncludedReceipt,
          operatorExcludedReceipt: discovery.operatorExcludedReceipt,
        }
      : undefined,
    presentingWriter: "stripe_webhook_w13",
  });
  if (!applied) return { status: "skipped", reason: "authority_unavailable" };
  if (applied.outcome === "reward_granted") return { status: "granted" };
  if (applied.outcome === "reward_granted_born_reversed") return { status: "granted" };
  if (applied.outcome === "reward_already_granted") return { status: "already_granted" };
  if (applied.outcome === "already_included_in_opening") {
    // The value was already inside the referrer's opening figure;
    // the observation is the grant's commit ticket.
    return { status: "already_granted" };
  }
  if (applied.outcome === "grant_pending") {
    return {
      status: "skipped",
      reason:
        applied.pendingKind === "discovery"
          ? "grant_discovery_unresolved"
          : applied.pendingKind === "birth"
            ? "grant_birth_unresolved"
            : "grant_inclusion_unresolved",
    };
  }
  return { status: "skipped", reason: "refused" };
}

export type ReferralRewardReversalResult =
  | { status: "reversed"; clawed: number }
  /**
   * Replay of a committed reversal. `clawed` is the ORIGINAL
   * journaled receipt's amount, returned verbatim (DL-1 v3.6 §4.3) —
   * a caller that died before finalizing its KV bookkeeping
   * redelivers and records the true amount, not zero.
   */
  | { status: "already_reversed"; clawed: number }
  /**
   * The grant predates the reward bucket (or the referrer was never
   * migrated): nothing in the authority corresponds to it, and a clawback
   * must not reach the legacy bucket — reclaimed is zero by policy.
   * `basis` names the positive ground when the op journaled one.
   */
  | { status: "not_bucket_grant"; basis?: string }
  /**
   * Outcome 3 (DL-1 v3.7 §2.3 pairing / §6.1): the grant's inclusion
   * classification is still pending, so the reversal defers — dedupe
   * must NOT finalize — until the classification settles.
   */
  | { status: "deferred" }
  | { status: "authority_unavailable" };

export async function reverseReferralRewardViaAuthority(
  client: EntitlementAuthorityClient,
  referrerSessionId: string,
  grantId: string,
  now: number = Date.now(),
  opts: { operatorReceipt?: boolean } = {},
): Promise<ReferralRewardReversalResult> {
  // Deliberately NO migration attempt here: a bucket grant can only exist
  // on an already-migrated entitlement (the grant path migrates first),
  // so a referrer without a baseline holds no bucket grant — and a
  // reversal must not create a baseline as a side effect.
  //
  // Classification is the OP's, inside the serialized stream (DL-1
  // v3.6 §4.3): this wrapper no longer pre-checks state to decide
  // not_bucket_grant — a read may route (an unreachable authority
  // fails closed here), never decide. The one routing fact read here
  // is baseline presence: with no baseline at all, no journal exists
  // for the op to classify against — and absence is UNRESOLVED, not
  // a terminal zero: the reversal defers (dedupe unfinalized) until
  // the identity has a journal home in which a positive ground (a
  // settled inclusion, an operator receipt, a Discovery terminal
  // decision) can be serialized. A terminal zero is issued only from
  // such a ground, inside the op. (The S-OFF legacy posture lives in
  // the webhook's own legacy path, not in this wrapper.)
  //
  // Both deferral paths below first persist the reconciliation
  // record (record_unresolved_reversal): the cleared rule requires
  // DURABLE reconciliation for unresolved absence, and a deferral
  // that exists only in a webhook log line leaves the census /
  // operator workflow no keyed record to find once the request ends.
  // The record is zero-accounting-effect bookkeeping keyed by grant
  // id — no baseline, terminal receipt, or Discovery negative is
  // created to record the uncertainty. If the note itself cannot be
  // persisted (authority lost between the read and the write), the
  // deferral stands unchanged: the money answer is the deferral,
  // and the next redelivery retries the whole chain, note included.
  const state = await client.getState(referrerSessionId);
  if (!state) return { status: "authority_unavailable" };
  if (!state.baseline) {
    await client.apply(referrerSessionId, {
      type: "record_unresolved_reversal",
      grantId,
      absence: "no_baseline",
      now,
    });
    return { status: "deferred" };
  }

  const applied = await client.apply(referrerSessionId, {
    type: "reverse_reward",
    grantId,
    operatorReceipt: opts.operatorReceipt,
    now,
  });
  if (!applied) return { status: "authority_unavailable" };
  if (applied.outcome === "reward_reversed") {
    return { status: "reversed", clawed: applied.rewardClawed };
  }
  if (applied.outcome === "reward_reversal_already_applied") {
    return { status: "already_reversed", clawed: applied.rewardClawed };
  }
  if (applied.outcome === "not_bucket_grant") {
    return { status: "not_bucket_grant", basis: applied.reversalBasis ?? undefined };
  }
  if (applied.outcome === "refused" && applied.refusal === "reversal_deferred") {
    return { status: "deferred" };
  }
  if (applied.outcome === "refused" && applied.refusal === "unknown_reward_grant") {
    // No folded grant, no pending entry, no settled inclusion, no
    // receipt: the identity's absence from this journal is
    // UNRESOLVED — it is not positive evidence the grant was never a
    // bucket grant, and it must not be converted into a terminal zero
    // with no serialized reversal receipt and no Discovery terminal
    // decision behind it. The reversal defers (the caller's dedupe
    // stays unfinalized); the terminal answer arrives only when a
    // positive ground lands in the journal and the op itself issues
    // not_bucket_grant with its journaled receipt. The deferral is
    // first made durable as a reconciliation record (see the
    // no-baseline path above): the machine refused on UNCHANGED
    // state, so without the note nothing keyed would survive the
    // request for the census/operator workflow to find.
    await client.apply(referrerSessionId, {
      type: "record_unresolved_reversal",
      grantId,
      absence: "unknown_grant",
      now,
    });
    return { status: "deferred" };
  }
  // Any other refusal means the state disagrees with itself — fail
  // closed, reclaim nothing.
  return { status: "authority_unavailable" };
}
