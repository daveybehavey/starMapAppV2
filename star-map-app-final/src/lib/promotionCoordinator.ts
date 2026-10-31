/**
 * Promotion flows over the Consistency Coordinator (T-SM-KVRACE, A2-3).
 *
 * The subscribe route and the unsubscribe page call these helpers; all
 * authoritative subscription/delivery state lives in the per-email
 * coordinator object. This module owns the three things that must stay
 * OUTSIDE the Durable Object:
 *   - legacy KV fact gathering (per-email state + the legacy lists),
 *     passed into the coordinator, whose import is monotone;
 *   - the claim → deliver → complete driver for delivery jobs (the
 *     claim is committed before any provider call; the provider call
 *     itself never happens inside a state transition);
 *   - the KV projection of the authoritative state, kept for the
 *     readers that predate the coordinator (admin subscriber summary,
 *     the review engine's promotions opt-out source). The projection
 *     is non-authoritative and rebuilt on every mutation.
 */
import { kv } from "@/lib/kv";
import {
  createConsistencyCoordinatorClient,
  promotionCoordinatorName,
  coordinatorEmailHash,
  type ConsistencyCoordinatorClient,
} from "@/lib/consistencyCoordinator";
import {
  promotionStateView,
  type PromotionCoordinatorState,
  type PromotionJobKind,
  type PromotionLegacyFacts,
  type PromotionSendOutcome,
} from "@/lib/consistencyCoordinatorState";
import {
  emailStateKey,
  LEGACY_FOLLOWUP_KEY,
  LEGACY_SENT_KEY,
  LEGACY_SUBSCRIPTION_KEY,
  normalizePromotionEmail,
  type PromotionEmailState,
} from "@/lib/promotionSubscriptions";
import { createPromotionDispatchPermissionChecker } from "@/lib/promotionDispatchGuard";
import {
  deliverPromotionSend,
  getPromotionFollowupDelaySeconds,
  preparePromotionCouponPayload,
  preparePromotionFollowupPayload,
  selectPromotionProvider,
  type PromotionDeliveryOutcome,
} from "@/lib/promotions";

async function inLegacyList(listKey: string, email: string): Promise<boolean> {
  const list = await kv.get<string[]>(listKey);
  return Boolean(list?.includes(email));
}

/**
 * Gather the legacy import facts for one email, mirroring the legacy
 * subscribe route's read pattern exactly (a legacy list is consulted
 * only when the per-email state lacks the corresponding marker — null
 * means "not consulted", and the coordinator keeps its import open
 * until a call brings complete facts).
 */
export async function gatherPromotionLegacyFacts(
  email: string,
): Promise<PromotionLegacyFacts> {
  const state = await kv.get<PromotionEmailState>(emailStateKey(email));
  const [inSubscriptionList, inSentList, inFollowupList] = await Promise.all([
    state?.subscribedAt ? Promise.resolve<boolean | null>(null) : inLegacyList(LEGACY_SUBSCRIPTION_KEY, email),
    state?.couponSentAt ? Promise.resolve<boolean | null>(null) : inLegacyList(LEGACY_SENT_KEY, email),
    state?.followupSentAt ? Promise.resolve<boolean | null>(null) : inLegacyList(LEGACY_FOLLOWUP_KEY, email),
  ]);
  return {
    state: state ?? null,
    inLegacySubscriptionList: inSubscriptionList,
    inLegacySentList: inSentList,
    inLegacyFollowupList: inFollowupList,
  };
}

/** Write the non-authoritative KV projection of authoritative state.
 *  Best-effort: authority is already committed in the coordinator, and
 *  the projection is rebuilt on the next mutation. The unsubscribe
 *  flow is the one exception — it uses the strict variant below. */
export async function publishPromotionProjection(
  email: string,
  state: PromotionCoordinatorState,
): Promise<void> {
  try {
    await kv.set(emailStateKey(email), promotionStateView(state));
  } catch (error) {
    console.error("promotion state projection write failed", { email, error });
  }
}

