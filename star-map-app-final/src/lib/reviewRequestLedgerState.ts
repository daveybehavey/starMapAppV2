/**
 * Pure claim/dispatch state machine for ONE review-request ledger row, keyed
 * by Stripe checkout session id. Used by the SQLite Durable Object
 * (ReviewRequestLedgerDO) and by deterministic unit tests.
 *
 * REVISED DESIGN (T-T1 design iteration, burn lane 2026-10-22b pass 1 —
 * supersedes the OurImprint-ported machine that shipped inert in PR #348).
 * The old machine's confirmed defects, and how this one answers them:
 *
 *  - Stale `sending` claims were reclaimed after 15 minutes, so a claimant
 *    displaced mid-send could resume and a crashed attempt could be retried
 *    past the provider's dedupe window. Here a committed dispatch is NEVER
 *    reclaimed: `dispatching` is irreversible, and an outcome that never
 *    resolves becomes terminal `uncertain` (delivery is deliberately
 *    sacrificed when the outcome is unknowable — never resent).
 *  - The 1h/6h/24h backoff ladder could reach ~t0+31h. Retries are now
 *    bounded by an immutable absolute deadline persisted at first dispatch:
 *    retryDeadlineAt = min(eligibilityEndsAt, firstDispatchAt + 23h).
 *    The coordinator samples a fresh clock before every provider invocation
 *    (see begin_dispatch) and refuses at/after the deadline.
 *  - Retries used to re-render the email under the same session key, so the
 *    payload could silently diverge from the first attempt. The complete
 *    provider request is now frozen into the row at first claim; a later
 *    claim presenting a different payload or identity terminalizes the row
 *    as `failed` (payload_diverged) instead of rebuilding.
 *  - Suppression used to be a skip with no ledger trace. It is now a ledger
 *    transition (`mark_suppressed` → terminal `suppressed`), and the final
 *    authoritative suppression check runs inside the dispatch coordinator
 *    immediately before the dispatch commits (reviewRequestSuppression.ts).
 *  - Terminal rows used to keep the recipient address, provider id and claim
 *    token forever. Terminal transitions now strip payload, recipient,
 *    provider id and claim token immediately; `uncertain` rows keep the
 *    recipient only until the redaction pass (DO alarm, ≤15 min) strips it;
 *    `erase` reduces a row to a bare tombstone (GDPR erasure).
 *
 * Every transition runs inside one DO instance and every post-claim
 * transition verifies the claim token, so a displaced claimant can never
 * complete, abandon, or overwrite a newer owner's state.
 */

export type ReviewRequestKind = "digital" | "physical";

export type ReviewLedgerStatus =
  | "claimed"
  | "dispatching"
  | "retry"
  | "sent"
  | "suppressed"
  | "expired"
  | "failed"
  | "uncertain"
  | "erased";

/**
 * The complete provider request, frozen at first claim (design: frozen
 * payload). Retries dispatch this exact object — never a re-render.
 */
export type FrozenReviewPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  idempotencyKey: string;
  tags: Record<string, string>;
};

export type ReviewLedgerState = {
  sessionId: string;
  /** null = no ledger row exists yet for this session. */
  status: ReviewLedgerStatus | null;
  kind: ReviewRequestKind | null;
  email: string | null;
  anchorAt: number | null;
  dueAt: number | null;
  /** End of the classification eligibility window (anchorAt + max age). */
  eligibilityEndsAt: number | null;
  /** First committed dispatch time; set once, never moves. */
  firstDispatchAt: number | null;
  /** Absolute retry deadline persisted at first dispatch; never moves. */
  retryDeadlineAt: number | null;
  payload: FrozenReviewPayload | null;
  /** Committed dispatches (incremented at begin_dispatch, max MAX_ATTEMPTS). */
  attempts: number;
  /** Opaque token of the current claim owner; post-claim ops must present it. */
  claimId: string | null;
  claimedAt: number | null;
  nextAttemptAt: number | null;
  lastError: string | null;
  sentAt: number | null;
  providerId: string | null;
  /** When an `uncertain` row's retained recipient/provider id were stripped. */
  redactedAt: number | null;
  erasedAt: number | null;
  createdAt: number | null;
  updatedAt: number | null;
};

export const REVIEW_REQUEST_MAX_ATTEMPTS = 5;

