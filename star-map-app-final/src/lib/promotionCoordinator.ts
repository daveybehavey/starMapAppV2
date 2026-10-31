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
  ConsistencyCoordinatorUnavailableError,
  type ConsistencyCoordinatorClient,
} from "@/lib/consistencyCoordinator";
import {
  promotionStateView,
  promotionTombstonesOf,
  type PromotionCoordinatorState,
  type PromotionJobKind,
  type PromotionLegacyFacts,
  type PromotionSendOutcome,
} from "@/lib/consistencyCoordinatorState";
import {
  computePromotionKeyedDigest,
  evaluatePromotionTombstoneLookup,
  gatherPromotionTombstoneLookupFacts,
  gatherPromotionTombstoneLookupFactsSync,
  nonRetiredDigestKeyVersions,
  readPromotionDigestKeyRegister,
  resolvePromotionDigestKey,
  type PromotionTombstone,
  type PromotionTombstoneLookupFacts,
} from "@/lib/promotionTombstones";
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
  /** RD-C / GM-7D: set when the creation gate found the identity's
   *  tombstone and created it already-suppressed instead. The flow
   *  result is deliberately shaped like an ordinary subscribe result
   *  (no delivery, not a new subscriber): callers must not be able to
   *  distinguish a tombstoned identity from any other non-delivered
   *  subscribe by the response contract. */
  tombstoneHit?: boolean;
};

/**
 * RD-C / GM-7D: gather the creation gate's lookup facts for one
 * address. A register that cannot be read means coverage is UNKNOWN,
 * and unknown coverage fails the creation closed (a retryable
 * coordinator-unavailable error) — it never degrades into "no
 * tombstones exist" (the #454 lesson: an unreadable authority is not
 * an empty one). Note the asymmetry the gate relies on: an identity
 * carrying NO tombstone record is unaffected by coverage (there is
 * nowhere else a tombstone for it could live), so an unprovisioned
 * digest-key configuration does not disturb ordinary subscribes.
 */
async function gatherTombstoneLookupFactsOrFailClosed(
  email: string,
  now: number,
): Promise<PromotionTombstoneLookupFacts> {
  try {
    return await gatherPromotionTombstoneLookupFacts({ normalizedEmail: email, now });
  } catch (error) {
    throw new ConsistencyCoordinatorUnavailableError(
      "promotion tombstone lookup coverage could not be established",
      { cause: error },
    );
  }
}

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
  const tombstoneLookup = await gatherTombstoneLookupFactsOrFailClosed(email, now);
  const { isNewSubscriber, state, creationGate } = await client.subscribePromotion(name, {
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
    tombstoneLookup,
  });
  if (creationGate === "refused_indeterminate") {
    // GM-7D + AC-17: the stored tombstone evidence could not be
    // resolved (a live digest-key version is unavailable, or a stored
    // record cannot be accounted for). NOTHING was created or
    // imported. Fail closed with the retryable error: the subscribe
    // route answers 503, and no eligible identity exists.
    throw new ConsistencyCoordinatorUnavailableError(
      "promotion creation refused: tombstone lookup indeterminate",
    );
  }
  if (creationGate === "tombstone_hit") {
    // The identity was created already-suppressed at tombstone
    // generation + 1. There are no jobs to drive. The projection is
    // published STRICTLY, like the unsubscribe flow's: this
    // suppression may be the last mutation the identity ever makes,
    // and the review engine reads only the projection.
    await publishPromotionProjectionStrict(email, state);
    return {
      isNewSubscriber: false,
      emailDelivered: false,
      deliveryProvider: "none",
      state,
      tombstoneHit: true,
    };
  }
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

/* ------------------------------------------------------------------ */
/* RD-C flows: erasure, suppression proof, re-key sweep (GM-7).        */
/* These are operator/privacy surfaces, not routes: nothing in this    */
/* build wires them to an HTTP endpoint, and no caller may use the     */
/* proof lookup for anything but suppression enforcement,              */
/* reconstruction prevention, or audit of those two (AC-20).           */
/* ------------------------------------------------------------------ */

/** Remove one address from the legacy address-bearing lists (the
 *  transition-side address deletion of GM-7B(b): the lists are this
 *  system's own records, and the erased address leaves them in the
 *  same flow that commits the tombstone). Idempotent. */
