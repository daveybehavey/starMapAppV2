/**
 * Promotion dispatch fence (CASL gate-1 fencing build; evidence design
 * S91-4, sender inventory S90-3).
 *
 * `deliverPromotionSend` is the single transport for promotional email,
 * but it historically performed NO permission check of its own: the
 * coordinator drivers were safe because the per-email coordinator state
 * machine refuses claims after an unsubscribe, yet the transport itself —
 * and the legacy wrappers that call it directly — would send to any
 * address handed to them. This module is the dispatch-time authority
 * read the transport now performs before any provider leg is attempted
 * (S91-4 requirement A: authority is read at the DISPATCH decision, not
 * asserted at enqueue or subscribe time).
 *
 * Authority order (the shipped architecture, B1 §2): the per-email
 * Consistency Coordinator state is authoritative when it exists. The
 * legacy KV projection is consulted only when no coordinator state
 * exists at all (a contact the coordinator has never seen — e.g. a
 * pre-coordinator subscriber, whose import into the coordinator happens
 * at subscribe/unsubscribe time, not at send time).
 *
 * Fail-closed: an authority read that cannot be performed refuses the
 * dispatch (`authority_unavailable`). A refusal is NOT a provider
 * outcome: no provider leg is attempted, no fallback is walked, and the
 * caller maps the refusal onto its "nothing was sent" completion
 * semantics so the send stays retryable once authority is readable
 * again — while a refusal caused by a committed unsubscribe completes
 * as a cancellation there.
 */
import {
  createConsistencyCoordinatorClient,
  coordinatorEmailHash,
  promotionCoordinatorName,
  type ConsistencyCoordinatorClient,
} from "@/lib/consistencyCoordinator";
import type { PromotionCoordinatorState } from "@/lib/consistencyCoordinatorState";
import {
  evaluateSuppressionGate,
  promotionSuppressionsOf,
} from "@/lib/consistencyCoordinatorState";
import { kv } from "@/lib/kv";
import {
  LEGACY_SUBSCRIPTION_KEY,
  emailStateKey,
  normalizePromotionEmail,
  type PromotionEmailState,
} from "@/lib/promotionSubscriptions";

export type PromotionDispatchRefusalReason =
  | "unsubscribed"
  | "deliverability_suppressed"
  | "no_permission_record"
  | "authority_unavailable";

export type PromotionDispatchDecision =
  | { permitted: true }
  | { permitted: false; reason: PromotionDispatchRefusalReason };

export type PromotionDispatchPermissionChecker = (email: string) => Promise<PromotionDispatchDecision>;

/**
 * The pure decision over already-read authority facts. Split from the
 * I/O so the decision table is unit-testable and so the coordinator DO
 * can evaluate it over its own document (no self-RPC) at dispatch time.
 *
 * `coordinatorState === null` means the coordinator has NO state for
 * this recipient — only then do the legacy facts get a say.
 */
export function evaluatePromotionDispatchPermission(input: {
  coordinatorState: PromotionCoordinatorState | null;
  legacyState: PromotionEmailState | null;
  legacyListMember: boolean;
}): PromotionDispatchDecision {
  const { coordinatorState, legacyState, legacyListMember } = input;
  if (coordinatorState) {
    // RD-B: the authority's scoped suppression records gate first
    // (A1 P-3). This transport carries the lifecycle sends (coupon +
    // followup), so the purpose is lifecycle_commercial. For a
    // document stamped by an RD-B transition the global record and
    // the legacy unsubscribedAt are the same fact in two shapes, and
    // for a pre-RD-B document promotionSuppressionsOf derives the
    // record from that stamp — either way a globally suppressed
    // identity refuses here exactly as the unsubscribedAt check did,
    // under the same reason. The new behaviour is the deliverability
    // axis (I-5): a bounce/complaint suppression now refuses
    // commercial dispatch even on a subscribed identity.
    const gate = evaluateSuppressionGate({
      suppressions: promotionSuppressionsOf(coordinatorState),
      purpose: "lifecycle_commercial",
    });
    if (!gate.permitted) {
      return {
        permitted: false,
        reason: gate.reason === "globally_suppressed" ? "unsubscribed" : "deliverability_suppressed",
      };
    }
    if (coordinatorState.subscribedAt !== null || coordinatorState.legacySubscribed) {
      return { permitted: true };
    }
    // A coordinator object exists but carries no subscription fact at
    // all (e.g. a document created by a deliverability record alone,
    // or an unsubscribe whose own stamp was later cleared — impossible
    // today, unsubscribe always stamps — so this is a defensive
    // refuse, never a permit).
    return { permitted: false, reason: "no_permission_record" };
  }
  if (legacyState?.unsubscribedAt) {
    return { permitted: false, reason: "unsubscribed" };
  }
  if (legacyState?.subscribedAt || legacyListMember) {
    return { permitted: true };
  }
  return { permitted: false, reason: "no_permission_record" };
}

async function readLegacyPermissionFacts(email: string): Promise<{
  legacyState: PromotionEmailState | null;
  legacyListMember: boolean;
}> {
  // Error-preserving reads (Codex P2 on PR #454): `kv.get` degrades a
  // failed Cloudflare read to local fallback and can return `null` for a
  // record that exists but is unreadable — indistinguishable from an
  // absent suppression record, which would let list membership permit a
  // send that must be refused. A failed read here throws and the checker
  // maps it to `authority_unavailable`, whatever the other read says.
  const [state, list] = await Promise.all([
    kv.getErrorPreserving<PromotionEmailState>(emailStateKey(email)),
    kv.getErrorPreserving<string[]>(LEGACY_SUBSCRIPTION_KEY),
  ]);
  return {
    legacyState: state ?? null,
    legacyListMember: Array.isArray(list) && list.includes(email),
  };
}

/**
 * The production checker: read the coordinator state for the recipient,
 * fall back to the legacy KV facts only when the coordinator has never
 * seen the recipient, and refuse (fail closed) when either read fails.
 */
export function createPromotionDispatchPermissionChecker(
  client: ConsistencyCoordinatorClient = createConsistencyCoordinatorClient()
): PromotionDispatchPermissionChecker {
  return async (rawEmail: string): Promise<PromotionDispatchDecision> => {
    const email = normalizePromotionEmail(rawEmail);
    if (!email) return { permitted: false, reason: "no_permission_record" };
    try {
      const name = promotionCoordinatorName(coordinatorEmailHash(email));
      const coordinatorState = await client.getPromotionState(name);
      if (coordinatorState) {
        return evaluatePromotionDispatchPermission({
          coordinatorState,
          legacyState: null,
          legacyListMember: false,
        });
      }
      const legacy = await readLegacyPermissionFacts(email);
      return evaluatePromotionDispatchPermission({
        coordinatorState: null,
        ...legacy,
      });
    } catch {
      return { permitted: false, reason: "authority_unavailable" };
    }
  };
}

/** Shared default checker (fresh coordinator client per instance). */
export const checkPromotionDispatchPermission: PromotionDispatchPermissionChecker =
  createPromotionDispatchPermissionChecker();
