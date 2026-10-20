/**
 * StarMapCo post-delivery review-request engine (T1) — core logic.
 *
 * Design: ~/workspace/starmapco-redesign/review-engine-design-2026-10-19.md
 * Semantics ported from OurImprint's web/lib/reviews.ts (due windows, claim
 * machine, backoff, suppression at send time, one ask only), adapted to
 * StarMapCo's KV populations + a per-session Durable Object ledger
 * (reviewRequestLedgerState.ts — KV itself has no atomic claim primitive;
 * Step-0 Codex critique P1).
 *
 * INERT BY DEFAULT: the engine does nothing unless REVIEW_REQUESTS_ENABLED
 * is exactly "true", and even then it sends nothing until every prerequisite
 * is present (CASL mailing address, opt-out signing secret, Resend config).
 * The physical (ship-anchored) branch is gated separately by
 * REVIEW_REQUESTS_PHYSICAL_ENABLED — it has no delivery signal, so it
 * activates only on its own explicit decision (design §12).
 *
 * ACTIVATION PRECONDITIONS not satisfiable by code alone (see PR body):
 * the checkout gift-flag writer must land first (until then `isGift` is
 * absent on every record), a mailing address must be supplied, and the
 * shipping email's built-in review ask must be removed (or two asks
 * explicitly approved) so the one-ask policy holds in practice.
 *
 * This module is dependency-injected (store / ledger / sender / config are
 * parameters) so the whole tick is unit-testable in plain Node. Runtime
 * wiring lives in reviewRequestRuntime.ts.
 */
import {
  emailStateKey,
  normalizePromotionEmail,
  type PromotionEmailState,
} from "@/lib/promotionSubscriptions";
import type { StripeSessionEntitlement } from "@/lib/entitlementsStore";
import type { PrintOrderRecord } from "@/lib/printOrders";
import {
  isReviewLedgerResolved,
  type ReviewLedgerApplyResult,
  type ReviewLedgerOp,
  type ReviewLedgerState,
  type ReviewRequestKind,
} from "@/lib/reviewRequestLedgerState";
import {
  buildReviewOptOutUrl,
  buildReviewRequestEmail,
  getReviewOptOutSecret,
} from "@/lib/reviewRequestEmail";

// ---------------------------------------------------------------------------
// Constants (design §3; tunables named here, never magic numbers inline)
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** Digital: due paid + 3 days, eligible until paid + 14 days, then never. */
export const REVIEW_DIGITAL_DELAY_MS = 3 * DAY_MS;
export const REVIEW_DIGITAL_MAX_AGE_MS = 14 * DAY_MS;

/** Physical: due shippedAt + 7 days, eligible until shippedAt + 21 days. */
export const REVIEW_PHYSICAL_DELAY_MS = 7 * DAY_MS;
export const REVIEW_PHYSICAL_MAX_AGE_MS = 21 * DAY_MS;

/** Per-tick budgets (design §7 + critique P2: bounded work, persisted cursors). */
export const REVIEW_MAX_SENDS_PER_TICK = 50;
export const REVIEW_SCAN_MAX_PAGES_PER_POPULATION = 10;
export const REVIEW_SCAN_PAGE_SIZE = 100;
export const REVIEW_SCAN_MAX_GETS_PER_TICK = 500;

/** Anchor sanity bounds (critique P3.1): reject corrupt/future timestamps. */
const ANCHOR_MIN_MS = Date.UTC(2023, 0, 1);
const ANCHOR_FUTURE_SKEW_MS = 5 * 60 * 1000;

export const REVIEW_SCAN_CURSOR_KEYS = {
  digital: "review:scan:digital",
  physical: "review:scan:physical",
} as const;

export function reviewOptOutKey(normalizedEmail: string): string {
  return `review:optout:${encodeURIComponent(normalizedEmail)}`;
}