async function removeFromLegacyLists(email: string): Promise<void> {
  for (const listKey of [LEGACY_SUBSCRIPTION_KEY, LEGACY_SENT_KEY, LEGACY_FOLLOWUP_KEY]) {
    const list = await kv.get<string[]>(listKey);
    if (Array.isArray(list) && list.includes(email)) {
      await kv.set(
        listKey,
        list.filter((entry) => entry !== email),
      );
    }
  }
}

export type ErasePromotionIdentityFlowResult = {
  state: PromotionCoordinatorState;
  alreadyErased: boolean;
};

/**
 * RD-C / GM-7B(b)+(c): erase one identity. The coordinator transition
 * commits the reduction to the GM-7A tombstone; this flow then does
 * the transition-side deletions the transition cannot reach: the
 * address leaves the legacy lists, and the KV projection is rewritten
 * STRICTLY with the tombstone-derived view (derived suppression stays
 * visible to legacy readers). Erasure COMPLETES, per GM-7B(b), only
 * when the projection repair sweep (PR-2, RD-E) has converged — the
 * address-named projection KEY is retired by that sweep, not here;
 * until then the address exists only as that key's name and inside
 * this flow's own working values.
 *
 * The tombstone digest is computed under the register's CURRENT
 * version. If that version's key material is not provisioned, the
 * erasure refuses (fail-closed, retryable): an erasure that cannot
 * write a verifiable tombstone must not erase at all. Provisioning
 * digest keys is an operator act outside this build.
 */
export async function erasePromotionIdentityFlow(input: {
  email: string;
}): Promise<ErasePromotionIdentityFlowResult> {
  const email = normalizePromotionEmail(input.email);
  const emailHash = coordinatorEmailHash(email);
  const name = promotionCoordinatorName(emailHash);
  const client = createConsistencyCoordinatorClient();
  const now = Date.now();

  let register;
  try {
    register = await readPromotionDigestKeyRegister(now);
  } catch (error) {
    throw new ConsistencyCoordinatorUnavailableError(
      "promotion erasure unavailable: digest-key register could not be read",
      { cause: error },
    );
  }
  const currentKey = resolvePromotionDigestKey(register.currentVersion);
  if (currentKey === null) {
    throw new ConsistencyCoordinatorUnavailableError(
      `promotion erasure unavailable: digest key v${register.currentVersion} is not provisioned`,
    );
  }
  const keyedDigest = computePromotionKeyedDigest(email, currentKey);
  const facts = await gatherPromotionLegacyFacts(email);
  const result = await client.erasePromotionIdentity(name, {
    emailHash,
    now,
    facts,
    keyedDigest,
    digestKeyVersion: register.currentVersion,
    // The coordinator object identity that commits the event (GM-7A).
    authorityId: name,
  });
  if (result.erasureRefused) {
    throw new ConsistencyCoordinatorUnavailableError(
      `promotion erasure refused by the coordinator: ${result.erasureRefused}`,
    );
  }
  await removeFromLegacyLists(email);
  // Strict: an erasure may be the last mutation this identity ever
  // makes; a lost projection write would leave the pre-erasure view
  // (possibly "subscribed") standing for legacy readers.
  await publishPromotionProjectionStrict(email, result.state);
  return { state: result.state, alreadyErased: result.alreadyErased };
}

export type PromotionTombstoneProof = {
  outcome: "hit" | "no_hit" | "indeterminate";
  reason?: string;
  tombstone?: PromotionTombstone;
  state: PromotionCoordinatorState | null;
};

/**
 * RD-C / GM-7C(b): the suppression-proof lookup. Permitted purposes
 * ONLY (AC-20): suppression enforcement, reconstruction prevention,
 * and audit of those two. It returns the lookup OUTCOME and, on a
 * hit, the tombstone itself — never an address (the store holds
 * none) and never material usable for targeting or enrichment.
 */
