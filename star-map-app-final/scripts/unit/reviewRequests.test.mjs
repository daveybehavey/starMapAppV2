/**
 * reviewRequests.test.mjs — StarMapCo post-delivery review engine (T1),
 * REVISED design (T-T1 design iteration, burn lane 2026-10-22b pass 1).
 *
 * Pins:
 * - the revised ledger machine: claim with frozen payload, irreversible
 *   dispatching (never reclaimed), absolute retry deadline persisted at
 *   first dispatch, payload-divergence terminalization, suppression as a
 *   ledger transition, terminal PII stripping, uncertain redaction,
 *   erasure, and legacy-row quarantine;
 * - the dispatch coordinator: suppression as the final send gate, exactly
 *   one provider call with the frozen payload, ambiguous outcomes terminal
 *   `uncertain` (never resent), deadline refusal before the provider —
 *   including at the point of invocation, after the commit RPC returns;
 * - the G-dot gate fix round: frozen From/Reply-To (never re-derived from
 *   env per attempt), `retry`-row boundary expiry so PII cannot strand,
 *   legacy-migration error sanitization, release_claim safety under
 *   dispatch-response loss, and the promotions unsubscribe page writing
 *   the authoritative suppression record BEFORE acknowledging;
 * - fail-closed storage modes (live mode NEVER falls back to process
 *   memory — not even with CI/local env vars set);
 * - the post-commit eligibility re-check (S54-5 design (b), revised by
 *   S54-5B): a revocation landing between the tick's eligibility read
 *   and the dispatch commit fences the send; an unavailable authority
 *   sends nothing and settles terminally; fresh evidence must bind to
 *   the frozen recipient and request kind;
 * - 13-month retention (S54-5 design (a), revised): calendar-month
 *   boundary arithmetic, keyed opt-out markers replacing raw-address
 *   rows, a migration sweep that installs replacement protection BEFORE
 *   deleting any legacy row, and suppression-metadata minimization that
 *   can never lift suppression itself; plus the REAL suppression DO over
 *   a fake storage: a migrated legacy opt-out pulls the record's
 *   retention anchor back to the original opt-out time (never forward),
 *   and a past-deadline anchor minimizes on the next touch with the
 *   suppression flag standing;
 * - due evaluation for both branches at their exact window boundaries,
 *   fail-closed gift exclusion (literal `isGift === false` required), and
 *   the max-age rule (a late-enabled engine must never mail the
 *   back-catalogue);
 * - the tick end-to-end over fake store/ledger/coordinator: inert flag,
 *   pre-claim prerequisite gates, suppression transitions, one-ask-only,
 *   frozen-payload retries, per-candidate fresh clocks, budgets, cursors;
 * - the email builder (CASL throw, single Google destination, conditional
 *   physical copy) and the opt-out secret chain (Stripe secrets NEVER sign);
 * - the Resend wrapper extension (Idempotency-Key is an HTTP header,
 *   message headers land in the payload `headers` field, callers cannot
 *   override Authorization/Content-Type);
 * - wiring construction (cron trigger, both DO bindings, flag NOT in
 *   [vars], coordinator-only provider access, shippedAt persisted before
 *   the shipping email send).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

// The engine/email modules use the repo's "@/..." alias for runtime imports;
// the plain-Node runner cannot resolve it (and ".ts" specifiers are barred
// by tsconfig, TS5097). Register the alias hooks, then pull those modules in
// dynamically so the tests exercise the REAL code, not a harness mirror.
register("./tsAliasLoader.mjs", import.meta.url);
register("./reviewRequests.hooks.mjs", import.meta.url);

import {
  applyReviewLedgerOp,
  createEmptyReviewLedgerState,
  migrateLegacyReviewLedgerState,
  reviewPayloadsEqual,
  reviewSendBackoffMs,
  sanitizeReviewError,
  REVIEW_REQUEST_CLAIM_STALE_MS,
  REVIEW_REQUEST_MAX_ATTEMPTS,
  REVIEW_REQUEST_RETRY_DEADLINE_MS,
} from "../../src/lib/reviewRequestLedgerState.ts";
import { sendResendEmail } from "../../src/lib/resend.ts";

const {
  classifyDigitalEntitlement,
  classifyPrintRecord,
  classifyReviewSendError,
  createReviewDispatchEligibilityChecker,
  isReviewSuppressed,
  normalizeAnchorMs,
  recordReviewOptOut,
  reviewOptOutKey,
  reviewOptOutMarkerKey,
  resolveReviewEngineConfig,
  runReviewOptOutRetentionSweep,
  runReviewRequestTick,
  REVIEW_DIGITAL_DELAY_MS,
  REVIEW_DIGITAL_MAX_AGE_MS,
  REVIEW_PHYSICAL_DELAY_MS,
  REVIEW_PHYSICAL_MAX_AGE_MS,
  REVIEW_MAX_SENDS_PER_TICK,
} = await import("../../src/lib/reviewRequests.ts");
const {
  addCalendarMonthsMs,
  createInMemoryReviewSuppressionClient,
  createReviewSuppressionClient,
  deriveReviewSuppressionName,
  executeReviewDispatch,
  isReviewSuppressionMinimized,
  reviewRetentionDeadlineMs,
  reviewSuppressionMinimizationDue,
  sanitizeReviewSuppressionSource,
} = await import("../../src/lib/reviewRequestSuppression.ts");
const { createReviewLedgerClient, __resetReviewLedgerMemoryForTests } = await import(
  "../../src/lib/reviewRequestLedger.ts"
);
const { ReviewRequestSuppressionDO } = await import(
  "../../src/durable-objects/ReviewRequestSuppressionDO.ts"
);
const {
  buildReviewOptOutUrl,
  buildReviewRequestEmail,
  getReviewOptOutSecret,
  verifyReviewOptOutToken,
  GOOGLE_REVIEW_URL,
  REVIEW_REQUEST_SUBJECT,
} = await import("../../src/lib/reviewRequestEmail.ts");

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 19, 12, 0, 0); // 2026-10-19T12:00:00Z
const SECRET = "test-signing-secret-0123456789abcdef";
const ADDRESS = "StarMapCo, PO Box 123, Victoria BC";

// ---------------------------------------------------------------------------
// Revised ledger machine
// ---------------------------------------------------------------------------

function frozenPayload(sessionId, overrides = {}) {
  return {
    to: "buyer@example.com",
    from: "StarMapCo <orders@starmapco.com>",
    replyTo: "support@starmapco.com",
    subject: REVIEW_REQUEST_SUBJECT,
    html: "<p>review ask</p>",
    text: "review ask",
    headers: { "List-Unsubscribe": "<https://starmapco.com/api/reviews/opt-out?e=x&t=y>" },
    idempotencyKey: `review-request:${sessionId}`,
    tags: { type: "review_request", kind: "digital" },
    ...overrides,
  };
}

function claim(state, claimId, now, overrides = {}) {
  return applyReviewLedgerOp(state, {
    type: "begin_claim",
    claimId,
    kind: "digital",
    email: "buyer@example.com",
    anchorAt: now - 4 * DAY,
    dueAt: now - DAY,
    eligibilityEndsAt: now - 4 * DAY + REVIEW_DIGITAL_MAX_AGE_MS,
    payload: frozenPayload(state.sessionId),
    now,
    ...overrides,
  });
}

function dispatch(state, claimId, now) {
  return applyReviewLedgerOp(state, { type: "begin_dispatch", claimId, now });
}

function resolveDispatch(state, claimId, result, now) {
  return applyReviewLedgerOp(state, { type: "resolve_dispatch", claimId, result, now });
}

test("ledger: begin on empty claims and freezes payload + identity", () => {
  const empty = createEmptyReviewLedgerState("cs_live_a");
  const first = claim(empty, "claim-1", NOW);
  assert.equal(first.outcome, "claimed");
  assert.equal(first.state.status, "claimed");
  assert.equal(first.state.attempts, 0);
  assert.deepEqual(first.state.payload, frozenPayload("cs_live_a"));
  assert.equal(first.state.eligibilityEndsAt, NOW - 4 * DAY + REVIEW_DIGITAL_MAX_AGE_MS);
  // A second claimant is refused while the claim is live.
  const second = claim(first.state, "claim-2", NOW + 60_000);
  assert.equal(second.outcome, "in_flight");
  assert.equal(second.changed, false);
});

test("ledger: terminals refuse begin_claim (one ask only)", () => {
  const claimed = claim(createEmptyReviewLedgerState("cs_live_b"), "c1", NOW).state;
  const sent = resolveDispatch(dispatch(claimed, "c1", NOW).state, "c1", {
    type: "accepted",
    providerId: "msg_1",
  }, NOW + 1000).state;
  assert.equal(sent.status, "sent");
  assert.equal(claim(sent, "c2", NOW + DAY).outcome, "already_resolved");

  const suppressed = applyReviewLedgerOp(claimed, { type: "mark_suppressed", now: NOW }).state;
  assert.equal(claim(suppressed, "c2", NOW + DAY).outcome, "already_resolved");
  const erased = applyReviewLedgerOp(claimed, { type: "erase", now: NOW }).state;
  assert.equal(claim(erased, "c2", NOW + DAY).outcome, "already_resolved");
});

test("ledger: dispatching is NEVER reclaimed — a stale owner cannot resume", () => {
  const claimed = claim(createEmptyReviewLedgerState("cs_live_c"), "c1", NOW).state;
  const dispatching = dispatch(claimed, "c1", NOW).state;
  assert.equal(dispatching.status, "dispatching");
  assert.equal(dispatching.attempts, 1);
  assert.equal(dispatching.firstDispatchAt, NOW);
  // A year later the row is still dispatching: no stale reclaim exists.
  const lateClaim = claim(dispatching, "c2", NOW + 365 * DAY);
  assert.equal(lateClaim.outcome, "in_flight");
  assert.equal(lateClaim.state.status, "dispatching");
  // Not even the same owner may dispatch twice.
  assert.equal(dispatch(dispatching, "c1", NOW + HOUR).outcome, "in_flight");
  // The crashed dispatch settles as uncertain via expire_dispatch, once.
  const expired = applyReviewLedgerOp(dispatching, {
    type: "expire_dispatch",
    claimId: "c1",
    now: NOW + HOUR,
  });
  assert.equal(expired.outcome, "uncertain");
  assert.equal(expired.state.status, "uncertain");
  assert.equal(expired.state.attempts, 1); // counted at dispatch, not again
  assert.equal(expired.state.payload, null);
});

test("ledger: claim-token discipline — a displaced claimant can neither resolve nor release", () => {
  const claimed = claim(createEmptyReviewLedgerState("cs_live_g"), "claim-A", NOW).state;
  const dispatching = dispatch(claimed, "claim-A", NOW).state;
  const byOther = resolveDispatch(dispatching, "claim-B", { type: "accepted", providerId: "x" }, NOW);
  assert.equal(byOther.outcome, "not_claim_owner");
  assert.equal(byOther.state.status, "dispatching");
  const releaseOther = applyReviewLedgerOp(claimed, {
    type: "release_claim",
    claimId: "claim-B",
    now: NOW,
  });
  assert.equal(releaseOther.outcome, "not_claim_owner");
  // Ops on an empty row are no-ops, not errors.
  const empty = createEmptyReviewLedgerState("cs_live_none");
  assert.equal(
    resolveDispatch(empty, "x", { type: "accepted", providerId: "y" }, NOW).outcome,
    "no_row",
  );
});

test("ledger: release_claim returns an undispatched claim unconsumed", () => {
  const claimed = claim(createEmptyReviewLedgerState("cs_live_r"), "c1", NOW).state;
  const released = applyReviewLedgerOp(claimed, { type: "release_claim", claimId: "c1", now: NOW + 1000 });
  assert.equal(released.outcome, "released");
  assert.equal(released.state.status, "retry");
  assert.equal(released.state.attempts, 0);
  assert.equal(released.state.nextAttemptAt, NOW + 1000);
  assert.deepEqual(released.state.payload, frozenPayload("cs_live_r")); // frozen payload kept
  // And it can be claimed again immediately.
  assert.equal(claim(released.state, "c2", NOW + 1000).outcome, "claimed");
});

test("ledger: expire_claim recovers an abandoned pre-dispatch claim — only at the stale boundary", () => {
  const claimed = claim(createEmptyReviewLedgerState("cs_live_ec"), "c1", NOW).state;
  // 1ms before the boundary: untouched.
  const early = applyReviewLedgerOp(claimed, {
    type: "expire_claim",
    now: NOW + REVIEW_REQUEST_CLAIM_STALE_MS - 1,
  });
  assert.equal(early.outcome, "no_change");
  assert.equal(early.state.status, "claimed");
  // At the boundary: released back to a due retry, unconsumed, payload kept.
  const expired = applyReviewLedgerOp(claimed, {
    type: "expire_claim",
    now: NOW + REVIEW_REQUEST_CLAIM_STALE_MS,
  });
  assert.equal(expired.outcome, "released");
  assert.equal(expired.state.status, "retry");
  assert.equal(expired.state.attempts, 0);
  assert.equal(expired.state.claimId, null);
  assert.equal(expired.state.nextAttemptAt, NOW + REVIEW_REQUEST_CLAIM_STALE_MS);
  assert.deepEqual(expired.state.payload, frozenPayload("cs_live_ec"));
  // The dead claimant is fenced out for good; a fresh claim takes over.
  const reclaim = claim(expired.state, "c2", NOW + REVIEW_REQUEST_CLAIM_STALE_MS);
  assert.equal(reclaim.outcome, "claimed");
  assert.equal(dispatch(expired.state, "c1", NOW + REVIEW_REQUEST_CLAIM_STALE_MS).outcome, "not_claim_owner");
  assert.equal(dispatch(reclaim.state, "c2", NOW + REVIEW_REQUEST_CLAIM_STALE_MS).outcome, "dispatching");
});

test("ledger: expire_claim NEVER reclaims a committed dispatch", () => {
  const claimed = claim(createEmptyReviewLedgerState("cs_live_ecd"), "c1", NOW).state;
  const dispatching = dispatch(claimed, "c1", NOW).state;
  const stale = NOW + REVIEW_REQUEST_CLAIM_STALE_MS * 10;
  const result = applyReviewLedgerOp(dispatching, { type: "expire_claim", now: stale });
  assert.equal(result.outcome, "no_change");
  assert.equal(result.state.status, "dispatching");
});

test("ledger: expire_claim after eligibility ends terminalizes — PII never drops into a dead retry", () => {
  // Eligibility ends 5 minutes after the claim; the claimant dies and the
  // stale-claim sweep only runs after eligibility is over.
  const claimed = claim(createEmptyReviewLedgerState("cs_live_ece"), "c1", NOW, {
    eligibilityEndsAt: NOW + 5 * 60 * 1000,
  }).state;
  const result = applyReviewLedgerOp(claimed, {
    type: "expire_claim",
    now: NOW + REVIEW_REQUEST_CLAIM_STALE_MS,
  });
  assert.equal(result.outcome, "expired");
  assert.equal(result.state.status, "expired");
  assert.equal(result.state.email, null); // terminal strip
  assert.equal(result.state.payload, null);
  assert.equal(result.state.claimId, null);
});

test("ledger: expire_retry expires a stranded retry at its boundary — and only there", () => {
  const claimed = claim(createEmptyReviewLedgerState("cs_live_er"), "c1", NOW).state;
  const retry = resolveDispatch(dispatch(claimed, "c1", NOW).state, "c1", {
    type: "rejected",
    error: "resend_http_500:boom",
    permanent: false,
  }, NOW).state;
  assert.equal(retry.status, "retry");
  // The boundary is min(eligibility end, retry deadline) = NOW + 23h here
  // (first dispatch NOW, eligibility NOW + 10d).
  const boundary = NOW + REVIEW_REQUEST_RETRY_DEADLINE_MS;
  const early = applyReviewLedgerOp(retry, { type: "expire_retry", now: boundary - 1 });
  assert.equal(early.outcome, "no_change");
  assert.equal(early.state.status, "retry");
  assert.ok(early.state.payload); // still sendable — PII legitimately held
  const atBoundary = applyReviewLedgerOp(retry, { type: "expire_retry", now: boundary });
  assert.equal(atBoundary.outcome, "expired");
  assert.equal(atBoundary.state.status, "expired");
  assert.equal(atBoundary.state.email, null);
  assert.equal(atBoundary.state.payload, null);
  // Non-retry rows are untouched by the retry sweep.
  const claimedRow = claim(createEmptyReviewLedgerState("cs_live_er2"), "c1", NOW).state;
  assert.equal(
    applyReviewLedgerOp(claimedRow, { type: "expire_retry", now: NOW + 365 * DAY }).outcome,
    "no_change",
  );
  const dispatchingRow = dispatch(claimedRow, "c1", NOW).state;
  assert.equal(
    applyReviewLedgerOp(dispatchingRow, { type: "expire_retry", now: NOW + 365 * DAY }).outcome,
    "no_change",
  );
});

test("ledger: release_claim on a COMMITTED dispatch is a no-op — the response-loss guard", () => {
  // The Q2(b) safety property: a caller whose dispatch RPC response was
  // lost will attempt release_claim believing nothing was sent. The
  // machine — not that belief — is what keeps the committed dispatch
  // from being resurrected into a blind retry.
  const claimed = claim(createEmptyReviewLedgerState("cs_live_rl"), "c1", NOW).state;
  const dispatching = dispatch(claimed, "c1", NOW).state;
  const released = applyReviewLedgerOp(dispatching, {
    type: "release_claim",
    claimId: "c1", // even the OWNER token cannot release a committed dispatch
    now: NOW + 1000,
  });
  assert.equal(released.outcome, "no_change");
  assert.equal(released.changed, false);
  assert.equal(released.state.status, "dispatching");
  assert.equal(released.state.attempts, 1);
  // The committed row settles through the dispatch lifecycle instead.
  const settled = applyReviewLedgerOp(released.state, {
    type: "expire_dispatch",
    claimId: "c1",
    now: NOW + HOUR,
  });
  assert.equal(settled.outcome, "uncertain");
  assert.equal(settled.state.status, "uncertain");
});

test("ledger: absolute deadline — persisted at first dispatch, enforced at equality", () => {
  assert.equal(REVIEW_REQUEST_RETRY_DEADLINE_MS, 23 * HOUR);
  // Eligibility ends in 1h: the deadline is the eligibility end, not +23h.
  const claimed = claim(createEmptyReviewLedgerState("cs_live_dl"), "c1", NOW, {
    eligibilityEndsAt: NOW + HOUR,
  }).state;
  const dispatching = dispatch(claimed, "c1", NOW).state;
  assert.equal(dispatching.firstDispatchAt, NOW);
  assert.equal(dispatching.retryDeadlineAt, NOW + HOUR);
  const retried = resolveDispatch(dispatching, "c1", {
    type: "rejected",
    error: "resend_http_500:boom",
    permanent: false,
  }, NOW).state;
  assert.equal(retried.status, "retry");
  const reclaimed = claim(retried, "c2", NOW + HOUR).state; // backoff (1h) reached
  const atDeadline = dispatch(reclaimed, "c2", NOW + HOUR);
  assert.equal(atDeadline.outcome, "expired");
  assert.equal(atDeadline.state.status, "expired");
  assert.equal(atDeadline.state.email, null); // terminal strip
  assert.equal(atDeadline.state.payload, null);

  // With a wide eligibility window the deadline is firstDispatch + 23h.
  const wide = claim(createEmptyReviewLedgerState("cs_live_dl2"), "c1", NOW).state;
  const wideDispatch = dispatch(wide, "c1", NOW).state;
  assert.equal(wideDispatch.retryDeadlineAt, NOW + 23 * HOUR);
});

test("ledger: backoff ladder is 1h/6h/24h and retries keep the frozen payload", () => {
  assert.equal(reviewSendBackoffMs(1), HOUR);
  assert.equal(reviewSendBackoffMs(2), 6 * HOUR);
  assert.equal(reviewSendBackoffMs(3), 24 * HOUR);
  const claimed = claim(createEmptyReviewLedgerState("cs_live_e"), "c1", NOW).state;
  const failedOnce = resolveDispatch(dispatch(claimed, "c1", NOW).state, "c1", {
    type: "rejected",
    error: "resend_http_500:boom",
    permanent: false,
  }, NOW);
  assert.equal(failedOnce.outcome, "retry_scheduled");
  assert.equal(failedOnce.state.nextAttemptAt, NOW + HOUR);
  assert.deepEqual(failedOnce.state.payload, frozenPayload("cs_live_e"));
  assert.equal(claim(failedOnce.state, "c2", NOW + 30 * 60 * 1000).outcome, "backoff");
  assert.equal(claim(failedOnce.state, "c2", NOW + HOUR).outcome, "claimed");
});

test("ledger: permanent rejection quarantines; the attempt cap quarantines", () => {
  const claimed = claim(createEmptyReviewLedgerState("cs_live_f"), "c1", NOW).state;
  const permanent = resolveDispatch(dispatch(claimed, "c1", NOW).state, "c1", {
    type: "rejected",
    error: "resend_http_422:invalid recipient",
    permanent: true,
  }, NOW);
  assert.equal(permanent.outcome, "quarantined");
  assert.equal(permanent.state.status, "failed");
  assert.equal(permanent.state.attempts, 1);
  assert.equal(permanent.state.email, null);

  const almostOut = { ...claimed, attempts: REVIEW_REQUEST_MAX_ATTEMPTS - 1 };
  const fifth = resolveDispatch(dispatch(almostOut, "c1", NOW).state, "c1", {
    type: "rejected",
    error: "resend_http_503:down",
    permanent: false,
  }, NOW);
  assert.equal(fifth.state.attempts, REVIEW_REQUEST_MAX_ATTEMPTS);
  assert.equal(fifth.outcome, "quarantined");
  assert.equal(fifth.state.status, "failed");
});

test("ledger: accepted strips payload, recipient, provider id and claim token", () => {
  const claimed = claim(createEmptyReviewLedgerState("cs_live_s"), "c1", NOW).state;
  const sent = resolveDispatch(dispatch(claimed, "c1", NOW).state, "c1", {
    type: "accepted",
    providerId: "msg_secret",
  }, NOW + 5000);
  assert.equal(sent.outcome, "completed");
  assert.equal(sent.state.status, "sent");
  assert.equal(sent.state.sentAt, NOW + 5000);
  assert.equal(sent.state.email, null);
  assert.equal(sent.state.payload, null);
  assert.equal(sent.state.providerId, null);
  assert.equal(sent.state.claimId, null);
  // The tombstone keeps status + timestamps only.
  assert.equal(sent.state.kind, "digital");
  assert.equal(sent.state.anchorAt, NOW - 4 * DAY);
});

test("ledger: ambiguous resolution is terminal uncertain; redaction strips the rest", () => {
  const claimed = claim(createEmptyReviewLedgerState("cs_live_u"), "c1", NOW).state;
  const uncertain = resolveDispatch(dispatch(claimed, "c1", NOW).state, "c1", {
    type: "ambiguous",
    error: "resend_fetch_failed:socket hangup",
  }, NOW);
  assert.equal(uncertain.outcome, "uncertain");
  assert.equal(uncertain.state.status, "uncertain");
  assert.equal(uncertain.state.payload, null); // payload stripped immediately
  assert.equal(uncertain.state.email, "buyer@example.com"); // recipient kept ≤ redaction window
  assert.equal(claim(uncertain.state, "c2", NOW + DAY).outcome, "already_resolved"); // never resent
  const redacted = applyReviewLedgerOp(uncertain.state, { type: "redact", now: NOW + 10 * 60 * 1000 });
  assert.equal(redacted.outcome, "redacted");
  assert.equal(redacted.state.email, null);
  assert.equal(redacted.state.redactedAt, NOW + 10 * 60 * 1000);
  assert.equal(applyReviewLedgerOp(redacted.state, { type: "redact", now: NOW + HOUR }).outcome, "no_change");
});

test("ledger: frozen payload — a divergent retry claim terminalizes instead of rebuilding", () => {
  assert.equal(reviewPayloadsEqual(frozenPayload("cs_x"), frozenPayload("cs_x")), true);
  const reordered = frozenPayload("cs_x");
  const shuffled = {
    tags: reordered.tags,
    idempotencyKey: reordered.idempotencyKey,
    headers: reordered.headers,
    text: reordered.text,
    html: reordered.html,
    subject: reordered.subject,
    replyTo: reordered.replyTo,
    from: reordered.from,
    to: reordered.to,
  };
  assert.equal(reviewPayloadsEqual(reordered, shuffled), true); // key order is not divergence

  const claimed = claim(createEmptyReviewLedgerState("cs_live_div"), "c1", NOW).state;
  const retried = resolveDispatch(dispatch(claimed, "c1", NOW).state, "c1", {
    type: "rejected",
    error: "resend_http_500:boom",
    permanent: false,
  }, NOW).state;
  const diverged = claim(retried, "c2", NOW + HOUR, {
    payload: frozenPayload("cs_live_div", { html: "<p>re-rendered differently</p>" }),
  });
  assert.equal(diverged.outcome, "payload_diverged");
  assert.equal(diverged.state.status, "failed");
  assert.equal(diverged.state.lastError, "payload_diverged");
  assert.equal(diverged.state.payload, null);
  // The SAME payload re-claims cleanly.
  assert.equal(claim(retried, "c2", NOW + HOUR).outcome, "claimed");
});

test("ledger: suppression is a transition — recorded, terminal, never token-gated", () => {
  // From empty: creates the tombstone row.
  const fromEmpty = applyReviewLedgerOp(createEmptyReviewLedgerState("cs_live_sup"), {
    type: "mark_suppressed",
    kind: "digital",
    anchorAt: NOW - 4 * DAY,
    dueAt: NOW - DAY,
    now: NOW,
  });
  assert.equal(fromEmpty.outcome, "suppressed");
  assert.equal(fromEmpty.state.status, "suppressed");
  assert.equal(fromEmpty.state.email, null);
  // From claimed, without presenting the claim token: suppression still wins.
  const claimed = claim(createEmptyReviewLedgerState("cs_live_sup2"), "c1", NOW).state;
  const fromClaimed = applyReviewLedgerOp(claimed, { type: "mark_suppressed", now: NOW });
  assert.equal(fromClaimed.outcome, "suppressed");
  assert.equal(fromClaimed.state.claimId, null);
  // From dispatching: refused — the provider call is already committed.
  const dispatching = dispatch(claimed, "c1", NOW).state;
  assert.equal(applyReviewLedgerOp(dispatching, { type: "mark_suppressed", now: NOW }).outcome, "in_flight");
});

test("ledger: erasure reduces any row to a bare tombstone and blocks late resolutions", () => {
  const claimed = claim(createEmptyReviewLedgerState("cs_live_er"), "c1", NOW).state;
  const dispatching = dispatch(claimed, "c1", NOW).state;
  const erased = applyReviewLedgerOp(dispatching, { type: "erase", now: NOW + 1000 });
  assert.equal(erased.outcome, "erased");
  assert.equal(erased.state.status, "erased");
  assert.equal(erased.state.email, null);
  assert.equal(erased.state.payload, null);
  assert.equal(erased.state.kind, null);
  assert.equal(erased.state.anchorAt, null);
  assert.equal(erased.state.erasedAt, NOW + 1000);
  // The in-flight dispatch's resolution can no longer land.
  assert.equal(
    resolveDispatch(erased.state, "c1", { type: "accepted", providerId: "late" }, NOW + 2000).outcome,
    "already_resolved",
  );
  assert.equal(applyReviewLedgerOp(erased.state, { type: "erase", now: NOW + 3000 }).outcome, "already_resolved");
  assert.equal(
    applyReviewLedgerOp(createEmptyReviewLedgerState("cs_live_none2"), { type: "erase", now: NOW }).outcome,
    "no_row",
  );
});

test("ledger: legacy rows are quarantined on migration — never reset to empty", () => {
  const legacySending = {
    ...createEmptyReviewLedgerState("cs_live_leg1"),
    status: "sending",
    kind: "digital",
    email: "buyer@example.com",
    anchorAt: NOW - 4 * DAY,
    dueAt: NOW - DAY,
    attempts: 1,
    claimId: "old-claim",
    claimedAt: NOW - HOUR,
    createdAt: NOW - 4 * DAY,
    updatedAt: NOW - HOUR,
  };
  const migrated = migrateLegacyReviewLedgerState(legacySending, NOW);
  assert.equal(migrated.changed, true);
  assert.equal(migrated.state.status, "uncertain");
  assert.equal(migrated.state.email, null);
  assert.equal(migrated.state.claimId, null);
  assert.equal(migrated.state.redactedAt, NOW);
  assert.equal(migrated.state.lastError, "legacy_quarantined");
  assert.equal(migrated.state.attempts, 1);

  const legacyRetry = { ...legacySending, sessionId: "cs_live_leg2", status: "retry", claimId: null };
  assert.equal(migrateLegacyReviewLedgerState(legacyRetry, NOW).state.status, "uncertain");

  const legacySent = {
    ...legacySending,
    sessionId: "cs_live_leg3",
    status: "sent",
    claimId: null,
    providerId: "msg_old",
    sentAt: NOW - DAY,
  };
  const stripped = migrateLegacyReviewLedgerState(legacySent, NOW);
  assert.equal(stripped.changed, true);
  assert.equal(stripped.state.status, "sent");
  assert.equal(stripped.state.email, null);
  assert.equal(stripped.state.providerId, null);
  assert.equal(stripped.state.sentAt, NOW - DAY);

  // A new-machine row passes through untouched.
  const fresh = claim(createEmptyReviewLedgerState("cs_live_leg4"), "c1", NOW).state;
  const untouched = migrateLegacyReviewLedgerState(fresh, NOW);
  assert.equal(untouched.changed, false);
  assert.equal(untouched.state.status, "claimed");
});

test("ledger: legacy migration sanitizes stored diagnostics — an address in lastError cannot survive", () => {
  // G-dot's acceptance fixture: a legacy terminal row whose lastError
  // embeds the recipient address (the old machine stored raw errors).
  const legacyFailed = {
    ...createEmptyReviewLedgerState("cs_live_leg5"),
    status: "failed",
    kind: "digital",
    email: "buyer@example.com",
    providerId: "msg_old",
    claimId: "old-claim",
    lastError: "resend_http_422:bad address buyer@example.com rejected",
    createdAt: NOW - 4 * DAY,
    updatedAt: NOW - DAY,
  };
  const migrated = migrateLegacyReviewLedgerState(legacyFailed, NOW);
  assert.equal(migrated.changed, true);
  assert.equal(migrated.state.status, "failed");
  assert.equal(migrated.state.email, null);
  assert.ok(!migrated.state.lastError.includes("buyer@example.com"));
  assert.ok(migrated.state.lastError.includes("[redacted]"));

  // A dirty lastError ALONE triggers the rewrite — even when every PII
  // field is already empty, the address baked into the error must go.
  const onlyErrorDirty = {
    ...legacyFailed,
    sessionId: "cs_live_leg6",
    email: null,
    providerId: null,
    claimId: null,
  };
  const rewritten = migrateLegacyReviewLedgerState(onlyErrorDirty, NOW);
  assert.equal(rewritten.changed, true);
  assert.ok(!rewritten.state.lastError.includes("buyer@example.com"));

  // A clean legacy terminal row is left exactly as it is.
  const clean = { ...onlyErrorDirty, sessionId: "cs_live_leg7", lastError: "resend_http_422:invalid" };
  const untouched = migrateLegacyReviewLedgerState(clean, NOW);
  assert.equal(untouched.changed, false);
  assert.equal(untouched.state.lastError, "resend_http_422:invalid");
});

test("ledger: stored errors are sanitized — no recipient addresses persist", () => {
  const cleaned = sanitizeReviewError("resend_http_422:bad address buyer@example.com rejected");
  assert.ok(!cleaned.includes("buyer@example.com"));
  assert.ok(cleaned.includes("[redacted]"));
  assert.ok(sanitizeReviewError("x".repeat(500)).length <= 200);
});

// ---------------------------------------------------------------------------
// Dispatch coordinator (executeReviewDispatch over the real machine)
// ---------------------------------------------------------------------------

function createFakeLedger() {
  const rows = new Map();
  return {
    rows,
    async getState(id) {
      return rows.get(id) ?? createEmptyReviewLedgerState(id);
    },
    async apply(id, op) {
      const current = rows.get(id) ?? createEmptyReviewLedgerState(id);
      const result = applyReviewLedgerOp(current, op);
      if (result.changed) rows.set(id, result.state);
      return result;
    },
  };
}

function createFakeSender(behavior = { ok: true, id: "msg_1" }) {
  const calls = [];
  return {
    calls,
    async send(input) {
      calls.push(input);
      return typeof behavior === "function" ? behavior(input, calls.length) : behavior;
    },
  };
}

async function claimedRow(ledger, sessionId, now = NOW) {
  await ledger.apply(sessionId, {
    type: "begin_claim",
    claimId: "claim-1",
    kind: "digital",
    email: "buyer@example.com",
    anchorAt: now - 4 * DAY,
    dueAt: now - DAY,
    eligibilityEndsAt: now - 4 * DAY + REVIEW_DIGITAL_MAX_AGE_MS,
    payload: frozenPayload(sessionId),
    now,
  });
}

/** Explicit eligible verdict for coordinator tests that are not about
 * the eligibility fence itself (the dep is required by construction). */
