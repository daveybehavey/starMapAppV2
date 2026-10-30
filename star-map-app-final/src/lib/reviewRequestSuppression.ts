/**
 * Review-request suppression store + dispatch coordinator (T-T1 revised
 * design, burn lane 2026-10-22b pass 1).
 *
 * Two coupled pieces:
 *
 *  1. A per-recipient suppression store, keyed by an HMAC of the normalized
 *     email — the raw address never names a record and never appears in a
 *     Durable Object name. Production backs it with
 *     ReviewRequestSuppressionDO (one instance per keyed name); the store is
 *     the AUTHORITATIVE suppression record for review requests: opt-out
 *     handlers write here and only acknowledge after this write lands.
 *
 *  2. The dispatch coordinator (executeReviewDispatch): the ONLY component
 *     that may call the email provider for a review request. It runs the
 *     final suppression check, commits the ledger's irreversible
 *     `dispatching` transition, re-checks eligibility against fresh
 *     source records (a revocation landing after the tick's read fences
 *     the send), re-checks the absolute deadline against a fresh clock
 *     at the point of invocation, calls the provider exactly once with
 *     the frozen payload, and records the definitive outcome. Ambiguous
 *     outcomes terminalize as `uncertain` in the ledger — never resent.
 *
 * Storage modes are explicit (design: fail-closed storage). Live mode with
 * a missing/unavailable namespace reports unavailable — the in-process
 * memory store exists ONLY via the test factory / explicit test mode and
 * is unreachable from the live path, even when the legacy local-fallback
 * env vars (CI=1, STARMAP_*_LOCAL=1, NODE_ENV) are set.
 */
import { createHmac } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type {
  FrozenReviewPayload,
  ReviewDispatchResult,
  ReviewLedgerState,
} from "@/lib/reviewRequestLedgerState";
import type { ReviewLedgerClient } from "@/lib/reviewRequests";

// ---------------------------------------------------------------------------
// Provider send types (the frozen payload IS one of these, verbatim)
// ---------------------------------------------------------------------------

export type ReviewSendInput = FrozenReviewPayload;

export type ReviewSendResult = { ok: true; id: string | null } | { ok: false; error: string };

export type ReviewSendFn = (input: ReviewSendInput) => Promise<ReviewSendResult>;

/** Provider call budget (design: 10s timeout, no transport-level retries). */
export const REVIEW_PROVIDER_SEND_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Send-failure classification (permanent vs transient vs ambiguous vs config)
// ---------------------------------------------------------------------------

export type ReviewFailureClass = "permanent" | "transient" | "ambiguous" | "config";

export function classifyReviewSendError(error: string): ReviewFailureClass {
  if (error === "resend_not_configured" || error === "resend_from_missing") return "config";
  if (error === "resend_recipient_missing") return "permanent";
  if (error.startsWith("resend_fetch_failed")) return "ambiguous";
  const httpMatch = /^resend_http_(\d{3}):/.exec(error);
  if (httpMatch) {
    const status = Number(httpMatch[1]);
    if (status === 429 || status >= 500) return "transient";
    if (status >= 400 && status < 500) return "permanent";
    return "transient";
  }
  return "ambiguous";
}

// ---------------------------------------------------------------------------
// Suppression identity
// ---------------------------------------------------------------------------

/**
 * Storage name for a recipient's suppression record: HMAC-SHA256 of the
 * normalized email under the purpose signing secret, domain-separated from
 * the opt-out token payload (`opt-out:<email>`) so the two can never be
 * confused. The raw address is never a storage key.
 */
export function deriveReviewSuppressionName(normalizedEmail: string, secret: string): string {
  return createHmac("sha256", secret).update(`review-suppression:${normalizedEmail}`).digest("base64url");
}

// ---------------------------------------------------------------------------
// Suppression sources + 13-month retention (S54-5 design (a), revised)
// ---------------------------------------------------------------------------

/**
 * The only legitimate suppression sources (the opt-out route's two
 * values). Arbitrary caller-supplied strings are NOT stored: optional
 * metadata is minimized on the retention boundary, and an unrestricted
 * free-form field would defeat that minimization.
 */
