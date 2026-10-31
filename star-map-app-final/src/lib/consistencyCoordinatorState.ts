/**
 * Pure state machines for the Consistency Coordinator (T-SM-KVRACE).
 *
 * KV cannot make a check-then-write atomic, so three legacy KV flows were
 * racy (audit findings A2-1/A2-2/A2-3, verified 2026-10-23):
 *
 *  - A2-1 magic-link claim: read `usedAt` → mint session → write `usedAt`.
 *    Two concurrent claims both pass the check and mint two sessions.
 *  - A2-2 account email index: read-modify-write of one shared array key.
 *    Two concurrent purchases for one email overwrite each other.
 *  - A2-3 promotions subscribe: next state built from a stale read, sent
 *    markers written only after the provider call. Two concurrent
 *    subscribes both send the coupon email.
 *
 * The fix design (slate-3 pass S3-A) puts the authoritative state for all
 * three in one SQLite-backed Durable Object class (see
 * src/durable-objects/ConsistencyCoordinatorDO.ts), one object per token /
 * email. This module is the pure core: every transition is a function
 * (state, input) -> { state, changed, result } with no I/O, so the DO
 * shell persists a transition with a single document upsert and the unit
 * tests can pin the machines directly. The design's simpler glosses
 * ("mark before issue", "per-session keys", "marker before send") are
 * explicitly NOT sufficient in KV — the memo's closing assessment is why
 * this module exists.
 *
 * Legacy KV data is imported lazily and MONOTONICALLY: an import can add
 * facts (sessions, consumption, accepted sends) but can never clear
 * authoritative state. That is what makes the rolling cutover safe —
 * a stale KV read arriving late cannot resurrect a consumed token, drop
 * a purchase, or un-accept a sent email.
 */
import type { AccountLiteSessionIndexItem } from "@/lib/accountLite";
import type { PromotionEmailState } from "@/lib/promotionSubscriptions";

/* ------------------------------------------------------------------ */
/* Shared constants                                                    */
/* ------------------------------------------------------------------ */

/** One fixed campaign version for the promotions migration (S3-A): a
 *  resubscription must never silently start a fresh campaign. */
export const PROMOTION_CAMPAIGN_VERSION = "v1";

/**
 * Resend keeps idempotency keys for 24 hours (verified against Resend's
 * idempotency-keys documentation, 2026-10-23). An ambiguous job may be
 * retried with its identical key + payload only inside this window,
 * measured from its FIRST attempt; after it, the job blocks instead of
 * risking a duplicate send.
 */
export const PROVIDER_IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Backoff before an ambiguous promotion job is retried. */
export const PROMOTION_JOB_RETRY_DELAY_MS = 5 * 60 * 1000;

/** A claimed (attempting) promotion job whose driver has been silent for
 *  this long is reclaimed by the coordinator alarm. */
export const PROMOTION_JOB_ATTEMPT_STALE_MS = 10 * 60 * 1000;

export const MAX_SESSIONS_PER_EMAIL = 40;

/* ------------------------------------------------------------------ */
/* A2-1 — magic token                                                  */
/* ------------------------------------------------------------------ */

export type MagicTokenCoordinatorState = {
  kind: "magic";
  email: string;
  emailHash: string;
  /** Absolute expiry (ms). For registered tokens this is set explicitly
   *  at issuance; for imported legacy records it is createdAt + TTL. */
  expiresAt: number;
  consumedAt: number | null;
  updatedAt: number;
};

export type LegacyMagicLinkRecord = {
  email?: unknown;
  emailHash?: unknown;
  createdAt?: unknown;
  usedAt?: unknown;
};

export type ConsumeMagicTokenResult =
  | { status: "consumed"; email: string; emailHash: string }
  | { status: "already_consumed" }
  | { status: "expired" }
  | { status: "unknown" };

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function isValidMagicTokenState(value: unknown): value is MagicTokenCoordinatorState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  return (
    state.kind === "magic" &&
    nonEmptyString(state.email) !== null &&
    nonEmptyString(state.emailHash) !== null &&
    finiteNumber(state.expiresAt) !== null &&
    (state.consumedAt === null || finiteNumber(state.consumedAt) !== null) &&
    finiteNumber(state.updatedAt) !== null
  );
}

export function applyRegisterMagicToken(
  state: MagicTokenCoordinatorState | null,
  input: { email: string; emailHash: string; expiresAt: number; now: number },
): { state: MagicTokenCoordinatorState; changed: boolean } {
  if (state) {
    // A token id is a fresh UUID; a second registration for the same
    // object can only be a retry of the same issuance. First write wins.
    return { state, changed: false };
  }
  return {
    state: {
      kind: "magic",
      email: input.email,
      emailHash: input.emailHash,
      expiresAt: input.expiresAt,
      consumedAt: null,
      updatedAt: input.now,
    },
    changed: true,
  };
}

export function applyConsumeMagicToken(
  state: MagicTokenCoordinatorState | null,
  input: { legacyRecord: LegacyMagicLinkRecord | null; legacyTtlMs: number; now: number },
): { state: MagicTokenCoordinatorState | null; changed: boolean; result: ConsumeMagicTokenResult } {
  let current = state;
  let changed = false;

  const legacy = input.legacyRecord;
  const legacyEmail = nonEmptyString(legacy?.email);
  const legacyEmailHash = nonEmptyString(legacy?.emailHash);
  const legacyCreatedAt = finiteNumber(legacy?.createdAt);
  const legacyUsedAt = finiteNumber(legacy?.usedAt);

  if (!current) {
    // Import is the only way in for tokens issued before the cutover (or
    // whose registration never landed). A record without a bounded
    // expiry is never importable: existence alone proves nothing about
    // validity (S3-A failure table).
    if (legacyEmail && legacyEmailHash && legacyCreatedAt !== null) {
      current = {
        kind: "magic",
        email: legacyEmail,
        emailHash: legacyEmailHash,
        expiresAt: legacyCreatedAt + input.legacyTtlMs,
        consumedAt: legacyUsedAt,
        updatedAt: input.now,
      };
      changed = true;
    }
  } else if (legacyUsedAt !== null && current.consumedAt === null) {
    // Monotone merge: a legacy claim that landed during the deploy
    // overlap can only ADD consumption, never clear it.
    current = { ...current, consumedAt: legacyUsedAt, updatedAt: input.now };
    changed = true;
  }

  if (!current) {
    return { state: null, changed: false, result: { status: "unknown" } };
  }
  if (current.consumedAt !== null) {
    return { state: current, changed, result: { status: "already_consumed" } };
  }
  if (input.now >= current.expiresAt) {
    // Rejected even if a stale KV read still returns the record.
    return { state: current, changed, result: { status: "expired" } };
  }

  // The consumption boundary: consumedAt is persisted by the caller
  // (single document upsert) BEFORE any session is issued. At-most-once
  // by design — a crash after this commit spends the token and the user
  // requests a fresh link (S3-A chooses this over retry-minted sessions).
  const consumed: MagicTokenCoordinatorState = {
    ...current,
    consumedAt: input.now,
    updatedAt: input.now,
  };
  return {
    state: consumed,
    changed: true,
    result: { status: "consumed", email: consumed.email, emailHash: consumed.emailHash },
  };
}

/* ------------------------------------------------------------------ */
/* A2-2 — account email session index                                  */
/* ------------------------------------------------------------------ */

export type AccountIndexCoordinatorState = {
  kind: "account";
  emailHash: string;
  /** Every known session row for the email (the 40-row cap applies to
   *  the returned view, not to storage — S3-A). */
  sessions: AccountLiteSessionIndexItem[];
  updatedAt: number;
};

export type AccountSessionsView = {
  emailHash: string;
  updatedAt: number;
  sessions: AccountLiteSessionIndexItem[];
};