const eligibleAlways = async () => ({ status: "eligible" });

test("coordinator: suppression is the final gate — checked inside dispatch, send never fires", async () => {
  const ledger = createFakeLedger();
  await claimedRow(ledger, "cs_live_csup");
  const sender = createFakeSender();
  const outcome = await executeReviewDispatch(
    { sessionId: "cs_live_csup", claimId: "claim-1" },
    { ledger, isSuppressed: async () => true, checkEligibility: eligibleAlways, send: sender.send, now: () => NOW },
  );
  assert.equal(outcome.outcome, "suppressed");
  assert.equal(sender.calls.length, 0);
  assert.equal(ledger.rows.get("cs_live_csup").status, "suppressed");
});

test("coordinator: suppression landing DURING begin_dispatch fences the send (final re-check)", async () => {
  const base = createFakeLedger();
  await claimedRow(base, "cs_live_cfence2");
  let suppressed = false;
  const ledger = {
    rows: base.rows,
    getState: base.getState,
    async apply(id, op) {
      const result = await base.apply(id, op);
      // The opt-out lands (and is acknowledged in the suppression store)
      // while the coordinator's begin_dispatch RPC is in flight.
      if (op.type === "begin_dispatch" && result.outcome === "dispatching") suppressed = true;
      return result;
    },
  };
  const sender = createFakeSender();
  const outcome = await executeReviewDispatch(
    { sessionId: "cs_live_cfence2", claimId: "claim-1" },
    { ledger, isSuppressed: async () => suppressed, checkEligibility: eligibleAlways, send: sender.send, now: () => NOW },
  );
  assert.equal(outcome.outcome, "suppressed");
  assert.equal(sender.calls.length, 0); // the provider was NEVER called
  const row = base.rows.get("cs_live_cfence2");
  assert.equal(row.status, "suppressed"); // truthful terminal — not uncertain
  assert.equal(row.email, null); // terminal PII strip applied
  assert.equal(row.payload, null);
});

