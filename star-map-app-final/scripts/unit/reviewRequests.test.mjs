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
  isReviewSuppressed,
  normalizeAnchorMs,
  recordReviewOptOut,
  resolveReviewEngineConfig,
  runReviewRequestTick,
  REVIEW_DIGITAL_DELAY_MS,
  REVIEW_DIGITAL_MAX_AGE_MS,
  REVIEW_PHYSICAL_DELAY_MS,
  REVIEW_PHYSICAL_MAX_AGE_MS,
  REVIEW_MAX_SENDS_PER_TICK,
} = await import("../../src/lib/reviewRequests.ts");
const {
  createInMemoryReviewSuppressionClient,
  createReviewSuppressionClient,
  deriveReviewSuppressionName,
  executeReviewDispatch,
} = await import("../../src/lib/reviewRequestSuppression.ts");
const { createReviewLedgerClient, __resetReviewLedgerMemoryForTests } = await import(
  "../../src/lib/reviewRequestLedger.ts"
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

test("coordinator: suppression is the final gate — checked inside dispatch, send never fires", async () => {
  const ledger = createFakeLedger();
  await claimedRow(ledger, "cs_live_csup");
  const sender = createFakeSender();
  const outcome = await executeReviewDispatch(
    { sessionId: "cs_live_csup", claimId: "claim-1" },
    { ledger, isSuppressed: async () => true, send: sender.send, now: () => NOW },
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
    { ledger, isSuppressed: async () => suppressed, send: sender.send, now: () => NOW },
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
      send: sender.send,
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
    { ledger, isSuppressed: async () => null, send: sender.send, now: () => NOW },
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
    { ledger, isSuppressed: async () => false, send: sender.send, now: () => NOW },
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
    { ledger, isSuppressed: async () => false, send: sender.send, now: () => NOW + 14 * DAY },
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
    { ledger, isSuppressed: async () => false, send: sender.send, now: driftingNow },
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
    { ledger: ledger2, isSuppressed: async () => false, send: sender2.send, now: () => 9999 },
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
      { ledger, isSuppressed: async () => false, send: sender.send, now: () => NOW, ...extra },
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
    { ledger, isSuppressed: async () => false, send: transient.send, now: () => NOW },
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
    { ledger: ledger2, isSuppressed: async () => false, send: permanent.send, now: () => NOW },
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
    { ledger, isSuppressed: async () => false, send: sender.send, now: () => NOW },
  );
  assert.equal(outcome.outcome, "not_dispatchable");
  assert.equal(sender.calls.length, 0);
  assert.equal(ledger.rows.get("cs_live_cfence").status, "claimed");
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
  const calls = { list: 0, get: 0, put: 0 };
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
  await recordReviewOptOut(store, "opted@example.com", NOW, "test");
  store.data.set(`promotions:email:${encodeURIComponent("promo@example.com")}`, {
    subscribedAt: NOW - 30 * DAY,
    unsubscribedAt: NOW - DAY,
    updatedAt: NOW - DAY,
  });
  assert.equal(await isReviewSuppressed(store, "OPTED@example.com"), true);
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

test("wiring: promotions unsubscribe establishes the AUTHORITATIVE suppression record before any acknowledgement", () => {
  const page = readFileSync(new URL("src/app/unsubscribe/page.tsx", appRoot), "utf8");
  const recordCall = page.indexOf("createReviewSuppressionClient().record(");
  const kvWrite = page.indexOf("await kv.set");
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
  const kvWrite = page.indexOf("await kv.set");
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