export const REVIEW_SUPPRESSION_SOURCES = ["list_unsubscribe", "opt_out_page"] as const;

export type ReviewSuppressionSource = (typeof REVIEW_SUPPRESSION_SOURCES)[number];

/** Known source → itself; anything else → null (never stored verbatim). */
export function sanitizeReviewSuppressionSource(source: string | null | undefined): string | null {
  return (REVIEW_SUPPRESSION_SOURCES as readonly string[]).includes(source ?? "")
    ? (source as string)
    : null;
}

/**
 * Adopted retention bound for review-engine ADDRESSES and PAYLOADS: 13
 * calendar months. Suppression itself NEVER expires — an acknowledged
 * opt-out prevents review requests indefinitely (the suppression
 * tombstone is retained by design); what the boundary governs is the
 * optional METADATA around it (source, event timestamps) and raw-address
 * representations elsewhere (see the opt-out sweep in reviewRequests.ts).
 */
export const REVIEW_RETENTION_MONTHS = 13;

/**
 * Add calendar months in UTC with month-end clamping (Jan 31 + 1 month
 * → Feb 28/29, never Mar 3). Calendar arithmetic, not a fixed ms count:
 * "13 months" in the retention policy is a calendar period.
 */
export function addCalendarMonthsMs(fromMs: number, months: number): number {
  const from = new Date(fromMs);
  const day = from.getUTCDate();
  const target = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, 1, 0, 0, 0, 0)
  );
  const lastDayOfTarget = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDayOfTarget));
  target.setUTCHours(
    from.getUTCHours(),
    from.getUTCMinutes(),
    from.getUTCSeconds(),
    from.getUTCMilliseconds()
  );
  return target.getTime();
}

/** The instant at which metadata recorded at `fromMs` must be minimized. */
export function reviewRetentionDeadlineMs(fromMs: number): number {
  return addCalendarMonthsMs(fromMs, REVIEW_RETENTION_MONTHS);
}

/** The metadata-bearing shape of a suppression record (DO row / mirror). */
export type ReviewSuppressionRecordShape = {
  suppressed: number;
  source: string | null;
  suppressed_at: number | null;
};

/**
 * Minimized = the suppression flag stands alone: no source, no event
 * timestamp. A minimized record must STAY minimized — a repeated opt-out
 * never resurrects metadata or restarts its clock.
 */
export function isReviewSuppressionMinimized(row: ReviewSuppressionRecordShape): boolean {
  return row.suppressed === 1 && row.source === null && row.suppressed_at === null;
}

/**
 * True when a suppressed record's metadata has reached the retention
 * boundary. The EARLIEST outstanding opt-out owns the deadline: repeated
 * opt-outs never extend it. Cleared/absent records owe no cleanup.
 */
export function reviewSuppressionMinimizationDue(
  row: ReviewSuppressionRecordShape | null,
  now: number
): boolean {
  if (!row || row.suppressed !== 1) return false;
  if (isReviewSuppressionMinimized(row)) return false;
  if (row.suppressed_at === null) return false;
  return now >= reviewRetentionDeadlineMs(row.suppressed_at);
}

// ---------------------------------------------------------------------------
// Dispatch coordination
// ---------------------------------------------------------------------------

export type ReviewDispatchOutcome =
  | { outcome: "sent"; providerId: string }
  | { outcome: "suppressed" }
  | { outcome: "retry_scheduled" }
  | { outcome: "failed" }
  | { outcome: "uncertain" }
  | { outcome: "expired" }
  | { outcome: "ineligible" }
  | { outcome: "eligibility_unavailable" }
  | { outcome: "not_dispatchable" }
  | { outcome: "unavailable" };

// ---------------------------------------------------------------------------
// Post-commit eligibility re-check (S54-5 design (b), revised by S54-5B)
// ---------------------------------------------------------------------------

/**
 * Bounded vocabulary for a DEFINITIVE ineligible decision. The checker
 * maps fresh source evidence onto exactly these codes; the ledger stores
 * the code as a diagnostic (`ineligible:<code>`), never a record dump.
 */