/** Provider idempotency key (layer 2 of 3 — dedupes retries for 24h). */
export function reviewRequestIdempotencyKey(sessionId: string): string {
  return `review-request:${sessionId}`;
}

// ---------------------------------------------------------------------------
// Injected dependencies
// ---------------------------------------------------------------------------

export type ReviewScanStore = {
  listKeys(
    prefix: string,
    cursor?: string,
  ): Promise<{ names: string[]; cursor: string | null; complete: boolean }>;
  getJson<T>(key: string): Promise<T | null>;
  putJson(key: string, value: unknown): Promise<void>;
};

export type ReviewLedgerClient = {
  getState(sessionId: string): Promise<ReviewLedgerState | null>;
  apply(sessionId: string, op: ReviewLedgerOp): Promise<ReviewLedgerApplyResult | null>;
};

export type ReviewSendInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  idempotencyKey: string;
  tags: Record<string, string>;
};

export type ReviewSendResult = { ok: true; id: string | null } | { ok: false; error: string };

export type ReviewEngineConfig = {
  enabled: boolean;
  physicalEnabled: boolean;
  mailingAddress: string;
  signingSecret: string | null;
  siteUrl: string;
  supportEmail: string;
  resendConfigured: boolean;
};

export type ReviewEngineDeps = {
  store: ReviewScanStore;
  ledger: ReviewLedgerClient;
  send: (input: ReviewSendInput) => Promise<ReviewSendResult>;
  config: ReviewEngineConfig;
  now?: () => number;
  createClaimId?: () => string;
  log?: (summary: ReviewTickSummary) => void;
};

/** Pure config snapshot from an env record (critique D2/D5: validate once, pre-claim). */
export function resolveReviewEngineConfig(
  env: Record<string, string | undefined>,
  probes: { resendConfigured: boolean },
): ReviewEngineConfig {
  return {
    enabled: env.REVIEW_REQUESTS_ENABLED?.trim() === "true",
    physicalEnabled: env.REVIEW_REQUESTS_PHYSICAL_ENABLED?.trim() === "true",
    mailingAddress: env.REVIEW_REQUEST_MAILING_ADDRESS?.trim() ?? "",
    signingSecret: getReviewOptOutSecret(env),
    siteUrl: env.NEXT_PUBLIC_SITE_URL?.trim() || "https://starmapco.com",
    supportEmail: env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@starmapco.com",
    resendConfigured: probes.resendConfigured,
  };
}

// ---------------------------------------------------------------------------
// Due evaluation (pure, total — never throws on a malformed record)
// ---------------------------------------------------------------------------

export type ReviewSkipReason =
  | "missing_record"
  | "not_paid"
  | "revoked"
  | "missing_email"
  | "invalid_anchor"
  | "gift_order"
  | "print_order_physical_branch"
  | "terminal_failed"
  | "not_shipped"
  | "physical_disabled"
  | "not_yet_due"
  | "past_max_age";

export type ReviewClassification =
  | {
      outcome: "due";
      kind: ReviewRequestKind;
      email: string;
      anchorAt: number;
      dueAt: number;
    }
  | { outcome: "pending" | "excluded"; kind: ReviewRequestKind; reason: ReviewSkipReason };

/**
 * Normalize an anchor to ms epoch with sanity bounds. Stripe `created` is
 * SECONDS; KV record timestamps are ms. Values < 1e11 are treated as seconds.
 * Returns null for non-finite / non-positive / pre-2023 / implausibly-future.
 */
export function normalizeAnchorMs(raw: unknown, now: number): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  const ms = raw < 1e11 ? raw * 1000 : raw;
  if (ms < ANCHOR_MIN_MS || ms > now + ANCHOR_FUTURE_SKEW_MS) return null;
  return ms;
}