/** Absolute retry horizon from first dispatch (inside Resend's ~24h dedupe). */
export const REVIEW_REQUEST_RETRY_DEADLINE_MS = 23 * 60 * 60 * 1000;

/** Backoff between committed dispatches: 1h, then 6h, then 24h. */
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
    eligibilityEndsAt: null,
    firstDispatchAt: null,
    retryDeadlineAt: null,
    payload: null,
    attempts: 0,
    claimId: null,
    claimedAt: null,
    nextAttemptAt: null,
    lastError: null,
    sentAt: null,
    providerId: null,
    redactedAt: null,
    erasedAt: null,
    createdAt: null,
    updatedAt: null,
  };
}

const TERMINAL_STATUSES: ReadonlySet<ReviewLedgerStatus> = new Set([
  "sent",
  "suppressed",
  "expired",
  "failed",
  "uncertain",
  "erased",
]);

export function isReviewLedgerTerminal(status: ReviewLedgerStatus | null): boolean {
  return status !== null && TERMINAL_STATUSES.has(status);
}

/** Terminal rows leave the due population forever (one ask only). */
export function isReviewLedgerResolved(state: ReviewLedgerState): boolean {
  return isReviewLedgerTerminal(state.status);
}

export type ReviewDispatchResult =
  | { type: "accepted"; providerId: string }
  | { type: "rejected"; error: string; permanent: boolean }
  | { type: "ambiguous"; error: string };

export type ReviewLedgerOp =
  | {
      type: "begin_claim";
      claimId: string;
      kind: ReviewRequestKind;
      email: string;
      anchorAt: number;
      dueAt: number;
      eligibilityEndsAt: number;
      payload: FrozenReviewPayload;
      now: number;
    }
  | { type: "release_claim"; claimId: string; now: number }
  | { type: "begin_dispatch"; claimId: string; now: number }
  | { type: "resolve_dispatch"; claimId: string; result: ReviewDispatchResult; now: number }
  | { type: "expire_dispatch"; claimId: string; now: number }
  | {
      type: "mark_suppressed";
      claimId?: string;
      kind?: ReviewRequestKind;
      email?: string;
      anchorAt?: number;
      dueAt?: number;
      now: number;
    }
  | { type: "redact"; now: number }
  | { type: "erase"; now: number };

export type ReviewLedgerOpOutcome =
  | "claimed"
  | "released"
  | "dispatching"
  | "completed"
  | "retry_scheduled"
  | "quarantined"
  | "uncertain"
  | "suppressed"
  | "expired"
  | "payload_diverged"
  | "already_resolved"
  | "in_flight"
  | "backoff"
  | "not_claim_owner"
  | "no_row"
  | "redacted"
  | "erased"
  | "no_change";

export type ReviewLedgerApplyResult = {
  state: ReviewLedgerState;
  changed: boolean;
  outcome: ReviewLedgerOpOutcome;
};

/**
 * Errors are diagnostics, not a PII store (design: truncated, not sanitized
 * was the defect). Strip anything address-shaped, then cap the length.
 */
