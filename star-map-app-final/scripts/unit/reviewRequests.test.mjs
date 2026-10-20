/**
 * reviewRequests.test.mjs — StarMapCo post-delivery review engine (T1).
 *
 * Pins:
 * - the pure ledger claim machine (claim/complete/abandon, stale reclaim,
 *   backoff ladder, quarantine, claim-token discipline);
 * - due evaluation for both branches at their exact window boundaries,
 *   the corrected digital predicate (print sessions are physical-only),
 *   gift exclusion, and the max-age rule (a late-enabled engine must never
 *   mail the back-catalogue);
 * - the tick end-to-end over fake store/ledger/sender: inert flag, pre-claim
 *   prerequisite gates that still report candidate counts, suppression at
 *   send time, one-ask-only, failure classification, budgets, scan cursors;
 * - the email builder (CASL throw, single Google destination, conditional
 *   physical copy) and the opt-out secret chain (Stripe secrets NEVER sign);
 * - the Resend wrapper extension (Idempotency-Key is an HTTP header,
 *   message headers land in the payload `headers` field, callers cannot
 *   override Authorization/Content-Type);
 * - wiring construction (cron trigger, DO binding, flag NOT in [vars],
 *   shippedAt persisted before the shipping email send).
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
  reviewSendBackoffMs,
  REVIEW_REQUEST_MAX_ATTEMPTS,
  REVIEW_REQUEST_SENDING_STALE_MS,
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
  buildReviewOptOutUrl,
  buildReviewRequestEmail,
  getReviewOptOutSecret,
  verifyReviewOptOutToken,
  GOOGLE_REVIEW_URL,
  REVIEW_REQUEST_SUBJECT,
} = await import("../../src/lib/reviewRequestEmail.ts");

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 19, 12, 0, 0); // 2026-10-19T12:00:00Z
const SECRET = "test-signing-secret-0123456789abcdef";
const ADDRESS = "StarMapCo, PO Box 123, Victoria BC";

// ---------------------------------------------------------------------------
// Pure ledger claim machine
// ---------------------------------------------------------------------------

function begin(state, claimId, now, extra = {}) {
  return applyReviewLedgerOp(state, {
    type: "begin_claim",
    claimId,
    kind: "digital",
    email: "buyer@example.com",
    anchorAt: now - 4 * DAY,
    dueAt: now - DAY,
    now,
    ...extra,
  });
}

test("ledger: begin on empty claims; fresh claim refuses a second claimant", () => {
  const empty = createEmptyReviewLedgerState("cs_live_a");
  const first = begin(empty, "claim-1", NOW);
  assert.equal(first.outcome, "claimed");
  assert.equal(first.state.status, "sending");
  assert.equal(first.state.attempts, 0);
  const second = begin(first.state, "claim-2", NOW + 60_000);
  assert.equal(second.outcome, "in_flight");
  assert.equal(second.changed, false);
});

test("ledger: begin on sent/failed is already_resolved (one ask only)", () => {
  const claimed = begin(createEmptyReviewLedgerState("cs_live_b"), "c1", NOW).state;
  const sent = applyReviewLedgerOp(claimed, {
    type: "complete_claim",
    claimId: "c1",
    providerId: "msg_1",
    now: NOW + 1000,
  }).state;
  assert.equal(sent.status, "sent");
  assert.equal(sent.providerId, "msg_1");
  assert.equal(begin(sent, "c2", NOW + DAY).outcome, "already_resolved");

  const failed = applyReviewLedgerOp(claimed, {
    type: "abandon_claim",
    claimId: "c1",
    error: "resend_http_422:bad",
    permanent: true,
    now: NOW + 1000,
  }).state;
  assert.equal(failed.status, "failed");
  assert.equal(begin(failed, "c2", NOW + DAY).outcome, "already_resolved");
});

test("ledger: stale claim is reclaimed, consumes an attempt, and backoffs", () => {
  const claimed = begin(createEmptyReviewLedgerState("cs_live_c"), "c1", NOW).state;
  const staleAt = NOW + REVIEW_REQUEST_SENDING_STALE_MS + 1;
  const result = begin(claimed, "c2", staleAt);
  assert.equal(result.outcome, "stale_reclaimed");
  assert.equal(result.state.status, "retry");
  assert.equal(result.state.attempts, 1);
  assert.equal(result.state.nextAttemptAt, staleAt + reviewSendBackoffMs(1));
  assert.equal(result.state.claimId, null);
});

test("ledger: stale reclaim at the attempt cap quarantines to failed", () => {
  let state = begin(createEmptyReviewLedgerState("cs_live_d"), "c1", NOW).state;
  state = { ...state, attempts: REVIEW_REQUEST_MAX_ATTEMPTS - 1 };
  const result = begin(state, "c2", NOW + REVIEW_REQUEST_SENDING_STALE_MS + 1);
  assert.equal(result.outcome, "already_resolved");
  assert.equal(result.state.status, "failed");
  assert.equal(result.state.attempts, REVIEW_REQUEST_MAX_ATTEMPTS);
});

test("ledger: retry claims only when due; backoff ladder is 1h/6h/24h", () => {
  assert.equal(reviewSendBackoffMs(1), 60 * 60 * 1000);
  assert.equal(reviewSendBackoffMs(2), 6 * 60 * 60 * 1000);
  assert.equal(reviewSendBackoffMs(3), 24 * 60 * 60 * 1000);
  const claimed = begin(createEmptyReviewLedgerState("cs_live_e"), "c1", NOW).state;
  const abandoned = applyReviewLedgerOp(claimed, {
    type: "abandon_claim",
    claimId: "c1",
    error: "resend_http_500:boom",
    permanent: false,
    now: NOW,
  });
  assert.equal(abandoned.outcome, "retry_scheduled");
  assert.equal(abandoned.state.nextAttemptAt, NOW + 60 * 60 * 1000);
  assert.equal(begin(abandoned.state, "c2", NOW + 30 * 60 * 1000).outcome, "backoff");
  const reclaimed = begin(abandoned.state, "c2", NOW + 60 * 60 * 1000);
  assert.equal(reclaimed.outcome, "claimed");
  assert.equal(reclaimed.state.attempts, 1); // attempts preserved across re-claim
});

test("ledger: permanent abandon quarantines immediately; 5th transient failure quarantines", () => {
  const claimed = begin(createEmptyReviewLedgerState("cs_live_f"), "c1", NOW).state;
  const permanent = applyReviewLedgerOp(claimed, {
    type: "abandon_claim",
    claimId: "c1",
    error: "resend_http_422:invalid recipient",
    permanent: true,
    now: NOW,
  });
  assert.equal(permanent.outcome, "quarantined");
  assert.equal(permanent.state.status, "failed");
  assert.equal(permanent.state.attempts, 1);

  const almostOut = { ...claimed, attempts: REVIEW_REQUEST_MAX_ATTEMPTS - 1 };
  const fifth = applyReviewLedgerOp(almostOut, {
    type: "abandon_claim",
    claimId: "c1",
    error: "resend_http_503:down",
    permanent: false,
    now: NOW,
  });
  assert.equal(fifth.outcome, "quarantined");
  assert.equal(fifth.state.attempts, REVIEW_REQUEST_MAX_ATTEMPTS);
});

test("ledger: claim-token discipline — a displaced claimant can neither complete nor abandon", () => {
  const claimedA = begin(createEmptyReviewLedgerState("cs_live_g"), "claim-A", NOW).state;
  // A goes stale; the reclaim consumes the attempt and clears A's token.
  const reclaimed = begin(claimedA, "claim-B", NOW + REVIEW_REQUEST_SENDING_STALE_MS + 1).state;
  assert.equal(reclaimed.status, "retry");
  const claimedC = begin(reclaimed, "claim-C", reclaimed.nextAttemptAt).state;
  assert.equal(claimedC.claimId, "claim-C");
  const completeByA = applyReviewLedgerOp(claimedC, {
    type: "complete_claim",
    claimId: "claim-A",
    providerId: "msg_late",
    now: NOW + DAY,
  });
  assert.equal(completeByA.outcome, "not_claim_owner");
  assert.equal(completeByA.state.status, "sending");
  const abandonByA = applyReviewLedgerOp(claimedC, {
    type: "abandon_claim",
    claimId: "claim-A",
    error: "late failure",
    permanent: false,
    now: NOW + DAY,
  });
  assert.equal(abandonByA.outcome, "not_claim_owner");
  const completeByC = applyReviewLedgerOp(claimedC, {
    type: "complete_claim",
    claimId: "claim-C",
    providerId: "msg_c",
    now: NOW + DAY,
  });
  assert.equal(completeByC.outcome, "completed");
  // complete/abandon on an empty row are no-ops, not errors.
  const empty = createEmptyReviewLedgerState("cs_live_none");
  assert.equal(
    applyReviewLedgerOp(empty, { type: "complete_claim", claimId: "x", providerId: "y", now: NOW })
      .outcome,
    "no_row",
  );
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

test("eval digital: exclusions — unpaid, revoked, gift, no email, bad anchors", () => {
  assert.equal(classifyDigitalEntitlement(null, NOW).reason, "missing_record");
  assert.equal(classifyDigitalEntitlement(digitalEntitlement({ paid: false }), NOW).reason, "not_paid");
  assert.equal(classifyDigitalEntitlement(digitalEntitlement({ revoked: true }), NOW).reason, "revoked");
  assert.equal(classifyDigitalEntitlement(digitalEntitlement({ isGift: true }), NOW).reason, "gift_order");
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
  // Legacy records without orderType stay digital.
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

test("eval physical: exclusions — disabled branch, failed status, gift, not shipped", () => {
  assert.equal(classifyPrintRecord(printRecord(), NOW, false).reason, "physical_disabled");
  assert.equal(classifyPrintRecord(printRecord({ status: "failed" }), NOW, true).reason, "terminal_failed");
  assert.equal(classifyPrintRecord(printRecord({ isGift: true }), NOW, true).reason, "gift_order");
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
// Tick integration (fake store / ledger / sender)
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

function enabledConfig(overrides = {}) {
  return {
    enabled: true,
    physicalEnabled: false,
    mailingAddress: ADDRESS,
    signingSecret: SECRET,
    siteUrl: "https://starmapco.com",
    supportEmail: "support@starmapco.com",
    resendConfigured: true,
    ...overrides,
  };
}

function tickDeps(store, ledger, sender, config, now = NOW) {
  let counter = 0;
  return {
    store,
    ledger,
    sender,
    send: sender.send,
    config,
    now: () => now,
    createClaimId: () => `claim-${(counter += 1)}`,
    log: () => {},
  };
}

const sessionKey = (id) => `stripe:session:${id}`;

test("tick: flag off is fully inert — no scan, no send, no writes", async () => {
  const store = createFakeStore({ [sessionKey("cs_live_off")]: digitalEntitlement() });
  const ledger = createFakeLedger();
  const sender = createFakeSender();
  const summary = await runReviewRequestTick(
    tickDeps(store, ledger, sender, enabledConfig({ enabled: false })),
  );
  assert.equal(summary.status, "disabled");
  assert.equal(store.calls.list, 0);
  assert.equal(sender.calls.length, 0);
  assert.equal(ledger.rows.size, 0);
});

test("tick: missing mailing address blocks pre-claim but still reports due counts", async () => {
  const store = createFakeStore({ [sessionKey("cs_live_gate")]: digitalEntitlement() });
  const ledger = createFakeLedger();
  const sender = createFakeSender();
  const summary = await runReviewRequestTick(
    tickDeps(store, ledger, sender, enabledConfig({ mailingAddress: "" })),
  );
  assert.equal(summary.status, "blocked");
  assert.equal(summary.blockedReason, "mailing_address_missing");
  assert.equal(summary.due, 1);
  assert.equal(sender.calls.length, 0);
  assert.equal(ledger.rows.size, 0); // nothing claimed while blocked

  const noSecret = await runReviewRequestTick(
    tickDeps(store, ledger, sender, enabledConfig({ signingSecret: null })),
  );
  assert.equal(noSecret.blockedReason, "signing_secret_missing");
  const noResend = await runReviewRequestTick(
    tickDeps(store, ledger, sender, enabledConfig({ resendConfigured: false })),
  );
  assert.equal(noResend.blockedReason, "resend_not_configured");
  assert.equal(sender.calls.length, 0);
  assert.equal(ledger.rows.size, 0);
});

test("tick: happy path — digital send claims, sends once, completes with provider id", async () => {
  const store = createFakeStore({ [sessionKey("cs_live_happy")]: digitalEntitlement() });
  const ledger = createFakeLedger();
  const sender = createFakeSender({ ok: true, id: "msg_42" });
  const summary = await runReviewRequestTick(tickDeps(store, ledger, sender, enabledConfig()));
  assert.equal(summary.sent, 1);
  assert.equal(sender.calls.length, 1);
  const sent = sender.calls[0];
  assert.equal(sent.to, "buyer@example.com");
  assert.equal(sent.subject, REVIEW_REQUEST_SUBJECT);
  assert.equal(sent.idempotencyKey, "review-request:cs_live_happy");
  assert.match(sent.headers["List-Unsubscribe"], /\/api\/reviews\/opt-out\?e=/);
  assert.equal(sent.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.ok(sent.html.includes(GOOGLE_REVIEW_URL));
  const row = ledger.rows.get("cs_live_happy");
  assert.equal(row.status, "sent");
  assert.equal(row.providerId, "msg_42");

  // Second tick: one-ask-only — nothing more is sent, ever.
  const again = await runReviewRequestTick(tickDeps(store, ledger, sender, enabledConfig()));
  assert.equal(again.sent, 0);
  assert.equal(again.alreadyResolved, 1);
  assert.equal(sender.calls.length, 1);
});

test("tick: max-age rule — the back-catalogue is never mailed", async () => {
  const ancient = digitalEntitlement({ created: Math.floor((NOW - 90 * DAY) / 1000) });
  const store = createFakeStore({ [sessionKey("cs_live_old")]: ancient });
  const ledger = createFakeLedger();
  const sender = createFakeSender();
  const summary = await runReviewRequestTick(tickDeps(store, ledger, sender, enabledConfig()));
  assert.equal(summary.sent, 0);
  assert.equal(summary.skips.past_max_age, 1);
  assert.equal(sender.calls.length, 0);
  assert.equal(ledger.rows.size, 0);
});

test("tick: gift orders are excluded; print+add-on is asked once, physically", async () => {
  const store = createFakeStore({
    [sessionKey("cs_live_gift")]: digitalEntitlement({ isGift: true }),
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
    tickDeps(store, ledger, sender, enabledConfig({ physicalEnabled: true })),
  );
  assert.equal(summary.skips.gift_order, 1);
  assert.equal(summary.sent, 1);
  assert.equal(sender.calls.length, 1);
  assert.equal(sender.calls[0].tags.kind, "physical");
  assert.ok(sender.calls[0].html.includes("Once it arrives"));
});

test("tick: physical branch stays silent while its separate gate is off", async () => {
  const store = createFakeStore({
    "print:order:cs_live_phys": printRecord({ sessionId: "cs_live_phys" }),
  });
  const ledger = createFakeLedger();
  const sender = createFakeSender();
  const summary = await runReviewRequestTick(tickDeps(store, ledger, sender, enabledConfig()));
  assert.equal(summary.sent, 0);
  assert.equal(summary.skips.physical_disabled, 1);
  assert.equal(sender.calls.length, 0);
});

test("tick: suppression at send time — review opt-out and promotions unsubscribe", async () => {
  const store = createFakeStore({
    [sessionKey("cs_live_sup1")]: digitalEntitlement({ customerEmail: "Opted@Example.com" }),
    [sessionKey("cs_live_sup2")]: digitalEntitlement({ customerEmail: "promo@example.com" }),
  });
  // Opt-out recorded with different casing than the order's email.
  await recordReviewOptOut(store, "opted@example.com", NOW, "test");
  // Promotions unsubscribe state, keyed the promotions system's way.
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
  const summary = await runReviewRequestTick(tickDeps(store, ledger, sender, enabledConfig()));
  assert.equal(summary.suppressed, 2);
  assert.equal(summary.sent, 0);
  assert.equal(sender.calls.length, 0);
  assert.equal(ledger.rows.size, 0); // suppressed before any claim is written
});

test("tick: transient failure backs off and retries next window; permanent failure quarantines", async () => {
  const store = createFakeStore({ [sessionKey("cs_live_retry")]: digitalEntitlement() });
  const ledger = createFakeLedger();
  const sender = createFakeSender((input, n) =>
    n === 1 ? { ok: false, error: "resend_http_500:boom" } : { ok: true, id: "msg_late" },
  );
  const first = await runReviewRequestTick(tickDeps(store, ledger, sender, enabledConfig(), NOW));
  assert.equal(first.sendFailed, 1);
  const row = ledger.rows.get("cs_live_retry");
  assert.equal(row.status, "retry");
  assert.equal(row.nextAttemptAt, NOW + 60 * 60 * 1000);

  const tooSoon = await runReviewRequestTick(tickDeps(store, ledger, sender, enabledConfig(), NOW + 30 * 60 * 1000));
  assert.equal(tooSoon.sent, 0);
  assert.equal(tooSoon.inFlightOrBackoff, 1);
  assert.equal(sender.calls.length, 1);

  const retried = await runReviewRequestTick(
    tickDeps(store, ledger, sender, enabledConfig(), NOW + 60 * 60 * 1000),
  );
  assert.equal(retried.sent, 1);
  assert.equal(sender.calls.length, 2);
  // Idempotency key is stable across retries of the same logical send.
  assert.equal(sender.calls[0].idempotencyKey, sender.calls[1].idempotencyKey);

  const store2 = createFakeStore({ [sessionKey("cs_live_perm")]: digitalEntitlement() });
  const ledger2 = createFakeLedger();
  const sender2 = createFakeSender({ ok: false, error: "resend_http_422:invalid recipient" });
  const permSummary = await runReviewRequestTick(
    tickDeps(store2, ledger2, sender2, enabledConfig(), NOW),
  );
  assert.equal(permSummary.sendFailed, 1);
  assert.equal(ledger2.rows.get("cs_live_perm").status, "failed");
  const after = await runReviewRequestTick(
    tickDeps(store2, ledger2, sender2, enabledConfig(), NOW + DAY),
  );
  assert.equal(after.alreadyResolved, 1);
  assert.equal(sender2.calls.length, 1);
});

test("tick: ambiguous failure leaves the claim in sending without consuming an attempt", async () => {
  const store = createFakeStore({ [sessionKey("cs_live_amb")]: digitalEntitlement() });
  const ledger = createFakeLedger();
  const sender = createFakeSender({ ok: false, error: "resend_fetch_failed:socket hangup" });
  const summary = await runReviewRequestTick(tickDeps(store, ledger, sender, enabledConfig(), NOW));
  assert.equal(summary.deferred, 1);
  assert.equal(summary.sent, 0);
  const row = ledger.rows.get("cs_live_amb");
  assert.equal(row.status, "sending");
  assert.equal(row.attempts, 0);

  // Provider accepted but returned no id: also ambiguous, never marked sent.
  const store2 = createFakeStore({ [sessionKey("cs_live_noid")]: digitalEntitlement() });
  const ledger2 = createFakeLedger();
  const sender2 = createFakeSender({ ok: true, id: null });
  const summary2 = await runReviewRequestTick(tickDeps(store2, ledger2, sender2, enabledConfig(), NOW));
  assert.equal(summary2.deferred, 1);
  assert.equal(ledger2.rows.get("cs_live_noid").status, "sending");
});

test("tick: per-tick send budget caps at 50 and the remainder goes next tick", async () => {
  const initial = {};
  for (let i = 0; i < REVIEW_MAX_SENDS_PER_TICK + 10; i += 1) {
    initial[sessionKey(`cs_live_bulk_${i}`)] = digitalEntitlement();
  }
  const store = createFakeStore(initial);
  const ledger = createFakeLedger();
  const sender = createFakeSender();
  const first = await runReviewRequestTick(tickDeps(store, ledger, sender, enabledConfig(), NOW));
  assert.equal(first.sent, REVIEW_MAX_SENDS_PER_TICK);
  const second = await runReviewRequestTick(tickDeps(store, ledger, sender, enabledConfig(), NOW));
  assert.equal(second.sent, 10);
  assert.equal(sender.calls.length, REVIEW_MAX_SENDS_PER_TICK + 10);
  const recipients = new Set(sender.calls.map((c) => c.idempotencyKey));
  assert.equal(recipients.size, REVIEW_MAX_SENDS_PER_TICK + 10);
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
  const first = await runReviewRequestTick(tickDeps(store, ledger, sender, enabledConfig(), NOW));
  assert.equal(first.scannedDigital, 20); // 10 pages x 2 — the page budget
  assert.deepEqual(store.data.get("review:scan:digital"), { cursor: "20" });
  const second = await runReviewRequestTick(tickDeps(store, ledger, sender, enabledConfig(), NOW));
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

// ---------------------------------------------------------------------------
// Wiring construction pins
// ---------------------------------------------------------------------------

const appRoot = new URL("../../", import.meta.url);

test("wiring: cron trigger + ledger DO exist; the enable flag is NOT a [vars] binding", () => {
  const wrangler = readFileSync(new URL("wrangler.toml", appRoot), "utf8");
  assert.match(wrangler, /\[triggers\]\s*\ncrons = \["\*\/15 \* \* \* \*"\]/);
  assert.match(wrangler, /name = "REVIEW_REQUEST_LEDGER"/);
  assert.match(wrangler, /tag = "v2-review-request-ledger"/);
  const varsBlock = wrangler.slice(wrangler.indexOf("[vars]"), wrangler.indexOf("[[services]]"));
  assert.ok(!varsBlock.includes("REVIEW_REQUESTS_ENABLED"), "flag must ship unset");
  assert.ok(!varsBlock.includes("REVIEW_REQUEST_MAILING_ADDRESS"), "address is owner-supplied config");

  const worker = readFileSync(new URL("cloudflare-worker.ts", appRoot), "utf8");
  assert.match(worker, /scheduled/);
  assert.match(worker, /ReviewRequestLedgerDO/);
});

test("wiring: shippedAt is persisted before the shipping email send", () => {
  const source = readFileSync(new URL("src/lib/shippingNotifications.ts", appRoot), "utf8");
  const anchorWrite = source.indexOf("persistPrintOrderRecord(sessionId, anchored)");
  const send = source.indexOf("await sendResendEmail({");
  assert.ok(anchorWrite !== -1, "shippedAt anchor write must exist");
  assert.ok(send !== -1);
  assert.ok(anchorWrite < send, "shipment fact must persist before the email is attempted");
});