test("coordinator: unavailable FINAL suppression re-check sends nothing, settles uncertain", async () => {
  const ledger = createFakeLedger();
  await claimedRow(ledger, "cs_live_crecheck");
  let checks = 0;
  const sender = createFakeSender();
  const outcome = await executeReviewDispatch(
    { sessionId: "cs_live_crecheck", claimId: "claim-1" },
    {
      ledger,
      isSuppressed: async () => (checks++ === 0 ? false : null),
      checkEligibility: eligibleAlways, send: sender.send,
      now: () => NOW,
    },
  );
  assert.equal(outcome.outcome, "uncertain");
  assert.equal(sender.calls.length, 0);
  assert.equal(ledger.rows.get("cs_live_crecheck").status, "uncertain");
});

test("coordinator: unavailable suppression check dispatches nothing and consumes nothing", async () => {
  const ledger = createFakeLedger();
  await claimedRow(ledger, "cs_live_cun");
  const sender = createFakeSender();
  const outcome = await executeReviewDispatch(
    { sessionId: "cs_live_cun", claimId: "claim-1" },
    { ledger, isSuppressed: async () => null, checkEligibility: eligibleAlways, send: sender.send, now: () => NOW },
  );
  assert.equal(outcome.outcome, "unavailable");
  assert.equal(sender.calls.length, 0);
  const row = ledger.rows.get("cs_live_cun");
  assert.equal(row.status, "claimed"); // still claimed — the tick releases it
  assert.equal(row.attempts, 0);
});

test("coordinator: happy path sends the frozen payload exactly once and records sent", async () => {
  const ledger = createFakeLedger();
  await claimedRow(ledger, "cs_live_chappy");
  const sender = createFakeSender({ ok: true, id: "msg_42" });
  const outcome = await executeReviewDispatch(
    { sessionId: "cs_live_chappy", claimId: "claim-1" },
    { ledger, isSuppressed: async () => false, checkEligibility: eligibleAlways, send: sender.send, now: () => NOW },
  );
  assert.equal(outcome.outcome, "sent");
  assert.equal(outcome.providerId, "msg_42");
  assert.equal(sender.calls.length, 1);
  assert.deepEqual(sender.calls[0], frozenPayload("cs_live_chappy"));
  const row = ledger.rows.get("cs_live_chappy");
  assert.equal(row.status, "sent");
  assert.equal(row.email, null);
});

test("coordinator: deadline refusal happens BEFORE the provider is called", async () => {
  const ledger = createFakeLedger();
  // Eligibility ended an hour ago relative to the dispatch clock.
  await claimedRow(ledger, "cs_live_cdl", NOW - 2 * HOUR);
  const sender = createFakeSender();
  const outcome = await executeReviewDispatch(
    { sessionId: "cs_live_cdl", claimId: "claim-1" },
    { ledger, isSuppressed: async () => false, checkEligibility: eligibleAlways, send: sender.send, now: () => NOW + 14 * DAY },
  );
  // firstDispatch would be NOW+14d; deadline = min(eligibility, +23h) — past.
  assert.equal(outcome.outcome, "expired");
  assert.equal(sender.calls.length, 0);
  assert.equal(ledger.rows.get("cs_live_cdl").status, "expired");
});

test("coordinator: deadline is fenced at the POINT OF INVOCATION — a slow commit RPC cannot carry the send past it", async () => {
  // G-dot's construction: the deadline is t=10000. begin_dispatch commits
  // at t=9999 (its pre-RPC clock sample passes), but the RPC returns at
  // t=10001 — without an invocation-point re-check the provider would be
  // called 1ms past the absolute deadline.
  const ledger = createFakeLedger();
  await ledger.apply("cs_live_cinv", {
    type: "begin_claim",
    claimId: "claim-1",
    kind: "digital",
    email: "buyer@example.com",
    anchorAt: 1000,
    dueAt: 2000,
    eligibilityEndsAt: 10_000,
    payload: frozenPayload("cs_live_cinv"),
    now: 9000,
  });
  let samples = 0;
  const driftingNow = () => (samples++ === 0 ? 9999 : 10_001);
  const sender = createFakeSender();
  const outcome = await executeReviewDispatch(
    { sessionId: "cs_live_cinv", claimId: "claim-1" },
    { ledger, isSuppressed: async () => false, checkEligibility: eligibleAlways, send: sender.send, now: driftingNow },
  );
  assert.equal(outcome.outcome, "expired");
  assert.equal(sender.calls.length, 0); // the provider was NEVER called
  const row = ledger.rows.get("cs_live_cinv");
  assert.equal(row.status, "expired"); // truthful terminal — not uncertain
  assert.equal(row.lastError, "retry_deadline_passed");
  assert.equal(row.email, null);
  assert.equal(row.payload, null);
  assert.equal(row.attempts, 1); // the commit counted; the send did not happen

  // Same setup, but the invocation-point sample lands 1ms INSIDE the
  // deadline: the send proceeds normally.
  const ledger2 = createFakeLedger();
  await ledger2.apply("cs_live_cinv2", {
    type: "begin_claim",
    claimId: "claim-1",
    kind: "digital",
    email: "buyer@example.com",
    anchorAt: 1000,
    dueAt: 2000,
    eligibilityEndsAt: 10_000,
    payload: frozenPayload("cs_live_cinv2"),
    now: 9000,
  });
  const sender2 = createFakeSender({ ok: true, id: "msg_in_time" });
  const outcome2 = await executeReviewDispatch(
    { sessionId: "cs_live_cinv2", claimId: "claim-1" },
    { ledger: ledger2, isSuppressed: async () => false, checkEligibility: eligibleAlways, send: sender2.send, now: () => 9999 },
  );
  assert.equal(outcome2.outcome, "sent");
  assert.equal(sender2.calls.length, 1);
});

test("coordinator: ambiguous outcomes are terminal uncertain — timeout, throw, no-id", async () => {
  for (const [id, behavior, extra] of [
    ["cs_live_amb1", { ok: false, error: "resend_fetch_failed:socket hangup" }, {}],
    ["cs_live_amb2", { ok: true, id: null }, {}],
    ["cs_live_amb3", () => new Promise(() => {}), { sendTimeoutMs: 25 }],
    [
      "cs_live_amb4",
      () => {
        throw new Error("kaboom");
      },
      {},
    ],
  ]) {
    const ledger = createFakeLedger();
    await claimedRow(ledger, id);
    const sender = createFakeSender(behavior);
    const outcome = await executeReviewDispatch(
      { sessionId: id, claimId: "claim-1" },
      { ledger, isSuppressed: async () => false, checkEligibility: eligibleAlways, send: sender.send, now: () => NOW, ...extra },
    );
    assert.equal(outcome.outcome, "uncertain", id);
    assert.equal(ledger.rows.get(id).status, "uncertain", id);
    assert.equal(sender.calls.length, 1, id);
  }
});

test("coordinator: transient rejection schedules a retry; permanent fails terminally", async () => {
  const ledger = createFakeLedger();
  await claimedRow(ledger, "cs_live_ctr");
  const transient = createFakeSender({ ok: false, error: "resend_http_500:boom" });
  const outcome = await executeReviewDispatch(
    { sessionId: "cs_live_ctr", claimId: "claim-1" },
    { ledger, isSuppressed: async () => false, checkEligibility: eligibleAlways, send: transient.send, now: () => NOW },
  );
  assert.equal(outcome.outcome, "retry_scheduled");
  const row = ledger.rows.get("cs_live_ctr");
  assert.equal(row.status, "retry");
  assert.deepEqual(row.payload, frozenPayload("cs_live_ctr"));

  const ledger2 = createFakeLedger();
  await claimedRow(ledger2, "cs_live_cperm");
  const permanent = createFakeSender({ ok: false, error: "resend_http_422:invalid recipient" });
  const outcome2 = await executeReviewDispatch(
    { sessionId: "cs_live_cperm", claimId: "claim-1" },
    { ledger: ledger2, isSuppressed: async () => false, checkEligibility: eligibleAlways, send: permanent.send, now: () => NOW },
  );
  assert.equal(outcome2.outcome, "failed");
  assert.equal(ledger2.rows.get("cs_live_cperm").status, "failed");
});

test("coordinator: a wrong claim token cannot dispatch (the token fences the send)", async () => {
  const ledger = createFakeLedger();
  await claimedRow(ledger, "cs_live_cfence");
  const sender = createFakeSender();
  const outcome = await executeReviewDispatch(
    { sessionId: "cs_live_cfence", claimId: "claim-STALE" },
    { ledger, isSuppressed: async () => false, checkEligibility: eligibleAlways, send: sender.send, now: () => NOW },
  );
  assert.equal(outcome.outcome, "not_dispatchable");
  assert.equal(sender.calls.length, 0);
  assert.equal(ledger.rows.get("cs_live_cfence").status, "claimed");
});

// ---------------------------------------------------------------------------
// Post-commit eligibility re-check (S54-5 design (b), revised by S54-5B)
// ---------------------------------------------------------------------------

test("coordinator: revocation landing AFTER the dispatch commit fences the send (eligibility re-check)", async () => {
  const base = createFakeLedger();
  await claimedRow(base, "cs_live_celig1");
  // The entitlement is clean when the tick read it; the revocation
  // persists while the coordinator's begin_dispatch RPC is in flight —
  // the exact S52-2 M2-01 sequence.
  let entitlement = digitalEntitlement();
  const ledger = {
    rows: base.rows,
    getState: base.getState,
    async apply(id, op) {
      const result = await base.apply(id, op);
      if (op.type === "begin_dispatch" && result.outcome === "dispatching") {
        entitlement = digitalEntitlement({ revoked: true });
      }
      return result;
    },
  };
  const checker = createReviewDispatchEligibilityChecker({
    getEntitlement: async () => entitlement,
    getPrintRecord: async () => null,
    physicalEnabled: false,
  });
  const sender = createFakeSender();
  const outcome = await executeReviewDispatch(
    { sessionId: "cs_live_celig1", claimId: "claim-1" },
    { ledger, isSuppressed: async () => false, checkEligibility: checker, send: sender.send, now: () => NOW },
  );
  assert.equal(outcome.outcome, "ineligible");
  assert.equal(sender.calls.length, 0); // the provider was NEVER called
  const row = base.rows.get("cs_live_celig1");
  assert.equal(row.status, "ineligible"); // truthful terminal — not uncertain
  assert.equal(row.lastError, "ineligible:revoked");
  assert.equal(row.email, null); // terminal PII strip applied
  assert.equal(row.payload, null);
});

test("coordinator: unavailable eligibility authority sends nothing and settles terminally — never resent", async () => {
  for (const [id, checker] of [
    ["cs_live_celig2", async () => ({ status: "unavailable", error: "entitlement_read_failed" })],
    [
      "cs_live_celig3",
      async () => {
        throw new Error("kv down");
      },
    ],
  ]) {
    const ledger = createFakeLedger();
    await claimedRow(ledger, id);
    const sender = createFakeSender();
    const outcome = await executeReviewDispatch(
      { sessionId: id, claimId: "claim-1" },
      { ledger, isSuppressed: async () => false, checkEligibility: checker, send: sender.send, now: () => NOW },
    );
    assert.equal(outcome.outcome, "eligibility_unavailable", id);
    assert.equal(sender.calls.length, 0, id);
    const row = ledger.rows.get(id);
    assert.equal(row.status, "failed", id);
    assert.ok(row.lastError.startsWith("eligibility_unavailable:"), id);
    assert.equal(row.email, null, id);
    assert.equal(row.payload, null, id);
    // A later dispatch attempt cannot resurrect the settled row.
    const again = await executeReviewDispatch(
      { sessionId: id, claimId: "claim-1" },
      { ledger, isSuppressed: async () => false, checkEligibility: checker, send: sender.send, now: () => NOW },
    );
    assert.equal(again.outcome, "not_dispatchable", id);
    assert.equal(sender.calls.length, 0, id);
  }
});

test("coordinator: an eligible re-check preserves the happy path — exactly one send", async () => {
  const ledger = createFakeLedger();
  await claimedRow(ledger, "cs_live_celig4");
  const checker = createReviewDispatchEligibilityChecker({
    getEntitlement: async () => digitalEntitlement(),
    getPrintRecord: async () => null,
    physicalEnabled: false,
  });
  const sender = createFakeSender({ ok: true, id: "msg_elig" });
  const outcome = await executeReviewDispatch(
    { sessionId: "cs_live_celig4", claimId: "claim-1" },
    { ledger, isSuppressed: async () => false, checkEligibility: checker, send: sender.send, now: () => NOW },
  );
  assert.equal(outcome.outcome, "sent");
  assert.equal(sender.calls.length, 1);
  assert.equal(ledger.rows.get("cs_live_celig4").status, "sent");
});

test("eligibility checker: fresh evidence must bind to the frozen recipient and kind", async () => {
  const state = {
    sessionId: "cs_live_bind",
    kind: "digital",
    email: "buyer@example.com",
    payload: frozenPayload("cs_live_bind"),
  };
  const readers = (entitlement) => ({
    getEntitlement: async () => entitlement,
    getPrintRecord: async () => null,
    physicalEnabled: false,
  });
  const at = { sessionId: "cs_live_bind", state, now: () => NOW };
  // Baseline: clean evidence for the frozen recipient is eligible.
  assert.deepEqual(
    await createReviewDispatchEligibilityChecker(readers(digitalEntitlement()))(at),
    { status: "eligible" },
  );
  // The address on the fresh record is someone else's — never send.
  assert.deepEqual(
    await createReviewDispatchEligibilityChecker(
      readers(digitalEntitlement({ customerEmail: "other@example.com" })),
    )(at),
    { status: "ineligible", reason: "recipient_mismatch" },
  );
  // The session became a print order: kind no longer matches the frozen ask.
  assert.deepEqual(
    await createReviewDispatchEligibilityChecker(readers(digitalEntitlement({ orderType: "print" })))(at),
    { status: "ineligible", reason: "kind_mismatch" },
  );
  // Missing record is definitive negative evidence, not a pass.
  assert.deepEqual(await createReviewDispatchEligibilityChecker(readers(null))(at), {
    status: "ineligible",
    reason: "missing_record",
  });
  // Unknown gift status fails closed, exactly like the tick's classifier.
  assert.deepEqual(
    await createReviewDispatchEligibilityChecker(readers(digitalEntitlement({ isGift: undefined })))(at),
    { status: "ineligible", reason: "gift_uncertain" },
  );
  // The eligibility window closed between claim and dispatch.
  assert.deepEqual(
    await createReviewDispatchEligibilityChecker(
      readers(digitalEntitlement({ created: Math.floor((NOW - 20 * DAY) / 1000) })),
    )(at),
    { status: "ineligible", reason: "window_closed" },
  );
  // A read failure is an unavailable authority — distinct from ineligible.
  const down = createReviewDispatchEligibilityChecker({
    getEntitlement: async () => {
      throw new Error("kv down");
    },
    getPrintRecord: async () => null,
    physicalEnabled: false,
  });
  assert.deepEqual(await down(at), { status: "unavailable", error: "entitlement_read_failed" });
});