/** Strict variant of the projection write: a KV failure PROPAGATES.
 *  Used by the unsubscribe flow, whose projection cannot be
 *  best-effort: an unsubscribe may be the last mutation this account
 *  ever makes (nothing is guaranteed to rebuild the projection later),
 *  and the review engine's suppression check reads only KV sources —
 *  a silently lost write would leave the authoritative opt-out
 *  invisible to it. The coordinator has already committed the opt-out
 *  when this runs, so surfacing the failure is safe: the caller fails
 *  the page closed and a retry republishes from committed state. */
export async function publishPromotionProjectionStrict(
  email: string,
  state: PromotionCoordinatorState,
): Promise<void> {
  await kv.set(emailStateKey(email), promotionStateView(state));
}

function toCoordinatorOutcome(outcome: PromotionDeliveryOutcome): PromotionSendOutcome {
  if (outcome.outcome === "accepted") {
    return {
      type: "accepted",
      provider: outcome.provider,
      providerMessageId: outcome.providerMessageId ?? null,
    };
  }
  if (outcome.outcome === "definitive_failure") {
    return { type: "definitive_failure", provider: outcome.provider, error: outcome.error };
  }
  if (outcome.outcome === "ambiguous") {
    return {
      type: "ambiguous",
      provider: outcome.provider,
      error: outcome.error,
      idempotencyGuaranteed: outcome.idempotencyGuaranteed,
    };
  }
  if (outcome.outcome === "refused") {
    // Dispatch fence refusal (gate-1 fencing build): no provider was
    // attempted, so the completion semantics are exactly the
    // no-attempt ones — the claim is restored for a later drive, or
    // CANCELLED when the refusal was a committed unsubscribe (the
    // unconfigured completion branch checks the CURRENT subscription
    // state). Mapping a refusal to any provider outcome would either
    // fail a send that never happened or risk a retry the fence just
    // forbade.
    return { type: "unconfigured" };
  }
  return { type: "unconfigured" };
}

export type PromotionDriveResult = {
  /** Coupon job accepted (by this drive or earlier). */
  couponDelivered: boolean;
  /** Provider of the coupon attempt made by THIS drive ("none" when no
   *  attempt was needed or no provider is configured). */
  couponProvider: string;
  couponError?: string;
};

/**
 * Drive this email's delivery jobs to completion: coupon first, then
 * the followup a coupon acceptance creates — the same order the legacy
 * route used inline. Each iteration commits its state transition
 * before the next provider call.
 */
export async function drivePromotionJobs(
  client: ConsistencyCoordinatorClient,
  name: string,
  email: string,
): Promise<PromotionDriveResult> {
  let couponDelivered = false;
  let couponProvider = "none";
  let couponError: string | undefined;

  const existing = await client.getPromotionState(name);
  if (existing?.jobs.coupon?.status === "accepted") {
    couponDelivered = true;
  }

  // The provider selection is committed with each claim, before the
  // provider call, so the guarantee covering the attempt is on record
  // even if this driver dies mid-send.
  const selection = selectPromotionProvider();
  for (const kind of ["coupon", "followup"] as PromotionJobKind[]) {
    // Provider pin: a job with a recorded provider carries an earlier
    // attempt whose acceptance is uncertain at THAT provider — only
    // its idempotency guarantee covers the job's key. Drive the job
    // under its own provider or not at all: if that provider is no
    // longer the configured selection, leave the job to the alarm
    // (which retries under the same rule via the claim transition and
    // blocks the job once the guarantee window lapses) rather than
    // submitting the campaign through a provider that cannot dedupe
    // the original attempt.
    const current = await client.getPromotionState(name);
    const pinnedProvider = current?.jobs[kind]?.provider ?? null;
    if (pinnedProvider !== null && selection?.provider !== pinnedProvider) {
      continue;
    }
    const { claim } = await client.claimPromotionJob(name, {
      kind,
      now: Date.now(),
      attemptProvider: selection?.provider ?? null,
      attemptIdempotencyGuaranteed: selection?.idempotencyGuaranteed ?? null,
    });
    if (!claim) continue;

    let outcome: PromotionSendOutcome;
    try {
      const delivery = await deliverPromotionSend(claim.payload, claim.providerIdempotencyKey, {
        // The fence reads authority through THIS driver client, so the
        // check and the claim observe the same coordinator.
        checkDispatchPermission: createPromotionDispatchPermissionChecker(client),
      });
      outcome = toCoordinatorOutcome(delivery);
    } catch (error) {
      outcome = {
        type: "ambiguous",
        provider: "none",
        error: error instanceof Error ? error.message.slice(0, 200) : "delivery_failed",
        idempotencyGuaranteed: false,
      };
    }

    const completedAt = Date.now();
    const { state } = await client.completePromotionJob(name, {
      kind,
      outcome,
      now: completedAt,
      followupPayload:
        kind === "coupon"
          ? preparePromotionFollowupPayload(
              email,
              claim.payload.couponCode,
              new Date(completedAt + getPromotionFollowupDelaySeconds() * 1000).toISOString(),
            )
          : undefined,
    });

    if (kind === "coupon") {
      if (outcome.type === "accepted") {
        couponDelivered = true;
        couponProvider = outcome.provider;
      } else if (outcome.type === "unconfigured") {
        couponProvider = "none";
      } else {
        couponProvider = outcome.provider;
        couponError = outcome.error;
      }
      if (state) {
        await publishPromotionProjection(email, state);
      }
    } else if (state) {
      await publishPromotionProjection(email, state);
    }
  }

  return { couponDelivered, couponProvider, couponError };
}