export function isValidAccountIndexState(value: unknown): value is AccountIndexCoordinatorState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  if (state.kind !== "account") return false;
  if (nonEmptyString(state.emailHash) === null) return false;
  if (finiteNumber(state.updatedAt) === null) return false;
  if (!Array.isArray(state.sessions)) return false;
  return state.sessions.every(
    (entry) =>
      entry !== null &&
      typeof entry === "object" &&
      nonEmptyString((entry as Record<string, unknown>).sessionId) !== null &&
      finiteNumber((entry as Record<string, unknown>).createdAt) !== null,
  );
}

function mergeLegacySessions(
  state: AccountIndexCoordinatorState,
  legacySessions: AccountLiteSessionIndexItem[] | null,
  legacyUpdatedAt: number | null,
): { state: AccountIndexCoordinatorState; changed: boolean } {
  if (!legacySessions || legacySessions.length === 0) {
    if (legacyUpdatedAt !== null && legacyUpdatedAt > state.updatedAt) {
      return { state: { ...state, updatedAt: legacyUpdatedAt }, changed: true };
    }
    return { state, changed: false };
  }
  const known = new Set(state.sessions.map((entry) => entry.sessionId));
  const additions = legacySessions.filter((entry) => entry && !known.has(entry.sessionId));
  if (additions.length === 0) {
    if (legacyUpdatedAt !== null && legacyUpdatedAt > state.updatedAt) {
      return { state: { ...state, updatedAt: legacyUpdatedAt }, changed: true };
    }
    return { state, changed: false };
  }
  return {
    state: {
      ...state,
      sessions: [...state.sessions, ...additions],
      updatedAt:
        legacyUpdatedAt !== null ? Math.max(state.updatedAt, legacyUpdatedAt) : state.updatedAt,
    },
    changed: true,
  };
}

export function accountSessionsView(
  state: AccountIndexCoordinatorState | null,
): AccountSessionsView | null {
  if (!state || state.sessions.length === 0) return null;
  const sorted = [...state.sessions].sort((a, b) => {
    if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
    // Deterministic tie-break (S3-A): sessionId descending.
    return a.sessionId < b.sessionId ? 1 : a.sessionId > b.sessionId ? -1 : 0;
  });
  return {
    emailHash: state.emailHash,
    updatedAt: state.updatedAt,
    sessions: sorted.slice(0, MAX_SESSIONS_PER_EMAIL),
  };
}

export function applyUpsertAccountSession(
  state: AccountIndexCoordinatorState | null,
  input: {
    emailHash: string;
    session: AccountLiteSessionIndexItem;
    legacySessions: AccountLiteSessionIndexItem[] | null;
    legacyUpdatedAt: number | null;
    now: number;
  },
): { state: AccountIndexCoordinatorState; changed: boolean; view: AccountSessionsView | null } {
  let current: AccountIndexCoordinatorState =
    state ?? { kind: "account", emailHash: input.emailHash, sessions: [], updatedAt: 0 };
  const merged = mergeLegacySessions(current, input.legacySessions, input.legacyUpdatedAt);
  current = merged.state;
  // The op's own session always wins over a stored/imported row with the
  // same id (existing replacement semantics); imports never win.
  const rest = current.sessions.filter((entry) => entry.sessionId !== input.session.sessionId);
  current = {
    ...current,
    sessions: [...rest, input.session],
    updatedAt: input.now,
  };
  return { state: current, changed: true, view: accountSessionsView(current) };
}

export function applyReadAccountSessions(
  state: AccountIndexCoordinatorState | null,
  input: {
    emailHash: string;
    legacySessions: AccountLiteSessionIndexItem[] | null;
    legacyUpdatedAt: number | null;
  },
): { state: AccountIndexCoordinatorState | null; changed: boolean; view: AccountSessionsView | null } {
  if (!state && (!input.legacySessions || input.legacySessions.length === 0)) {
    return { state: null, changed: false, view: null };
  }
  const base: AccountIndexCoordinatorState =
    state ?? { kind: "account", emailHash: input.emailHash, sessions: [], updatedAt: 0 };
  const merged = mergeLegacySessions(base, input.legacySessions, input.legacyUpdatedAt);
  return {
    state: merged.state,
    changed: merged.changed,
    view: accountSessionsView(merged.state),
  };
}

/* ------------------------------------------------------------------ */
/* A2-3 — promotions subscription + durable delivery jobs              */
/* ------------------------------------------------------------------ */

export type PromotionJobKind = "coupon" | "followup";

export type PromotionJobStatus =
  | "pending"
  | "attempting"
  | "accepted"
  | "failed"
  | "blocked"
  | "cancelled";

export type PromotionJobPayload = {
  email: string;
  couponCode: string;
  kind: PromotionJobKind;
  subject: string;
  text: string;
  html: string;
  /** Followup only: the provider-scheduled send instant, frozen at job
   *  creation so a retry submits the identical request. */
  scheduledAtIso?: string;
};

export type PromotionJob = {
  jobId: string;
  kind: PromotionJobKind;
  status: PromotionJobStatus;
  providerIdempotencyKey: string;
  payload: PromotionJobPayload;
  firstAttemptAt: number | null;
  attemptCount: number;
  claimedAt: number | null;
  nextAttemptAt: number | null;
  acceptedAt: number | null;
  /** The provider holding this job's send record: set when an attempt
   *  completes with an outcome that leaves acceptance possible or
   *  proven at that provider (accepted / ambiguous, or a failure with
   *  earlier attempts on record), and preserved by the alarm when it
   *  reclaims an uncertain attempt. A definitive rejection of the
   *  job's ONLY attempt leaves it null instead: acceptance is proven
   *  absent everywhere, so there is nothing to pin. Once set, the job
   *  is PINNED to this provider — the idempotency guarantee covering
   *  the job's key lives there, so a retry may only ever be submitted
   *  under this provider (applyClaimPromotionJob refuses any other,
   *  and the drivers skip a pinned job whose provider is not the
   *  configured selection). */
  provider: string | null;
  providerMessageId: string | null;
  /** Provider the in-flight attempt was submitted to, and whether that
   *  provider guarantees idempotency for it — stamped by the claim
   *  transition from the driver's provider selection BEFORE the
   *  provider call is made. Both null unless the job is `attempting`.
   *  The alarm's stale-claim reclaim reads them: an uncertain attempt
   *  may become retryable only under a proven guarantee (S3-A);
   *  without one it blocks instead of risking a duplicate send. */
  attemptProvider: string | null;
  attemptIdempotencyGuaranteed: boolean | null;
  /** Uncertainty left behind when a job is CANCELLED out of an
   *  in-flight attempt whose acceptance was never resolved: the
   *  ambiguous completion that lands after an opt-out, or the alarm
   *  cancelling a stale claim on an opted-out account. The named
   *  provider may already hold an acceptance for this job's key;
   *  `idempotencyGuaranteed` records whether that provider guaranteed
   *  dedupe for the attempt (the 24h window is enforced from
   *  firstAttemptAt at rearm and at claim). Null whenever no such
   *  unresolved attempt is outstanding — jobs cancelled before any
   *  attempt, definitive outcomes, and accepted jobs carry none. A
   *  resubscribe rearms an uncertain cancellation to `pending` ONLY
   *  while the guarantee is live; otherwise it rearms to `blocked`,
   *  because renewed consent does not prove the original attempt was
   *  not accepted (S3-A). */
  uncertainCancellation: { provider: string | null; idempotencyGuaranteed: boolean } | null;
  lastError: string | null;
  updatedAt: number;
};