test("eligibility checker: physical asks cross-check the entitlement at dispatch time", async () => {
  const state = {
    sessionId: "cs_live_pbind",
    kind: "physical",
    email: "buyer@example.com",
    payload: frozenPayload("cs_live_pbind", { tags: { type: "review_request", kind: "physical" } }),
  };
  const at = { sessionId: "cs_live_pbind", state, now: () => NOW };
  const make = (entitlement, print, physicalEnabled = true) =>
    createReviewDispatchEligibilityChecker({
      getEntitlement: async () => entitlement,
      getPrintRecord: async () => print,
      physicalEnabled,
    });
  assert.deepEqual(await make(digitalEntitlement({ orderType: "print" }), printRecord())(at), {
    status: "eligible",
  });
  // Refunded after the tick's cross-check: the dispatch-time read fences it.
  assert.deepEqual(
    await make(digitalEntitlement({ orderType: "print", revoked: true }), printRecord())(at),
    { status: "ineligible", reason: "revoked" },
  );
  // The print itself failed terminally after claiming.
  assert.deepEqual(
    await make(digitalEntitlement({ orderType: "print" }), printRecord({ status: "failed" }))(at),
    { status: "ineligible", reason: "terminal_failed" },
  );
  // The physical branch was switched off between claim and dispatch.
  assert.deepEqual(await make(digitalEntitlement({ orderType: "print" }), printRecord(), false)(at), {
    status: "ineligible",
    reason: "branch_disabled",
  });
});

test("ledger: resolve_dispatch ineligible / eligibility_unavailable settle terminally with the strip", () => {
  const claim = {
    type: "begin_claim",
    claimId: "claim-1",
    kind: "digital",
    email: "buyer@example.com",
    anchorAt: NOW - 4 * DAY,
    dueAt: NOW - DAY,
    eligibilityEndsAt: NOW + DAY,
    payload: frozenPayload("cs_live_lnew"),
    now: NOW,
  };
  let state = applyReviewLedgerOp(createEmptyReviewLedgerState("cs_live_lnew"), claim).state;
  state = applyReviewLedgerOp(state, { type: "begin_dispatch", claimId: "claim-1", now: NOW }).state;
  const settled = applyReviewLedgerOp(state, {
    type: "resolve_dispatch",
    claimId: "claim-1",
    result: { type: "ineligible", reason: "revoked" },
    now: NOW,
  });
  assert.equal(settled.outcome, "ineligible");
  assert.equal(settled.state.status, "ineligible");
  assert.equal(settled.state.email, null);
  assert.equal(settled.state.payload, null);
  assert.equal(settled.state.lastError, "ineligible:revoked");
  // Terminal: a fresh claim is refused (one ask only).
  assert.equal(applyReviewLedgerOp(settled.state, claim).outcome, "already_resolved");

  let state2 = applyReviewLedgerOp(createEmptyReviewLedgerState("cs_live_lnew2"), {
    ...claim,
    payload: frozenPayload("cs_live_lnew2"),
  }).state;
  state2 = applyReviewLedgerOp(state2, { type: "begin_dispatch", claimId: "claim-1", now: NOW }).state;
  const settled2 = applyReviewLedgerOp(state2, {
    type: "resolve_dispatch",
    claimId: "claim-1",
    result: { type: "eligibility_unavailable", error: "entitlement_read_failed" },
    now: NOW,
  });
  assert.equal(settled2.outcome, "eligibility_unavailable");
  assert.equal(settled2.state.status, "failed");
  assert.equal(settled2.state.lastError, "eligibility_unavailable:entitlement_read_failed");
  assert.equal(settled2.state.payload, null);
});

// ---------------------------------------------------------------------------
// Storage modes — fail closed, memory only via explicit test construction
// ---------------------------------------------------------------------------

test("storage: live ledger mode NEVER falls back to memory — not even with CI/local vars", async () => {
  const saved = { ...process.env };
  try {
    process.env.CI = "1";
    process.env.STARMAP_REVIEW_REQUEST_LEDGER_LOCAL = "1";
    process.env.NODE_ENV = "development";
    delete process.env.STARMAP_REVIEW_LEDGER_MODE;
    const client = createReviewLedgerClient({}); // no DO namespace bound
    assert.equal(await client.getState("cs_live_mode"), null);
    assert.equal(
      await client.apply("cs_live_mode", { type: "erase", now: NOW }),
      null,
    );
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) delete process.env[key];
    }
    Object.assign(process.env, saved);
  }
});

test("storage: explicit test mode uses memory; dry_run refuses writes", async () => {
  __resetReviewLedgerMemoryForTests();
  const testClient = createReviewLedgerClient({}, { mode: "test" });
  const applied = await testClient.apply("cs_live_tm", {
    type: "mark_suppressed",
    kind: "digital",
    now: NOW,
  });
  assert.equal(applied.outcome, "suppressed");
  assert.equal((await testClient.getState("cs_live_tm")).status, "suppressed");

  const dryClient = createReviewLedgerClient({}, { mode: "dry_run" });
  assert.equal(await dryClient.apply("cs_live_tm", { type: "erase", now: NOW }), null);
  assert.equal(await dryClient.getState("cs_live_tm"), null); // no namespace bound
  __resetReviewLedgerMemoryForTests();
});

test("storage: suppression identity is HMAC-keyed — the raw email is never a key", () => {
  const name = deriveReviewSuppressionName("buyer@example.com", SECRET);
  assert.ok(!name.includes("buyer"));
  assert.ok(!name.includes("@"));
  assert.equal(name, deriveReviewSuppressionName("buyer@example.com", SECRET));
  assert.notEqual(name, deriveReviewSuppressionName("buyer@example.com", "other-secret-0123456789"));
  assert.notEqual(name, deriveReviewSuppressionName("other@example.com", SECRET));
});

test("storage: suppression client test mode without deps is inert; in-memory client round-trips", async () => {
  const inert = createReviewSuppressionClient({}, { mode: "test" });
  assert.equal(await inert.check("k"), false);
  assert.equal(await inert.record("k", "test", NOW), false);
  assert.equal(await inert.dispatch({ sessionId: "s", claimId: "c", name: "k" }), null);

  const ledger = createFakeLedger();
  const sender = createFakeSender();
  const memory = createInMemoryReviewSuppressionClient({ ledger, send: sender.send, now: () => NOW });
  const name = deriveReviewSuppressionName("buyer@example.com", SECRET);
  assert.equal(await memory.check(name), false);
  assert.equal(await memory.record(name, "opt_out_page", NOW), true);
  assert.equal(await memory.check(name), true);
  assert.equal(await memory.clear(name, NOW), true);
  assert.equal(await memory.check(name), false);
  await memory.record(name, "opt_out_page", NOW);
  assert.equal(await memory.erase(name), true);
  assert.equal(await memory.check(name), false);
});

// ---------------------------------------------------------------------------
// Due evaluation
// ---------------------------------------------------------------------------

function digitalEntitlement(overrides = {}) {
  return {
    paid: true,
    created: Math.floor((NOW - 4 * DAY) / 1000), // Stripe seconds
    customerEmail: "buyer@example.com",
    orderType: "digital",
    isGift: false,
    ...overrides,
  };
}

function printRecord(overrides = {}) {
  return {
    status: "sent",
    sessionId: "cs_live_p",
    printVariant: "poster_framed",
    includesDigitalAddOn: false,
    attempts: 1,
    customerEmail: "buyer@example.com",
    shippedAt: NOW - 8 * DAY,
    createdAt: NOW - 10 * DAY,
    isGift: false,
    ...overrides,
  };
}

test("eval digital: due exactly at paid+3d; not 1ms before; dead exactly at paid+14d", () => {
  const atDue = digitalEntitlement({ created: Math.floor((NOW - REVIEW_DIGITAL_DELAY_MS) / 1000) });
  // seconds resolution: anchor lands within the same second as the boundary
  assert.equal(classifyDigitalEntitlement(atDue, NOW + 999).outcome, "due");
  const justShort = digitalEntitlement({
    created: Math.floor((NOW - REVIEW_DIGITAL_DELAY_MS + 1000) / 1000),
  });
  assert.equal(classifyDigitalEntitlement(justShort, NOW).reason, "not_yet_due");
  const atMaxAge = digitalEntitlement({
    created: Math.floor((NOW - REVIEW_DIGITAL_MAX_AGE_MS) / 1000),
  });
  assert.equal(classifyDigitalEntitlement(atMaxAge, NOW).reason, "past_max_age");
  const insideMaxAge = digitalEntitlement({
    created: Math.floor((NOW - REVIEW_DIGITAL_MAX_AGE_MS + 1000) / 1000),
  });
  assert.equal(classifyDigitalEntitlement(insideMaxAge, NOW).outcome, "due");
});

test("eval digital: exclusions — unpaid, revoked, gift, unknown gift, no email, bad anchors", () => {
  assert.equal(classifyDigitalEntitlement(null, NOW).reason, "missing_record");
  assert.equal(classifyDigitalEntitlement(digitalEntitlement({ paid: false }), NOW).reason, "not_paid");
  assert.equal(classifyDigitalEntitlement(digitalEntitlement({ revoked: true }), NOW).reason, "revoked");
  assert.equal(classifyDigitalEntitlement(digitalEntitlement({ isGift: true }), NOW).reason, "gift_order");
  // FAIL CLOSED: an absent gift flag excludes — the engine cannot prove the
  // order is not a gift (T-T1; the pre-writer back-catalogue stays unmailed).
  const absent = digitalEntitlement();
  delete absent.isGift;
  assert.equal(classifyDigitalEntitlement(absent, NOW).reason, "gift_uncertain");
  assert.equal(
    classifyDigitalEntitlement(digitalEntitlement({ customerEmail: "  " }), NOW).reason,
    "missing_email",
  );
  for (const bad of [0, -5, Number.NaN, undefined, "yesterday", (NOW + DAY) / 1000, 100]) {
    assert.equal(
      classifyDigitalEntitlement(digitalEntitlement({ created: bad }), NOW).reason,
      "invalid_anchor",
      `anchor ${String(bad)} must be invalid`,
    );
  }
});

test("eval digital: print sessions route to the physical branch only (D9 correction)", () => {
  const printSession = digitalEntitlement({ orderType: "print", includesDigitalAddOn: true });
  const result = classifyDigitalEntitlement(printSession, NOW);
  assert.equal(result.outcome, "excluded");
  assert.equal(result.reason, "print_order_physical_branch");
  // Legacy records without orderType stay digital (gift flag present).
  const legacy = digitalEntitlement();
  delete legacy.orderType;
  assert.equal(classifyDigitalEntitlement(legacy, NOW).outcome, "due");
});

test("eval physical: due at shippedAt+7d, dead at +21d, legacy anchor fallback", () => {
  assert.equal(
    classifyPrintRecord(printRecord({ shippedAt: NOW - REVIEW_PHYSICAL_DELAY_MS }), NOW, true).outcome,
    "due",
  );
  assert.equal(
    classifyPrintRecord(printRecord({ shippedAt: NOW - REVIEW_PHYSICAL_DELAY_MS + 1 }), NOW, true).reason,
    "not_yet_due",
  );
  assert.equal(
    classifyPrintRecord(printRecord({ shippedAt: NOW - REVIEW_PHYSICAL_MAX_AGE_MS }), NOW, true).reason,
    "past_max_age",
  );
  assert.equal(
    classifyPrintRecord(printRecord({ shippedAt: NOW - REVIEW_PHYSICAL_MAX_AGE_MS + 1 }), NOW, true)
      .outcome,
    "due",
  );
  const legacy = printRecord({ shippedAt: undefined, shippingNotificationSentAt: NOW - 8 * DAY });
  assert.equal(classifyPrintRecord(legacy, NOW, true).outcome, "due");
});

test("eval physical: exclusions — disabled branch, failed status, gift, unknown gift, not shipped", () => {
  assert.equal(classifyPrintRecord(printRecord(), NOW, false).reason, "physical_disabled");
  assert.equal(classifyPrintRecord(printRecord({ status: "failed" }), NOW, true).reason, "terminal_failed");
  assert.equal(classifyPrintRecord(printRecord({ isGift: true }), NOW, true).reason, "gift_order");
  const absent = printRecord();
  delete absent.isGift;
  assert.equal(classifyPrintRecord(absent, NOW, true).reason, "gift_uncertain");
  assert.equal(
    classifyPrintRecord(printRecord({ shippedAt: undefined }), NOW, true).reason,
    "not_shipped",
  );
});

test("anchors: seconds and ms normalize; corrupt values rejected", () => {
  assert.equal(normalizeAnchorMs(Math.floor(NOW / 1000), NOW), Math.floor(NOW / 1000) * 1000);
  assert.equal(normalizeAnchorMs(NOW, NOW), NOW);
  assert.equal(normalizeAnchorMs(0, NOW), null);
  assert.equal(normalizeAnchorMs(-1, NOW), null);
  assert.equal(normalizeAnchorMs(Number.POSITIVE_INFINITY, NOW), null);
  assert.equal(normalizeAnchorMs(NOW + 60 * 60 * 1000, NOW), null); // implausibly future
  assert.equal(normalizeAnchorMs(Date.UTC(2020, 0, 1), NOW), null); // pre-2023 sanity floor
});

test("failure classification: permanent vs transient vs ambiguous vs config", () => {
  assert.equal(classifyReviewSendError("resend_http_422:invalid"), "permanent");
  assert.equal(classifyReviewSendError("resend_http_400:bad"), "permanent");
  assert.equal(classifyReviewSendError("resend_http_429:slow down"), "transient");
  assert.equal(classifyReviewSendError("resend_http_503:down"), "transient");
  assert.equal(classifyReviewSendError("resend_fetch_failed:socket hangup"), "ambiguous");
  assert.equal(classifyReviewSendError("resend_not_configured"), "config");
  assert.equal(classifyReviewSendError("resend_recipient_missing"), "permanent");
});

// ---------------------------------------------------------------------------
// Tick integration (fake store / ledger / coordinator)
// ---------------------------------------------------------------------------