export type ReviewDispatchIneligibleReason =
  | "revoked"
  | "not_paid"
  | "gift_order"
  | "gift_uncertain"
  | "missing_record"
  | "missing_email"
  | "invalid_anchor"
  | "window_closed"
  | "kind_mismatch"
  | "recipient_mismatch"
  | "terminal_failed"
  | "not_shipped"
  | "branch_disabled"
  | "malformed_evidence";

export type ReviewDispatchEligibility =
  | { status: "eligible" }
  | { status: "ineligible"; reason: ReviewDispatchIneligibleReason }
  | { status: "unavailable"; error: string };

/**
 * Fresh eligibility decision for a COMMITTED dispatch, derived by the
 * checker itself from the committed ledger state (session, kind, frozen
 * recipient) and fresh source records — never from a caller-supplied
 * boolean. `now` is a clock PROVIDER so the checker can sample a fresh
 * time after its source reads complete (S54-5B). A checker that throws
 * or cannot answer is treated by the coordinator as `unavailable`:
 * known revocation, missing/malformed evidence, or an unavailable
 * authority all prevent the provider call.
 */
export type ReviewDispatchEligibilityChecker = (input: {
  sessionId: string;
  state: ReviewLedgerState;
  now: () => number;
}) => Promise<ReviewDispatchEligibility>;

type TimedSend = { kind: "result"; result: ReviewSendResult } | { kind: "ambiguous"; error: string };

async function sendWithTimeout(
  send: ReviewSendFn,
  payload: FrozenReviewPayload,
  timeoutMs: number
): Promise<TimedSend> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raced = await Promise.race([
      send(payload).then(
        (result): TimedSend => ({ kind: "result", result }),
        (error): TimedSend => ({
          kind: "ambiguous",
          error: error instanceof Error ? `provider_threw:${error.message}` : "provider_threw",
        })
      ),
      new Promise<TimedSend>((resolve) => {
        timer = setTimeout(() => resolve({ kind: "ambiguous", error: "provider_timeout" }), timeoutMs);
      }),
    ]);
    return raced;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The single send path. Ordering is the safety property:
 *   suppression check → begin_dispatch (deadline check against the
 *   pre-commit clock sample, frozen payload read) → eligibility
 *   re-check against fresh source records (S54-5 (b) as revised) →
 *   FINAL suppression re-check → point-of-invocation deadline re-check
 *   → ONE provider call → resolve_dispatch.
 * The provider is called only with the payload frozen in the ledger row —
 * never with a caller-supplied re-render. The final re-check exists
 * because the first check cannot fence the send on its own: the
 * begin_dispatch RPC is an external await, and an opt-out that lands (and
 * is acknowledged) while it is in flight would otherwise be sent to.
 * Between the final re-check's read and the provider-call invocation
 * there is no external await, so no suppression write can slip between
 * the decision and the send. The deadline is fenced at the same point
 * for the same reason: the begin_dispatch check runs against a clock
 * sampled BEFORE that RPC, so a slow commit could return at/after the
 * absolute deadline with the check already passed — the invocation-point
 * re-check, sampled after the last await, is the one that binds.
 */
