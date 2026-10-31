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
import {
  evaluatePromotionTombstoneLookup,
  isValidPromotionTombstone,
  type PromotionTombstone,
  type PromotionTombstoneLookupFacts,
} from "@/lib/promotionTombstones";

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
 * generation its event belongs to (for a committed unsubscribe, the
 * generation the event creates — G-1/T-2); the counter itself is
 * RD-D's field, read via promotionGenerationOf (absent ⇒ 1).
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

/**
 * RD-D (B1A-MODEL §3.1): one entry of the append-only consent-evidence
 * history (A1 G-4). Appended by the consent transitions themselves —
 * subscribe, a COMMITTED unsubscribe, a completed re-consent ceremony —
 * stamped with the generation the entry belongs to: for an unsubscribe
 * or a completed ceremony that is the generation the transition CREATES
 * (G-1; T-2: an unsubscribe's effect "is stamped with the generation it
 * creates"); for a subscribe, the generation current at the act. The
 * history survives generation changes; erasure's reduction (GM-7B(c))
 * removes it with everything else, converting the identity's evidence
 * to its tombstone and nothing else.
 */
export type PromotionConsentEventKind = "subscribe" | "unsubscribe" | "reconsent";

export type PromotionConsentEvent = {
  kind: PromotionConsentEventKind;
  generation: number;
  /** Server time of the act. */
  serverAt: number;
  surface: string;
  source: string;
  /** The consent disclosure the surface presented, and its hash.
   *  Empty when the calling surface supplied neither (the shipped
   *  pre-RD-K surfaces pass no disclosure stamp; the field records
   *  what was supplied, never an invented value). */
  disclosureVersion: string;
  disclosureHash: string;
  affirmativeAction: string;
  orderRef?: string;
  checkoutRef?: string;
  designRef?: string;
  /** RD-C R-8 (GM-7C(a): every consent-evidence digest records its
   *  digestKeyVersion): the keyed digest of the address under the
   *  digest-key register's current version when the event was
   *  recorded, and that version. Both present or both absent — the
   *  stamp is recorded when the register's current key is
   *  provisioned, and it never gates the consent act it decorates. */
  keyedDigest?: string;
  digestKeyVersion?: number;
};

/** Caller-supplied consent-evidence fields for a transition. The
 *  transition owns kind/generation/serverAt; the caller (a flow, and
 *  behind it a surface) supplies what it presented and did. */
export type PromotionConsentEvidenceInput = {
  surface?: string;
  source?: string;
  disclosureVersion?: string;
  disclosureHash?: string;
  affirmativeAction?: string;
  orderRef?: string;
  checkoutRef?: string;
  designRef?: string;
  /** Computed by the flow from the digest-key register (the pure
   *  transition never touches key material — the RD-C pattern). */
  digestStamp?: { keyedDigest: string; digestKeyVersion: number };
};

/** A1 T-1: confirmation tokens live 48 hours from issuance, judged
 *  on server time. */
export const PROMOTION_CONFIRMATION_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

/**
 * RD-D (B1A-MODEL §3.1; A1 T-1): the identity's one pending
 * double-opt-in / re-consent request. Exactly one live confirmation
 * exists per pending request (AM-09/G-6): the slot holds ONE token
 * hash — the raw token exists only in the confirmation email — and
 * re-issuance replaces the hash in place, superseding the prior
 * unconsumed token. A resolved slot is RETAINED, not deleted: its
 * recorded status is what a replayed token presentation returns
 * (T-1), until a fresh request replaces the slot. Expiry and
 * supersession-by-generation are judged at presentation from the
 * slot + the clock + the current generation, deterministically and
 * with zero mutation, so every replay of the same token returns the
 * same recorded result.
 */
export type PromotionPendingConsent = {
  requestId: string;
  /** The generation the request (and its token) is stamped with. */
  generation: number;
  createdAt: number;
  tokenHash: string;
  tokenExpiresAt: number;
  /** Token issuances for this request: the creation issuance plus
   *  every re-issuance. G-6 dedupe keeps repeat REQUESTS from
   *  minting new tokens, so this counts issuances, not requests. */
  confirmationSendCount: number;
  status: "pending" | "confirmed";
  /** Server time the ceremony completed; null while pending. */
  confirmedAt: number | null;
};

/**
 * RD-D (B1A-MODEL §3.1; A1 G-4): once-ever welcome bookkeeping. This
 * is a DERIVED, monotone summary of the shipped welcome facts — the
 * coupon job's acceptance and the legacy couponSentAt monotone
 * import — never an independent fact: promotionWelcomeStateOf merges
 * the stored value over the job record, transitions materialize the
 * derivation when they commit, and the once-ever enforcement itself
 * stays with the shipped job machinery (one coupon job per identity,
 * never re-minted). Sending is RD-K's; this field only remembers.
 */