function createFakeStore(initial = {}, { pageSize = 1000 } = {}) {
  const data = new Map(Object.entries(structuredClone(initial)));
  const calls = { list: 0, get: 0, put: 0, del: 0 };
  return {
    data,
    calls,
    async listKeys(prefix, cursor) {
      calls.list += 1;
      const names = [...data.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
      const page = names.slice(start, start + pageSize);
      const next = start + page.length;
      return {
        names: page,
        cursor: next < names.length ? String(next) : null,
        complete: next >= names.length,
      };
    },
    async getJson(key) {
      calls.get += 1;
      return data.has(key) ? structuredClone(data.get(key)) : null;
    },
    async putJson(key, value) {
      calls.put += 1;
      data.set(key, structuredClone(value));
    },
    async deleteKey(key) {
      calls.del += 1;
      data.delete(key);
    },
  };
}

function enabledConfig(overrides = {}) {
  return {
    enabled: true,
    physicalEnabled: false,
    mailingAddress: ADDRESS,
    signingSecret: SECRET,
    siteUrl: "https://starmapco.com",
    supportEmail: "support@starmapco.com",
    resendConfigured: true,
    fromAddress: "StarMapCo <orders@starmapco.com>",
    replyTo: "support@starmapco.com",
    ...overrides,
  };
}

function tickDeps(store, ledger, sender, config, now = NOW, suppressionOverride = null) {
  let counter = 0;
  const nowFn = typeof now === "function" ? now : () => now;
  const suppression =
    suppressionOverride ??
    createInMemoryReviewSuppressionClient({ ledger, send: sender.send, now: nowFn });
  return {
    deps: {
      store,
      ledger,
      suppression,
      config,
      now: nowFn,
      createClaimId: () => `claim-${(counter += 1)}`,
      log: () => {},
    },
    suppression,
  };
}

const sessionKey = (id) => `stripe:session:${id}`;

test("tick: flag off is fully inert — no scan, no send, no writes", async () => {
  const store = createFakeStore({ [sessionKey("cs_live_off")]: digitalEntitlement() });
  const ledger = createFakeLedger();
  const sender = createFakeSender();
  const { deps } = tickDeps(store, ledger, sender, enabledConfig({ enabled: false }));
  const summary = await runReviewRequestTick(deps);
  assert.equal(summary.status, "disabled");
  assert.equal(store.calls.list, 0);
  assert.equal(sender.calls.length, 0);
  assert.equal(ledger.rows.size, 0);
});

test("tick: missing mailing address blocks pre-claim but still reports due counts", async () => {
  const store = createFakeStore({ [sessionKey("cs_live_gate")]: digitalEntitlement() });
  const ledger = createFakeLedger();
  const sender = createFakeSender();
  const { deps } = tickDeps(store, ledger, sender, enabledConfig({ mailingAddress: "" }));
  const summary = await runReviewRequestTick(deps);
  assert.equal(summary.status, "blocked");
  assert.equal(summary.blockedReason, "mailing_address_missing");
  assert.equal(summary.due, 1);
  assert.equal(sender.calls.length, 0);
  assert.equal(ledger.rows.size, 0); // nothing claimed while blocked

  const noSecret = await runReviewRequestTick(
    tickDeps(store, ledger, sender, enabledConfig({ signingSecret: null })).deps,
  );
  assert.equal(noSecret.blockedReason, "signing_secret_missing");
  const noResend = await runReviewRequestTick(
    tickDeps(store, ledger, sender, enabledConfig({ resendConfigured: false })).deps,
  );
  assert.equal(noResend.blockedReason, "resend_not_configured");
  assert.equal(sender.calls.length, 0);
  assert.equal(ledger.rows.size, 0);
});

test("tick: happy path — claim, freeze, dispatch once, sent tombstone", async () => {
  const store = createFakeStore({ [sessionKey("cs_live_happy")]: digitalEntitlement() });
  const ledger = createFakeLedger();
  const sender = createFakeSender({ ok: true, id: "msg_42" });
  const { deps } = tickDeps(store, ledger, sender, enabledConfig());
  const summary = await runReviewRequestTick(deps);
  assert.equal(summary.sent, 1);
  assert.equal(sender.calls.length, 1);
  const sent = sender.calls[0];
  assert.equal(sent.to, "buyer@example.com");
  // From / Reply-To are part of the frozen request (config snapshot at
  // claim time), not re-derived by the adapter at send time.
  assert.equal(sent.from, "StarMapCo <orders@starmapco.com>");
  assert.equal(sent.replyTo, "support@starmapco.com");
  assert.equal(sent.subject, REVIEW_REQUEST_SUBJECT);
  assert.equal(sent.idempotencyKey, "review-request:cs_live_happy");
  assert.match(sent.headers["List-Unsubscribe"], /\/api\/reviews\/opt-out\?e=/);
  assert.equal(sent.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.ok(sent.html.includes(GOOGLE_REVIEW_URL));
  const row = ledger.rows.get("cs_live_happy");
  assert.equal(row.status, "sent");
  assert.equal(row.email, null); // tombstone: recipient stripped
  assert.equal(row.payload, null);
  assert.equal(row.providerId, null);

  // Second tick: one-ask-only — nothing more is sent, ever.
  const again = await runReviewRequestTick(tickDeps(store, ledger, sender, enabledConfig()).deps);
  assert.equal(again.sent, 0);
  assert.equal(again.alreadyResolved, 1);
  assert.equal(sender.calls.length, 1);
});

test("tick: max-age rule — the back-catalogue is never mailed", async () => {
  const ancient = digitalEntitlement({ created: Math.floor((NOW - 90 * DAY) / 1000) });
  const store = createFakeStore({ [sessionKey("cs_live_old")]: ancient });
  const ledger = createFakeLedger();
  const sender = createFakeSender();
  const summary = await runReviewRequestTick(tickDeps(store, ledger, sender, enabledConfig()).deps);
  assert.equal(summary.sent, 0);
  assert.equal(summary.skips.past_max_age, 1);
  assert.equal(sender.calls.length, 0);
  assert.equal(ledger.rows.size, 0);
});

test("tick: gift orders excluded (true AND unknown); print+add-on asked once, physically", async () => {
  const unknownGift = digitalEntitlement();
  delete unknownGift.isGift;
  const store = createFakeStore({
    [sessionKey("cs_live_gift")]: digitalEntitlement({ isGift: true }),
    [sessionKey("cs_live_unkgift")]: unknownGift,
    [sessionKey("cs_live_bundle")]: digitalEntitlement({
      orderType: "print",
      includesDigitalAddOn: true,
    }),
    "print:order:cs_live_bundle": printRecord({
      sessionId: "cs_live_bundle",
      includesDigitalAddOn: true,
    }),
  });
  const ledger = createFakeLedger();
  const sender = createFakeSender();
  const summary = await runReviewRequestTick(
    tickDeps(store, ledger, sender, enabledConfig({ physicalEnabled: true })).deps,
  );
  assert.equal(summary.skips.gift_order, 1);
  assert.equal(summary.skips.gift_uncertain, 1);
  assert.equal(summary.sent, 1);
  assert.equal(sender.calls.length, 1);
  assert.equal(sender.calls[0].tags.kind, "physical");
  assert.ok(sender.calls[0].html.includes("Once it arrives"));
});

test("tick: physical cross-check fails closed when the entitlement gift flag is unknown", async () => {
  const entitlement = digitalEntitlement({ orderType: "print" });
  delete entitlement.isGift;
  const store = createFakeStore({
    [sessionKey("cs_live_xgift")]: entitlement,
    "print:order:cs_live_xgift": printRecord({ sessionId: "cs_live_xgift" }),
  });
  const ledger = createFakeLedger();
  const sender = createFakeSender();
  const summary = await runReviewRequestTick(
    tickDeps(store, ledger, sender, enabledConfig({ physicalEnabled: true })).deps,
  );
  assert.equal(summary.sent, 0);
  assert.equal(summary.skips.gift_uncertain, 1);
  assert.equal(sender.calls.length, 0);
});

test("tick: physical branch stays silent while its separate gate is off", async () => {
  const store = createFakeStore({
    "print:order:cs_live_phys": printRecord({ sessionId: "cs_live_phys" }),
  });
  const ledger = createFakeLedger();
  const sender = createFakeSender();
  const summary = await runReviewRequestTick(tickDeps(store, ledger, sender, enabledConfig()).deps);
  assert.equal(summary.sent, 0);
  assert.equal(summary.skips.physical_disabled, 1);
  assert.equal(sender.calls.length, 0);
});

test("tick: suppression is recorded as a ledger transition — KV hint AND coordinator record", async () => {
  const store = createFakeStore({
    [sessionKey("cs_live_sup1")]: digitalEntitlement({ customerEmail: "Opted@Example.com" }),
    [sessionKey("cs_live_sup2")]: digitalEntitlement({ customerEmail: "promo@example.com" }),
    [sessionKey("cs_live_sup3")]: digitalEntitlement({ customerEmail: "coord@example.com" }),
  });
  // KV hint sources: review opt-out (different casing) + promotions unsubscribe.
  await recordReviewOptOut(
    store,
    "opted@example.com",
    deriveReviewSuppressionName("opted@example.com", SECRET),
  );
  store.data.set(`promotions:email:${encodeURIComponent("promo@example.com")}`, {
    subscribedAt: NOW - 30 * DAY,
    unsubscribedAt: NOW - DAY,
    updatedAt: NOW - DAY,
  });
  // The keyed marker is addressable only by its suppression name (the
  // tick always derives and passes it); the promotions flavour needs none.
  assert.equal(
    await isReviewSuppressed(store, "OPTED@example.com", deriveReviewSuppressionName("opted@example.com", SECRET)),
    true,
  );
  assert.equal(await isReviewSuppressed(store, "promo@example.com"), true);
  assert.equal(await isReviewSuppressed(store, "other@example.com"), false);

  const ledger = createFakeLedger();
  const sender = createFakeSender();
  const { deps, suppression } = tickDeps(store, ledger, sender, enabledConfig());
  // Coordinator-side authoritative record for the third recipient (no KV hint).
  await suppression.record(deriveReviewSuppressionName("coord@example.com", SECRET), "opt_out_page", NOW);

  const summary = await runReviewRequestTick(deps);
  assert.equal(summary.suppressed, 3);
  assert.equal(summary.sent, 0);
  assert.equal(sender.calls.length, 0);
  // Every suppression left a ledger tombstone — state, not a silent skip.
  for (const id of ["cs_live_sup1", "cs_live_sup2", "cs_live_sup3"]) {
    assert.equal(ledger.rows.get(id)?.status, "suppressed", id);
  }
});

test("tick: revocation landing between scheduling and dispatch fences the send (S52-2 M2-01)", async () => {
  const base = createFakeStore({
    [sessionKey("cs_live_m201")]: digitalEntitlement({ customerEmail: "buyer@example.com" }),
  });
  const ledger = createFakeLedger();
  const sender = createFakeSender();
  // Failure injection: the revocation persists the moment the claim
  // commits — after every eligibility read the tick itself makes
  // (scan + fresh re-read), before the coordinator's dispatch re-check.
  let revoked = false;
  const store = {
    data: base.data,
    calls: base.calls,
    listKeys: (prefix, cursor) => base.listKeys(prefix, cursor),
    putJson: (key, value) => base.putJson(key, value),
    deleteKey: (key) => base.deleteKey(key),
    async getJson(key) {
      const value = await base.getJson(key);
      if (revoked && key === sessionKey("cs_live_m201") && value) {
        return { ...value, revoked: true };
      }
      return value;
    },
  };
  const baseApply = ledger.apply.bind(ledger);
  ledger.apply = async (id, op) => {
    const result = await baseApply(id, op);
    if (op.type === "begin_claim" && result.outcome === "claimed") revoked = true;
    return result;
  };
  const checker = createReviewDispatchEligibilityChecker({
    getEntitlement: async (id) => store.getJson(sessionKey(id)),
    getPrintRecord: async () => null,
    physicalEnabled: false,
  });
  const suppression = createInMemoryReviewSuppressionClient({
    ledger,
    send: sender.send,
    now: () => NOW,
    checkEligibility: checker,
  });
  const { deps } = tickDeps(store, ledger, sender, enabledConfig(), NOW, suppression);
  const summary = await runReviewRequestTick(deps);
  assert.equal(summary.ineligible, 1);
  assert.equal(summary.sent, 0);
  assert.equal(sender.calls.length, 0); // the provider was NEVER called
  const row = ledger.rows.get("cs_live_m201");
  assert.equal(row.status, "ineligible");
  assert.equal(row.lastError, "ineligible:revoked");
});

test("tick: transient failure retries with the FROZEN payload; permanent failure quarantines", async () => {
  const store = createFakeStore({ [sessionKey("cs_live_retry")]: digitalEntitlement() });
  const ledger = createFakeLedger();
  const sender = createFakeSender((input, n) =>
    n === 1 ? { ok: false, error: "resend_http_500:boom" } : { ok: true, id: "msg_late" },
  );
  const first = await runReviewRequestTick(tickDeps(store, ledger, sender, enabledConfig(), NOW).deps);
  assert.equal(first.sendFailed, 1);
  const row = ledger.rows.get("cs_live_retry");
  assert.equal(row.status, "retry");
  assert.equal(row.nextAttemptAt, NOW + HOUR);
  assert.ok(row.payload); // frozen at first claim

  const tooSoon = await runReviewRequestTick(
    tickDeps(store, ledger, sender, enabledConfig(), NOW + 30 * 60 * 1000).deps,
  );
  assert.equal(tooSoon.sent, 0);
  assert.equal(tooSoon.inFlightOrBackoff, 1);
  assert.equal(sender.calls.length, 1);

  // The retry tick runs under a CHANGED sender config: the frozen
  // payload — From and Reply-To included — must still win over the
  // current config (the adapter never re-derives them per attempt).
  const retried = await runReviewRequestTick(
    tickDeps(
      store,
      ledger,
      sender,
      enabledConfig({ fromAddress: "Changed <changed@starmapco.com>", replyTo: null }),
      NOW + HOUR,
    ).deps,
  );
  assert.equal(retried.sent, 1);
  assert.equal(sender.calls.length, 2);
  // The retry dispatched the frozen payload byte-for-byte — no re-render,
  // same idempotency key (T-T1 frozen payload).
  assert.deepEqual(sender.calls[1], sender.calls[0]);
  assert.equal(sender.calls[1].from, "StarMapCo <orders@starmapco.com>");
  assert.equal(sender.calls[1].replyTo, "support@starmapco.com");
  assert.equal(sender.calls[0].idempotencyKey, "review-request:cs_live_retry");

  const store2 = createFakeStore({ [sessionKey("cs_live_perm")]: digitalEntitlement() });
  const ledger2 = createFakeLedger();
  const sender2 = createFakeSender({ ok: false, error: "resend_http_422:invalid recipient" });
  const permSummary = await runReviewRequestTick(
    tickDeps(store2, ledger2, sender2, enabledConfig(), NOW).deps,
  );
  assert.equal(permSummary.sendFailed, 1);
  assert.equal(ledger2.rows.get("cs_live_perm").status, "failed");
  const after = await runReviewRequestTick(
    tickDeps(store2, ledger2, sender2, enabledConfig(), NOW + DAY).deps,
  );
  assert.equal(after.alreadyResolved, 1);
  assert.equal(sender2.calls.length, 1);
});

test("tick: ambiguous failure is terminal uncertain — never resent on later ticks", async () => {
  const store = createFakeStore({ [sessionKey("cs_live_amb")]: digitalEntitlement() });
  const ledger = createFakeLedger();
  const sender = createFakeSender({ ok: false, error: "resend_fetch_failed:socket hangup" });
  const summary = await runReviewRequestTick(tickDeps(store, ledger, sender, enabledConfig(), NOW).deps);
  assert.equal(summary.uncertain, 1);
  assert.equal(summary.sent, 0);
  const row = ledger.rows.get("cs_live_amb");
  assert.equal(row.status, "uncertain");
  assert.equal(row.attempts, 1);

  const later = await runReviewRequestTick(
    tickDeps(store, ledger, sender, enabledConfig(), NOW + 7 * DAY).deps,
  );
  assert.equal(later.alreadyResolved, 1);
  assert.equal(sender.calls.length, 1); // the ask was sacrificed, not duplicated

  // Provider accepted but returned no id: also uncertain, never marked sent.
  const store2 = createFakeStore({ [sessionKey("cs_live_noid")]: digitalEntitlement() });
  const ledger2 = createFakeLedger();
  const sender2 = createFakeSender({ ok: true, id: null });
  const summary2 = await runReviewRequestTick(tickDeps(store2, ledger2, sender2, enabledConfig(), NOW).deps);
  assert.equal(summary2.uncertain, 1);
  assert.equal(ledger2.rows.get("cs_live_noid").status, "uncertain");
});

test("tick: coordinator unavailable releases the claim unconsumed — nothing sent, retry possible", async () => {
  const store = createFakeStore({ [sessionKey("cs_live_down")]: digitalEntitlement() });
  const ledger = createFakeLedger();
  const sender = createFakeSender();
  const downClient = {
    check: async () => null,
    record: async () => false,
    clear: async () => false,
    erase: async () => false,
    dispatch: async () => null,
  };
  const summary = await runReviewRequestTick(
    tickDeps(store, ledger, sender, enabledConfig(), NOW, downClient).deps,
  );
  assert.equal(summary.suppressionUnavailable, 1);
  assert.equal(summary.sent, 0);
  assert.equal(sender.calls.length, 0);
  const row = ledger.rows.get("cs_live_down");
  assert.equal(row.status, "retry");
  assert.equal(row.attempts, 0); // no dispatch was ever committed

  // Next tick, coordinator healthy: the same session sends normally.
  const recovered = await runReviewRequestTick(
    tickDeps(store, ledger, sender, enabledConfig(), NOW).deps,
  );
  assert.equal(recovered.sent, 1);
  assert.equal(sender.calls.length, 1);
});

test("tick: dispatch RESPONSE LOSS — the release cannot resurrect a committed dispatch", async () => {
  // The coordinator executed and the ledger committed `dispatching`,
  // but the response never reached the tick (dispatch returns null).
  // The tick's release_claim must no-op against the committed row: it
  // stays dispatching (to settle as uncertain via expire_dispatch),
  // never a due retry that could send a second time.
  const store = createFakeStore({ [sessionKey("cs_live_lost")]: digitalEntitlement() });
  const ledger = createFakeLedger();
  const sender = createFakeSender();
  const lossyClient = {
    check: async () => false,
    record: async () => true,
    clear: async () => true,
    erase: async () => true,
    dispatch: async ({ sessionId, claimId }) => {
      await ledger.apply(sessionId, { type: "begin_dispatch", claimId, now: NOW });
      return null; // the outcome existed — only the response was lost
    },
  };
  const summary = await runReviewRequestTick(
    tickDeps(store, ledger, sender, enabledConfig(), NOW, lossyClient).deps,
  );
  assert.equal(summary.suppressionUnavailable, 1);
  assert.equal(summary.sent, 0);
  const row = ledger.rows.get("cs_live_lost");
  assert.equal(row.status, "dispatching"); // NOT released back to retry
  assert.equal(row.attempts, 1); // the commit stands
});

test("tick: per-candidate fresh clock — eligibility is re-decided at send time, not scan time", async () => {
  // Due at scan time; the send loop's own clock sample lands past max age.
  const store = createFakeStore({ [sessionKey("cs_live_clock")]: digitalEntitlement() });
  const ledger = createFakeLedger();
  const sender = createFakeSender();
  let calls = 0;
  const driftingNow = () => (calls++ === 0 ? NOW : NOW + 15 * DAY);
  const { deps } = tickDeps(store, ledger, sender, enabledConfig(), driftingNow);
  const summary = await runReviewRequestTick(deps);
  assert.equal(summary.sent, 0);
  assert.equal(summary.skips.past_max_age, 1);
  assert.equal(sender.calls.length, 0);
  assert.equal(ledger.rows.size, 0);
});

test("tick: per-tick send budget caps at 50 and the remainder goes next tick", async () => {
  const initial = {};
  for (let i = 0; i < REVIEW_MAX_SENDS_PER_TICK + 10; i += 1) {
    initial[sessionKey(`cs_live_bulk_${i}`)] = digitalEntitlement();
  }
  const store = createFakeStore(initial);
  const ledger = createFakeLedger();
  const sender = createFakeSender();
  const first = await runReviewRequestTick(tickDeps(store, ledger, sender, enabledConfig(), NOW).deps);
  assert.equal(first.sent, REVIEW_MAX_SENDS_PER_TICK);
  const second = await runReviewRequestTick(tickDeps(store, ledger, sender, enabledConfig(), NOW).deps);
  assert.equal(second.sent, 10);
  assert.equal(sender.calls.length, REVIEW_MAX_SENDS_PER_TICK + 10);
  const keys = new Set(sender.calls.map((c) => c.idempotencyKey));
  assert.equal(keys.size, REVIEW_MAX_SENDS_PER_TICK + 10);
});

test("tick: physical sends re-check entitlement revocation (PR #348 Codex P2)", async () => {
  const store = createFakeStore({
    [sessionKey("cs_live_refunded")]: digitalEntitlement({
      orderType: "print",
      paid: false,
      revoked: true,
    }),
    "print:order:cs_live_refunded": printRecord({ sessionId: "cs_live_refunded" }),
    // Entitlement record entirely absent: also fails closed.
    "print:order:cs_live_noent": printRecord({ sessionId: "cs_live_noent" }),
  });
  const ledger = createFakeLedger();
  const sender = createFakeSender();
  const summary = await runReviewRequestTick(
    tickDeps(store, ledger, sender, enabledConfig({ physicalEnabled: true })).deps,
  );
  assert.equal(summary.sent, 0);
  assert.equal(summary.skips.revoked, 2);
  assert.equal(sender.calls.length, 0);
  assert.equal(ledger.rows.size, 0);
});

test("tick: digital volume cannot starve the physical scan (PR #348 Codex P2)", async () => {
  const initial = { "print:order:cs_live_starved": printRecord({ sessionId: "cs_live_starved" }) };
  initial[sessionKey("cs_live_starved")] = digitalEntitlement({ orderType: "print" });
  // 500 pending digital records consume the entire per-population budget.
  for (let i = 0; i < 500; i += 1) {
    initial[sessionKey(`cs_live_filler_${i}`)] = digitalEntitlement({
      created: Math.floor((NOW - 60 * 60 * 1000) / 1000),
    });
  }
  const store = createFakeStore(initial);
  const ledger = createFakeLedger();
  const sender = createFakeSender();
  const summary = await runReviewRequestTick(
    tickDeps(store, ledger, sender, enabledConfig({ physicalEnabled: true })).deps,
  );
  assert.equal(summary.scannedDigital, 500);
  assert.equal(summary.scannedPhysical, 1);
  assert.equal(summary.sent, 1);
  assert.equal(sender.calls[0].tags.kind, "physical");
});

test("tick: scan cursor persists mid-traversal and wraps to null at the end", async () => {
  const initial = {};
  for (let i = 0; i < 25; i += 1) {
    // All pending (paid 1h ago) so nothing sends; 2-per-page forces paging.
    initial[sessionKey(`cs_live_page_${i}`)] = digitalEntitlement({
      created: Math.floor((NOW - 60 * 60 * 1000) / 1000),
    });
  }
  const store = createFakeStore(initial, { pageSize: 2 });
  const ledger = createFakeLedger();
  const sender = createFakeSender();
  const first = await runReviewRequestTick(tickDeps(store, ledger, sender, enabledConfig(), NOW).deps);
  assert.equal(first.scannedDigital, 20); // 10 pages x 2 — the page budget
  assert.deepEqual(store.data.get("review:scan:digital"), { cursor: "20" });
  const second = await runReviewRequestTick(tickDeps(store, ledger, sender, enabledConfig(), NOW).deps);
  assert.equal(second.scannedDigital, 5);
  assert.deepEqual(store.data.get("review:scan:digital"), { cursor: null });
  assert.equal(sender.calls.length, 0);
});

// ---------------------------------------------------------------------------
// Email builder + opt-out tokens
// ---------------------------------------------------------------------------

test("email: builder enforces the CASL mailing-address gate", () => {
  assert.throws(
    () =>
      buildReviewRequestEmail({
        kind: "digital",
        siteUrl: "https://starmapco.com",
        supportEmail: "support@starmapco.com",
        mailingAddress: "   ",
        optOutUrl: "https://starmapco.com/api/reviews/opt-out?e=a%40b.c&t=x",
      }),
    /mailing address is required/,
  );
});

test("email: single Google destination, subject, and per-kind copy", () => {
  assert.equal(GOOGLE_REVIEW_URL, "https://g.page/r/CVMm_3hOFgRTEAI/review");
  const optOutUrl = buildReviewOptOutUrl("https://starmapco.com", "buyer@example.com", SECRET);
  const digital = buildReviewRequestEmail({
    kind: "digital",
    siteUrl: "https://starmapco.com",
    supportEmail: "support@starmapco.com",
    mailingAddress: ADDRESS,
    optOutUrl,
  });
  assert.equal(digital.subject, "How did your star map turn out?");
  assert.ok(digital.html.includes(GOOGLE_REVIEW_URL));
  assert.ok(!digital.html.includes("trustpilot"));
  assert.ok(!digital.html.includes("Once it arrives"));
  assert.ok(digital.html.includes(ADDRESS.replace(/,/g, ",")));
  assert.ok(digital.text.includes(optOutUrl));
  assert.match(digital.headers["List-Unsubscribe"], /<mailto:support@starmapco\.com\?subject=unsubscribe>/);

  const physical = buildReviewRequestEmail({
    kind: "physical",
    siteUrl: "https://starmapco.com",
    supportEmail: "support@starmapco.com",
    mailingAddress: ADDRESS,
    optOutUrl,
  });
  assert.ok(physical.html.includes("Once it arrives"));
});

test("opt-out tokens: roundtrip verifies; tampering and wrong email fail", () => {
  const url = buildReviewOptOutUrl("https://starmapco.com/", "buyer@example.com", SECRET);
  const token = new URL(url).searchParams.get("t");
  assert.equal(verifyReviewOptOutToken("buyer@example.com", token, SECRET), true);
  assert.equal(verifyReviewOptOutToken("buyer@example.com", `${token}x`, SECRET), false);
  assert.equal(verifyReviewOptOutToken("other@example.com", token, SECRET), false);
  assert.equal(verifyReviewOptOutToken("buyer@example.com", token, "wrong-secret-wrong-secret"), false);
});

test("opt-out secret chain: purpose-built secrets only — Stripe secrets never qualify", () => {
  assert.equal(getReviewOptOutSecret({ STRIPE_SECRET_KEY: "sk_live_" + "x".repeat(40) }), null);
  assert.equal(getReviewOptOutSecret({ STRIPE_WEBHOOK_SECRET: "whsec_" + "x".repeat(40) }), null);
  assert.equal(getReviewOptOutSecret({ PROMOTION_UNSUBSCRIBE_SECRET: SECRET }), SECRET);
  assert.equal(
    getReviewOptOutSecret({
      REVIEW_OPTOUT_SIGNING_SECRET: "dedicated-secret-0123456789",
      PROMOTION_UNSUBSCRIBE_SECRET: SECRET,
    }),
    "dedicated-secret-0123456789",
  );
  assert.equal(getReviewOptOutSecret({ REVIEW_OPTOUT_SIGNING_SECRET: "short" }), null);
});

test("config: flags require the exact string 'true'; defaults are inert", () => {
  const config = resolveReviewEngineConfig({}, { resendConfigured: false });
  assert.equal(config.enabled, false);
  assert.equal(config.physicalEnabled, false);
  assert.equal(config.mailingAddress, "");
  assert.equal(config.signingSecret, null);
  assert.equal(config.fromAddress, "");
  assert.equal(config.replyTo, null);
  const armed = resolveReviewEngineConfig(
    {
      REVIEW_REQUESTS_ENABLED: "true",
      REVIEW_REQUEST_MAILING_ADDRESS: ADDRESS,
      PROMOTION_UNSUBSCRIBE_SECRET: SECRET,
    },
    { resendConfigured: true },
  );
  assert.equal(armed.enabled, true);
  assert.equal(armed.signingSecret, SECRET);
});

test("config: sender identity is snapshotted for the payload freeze", () => {
  const config = resolveReviewEngineConfig(
    {
      RESEND_FROM_EMAIL: "orders@starmapco.com",
      RESEND_FROM_NAME: "StarMapCo",
      RESEND_REPLY_TO: "support@starmapco.com",
    },
    { resendConfigured: true },
  );
  // Same composition the Resend adapter applies to its env default.
  assert.equal(config.fromAddress, "StarMapCo <orders@starmapco.com>");
  assert.equal(config.replyTo, "support@starmapco.com");
  const bare = resolveReviewEngineConfig(
    { RESEND_FROM_EMAIL: "orders@starmapco.com" },
    { resendConfigured: true },
  );
  assert.equal(bare.fromAddress, "orders@starmapco.com");
  assert.equal(bare.replyTo, null);
});

// ---------------------------------------------------------------------------
// Resend wrapper extension (stubbed global fetch)
// ---------------------------------------------------------------------------

test("resend wrapper: Idempotency-Key is an HTTP header; message headers ride the payload", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM_EMAIL = "orders@starmapco.com";
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url, init });
    return new Response(JSON.stringify({ id: "msg_wrap" }), { status: 200 });
  };
  try {
    const input = {
      to: "buyer@example.com",
      subject: "s",
      html: "<p>x</p>",
      headers: {
        "List-Unsubscribe": "<https://starmapco.com/api/reviews/opt-out?e=a&t=b>",
        Authorization: "Bearer attacker-controlled",
      },
      idempotencyKey: "review-request:cs_live_wrap",
    };
    const first = await sendResendEmail(input);
    assert.equal(first.ok, true);
    assert.equal(first.id, "msg_wrap");
    const init = seen[0].init;
    assert.equal(init.headers["Idempotency-Key"], "review-request:cs_live_wrap");
    // The wrapper's own Authorization wins; the caller's "Authorization"
    // message header lands in the payload headers field, never on the wire.
    assert.equal(init.headers.Authorization, "Bearer re_test_key");
    const body = JSON.parse(init.body);
    assert.equal(body.headers["List-Unsubscribe"], input.headers["List-Unsubscribe"]);
    assert.equal(body.headers.Authorization, "Bearer attacker-controlled");
    assert.equal(body.idempotencyKey, undefined);

    const second = await sendResendEmail(input);
    assert.equal(second.ok, true);
    assert.equal(seen[1].init.headers["Idempotency-Key"], "review-request:cs_live_wrap");

    const bare = await sendResendEmail({ to: "buyer@example.com", subject: "s", html: "<p>x</p>" });
    assert.equal(bare.ok, true);
    assert.equal(seen[2].init.headers["Idempotency-Key"], undefined);
    assert.equal(JSON.parse(seen[2].init.body).headers, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});