/**
 * RD-B (B1A-MODEL §3.1; A1 P-3): the three suppression scopes are
 * DISTINCT records inside the coordinator document — never one bare
 * timestamp standing for all of them. `global` is the marketing
 * unsubscribe (dominates every commercial purpose), `reviewOnly` gates
 * review sends only, and `deliverability` is the bounce/complaint axis
 * (A1 I-5: recorded separately from consent, blocks commercial sends,
 * and is never consent evidence). Each record carries the consent
 * generation current when it was set; the generation counter itself
 * is RD-D's field — until it exists every event is a generation-1
 * event (G-1 / GM-7D assign generation 1 initially), and stamps read
 * the counter when it is present (see suppressionGenerationOf).
 */
export type PromotionSuppressionRecord = {
  active: boolean;
  /** Server time the suppression was recorded; null when never set. */
  setAt: number | null;
  /** Consent generation current when the suppression was recorded. */
  generation: number;
  /** The event that set the record (an entry-point reason such as
   *  "email_link", a provider event ref, "legacy_import"); null when
   *  never set. Preserved when the record is later cleared, so the
   *  most recent setting stays attributable. */
  eventRef: string | null;
};

export type PromotionSuppressions = {
  global: PromotionSuppressionRecord;
  reviewOnly: PromotionSuppressionRecord;
  deliverability: PromotionSuppressionRecord;
};

export type PromotionCoordinatorState = {
  kind: "promotion";
  emailHash: string;
  subscribedAt: number | null;
  unsubscribedAt: number | null;
  unsubscribeReason: string | null;
  lastSource: string | null;
  /** Set when a legacy list (not the per-email state) proved a prior
   *  subscription; carries no timestamp of its own. */
  legacySubscribed: boolean;
  legacyImportCompleted: boolean;
  /** RD-B scoped suppression records (B1A-MODEL §3.1). Optional
   *  because documents written before RD-B carry none: readers use
   *  promotionSuppressionsOf, which derives the global record from
   *  the legacy unsubscribedAt stamp, and every transition that
   *  mutates suppression state stamps the records in step with the
   *  legacy fields so the two never contradict. */
  suppressions?: PromotionSuppressions;
  updatedAt: number;
  jobs: { coupon?: PromotionJob; followup?: PromotionJob };
};

export type PromotionLegacyFacts = {
  state: PromotionEmailState | null;
  /** null = the list was not consulted on this call (the per-email state
   *  already carried the marker, mirroring the legacy route's
   *  short-circuit). Import stays open until facts are complete. */
  inLegacySubscriptionList: boolean | null;
  inLegacySentList: boolean | null;
  inLegacyFollowupList: boolean | null;
};

export type PromotionSendOutcome =
  | { type: "accepted"; provider: string; providerMessageId?: string | null }
  | { type: "ambiguous"; provider: string; error?: string; idempotencyGuaranteed: boolean }
  | { type: "definitive_failure"; provider: string; error?: string }
  | { type: "unconfigured" };

export function promotionJobId(emailHash: string, kind: PromotionJobKind): string {
  return `promotion:${PROMOTION_CAMPAIGN_VERSION}:${kind}:${emailHash}`;
}

export function isValidPromotionJob(value: unknown): value is PromotionJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Record<string, unknown>;
  const payload = job.payload as Record<string, unknown> | null;
  const uncertain = job.uncertainCancellation as Record<string, unknown> | null | undefined;
  return (
    nonEmptyString(job.jobId) !== null &&
    (job.kind === "coupon" || job.kind === "followup") &&
    typeof job.status === "string" &&
    ["pending", "attempting", "accepted", "failed", "blocked", "cancelled"].includes(job.status) &&
    nonEmptyString(job.providerIdempotencyKey) !== null &&
    payload !== null &&
    typeof payload === "object" &&
    typeof payload.email === "string" &&
    typeof payload.subject === "string" &&
    typeof payload.text === "string" &&
    typeof payload.html === "string" &&
    (job.firstAttemptAt === null || finiteNumber(job.firstAttemptAt) !== null) &&
    finiteNumber(job.attemptCount) !== null &&
    (job.claimedAt === null || finiteNumber(job.claimedAt) !== null) &&
    (job.nextAttemptAt === null || finiteNumber(job.nextAttemptAt) !== null) &&
    (job.acceptedAt === null || finiteNumber(job.acceptedAt) !== null) &&
    (job.attemptProvider === null ||
      job.attemptProvider === undefined ||
      nonEmptyString(job.attemptProvider) !== null) &&
    (job.attemptIdempotencyGuaranteed === null ||
      job.attemptIdempotencyGuaranteed === undefined ||
      typeof job.attemptIdempotencyGuaranteed === "boolean") &&
    (uncertain === null ||
      uncertain === undefined ||
      (typeof uncertain === "object" &&
        (uncertain.provider === null || nonEmptyString(uncertain.provider) !== null) &&
        typeof uncertain.idempotencyGuaranteed === "boolean")) &&
    finiteNumber(job.updatedAt) !== null
  );
}

function isValidPromotionSuppressionRecord(
  value: unknown,
): value is PromotionSuppressionRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.active === "boolean" &&
    (record.setAt === null || finiteNumber(record.setAt) !== null) &&
    typeof record.generation === "number" &&
    Number.isInteger(record.generation) &&
    (record.generation as number) >= 1 &&
    (record.eventRef === null || typeof record.eventRef === "string")
  );
}

export function isValidPromotionState(value: unknown): value is PromotionCoordinatorState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  if (state.kind !== "promotion") return false;
  if (nonEmptyString(state.emailHash) === null) return false;
  if (finiteNumber(state.updatedAt) === null) return false;
  if (typeof state.legacyImportCompleted !== "boolean") return false;
  if (typeof state.legacySubscribed !== "boolean") return false;
  if (state.suppressions !== undefined) {
    // Optional (pre-RD-B documents carry none), but a present record
    // set must be exactly the three B1A-MODEL §3.1 scopes, each
    // well-formed — a malformed suppression record must surface as a
    // malformed document, never be silently trusted or ignored.
    const suppressions = state.suppressions as Record<string, unknown> | null;
    if (!suppressions || typeof suppressions !== "object") return false;
    if (!isValidPromotionSuppressionRecord(suppressions.global)) return false;
    if (!isValidPromotionSuppressionRecord(suppressions.reviewOnly)) return false;
    if (!isValidPromotionSuppressionRecord(suppressions.deliverability)) return false;
  }
  const jobs = state.jobs as Record<string, unknown> | null;
  if (!jobs || typeof jobs !== "object") return false;
  if (jobs.coupon !== undefined && !isValidPromotionJob(jobs.coupon)) return false;
  if (jobs.followup !== undefined && !isValidPromotionJob(jobs.followup)) return false;
  return true;
}

function emptySuppressionRecord(): PromotionSuppressionRecord {
  return { active: false, setAt: null, generation: 1, eventRef: null };
}

export function emptyPromotionSuppressions(): PromotionSuppressions {
  return {
    global: emptySuppressionRecord(),
    reviewOnly: emptySuppressionRecord(),
    deliverability: emptySuppressionRecord(),
  };
}

/** The consent generation a new suppression stamp belongs to. The
 *  counter field itself is RD-D's; a document without it is in its
 *  initial generation (G-1: generation 1 is where every identity
 *  starts, and reconstruction assigns generation 1 — GM-7D), so a
 *  stamp recorded before the counter exists is a generation-1 stamp
 *  by construction, and once RD-D's counter is present its value
 *  governs. */
function suppressionGenerationOf(state: PromotionCoordinatorState): number {
  const generation = (state as { generation?: unknown }).generation;
  return typeof generation === "number" && Number.isInteger(generation) && generation >= 1
    ? generation
    : 1;
}