function windowOutcome(
  anchorAt: number,
  delayMs: number,
  maxAgeMs: number,
  now: number,
): "pending" | "due" | "expired" {
  if (now < anchorAt + delayMs) return "pending";
  // OurImprint eligibility: anchor must be strictly newer than now - maxAge.
  if (anchorAt <= now - maxAgeMs) return "expired";
  return "due";
}

function classificationFromWindow(
  kind: ReviewRequestKind,
  email: string,
  anchorAt: number,
  delayMs: number,
  maxAgeMs: number,
  now: number,
): ReviewClassification {
  const outcome = windowOutcome(anchorAt, delayMs, maxAgeMs, now);
  if (outcome === "pending") return { outcome: "pending", kind, reason: "not_yet_due" };
  if (outcome === "expired") return { outcome: "excluded", kind, reason: "past_max_age" };
  return { outcome: "due", kind, email, anchorAt, dueAt: anchorAt + delayMs };
}

/**
 * Digital population (design §3.1, with the Step-0 D9 predicate correction):
 * an entitlement belongs to the digital branch iff `orderType !== "print"`.
 * Print sessions — including print + digital add-on — are evaluated ONLY in
 * the physical population, so each session is asked at most once, under one
 * clock. Legacy records with no orderType are digital (pre-print checkouts).
 */
export function classifyDigitalEntitlement(
  record: StripeSessionEntitlement | null,
  now: number,
): ReviewClassification {
  const kind: ReviewRequestKind = "digital";
  if (!record) return { outcome: "excluded", kind, reason: "missing_record" };
  if (record.paid !== true) return { outcome: "excluded", kind, reason: "not_paid" };
  if (record.revoked === true) return { outcome: "excluded", kind, reason: "revoked" };
  if (record.isGift === true) return { outcome: "excluded", kind, reason: "gift_order" };
  if (record.orderType === "print") {
    return { outcome: "excluded", kind, reason: "print_order_physical_branch" };
  }
  const email = record.customerEmail?.trim();
  if (!email) return { outcome: "excluded", kind, reason: "missing_email" };
  const anchorAt = normalizeAnchorMs(record.created, now);
  if (anchorAt === null) return { outcome: "excluded", kind, reason: "invalid_anchor" };
  return classificationFromWindow(
    kind,
    email,
    anchorAt,
    REVIEW_DIGITAL_DELAY_MS,
    REVIEW_DIGITAL_MAX_AGE_MS,
    now,
  );
}

/**
 * Physical population (design §3.2): anchored to the persisted shipment fact
 * (`shippedAt`, first-write-wins; `shippingNotificationSentAt` is the legacy
 * fallback for records written before shippedAt existed). No delivery signal
 * exists in this system — the +7d/+21d window and the conditional copy are
 * the honest mitigation, and the branch is gated separately.
 */
export function classifyPrintRecord(
  record: PrintOrderRecord | null,
  now: number,
  physicalEnabled: boolean,
): ReviewClassification {
  const kind: ReviewRequestKind = "physical";
  if (!physicalEnabled) return { outcome: "excluded", kind, reason: "physical_disabled" };
  if (!record) return { outcome: "excluded", kind, reason: "missing_record" };
  if (record.status === "failed") return { outcome: "excluded", kind, reason: "terminal_failed" };
  if (record.isGift === true) return { outcome: "excluded", kind, reason: "gift_order" };
  const email = record.customerEmail?.trim();
  if (!email) return { outcome: "excluded", kind, reason: "missing_email" };
  const rawAnchor = record.shippedAt ?? record.shippingNotificationSentAt;
  if (rawAnchor === undefined || rawAnchor === null) {
    return { outcome: "pending", kind, reason: "not_shipped" };
  }
  const anchorAt = normalizeAnchorMs(rawAnchor, now);
  if (anchorAt === null) return { outcome: "excluded", kind, reason: "invalid_anchor" };
  return classificationFromWindow(
    kind,
    email,
    anchorAt,
    REVIEW_PHYSICAL_DELAY_MS,
    REVIEW_PHYSICAL_MAX_AGE_MS,
    now,
  );
}