export type PromotionWelcomeState = {
  eligibleAt?: number;
  sentAt?: number;
  couponRef?: string;
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
  /** RD-D's consent generation counter (B1A-MODEL §3.1). Optional
   *  until RD-D lands the counter; RD-C's tombstone mechanics read it
   *  (via suppressionGenerationOf) and the GM-7D reconstruction writes
   *  it, because the generation a reconstruction creates at is
   *  assigned by GM-7D(2) itself. Absent = the initial generation. */
  generation?: number;
  /** RD-D (B1A-MODEL §3.1): the append-only consent-evidence history
   *  (A1 G-4). Optional because documents written before RD-D carry
   *  none; readers use promotionConsentEventsOf. */
  consentEvents?: PromotionConsentEvent[];
  /** RD-D (B1A-MODEL §3.1; A1 T-1): the one pending consent request,
   *  or null. Optional for pre-RD-D documents; readers use
   *  promotionPendingConsentOf. */
  pendingConsent?: PromotionPendingConsent | null;
  /** RD-D (B1A-MODEL §3.1; A1 G-4): the derived once-ever welcome
   *  summary. Optional because it is materialized lazily by the
   *  transitions that move the underlying facts; readers use
   *  promotionWelcomeStateOf, which derives it either way. */
  welcomeState?: PromotionWelcomeState;
  /** RD-C (B1A-MODEL §3.1/§3.3): the identity's GM-7A tombstones —
   *  the tombstone store's physical form under the single-document
   *  architecture, indexed logically by keyedDigest under each
   *  non-retired digest-key version. Present only after a terminal
   *  reduction or a reconstruction that carries one forward. */
  tombstones?: PromotionTombstone[];
  /** RD-C (B1A-MODEL §3.1): the keyedDigest of the tombstone that is
   *  this identity's current terminal evidence — set when the
   *  identity's evidence has been reduced per GM-7B(c), and carried
   *  while a reconstruction stands on that tombstone. Superseded
   *  (cleared) only when a creation proceeds on a recorded
   *  accepted-loss basis (see applySubscribePromotion). */
  tombstoneRef?: string;
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

function isValidPromotionConsentEvent(value: unknown): value is PromotionConsentEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  if (event.kind !== "subscribe" && event.kind !== "unsubscribe" && event.kind !== "reconsent") {
    return false;
  }
  if (
    typeof event.generation !== "number" ||
    !Number.isInteger(event.generation) ||
    event.generation < 1
  ) {
    return false;
  }
  if (finiteNumber(event.serverAt) === null) return false;
  if (typeof event.surface !== "string" || typeof event.source !== "string") return false;
  if (typeof event.disclosureVersion !== "string" || typeof event.disclosureHash !== "string") {
    return false;
  }
  if (typeof event.affirmativeAction !== "string") return false;
  for (const ref of ["orderRef", "checkoutRef", "designRef"] as const) {
    if (event[ref] !== undefined && typeof event[ref] !== "string") return false;
  }
  // The R-8 digest stamp is a pair: both fields or neither.
  const hasDigest = event.keyedDigest !== undefined;
  const hasVersion = event.digestKeyVersion !== undefined;
  if (hasDigest !== hasVersion) return false;
  if (hasDigest && nonEmptyString(event.keyedDigest) === null) return false;
  if (
    hasVersion &&
    (typeof event.digestKeyVersion !== "number" ||
      !Number.isInteger(event.digestKeyVersion) ||
      (event.digestKeyVersion as number) < 1)
  ) {
    return false;
  }
  return true;
}

function isValidPromotionPendingConsent(value: unknown): value is PromotionPendingConsent {
  if (!value || typeof value !== "object") return false;
  const pending = value as Record<string, unknown>;
  return (
    nonEmptyString(pending.requestId) !== null &&
    typeof pending.generation === "number" &&
    Number.isInteger(pending.generation) &&
    (pending.generation as number) >= 1 &&
    finiteNumber(pending.createdAt) !== null &&
    nonEmptyString(pending.tokenHash) !== null &&
    finiteNumber(pending.tokenExpiresAt) !== null &&
    typeof pending.confirmationSendCount === "number" &&
    Number.isInteger(pending.confirmationSendCount) &&
    (pending.confirmationSendCount as number) >= 1 &&
    (pending.status === "pending" || pending.status === "confirmed") &&
    (pending.confirmedAt === null || finiteNumber(pending.confirmedAt) !== null) &&
    // A pending request has no completion stamp; a confirmed one must
    // carry it — the pair is the recorded result a replay returns.
    (pending.status === "pending") === (pending.confirmedAt === null)
  );
}