export async function executeReviewDispatch(
  input: { sessionId: string; claimId: string },
  deps: {
    ledger: ReviewLedgerClient;
    isSuppressed: () => Promise<boolean | null>;
    /**
     * REQUIRED, not optional: a construction that cannot obtain a fresh
     * eligibility decision must not be able to send. Production wires
     * the KV-backed checker inside ReviewRequestSuppressionDO; test
     * harnesses inject explicit fakes.
     */
    checkEligibility: ReviewDispatchEligibilityChecker;
    send: ReviewSendFn;
    now?: () => number;
    sendTimeoutMs?: number;
  }
): Promise<ReviewDispatchOutcome> {
  const now = deps.now ?? Date.now;
  const { sessionId, claimId } = input;

  const suppressed = await deps.isSuppressed().catch(() => null);
  if (suppressed === null) return { outcome: "unavailable" };
  if (suppressed) {
    const marked = await deps.ledger
      .apply(sessionId, { type: "mark_suppressed", claimId, now: now() })
      .catch(() => null);
    if (!marked) return { outcome: "unavailable" };
    return { outcome: "suppressed" };
  }

  const begun = await deps.ledger
    .apply(sessionId, { type: "begin_dispatch", claimId, now: now() })
    .catch(() => null);
  if (!begun) return { outcome: "unavailable" };
  switch (begun.outcome) {
    case "dispatching":
      break;
    case "expired":
      return { outcome: "expired" };
    case "quarantined":
      return { outcome: "failed" };
    default:
      return { outcome: "not_dispatchable" };
  }
  const payload: FrozenReviewPayload | null = begun.state.payload;
  if (!payload) {
    // begin_dispatch terminalizes a payload-less claim as failed, so this
    // is unreachable unless the ledger implementation is not the machine's.
    return { outcome: "failed" };
  }

  const resolve = async (result: ReviewDispatchResult) =>
    deps.ledger.apply(sessionId, { type: "resolve_dispatch", claimId, result, now: now() }).catch(() => null);

  // ELIGIBILITY RE-CHECK (S54-5 design (b) as revised by S54-5B): the
  // tick classified this session BEFORE the claim; a refund/revocation
  // landing between that read and this commit did not fence the send
  // (S52-2 M2-01). Now that the dispatch has committed, obtain a FRESH
  // affirmative eligibility decision — derived by the checker from the
  // committed state and fresh source records — before the provider is
  // invoked. This is deliberately placed BEFORE the final suppression
  // check: the eligibility reads are external awaits, and no external
  // await may follow the final LOCAL suppression check, so suppression
  // remains the last gate before the deadline fence and the call.
  const eligibility: ReviewDispatchEligibility =
    (await deps
      .checkEligibility({ sessionId, state: begun.state, now })
      .catch((): ReviewDispatchEligibility => ({
        status: "unavailable",
        error: "eligibility_check_failed",
      }))) ?? { status: "unavailable", error: "eligibility_check_failed" };
  if (eligibility.status === "ineligible") {
    // Definitive negative from fresh evidence; no provider call made.
    await resolve({ type: "ineligible", reason: eligibility.reason });
    return { outcome: "ineligible" };
  }
  if (eligibility.status === "unavailable") {
    // The authority cannot answer: do NOT send. The committed dispatch
    // settles terminally (never released into a blind retry).
    await resolve({ type: "eligibility_unavailable", error: eligibility.error });
    return { outcome: "eligibility_unavailable" };
  }

  // FINAL suppression fence: re-check after the dispatch commit, at the
  // last moment before the provider call (see the ordering note above).
  const suppressedFinal = await deps.isSuppressed().catch(() => null);
  if (suppressedFinal === null) {
    // The gate cannot be verified after the commit: do NOT send. The
    // outcome is settled as uncertain (never resent) rather than guessed.
    await resolve({ type: "ambiguous", error: "suppression_recheck_unavailable" });
    return { outcome: "uncertain" };
  }
  if (suppressedFinal) {
    // Suppression landed while the commit was in flight. No provider
    // call has been made, so the committed row settles truthfully as
    // terminal `suppressed` — not `uncertain`.
    await resolve({ type: "suppressed" });
    return { outcome: "suppressed" };
  }

  // POINT-OF-INVOCATION deadline fence: the deadline check inside
  // begin_dispatch ran against a clock sampled before that RPC, and the
  // final suppression re-check awaited again — either can carry the
  // invocation past the absolute deadline (e.g. the commit lands at
  // deadline−1ms and returns at deadline+1ms). Sample a fresh clock NOW,
  // after the last await: between this sample and the provider-call
  // invocation inside sendWithTimeout there is no await, so the check
  // binds the actual send. No provider call is made on this path, so the
  // committed row settles truthfully as terminal `expired`.
  const retryDeadlineAt = begun.state.retryDeadlineAt;
  if (retryDeadlineAt !== null && now() >= retryDeadlineAt) {
    await resolve({ type: "expired" });
    return { outcome: "expired" };
  }

  const timed = await sendWithTimeout(
    deps.send,
    payload,
    deps.sendTimeoutMs ?? REVIEW_PROVIDER_SEND_TIMEOUT_MS
  );

  if (timed.kind === "ambiguous") {
    await resolve({ type: "ambiguous", error: timed.error });
    return { outcome: "uncertain" };
  }

  const result = timed.result;
  if (!result.ok) {
    const failureClass = classifyReviewSendError(result.error);
    if (failureClass === "permanent") {
      await resolve({ type: "rejected", error: result.error, permanent: true });
      return { outcome: "failed" };
    }
    if (failureClass === "transient") {
      const resolved = await resolve({ type: "rejected", error: result.error, permanent: false });
      if (resolved?.outcome === "quarantined") return { outcome: "failed" };
      if (!resolved) return { outcome: "uncertain" };
      return { outcome: "retry_scheduled" };
    }
    // ambiguous | config: no definitive provider answer — never retried.
    await resolve({ type: "ambiguous", error: result.error });
    return { outcome: "uncertain" };
  }
  if (result.id) {
    await resolve({ type: "accepted", providerId: result.id });
    // The provider accepted; even if the ledger write was lost the send
    // happened (the row settles as uncertain via expire_dispatch, and the
    // one-ask ledger can never send again from `dispatching`).
    return { outcome: "sent", providerId: result.id };
  }
  // Accepted with no provider id: the outcome is unprovable — ambiguous.
  await resolve({ type: "ambiguous", error: "provider_accepted_without_id" });
  return { outcome: "uncertain" };
}