test("resend wrapper: an explicit Reply-To is authoritative — a frozen null never falls back to env", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM_EMAIL = "orders@starmapco.com";
  process.env.RESEND_REPLY_TO = "env-default@starmapco.com";
  const bodies = [];
  globalThis.fetch = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ id: "msg_rt" }), { status: 200 });
  };
  try {
    // Absent property: the env default applies (legacy callers).
    await sendResendEmail({ to: "buyer@example.com", subject: "s", html: "<p>x</p>" });
    assert.equal(bodies[0].reply_to, "env-default@starmapco.com");
    // Explicit value: used verbatim, env ignored.
    await sendResendEmail({
      to: "buyer@example.com",
      subject: "s",
      html: "<p>x</p>",
      from: "StarMapCo <orders@starmapco.com>",
      replyTo: "frozen@starmapco.com",
    });
    assert.equal(bodies[1].reply_to, "frozen@starmapco.com");
    assert.equal(bodies[1].from, "StarMapCo <orders@starmapco.com>");
    // Frozen null: NO reply_to at all — the env default must not leak in.
    await sendResendEmail({
      to: "buyer@example.com",
      subject: "s",
      html: "<p>x</p>",
      replyTo: null,
    });
    assert.equal(bodies[2].reply_to, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});

// ---------------------------------------------------------------------------
// Wiring construction pins
// ---------------------------------------------------------------------------

const appRoot = new URL("../../", import.meta.url);

test("wiring: cron trigger + both DO bindings exist; the enable flag is NOT a [vars] binding", () => {
  const wrangler = readFileSync(new URL("wrangler.toml", appRoot), "utf8");
  assert.match(wrangler, /\[triggers\]\s*\ncrons = \["\*\/15 \* \* \* \*"\]/);
  assert.match(wrangler, /name = "REVIEW_REQUEST_LEDGER"/);
  assert.match(wrangler, /tag = "v2-review-request-ledger"/);
  assert.match(wrangler, /name = "REVIEW_REQUEST_SUPPRESSION"/);
  assert.match(wrangler, /tag = "v4-review-request-suppression"/);
  const varsBlock = wrangler.slice(wrangler.indexOf("[vars]"), wrangler.indexOf("[[services]]"));
  assert.ok(!varsBlock.includes("REVIEW_REQUESTS_ENABLED"), "flag must ship unset");
  assert.ok(!varsBlock.includes("REVIEW_REQUEST_MAILING_ADDRESS"), "address is owner-supplied config");

  const worker = readFileSync(new URL("cloudflare-worker.ts", appRoot), "utf8");
  assert.match(worker, /scheduled/);
  assert.match(worker, /ReviewRequestLedgerDO/);
  assert.match(worker, /ReviewRequestSuppressionDO/);
});

test("wiring: coordinator-only provider access — the tick and its runtime hold no sender", () => {
  const runtime = readFileSync(new URL("src/lib/reviewRequestRuntime.ts", appRoot), "utf8");
  assert.ok(!runtime.includes("sendResendEmail"), "runtime must not hold a direct provider sender");
  assert.ok(runtime.includes("createReviewSuppressionClient"));
  const tick = readFileSync(new URL("src/lib/reviewRequests.ts", appRoot), "utf8");
  assert.ok(!tick.includes("deps.send"), "the tick must dispatch via the coordinator only");
  const coordinator = readFileSync(
    new URL("src/durable-objects/ReviewRequestSuppressionDO.ts", appRoot),
    "utf8",
  );
  assert.ok(coordinator.includes("executeReviewDispatch"));
});

test("wiring: eligibility checker inside the coordinator; retention maintenance ungated by the send flag", () => {
  const coordinator = readFileSync(
    new URL("src/durable-objects/ReviewRequestSuppressionDO.ts", appRoot),
    "utf8",
  );
  assert.ok(
    coordinator.includes("createReviewDispatchEligibilityChecker"),
    "the suppression DO must build the post-commit eligibility checker",
  );
  assert.ok(
    coordinator.includes("checkEligibility"),
    "the coordinator must pass the checker into the dispatch",
  );
  assert.ok(coordinator.includes("async alarm("), "the suppression DO must carry the retention alarm");
  assert.ok(
    coordinator.includes("reviewRetentionDeadlineMs"),
    "the retention deadline must come from the shared calendar helper",
  );
  assert.ok(
    coordinator.includes("reviewSuppressionMinimizationDue"),
    "minimization must be gated on the due check",
  );
  const runtime = readFileSync(new URL("src/lib/reviewRequestRuntime.ts", appRoot), "utf8");
  const sweepAt = runtime.indexOf("runReviewOptOutRetentionSweep({");
  const tickAt = runtime.indexOf("runReviewRequestTick(deps)");
  assert.ok(sweepAt !== -1 && tickAt !== -1 && sweepAt < tickAt, "retention maintenance must run before the tick");
  assert.ok(
    runtime.includes("if (deps.config.signingSecret)"),
    "the sweep must be gated on the secret it needs — never on the send flag",
  );
  const optOutRoute = readFileSync(new URL("src/app/api/reviews/opt-out/route.ts", appRoot), "utf8");
  assert.ok(
    optOutRoute.includes("recordReviewOptOut(createWrapperKvScanStore(), email, suppressionName)"),
    "the opt-out route must write the keyed marker, not a raw-address row",
  );
});

