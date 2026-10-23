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
 *     `dispatching` transition, samples a fresh clock for the deadline
 *     check inside that transition, calls the provider exactly once with
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
import type { FrozenReviewPayload, ReviewDispatchResult } from "@/lib/reviewRequestLedgerState";
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
// Dispatch coordination
// ---------------------------------------------------------------------------

export type ReviewDispatchOutcome =
  | { outcome: "sent"; providerId: string }
  | { outcome: "suppressed" }
  | { outcome: "retry_scheduled" }
  | { outcome: "failed" }
  | { outcome: "uncertain" }
  | { outcome: "expired" }
  | { outcome: "not_dispatchable" }
  | { outcome: "unavailable" };

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
 *   suppression check → begin_dispatch (fresh-clock deadline check,
 *   frozen payload read) → FINAL suppression re-check → ONE provider
 *   call → resolve_dispatch.
 * The provider is called only with the payload frozen in the ledger row —
 * never with a caller-supplied re-render. The final re-check exists
 * because the first check cannot fence the send on its own: the
 * begin_dispatch RPC is an external await, and an opt-out that lands (and
 * is acknowledged) while it is in flight would otherwise be sent to.
 * Between the final re-check's read and the provider-call invocation
 * there is no external await, so no suppression write can slip between
 * the decision and the send.
 */
export async function executeReviewDispatch(
  input: { sessionId: string; claimId: string },
  deps: {
    ledger: ReviewLedgerClient;
    isSuppressed: () => Promise<boolean | null>;
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
  /** null = coordinator unreachable (fail closed; claim not consumed). */
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
      records.set(name, { suppressed: true, source });
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