// ---------------------------------------------------------------------------
// Suppression client (DO-backed in production; explicit modes)
// ---------------------------------------------------------------------------

export type ReviewSuppressionMode = "live" | "dry_run" | "test";

export type ReviewSuppressionClient = {
  /** true/false = authoritative answer; null = unavailable (fail closed). */
  check(name: string): Promise<boolean | null>;
  /** Returns whether the authoritative write landed. */
  record(name: string, source: string, now: number): Promise<boolean>;
  /** Resubscribe: clears suppression. Returns whether the write landed. */
  clear(name: string, now: number): Promise<boolean>;
  /** Erasure: removes the record entirely. Returns whether it landed. */
  erase(name: string): Promise<boolean>;
  /**
   * null = no outcome could be obtained: the coordinator was unreachable
   * OR its response was lost after the dispatch executed. Fail closed —
   * a null result does NOT prove nothing was sent; the caller's recovery
   * (release_claim) is safe only because the ledger machine's release is
   * state- and token-guarded and no-ops once a dispatch has committed.
   */
  dispatch(input: {
    sessionId: string;
    claimId: string;
    name: string;
  }): Promise<ReviewDispatchOutcome | null>;
};

type SuppressionNamespace = {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): {
    check(): Promise<{ suppressed: boolean }>;
    record(input: { source: string; now: number }): Promise<{ suppressed: boolean }>;
    clear(input: { now: number }): Promise<{ suppressed: boolean }>;
    erase(): Promise<{ suppressed: boolean }>;
    dispatch(input: { sessionId: string; claimId: string }): Promise<ReviewDispatchOutcome>;
  };
};

function suppressionModeFromEnv(env: NodeJS.ProcessEnv = process.env): ReviewSuppressionMode {
  const raw = env.STARMAP_REVIEW_SUPPRESSION_MODE?.trim().toLowerCase();
  // Like the ledger client, "test" is not env-selectable: memory-backed
  // operation requires an explicit code-level construction with injected
  // deps, so no deployed env combination can select it.
  if (raw === "dry_run" || raw === "live") return raw;
  return "live";
}

function namespaceFromEnvRecord(env: unknown): SuppressionNamespace | null {
  if (!env || typeof env !== "object") return null;
  const binding = (env as { REVIEW_REQUEST_SUPPRESSION?: SuppressionNamespace }).REVIEW_REQUEST_SUPPRESSION;
  return binding ?? null;
}

export type ReviewSuppressionMemoryDeps = {
  ledger: ReviewLedgerClient;
  send: ReviewSendFn;
  now?: () => number;
  /**
   * Optional ONLY here, in the test harness: when omitted, dispatches
   * are treated as eligible. The production coordinator construction
   * (ReviewRequestSuppressionDO) always wires the real checker, and
   * executeReviewDispatch itself requires the dep explicitly.
   */
  checkEligibility?: ReviewDispatchEligibilityChecker;
};

