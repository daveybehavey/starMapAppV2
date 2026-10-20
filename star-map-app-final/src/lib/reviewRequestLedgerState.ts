/**
 * Pure claim/send state machine for ONE review-request ledger row, keyed by
 * Stripe checkout session id. Used by the SQLite Durable Object
 * (ReviewRequestLedgerDO) and by deterministic unit tests.
 *
 * Semantics ported from OurImprint's web/lib/reviews.ts claim machine:
 *   beginRequest (insert-or-ignore claim) -> send -> completeRequest (sent),
 *   failures -> abandonRequest with 1h/6h/24h backoff, quarantine at 5 attempts,
 *   stale `sending` claims reclaimed after 15 minutes (the crashed attempt is
 *   consumed, never silently dropped).
 *
 * Why a Durable Object and not KV (design §6 flagged this as the build-time
 * verification item; the Step-0 Codex critique confirmed it as a P1): KV has
 * no create-if-absent primitive and `kv.incr` is read-then-write, so a
 * write-then-verify claim over KV is not a serialization primitive — a losing
 * writer can observe the winner's row late and mutate it, and stale-claim
 * reclaim can hijack an in-flight send. Every transition here runs inside one
 * DO instance and every post-claim transition verifies the claim token, so a
 * displaced claimant can never complete, abandon, or overwrite a newer
 * owner's state.
 */

export type ReviewRequestKind = "digital" | "physical";

export type ReviewLedgerStatus = "sending" | "sent" | "retry" | "failed";

export type ReviewLedgerState = {
  sessionId: string;
  /** null = no ledger row exists yet for this session. */
  status: ReviewLedgerStatus | null;
  kind: ReviewRequestKind | null;
  email: string | null;
  anchorAt: number | null;
  dueAt: number | null;
  attempts: number;
  /** Opaque token of the current claim owner; post-claim ops must present it. */
  claimId: string | null;
  claimedAt: number | null;
  nextAttemptAt: number | null;
  lastError: string | null;
  sentAt: number | null;
  providerId: string | null;
  createdAt: number | null;
  updatedAt: number | null;
};

export const REVIEW_REQUEST_SENDING_STALE_MS = 15 * 60 * 1000;
export const REVIEW_REQUEST_MAX_ATTEMPTS = 5;