export async function lookupPromotionTombstoneProof(input: {
  email: string;
}): Promise<PromotionTombstoneProof> {
  const email = normalizePromotionEmail(input.email);
  const emailHash = coordinatorEmailHash(email);
  const name = promotionCoordinatorName(emailHash);
  const client = createConsistencyCoordinatorClient();
  const now = Date.now();
  const state = await client.getPromotionState(name);
  if (!state) return { outcome: "no_hit", state: null };
  let facts;
  try {
    facts = await gatherPromotionTombstoneLookupFacts({ normalizedEmail: email, now });
  } catch (error) {
    throw new ConsistencyCoordinatorUnavailableError(
      "promotion tombstone proof unavailable: lookup coverage could not be established",
      { cause: error },
    );
  }
  const outcome = evaluatePromotionTombstoneLookup({
    tombstones: promotionTombstonesOf(state),
    facts,
  });
  if (outcome.outcome === "hit") {
    return { outcome: "hit", tombstone: outcome.tombstone, state };
  }
  if (outcome.outcome === "indeterminate") {
    return { outcome: "indeterminate", reason: outcome.reason, state };
  }
  return { outcome: "no_hit", state };
}

export type RekeyPromotionTombstoneSweepResult = {
  disposition: "restamped" | "no_records_under_version" | "no_state";
  restamped: number;
  /** Lookup outcome for this identity before the re-stamp. */
  lookupBefore: "hit" | "no_hit" | "indeterminate" | null;
  /** Lookup outcome after the re-stamp; when the identity was a hit
   *  before, equivalence requires a hit after (AC-16) — the caller
   *  must treat any other result as a failed sweep step and NOT
   *  close the version's dependency on it. */
  lookupAfter: "hit" | "no_hit" | "indeterminate" | null;
  state: PromotionCoordinatorState | null;
};

/**
 * RD-C / GM-7C: ONE identity's step of the re-keying sweep (the sweep
 * as a whole is an operator run over identities whose addresses are
 * legitimately available; this step is its per-identity atom). The
 * caller supplies the address — which is the entire access rule: the
 * sweep can only ever visit identities whose addresses ordinary
 * records still hold, and an erased address can never be supplied
 * from a tombstone (the digest is one-way), so reacquisition of an
 * erased address is structurally impossible, not merely refused.
 * The step re-stamps, then re-evaluates the lookup so the caller can
 * verify equivalent suppression lookup after migration before
 * counting this identity's dependency as migrated (AC-16).
 */
export async function rekeyPromotionTombstoneSweepStep(input: {
  email: string;
  fromVersion: number;
  toVersion: number;
}): Promise<RekeyPromotionTombstoneSweepResult> {
  const email = normalizePromotionEmail(input.email);
  const emailHash = coordinatorEmailHash(email);
  const name = promotionCoordinatorName(emailHash);
  const client = createConsistencyCoordinatorClient();
  const now = Date.now();

  const before = await client.getPromotionState(name);
  if (!before) {
    return {
      disposition: "no_state",
      restamped: 0,
      lookupBefore: null,
      lookupAfter: null,
      state: null,
    };
  }
  let register;
  try {
    register = await readPromotionDigestKeyRegister(now);
  } catch (error) {
    throw new ConsistencyCoordinatorUnavailableError(
      "promotion re-key sweep unavailable: digest-key register could not be read",
      { cause: error },
    );
  }
  if (!nonRetiredDigestKeyVersions(register).includes(input.toVersion)) {
    throw new ConsistencyCoordinatorUnavailableError(
      `promotion re-key sweep refused: target version v${input.toVersion} is not a live lookup version`,
    );
  }
  const factsBefore = gatherPromotionTombstoneLookupFactsSync({
    normalizedEmail: email,
    register,
  });
  const lookupBefore = evaluatePromotionTombstoneLookup({
    tombstones: promotionTombstonesOf(before),
    facts: factsBefore,
  }).outcome;
  const toKey = resolvePromotionDigestKey(input.toVersion);
  if (toKey === null) {
    throw new ConsistencyCoordinatorUnavailableError(
      `promotion re-key sweep unavailable: digest key v${input.toVersion} is not provisioned`,
    );
  }
  const newKeyedDigest = computePromotionKeyedDigest(email, toKey);
  const { state, restamped } = await client.rekeyPromotionTombstones(name, {
    fromVersion: input.fromVersion,
    toVersion: input.toVersion,
    newKeyedDigest,
    now,
  });
  if (restamped === 0 || !state) {
    return {
      disposition: "no_records_under_version",
      restamped: 0,
      lookupBefore,
      lookupAfter: lookupBefore,
      state,
    };
  }
  const lookupAfter = evaluatePromotionTombstoneLookup({
    tombstones: promotionTombstonesOf(state),
    facts: factsBefore,
  }).outcome;
  return { disposition: "restamped", restamped, lookupBefore, lookupAfter, state };
}