/** The identity's effective suppression records. A document stamped
 *  by an RD-B transition carries them explicitly; a pre-RD-B document
 *  derives its global record from the legacy unsubscribe stamp (the
 *  only suppression fact those documents can hold — review-only and
 *  deliverability suppressions were never recordable before RD-B).
 *  Derivation is read-only: the records are materialized the next
 *  time a transition mutates suppression state. */
export function promotionSuppressionsOf(
  state: PromotionCoordinatorState,
): PromotionSuppressions {
  if (state.suppressions) return state.suppressions;
  const derived = emptyPromotionSuppressions();
  if (state.unsubscribedAt !== null) {
    derived.global = {
      active: true,
      setAt: state.unsubscribedAt,
      generation: 1,
      eventRef: state.unsubscribeReason,
    };
  }
  return derived;
}

function createEmptyPromotionState(emailHash: string, now: number): PromotionCoordinatorState {
  return {
    kind: "promotion",
    emailHash,
    subscribedAt: null,
    unsubscribedAt: null,
    unsubscribeReason: null,
    lastSource: null,
    legacySubscribed: false,
    legacyImportCompleted: false,
    suppressions: emptyPromotionSuppressions(),
    updatedAt: now,
    jobs: {},
  };
}

function legacyAcceptedJob(
  emailHash: string,
  kind: PromotionJobKind,
  acceptedAt: number | null,
  now: number,
): PromotionJob {
  const jobId = promotionJobId(emailHash, kind);
  return {
    jobId,
    kind,
    status: "accepted",
    providerIdempotencyKey: jobId,
    // A legacy-accepted job is terminal and never re-sent, so its frozen
    // payload is never read; the recipient is the only meaningful field.
    payload: { email: "", couponCode: "", kind, subject: "", text: "", html: "" },
    firstAttemptAt: acceptedAt,
    attemptCount: 0,
    claimedAt: null,
    nextAttemptAt: null,
    acceptedAt,
    provider: "legacy",
    providerMessageId: null,
    attemptProvider: null,
    attemptIdempotencyGuaranteed: null,
    uncertainCancellation: null,
    lastError: null,
    updatedAt: now,
  };
}

/**
 * Monotone legacy import. Applies only to an object whose authoritative
 * fields are still untouched (first touch): after the first import pass,
 * stored facts are only ever ADDED (a sent marker can create an accepted
 * legacy job), never overwritten — a projection written back to KV by
 * this system and re-read as a "fact" is therefore a no-op.
 */
function applyPromotionLegacyImport(
  state: PromotionCoordinatorState,
  facts: PromotionLegacyFacts,
  now: number,
): { state: PromotionCoordinatorState; changed: boolean } {
  if (state.legacyImportCompleted) return { state, changed: false };
  let next = state;
  let changed = false;
  const patch = (partial: Partial<PromotionCoordinatorState>) => {
    next = { ...next, ...partial };
    changed = true;
  };

  const legacyState = facts.state;
  const untouched =
    next.subscribedAt === null && next.unsubscribedAt === null && !next.legacySubscribed;
  if (legacyState && untouched) {
    patch({
      subscribedAt: legacyState.subscribedAt ?? null,
      unsubscribedAt: legacyState.unsubscribedAt ?? null,
      unsubscribeReason: legacyState.unsubscribeReason ?? null,
      lastSource: legacyState.lastSource ?? null,
    });
    if (legacyState.unsubscribedAt != null) {
      // RD-B: an imported unsubscribe is a global suppression like any
      // other — stamp the scoped record in the same import so the
      // record set never contradicts the legacy stamp it came from.
      patch({
        suppressions: {
          ...promotionSuppressionsOf(next),
          global: {
            active: true,
            setAt: legacyState.unsubscribedAt,
            generation: 1,
            eventRef: "legacy_import",
          },
        },
      });
    }
  }
  if (!legacyState && facts.inLegacySubscriptionList === true && untouched) {
    patch({ legacySubscribed: true });
  }

  const couponSentAt =
    legacyState?.couponSentAt ??
    (facts.inLegacySentList === true ? null : undefined);
  if (couponSentAt !== undefined && !next.jobs.coupon) {
    patch({
      jobs: { ...next.jobs, coupon: legacyAcceptedJob(next.emailHash, "coupon", couponSentAt, now) },
    });
  }
  const followupSentAt =
    legacyState?.followupSentAt ??
    (facts.inLegacyFollowupList === true ? null : undefined);
  if (followupSentAt !== undefined && !next.jobs.followup) {
    patch({
      jobs: {
        ...next.jobs,
        followup: legacyAcceptedJob(next.emailHash, "followup", followupSentAt, now),
      },
    });
  }

  const factsComplete =
    (legacyState !== null &&
      Boolean(legacyState.subscribedAt) &&
      Boolean(legacyState.couponSentAt) &&
      Boolean(legacyState.followupSentAt)) ||
    (facts.inLegacySubscriptionList !== null &&
      facts.inLegacySentList !== null &&
      facts.inLegacyFollowupList !== null);
  if (factsComplete && !next.legacyImportCompleted) {
    patch({ legacyImportCompleted: true });
  }
  return { state: next, changed };
}

function createPendingJob(
  emailHash: string,
  payload: PromotionJobPayload,
  now: number,
): PromotionJob {
  const jobId = promotionJobId(emailHash, payload.kind);
  return {
    jobId,
    kind: payload.kind,
    status: "pending",
    providerIdempotencyKey: jobId,
    payload,
    firstAttemptAt: null,
    attemptCount: 0,
    claimedAt: null,
    nextAttemptAt: null,
    acceptedAt: null,
    provider: null,
    providerMessageId: null,
    attemptProvider: null,
    attemptIdempotencyGuaranteed: null,
    uncertainCancellation: null,
    lastError: null,
    updatedAt: now,
  };
}

/** Whether a job's recorded uncertain cancellation is covered by a
 *  LIVE provider idempotency guarantee: the cancelled attempt's
 *  provider guaranteed dedupe for the job's key AND the guarantee
 *  window (24h from the first attempt) is still open. Only then may a
 *  same-key retry be scheduled — the provider dedupes it (S3-A). */
function uncertainAttemptCovered(job: PromotionJob, now: number): boolean {
  const uncertain = job.uncertainCancellation;
  if (!uncertain || uncertain.idempotencyGuaranteed !== true) return false;
  return (
    job.firstAttemptAt !== null && now <= job.firstAttemptAt + PROVIDER_IDEMPOTENCY_WINDOW_MS
  );
}