/** Backoff after a failed attempt: 1h, then 6h, then 24h (OurImprint ladder). */
export function reviewSendBackoffMs(attempts: number): number {
  if (attempts <= 1) return 60 * 60 * 1000;
  if (attempts === 2) return 6 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

export function createEmptyReviewLedgerState(sessionId: string): ReviewLedgerState {
  return {
    sessionId,
    status: null,
    kind: null,
    email: null,
    anchorAt: null,
    dueAt: null,
    attempts: 0,
    claimId: null,
    claimedAt: null,
    nextAttemptAt: null,
    lastError: null,
    sentAt: null,
    providerId: null,
    createdAt: null,
    updatedAt: null,
  };
}

/** Terminal states remove the session from the due population forever (one ask only). */
export function isReviewLedgerResolved(state: ReviewLedgerState): boolean {
  return state.status === "sent" || state.status === "failed";
}

export type ReviewLedgerOp =
  | {
      type: "begin_claim";
      claimId: string;
      kind: ReviewRequestKind;
      email: string;
      anchorAt: number;
      dueAt: number;
      now: number;
    }
  | { type: "complete_claim"; claimId: string; providerId: string; now: number }
  | {
      type: "abandon_claim";
      claimId: string;
      error: string;
      /** Permanent provider rejection (e.g. invalid recipient): quarantine now, no backoff ladder. */
      permanent: boolean;
      now: number;
    };

export type ReviewLedgerOpOutcome =
  | "claimed"
  | "already_resolved"
  | "in_flight"
  | "backoff"
  | "stale_reclaimed"
  | "completed"
  | "retry_scheduled"
  | "quarantined"
  | "not_claim_owner"
  | "no_row";

export type ReviewLedgerApplyResult = {
  state: ReviewLedgerState;
  changed: boolean;
  outcome: ReviewLedgerOpOutcome;
};

function truncateError(error: string): string {
  return error.length > 200 ? error.slice(0, 200) : error;
}

/**
 * Convert a stale `sending` row into its post-crash state: the crashed send
 * consumed an attempt (mirrors OurImprint's abandon-before-reclaim). Returns
 * the new state and whether the row is now terminally quarantined.
 */
function reclaimStaleClaim(
  state: ReviewLedgerState,
  now: number,
): { state: ReviewLedgerState; quarantined: boolean } {
  const attempts = state.attempts + 1;
  const base: ReviewLedgerState = {
    ...state,
    attempts,
    claimId: null,
    claimedAt: null,
    lastError: "stale_claim_reclaimed",
    updatedAt: now,
  };
  if (attempts >= REVIEW_REQUEST_MAX_ATTEMPTS) {
    return {
      state: { ...base, status: "failed", nextAttemptAt: null },
      quarantined: true,
    };
  }
  return {
    state: { ...base, status: "retry", nextAttemptAt: now + reviewSendBackoffMs(attempts) },
    quarantined: false,
  };
}

function beginClaim(
  state: ReviewLedgerState,
  op: Extract<ReviewLedgerOp, { type: "begin_claim" }>,
): ReviewLedgerApplyResult {
  const { now } = op;

  if (state.status === "sent" || state.status === "failed") {
    return { state, changed: false, outcome: "already_resolved" };
  }

  let current = state;
  if (state.status === "sending") {
    const claimedAt = state.claimedAt ?? 0;
    if (now - claimedAt < REVIEW_REQUEST_SENDING_STALE_MS) {
      return { state, changed: false, outcome: "in_flight" };
    }
    const reclaimed = reclaimStaleClaim(state, now);
    current = reclaimed.state;
    if (reclaimed.quarantined) {
      return { state: current, changed: true, outcome: "already_resolved" };
    }
    // The reclaimed row is now a retry in backoff (backoff >= 1h), so this
    // claim attempt is refused for this tick; the attempt was still consumed.
    return { state: current, changed: true, outcome: "stale_reclaimed" };
  }

  if (current.status === "retry") {
    if ((current.nextAttemptAt ?? 0) > now) {
      return { state: current, changed: false, outcome: "backoff" };
    }
  }

  const claimed: ReviewLedgerState = {
    ...current,
    status: "sending",
    kind: current.kind ?? op.kind,
    email: current.email ?? op.email,
    anchorAt: current.anchorAt ?? op.anchorAt,
    dueAt: current.dueAt ?? op.dueAt,
    claimId: op.claimId,
    claimedAt: now,
    nextAttemptAt: null,
    createdAt: current.createdAt ?? now,
    updatedAt: now,
  };
  return { state: claimed, changed: true, outcome: "claimed" };
}

function completeClaim(
  state: ReviewLedgerState,
  op: Extract<ReviewLedgerOp, { type: "complete_claim" }>,
): ReviewLedgerApplyResult {
  if (state.status === null) {
    return { state, changed: false, outcome: "no_row" };
  }
  if (state.status !== "sending" || state.claimId !== op.claimId) {
    return { state, changed: false, outcome: "not_claim_owner" };
  }
  return {
    state: {
      ...state,
      status: "sent",
      claimId: null,
      claimedAt: null,
      sentAt: op.now,
      providerId: op.providerId,
      lastError: null,
      updatedAt: op.now,
    },
    changed: true,
    outcome: "completed",
  };
}

function abandonClaim(
  state: ReviewLedgerState,
  op: Extract<ReviewLedgerOp, { type: "abandon_claim" }>,
): ReviewLedgerApplyResult {
  if (state.status === null) {
    return { state, changed: false, outcome: "no_row" };
  }
  if (state.status !== "sending" || state.claimId !== op.claimId) {
    return { state, changed: false, outcome: "not_claim_owner" };
  }
  const attempts = state.attempts + 1;
  const base: ReviewLedgerState = {
    ...state,
    attempts,
    claimId: null,
    claimedAt: null,
    lastError: truncateError(op.error),
    updatedAt: op.now,
  };
  if (op.permanent || attempts >= REVIEW_REQUEST_MAX_ATTEMPTS) {
    return {
      state: { ...base, status: "failed", nextAttemptAt: null },
      changed: true,
      outcome: "quarantined",
    };
  }
  return {
    state: { ...base, status: "retry", nextAttemptAt: op.now + reviewSendBackoffMs(attempts) },
    changed: true,
    outcome: "retry_scheduled",
  };
}

export function applyReviewLedgerOp(
  state: ReviewLedgerState,
  op: ReviewLedgerOp,
): ReviewLedgerApplyResult {
  switch (op.type) {
    case "begin_claim":
      return beginClaim(state, op);
    case "complete_claim":
      return completeClaim(state, op);
    case "abandon_claim":
      return abandonClaim(state, op);
  }
}