function isValidPromotionWelcomeState(value: unknown): value is PromotionWelcomeState {
  if (!value || typeof value !== "object") return false;
  const welcome = value as Record<string, unknown>;
  if (welcome.eligibleAt !== undefined && finiteNumber(welcome.eligibleAt) === null) return false;
  if (welcome.sentAt !== undefined && finiteNumber(welcome.sentAt) === null) return false;
  if (welcome.couponRef !== undefined && nonEmptyString(welcome.couponRef) === null) return false;
  return true;
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
  if (state.generation !== undefined) {
    if (
      typeof state.generation !== "number" ||
      !Number.isInteger(state.generation) ||
      state.generation < 1
    ) {
      return false;
    }
  }
  if (state.consentEvents !== undefined) {
    // Optional (pre-RD-D documents carry none), but a present history
    // must be well-formed entry by entry — malformed consent evidence
    // surfaces as a malformed document, never as silently trusted or
    // silently dropped history (the suppressions/tombstones posture).
    if (!Array.isArray(state.consentEvents)) return false;
    for (const event of state.consentEvents) {
      if (!isValidPromotionConsentEvent(event)) return false;
    }
  }
  if (state.pendingConsent !== undefined && state.pendingConsent !== null) {
    if (!isValidPromotionPendingConsent(state.pendingConsent)) return false;
  }
  if (state.welcomeState !== undefined && !isValidPromotionWelcomeState(state.welcomeState)) {
    return false;
  }
  if (state.tombstoneRef !== undefined && nonEmptyString(state.tombstoneRef) === null) {
    return false;
  }
  if (state.tombstones !== undefined) {
    // A present tombstone set must be exactly GM-7A records: a
    // malformed or extra-field tombstone surfaces as a malformed
    // document, never as silently trusted suppression evidence.
    if (!Array.isArray(state.tombstones)) return false;
    for (const tombstone of state.tombstones) {
      if (!isValidPromotionTombstone(tombstone)) return false;
    }
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

/** RD-D: the identity's current consent generation (A1 G-1). The
 *  counter is a document field, but a document written before it
 *  existed (or before any incrementing transition ran) is in its
 *  initial generation by construction: generation 1 is where every
 *  identity starts, and reconstruction assigns generation 1 (GM-7D).
 *  Absent ⇒ 1; a present-but-malformed counter is a malformed
 *  document (isValidPromotionState), never a read-time surprise. */
export function promotionGenerationOf(state: PromotionCoordinatorState): number {
  const generation = state.generation;
  return typeof generation === "number" && Number.isInteger(generation) && generation >= 1
    ? generation
    : 1;
}

/** The consent generation a new suppression stamp belongs to. */
function suppressionGenerationOf(state: PromotionCoordinatorState): number {
  return promotionGenerationOf(state);
}

/** RD-D: the identity's consent-evidence history (empty for any
 *  document written before RD-D). */
export function promotionConsentEventsOf(
  state: PromotionCoordinatorState,
): PromotionConsentEvent[] {
  return state.consentEvents ?? [];
}

/** RD-D: the identity's pending consent request, if one stands. */
export function promotionPendingConsentOf(
  state: PromotionCoordinatorState,
): PromotionPendingConsent | null {
  return state.pendingConsent ?? null;
}

function buildConsentEvent(input: {
  kind: PromotionConsentEventKind;
  generation: number;
  now: number;
  evidence?: PromotionConsentEvidenceInput;
  fallbackSurface: string;
  fallbackSource: string;
  fallbackAction: string;
}): PromotionConsentEvent {
  const evidence = input.evidence;
  const event: PromotionConsentEvent = {
    kind: input.kind,
    generation: input.generation,
    serverAt: input.now,
    surface: evidence?.surface ?? input.fallbackSurface,
    source: evidence?.source ?? input.fallbackSource,
    disclosureVersion: evidence?.disclosureVersion ?? "",
    disclosureHash: evidence?.disclosureHash ?? "",
    affirmativeAction: evidence?.affirmativeAction ?? input.fallbackAction,
  };
  if (evidence?.orderRef !== undefined) event.orderRef = evidence.orderRef;
  if (evidence?.checkoutRef !== undefined) event.checkoutRef = evidence.checkoutRef;
  if (evidence?.designRef !== undefined) event.designRef = evidence.designRef;
  if (evidence?.digestStamp) {
    event.keyedDigest = evidence.digestStamp.keyedDigest;
    event.digestKeyVersion = evidence.digestStamp.digestKeyVersion;
  }
  return event;
}

function appendConsentEvent(
  state: PromotionCoordinatorState,
  event: PromotionConsentEvent,
): PromotionConsentEvent[] {
  return [...(state.consentEvents ?? []), event];
}

/**
 * RD-D: the identity's once-ever welcome state, derived. The stored
 * field wins field-by-field (it is the monotone record — a stored
 * eligibleAt never moves, even when a later resubscribe moves
 * subscribedAt); whatever the stored field lacks is derived from the
 * shipped facts: eligibility begins at the subscription fact, and
 * the coupon job's acceptance is the welcome's sent fact, with the
 * job id as its reference. An identity whose coupon was accepted by
 * legacy import derives the same state as one the coordinator drove
 * — the fact is the acceptance, not the path.
 */
export function promotionWelcomeStateOf(
  state: PromotionCoordinatorState,
): PromotionWelcomeState {
  const derived: PromotionWelcomeState = { ...(state.welcomeState ?? {}) };
  const coupon = state.jobs.coupon;
  if (coupon?.status === "accepted" && coupon.acceptedAt !== null) {
    if (derived.sentAt === undefined) derived.sentAt = coupon.acceptedAt;
    if (derived.couponRef === undefined) derived.couponRef = coupon.jobId;
    if (derived.eligibleAt === undefined) derived.eligibleAt = coupon.acceptedAt;
  }
  if (derived.eligibleAt === undefined && state.subscribedAt !== null) {
    derived.eligibleAt = state.subscribedAt;
  }
  return derived;
}

/** Materialize the welcome derivation onto a state a transition is
 *  committing, so the stored field stands even if the underlying job
 *  record is later rearmed or replaced. No-op when nothing is
 *  derivable or the stored field already says it all. */
function withMaterializedWelcomeState(
  state: PromotionCoordinatorState,
): PromotionCoordinatorState {
  const derived = promotionWelcomeStateOf(state);
  if (Object.keys(derived).length === 0) return state;
  const stored = state.welcomeState;
  if (
    stored &&
    stored.eligibleAt === derived.eligibleAt &&
    stored.sentAt === derived.sentAt &&
    stored.couponRef === derived.couponRef
  ) {
    return state;
  }
  return { ...state, welcomeState: derived };
}

/** RD-C: the identity's stored tombstones (empty for any document
 *  written before a terminal reduction). */
export function promotionTombstonesOf(state: PromotionCoordinatorState): PromotionTombstone[] {
  return state.tombstones ?? [];
}

/** RD-C: the governing tombstone — the one with the highest
 *  generation (the latest terminal event), or undefined when the
 *  identity has never been reduced. */
export function latestPromotionTombstone(
  state: PromotionCoordinatorState,
): PromotionTombstone | undefined {
  const tombstones = promotionTombstonesOf(state);
  let latest: PromotionTombstone | undefined;
  for (const tombstone of tombstones) {
    if (
      !latest ||
      tombstone.generation > latest.generation ||
      (tombstone.generation === latest.generation && tombstone.terminalAt > latest.terminalAt)
    ) {
      latest = tombstone;
    }
  }
  return latest;
}

/**
 * RD-C: whether the document is in its REDUCED form — the identity's
 * evidence has been converted to its tombstone and nothing else
 * (GM-7B(c)): a tombstoneRef stands, and no subscription or
 * unsubscribe stamp has been written since. A reconstruction clears
 * the reduced form by stamping its suppression (unsubscribedAt is
 * set), so this predicate turns false the moment the identity exists
 * again — even though it exists only as already-suppressed.
 */
export function isReducedPromotionState(state: PromotionCoordinatorState): boolean {
  return (
    state.tombstoneRef !== undefined &&
    state.subscribedAt === null &&
    state.unsubscribedAt === null
  );
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
    // RD-D: a new document starts with an empty consent history and
    // no pending request. The generation counter itself stays absent
    // (⇒ generation 1 by derivation) until an incrementing transition
    // or a GM-7D reconstruction materializes it.
    consentEvents: [],
    pendingConsent: null,
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

/** RD-C / GM-7D: how the creation gate disposed of a subscribe. */
export type PromotionCreationGateOutcome =
  | "proceeded"
  | "tombstone_hit"
  | "refused_indeterminate";

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
    /** RD-C / GM-7D: the tombstone-lookup facts for this address,
     *  gathered by the caller (register coverage + candidate digests
     *  per digest-key version — see gatherPromotionTombstoneLookupFacts
     *  in promotionTombstones.ts). REQUIRED: a creation path that
     *  cannot present its lookup facts does not get to create. */
    tombstoneLookup: PromotionTombstoneLookupFacts;
    /** RD-D: consent-evidence fields for the subscribe event this
     *  transition appends (the flow supplies what the surface
     *  presented; see PromotionConsentEvidenceInput). */
    evidence?: PromotionConsentEvidenceInput;
  },
): {
  state: PromotionCoordinatorState;
  changed: boolean;
  isNewSubscriber: boolean;
  creationGate: PromotionCreationGateOutcome;
} {
  // GM-7D creation gate — FIRST, before any import or creation work,
  // in the order GM-7D fixes: (1) consult the tombstone store across
  // all non-retired digest-key versions; (2) on a hit, create the
  // identity already-suppressed at tombstone generation + 1 with the
  // tombstone as its terminal evidence; (3) on no hit, create per the
  // normal path below (GM-2's detailed contents are not produced —
  // the shipped creation semantics are what a no-hit creation runs).
  // An INDETERMINATE lookup (a live version's key unavailable, or a
  // stored tombstone that cannot be accounted for) refuses the
  // creation outright: no mutation, no import, no eligible identity —
  // missing evidence never establishes consent (S88-6 AC-17).
  if (state && promotionTombstonesOf(state).length > 0) {
    const lookup = evaluatePromotionTombstoneLookup({
      tombstones: promotionTombstonesOf(state),
      facts: input.tombstoneLookup,
    });
    if (lookup.outcome === "indeterminate") {
      return {
        state,
        changed: false,
        isNewSubscriber: false,
        creationGate: "refused_indeterminate",
      };
    }
    if (lookup.outcome === "hit") {
      const tombstone = lookup.tombstone;
      const generation = tombstone.generation + 1;
      const suppressions = promotionSuppressionsOf(state);
      const reconstructed: PromotionCoordinatorState = {
        ...state,
        generation,
        // Created already-suppressed: no subscription fact, no jobs,
        // no welcome — the suppression below is the whole creation.
        subscribedAt: null,
        unsubscribedAt: input.now,
        unsubscribeReason: null,
        legacySubscribed: false,
        // The tombstone line is this identity's evidence; a legacy
        // import must never re-run against it and resurrect facts
        // the erasure removed.
        legacyImportCompleted: true,
        suppressions: {
          ...suppressions,
          global: {
            active: true,
            setAt: input.now,
            generation,
            eventRef: "tombstone_reconstruction",
          },
        },
        tombstoneRef: tombstone.keyedDigest,
        updatedAt: input.now,
        jobs: {},
      };
      return {
        state: reconstructed,
        changed: true,
        isNewSubscriber: false,
        creationGate: "tombstone_hit",
      };
    }
    // No hit with stored tombstones: every stored tombstone sits
    // under a RETIRED digest-key version — invisible by that
    // retirement's own recorded basis (a completed re-key sweep, or
    // the gate's recorded acceptance that lookups under it fail,
    // GM-7C(d)). Creation proceeds, and the creation supersedes the
    // tombstone as the identity's terminal evidence: the ref is
    // cleared. The tombstone records themselves stay in the document
    // — deleting them would be a further act, not a side effect of
    // the acceptance the gate already recorded.
    state = { ...state, tombstoneRef: undefined };
  }
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
    // RD-D: the subscribe is a consent fact — append its evidence
    // entry at the generation current for the act. Subscribing alone
    // NEVER increments the counter (G-1/G-3: only a committed
    // unsubscribe or a completed ceremony does), including this
    // shipped immediate re-consent path, whose ceremony split lands
    // with RD-K/L-1. The tombstone-hit path above appends nothing:
    // a reconstruction's evidence is the tombstone it stands on.
    consentEvents: appendConsentEvent(
      current,
      buildConsentEvent({
        kind: "subscribe",
        generation: suppressionGenerationOf(current),
        now: input.now,
        evidence: input.evidence,
        fallbackSurface: input.source,
        fallbackSource: input.source,
        fallbackAction: "subscribe",
      }),
    ),
    lastSource: input.source || current.lastSource,
    updatedAt: input.now,
    jobs,
  };
  return {
    state: withMaterializedWelcomeState(current),
    changed: true,
    isNewSubscriber,
    creationGate: "proceeded",
  };
}