export function applySubscribePromotion(
  state: PromotionCoordinatorState | null,
  input: {
    emailHash: string;
    source: string;
    now: number;
    facts: PromotionLegacyFacts;
    couponPayload: PromotionJobPayload;
    /** Prepared by the caller (its schedule is frozen at creation).
     *  Used only by the accepted-coupon recovery below. */
    followupPayload?: PromotionJobPayload;
  },
): { state: PromotionCoordinatorState; changed: boolean; isNewSubscriber: boolean } {
  let current = state ?? createEmptyPromotionState(input.emailHash, input.now);
  const imported = applyPromotionLegacyImport(current, input.facts, input.now);
  current = imported.state;

  const hadSubscription =
    Boolean(current.subscribedAt) || current.legacySubscribed || Boolean(current.unsubscribedAt);
  const isNewSubscriber = !hadSubscription;

  const jobs = { ...current.jobs };
  // A fresh subscribe is a new business event, but which cancelled
  // jobs it may rearm depends on the certainty the job was cancelled
  // with:
  // - Jobs that provably never produced an accepted send (cancelled
  //   before any claim, or a definitive provider rejection — the
  //   provider answered, so there is no acceptance ambiguity) become
  //   attemptable again under the SAME job id and idempotency key.
  // - A job cancelled out of an UNCERTAIN attempt (recorded in
  //   uncertainCancellation: its provider may already have accepted)
  //   rearms to pending ONLY while that provider's idempotency
  //   guarantee is live — the retry reuses the same key and the
  //   provider dedupes it. Without a live guarantee it rearms to
  //   BLOCKED instead: renewed consent does not prove the original
  //   attempt was not accepted, so the no-guarantee block survives
  //   the rearm and only an operator may reopen the job.
  // Blocked jobs otherwise stay blocked: their ambiguity outlived the
  // provider window and only an operator may reopen them. Accepted
  // jobs are never touched.
  for (const kind of ["coupon", "followup"] as const) {
    const job = jobs[kind];
    if (!job || (job.status !== "cancelled" && job.status !== "failed")) continue;
    if (
      job.status === "cancelled" &&
      job.uncertainCancellation &&
      !uncertainAttemptCovered(job, input.now)
    ) {
      jobs[kind] = {
        ...job,
        status: "blocked",
        claimedAt: null,
        nextAttemptAt: null,
        lastError:
          job.lastError ??
          (job.uncertainCancellation.idempotencyGuaranteed
            ? "idempotency_window_expired"
            : "ambiguous_without_idempotency"),
        updatedAt: input.now,
      };
      continue;
    }
    jobs[kind] = {
      ...job,
      status: "pending",
      claimedAt: null,
      nextAttemptAt: null,
      updatedAt: input.now,
    };
  }
  if (!jobs.coupon) {
    jobs.coupon = createPendingJob(input.emailHash, input.couponPayload, input.now);
  }
  if (!jobs.followup && jobs.coupon?.status === "accepted" && input.followupPayload) {
    // Recovery for partial delivery state: the coupon is already
    // accepted (a legacy import whose followup marker never existed,
    // or an acceptance recorded after an unsubscribe suppressed its
    // followup), so coupon completion — the only other creation
    // point — will never run for it. The legacy subscribe route
    // attempted the followup in exactly this case; create the job
    // here so the drive can send it.
    jobs.followup = createPendingJob(input.emailHash, input.followupPayload, input.now);
  }

  const suppressions = promotionSuppressionsOf(current);
  current = {
    ...current,
    // Mirror the legacy route: a resubscribe after unsubscribe restarts
    // the subscription clock; otherwise the original time stands.
    subscribedAt: current.unsubscribedAt
      ? input.now
      : (current.subscribedAt ?? input.now),
    unsubscribedAt: null,
    unsubscribeReason: null,
    // RD-B: this transition is the shipped re-consent act, and it
    // clears the global suppression record in the same transition
    // that clears unsubscribedAt, so the two never contradict. Only
    // the active flag flips — the most recent suppression's
    // setAt/generation/eventRef stand as its record. (A1 G-3's
    // ceremony rule re-points this clearing to the completed double
    // opt-in when RD-D/RD-K land it; until then the shipped subscribe
    // is the only re-consent act that exists.)
    suppressions: {
      ...suppressions,
      global: suppressions.global.active
        ? { ...suppressions.global, active: false }
        : suppressions.global,
    },
    lastSource: input.source || current.lastSource,
    updatedAt: input.now,
    jobs,
  };
  return { state: current, changed: true, isNewSubscriber };
}

export function applyUnsubscribePromotion(
  state: PromotionCoordinatorState | null,
  input: {
    emailHash: string;
    now: number;
    reason: string;
    facts: PromotionLegacyFacts;
  },
): { state: PromotionCoordinatorState; changed: boolean; wasAlreadyUnsubscribed: boolean } {
  let current = state ?? createEmptyPromotionState(input.emailHash, input.now);
  const imported = applyPromotionLegacyImport(current, input.facts, input.now);
  current = imported.state;

  const wasAlreadyUnsubscribed = Boolean(current.unsubscribedAt);
  if (wasAlreadyUnsubscribed) {
    // Mirror the legacy page exactly: a repeat unsubscribe changes
    // nothing (original timestamps and reason stand). No pending job
    // can exist alongside a set unsubscribedAt — jobs are created only
    // by subscribe, which clears it, and the first unsubscribe already
    // cancelled everything pending.
    return { state: current, changed: imported.changed, wasAlreadyUnsubscribed };
  }
  const jobs = { ...current.jobs };
  for (const kind of ["coupon", "followup"] as const) {
    const job = jobs[kind];
    if (job && job.status === "pending") {
      // Eligible pending jobs only: a job already claimed is mid-attempt
      // against the provider and cannot be un-sent.
      jobs[kind] = { ...job, status: "cancelled", nextAttemptAt: null, updatedAt: input.now };
    }
  }
  current = {
    ...current,
    // Mirror the legacy unsubscribe page: it preserved (or stamped) the
    // original subscribedAt and recorded reason "email_link".
    subscribedAt: current.subscribedAt ?? input.now,
    unsubscribedAt: input.now,
    unsubscribeReason: input.reason,
    // RD-B: the unsubscribe IS the global suppression event (A1 P-3) —
    // stamp its scoped record in the same committing transition
    // (U-2: the commit precedes any success report), so authority
    // readers see one fact in two shapes, never two facts.
    suppressions: {
      ...promotionSuppressionsOf(current),
      global: {
        active: true,
        setAt: input.now,
        generation: suppressionGenerationOf(current),
        eventRef: input.reason,
      },
    },
    updatedAt: input.now,
    jobs,
  };
  return { state: current, changed: true, wasAlreadyUnsubscribed };
}

/**
 * RD-B (A1 I-5): record a deliverability suppression (bounce /
 * complaint) on the identity. This axis is deliberately disjoint from
 * consent: the transition touches ONLY the deliverability record —
 * it does not set or clear any consent fact, does not move the
 * subscription stamps, and is not consent evidence. Recording is
 * idempotent: an already-active record stands (its original stamp
 * is the evidence).
 *
 * Creating the coordinator document is the one place this transition
 * reaches beyond the deliverability record, and it follows subscribe /
 * unsubscribe exactly: a document created here first imports the
 * legacy permission facts (applyPromotionLegacyImport), so it is born
 * carrying the identity's actual consent position. Without the import,
 * a legacy-only subscriber's consent would be stranded in KV — the
 * dispatch fence reads legacy facts only when NO document exists, so
 * the created document would shadow the legacy record and, once the
 * deliverability flag cleared, refuse the subscriber
 * no_permission_record indefinitely (Codex P2 on PR #457). An
 * identity with no legacy consent anywhere still gets a document
 * carrying no subscription fact, and such a document permits nothing
 * (the dispatch fence finds no subscription fact and refuses).
 */
export function applyRecordDeliverabilitySuppression(
  state: PromotionCoordinatorState | null,
  input: {
    emailHash: string;
    now: number;
    eventRef: string;
    facts: PromotionLegacyFacts;
  },
): { state: PromotionCoordinatorState; changed: boolean } {
  let current = state ?? createEmptyPromotionState(input.emailHash, input.now);
  if (state === null) {
    // First creation: import the legacy permission facts the same way
    // subscribe/unsubscribe do, so the document carries the consent
    // fact from creation (see the header note).
    current = applyPromotionLegacyImport(current, input.facts, input.now).state;
  }
  const suppressions = promotionSuppressionsOf(current);
  if (suppressions.deliverability.active) {
    return { state: current, changed: state === null };
  }
  return {
    state: {
      ...current,
      suppressions: {
        ...suppressions,
        deliverability: {
          active: true,
          setAt: input.now,
          generation: suppressionGenerationOf(current),
          eventRef: input.eventRef,
        },
      },
      updatedAt: input.now,
    },
    changed: true,
  };
}