export type SubscribePromotionFlowResult = {
  isNewSubscriber: boolean;
  emailDelivered: boolean;
  deliveryProvider: string;
  state: PromotionCoordinatorState;
};

export async function subscribePromotionFlow(input: {
  email: string;
  source: string;
  couponCode: string;
}): Promise<SubscribePromotionFlowResult> {
  const email = normalizePromotionEmail(input.email);
  const emailHash = coordinatorEmailHash(email);
  const name = promotionCoordinatorName(emailHash);
  const client = createConsistencyCoordinatorClient();

  const facts = await gatherPromotionLegacyFacts(email);
  const now = Date.now();
  const { isNewSubscriber, state } = await client.subscribePromotion(name, {
    emailHash,
    source: input.source,
    now,
    facts,
    couponPayload: preparePromotionCouponPayload(email, input.couponCode),
    // Used only if the coupon is already accepted but its followup job
    // was never created (partial legacy state) — the recovery path.
    followupPayload: preparePromotionFollowupPayload(
      email,
      input.couponCode,
      new Date(now + getPromotionFollowupDelaySeconds() * 1000).toISOString(),
    ),
  });
  await publishPromotionProjection(email, state);

  const drive = await drivePromotionJobs(client, name, email);
  const finalState = (await client.getPromotionState(name)) ?? state;

  return {
    isNewSubscriber,
    emailDelivered: drive.couponDelivered,
    deliveryProvider: drive.couponProvider,
    state: finalState,
  };
}

export type UnsubscribePromotionFlowResult = {
  wasAlreadyUnsubscribed: boolean;
  state: PromotionCoordinatorState;
};

export async function unsubscribePromotionFlow(input: {
  email: string;
  reason: string;
}): Promise<UnsubscribePromotionFlowResult> {
  const email = normalizePromotionEmail(input.email);
  const emailHash = coordinatorEmailHash(email);
  const name = promotionCoordinatorName(emailHash);
  const client = createConsistencyCoordinatorClient();

  const facts = await gatherPromotionLegacyFacts(email);
  const result = await client.unsubscribePromotion(name, {
    emailHash,
    now: Date.now(),
    reason: input.reason,
    facts,
  });
  // Strict: the opt-out is committed in the coordinator, but the KV
  // projection is the only suppression source the review engine reads
  // — if this write fails, the caller must hear about it and fail
  // closed (the page shows a retryable error) rather than acknowledge
  // an unsubscribe whose suppression record never landed.
  await publishPromotionProjectionStrict(email, result.state);
  return { wasAlreadyUnsubscribed: result.wasAlreadyUnsubscribed, state: result.state };
}
