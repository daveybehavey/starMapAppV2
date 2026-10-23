/**
 * StarMapCo post-delivery review-request engine (T1) — core logic.
 *
 * Design: ~/workspace/starmapco-redesign/review-engine-design-2026-10-19.md,
 * revised by the T-T1 design iteration (burn lane 2026-10-22b pass 1).
 * Due windows and the one-ask policy carry over from the original design;
 * the send path is the revised one: this tick only discovers candidates,
 * claims them in the per-session ledger DO with the provider payload frozen
 * at first claim, and hands dispatch to the suppression coordinator
 * (reviewRequestSuppression.ts) — the only component that may call the
 * provider. Dispatching is never reclaimed; ambiguous outcomes are
 * terminal `uncertain`, never resent; retries are bounded by the absolute
 * deadline persisted at first dispatch.
 *
 * INERT BY DEFAULT: the engine does nothing unless REVIEW_REQUESTS_ENABLED
 * is exactly "true", and even then it sends nothing until every prerequisite
 * is present (CASL mailing address, opt-out signing secret, Resend config).
 * The physical (ship-anchored) branch is gated separately by
 * REVIEW_REQUESTS_PHYSICAL_ENABLED — it has no delivery signal, so it
 * activates only on its own explicit decision (design §12).
 *
 * Gift exclusion FAILS CLOSED (T-T1): eligibility requires the record's
 * `isGift` to be literally `false`; an absent/unknown flag excludes the
 * session (reason `gift_uncertain`). Until the checkout gift-flag writer
 * lands, that means every record is excluded — deliberately: an engine
 * that cannot prove an order is not a gift must not ask its recipient.
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
  type FrozenReviewPayload,
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
import {
  deriveReviewSuppressionName,
  type ReviewSuppressionClient,
} from "@/lib/reviewRequestSuppression";

export {
  classifyReviewSendError,
  type ReviewDispatchOutcome,
  type ReviewFailureClass,
  type ReviewSendFn,
  type ReviewSendInput,
  type ReviewSendResult,
  type ReviewSuppressionClient,
} from "@/lib/reviewRequestSuppression";

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

/** Per-tick budgets (design §7 + critique P2: bounded work, persisted cursors).
 * The get budget is PER POPULATION: a shared counter let a large digital
 * population starve the physical scan entirely (PR #348 Codex P2). */