export function sanitizeReviewError(error: string): string {
  const stripped = error.replace(/[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+/g, "[redacted]");
  return stripped.length > 200 ? stripped.slice(0, 200) : stripped;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/** Structural payload equality (key order-insensitive). */
export function reviewPayloadsEqual(a: FrozenReviewPayload, b: FrozenReviewPayload): boolean {
  return stableStringify(a) === stableStringify(b);
}

/**
 * Terminal-state PII strip: payload, recipient, provider id and claim token
 * go immediately. Status, kind, reason and timestamps remain as the
 * tombstone. `uncertain` is the one exception — it retains the recipient
 * until the redaction pass (see redactRow) so an operator can still see who
 * the ambiguous send concerned; its payload is stripped here too.
 */
function stripTerminalPii(state: ReviewLedgerState): ReviewLedgerState {
  return {
    ...state,
    email: null,
    payload: null,
    providerId: null,
    claimId: null,
    claimedAt: null,
    nextAttemptAt: null,
  };
}

function beginClaim(
  state: ReviewLedgerState,
  op: Extract<ReviewLedgerOp, { type: "begin_claim" }>
): ReviewLedgerApplyResult {
  const { now } = op;

  if (isReviewLedgerTerminal(state.status)) {
    return { state, changed: false, outcome: "already_resolved" };
  }
  if (state.status === "dispatching" || state.status === "claimed") {
    // A live claim is never displaced and a committed dispatch is never
    // reclaimed — regardless of age. Crash recovery is the uncertain path.
    return { state, changed: false, outcome: "in_flight" };
  }
  if (state.status === "retry" && (state.nextAttemptAt ?? 0) > now) {
    return { state, changed: false, outcome: "backoff" };
  }

  // From here the row is empty or a due retry. A retry must present the
  // frozen identity/payload of the first claim; anything else terminalizes
  // instead of silently rebuilding (design: frozen payload).
  if (state.payload !== null) {
    const diverged =
      !reviewPayloadsEqual(state.payload, op.payload) || state.kind !== op.kind || state.email !== op.email;
    if (diverged) {
      return {
        state: stripTerminalPii({
          ...state,
          status: "failed",
          lastError: "payload_diverged",
          updatedAt: now,
        }),
        changed: true,
        outcome: "payload_diverged",
      };
    }
  }

  const claimed: ReviewLedgerState = {
    ...state,
    status: "claimed",
    kind: state.kind ?? op.kind,
    email: state.email ?? op.email,
    anchorAt: state.anchorAt ?? op.anchorAt,
    dueAt: state.dueAt ?? op.dueAt,
    eligibilityEndsAt: state.eligibilityEndsAt ?? op.eligibilityEndsAt,
    payload: state.payload ?? op.payload,
    claimId: op.claimId,
    claimedAt: now,
    nextAttemptAt: null,
    createdAt: state.createdAt ?? now,
    updatedAt: now,
  };
  return { state: claimed, changed: true, outcome: "claimed" };
}

function releaseClaim(
  state: ReviewLedgerState,
  op: Extract<ReviewLedgerOp, { type: "release_claim" }>
): ReviewLedgerApplyResult {
  if (state.status === null) return { state, changed: false, outcome: "no_row" };
  if (state.status !== "claimed") {
    return {
      state,
      changed: false,
      outcome: isReviewLedgerTerminal(state.status) ? "already_resolved" : "no_change",
    };
  }
  if (state.claimId !== op.claimId) {
    return { state, changed: false, outcome: "not_claim_owner" };
  }
  // The dispatch never started (the coordinator was unavailable), so no
  // attempt is consumed and nothing about the send is ambiguous: the row
  // returns to a due retry carrying the same frozen payload.
  return {
    state: {
      ...state,
      status: "retry",
      claimId: null,
      claimedAt: null,
      nextAttemptAt: op.now,
      updatedAt: op.now,
    },
    changed: true,
    outcome: "released",
  };
}

function beginDispatch(
  state: ReviewLedgerState,
  op: Extract<ReviewLedgerOp, { type: "begin_dispatch" }>
): ReviewLedgerApplyResult {
  if (state.status === null) return { state, changed: false, outcome: "no_row" };
  if (isReviewLedgerTerminal(state.status)) {
    return { state, changed: false, outcome: "already_resolved" };
  }
  if (state.status === "dispatching") {
    // Never reclaimed, not even by the same owner: the provider call may
    // still be in flight, or its outcome is unknown (→ expire_dispatch).
    return { state, changed: false, outcome: "in_flight" };
  }
  if (state.status !== "claimed" || state.claimId !== op.claimId) {
    return { state, changed: false, outcome: "not_claim_owner" };
  }
  if (state.payload === null) {
    return {
      state: stripTerminalPii({
        ...state,
        status: "failed",
        lastError: "payload_missing",
        updatedAt: op.now,
      }),
      changed: true,
      outcome: "quarantined",
    };
  }

  const firstDispatchAt = state.firstDispatchAt ?? op.now;
  const retryDeadlineAt =
    state.retryDeadlineAt ??
    Math.min(
      state.eligibilityEndsAt ?? Number.POSITIVE_INFINITY,
      firstDispatchAt + REVIEW_REQUEST_RETRY_DEADLINE_MS
    );
  // Fresh-clock deadline enforcement, sampled by the coordinator at every
  // dispatch (design: absolute pre-send retry deadline). At/after the
  // deadline the row expires instead of dispatching.
  if (op.now >= retryDeadlineAt) {
    return {
      state: stripTerminalPii({
        ...state,
        status: "expired",
        firstDispatchAt,
        retryDeadlineAt,
        lastError: "retry_deadline_passed",
        updatedAt: op.now,
      }),
      changed: true,
      outcome: "expired",
    };
  }

  return {
    state: {
      ...state,
      status: "dispatching",
      firstDispatchAt,
      retryDeadlineAt,
      attempts: state.attempts + 1,
      updatedAt: op.now,
    },
    changed: true,
    outcome: "dispatching",
  };
}

function resolveDispatch(
  state: ReviewLedgerState,
  op: Extract<ReviewLedgerOp, { type: "resolve_dispatch" }>
): ReviewLedgerApplyResult {
  if (state.status === null) return { state, changed: false, outcome: "no_row" };
  if (isReviewLedgerTerminal(state.status)) {
    return { state, changed: false, outcome: "already_resolved" };
  }
  if (state.status !== "dispatching") {
    return { state, changed: false, outcome: "no_change" };
  }
  if (state.claimId !== op.claimId) {
    return { state, changed: false, outcome: "not_claim_owner" };
  }
  const { result } = op;

  if (result.type === "accepted") {
    return {
      state: stripTerminalPii({
        ...state,
        status: "sent",
        sentAt: op.now,
        lastError: null,
        updatedAt: op.now,
      }),
      changed: true,
      outcome: "completed",
    };
  }

  if (result.type === "ambiguous") {
    // Terminal `uncertain`: never retried. Payload is stripped now; the
    // recipient/provider id follow within the redaction window (redact).
    return {
      state: {
        ...state,
        status: "uncertain",
        payload: null,
        claimId: null,
        claimedAt: null,
        nextAttemptAt: null,
        lastError: sanitizeReviewError(result.error),
        updatedAt: op.now,
      },
      changed: true,
      outcome: "uncertain",
    };
  }

  // result.type === "rejected" — a definitive provider answer.
  const base: ReviewLedgerState = {
    ...state,
    claimId: null,
    claimedAt: null,
    lastError: sanitizeReviewError(result.error),
    updatedAt: op.now,
  };
  if (result.permanent || state.attempts >= REVIEW_REQUEST_MAX_ATTEMPTS) {
    return {
      state: stripTerminalPii({ ...base, status: "failed" }),
      changed: true,
      outcome: "quarantined",
    };
  }
  return {
    state: {
      ...base,
      status: "retry",
      nextAttemptAt: op.now + reviewSendBackoffMs(state.attempts),
    },
    changed: true,
    outcome: "retry_scheduled",
  };
}

function expireDispatch(
  state: ReviewLedgerState,
  op: Extract<ReviewLedgerOp, { type: "expire_dispatch" }>
): ReviewLedgerApplyResult {
  if (state.status === null) return { state, changed: false, outcome: "no_row" };
  if (isReviewLedgerTerminal(state.status)) {
    return { state, changed: false, outcome: "already_resolved" };
  }
  if (state.status !== "dispatching") {
    return { state, changed: false, outcome: "no_change" };
  }
  if (state.claimId !== op.claimId) {
    return { state, changed: false, outcome: "not_claim_owner" };
  }
  // A committed dispatch whose resolution never arrived (crash between the
  // provider call and its recording): the outcome is unknowable, so the row
  // terminalizes as uncertain. The attempt was already counted at
  // begin_dispatch.
  return {
    state: {
      ...state,
      status: "uncertain",
      payload: null,
      claimId: null,
      claimedAt: null,
      nextAttemptAt: null,
      lastError: "dispatch_resolution_lost",
      updatedAt: op.now,
    },
    changed: true,
    outcome: "uncertain",
  };
}

function markSuppressed(
  state: ReviewLedgerState,
  op: Extract<ReviewLedgerOp, { type: "mark_suppressed" }>
): ReviewLedgerApplyResult {
  if (isReviewLedgerTerminal(state.status)) {
    return { state, changed: false, outcome: "already_resolved" };
  }
  if (state.status === "dispatching") {
    // A provider call is already committed; suppression lands on any future
    // session for this recipient via the suppression store itself.
    return { state, changed: false, outcome: "in_flight" };
  }
  // Suppression is a safety transition: it never requires the claim token
  // and only ever prevents a send.
  const created: ReviewLedgerState =
    state.status === null
      ? {
          ...createEmptyReviewLedgerState(state.sessionId),
          kind: op.kind ?? null,
          anchorAt: op.anchorAt ?? null,
          dueAt: op.dueAt ?? null,
          createdAt: op.now,
        }
      : state;
  return {
    state: stripTerminalPii({
      ...created,
      status: "suppressed",
      updatedAt: op.now,
    }),
    changed: true,
    outcome: "suppressed",
  };
}

function redactRow(
  state: ReviewLedgerState,
  op: Extract<ReviewLedgerOp, { type: "redact" }>
): ReviewLedgerApplyResult {
  if (state.status !== "uncertain") {
    return { state, changed: false, outcome: "no_change" };
  }
  if (state.email === null && state.providerId === null && state.payload === null) {
    return { state, changed: false, outcome: "no_change" };
  }
  return {
    state: {
      ...state,
      email: null,
      providerId: null,
      payload: null,
      redactedAt: op.now,
      updatedAt: op.now,
    },
    changed: true,
    outcome: "redacted",
  };
}

function eraseRow(
  state: ReviewLedgerState,
  op: Extract<ReviewLedgerOp, { type: "erase" }>
): ReviewLedgerApplyResult {
  if (state.status === null) return { state, changed: false, outcome: "no_row" };
  if (state.status === "erased") {
    return { state, changed: false, outcome: "already_resolved" };
  }
  // Erasure wins over every state, including a live claim or dispatch:
  // clearing the claim token means no in-flight resolution can land after.
  // Only the tombstone (status + erasure timestamps) remains.
  return {
    state: {
      ...createEmptyReviewLedgerState(state.sessionId),
      status: "erased",
      erasedAt: op.now,
      updatedAt: op.now,
    },
    changed: true,
    outcome: "erased",
  };
}

export function applyReviewLedgerOp(state: ReviewLedgerState, op: ReviewLedgerOp): ReviewLedgerApplyResult {
  switch (op.type) {
    case "begin_claim":
      return beginClaim(state, op);
    case "release_claim":
      return releaseClaim(state, op);
    case "begin_dispatch":
      return beginDispatch(state, op);
    case "resolve_dispatch":
      return resolveDispatch(state, op);
    case "expire_dispatch":
      return expireDispatch(state, op);
    case "mark_suppressed":
      return markSuppressed(state, op);
    case "redact":
      return redactRow(state, op);
    case "erase":
      return eraseRow(state, op);
  }
}

/**
 * Legacy-row migration (design: existing rows are quarantined, never reset
 * to empty). Rows written by the PR #348 machine use statuses this machine
 * never produces (`sending`) or carry no frozen payload (`retry`), and its
 * terminal rows retain PII. Applied by the ledger DO on load:
 *  - legacy `sending` / payload-less `retry` → `uncertain`, PII stripped
 *    immediately (no redaction window for rows nobody is dispatching);
 *  - legacy terminal rows (`sent`/`failed`) → same status, PII stripped.
 * New-machine rows pass through untouched.
 */
export function migrateLegacyReviewLedgerState(
  state: ReviewLedgerState & { status: string | null },
  now: number
): ReviewLedgerApplyResult {
  const legacyStatus = state.status as string | null;
  if (legacyStatus === "sending" || (legacyStatus === "retry" && state.payload === null)) {
    const base = { ...createEmptyReviewLedgerState(state.sessionId), ...state } as ReviewLedgerState;
    return {
      state: {
        ...stripTerminalPii(base),
        status: "uncertain",
        kind: base.kind,
        anchorAt: base.anchorAt,
        dueAt: base.dueAt,
        attempts: base.attempts,
        lastError: "legacy_quarantined",
        sentAt: null,
        redactedAt: now,
        createdAt: base.createdAt,
        updatedAt: now,
      },
      changed: true,
      outcome: "uncertain",
    };
  }
  if (
    (legacyStatus === "sent" || legacyStatus === "failed") &&
    (state.email !== null || state.payload !== null || state.providerId !== null || state.claimId !== null)
  ) {
    const base = { ...createEmptyReviewLedgerState(state.sessionId), ...state } as ReviewLedgerState;
    return {
      state: { ...stripTerminalPii(base), updatedAt: now },
      changed: true,
      outcome: "redacted",
    };
  }
  return { state: state as ReviewLedgerState, changed: false, outcome: "no_change" };
}