test("wiring: promotions unsubscribe establishes the AUTHORITATIVE suppression record before any acknowledgement", () => {
  const page = readFileSync(new URL("src/app/unsubscribe/page.tsx", appRoot), "utf8");
  const recordCall = page.indexOf("createReviewSuppressionClient().record(");
  // T-SM-KVRACE: the promotions opt-out write no longer happens inline
  // in the page — it is the Consistency Coordinator call (which also
  // writes the KV projection). The ordering invariant this pin protects
  // is unchanged: that write is what must follow the suppression record.
  const kvWrite = page.indexOf("await unsubscribePromotionFlow(");
  const alreadyAck = page.indexOf('status = "already_unsubscribed"');
  const successAck = page.indexOf('status = "unsubscribed"');
  assert.ok(recordCall !== -1, "the page must write the authoritative suppression record");
  // The authoritative write precedes the KV write AND both success
  // acknowledgements — including the already-unsubscribed one, which
  // previously skipped the authoritative write entirely.
  assert.ok(kvWrite !== -1 && recordCall < kvWrite, "authoritative record must land before the KV write");
  assert.ok(alreadyAck !== -1 && recordCall < alreadyAck, "already-unsubscribed must not ack before the record");
  assert.ok(successAck !== -1 && recordCall < successAck, "unsubscribed must not ack before the record");
  // A failed authoritative write surfaces an error state, never a success.
  assert.ok(page.includes('status = "error"'), "record failure must produce the error state");
  assert.ok(!page.includes("best-effort"), "the best-effort rationale must not return");
});

test("wiring: promotions unsubscribe is decoupled from review-secret configuration (Codex re-gate P1)", () => {
  const page = readFileSync(new URL("src/app/unsubscribe/page.tsx", appRoot), "utf8");
  // T-SM-KVRACE: the opt-out write marker is the coordinator flow call
  // (see the companion pin above); the settled-guard invariant is unchanged.
  const kvWrite = page.indexOf("await unsubscribePromotionFlow(");
  // When NO purpose-built review opt-out secret is configured, the
  // suppression record settles as true (nothing to record into; review
  // dispatch fails closed on signing_secret_missing) so a promotions
  // token signed under any supported promotions fallback secret can
  // still record the KV opt-out. The KV write sits behind the settled
  // guard only — never behind the secret's presence.
  assert.ok(page.includes("const suppressionSettled = secret"), "suppression outcome must be a settled flag");
  assert.ok(page.includes(": true;"), "the unconfigured branch must settle, not fail");
  const guard = page.indexOf("if (!suppressionSettled)");
  assert.ok(guard !== -1 && guard < kvWrite, "the KV write must follow the settled guard");
  // Secret separation holds on this surface: promotions/referral/payment
  // secrets are never read here to key review suppression.
  assert.ok(!page.includes("REFERRAL_SIGNING_SECRET"), "referral secret must not key review suppression");
  assert.ok(!page.includes("STRIPE_"), "payment secrets must not key review suppression");
  assert.ok(page.includes("getReviewOptOutSecret()"), "the purpose-built secret resolver remains the only source");
});

test("wiring: shippedAt is persisted before the shipping email send", () => {
  const source = readFileSync(new URL("src/lib/shippingNotifications.ts", appRoot), "utf8");
  const anchorWrite = source.indexOf("persistPrintOrderRecord(sessionId, anchored)");
  const send = source.indexOf("await sendResendEmail({");
  assert.ok(anchorWrite !== -1, "shippedAt anchor write must exist");
  assert.ok(send !== -1);
  assert.ok(anchorWrite < send, "shipment fact must persist before the email is attempted");
});

// ---------------------------------------------------------------------------
// 13-month retention (S54-5 design (a), revised by S54-5B)
// ---------------------------------------------------------------------------

test("retention: the 13-month boundary is calendar-exact — month-end and leap cases", () => {
  assert.equal(reviewRetentionDeadlineMs(Date.UTC(2025, 0, 15, 12)), Date.UTC(2026, 1, 15, 12));
  // Month-end clamping: Jan 31 + 13 months lands on Feb 28 (2026 is not
  // a leap year), never Mar 3.
  assert.equal(addCalendarMonthsMs(Date.UTC(2025, 0, 31), 13), Date.UTC(2026, 1, 28));
  // Oct 31 + 13 months lands on Nov 30.
  assert.equal(addCalendarMonthsMs(Date.UTC(2023, 9, 31), 13), Date.UTC(2024, 10, 30));
  // Feb 29 + 13 months lands on Mar 29 of the following year.
  assert.equal(addCalendarMonthsMs(Date.UTC(2024, 1, 29), 13), Date.UTC(2025, 2, 29));

  const optedOutAt = Date.UTC(2025, 0, 15, 12, 0, 0);
  const row = { suppressed: 1, source: "opt_out_page", suppressed_at: optedOutAt };
  // The boundary itself: 1ms before is not due; exactly at it is.
  assert.equal(reviewSuppressionMinimizationDue(row, reviewRetentionDeadlineMs(optedOutAt) - 1), false);
  assert.equal(reviewSuppressionMinimizationDue(row, reviewRetentionDeadlineMs(optedOutAt)), true);
  // Minimized, cleared, and absent records owe no cleanup.
  assert.equal(
    reviewSuppressionMinimizationDue({ suppressed: 1, source: null, suppressed_at: null }, Date.UTC(2030, 0, 1)),
    false,
  );
  assert.equal(
    reviewSuppressionMinimizationDue({ suppressed: 0, source: null, suppressed_at: optedOutAt }, Date.UTC(2030, 0, 1)),
    false,
  );
  assert.equal(reviewSuppressionMinimizationDue(null, Date.UTC(2030, 0, 1)), false);
  assert.equal(isReviewSuppressionMinimized({ suppressed: 1, source: null, suppressed_at: null }), true);
  assert.equal(isReviewSuppressionMinimized(row), false);
  // Sources: only the two route values are storable, verbatim.
  assert.equal(sanitizeReviewSuppressionSource("opt_out_page"), "opt_out_page");
  assert.equal(sanitizeReviewSuppressionSource("list_unsubscribe"), "list_unsubscribe");
  assert.equal(sanitizeReviewSuppressionSource("kv_reconciliation"), null);
  assert.equal(sanitizeReviewSuppressionSource(undefined), null);
});

test("retention: recordReviewOptOut writes ONLY the keyed marker — no raw address, no metadata", async () => {
  const store = createFakeStore();
  const name = deriveReviewSuppressionName("marker@example.com", SECRET);
  await recordReviewOptOut(store, "Marker@Example.com", name);
  const keys = [...store.data.keys()];
  assert.deepEqual(keys, [reviewOptOutMarkerKey(name)]);
  assert.ok(!keys[0].includes("marker@example.com"), "the raw address must not appear in the key");
  // The value is a bare presence marker: the write path accepts no
  // opt-out time or source, so the PERMANENT marker cannot carry the
  // metadata the 13-month rule governs (that lives only in the DO
  // record, which the caller lands first).
  assert.deepEqual(store.data.get(keys[0]), { suppressed: true });
  assert.ok(
    !JSON.stringify(store.data.get(keys[0])).includes("marker@example.com"),
    "the raw address must not appear in the value",
  );
  assert.equal(await isReviewSuppressed(store, "marker@example.com", name), true);
  // Every marker is the same bare value — there is no field in which a
  // timestamp or a source string (sanitized or not) could be stored.
  const name2 = deriveReviewSuppressionName("second@example.com", SECRET);
  await recordReviewOptOut(store, "second@example.com", name2);
  assert.deepEqual(store.data.get(reviewOptOutMarkerKey(name2)), { suppressed: true });
  // Legacy rows still suppress: read compatibility remains until the
  // migration sweep has verifiably replaced every one of them.
  await store.putJson(reviewOptOutKey("legacy@example.com"), {
    email: "legacy@example.com",
    optedOutAt: NOW - DAY,
    source: "opt_out_page",
  });
  assert.equal(await isReviewSuppressed(store, "legacy@example.com"), true);
});

test("sweep: legacy rows migrate — replacement protection first, raw row deleted last", async () => {
  const store = createFakeStore({
    [reviewOptOutKey("old1@example.com")]: {
      email: "old1@example.com",
      optedOutAt: NOW - 30 * DAY,
      source: "opt_out_page",
    },
    [reviewOptOutKey("old2@example.com")]: {
      email: "old2@example.com",
      optedOutAt: NOW - 10 * DAY,
      source: "list_unsubscribe",
    },
    // A promotions state row is NOT part of the sweep's population.
    [`promotions:email:${encodeURIComponent("promo@example.com")}`]: {
      subscribedAt: NOW - 30 * DAY,
      unsubscribedAt: NOW - DAY,
      updatedAt: NOW - DAY,
    },
  });
  const client = createInMemoryReviewSuppressionClient({
    ledger: createFakeLedger(),
    send: createFakeSender().send,
    now: () => NOW,
  });
  const recordCalls = [];
  const suppression = {
    ...client,
    record: async (name, source, now) => {
      recordCalls.push({ name, source, now });
      return client.record(name, source, now);
    },
  };
  const summary = await runReviewOptOutRetentionSweep({
    store,
    suppression,
    signingSecret: SECRET,
    now: () => NOW,
    log: () => {},
  });
  assert.deepEqual(summary, { scanned: 2, migrated: 2, failed: 0, complete: true });
  const name1 = deriveReviewSuppressionName("old1@example.com", SECRET);
  const name2 = deriveReviewSuppressionName("old2@example.com", SECRET);
  // The authoritative record was written with the ORIGINAL opt-out time
  // (S54-5B: never the migration time, never an overwrite time).
  assert.deepEqual(recordCalls, [
    { name: name1, source: "opt_out_page", now: NOW - 30 * DAY },
    { name: name2, source: "list_unsubscribe", now: NOW - 10 * DAY },
  ]);
  assert.equal(await client.check(name1), true);
  assert.equal(await client.check(name2), true);
  // Legacy raw rows are gone; keyed markers are bare presence values —
  // the original times/sources live ONLY in the DO records (see the
  // recordCalls above), never in the permanent KV copy.
  assert.equal(store.data.has(reviewOptOutKey("old1@example.com")), false);
  assert.equal(store.data.has(reviewOptOutKey("old2@example.com")), false);
  assert.deepEqual(store.data.get(reviewOptOutMarkerKey(name1)), { suppressed: true });
  assert.equal(await isReviewSuppressed(store, "old1@example.com", name1), true);
  // The promotions row is untouched.
  assert.equal(store.data.has(`promotions:email:${encodeURIComponent("promo@example.com")}`), true);
  // Idempotent: a second full sweep finds nothing left to migrate.
  const again = await runReviewOptOutRetentionSweep({
    store,
    suppression,
    signingSecret: SECRET,
    now: () => NOW,
    log: () => {},
  });
  assert.deepEqual(again, { scanned: 0, migrated: 0, failed: 0, complete: true });
});

test("sweep: a failed replacement NEVER deletes the legacy row — suppression survives every failure", async () => {
  const legacy = {
    email: "keep@example.com",
    optedOutAt: NOW - 30 * DAY,
    source: "opt_out_page",
  };
  const name = deriveReviewSuppressionName("keep@example.com", SECRET);

  // (a) The authoritative record refuses to land.
  const storeA = createFakeStore({ [reviewOptOutKey("keep@example.com")]: legacy });
  const refusing = {
    record: async () => false,
    check: async () => false,
    clear: async () => false,
    erase: async () => false,
    dispatch: async () => null,
  };
  const summaryA = await runReviewOptOutRetentionSweep({
    store: storeA,
    suppression: refusing,
    signingSecret: SECRET,
    now: () => NOW,
    log: () => {},
  });
  assert.deepEqual(summaryA, { scanned: 1, migrated: 0, failed: 1, complete: true });
  assert.equal(storeA.data.has(reviewOptOutKey("keep@example.com")), true);
  assert.equal(storeA.data.has(reviewOptOutMarkerKey(name)), false);

  // (b) The marker write throws after the DO record landed.
  const baseB = createFakeStore({ [reviewOptOutKey("keep@example.com")]: legacy });
  const storeB = {
    ...baseB,
    async putJson(key, value) {
      if (key.startsWith("review:optout-marker:")) throw new Error("kv write failed");
      return baseB.putJson(key, value);
    },
  };
  const clientB = createInMemoryReviewSuppressionClient({
    ledger: createFakeLedger(),
    send: createFakeSender().send,
    now: () => NOW,
  });
  const summaryB = await runReviewOptOutRetentionSweep({
    store: storeB,
    suppression: clientB,
    signingSecret: SECRET,
    now: () => NOW,
    log: () => {},
  });
  assert.equal(summaryB.failed, 1);
  assert.equal(summaryB.migrated, 0);
  assert.equal(baseB.data.has(reviewOptOutKey("keep@example.com")), true);
  assert.equal(await clientB.check(name), true); // protection duplicated, never lost

  // (c) The delete throws: legacy row and marker coexist, and a retry on
  // the next run completes the migration idempotently.
  const baseC = createFakeStore({ [reviewOptOutKey("keep@example.com")]: legacy });
  let deleteFails = true;
  const storeC = {
    ...baseC,
    async deleteKey(key) {
      if (deleteFails) throw new Error("kv delete failed");
      return baseC.deleteKey(key);
    },
  };
  const clientC = createInMemoryReviewSuppressionClient({
    ledger: createFakeLedger(),
    send: createFakeSender().send,
    now: () => NOW,
  });
  const summaryC1 = await runReviewOptOutRetentionSweep({
    store: storeC,
    suppression: clientC,
    signingSecret: SECRET,
    now: () => NOW,
    log: () => {},
  });
  assert.equal(summaryC1.failed, 1);
  assert.equal(baseC.data.has(reviewOptOutKey("keep@example.com")), true);
  assert.equal(baseC.data.has(reviewOptOutMarkerKey(name)), true);
  deleteFails = false;
  const summaryC2 = await runReviewOptOutRetentionSweep({
    store: storeC,
    suppression: clientC,
    signingSecret: SECRET,
    now: () => NOW,
    log: () => {},
  });
  assert.deepEqual(summaryC2, { scanned: 1, migrated: 1, failed: 0, complete: true });
  assert.equal(baseC.data.has(reviewOptOutKey("keep@example.com")), false);
});

test("retention: a migrated opt-out PAST its 13-month deadline leaves no metadata anywhere — suppression stands", async () => {
  // The Codex P2 scenario on PR #446: a legacy row whose opt-out is
  // ALREADY older than the retention window when the sweep migrates it.
  // The sweep used to copy optedOutAt + source into the PERMANENT KV
  // marker; the sweep scans only the legacy prefix and the DO alarm
  // minimizes only its own row, so that copy would have survived every
  // minimization pass forever.
  const optedOutAt = NOW - 400 * DAY; // > 13 calendar months before NOW
  assert.ok(
    reviewRetentionDeadlineMs(optedOutAt) < NOW,
    "the fixture must start past its retention deadline",
  );
  const store = createFakeStore({
    [reviewOptOutKey("ancient@example.com")]: {
      email: "ancient@example.com",
      optedOutAt,
      source: "opt_out_page",
    },
  });
  const client = createInMemoryReviewSuppressionClient({
    ledger: createFakeLedger(),
    send: createFakeSender().send,
    now: () => NOW,
  });
  const recordCalls = [];
  const suppression = {
    ...client,
    record: async (name, source, now) => {
      recordCalls.push({ name, source, now });
      return client.record(name, source, now);
    },
  };
  const summary = await runReviewOptOutRetentionSweep({
    store,
    suppression,
    signingSecret: SECRET,
    now: () => NOW,
    log: () => {},
  });
  assert.deepEqual(summary, { scanned: 1, migrated: 1, failed: 0, complete: true });
  const name = deriveReviewSuppressionName("ancient@example.com", SECRET);
  // The metadata went to its governed home — the DO record — with the
  // ORIGINAL opt-out time, never the migration time.
  assert.deepEqual(recordCalls, [{ name, source: "opt_out_page", now: optedOutAt }]);
  // The DO row that record implies is already due at migration time, and
  // minimization (alarm + lazy repair, pinned structurally in the wiring
  // tests) reduces it to the flag alone: no source, no timestamp.
  const doRow = { suppressed: 1, source: "opt_out_page", suppressed_at: optedOutAt };
  assert.equal(reviewSuppressionMinimizationDue(doRow, NOW), true);
  assert.equal(
    isReviewSuppressionMinimized({ suppressed: 1, source: null, suppressed_at: null }),
    true,
  );
  // The permanent KV marker is a bare presence value — nothing for the
  // deadline to govern, nothing left behind when it passes.
  const marker = store.data.get(reviewOptOutMarkerKey(name));
  assert.deepEqual(marker, { suppressed: true });
  assert.ok(!("optedOutAt" in marker) && !("source" in marker));
  // Whole-store scan: with the legacy row deleted, NO KV value may still
  // carry the opt-out timestamp or source (the sweep cursor row holds
  // neither). Any hit here is a permanent, unminimizable leak.
  for (const [key, value] of store.data) {
    const text = JSON.stringify(value);
    assert.ok(!text.includes(String(optedOutAt)), `opt-out timestamp leaked into ${key}`);
    assert.ok(!text.includes("opt_out_page"), `opt-out source leaked into ${key}`);
  }
  // Suppression itself is untouched by all of this: the KV hint and the
  // authoritative DO check both still read suppressed.
  assert.equal(await isReviewSuppressed(store, "ancient@example.com", name), true);
  assert.equal(await client.check(name), true);
});