export const REVIEW_MAX_SENDS_PER_TICK = 50;
export const REVIEW_SCAN_MAX_PAGES_PER_POPULATION = 10;
export const REVIEW_SCAN_PAGE_SIZE = 100;
export const REVIEW_SCAN_MAX_GETS_PER_POPULATION = 500;

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
  /** The dispatch coordinator — the only path to the provider. */
  suppression: ReviewSuppressionClient;
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
  | "gift_uncertain"
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
  if (record.orderType === "print") {
    // Print sessions are judged ONLY in the physical population (D9) —
    // including their gift status, which the physical classifier and the
    // send-time entitlement cross-check own between them.
    return { outcome: "excluded", kind, reason: "print_order_physical_branch" };
  }
  // Fail closed on gifts (T-T1): only a literal `false` is eligible — an
  // absent flag means the writer never recorded gift status, and a gift
  // recipient must never be asked to review someone else's purchase.
  if (record.isGift === true) return { outcome: "excluded", kind, reason: "gift_order" };
  if (record.isGift !== false) return { outcome: "excluded", kind, reason: "gift_uncertain" };
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
  if (record.isGift !== false) return { outcome: "excluded", kind, reason: "gift_uncertain" };
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
// Suppression sources (KV). These are HINTS the tick checks before claiming;
// the authoritative gate is the suppression coordinator's own record,
// checked inside dispatch (reviewRequestSuppression.ts). A KV hint hit is
// recorded as a ledger transition (mark_suppressed) so suppression leaves
// state, per T-T1 — it is no longer a silent skip.
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
  /** Includes deadline-expired dispatches (terminal, never sent). */
  deferred: number;
  suppressed: number;
  alreadyResolved: number;
  inFlightOrBackoff: number;
  ledgerUnavailable: number;
  /** Coordinator unreachable: claim released unconsumed, nothing sent. */
  suppressionUnavailable: number;
  /** Dispatches whose provider outcome is unknowable — terminal, never resent. */
  uncertain: number;
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
    suppressionUnavailable: 0,
    uncertain: 0,
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

  const candidates: DueCandidate[] = [];

  const scanPopulation = async (
    prefix: string,
    cursorKey: string,
    classify: (recordKey: string) => Promise<ReviewClassification>,
    counterKey: "scannedDigital" | "scannedPhysical",
  ): Promise<void> => {
    let getsUsed = 0;
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
        if (getsUsed >= REVIEW_SCAN_MAX_GETS_PER_POPULATION) {
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
  const nowFn = deps.now ?? Date.now;
  let sendsUsed = 0;

  for (const candidate of candidates) {
    if (sendsUsed >= REVIEW_MAX_SENDS_PER_TICK) break;
    const { sessionId } = candidate;
    try {
      // Fresh clock per candidate (T-T1: no tick-timestamp reuse — the scan
      // time decided candidacy; eligibility, claim and dispatch each sample
      // their own time so a long tick never acts on a stale "now").
      const sendNow = nowFn();
      // Re-read + re-evaluate immediately before claiming (critique P3.2:
      // scan reads are stale inputs; eligibility is decided here, not there).
      const fresh =
        candidate.kind === "digital"
          ? classifyDigitalEntitlement(
              await store.getJson<StripeSessionEntitlement>(candidate.recordKey),
              sendNow,
            )
          : classifyPrintRecord(
              await store.getJson<PrintOrderRecord>(candidate.recordKey),
              sendNow,
              config.physicalEnabled,
            );
      if (fresh.outcome !== "due") {
        summary.skips[fresh.reason] = (summary.skips[fresh.reason] ?? 0) + 1;
        continue;
      }

      if (candidate.kind === "physical") {
        // Refund/revocation state lives on the ENTITLEMENT, not the print
        // record: the Stripe webhook's revoke path updates only
        // stripe:session:<id> and never marks the print record failed
        // (PR #348 Codex P2). A shipped-but-refunded order must never be
        // asked, so physical sends re-check the entitlement here. A missing
        // entitlement fails closed: fulfillment implies one exists. The
        // gift cross-check is fail-closed too (T-T1): BOTH records must be
        // literal `isGift === false` — the print classifier has already
        // proven the print record; here the entitlement must agree.
        const entitlement = await store.getJson<StripeSessionEntitlement>(
          `${DIGITAL_PREFIX}${sessionId}`,
        );
        if (!entitlement || entitlement.revoked === true || entitlement.paid !== true) {
          summary.skips.revoked = (summary.skips.revoked ?? 0) + 1;
          continue;
        }
        if (entitlement.isGift !== false) {
          const reason = entitlement.isGift === true ? "gift_order" : "gift_uncertain";
          summary.skips[reason] = (summary.skips[reason] ?? 0) + 1;
          continue;
        }
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

      // Suppression hint (KV sources), checked at send time immediately
      // before claiming. A hit becomes a ledger transition — suppression
      // is recorded state, not a skip (T-T1). The authoritative check runs
      // again inside dispatch, so a race here can only over-suppress.
      if (await isReviewSuppressed(store, fresh.email)) {
        const marked = await deps.ledger.apply(sessionId, {
          type: "mark_suppressed",
          kind: fresh.kind,
          anchorAt: fresh.anchorAt,
          dueAt: fresh.dueAt,
          now: sendNow,
        });
        if (!marked) {
          summary.ledgerUnavailable += 1;
        } else if (marked.outcome === "suppressed") {
          summary.suppressed += 1;
        } else if (marked.outcome === "already_resolved") {
          summary.alreadyResolved += 1;
        } else {
          summary.inFlightOrBackoff += 1;
        }
        continue;
      }

      // The payload is rendered ONCE, at first claim, and frozen into the
      // ledger row; retries dispatch the frozen bytes (T-T1). A retry row
      // already carries its payload — reuse it verbatim.
      let payload: FrozenReviewPayload | null = existing.payload;
      if (!payload) {
        try {
          const built = buildReviewRequestEmail({
            kind: fresh.kind,
            siteUrl: config.siteUrl,
            supportEmail: config.supportEmail,
            mailingAddress: config.mailingAddress,
            optOutUrl: buildReviewOptOutUrl(
              config.siteUrl,
              normalizePromotionEmail(fresh.email),
              config.signingSecret as string,
            ),
          });
          payload = {
            to: fresh.email,
            subject: built.subject,
            html: built.html,
            text: built.text,
            headers: built.headers,
            idempotencyKey: reviewRequestIdempotencyKey(sessionId),
            tags: { type: "review_request", kind: fresh.kind },
          };
        } catch {
          // Render failure BEFORE any claim exists: nothing was claimed,
          // nothing is consumed — the session stays eligible next tick.
          summary.sendFailed += 1;
          continue;
        }
      }

      const claimId = createClaimId();
      const claim = await deps.ledger.apply(sessionId, {
        type: "begin_claim",
        claimId,
        kind: fresh.kind,
        email: fresh.email,
        anchorAt: fresh.anchorAt,
        dueAt: fresh.dueAt,
        eligibilityEndsAt:
          fresh.anchorAt +
          (fresh.kind === "digital" ? REVIEW_DIGITAL_MAX_AGE_MS : REVIEW_PHYSICAL_MAX_AGE_MS),
        payload,
        now: sendNow,
      });
      if (!claim) {
        summary.ledgerUnavailable += 1;
        continue;
      }
      if (claim.outcome === "already_resolved") {
        summary.alreadyResolved += 1;
        continue;
      }
      if (claim.outcome === "payload_diverged") {
        summary.sendFailed += 1;
        continue;
      }
      if (claim.outcome !== "claimed") {
        summary.inFlightOrBackoff += 1;
        continue;
      }

      sendsUsed += 1;

      // Dispatch via the suppression coordinator — the only provider path.
      // The claim token fences the send itself now (T-T1): the coordinator
      // re-verifies suppression authoritatively, commits `dispatching`
      // under this token, and only then calls the provider.
      const suppressionName = deriveReviewSuppressionName(
        normalizePromotionEmail(fresh.email),
        config.signingSecret as string,
      );
      const dispatch = await deps.suppression.dispatch({
        sessionId,
        claimId,
        name: suppressionName,
      });
      if (dispatch === null || dispatch.outcome === "unavailable") {
        // The coordinator never started a dispatch: release the claim
        // unconsumed so a later tick can retry — nothing was sent and
        // nothing is ambiguous.
        await deps.ledger.apply(sessionId, {
          type: "release_claim",
          claimId,
          now: nowFn(),
        });
        summary.suppressionUnavailable += 1;
        continue;
      }
      switch (dispatch.outcome) {
        case "sent":
          summary.sent += 1;
          break;
        case "suppressed":
          summary.suppressed += 1;
          break;
        case "retry_scheduled":
        case "failed":
          summary.sendFailed += 1;
          break;
        case "uncertain":
          summary.uncertain += 1;
          break;
        case "expired":
          summary.deferred += 1;
          break;
        case "not_dispatchable":
          summary.disputed += 1;
          break;
      }
    } catch {
      // Per-record isolation: one bad record never throws the tick.
      summary.sendFailed += 1;
    }
  }

  log(summary);
  return summary;
}