/**
 * RD-B (A1 I-5): clear a deliverability suppression under provider
 * policy (e.g. a remediated bounce). Clearing flips ONLY this
 * record's active flag — it can never clear a consent suppression:
 * a globally unsubscribed identity stays unsubscribed whatever
 * happens on the deliverability axis.
 */
export function applyClearDeliverabilitySuppression(
  state: PromotionCoordinatorState,
  input: { now: number },
): { state: PromotionCoordinatorState; changed: boolean } {
  const suppressions = promotionSuppressionsOf(state);
  if (!suppressions.deliverability.active) return { state, changed: false };
  return {
    state: {
      ...state,
      suppressions: {
        ...suppressions,
        deliverability: { ...suppressions.deliverability, active: false },
      },
      updatedAt: input.now,
    },
    changed: true,
  };
}

export type ClaimPromotionJobResult = {
  jobId: string;
  kind: PromotionJobKind;
  payload: PromotionJobPayload;
  providerIdempotencyKey: string;
  attemptCount: number;
} | null;

export function applyClaimPromotionJob(
  state: PromotionCoordinatorState,
  input: {
    kind: PromotionJobKind;
    now: number;
    /** The driver's provider selection (see selectPromotionProvider):
     *  stamped onto the job with the claim commit, BEFORE the provider
     *  call, so the guarantee covering the attempt survives a driver
     *  crash. A claim without a recorded selection stamps null — the
     *  reclaim then fails closed (no proven guarantee). */
    attemptProvider?: string | null;
    attemptIdempotencyGuaranteed?: boolean | null;
  },
): { state: PromotionCoordinatorState; changed: boolean; claim: ClaimPromotionJobResult } {
  // Opt-out guard: no claim is ever granted on an opted-out account.
  // Unsubscribe cancels pending jobs, so a pending job alongside a set
  // unsubscribedAt should be unreachable — but a claim racing the
  // unsubscribe must not be the hole that lets a delivery through.
  if (state.unsubscribedAt !== null) return { state, changed: false, claim: null };
  const job = state.jobs[input.kind];
  if (!job || job.status !== "pending") return { state, changed: false, claim: null };
  if (job.nextAttemptAt !== null && job.nextAttemptAt > input.now) {
    return { state, changed: false, claim: null };
  }
  if (
    job.firstAttemptAt !== null &&
    input.now > job.firstAttemptAt + PROVIDER_IDEMPOTENCY_WINDOW_MS
  ) {
    // The provider's idempotency guarantee has lapsed for this job's
    // key. If an earlier attempt was accepted but its response lost,
    // re-sending could duplicate — block instead (S3-A).
    const blocked: PromotionJob = {
      ...job,
      status: "blocked",
      claimedAt: null,
      nextAttemptAt: null,
      lastError: job.lastError ?? "idempotency_window_expired",
      updatedAt: input.now,
    };
    return {
      state: { ...state, jobs: { ...state.jobs, [input.kind]: blocked } },
      changed: true,
      claim: null,
    };
  }
  if (job.uncertainCancellation && job.uncertainCancellation.idempotencyGuaranteed !== true) {
    // Backstop: a job cancelled out of an uncertain attempt at a
    // provider with NO idempotency guarantee must never be claimed
    // again — the original submission may already have been accepted
    // and nothing can dedupe a second one. applySubscribePromotion
    // rearms such jobs to blocked, so a pending one here means the
    // record predates or bypassed that rule: fail closed and block it
    // for an operator, like every other uncovered ambiguity (S3-A).
    // (A guaranteed record falls through: the window check above has
    // already bounded it, and the pin below keeps the retry on the
    // provider whose guarantee covers the key.)
    const blocked: PromotionJob = {
      ...job,
      status: "blocked",
      claimedAt: null,
      nextAttemptAt: null,
      lastError: job.lastError ?? "ambiguous_without_idempotency",
      updatedAt: input.now,
    };
    return {
      state: { ...state, jobs: { ...state.jobs, [input.kind]: blocked } },
      changed: true,
      claim: null,
    };
  }
  if (
    job.provider !== null &&
    (input.attemptProvider ?? null) !== null &&
    input.attemptProvider !== job.provider
  ) {
    // Provider pin: an earlier attempt left this job's acceptance
    // uncertain at job.provider — that provider's idempotency
    // guarantee is the only thing covering this job's key. A claim
    // under a different provider would submit the campaign through a
    // provider that cannot dedupe the original attempt, so it is
    // refused (fail closed): the job stays pending, backed off by the
    // standard retry delay so the alarm cannot spin on it, until its
    // own provider is selected again (or the window check above
    // blocks it for good). A claim recording NO selection is not a
    // mismatch: every production claim path derives its selection
    // from the same environment the delivery chain reads, so a null
    // selection means no provider is configured at all and the
    // attempt resolves as unconfigured without sending.
    const backedOff: PromotionJob = {
      ...job,
      nextAttemptAt: input.now + PROMOTION_JOB_RETRY_DELAY_MS,
      lastError: "pinned_provider_unavailable",
      updatedAt: input.now,
    };
    return {
      state: { ...state, jobs: { ...state.jobs, [input.kind]: backedOff } },
      changed: true,
      claim: null,
    };
  }
  const claimed: PromotionJob = {
    ...job,
    status: "attempting",
    claimedAt: input.now,
    firstAttemptAt: job.firstAttemptAt ?? input.now,
    attemptCount: job.attemptCount + 1,
    attemptProvider: input.attemptProvider ?? null,
    attemptIdempotencyGuaranteed: input.attemptIdempotencyGuaranteed ?? null,
    updatedAt: input.now,
  };
  return {
    state: { ...state, jobs: { ...state.jobs, [input.kind]: claimed } },
    changed: true,
    claim: {
      jobId: claimed.jobId,
      kind: claimed.kind,
      payload: claimed.payload,
      providerIdempotencyKey: claimed.providerIdempotencyKey,
      attemptCount: claimed.attemptCount,
    },
  };
}