export function applyUnsubscribePromotion(
  state: PromotionCoordinatorState | null,
  input: {
    emailHash: string;
    now: number;
    reason: string;
    facts: PromotionLegacyFacts;
    /** RD-D: consent-evidence fields for the unsubscribe event this
     *  transition appends when it commits. */
    evidence?: PromotionConsentEvidenceInput;
  },
): { state: PromotionCoordinatorState; changed: boolean; wasAlreadyUnsubscribed: boolean } {
  if (state && isReducedPromotionState(state)) {
    // RD-C: erasure is stronger than unsubscribe — the identity's
    // evidence is its tombstone and nothing else. An unsubscribe
    // against a reduced document records nothing (an import or a
    // stamp here would resurrect evidence the erasure removed) and
    // reports the identity as already unsubscribed: it stands
    // suppressed more strongly than an unsubscribe suppresses.
    return { state, changed: false, wasAlreadyUnsubscribed: true };
  }
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
  // RD-D / G-1: a COMMITTED unsubscribe is one of exactly two
  // incrementing event classes. The counter advances by one, and the
  // suppression record + consent event are stamped with the
  // generation the unsubscribe CREATES (T-2: an unsubscribe's effect
  // "is stamped with the generation it creates") — the same
  // convention as GM-7D reconstruction, whose record is stamped with
  // the generation the identity then stands in. (The repeat path
  // above commits nothing and increments nothing; a legacy import
  // that already carries the unsubscribe is historical generation-1
  // evidence under GM-1, not a new commit, and never reaches here.)
  const generation = suppressionGenerationOf(current) + 1;
  current = {
    ...current,
    // Mirror the legacy unsubscribe page: it preserved (or stamped) the
    // original subscribedAt and recorded reason "email_link".
    subscribedAt: current.subscribedAt ?? input.now,
    unsubscribedAt: input.now,
    unsubscribeReason: input.reason,
    generation,
    // RD-B: the unsubscribe IS the global suppression event (A1 P-3) —
    // stamp its scoped record in the same committing transition
    // (U-2: the commit precedes any success report), so authority
    // readers see one fact in two shapes, never two facts.
    suppressions: {
      ...promotionSuppressionsOf(current),
      global: {
        active: true,
        setAt: input.now,
        generation,
        eventRef: input.reason,
      },
    },
    consentEvents: appendConsentEvent(
      current,
      buildConsentEvent({
        kind: "unsubscribe",
        generation,
        now: input.now,
        evidence: input.evidence,
        fallbackSurface: input.reason,
        fallbackSource: input.reason,
        fallbackAction: "unsubscribe",
      }),
    ),
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
  if (state && isReducedPromotionState(state)) {
    // RD-C: a reduced document holds its tombstone and nothing else;
    // stamping a deliverability record onto it would re-create
    // evidence the erasure removed. The identity is already
    // suppressed on every axis that matters — no-op.
    return { state, changed: false };
  }
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
  if (isReducedPromotionState(state)) {
    // RD-C: same rule as recording — a reduced document is its
    // tombstone and nothing else; there is no deliverability record
    // to clear and none may be materialized here.
    return { state, changed: false };
  }
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

/* ------------------------------------------------------------------ */
/* RD-D: pending consent and the re-consent ceremony (A1 G-1..G-4,     */
/* G-6, T-1; A2 GM-6; AM-09 as repaired).                              */
/* ------------------------------------------------------------------ */

export type PromotionConsentRequestOutcome =
  /** A new pending request was recorded (the slot's first issuance
   *  is created with it — confirmationSendCount 1). */
  | "created"
  /** G-6 dedupe: a live current-generation request already stands;
   *  the repeat created nothing and minted no new token. */
  | "existing"
  /** The identity's evidence is its tombstone (GM-7B(c)): a pending
   *  request is new consent evidence, and a reduced document holds
   *  none. Creation for an erased identity runs through the GM-7D
   *  gate, never around it. */
  | "not_created_reduced";

/**
 * RD-D: record a fresh, explicit re-consent / double-opt-in request
 * (the ceremony's entry step, G-3/GM-6). The request creates pending
 * consent stamped with the CURRENT generation — and nothing else:
 * it does not clear suppression, does not increment the generation,
 * and admits no send of any class (suppression remains fully in
 * force until the ceremony completes; the dispatch gate reads the
 * suppression records, which a pending request never touches).
 *
 * AM-09 AS REPAIRED governs creation on a suppressed address: the
 * B1 round's original cell ("a pending request created after a
 * global suppression is not created at all") was identified by the
 * two-repairs filing as the defect that blocked the ceremony's
 * entry step, and the chair-accepted replacement cell provides that
 * a fresh explicit request DOES create the current-generation
 * pending request on a globally suppressed address. This transition
 * therefore refuses creation on exactly one ground: a reduced
 * (erased) document.
 *
 * Dedupe (G-6): a live, unexpired, current-generation pending
 * request already standing is returned as-is — repeat requests
 * cannot mint unbounded tokens or confirmation mail. An expired,
 * confirmed, or stale-generation slot is replaced by the fresh
 * request (a stale slot's token stays inert under G-2 whatever
 * happens here; replacing the slot asserts nothing about it).
 *
 * A document created by this transition first imports the legacy
 * permission facts, exactly like the other document-creating
 * transitions (the deliverability-creation precedent): the pending
 * request is then judged against the identity's actual consent
 * position, and the created document never shadows legacy consent.
 */
export function applyRequestPromotionConsent(
  state: PromotionCoordinatorState | null,
  input: {
    emailHash: string;
    now: number;
    facts: PromotionLegacyFacts;
    /** Minted by the caller (the transition is pure). */
    requestId: string;
    /** Hash of the confirmation token minted by the caller; the raw
     *  token never enters the state machine (T-1). */
    tokenHash: string;
  },
): {
  state: PromotionCoordinatorState;
  changed: boolean;
  outcome: PromotionConsentRequestOutcome;
  pendingConsent: PromotionPendingConsent | null;
} {
  if (state && isReducedPromotionState(state)) {
    return { state, changed: false, outcome: "not_created_reduced", pendingConsent: null };
  }
  let current = state ?? createEmptyPromotionState(input.emailHash, input.now);
  let importChanged = false;
  if (state === null) {
    const imported = applyPromotionLegacyImport(current, input.facts, input.now);
    current = imported.state;
    importChanged = imported.changed;
  }
  const generation = promotionGenerationOf(current);
  const existing = current.pendingConsent ?? null;
  if (
    existing &&
    existing.status === "pending" &&
    existing.generation === generation &&
    input.now < existing.tokenExpiresAt
  ) {
    return { state: current, changed: importChanged, outcome: "existing", pendingConsent: existing };
  }
  const pendingConsent: PromotionPendingConsent = {
    requestId: input.requestId,
    generation,
    createdAt: input.now,
    tokenHash: input.tokenHash,
    tokenExpiresAt: input.now + PROMOTION_CONFIRMATION_TOKEN_TTL_MS,
    confirmationSendCount: 1,
    status: "pending",
    confirmedAt: null,
  };
  return {
    state: { ...current, pendingConsent, updatedAt: input.now },
    changed: true,
    outcome: "created",
    pendingConsent,
  };
}

export type PromotionConfirmationReissueOutcome =
  /** The slot's token was rotated: the prior unconsumed token is
   *  superseded from this commit on. */
  | "reissued"
  | "no_pending_request"
  /** The standing request is confirmed, expired, or stamped under
   *  an older generation — re-issuing a token for it would mint an
   *  artefact that is already inert (G-2). */
  | "not_live";

/**
 * RD-D / T-1 rotation: re-issue the confirmation token for the
 * standing pending request. The replacement hash lands in the same
 * slot in one transition, so the prior token's presentation resolves
 * as superseded from this commit on — there is no instant at which
 * two tokens are live (AM-09: exactly one live confirmation per
 * pending request). The fresh issuance restarts the 48h expiry
 * (T-1: expiry runs from issuance) and counts as an issuance.
 */
export function applyReissuePromotionConfirmation(
  state: PromotionCoordinatorState,
  input: { now: number; tokenHash: string },
): { state: PromotionCoordinatorState; changed: boolean; outcome: PromotionConfirmationReissueOutcome } {
  const pending = state.pendingConsent ?? null;
  if (!pending || pending.status !== "pending") {
    return { state, changed: false, outcome: "no_pending_request" };
  }
  if (pending.generation !== promotionGenerationOf(state) || input.now >= pending.tokenExpiresAt) {
    return { state, changed: false, outcome: "not_live" };
  }
  return {
    state: {
      ...state,
      pendingConsent: {
        ...pending,
        tokenHash: input.tokenHash,
        tokenExpiresAt: input.now + PROMOTION_CONFIRMATION_TOKEN_TTL_MS,
        confirmationSendCount: pending.confirmationSendCount + 1,
      },
      updatedAt: input.now,
    },
    changed: true,
    outcome: "reissued",
  };
}

export type PromotionConfirmationResult =
  /** The ceremony completed in THIS transition. */
  | "confirmed"
  /** Replay of the recorded completion (T-1): no new consent, no
   *  generation increment, no welcome issuance — zero mutation. */
  | "already_confirmed"
  /** The token's 48h window closed before presentation, judged on
   *  server time. Zero mutation; every replay returns the same. */
  | "expired"
  /** The presented token is not the live one (rotated away,
   *  replaced, or stamped under an older generation): inert under
   *  G-2. Zero mutation. */
  | "superseded"
  | "no_pending_request";

/**
 * RD-D / T-1 consumption + G-3 ceremony completion — the ONLY
 * transition in this slice that clears a global suppression, and
 * one of exactly two that increment the generation (G-1).
 *
 * Presentation outcomes, all decided against the standing slot:
 * - no slot ⇒ no_pending_request;
 * - a hash that is not the slot's ⇒ superseded (a rotated-away or
 *   replaced token, or one never minted for this request — the
 *   recorded-result vocabulary has no fourth outcome, and the
 *   answer mutates nothing either way);
 * - the slot already confirmed under this hash ⇒ already_confirmed
 *   (the T-1 replay: the recorded result stands, no second consent,
 *   no second increment, no welcome issuance);
 * - the slot stamped under an older generation ⇒ superseded
 *   (G-2 inertness — in particular, an unsubscribe that landed
 *   while the request stood pending kills its token);
 * - the 48h window closed ⇒ expired (server time);
 * - otherwise the ceremony completes, atomically in this one
 *   transition (single-use: the slot flips to confirmed as part of
 *   the same commit that clears suppression, so no second
 *   presentation can complete it again).
 *
 * Completion (G-3/GM-6): the generation advances by exactly one;
 * the global suppression clears, its record stamped with the new
 * generation and the ceremony's eventRef; the legacy stamps move
 * with it (unsubscribedAt clears, the subscription clock restarts —
 * the record and the stamp are one fact in two shapes, the RD-B
 * rule the shipped subscribe also follows); a reconsent evidence
 * entry is appended at the new generation; welcomeState is
 * preserved and materialized (G-4: no second coupon ever — the
 * coupon job, the once-ever enforcement's owner, is untouched).
 */
export function applyConfirmPromotionConsent(
  state: PromotionCoordinatorState,
  input: {
    now: number;
    tokenHash: string;
    /** RD-D: consent-evidence fields for the reconsent event. */
    evidence?: PromotionConsentEvidenceInput;
  },
): { state: PromotionCoordinatorState; changed: boolean; result: PromotionConfirmationResult } {
  const pending = state.pendingConsent ?? null;
  if (!pending) return { state, changed: false, result: "no_pending_request" };
  if (pending.tokenHash !== input.tokenHash) {
    return { state, changed: false, result: "superseded" };
  }
  if (pending.status === "confirmed") {
    return { state, changed: false, result: "already_confirmed" };
  }
  if (pending.generation !== promotionGenerationOf(state)) {
    return { state, changed: false, result: "superseded" };
  }
  if (input.now >= pending.tokenExpiresAt) {
    return { state, changed: false, result: "expired" };
  }
  const generation = pending.generation + 1;
  const suppressions = promotionSuppressionsOf(state);
  const completed: PromotionCoordinatorState = {
    ...state,
    generation,
    subscribedAt: input.now,
    unsubscribedAt: null,
    unsubscribeReason: null,
    suppressions: {
      ...suppressions,
      // The stamp lands only when the record was actually set: a
      // ceremony completing for an address that was never globally
      // suppressed leaves the untouched record standing (its
      // eventRef names the event that SET it, and none did).
      global: suppressions.global.active
        ? {
            active: false,
            setAt: suppressions.global.setAt,
            generation,
            eventRef: `reconsent_ceremony:${pending.requestId}`,
          }
        : suppressions.global,
    },
    pendingConsent: { ...pending, status: "confirmed", confirmedAt: input.now },
    consentEvents: appendConsentEvent(
      state,
      buildConsentEvent({
        kind: "reconsent",
        generation,
        now: input.now,
        evidence: input.evidence,
        fallbackSurface: "confirmation_link",
        fallbackSource: "confirmation",
        fallbackAction: "confirmation",
      }),
    ),
    updatedAt: input.now,
  };
  return { state: withMaterializedWelcomeState(completed), changed: true, result: "confirmed" };
}

/* ------------------------------------------------------------------ */
/* RD-C: erasure and the re-key sweep (GM-7B(c), GM-7C).               */
/* ------------------------------------------------------------------ */

/**
 * RD-C / GM-7B(c): the erasure transition. Converts the identity's
 * consent evidence to its GM-7A tombstone and nothing else: stamps,
 * reasons, sources, suppression records and delivery jobs are all
 * cleared in the same committing transition that writes the
 * tombstone, so no reader can observe an erased identity carrying
 * live evidence (and no pending job can deliver afterwards — a
 * completion arriving later finds no job and no-ops). An in-flight
 * (attempting) job cannot be un-sent; clearing it here records
 * nothing false — the tombstone's terminalAt is the moment the
 * identity's evidence ended, whatever the provider already did.
 *
 * The tombstone's digest is computed by the CALLER under the current
 * digest-key version (the transition is pure and key material never
 * enters the state machine); a digest that fails GM-7A validation
 * refuses the erasure rather than writing a malformed tombstone.
 * Erasing an already-reduced identity is an idempotent no-op: the
 * original tombstone stands as the terminal evidence.
 *
 * Erasure and creation for the same identity serialize inside the
 * same coordinator object (GM-7D): this transition and
 * applySubscribePromotion's gate are the two sides of AT-13, and
 * both run under the object's single-document serialization.
 */
export function applyErasePromotionIdentity(
  state: PromotionCoordinatorState | null,
  input: {
    emailHash: string;
    now: number;
    facts: PromotionLegacyFacts;
    /** HMAC of the normalized address under the CURRENT digest-key
     *  version (computed by the caller). */
    keyedDigest: string;
    digestKeyVersion: number;
    /** The coordinator object identity committing the event. */
    authorityId: string;
  },
): {
  state: PromotionCoordinatorState;
  changed: boolean;
  alreadyErased: boolean;
  erasureRefused?: string;
} {
  let current = state ?? createEmptyPromotionState(input.emailHash, input.now);
  if (isReducedPromotionState(current)) {
    return { state: current, changed: false, alreadyErased: true };
  }
  // Import first, exactly as the other document-creating transitions
  // do: an erasure for an identity the coordinator has never seen
  // still tombstones at the generation its legacy evidence establishes
  // (imported identities are generation 1), never at a guessed one.
  current = applyPromotionLegacyImport(current, input.facts, input.now).state;
  const tombstone: PromotionTombstone = {
    keyedDigest: input.keyedDigest,
    digestKeyVersion: input.digestKeyVersion,
    generation: suppressionGenerationOf(current),
    terminalEventClass: "erasure_with_suppression",
    terminalAt: input.now,
    authorityId: input.authorityId,
  };
  if (!isValidPromotionTombstone(tombstone)) {
    return {
      state: current,
      changed: false,
      alreadyErased: false,
      erasureRefused: "invalid_tombstone",
    };
  }
  const reduced: PromotionCoordinatorState = {
    kind: "promotion",
    emailHash: current.emailHash,
    subscribedAt: null,
    unsubscribedAt: null,
    unsubscribeReason: null,
    lastSource: null,
    legacySubscribed: false,
    legacyImportCompleted: true,
    suppressions: emptyPromotionSuppressions(),
    generation: suppressionGenerationOf(current),
    tombstones: [...promotionTombstonesOf(current), tombstone],
    tombstoneRef: tombstone.keyedDigest,
    updatedAt: input.now,
    jobs: {},
  };
  return { state: reduced, changed: true, alreadyErased: false };
}

/**
 * RD-C / GM-7C: one identity's step of the re-keying sweep. Re-stamps
 * every tombstone this identity holds under `fromVersion` to the
 * caller-computed digest under `toVersion`. The caller computes the
 * new digest from the identity's normalized address — which the
 * caller must legitimately hold: the sweep runs only over identities
 * whose addresses are available through ordinary records, and an
 * erased address can never be fed back in, because nothing in the
 * tombstone (a one-way keyed digest) can produce it. This transition
 * verifies only that records under the outgoing version exist to be
 * re-stamped; digest CORRECTNESS is the sweep caller's act, pinned by
 * the post-sweep lookup-equivalence check in the sweep flow
 * (rekeyPromotionTombstoneSweep in promotionCoordinator.ts). Rotation
 * itself re-keys nothing (GM-7C(c)): this sweep is the only re-stamp
 * path, and it never runs as a side effect of rotation.
 */
export function applyRekeyPromotionTombstones(
  state: PromotionCoordinatorState,
  input: { fromVersion: number; toVersion: number; newKeyedDigest: string; now: number },
): { state: PromotionCoordinatorState; changed: boolean; restamped: number } {
  const tombstones = promotionTombstonesOf(state);
  let restamped = 0;
  const nextTombstones = tombstones.map((tombstone) => {
    if (tombstone.digestKeyVersion !== input.fromVersion) return tombstone;
    restamped += 1;
    return { ...tombstone, keyedDigest: input.newKeyedDigest, digestKeyVersion: input.toVersion };
  });
  if (restamped === 0) return { state, changed: false, restamped: 0 };
  const next: PromotionCoordinatorState = {
    ...state,
    tombstones: nextTombstones,
    updatedAt: input.now,
  };
  if (
    state.tombstoneRef !== undefined &&
    tombstones.some(
      (tombstone) =>
        tombstone.keyedDigest === state.tombstoneRef &&
        tombstone.digestKeyVersion === input.fromVersion,
    )
  ) {
    next.tombstoneRef = input.newKeyedDigest;
  }
  return { state: next, changed: true, restamped };
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
    // RD-D: an acceptance is the welcome's sent fact — materialize
    // the derived welcomeState in the same committing transition so
    // the once-ever record stands even if the job is later rearmed.
    return {
      state: withMaterializedWelcomeState({ ...state, jobs, updatedAt: input.now }),
      changed: true,
    };
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
  // RD-C: a REDUCED document (GM-7B(c)) carries no stamps of its own,
  // but the projection must still show the identity's derived
  // effective suppression (§3.4) — an erased identity projected as a
  // plain subscriber would un-suppress it for every legacy reader
  // (the review engine's promotions opt-out source reads this
  // projection). The view therefore carries the governing tombstone's
  // terminalAt as the unsubscribe stamp. The projection key itself
  // remains address-named until the RD-E convergence sweep (PR-2)
  // retires it — completion of GM-7B(b) is defined on that
  // convergence, not on this transition.
  const tombstone = isReducedPromotionState(state) ? latestPromotionTombstone(state) : undefined;
  const view: PromotionEmailState = {
    subscribedAt: state.subscribedAt ?? tombstone?.terminalAt ?? state.updatedAt,
    updatedAt: state.updatedAt,
  };
  const couponAcceptedAt = state.jobs.coupon?.acceptedAt ?? null;
  if (couponAcceptedAt !== null) view.couponSentAt = couponAcceptedAt;
  const followupAcceptedAt = state.jobs.followup?.acceptedAt ?? null;
  if (followupAcceptedAt !== null) view.followupSentAt = followupAcceptedAt;
  if (state.unsubscribedAt !== null) view.unsubscribedAt = state.unsubscribedAt;
  else if (tombstone) view.unsubscribedAt = tombstone.terminalAt;
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
 *  customer's own transactions and requests. Confirmation mail
 *  (AM-09) is its own row: the completion half of a user-initiated
 *  ceremony — charged to quota under the TRANSACTIONAL class,
 *  exempt from the commercial frequency account, and never blocked
 *  by consent suppression (issuance to a live pending request is
 *  not a marketing send; the pending request itself admits none). */
export type PromotionPurposeClass =
  | "transactional"
  | "service"
  | "confirmation"
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
  | "review"
  | "confirmation";

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
    case "confirmation":
      // AM-09: the confirmation is the ceremony's completion half —
      // its content is the token link, never promotional material,
      // so the class does not turn on the content flag. (A message
      // carrying promotional content is not a confirmation at all;
      // it classifies under its own flow.)
      return "confirmation";
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
 * - confirmation mail is never blocked either (AM-09): it is the
 *   completion half of the recipient's own ceremony, not a marketing
 *   send — while every commercial class stays refused for as long
 *   as a pending request stands (a pending request admits nothing).
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