/**
 * In-memory suppression client over the SAME coordinator + state machine.
 * Reachable only via an explicit test-mode construction with injected deps
 * (unit tests) — never from a namespace resolution failure.
 */
export function createInMemoryReviewSuppressionClient(
  deps: ReviewSuppressionMemoryDeps
): ReviewSuppressionClient {
  const records = new Map<string, { suppressed: boolean; source: string | null }>();
  return {
    async check(name) {
      return records.get(name)?.suppressed ?? false;
    },
    async record(name, source) {
      records.set(name, { suppressed: true, source: sanitizeReviewSuppressionSource(source) });
      return true;
    },
    async clear(name) {
      records.set(name, { suppressed: false, source: null });
      return true;
    },
    async erase(name) {
      records.delete(name);
      return true;
    },
    async dispatch(input) {
      return executeReviewDispatch(
        { sessionId: input.sessionId, claimId: input.claimId },
        {
          ledger: deps.ledger,
          isSuppressed: async () => records.get(input.name)?.suppressed ?? false,
          checkEligibility: deps.checkEligibility ?? (async () => ({ status: "eligible" })),
          send: deps.send,
          now: deps.now,
        }
      );
    },
  };
}

/**
 * Build a suppression client. Pass the Worker handler's env explicitly from
 * the scheduled entry; route handlers may omit it and resolve via the
 * OpenNext Cloudflare context.
 *
 * Mode resolution (design: explicit client modes): options.mode wins, then
 * STARMAP_REVIEW_SUPPRESSION_MODE, defaulting to live. In live mode a
 * missing namespace makes every operation report unavailable — NO memory
 * fallback, regardless of CI/local env vars. Dry-run mode reads through
 * the namespace when present and writes nothing.
 */
export function createReviewSuppressionClient(
  explicitEnv?: unknown,
  options?: { mode?: ReviewSuppressionMode; memory?: ReviewSuppressionMemoryDeps }
): ReviewSuppressionClient {
  const mode = options?.mode ?? suppressionModeFromEnv();
  if (mode === "test") {
    if (!options?.memory) {
      // Test mode without injected deps: suppression reads are inert-false
      // and dispatch is unavailable. Unit suites use
      // createInMemoryReviewSuppressionClient for the full path.
      return {
        async check() {
          return false;
        },
        async record() {
          return false;
        },
        async clear() {
          return false;
        },
        async erase() {
          return false;
        },
        async dispatch() {
          return null;
        },
      };
    }
    return createInMemoryReviewSuppressionClient(options.memory);
  }

  const resolveNamespace = (): SuppressionNamespace | null => {
    const fromExplicit = namespaceFromEnvRecord(explicitEnv);
    if (fromExplicit) return fromExplicit;
    try {
      const { env } = getCloudflareContext();
      return namespaceFromEnvRecord(env);
    } catch {
      return null;
    }
  };

  const stubFor = (name: string) => {
    const ns = resolveNamespace();
    if (!ns) return null;
    try {
      return ns.get(ns.idFromName(name));
    } catch {
      return null;
    }
  };

  return {
    async check(name) {
      const stub = stubFor(name);
      if (!stub) return null;
      try {
        const result = await stub.check();
        return result.suppressed;
      } catch {
        return null;
      }
    },
    async record(name, source, now) {
      if (mode === "dry_run") return false;
      const stub = stubFor(name);
      if (!stub) return false;
      try {
        await stub.record({ source, now });
        return true;
      } catch {
        return false;
      }
    },
    async clear(name, now) {
      if (mode === "dry_run") return false;
      const stub = stubFor(name);
      if (!stub) return false;
      try {
        await stub.clear({ now });
        return true;
      } catch {
        return false;
      }
    },
    async erase(name) {
      if (mode === "dry_run") return false;
      const stub = stubFor(name);
      if (!stub) return false;
      try {
        await stub.erase();
        return true;
      } catch {
        return false;
      }
    },
    async dispatch(input) {
      if (mode === "dry_run") return null;
      const stub = stubFor(input.name);
      if (!stub) return null;
      try {
        return await stub.dispatch({ sessionId: input.sessionId, claimId: input.claimId });
      } catch {
        return null;
      }
    },
  };
}