export function applyCompletePromotionJob(
  state: PromotionCoordinatorState,
  input: {
    kind: PromotionJobKind;
    outcome: PromotionSendOutcome;
    now: number;
    /** When the coupon job is accepted, the followup job is created in
     *  the same transition (S3-A) — its frozen payload is prepared by
     *  the caller because acceptance time sets its schedule. */
    followupPayload?: PromotionJobPayload;
  },
): { state: PromotionCoordinatorState; changed: boolean } {
  const job = state.jobs[input.kind];
  if (!job || job.status !== "attempting") return { state, changed: false };
  const outcome = input.outcome;
  const jobs = { ...state.jobs };

  if (outcome.type === "accepted") {
    jobs[input.kind] = {
      ...job,
      status: "accepted",
      acceptedAt: input.now,
      provider: outcome.provider,
      providerMessageId: outcome.providerMessageId ?? null,
      claimedAt: null,
      nextAttemptAt: null,
      attemptProvider: null,
      attemptIdempotencyGuaranteed: null,
      uncertainCancellation: null,
      lastError: null,
      updatedAt: input.now,
    };
    // The followup is created only for a subscribed account: an
    // unsubscribe that landed mid-attempt leaves the in-flight job
    // alone (it cannot be un-sent), but its completion must not
    // schedule a NEW delivery for an opted-out account. A later
    // explicit subscribe creates the missing followup instead
    // (applySubscribePromotion's accepted-coupon recovery).
    if (
      input.kind === "coupon" &&
      input.followupPayload &&
      !jobs.followup &&
      state.unsubscribedAt === null
    ) {
      jobs.followup = createPendingJob(state.emailHash, input.followupPayload, input.now);
    }
    return { state: { ...state, jobs, updatedAt: input.now }, changed: true };
  }

  if (outcome.type === "unconfigured") {
    // No provider was attempted at all: restore the claim so a later
    // subscribe (or a configured provider) can drive the job — but
    // back the retry off by the standard delay. The job may carry an
    // already-due nextAttemptAt from the schedule that made it
    // claimable; keeping it would schedule the next alarm in the past
    // (nextPromotionAlarmAt prefers that field) and the alarm would
    // refire immediately, spinning on null-selection claims until
    // configuration returns or the window expires. Any recorded
    // uncertainCancellation is preserved: no send happened here, so a
    // prior attempt's uncertainty is exactly as outstanding as before.
    // After an unsubscribe, though, restoring a pending job would
    // leave a deliverable job on an opted-out account — cancel it
    // instead; a fresh subscribe re-arms cancelled jobs.
    jobs[input.kind] = {
      ...job,
      status: state.unsubscribedAt !== null ? "cancelled" : "pending",
      claimedAt: null,
      nextAttemptAt:
        state.unsubscribedAt !== null ? null : input.now + PROMOTION_JOB_RETRY_DELAY_MS,
      attemptCount: Math.max(0, job.attemptCount - 1),
      firstAttemptAt: job.attemptCount <= 1 ? null : job.firstAttemptAt,
      attemptProvider: null,
      attemptIdempotencyGuaranteed: null,
      updatedAt: input.now,
    };
    return { state: { ...state, jobs, updatedAt: input.now }, changed: true };
  }

  if (outcome.type === "definitive_failure") {
    // The provider answered and rejected the submission: acceptance is
    // proven absent, so this attempt carries no uncertainty for the
    // idempotency window to bound. When it was the job's ONLY attempt,
    // clear the window anchor — otherwise a failed job rearmed by a
    // fresh subscribe more than 24h later would be blocked at claim
    // time as though an acceptance were still uncertain, and the
    // subscriber could never recover after the provider fault (say, an
    // invalid key) is repaired. The rearmed job's next claim stamps a
    // fresh anchor. The provider pin is released under the same
    // condition: no acceptance exists at the rejecting provider (or
    // anywhere) for this job's key, so there is nothing for a pin to
    // protect — the rearmed job may be claimed under whichever
    // provider is configured after the repair (say, a switch from the
    // faulting provider to another), instead of being backed off as
    // pinned_provider_unavailable forever. attemptCount is NOT
    // unwound, unlike the unconfigured branch: a provider attempt
    // genuinely occurred, and the count remains the job's attempt
    // history. With earlier attempts on record (attemptCount > 1) the
    // anchor AND the pin are retained: an earlier attempt may have
    // been an uncertain one retried under a guarantee, and this
    // rejection (e.g. a 401, never processed) proves nothing about
    // it — fail closed, per S3-A.
    jobs[input.kind] = {
      ...job,
      status: "failed",
      claimedAt: null,
      nextAttemptAt: null,
      firstAttemptAt: job.attemptCount <= 1 ? null : job.firstAttemptAt,
      provider: job.attemptCount <= 1 ? null : outcome.provider,
      attemptProvider: null,
      attemptIdempotencyGuaranteed: null,
      uncertainCancellation: null,
      lastError: outcome.error ?? "definitive_failure",
      updatedAt: input.now,
    };
    return { state: { ...state, jobs, updatedAt: input.now }, changed: true };
  }

  // Ambiguous: the provider may or may not have accepted.
  if (state.unsubscribedAt !== null) {
    // The account opted out while this attempt was in flight. Whether
    // or not the provider accepted, no retry may be scheduled: end the
    // job as cancelled, and record the attempt's uncertainty on the
    // job — a later explicit subscribe rearms it to pending ONLY while
    // this provider's idempotency guarantee is live; without one it
    // rearms to blocked (see applySubscribePromotion). Renewed consent
    // alone does not make a second submission safe.
    jobs[input.kind] = {
      ...job,
      status: "cancelled",
      claimedAt: null,
      nextAttemptAt: null,
      provider: outcome.provider,
      attemptProvider: null,
      attemptIdempotencyGuaranteed: null,
      uncertainCancellation: {
        provider: outcome.provider,
        idempotencyGuaranteed: outcome.idempotencyGuaranteed,
      },
      lastError: outcome.error ?? "ambiguous_after_unsubscribe",
      updatedAt: input.now,
    };
    return { state: { ...state, jobs, updatedAt: input.now }, changed: true };
  }
  const windowExpired =
    job.firstAttemptAt !== null &&
    input.now > job.firstAttemptAt + PROVIDER_IDEMPOTENCY_WINDOW_MS;
  if (!outcome.idempotencyGuaranteed || windowExpired) {
    jobs[input.kind] = {
      ...job,
      status: "blocked",
      claimedAt: null,
      nextAttemptAt: null,
      provider: outcome.provider,
      attemptProvider: null,
      attemptIdempotencyGuaranteed: null,
      uncertainCancellation: null,
      lastError:
        outcome.error ??
        (outcome.idempotencyGuaranteed ? "idempotency_window_expired" : "ambiguous_without_idempotency"),
      updatedAt: input.now,
    };
    return { state: { ...state, jobs, updatedAt: input.now }, changed: true };
  }
  jobs[input.kind] = {
    ...job,
    status: "pending",
    claimedAt: null,
    nextAttemptAt: input.now + PROMOTION_JOB_RETRY_DELAY_MS,
    provider: outcome.provider,
    attemptProvider: null,
    attemptIdempotencyGuaranteed: null,
    uncertainCancellation: null,
    lastError: outcome.error ?? "ambiguous",
    updatedAt: input.now,
  };
  return { state: { ...state, jobs, updatedAt: input.now }, changed: true };
}

/**
 * Alarm pass: reclaim stale claims (driver crashed mid-attempt). A
 * reclaimed job becomes retryable in the same pass ONLY when the
 * attempt's stamped provider guarantees idempotency and the guarantee
 * window is still open — the retry then repeats the identical key +
 * payload and the provider dedupes it. An uncertain attempt without a
 * proven guarantee (a no-guarantee provider, or no selection recorded)
 * blocks instead of risking a duplicate send (S3-A). The reclaim
 * preserves the attempt's stamped provider in the job's provider
 * record before clearing the stamp: that record is what pins every
 * later retry to the provider covering the job's key. If the
 * subscriber has opted out, a stale claim is CANCELLED instead —
 * unsubscribe cancels pending jobs but cannot touch an in-flight
 * claim, and the crash-recovery path must not resurrect one into a
 * deliverable retry for an opted-out account. The cancellation
 * records the attempt's uncertainty from its claim stamp, so a later
 * explicit subscribe re-arms the job only under a live idempotency
 * guarantee (otherwise it rearms to blocked). Returns the kinds due
 * for an attempt — always empty on an opted-out account.
 */