// ---------------------------------------------------------------------------
// Suppression (checked in the send loop, immediately before claiming)
// ---------------------------------------------------------------------------

export type ReviewOptOutRecord = { email: string; optedOutAt: number; source: string };

export async function recordReviewOptOut(
  store: ReviewScanStore,
  rawEmail: string,
  now: number,
  source: string,
): Promise<void> {
  const email = normalizePromotionEmail(rawEmail);
  if (!email) return;
  const record: ReviewOptOutRecord = { email, optedOutAt: now, source };
  await store.putJson(reviewOptOutKey(email), record);
}

/**
 * Suppressed = review-specific opt-out row exists OR the promotions system
 * shows the address unsubscribed. Identity must match the promotions system
 * exactly (critique P2): same normalization, same encodeURIComponent keying.
 */
export async function isReviewSuppressed(
  store: ReviewScanStore,
  rawEmail: string,
): Promise<boolean> {
  const email = normalizePromotionEmail(rawEmail);
  if (!email) return true;
  const optOut = await store.getJson<ReviewOptOutRecord>(reviewOptOutKey(email));
  if (optOut) return true;
  const promoState = await store.getJson<PromotionEmailState>(emailStateKey(email));
  if (promoState?.unsubscribedAt) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Send-failure classification (critique P2: permanent vs transient vs ambiguous)
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
// The tick
// ---------------------------------------------------------------------------

export type ReviewTickSummary = {
  status: "disabled" | "blocked" | "completed";
  blockedReason?: "mailing_address_missing" | "signing_secret_missing" | "resend_not_configured";
  scannedDigital: number;
  scannedPhysical: number;
  due: number;
  sent: number;
  sendFailed: number;
  deferred: number;
  suppressed: number;
  alreadyResolved: number;
  inFlightOrBackoff: number;
  ledgerUnavailable: number;
  disputed: number;
  skips: Partial<Record<ReviewSkipReason, number>>;
};

function emptySummary(status: ReviewTickSummary["status"]): ReviewTickSummary {
  return {
    status,
    scannedDigital: 0,
    scannedPhysical: 0,
    due: 0,
    sent: 0,
    sendFailed: 0,
    deferred: 0,
    suppressed: 0,
    alreadyResolved: 0,
    inFlightOrBackoff: 0,
    ledgerUnavailable: 0,
    disputed: 0,
    skips: {},
  };
}

type DueCandidate = {
  sessionId: string;
  kind: ReviewRequestKind;
  recordKey: string;
  classification: Extract<ReviewClassification, { outcome: "due" }>;
};

const DIGITAL_PREFIX = "stripe:session:";
const PHYSICAL_PREFIX = "print:order:";

export async function runReviewRequestTick(deps: ReviewEngineDeps): Promise<ReviewTickSummary> {
  const now = (deps.now ?? Date.now)();
  const { config, store } = deps;
  const summary = emptySummary("completed");
  const log =
    deps.log ??
    ((s: ReviewTickSummary) => {
      // Counts only — never email addresses or record contents (design §7).
      console.log(JSON.stringify({ event: "review_requests", ...s }));
    });

  if (!config.enabled) {
    summary.status = "disabled";
    log(summary);
    return summary;
  }

  let getsUsed = 0;
  const candidates: DueCandidate[] = [];

  const scanPopulation = async (
    prefix: string,
    cursorKey: string,
    classify: (recordKey: string) => Promise<ReviewClassification>,
    counterKey: "scannedDigital" | "scannedPhysical",
  ): Promise<void> => {
    const cursorRow = await store.getJson<{ cursor: string | null }>(cursorKey).catch(() => null);
    let cursor: string | undefined = cursorRow?.cursor ?? undefined;
    for (let page = 0; page < REVIEW_SCAN_MAX_PAGES_PER_POPULATION; page += 1) {
      const pageStartCursor = cursor;
      let listing: { names: string[]; cursor: string | null; complete: boolean };
      try {
        listing = await store.listKeys(prefix, cursor);
      } catch {
        return; // list failure: keep the persisted cursor, retry next tick
      }
      let budgetExhausted = false;
      for (const name of listing.names) {
        if (getsUsed >= REVIEW_SCAN_MAX_GETS_PER_TICK) {
          budgetExhausted = true;
          break;
        }
        summary[counterKey] += 1;
        getsUsed += 1;
        const sessionId = name.slice(prefix.length);
        try {
          const classification = await classify(name);
          if (classification.outcome === "due") {
            candidates.push({
              sessionId,
              kind: classification.kind,
              recordKey: name,
              classification,
            });
          } else {
            summary.skips[classification.reason] =
              (summary.skips[classification.reason] ?? 0) + 1;
          }
        } catch {
          summary.skips.invalid_anchor = (summary.skips.invalid_anchor ?? 0) + 1;
        }
      }
      if (budgetExhausted) {
        // Persist the PAGE-START cursor so the unprocessed remainder of this
        // page is re-read next tick instead of waiting for a full wrap.
        await store
          .putJson(cursorKey, { cursor: pageStartCursor ?? null })
          .catch(() => undefined);
        return;
      }
      if (listing.complete) {
        // Traversal finished: wrap to the beginning next tick (critique P3.2).
        await store.putJson(cursorKey, { cursor: null }).catch(() => undefined);
        return;
      }
      cursor = listing.cursor ?? undefined;
      await store.putJson(cursorKey, { cursor: cursor ?? null }).catch(() => undefined);
    }
  };

  await scanPopulation(
    DIGITAL_PREFIX,
    REVIEW_SCAN_CURSOR_KEYS.digital,
    async (key) =>
      classifyDigitalEntitlement(await store.getJson<StripeSessionEntitlement>(key), now),
    "scannedDigital",
  );
  await scanPopulation(
    PHYSICAL_PREFIX,
    REVIEW_SCAN_CURSOR_KEYS.physical,
    async (key) => classifyPrintRecord(await store.getJson<PrintOrderRecord>(key), now, config.physicalEnabled),
    "scannedPhysical",
  );

  summary.due = candidates.length;

  // Prerequisite gates (critique D5/P2.7): evaluation above always runs so a
  // blocked tick still reports candidate counts — but nothing is claimed or
  // sent while a gate is unmet.
  if (!config.mailingAddress) {
    summary.status = "blocked";
    summary.blockedReason = "mailing_address_missing";
    log(summary);
    return summary;
  }
  if (!config.signingSecret) {
    summary.status = "blocked";
    summary.blockedReason = "signing_secret_missing";
    log(summary);
    return summary;
  }
  if (!config.resendConfigured) {
    summary.status = "blocked";
    summary.blockedReason = "resend_not_configured";
    log(summary);
    return summary;
  }

  const createClaimId = deps.createClaimId ?? (() => crypto.randomUUID());
  let sendsUsed = 0;

  for (const candidate of candidates) {
    if (sendsUsed >= REVIEW_MAX_SENDS_PER_TICK) break;
    const { sessionId } = candidate;
    try {
      // Re-read + re-evaluate immediately before claiming (critique P3.2:
      // scan reads are stale inputs; eligibility is decided here, not there).
      const fresh =
        candidate.kind === "digital"
          ? classifyDigitalEntitlement(
              await store.getJson<StripeSessionEntitlement>(candidate.recordKey),
              now,
            )
          : classifyPrintRecord(
              await store.getJson<PrintOrderRecord>(candidate.recordKey),
              now,
              config.physicalEnabled,
            );
      if (fresh.outcome !== "due") {
        if (fresh.outcome === "excluded" || fresh.outcome === "pending") {
          summary.skips[fresh.reason] = (summary.skips[fresh.reason] ?? 0) + 1;
        }
        continue;
      }

      // Already-asked fast path (one ledger row per session, forever).
      const existing = await deps.ledger.getState(sessionId);
      if (!existing) {
        summary.ledgerUnavailable += 1;
        continue;
      }
      if (isReviewLedgerResolved(existing)) {
        summary.alreadyResolved += 1;
        continue;
      }

      // Suppression checked at send time — inside this loop, immediately
      // before the claim (mirrors OurImprint's pre-claim opt-out check).
      if (await isReviewSuppressed(store, fresh.email)) {
        summary.suppressed += 1;
        continue;
      }

      const claimId = createClaimId();
      const claim = await deps.ledger.apply(sessionId, {
        type: "begin_claim",
        claimId,
        kind: fresh.kind,
        email: fresh.email,
        anchorAt: fresh.anchorAt,
        dueAt: fresh.dueAt,
        now,
      });
      if (!claim) {
        summary.ledgerUnavailable += 1;
        continue;
      }
      if (claim.outcome === "already_resolved") {
        summary.alreadyResolved += 1;
        continue;
      }
      if (claim.outcome !== "claimed") {
        summary.inFlightOrBackoff += 1;
        continue;
      }

      sendsUsed += 1;

      let built: ReturnType<typeof buildReviewRequestEmail>;
      try {
        built = buildReviewRequestEmail({
          kind: fresh.kind,
          siteUrl: config.siteUrl,
          supportEmail: config.supportEmail,
          mailingAddress: config.mailingAddress,
          optOutUrl: buildReviewOptOutUrl(config.siteUrl, normalizePromotionEmail(fresh.email), config.signingSecret),
        });
      } catch (error) {
        await deps.ledger.apply(sessionId, {
          type: "abandon_claim",
          claimId,
          error: error instanceof Error ? error.message : "email_build_failed",
          permanent: false,
          now,
        });
        summary.sendFailed += 1;
        continue;
      }

      // Claim-currency re-verification immediately before the provider call
      // (critique P3.3): a claimant displaced by stale-reclaim must not send.
      const currency = await deps.ledger.getState(sessionId);
      if (!currency || currency.status !== "sending" || currency.claimId !== claimId) {
        summary.disputed += 1;
        continue;
      }

      const result = await deps.send({
        to: fresh.email,
        subject: built.subject,
        html: built.html,
        text: built.text,
        headers: built.headers,
        idempotencyKey: reviewRequestIdempotencyKey(sessionId),
        tags: { type: "review_request", kind: fresh.kind },
      });

      if (result.ok && result.id) {
        // `sent` is written ONLY after definitive provider acceptance, and
        // records the provider id (critique P2/P3.3).
        const completion = await deps.ledger.apply(sessionId, {
          type: "complete_claim",
          claimId,
          providerId: result.id,
          now,
        });
        if (completion && completion.outcome === "completed") {
          summary.sent += 1;
        } else {
          summary.disputed += 1;
        }
        continue;
      }
      if (result.ok && !result.id) {
        // Accepted with no provider id: ambiguous — leave the claim in
        // `sending`; stale-reclaim converts it later rather than risk a
        // duplicate ask on a guess.
        summary.deferred += 1;
        continue;
      }
      if (!result.ok) {
        const failureClass = classifyReviewSendError(result.error);
        if (failureClass === "ambiguous" || failureClass === "config") {
          // No definitive provider answer: do NOT consume an attempt.
          summary.deferred += 1;
          continue;
        }
        await deps.ledger.apply(sessionId, {
          type: "abandon_claim",
          claimId,
          error: result.error,
          permanent: failureClass === "permanent",
          now,
        });
        summary.sendFailed += 1;
      }
    } catch {
      // Per-record isolation: one bad record never throws the tick.
      summary.sendFailed += 1;
    }
  }

  log(summary);
  return summary;
}