// ---------------------------------------------------------------------------
// The REAL suppression DO over a fake storage: the migration anchor
// (Codex P2 on PR #446, second round)
// ---------------------------------------------------------------------------
//
// The sweep above hands the DO the legacy row's ORIGINAL optedOutAt, but
// the DO's record() used to keep its OWN timestamp whenever a record
// already existed — so a legacy opt-out that PREDATED the DO record
// (the recipient opted out again through the current route after the
// legacy one) had its cleanup alarm armed from the later DO timestamp,
// retaining the metadata past its original 13-month deadline. These
// tests run the real DO class: the anchor is the EARLIEST known
// opt-out, an earlier migration pulls it back, and nothing ever moves
// it forward.

/**
 * In-memory stand-in for the SQLite DO storage API, implementing exactly
 * the statement shapes ReviewRequestSuppressionDO issues (the row is a
 * singleton, id = 1). The row object is shared so a "restart" (a new DO
 * instance over the same storage) observes what the previous instance
 * persisted.
 */
class FakeSuppressionSqlStorage {
  constructor() {
    this.row = null;
  }

  exec(sql, ...params) {
    const head = sql.trimStart().slice(0, 6).toUpperCase();
    if (head.startsWith("CREATE")) return { toArray: () => [] };
    if (head.startsWith("SELECT")) {
      return { toArray: () => (this.row ? [{ ...this.row }] : []) };
    }
    if (head.startsWith("INSERT")) {
      const [suppressed, source, suppressedAt, updatedAt] = params;
      this.row = {
        suppressed,
        source,
        suppressed_at: suppressedAt,
        updated_at: updatedAt,
      };
      return { toArray: () => [] };
    }
    if (head.startsWith("DELETE")) {
      this.row = null;
      return { toArray: () => [] };
    }
    throw new Error(`unexpected SQL in fake: ${sql.slice(0, 80)}`);
  }
}

function fakeSuppressionCtx(sql) {
  let alarmAt = null;
  return {
    storage: {
      sql,
      async getAlarm() {
        return alarmAt;
      },
      async setAlarm(t) {
        alarmAt = t;
      },
      async deleteAlarm() {
        alarmAt = null;
      },
    },
    blockConcurrencyWhile(fn) {
      return fn();
    },
  };
}

function newSuppressionDO(sql) {
  const ctx = fakeSuppressionCtx(sql);
  return { coordinator: new ReviewRequestSuppressionDO(ctx, {}), ctx };
}

test("retention DO: a migrated legacy opt-out pulls the cleanup anchor back to the ORIGINAL opt-out time", async () => {
  const sql = new FakeSuppressionSqlStorage();
  const { coordinator, ctx } = newSuppressionDO(sql);
  // The DO record is established LATER (the recipient opted out again
  // through the current route), then the sweep migrates the legacy row
  // carrying the EARLIER original opt-out time.
  const doIngestAt = Date.UTC(2026, 6, 15, 12, 0, 0);
  const legacyOptedOutAt = Date.UTC(2026, 0, 15, 12, 0, 0);
  await coordinator.record({ source: "opt_out_page", now: doIngestAt });
  assert.equal(sql.row.suppressed_at, doIngestAt);
  assert.equal(await ctx.storage.getAlarm(), reviewRetentionDeadlineMs(doIngestAt));

  await coordinator.record({ source: "opt_out_page", now: legacyOptedOutAt });
  // The anchor moved BACK to the original opt-out: the stored timestamp
  // and the armed alarm both derive from it, so the metadata deadline
  // is the legacy one — never the later ingest time + 13 months.
  assert.equal(sql.row.suppressed_at, legacyOptedOutAt);
  assert.equal(await ctx.storage.getAlarm(), reviewRetentionDeadlineMs(legacyOptedOutAt));
  // Nothing else about the record changed: same source, still suppressed.
  assert.equal(sql.row.source, "opt_out_page");
  assert.equal(sql.row.suppressed, 1);
  assert.deepEqual(await coordinator.check(), { suppressed: true });
  // The deadline is still in the future, so the read left the record
  // (and its anchor) untouched.
  assert.equal(sql.row.suppressed_at, legacyOptedOutAt);
});

test("retention DO: an existing earlier anchor NEVER moves forward — later records and restarts leave it standing", async () => {
  const sql = new FakeSuppressionSqlStorage();
  const { coordinator, ctx } = newSuppressionDO(sql);
  const early = Date.UTC(2026, 0, 15, 12, 0, 0);
  const late = Date.UTC(2026, 6, 15, 12, 0, 0);
  await coordinator.record({ source: "list_unsubscribe", now: early });
  assert.equal(sql.row.suppressed_at, early);

  // A later opt-out (any route) re-arms the SAME deadline; the stored
  // anchor and the record's source stand untouched.
  await coordinator.record({ source: "opt_out_page", now: late });
  assert.equal(sql.row.suppressed_at, early);
  assert.equal(sql.row.source, "list_unsubscribe");
  assert.equal(await ctx.storage.getAlarm(), reviewRetentionDeadlineMs(early));

  // Across an object restart the standing anchor is durable: a third
  // record, later still, changes nothing and re-arms the same deadline.
  const restarted = newSuppressionDO(sql);
  await restarted.coordinator.record({ source: "opt_out_page", now: late + 30 * DAY });
  assert.equal(sql.row.suppressed_at, early);
  assert.equal(await restarted.ctx.storage.getAlarm(), reviewRetentionDeadlineMs(early));
  assert.deepEqual(await restarted.coordinator.check(), { suppressed: true });
});

test("retention DO: an anchor already past its deadline at migration minimizes on the next touch — suppression stands throughout", async () => {
  const ingestAt = Date.UTC(2026, 0, 15, 12, 0, 0);
  const ancientOptedOutAt = Date.UTC(2024, 0, 15, 12, 0, 0);
  const ancientDeadline = reviewRetentionDeadlineMs(ancientOptedOutAt);
  assert.ok(ancientDeadline < Date.now(), "the fixture deadline must already be past");

  // Path 1 — the read repair: check() after the migration minimizes the
  // metadata and still answers suppressed.
  const sqlA = new FakeSuppressionSqlStorage();
  const a = newSuppressionDO(sqlA);
  await a.coordinator.record({ source: "opt_out_page", now: ingestAt });
  assert.deepEqual(await a.coordinator.check(), { suppressed: true });
  await a.coordinator.record({ source: "opt_out_page", now: ancientOptedOutAt });
  // The alarm is armed at the (already past) deadline itself — the
  // design's immediate scheduling: setAlarm with a past time fires on
  // the next touch rather than being clamped forward.
  assert.equal(sqlA.row.suppressed_at, ancientOptedOutAt);
  assert.equal(await a.ctx.storage.getAlarm(), ancientDeadline);
  assert.deepEqual(await a.coordinator.check(), { suppressed: true });
  assert.deepEqual(sqlA.row, { suppressed: 1, source: null, suppressed_at: null, updated_at: null });
  assert.equal(await a.ctx.storage.getAlarm(), null); // consumed by the repair

  // Path 2 — the alarm itself: same migration, minimization lands via
  // alarm(), and suppression reads true before and after it fires.
  const sqlB = new FakeSuppressionSqlStorage();
  const b = newSuppressionDO(sqlB);
  await b.coordinator.record({ source: "opt_out_page", now: ingestAt });
  await b.coordinator.record({ source: "opt_out_page", now: ancientOptedOutAt });
  assert.equal(await b.ctx.storage.getAlarm(), ancientDeadline);
  await b.coordinator.alarm();
  assert.deepEqual(sqlB.row, { suppressed: 1, source: null, suppressed_at: null, updated_at: null });
  assert.deepEqual(await b.coordinator.check(), { suppressed: true });
});

// ---------------------------------------------------------------------------
// KV → suppression-DO reconciliation + the mid-tick opt-out race
// (pre-enable gate, prep report §2c/§2e)
// ---------------------------------------------------------------------------
//
// The tick reads KV suppression state as a HINT; the suppression DO is the
// authoritative fence, re-checked inside dispatch. Two consequences are
// pinned here:
//
//  1. Every opt-out that exists ONLY in KV (a `review:optout:` row, or a
//     promotions state carrying `unsubscribedAt`) must be imported into
//     the DO before the engine is enabled — `reconcileKvOptOuts` below is
//     the §2c import shape, exercised against both flavours.
//  2. An opt-out ACKNOWLEDGED after the tick's hint read must still fence
//     the send. The real opt-out handlers (opt-out route POST, promotions
//     unsubscribe page) write the DO record FIRST and the KV row second,
//     acknowledging only after both land — so an acknowledged opt-out is
//     always visible to the dispatch coordinator's own check even when it
//     lands mid-tick, after the hint read returned "not suppressed".
//
// CONTROL (documented expectation, deliberately not asserted): if a writer
// wrote ONLY the KV row, an opt-out landing after the hint read would be
// invisible to that tick's dispatch — the final fence reads the DO alone.
// That is the known miss the write-both, acknowledge-after ordering exists
// to close; do not "fix" these tests to pass against a KV-only writer.

const {
  emailStateKey,
  keyNameToPromotionEmail,
  normalizePromotionEmail,
} = await import("../../src/lib/promotionSubscriptions.ts");

async function listAllStoreKeys(store, prefix) {
  const names = [];
  let cursor;
  for (;;) {
    const page = await store.listKeys(prefix, cursor);
    names.push(...page.names);
    if (page.complete) return names;
    cursor = page.cursor ?? undefined;
  }
}

/**
 * The §2c reconciliation import: collect every address suppressed in KV
 * only — `review:optout:` rows plus `promotions:email:` states carrying
 * `unsubscribedAt` — and record each in the suppression DO under the same
 * HMAC name the handlers and the tick derive. Idempotent: re-running
 * records the same names again and changes nothing.
 */
async function reconcileKvOptOuts(store, suppression, secret) {
  const emails = new Set();
  for (const key of await listAllStoreKeys(store, "review:optout:")) {
    try {
      const email = decodeURIComponent(key.slice("review:optout:".length));
      if (email) emails.add(email);
    } catch {
      // A malformed key names no address we can derive a record for.
    }
  }
  for (const key of await listAllStoreKeys(store, "promotions:email:")) {
    const email = keyNameToPromotionEmail(key);
    if (!email) continue;
    const state = await store.getJson(key);
    if (state?.unsubscribedAt) emails.add(email);
  }
  let imported = 0;
  for (const email of emails) {
    const name = deriveReviewSuppressionName(normalizePromotionEmail(email), secret);
    await suppression.record(name, "kv_reconciliation");
    assert.equal(await suppression.check(name), true);
    imported += 1;
  }
  return { found: emails.size, imported };
}

test("reconciliation: KV-only opt-outs of BOTH flavours import into the suppression DO and fence the first tick", async () => {
  const store = createFakeStore({
    [sessionKey("cs_live_rec1")]: digitalEntitlement({ customerEmail: "kvonly@example.com" }),
    [sessionKey("cs_live_rec2")]: digitalEntitlement({ customerEmail: "promounsub@example.com" }),
    [sessionKey("cs_live_rec3")]: digitalEntitlement({ customerEmail: "clean@example.com" }),
  });
  // Flavour 1: a review-specific KV opt-out row (the tick's hint source).
  // Seeded DIRECTLY in the legacy shape — raw address in key and value,
  // as the pre-marker writer produced it; recordReviewOptOut now writes
  // keyed markers only, and these rows are exactly what the retention
  // sweep (and this import) exist to migrate.
  await store.putJson(reviewOptOutKey("kvonly@example.com"), {
    email: "kvonly@example.com",
    optedOutAt: NOW - DAY,
    source: "opt_out_page",
  });
  // Flavour 2: a promotions unsubscribe — state row only, no review row.
  store.data.set(emailStateKey("promounsub@example.com"), {
    subscribedAt: NOW - 30 * DAY,
    unsubscribedAt: NOW - 2 * DAY,
    updatedAt: NOW - 2 * DAY,
  });

  const ledger = createFakeLedger();
  const sender = createFakeSender();
  const { deps, suppression } = tickDeps(store, ledger, sender, enabledConfig());

  // Before the import, the authoritative DO record does not exist for
  // either address — the DO is what the dispatch fence reads.
  for (const email of ["kvonly@example.com", "promounsub@example.com"]) {
    assert.equal(
      await suppression.check(deriveReviewSuppressionName(email, SECRET)),
      false,
    );
  }

  const first = await reconcileKvOptOuts(store, suppression, SECRET);
  assert.equal(first.found, 2);
  assert.equal(first.imported, 2);
  // Idempotent: a second pass finds the same set and changes nothing.
  const second = await reconcileKvOptOuts(store, suppression, SECRET);
  assert.equal(second.found, 2);

  const summary = await runReviewRequestTick(deps);
  assert.equal(summary.sent, 1);
  assert.equal(summary.suppressed, 2);
  assert.equal(sender.calls.length, 1);
  assert.equal(sender.calls[0].to, "clean@example.com");
  assert.equal(ledger.rows.get("cs_live_rec1").status, "suppressed");
  assert.equal(ledger.rows.get("cs_live_rec2").status, "suppressed");
  assert.equal(ledger.rows.get("cs_live_rec3").status, "sent");
});

/**
 * Wrap a fake store so that the FIRST read of `triggerKey` returns the
 * pre-acknowledgement value, and the opt-out acknowledgement lands
 * immediately after that read — in the real handlers' order (suppression
 * DO record first, KV row second). Every later read sees the landed state.
 */
function storeWithMidTickAck(base, { triggerKey, email, suppression }) {
  let landed = false;
  return {
    data: base.data,
    calls: base.calls,
    listKeys: (prefix, cursor) => base.listKeys(prefix, cursor),
    putJson: (key, value) => base.putJson(key, value),
    async getJson(key) {
      const value = await base.getJson(key);
      if (!landed && key === triggerKey) {
        landed = true;
        await suppression.record(
          deriveReviewSuppressionName(normalizePromotionEmail(email), SECRET),
          "opt_out_route",
        );
        await recordReviewOptOut(
          base,
          email,
          deriveReviewSuppressionName(normalizePromotionEmail(email), SECRET),
        );
      }
      return value;
    },
    ackLanded: () => landed,
  };
}

test("race: an opt-out acknowledged AFTER the tick's hint read still fences the send", async () => {
  const base = createFakeStore({
    [sessionKey("cs_live_race")]: digitalEntitlement({ customerEmail: "racer@example.com" }),
  });
  const ledger = createFakeLedger();
  const sender = createFakeSender();
  const { deps, suppression } = tickDeps(base, ledger, sender, enabledConfig());
  const store = storeWithMidTickAck(base, {
    triggerKey: reviewOptOutKey("racer@example.com"),
    email: "racer@example.com",
    suppression,
  });

  const summary = await runReviewRequestTick({ ...deps, store });
  // The ack really did land mid-tick (after the hint read, before dispatch)…
  assert.equal(store.ackLanded(), true);
  // …and the coordinator's authoritative check fenced the send anyway:
  // zero provider calls, and the row settles terminal `suppressed` —
  // never `uncertain` (no provider call was made, so nothing is ambiguous).
  assert.equal(sender.calls.length, 0);
  assert.equal(summary.sent, 0);
  assert.equal(ledger.rows.get("cs_live_race").status, "suppressed");
});

test("race: first tick after import — a NEW opt-out acknowledged concurrently still fences", async () => {
  const base = createFakeStore({
    [sessionKey("cs_live_imp")]: digitalEntitlement({ customerEmail: "imported@example.com" }),
    [sessionKey("cs_live_late")]: digitalEntitlement({ customerEmail: "lateoptout@example.com" }),
  });
  // Pre-existing KV-only opt-out (legacy raw-address row, seeded
  // directly), reconciled before the tick (the import).
  await base.putJson(reviewOptOutKey("imported@example.com"), {
    email: "imported@example.com",
    optedOutAt: NOW - DAY,
    source: "opt_out_page",
  });
  const ledger = createFakeLedger();
  const sender = createFakeSender();
  const { deps, suppression } = tickDeps(base, ledger, sender, enabledConfig());
  const imported = await reconcileKvOptOuts(base, suppression, SECRET);
  assert.equal(imported.found, 1);

  // During that first tick, a different recipient's opt-out is acknowledged
  // after the hint read — the combined state (import + live writers) holds.
  const store = storeWithMidTickAck(base, {
    triggerKey: reviewOptOutKey("lateoptout@example.com"),
    email: "lateoptout@example.com",
    suppression,
  });
  const summary = await runReviewRequestTick({ ...deps, store });
  assert.equal(store.ackLanded(), true);
  assert.equal(sender.calls.length, 0);
  assert.equal(summary.sent, 0);
  assert.equal(summary.suppressed, 2);
  assert.equal(ledger.rows.get("cs_live_imp").status, "suppressed");
  assert.equal(ledger.rows.get("cs_live_late").status, "suppressed");
});