export function applyPromotionAlarm(
  state: PromotionCoordinatorState,
  input: { now: number },
): { state: PromotionCoordinatorState; changed: boolean; dueKinds: PromotionJobKind[] } {
  let current = state;
  let changed = false;
  const jobs = { ...current.jobs };
  for (const kind of ["coupon", "followup"] as const) {
    const job = jobs[kind];
    if (!job || job.status !== "attempting") continue;
    if (job.claimedAt === null || input.now < job.claimedAt + PROMOTION_JOB_ATTEMPT_STALE_MS) {
      continue;
    }
    if (state.unsubscribedAt !== null) {
      // The opt-out landed while this attempt was in flight. Whether
      // or not the provider accepted it, no retry may be scheduled:
      // cancel the job, mirroring the ambiguous-completion rule, and
      // record the cancelled attempt's uncertainty from its claim
      // stamp (a missing stamp fails closed as no guarantee) so a
      // later resubscribe rearms it only under a live guarantee.
      jobs[kind] = {
        ...job,
        status: "cancelled",
        claimedAt: null,
        nextAttemptAt: null,
        provider: job.attemptProvider ?? job.provider,
        attemptProvider: null,
        attemptIdempotencyGuaranteed: null,
        uncertainCancellation: {
          provider: job.attemptProvider ?? job.provider,
          idempotencyGuaranteed: job.attemptIdempotencyGuaranteed === true,
        },
        lastError: job.lastError ?? "attempt_cancelled_after_unsubscribe",
        updatedAt: input.now,
      };
      changed = true;
      continue;
    }
    const windowExpired =
      job.firstAttemptAt !== null &&
      input.now > job.firstAttemptAt + PROVIDER_IDEMPOTENCY_WINDOW_MS;
    const retryable = job.attemptIdempotencyGuaranteed === true && !windowExpired;
    jobs[kind] = retryable
      ? {
          ...job,
          status: "pending",
          claimedAt: null,
          nextAttemptAt: input.now,
          provider: job.attemptProvider ?? job.provider,
          attemptProvider: null,
          attemptIdempotencyGuaranteed: null,
          lastError: job.lastError ?? "attempt_reclaimed",
          updatedAt: input.now,
        }
      : {
          ...job,
          status: "blocked",
          claimedAt: null,
          nextAttemptAt: null,
          attemptProvider: null,
          attemptIdempotencyGuaranteed: null,
          lastError:
            job.lastError ??
            (windowExpired ? "idempotency_window_expired" : "ambiguous_without_idempotency"),
          updatedAt: input.now,
        };
    changed = true;
  }
  if (changed) current = { ...current, jobs };
  const dueKinds =
    current.unsubscribedAt !== null
      ? []
      : (["coupon", "followup"] as const).filter((kind) => {
          const job = current.jobs[kind];
          return (
            job !== undefined &&
            job.status === "pending" &&
            (job.nextAttemptAt === null || job.nextAttemptAt <= input.now)
          );
        });
  return { state: current, changed, dueKinds };
}

/** The next instant the coordinator alarm must fire for this object, or
 *  null when no job needs future attention. A pending job with no
 *  scheduled retry is armed from its last update + the retry delay:
 *  that is what resumes a job whose creator crashed before the first
 *  send (S3-A), without racing the route's own inline drive. */
export function nextPromotionAlarmAt(
  state: PromotionCoordinatorState,
  now: number,
): number | null {
  void now;
  const candidates: number[] = [];
  for (const kind of ["coupon", "followup"] as const) {
    const job = state.jobs[kind];
    if (!job) continue;
    if (job.status === "pending") {
      candidates.push(job.nextAttemptAt ?? job.updatedAt + PROMOTION_JOB_RETRY_DELAY_MS);
    }
    if (job.status === "attempting" && job.claimedAt !== null) {
      candidates.push(job.claimedAt + PROMOTION_JOB_ATTEMPT_STALE_MS);
    }
  }
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

/** The PromotionEmailState view of authoritative state — written back to
 *  KV as a non-authoritative projection for the readers that predate the
 *  coordinator (admin summary, review-engine opt-out source). */
export function promotionStateView(state: PromotionCoordinatorState): PromotionEmailState {
  const view: PromotionEmailState = {
    subscribedAt: state.subscribedAt ?? state.updatedAt,
    updatedAt: state.updatedAt,
  };
  const couponAcceptedAt = state.jobs.coupon?.acceptedAt ?? null;
  if (couponAcceptedAt !== null) view.couponSentAt = couponAcceptedAt;
  const followupAcceptedAt = state.jobs.followup?.acceptedAt ?? null;
  if (followupAcceptedAt !== null) view.followupSentAt = followupAcceptedAt;
  if (state.unsubscribedAt !== null) view.unsubscribedAt = state.unsubscribedAt;
  if (state.unsubscribeReason !== null) view.unsubscribeReason = state.unsubscribeReason;
  if (state.lastSource !== null) view.lastSource = state.lastSource;
  return view;
}

/* ------------------------------------------------------------------ */
/* RD-B: purpose classification and the suppression gate (A1 §5).      */
/* Address identity and message purpose are classified HERE, in the    */
/* authority's own module — never by labels asserted at call sites     */
/* (RD-A register §2.1; A1 P-1/P-2).                                   */
/* ------------------------------------------------------------------ */

/** The P-2 purpose rows. The three commercial classes require
 *  commercial permission, suppression clearance, and quota/frequency
 *  treatment as commercial; transactional and service sends are the
 *  customer's own transactions and requests. */
export type PromotionPurposeClass =
  | "transactional"
  | "service"
  | "checkout_recovery_promotional"
  | "lifecycle_commercial"
  | "review_request";

export function isCommercialPromotionPurpose(purpose: PromotionPurposeClass): boolean {
  return (
    purpose === "checkout_recovery_promotional" ||
    purpose === "lifecycle_commercial" ||
    purpose === "review_request"
  );
}

/** The sending flow a message originates from, before classification.
 *  A flow is not a purpose: P-1 classifies by content and purpose,
 *  never by the flow's own label. */
export type PromotionPurposeFlow =
  | "transactional"
  | "service"
  | "checkout_recovery"
  | "lifecycle"
  | "review";

/**
 * P-1 classification. A message containing promotional content
 * (coupon, cross-sell, offer) is commercial IN WHOLE, whatever flow
 * sent it: a transactional or service message carrying a coupon is
 * gated as a commercial send, and a checkout-recovery message is the
 * promotional class the moment it carries anything beyond the session
 * link + summary (without promotional content it is the service row's
 * "recovery of an in-progress session's link"). Lifecycle flows
 * (welcome / tips / cross-sell / occasion) and review requests are
 * commercial by definition.
 */
export function classifyPromotionPurpose(input: {
  flow: PromotionPurposeFlow;
  containsPromotionalContent: boolean;
}): PromotionPurposeClass {
  switch (input.flow) {
    case "transactional":
      return input.containsPromotionalContent ? "lifecycle_commercial" : "transactional";
    case "service":
      return input.containsPromotionalContent ? "lifecycle_commercial" : "service";
    case "checkout_recovery":
      return input.containsPromotionalContent ? "checkout_recovery_promotional" : "service";
    case "lifecycle":
      return "lifecycle_commercial";
    case "review":
      return "review_request";
  }
}

export type PromotionSuppressionGateDecision =
  | { permitted: true }
  | {
      permitted: false;
      reason: "globally_suppressed" | "review_suppressed" | "deliverability_suppressed";
    };

/**
 * The suppression gate over the authority's scoped records (P-3):
 * - the global record dominates EVERY commercial purpose;
 * - the review-only record gates review sends only — it is never
 *   read as, or upgraded into, a global suppression (U-7), and it
 *   never gates any other purpose;
 * - the deliverability record blocks commercial sends (I-5);
 * - transactional and service sends are never blocked by any consent
 *   suppression (P-5: a marketing unsubscribe never blocks the
 *   customer's own transactional or service mail; deliverability
 *   handling for essential mail is provider policy, not this gate).
 */
export function evaluateSuppressionGate(input: {
  suppressions: PromotionSuppressions;
  purpose: PromotionPurposeClass;
}): PromotionSuppressionGateDecision {
  const { suppressions, purpose } = input;
  if (!isCommercialPromotionPurpose(purpose)) return { permitted: true };
  if (suppressions.global.active) {
    return { permitted: false, reason: "globally_suppressed" };
  }
  if (purpose === "review_request" && suppressions.reviewOnly.active) {
    return { permitted: false, reason: "review_suppressed" };
  }
  if (suppressions.deliverability.active) {
    return { permitted: false, reason: "deliverability_suppressed" };
  }
  return { permitted: true };
}
