import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyCheckoutRecoveryAlertToSessionFields,
  buildCheckoutRecoveryAttemptRecord,
  buildCheckoutRecoveryResendIdempotencyKey,
  buildResendRecoveryRequestHeaders,
  buildSendgridRecoveryRequestHeaders,
  checkoutRecoveryEmailAttemptKey,
  checkoutRecoveryEmailDeliveredKey,
  checkoutRecoveryEmailLegacyPreSendKey,
  classifyCheckoutRecoveryHttpResult,
  getIncludesBullets,
  getOfferLabel,
  getSubject,
  isCheckoutRecoveryWebhookRetryable,
  listCheckoutRecoveryAttemptRecords,
  naiveMathMaxAttemptMerge,
  naiveOverwriteConfirmedDeliveryWithFailure,
  naiveMarkerOnlyStaleRepair,
  naiveStaleEarlySessionWrite,
  SENDGRID_RECOVERY_CONCURRENCY_GUARANTEE,
  simulateExpiredCheckoutRecoveryPass,
} from "./checkoutRecoveryAlerts.harness.mjs";

const unitDir = path.dirname(fileURLToPath(import.meta.url));
const recoveryAlertsSource = fs.readFileSync(
  path.join(unitDir, "../../src/lib/checkoutRecoveryAlerts.ts"),
  "utf8"
);
const webhookSource = fs.readFileSync(
  path.join(unitDir, "../../src/app/api/stripe/webhook/route.ts"),
  "utf8"
);

// ── getSubject ────────────────────────────────────────────────────────────────

test("subject: framed print includes urgency and 'saved'", () => {
  const subject = getSubject({ orderType: "print", printVariant: "poster_framed" });
  assert.ok(subject.includes("framed"), `subject should say framed: ${subject}`);
  assert.ok(subject.includes("saved"), `subject should say saved: ${subject}`);
});

test("subject: unframed print says saved", () => {
  const subject = getSubject({ orderType: "print", printVariant: "poster_unframed" });
  assert.ok(subject.includes("saved"), `subject should say saved: ${subject}`);
  assert.ok(!subject.includes("framed"), `unframed subject should not say framed: ${subject}`);
});

test("subject: digital HD download", () => {
  const subject = getSubject({ orderType: "digital", plan: "single" });
  assert.ok(subject.includes("download") || subject.includes("waiting"), `digital subject: ${subject}`);
});

test("subject: subscription says subscription", () => {
  const subject = getSubject({ orderType: "digital", plan: "subscription" });
  assert.ok(subject.includes("subscription"), `subscription subject: ${subject}`);
});

test("subject: unknown print variant falls back gracefully", () => {
  const subject = getSubject({ orderType: "print", printVariant: null });
  assert.ok(subject.includes("saved"), `null variant subject: ${subject}`);
  assert.ok(subject.length > 10);
});

// ── getOfferLabel ─────────────────────────────────────────────────────────────

test("offerLabel: framed without addon", () => {
  const label = getOfferLabel({
    orderType: "print",
    printVariant: "poster_framed",
    includesDigitalAddOn: false,
  });
  assert.equal(label, "framed print");
});

test("offerLabel: framed with HD addon", () => {
  const label = getOfferLabel({
    orderType: "print",
    printVariant: "poster_framed",
    includesDigitalAddOn: true,
  });
  assert.equal(label, "framed print + HD download");
});

test("offerLabel: digital single", () => {
  const label = getOfferLabel({ orderType: "digital", plan: "single" });
  assert.equal(label, "HD download");
});

test("offerLabel: pack3", () => {
  const label = getOfferLabel({ orderType: "digital", plan: "pack3" });
  assert.equal(label, "3 HD export credits");
});

// ── getIncludesBullets ────────────────────────────────────────────────────────

test("includesBullets: digital order returns empty array", () => {
  const bullets = getIncludesBullets({ orderType: "digital", plan: "single" });
  assert.deepEqual(bullets, []);
});

test("includesBullets: framed print without addon has 2 bullets", () => {
  const bullets = getIncludesBullets({
    orderType: "print",
    printVariant: "poster_framed",
    includesDigitalAddOn: false,
  });
  assert.equal(bullets.length, 2);
  assert.ok(bullets[0].toLowerCase().includes("framed"), `first bullet: ${bullets[0]}`);
  assert.ok(bullets[1].includes("saved"), `last bullet mentions saved: ${bullets[1]}`);
});

test("includesBullets: framed print with HD addon has 3 bullets", () => {
  const bullets = getIncludesBullets({
    orderType: "print",
    printVariant: "poster_framed",
    includesDigitalAddOn: true,
  });
  assert.equal(bullets.length, 3);
  assert.ok(bullets[1].toLowerCase().includes("hd"), `second bullet mentions HD: ${bullets[1]}`);
  assert.ok(bullets[1].includes("instantly"), `HD bullet mentions instant unlock: ${bullets[1]}`);
});

test("includesBullets: always ends with 'saved' reminder", () => {
  for (const variant of ["poster_framed", "poster_unframed", "canvas_wrap"]) {
    const bullets = getIncludesBullets({
      orderType: "print",
      printVariant: variant,
      includesDigitalAddOn: false,
    });
    assert.ok(bullets.at(-1)?.includes("saved"), `last bullet for ${variant}: ${bullets.at(-1)}`);
  }
});

// ── Idempotency key ───────────────────────────────────────────────────────────

test("idempotency: same checkout produces the same opaque Resend key", () => {
  const a = buildCheckoutRecoveryResendIdempotencyKey("cs_test_checkout_alpha");
  const b = buildCheckoutRecoveryResendIdempotencyKey("cs_test_checkout_alpha");
  assert.equal(a, b);
  assert.match(a, /^cre_[a-f0-9]{48}$/);
  assert.equal(a.includes("cs_test_checkout_alpha"), false);
  assert.equal(a.includes("cs_test"), false);
});

test("idempotency: different checkouts produce different keys", () => {
  const a = buildCheckoutRecoveryResendIdempotencyKey("cs_test_checkout_alpha");
  const b = buildCheckoutRecoveryResendIdempotencyKey("cs_test_checkout_beta");
  assert.notEqual(a, b);
});

test("idempotency: concurrent logical attempts share the same provider key", () => {
  const sessionId = "cs_test_concurrent_logical";
  const keys = Array.from({ length: 5 }, () => buildCheckoutRecoveryResendIdempotencyKey(sessionId));
  assert.equal(new Set(keys).size, 1);
});

// ── Provider classification ───────────────────────────────────────────────────

test("classify: Resend 2xx is delivered", () => {
  const result = classifyCheckoutRecoveryHttpResult("resend", 200);
  assert.equal(result.delivered, true);
  assert.equal(result.retryability, "delivered");
  assert.equal(result.errorCode, undefined);
});

test("classify: Resend concurrent_idempotent_requests is retryable and never delivered", () => {
  const result = classifyCheckoutRecoveryHttpResult(
    "resend",
    409,
    '{"name":"concurrent_idempotent_requests","message":"in progress secret"}'
  );
  assert.equal(result.delivered, false);
  assert.equal(result.retryability, "retryable");
  assert.equal(result.errorCode, "concurrent_idempotent_requests");
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.equal(JSON.stringify(result).includes("in progress"), false);
});

test("classify: Resend invalid_idempotent_request is terminal", () => {
  const result = classifyCheckoutRecoveryHttpResult(
    "resend",
    409,
    '{"name":"invalid_idempotent_request","message":"payload mismatch for cs_live_x"}'
  );
  assert.equal(result.delivered, false);
  assert.equal(result.retryability, "terminal");
  assert.equal(result.errorCode, "invalid_idempotent_request");
  assert.equal(JSON.stringify(result).includes("cs_live_x"), false);
  assert.equal(JSON.stringify(result).includes("payload mismatch"), false);
});

test("classify: unknown/malformed Resend 409 is terminal provider_conflict", () => {
  const unknown = classifyCheckoutRecoveryHttpResult(
    "resend",
    409,
    '{"name":"some_other_conflict","detail":"raw body cs_live_y"}'
  );
  assert.equal(unknown.retryability, "terminal");
  assert.equal(unknown.errorCode, "provider_conflict");
  assert.equal(JSON.stringify(unknown).includes("cs_live_y"), false);
  assert.equal(JSON.stringify(unknown).includes("some_other_conflict"), false);

  const malformed = classifyCheckoutRecoveryHttpResult("resend", 409, "not-json <<<cs_live_z>>>");
  assert.equal(malformed.retryability, "terminal");
  assert.equal(malformed.errorCode, "provider_conflict");
  assert.equal(JSON.stringify(malformed).includes("cs_live_z"), false);

  const empty = classifyCheckoutRecoveryHttpResult("resend", 409);
  assert.equal(empty.retryability, "terminal");
  assert.equal(empty.errorCode, "provider_conflict");
});

test("negative control: generic status===409 must not be automatically retryable", () => {
  const bare409 = classifyCheckoutRecoveryHttpResult("resend", 409, '{"ok":true}');
  assert.notEqual(bare409.retryability, "retryable");
  assert.equal(bare409.retryability, "terminal");
  // Substring presence of concurrent_* in unrelated text must not force retryable.
  const decoy = classifyCheckoutRecoveryHttpResult(
    "resend",
    409,
    '{"message":"mentions concurrent_idempotent_requests but wrong shape"}'
  );
  assert.equal(decoy.retryability, "terminal");
  assert.equal(decoy.errorCode, "provider_conflict");
});

test("classify: Resend 5xx / 429 are retryable with sanitized codes", () => {
  const server = classifyCheckoutRecoveryHttpResult("resend", 503, "upstream exploded secret-body");
  assert.equal(server.retryability, "retryable");
  assert.equal(server.errorCode, "provider_server_error");
  assert.equal(JSON.stringify(server).includes("secret-body"), false);

  const limited = classifyCheckoutRecoveryHttpResult("resend", 429);
  assert.equal(limited.retryability, "retryable");
  assert.equal(limited.errorCode, "provider_rate_limited");
});

test("classify: Resend auth/validation responses are terminal", () => {
  const auth = classifyCheckoutRecoveryHttpResult("resend", 401, "unauthorized raw");
  assert.equal(auth.retryability, "terminal");
  assert.equal(auth.errorCode, "provider_auth_error");
  assert.equal(JSON.stringify(auth).includes("unauthorized"), false);

  const validation = classifyCheckoutRecoveryHttpResult("resend", 422);
  assert.equal(validation.retryability, "terminal");
  assert.equal(validation.errorCode, "provider_validation_error");
});

test("classify: SendGrid success/failure taxonomy remains truthful without idempotency claim", () => {
  assert.equal(SENDGRID_RECOVERY_CONCURRENCY_GUARANTEE, "best_effort_no_provider_idempotency");
  const ok = classifyCheckoutRecoveryHttpResult("sendgrid", 202);
  assert.equal(ok.delivered, true);
  const fail = classifyCheckoutRecoveryHttpResult("sendgrid", 500);
  assert.equal(fail.retryability, "retryable");
  assert.equal(fail.errorCode, "provider_server_error");
});

test("webhook retryable helper: only retryable outcomes request Stripe redelivery", () => {
  assert.equal(isCheckoutRecoveryWebhookRetryable("retryable"), true);
  assert.equal(isCheckoutRecoveryWebhookRetryable("delivered"), false);
  assert.equal(isCheckoutRecoveryWebhookRetryable("terminal"), false);
  assert.equal(isCheckoutRecoveryWebhookRetryable("not_configured"), false);
  assert.equal(isCheckoutRecoveryWebhookRetryable("already_delivered"), false);
  assert.equal(isCheckoutRecoveryWebhookRetryable("skipped"), false);
});

test("attempt records: failure metadata is category-only and stays off the session", () => {
  const record = buildCheckoutRecoveryAttemptRecord({
    attemptId: "att_test_1",
    result: {
      delivered: false,
      provider: "resend",
      retryability: "retryable",
      errorCode: "provider_server_error",
      status: 503,
    },
    eventId: "evt_test",
    now: 42,
  });
  assert.equal(record.delivered, false);
  assert.equal(record.errorCode, "provider_server_error");
  assert.equal(record.status, 503);
  assert.equal(record.at, 42);
  assert.equal(JSON.stringify(record).includes("buyer@"), false);
});

// ── Delivery state + webhook retry orchestration ──────────────────────────────

test("delivery: retryable first failure writes attempt record, no delivered marker, retryable webhook", async () => {
  const store = new Map();
  const first = await simulateExpiredCheckoutRecoveryPass({
    store,
    sessionId: "cs_test_retry_flow",
    eventId: "evt_retry_1",
    attemptId: "att_retry_1",
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    send: async () => classifyCheckoutRecoveryHttpResult("resend", 503),
  });

  assert.equal(first.httpStatus, 503);
  assert.equal(first.providerCalls, 1);
  assert.equal(first.deliveredMarker, null);
  assert.equal(first.session, null);
  assert.equal(first.wrotePreSendSession, false);
  assert.equal(first.attemptRecord.errorCode, "provider_server_error");
  assert.equal(first.attemptRecord.delivered, false);
  assert.equal(first.eventFinalized, false);
  assert.equal(first.legacyPreSendLock, null);
  assert.equal(store.has(checkoutRecoveryEmailAttemptKey("cs_test_retry_flow", "att_retry_1")), true);
});

test("delivery: later success writes exactly one delivered marker and durable sent record", async () => {
  const store = new Map();
  await simulateExpiredCheckoutRecoveryPass({
    store,
    sessionId: "cs_test_retry_flow",
    eventId: "evt_retry_1",
    attemptId: "att_retry_fail",
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    existingSession: store.get("stripe:session:cs_test_retry_flow") ?? undefined,
    send: async () => classifyCheckoutRecoveryHttpResult("resend", 503),
  });

  const second = await simulateExpiredCheckoutRecoveryPass({
    store,
    sessionId: "cs_test_retry_flow",
    eventId: "evt_retry_1",
    attemptId: "att_retry_ok",
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    existingSession: store.get("stripe:session:cs_test_retry_flow"),
    send: async () => classifyCheckoutRecoveryHttpResult("resend", 200),
  });

  assert.equal(second.httpStatus, 200);
  assert.equal(second.providerCalls, 1);
  assert.equal(isCheckoutRecoveryDeliveredMarkerShape(second.deliveredMarker), true);
  assert.equal(typeof second.session.recoveryEmailSentAt, "number");
  assert.equal(second.session.recoveryEmailErrorCode, undefined);
  assert.equal(second.attemptRecord.delivered, true);
  assert.equal(second.eventFinalized, true);

  const deliveredKeys = [...store.keys()].filter((k) => k.includes("email_delivered"));
  assert.equal(deliveredKeys.length, 1);
  assert.equal(deliveredKeys[0], checkoutRecoveryEmailDeliveredKey("cs_test_retry_flow"));
  assert.equal(listCheckoutRecoveryAttemptRecords(store, "cs_test_retry_flow").length, 2);
});

test("delivery: duplicate event after success performs zero additional provider sends", async () => {
  const store = new Map();
  const success = await simulateExpiredCheckoutRecoveryPass({
    store,
    sessionId: "cs_test_dup_after_success",
    eventId: "evt_dup_1",
    attemptId: "att_dup_ok",
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    send: async () => classifyCheckoutRecoveryHttpResult("resend", 200),
  });
  assert.equal(success.providerCalls, 1);

  const duplicate = await simulateExpiredCheckoutRecoveryPass({
    store,
    sessionId: "cs_test_dup_after_success",
    eventId: "evt_dup_1",
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    existingSession: store.get("stripe:session:cs_test_dup_after_success"),
    send: async () => {
      throw new Error("provider must not be called");
    },
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.providerCalls, 0);
  assert.equal(duplicate.httpStatus, 200);

  const redelivery = await simulateExpiredCheckoutRecoveryPass({
    store,
    sessionId: "cs_test_dup_after_success",
    eventId: "evt_dup_2",
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    existingSession: store.get("stripe:session:cs_test_dup_after_success"),
    send: async () => {
      throw new Error("provider must not be called after delivered marker");
    },
  });
  assert.equal(redelivery.providerCalls, 0);
  assert.equal(redelivery.recoveryOutcome, "already_delivered");
  assert.equal(redelivery.httpStatus, 200);
});

test("delivery: Resend concurrent-idempotency response stays pending without delivered marker", async () => {
  const result = await simulateExpiredCheckoutRecoveryPass({
    sessionId: "cs_test_concurrent_409",
    eventId: "evt_concurrent_409",
    attemptId: "att_concurrent",
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    send: async () =>
      classifyCheckoutRecoveryHttpResult("resend", 409, '{"name":"concurrent_idempotent_requests"}'),
  });
  assert.equal(result.httpStatus, 503);
  assert.equal(result.deliveredMarker, null);
  assert.equal(result.session, null);
  assert.equal(result.wrotePreSendSession, false);
  assert.equal(result.attemptRecord.errorCode, "concurrent_idempotent_requests");
  assert.equal(result.eventFinalized, false);
});

test("race P1: loser persist after winner cannot clobber canonical success", async () => {
  const store = new Map();
  const winnerMeta = { sentAt: null, provider: null };
  // Loser starts, passes initial check (empty store), then after send the winner writes success.
  const loser = await simulateExpiredCheckoutRecoveryPass({
    store,
    sessionId: "cs_test_race_p1",
    eventId: "evt_race_loser",
    attemptId: "att_loser",
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    now: 1_700_000_000_200,
    send: async () =>
      classifyCheckoutRecoveryHttpResult("resend", 409, '{"name":"concurrent_idempotent_requests"}'),
    afterSendBeforePersist: async (shared) => {
      const winner = await simulateExpiredCheckoutRecoveryPass({
        store: shared,
        sessionId: "cs_test_race_p1",
        eventId: "evt_race_winner",
        attemptId: "att_winner",
        recoveryUrl: "https://example.test/recover",
        customerEmail: "buyer@example.test",
        now: 1_700_000_000_100,
        send: async () => classifyCheckoutRecoveryHttpResult("resend", 200),
      });
      assert.equal(typeof winner.session.recoveryEmailSentAt, "number");
      winnerMeta.sentAt = winner.session.recoveryEmailSentAt;
      winnerMeta.provider = winner.session.recoveryEmailProvider;
    },
  });

  assert.equal(loser.providerCalls, 1);
  assert.equal(loser.httpStatus, 200);
  assert.equal(loser.eventFinalized, true);
  assert.equal(loser.recoveryOutcome, "already_delivered");
  assert.equal(loser.wroteSuccessSession, false);
  assert.equal(loser.wroteSessionRepair, false);
  assert.equal(loser.session.recoveryEmailSentAt, winnerMeta.sentAt);
  assert.equal(loser.session.recoveryEmailProvider, winnerMeta.provider);
  assert.equal(loser.session.recoveryEmailError, undefined);
  assert.equal(loser.session.recoveryEmailErrorCode, undefined);
  assert.equal(loser.session.recoveryEmailRetryability, "delivered");
  assert.equal(isCheckoutRecoveryDeliveredMarkerShape(loser.deliveredMarker), true);
  assert.equal(loser.attemptRecord.delivered, false);
  assert.equal(loser.attemptRecord.errorCode, "concurrent_idempotent_requests");

  const attempts = listCheckoutRecoveryAttemptRecords(store, "cs_test_race_p1");
  assert.equal(attempts.length, 2);
  assert.equal(new Set(attempts.map((a) => a.attemptId)).size, 2);
});

test("race P1b: non-delivered loser skips session rewrite when winner not yet visible", async () => {
  const result = await simulateExpiredCheckoutRecoveryPass({
    sessionId: "cs_test_race_p1b",
    eventId: "evt_race_p1b",
    attemptId: "att_p1b",
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    send: async () =>
      classifyCheckoutRecoveryHttpResult("resend", 409, '{"name":"concurrent_idempotent_requests"}'),
  });
  assert.equal(result.httpStatus, 503);
  assert.equal(result.eventFinalized, false);
  assert.equal(result.skippedSessionRewriteOnFailure, true);
  assert.equal(result.wrotePreSendSession, false);
  assert.equal(result.session, null);
  assert.equal(result.attemptRecord.errorCode, "concurrent_idempotent_requests");
});

test("race P1c: stale pre-send earlySession write must not erase winner success", async () => {
  const store = new Map();
  const sessionKey = "stripe:session:cs_test_race_p1c";
  const winnerMeta = { sentAt: null, provider: null };
  const staleExisting = { paid: false };

  const loser = await simulateExpiredCheckoutRecoveryPass({
    store,
    sessionId: "cs_test_race_p1c",
    eventId: "evt_race_p1c_loser",
    attemptId: "att_p1c_loser",
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    existingSession: staleExisting,
    // Loser already passed the initial delivery check with a stale snapshot.
    assumePassedInitialDeliveryCheck: true,
    now: 1_700_000_000_300,
    afterInitialReadBeforeProvider: async (shared) => {
      // Winner confirms delivery at the exact point the old code wrote earlySession.
      const winner = await simulateExpiredCheckoutRecoveryPass({
        store: shared,
        sessionId: "cs_test_race_p1c",
        eventId: "evt_race_p1c_winner",
        attemptId: "att_p1c_winner",
        recoveryUrl: "https://example.test/recover",
        customerEmail: "buyer@example.test",
        now: 1_700_000_000_250,
        send: async () => classifyCheckoutRecoveryHttpResult("resend", 200),
      });
      assert.equal(typeof winner.session.recoveryEmailSentAt, "number");
      winnerMeta.sentAt = winner.session.recoveryEmailSentAt;
      winnerMeta.provider = winner.session.recoveryEmailProvider;
      // Fixed path must not have written a pre-send session; winner success is intact.
      assert.equal(shared.get(sessionKey).recoveryEmailSentAt, winnerMeta.sentAt);
      assert.equal(shared.get(sessionKey).recoveryEmailRetryability, "delivered");
    },
    send: async () =>
      classifyCheckoutRecoveryHttpResult("resend", 409, '{"name":"concurrent_idempotent_requests"}'),
  });

  assert.equal(loser.wrotePreSendSession, false);
  assert.equal(loser.wroteSuccessSession, false);
  assert.equal(loser.wroteSessionRepair, false);
  assert.equal(loser.httpStatus, 200);
  assert.equal(loser.eventFinalized, true);
  assert.equal(loser.session.recoveryEmailSentAt, winnerMeta.sentAt);
  assert.equal(loser.session.recoveryEmailProvider, winnerMeta.provider);
  assert.equal(loser.session.recoveryEmailRetryability, "delivered");
  assert.equal(loser.session.recoveryEmailError, undefined);
  assert.equal(loser.session.recoveryEmailErrorCode, undefined);
  assert.equal(loser.attemptRecord.delivered, false);
  assert.equal(loser.attemptRecord.errorCode, "concurrent_idempotent_requests");
});

test("negative control: stale earlySession write would erase confirmed success", () => {
  const winnerSession = {
    paid: false,
    recoveryEmailSentAt: 1_700_000_000_250,
    recoveryEmailProvider: "resend",
    recoveryEmailRetryability: "delivered",
    recoveryEmailError: undefined,
    recoveryEmailErrorCode: undefined,
  };
  const staleExisting = { paid: false };
  const expiredBase = {
    paid: false,
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    expiredAt: 1_700_000_000_300,
  };
  const clobbered = naiveStaleEarlySessionWrite(winnerSession, staleExisting, expiredBase);
  assert.equal(clobbered.recoveryEmailSentAt, undefined);
  assert.equal(clobbered.recoveryEmailProvider, undefined);
  assert.notEqual(clobbered.recoveryEmailRetryability, "delivered");
});

test("race P2: marker-only observe must not rewrite winner session provider", async () => {
  const store = new Map();
  const sessionKey = "stripe:session:cs_test_race_p2_provider";
  const deliveredKey = checkoutRecoveryEmailDeliveredKey("cs_test_race_p2_provider");
  const winnerMeta = { sentAt: 1_700_000_000_400, provider: "resend" };

  const loser = await simulateExpiredCheckoutRecoveryPass({
    store,
    sessionId: "cs_test_race_p2_provider",
    eventId: "evt_p2_provider_loser",
    attemptId: "att_p2_provider_loser",
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    existingSession: { paid: false },
    assumePassedInitialDeliveryCheck: true,
    now: 1_700_000_000_450,
    send: async () =>
      classifyCheckoutRecoveryHttpResult("resend", 409, '{"name":"concurrent_idempotent_requests"}'),
    afterSendBeforePersist: async (shared) => {
      // Winner wrote session success then marker. Loser first "sees" marker while session
      // appears empty; then winner session becomes visible before the old repair point.
      shared.set(deliveredKey, { delivered: true, at: winnerMeta.sentAt });
      assert.equal(shared.get(sessionKey), undefined);
      shared.set(sessionKey, {
        paid: false,
        recoveryEmailSentAt: winnerMeta.sentAt,
        recoveryEmailProvider: winnerMeta.provider,
        recoveryEmailRetryability: "delivered",
        recoveryEmailError: undefined,
        recoveryEmailErrorCode: undefined,
      });
    },
  });

  assert.equal(loser.httpStatus, 200);
  assert.equal(loser.eventFinalized, true);
  assert.equal(loser.recoveryOutcome, "already_delivered");
  assert.equal(loser.wroteSuccessSession, false);
  assert.equal(loser.wroteSessionRepair, false);
  assert.equal(loser.session.recoveryEmailSentAt, winnerMeta.sentAt);
  assert.equal(loser.session.recoveryEmailProvider, winnerMeta.provider);
  assert.equal(loser.session.recoveryEmailRetryability, "delivered");
  assert.equal(loser.attemptRecord.delivered, false);
  assert.equal(loser.attemptRecord.errorCode, "concurrent_idempotent_requests");
  assert.equal(listCheckoutRecoveryAttemptRecords(store, "cs_test_race_p2_provider").length, 1);
});

test("negative control: marker-only stale repair would erase winner provider", () => {
  const winnerSession = {
    paid: false,
    recoveryEmailSentAt: 1_700_000_000_400,
    recoveryEmailProvider: "resend",
    recoveryEmailRetryability: "delivered",
  };
  // Stale observation: marker visible, session snapshot empty/missing provider.
  const staleLatestSession = { paid: false };
  const expiredBase = {
    paid: false,
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    expiredAt: 1_700_000_000_450,
  };
  // If repair ran after winner session was written but used the stale empty snapshot:
  const clobbered = {
    ...winnerSession,
    ...naiveMarkerOnlyStaleRepair(staleLatestSession, expiredBase, 1_700_000_000_400),
  };
  assert.equal(clobbered.recoveryEmailProvider, undefined);
  assert.equal(clobbered.recoveryEmailSentAt, 1_700_000_000_400);
});

test("marker backfill: session success without marker backfills marker only", async () => {
  const store = new Map();
  const sessionKey = "stripe:session:cs_test_marker_backfill";
  const successSession = {
    paid: false,
    recoveryEmailSentAt: 1_700_000_000_500,
    recoveryEmailProvider: "resend",
    recoveryEmailRetryability: "delivered",
    recoveryEmailError: undefined,
    recoveryEmailErrorCode: undefined,
  };
  store.set(sessionKey, { ...successSession });

  const result = await simulateExpiredCheckoutRecoveryPass({
    store,
    sessionId: "cs_test_marker_backfill",
    eventId: "evt_marker_backfill",
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    existingSession: successSession,
    send: async () => {
      throw new Error("provider must not be called when session already succeeded");
    },
  });

  assert.equal(result.httpStatus, 200);
  assert.equal(result.eventFinalized, true);
  assert.equal(result.providerCalls, 0);
  assert.equal(result.backfilledMarkerOnly, true);
  assert.equal(result.wroteSuccessSession, false);
  assert.equal(result.wroteSessionRepair, false);
  assert.equal(isCheckoutRecoveryDeliveredMarkerShape(result.deliveredMarker), true);
  assert.equal(result.deliveredMarker.at, 1_700_000_000_500);
  assert.equal(result.session.recoveryEmailSentAt, 1_700_000_000_500);
  assert.equal(result.session.recoveryEmailProvider, "resend");
  assert.equal(result.sessionUnchanged, true);
});

test("marker-only visible: acknowledge without rewriting canonical session", async () => {
  const store = new Map();
  const deliveredKey = checkoutRecoveryEmailDeliveredKey("cs_test_marker_only");
  store.set(deliveredKey, { delivered: true, at: 1_700_000_000_600 });

  const result = await simulateExpiredCheckoutRecoveryPass({
    store,
    sessionId: "cs_test_marker_only",
    eventId: "evt_marker_only",
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    existingSession: { paid: false },
    send: async () => {
      throw new Error("provider must not be called when marker already present");
    },
  });

  assert.equal(result.httpStatus, 200);
  assert.equal(result.eventFinalized, true);
  assert.equal(result.providerCalls, 0);
  assert.equal(result.wroteSuccessSession, false);
  assert.equal(result.wroteSessionRepair, false);
  assert.equal(result.backfilledMarkerOnly, false);
  assert.equal(result.session, null);
  assert.equal(isCheckoutRecoveryDeliveredMarkerShape(result.deliveredMarker), true);
});

test("race P2: two concurrent invocations produce two distinct attempt records", async () => {
  const store = new Map();
  const a = await simulateExpiredCheckoutRecoveryPass({
    store,
    sessionId: "cs_test_race_p2",
    eventId: "evt_p2_a",
    attemptId: "att_a",
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    send: async () => classifyCheckoutRecoveryHttpResult("resend", 503),
  });
  const b = await simulateExpiredCheckoutRecoveryPass({
    store,
    sessionId: "cs_test_race_p2",
    eventId: "evt_p2_b",
    attemptId: "att_b",
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    assumePassedInitialDeliveryCheck: true,
    existingSession: { paid: false },
    send: async () => classifyCheckoutRecoveryHttpResult("resend", 503),
  });
  assert.equal(a.attemptRecord.attemptId, "att_a");
  assert.equal(b.attemptRecord.attemptId, "att_b");
  const attempts = listCheckoutRecoveryAttemptRecords(store, "cs_test_race_p2");
  assert.equal(attempts.length, 2);
  assert.notEqual(naiveMathMaxAttemptMerge(1, 0), 2);
  assert.equal(naiveMathMaxAttemptMerge(1, 0), 1);
});

test("negative control: naive overwrite would replace confirmed delivery with retryable failure", () => {
  const confirmed = {
    recoveryEmailSentAt: 1_700_000_000_100,
    recoveryEmailProvider: "resend",
    recoveryEmailRetryability: "delivered",
    recoveryEmailAttemptCount: 1,
    recoveryEmailError: undefined,
    recoveryEmailErrorCode: undefined,
  };
  const concurrentFailure = classifyCheckoutRecoveryHttpResult(
    "resend",
    409,
    '{"name":"concurrent_idempotent_requests"}'
  );
  const naive = naiveOverwriteConfirmedDeliveryWithFailure(confirmed, concurrentFailure, 1_700_000_000_200);
  assert.equal(naive.recoveryEmailSentAt, undefined);
  assert.equal(naive.recoveryEmailRetryability, "retryable");
  assert.equal(naive.recoveryEmailErrorCode, "concurrent_idempotent_requests");
});

test("delivery: Resend invalid_idempotent_request is terminal 2xx with event finalized", async () => {
  const rawBody = '{"name":"invalid_idempotent_request","message":"different payload for cs_live_invalid"}';
  const result = await simulateExpiredCheckoutRecoveryPass({
    sessionId: "cs_test_invalid_409",
    eventId: "evt_invalid_409",
    attemptId: "att_invalid",
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    send: async () => classifyCheckoutRecoveryHttpResult("resend", 409, rawBody),
  });
  assert.equal(result.httpStatus, 200);
  assert.equal(result.eventFinalized, true);
  assert.equal(result.deliveredMarker, null);
  assert.equal(result.session, null);
  assert.equal(result.wrotePreSendSession, false);
  assert.equal(result.attemptRecord.retryability, "terminal");
  assert.equal(result.attemptRecord.errorCode, "invalid_idempotent_request");
  assert.equal(JSON.stringify(result.attemptRecord).includes("cs_live_invalid"), false);
  assert.equal(JSON.stringify(result.attemptRecord).includes("different payload"), false);
});

test("delivery: unknown Resend 409 is terminal 2xx with event finalized", async () => {
  const result = await simulateExpiredCheckoutRecoveryPass({
    sessionId: "cs_test_unknown_409",
    eventId: "evt_unknown_409",
    attemptId: "att_unknown",
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    send: async () => classifyCheckoutRecoveryHttpResult("resend", 409, "garbage body with pi_live_secret"),
  });
  assert.equal(result.httpStatus, 200);
  assert.equal(result.eventFinalized, true);
  assert.equal(result.deliveredMarker, null);
  assert.equal(result.attemptRecord.retryability, "terminal");
  assert.equal(result.attemptRecord.errorCode, "provider_conflict");
  assert.equal(JSON.stringify(result.attemptRecord).includes("pi_live_secret"), false);
});

test("delivery: terminal provider response records attempt and acknowledges without endless retry", async () => {
  const result = await simulateExpiredCheckoutRecoveryPass({
    sessionId: "cs_test_terminal",
    eventId: "evt_terminal",
    attemptId: "att_terminal",
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    send: async () => classifyCheckoutRecoveryHttpResult("resend", 401),
  });
  assert.equal(result.httpStatus, 200);
  assert.equal(result.eventFinalized, true);
  assert.equal(result.deliveredMarker, null);
  assert.equal(result.session, null);
  assert.equal(result.wrotePreSendSession, false);
  assert.equal(result.attemptRecord.retryability, "terminal");
  assert.equal(result.attemptRecord.errorCode, "provider_auth_error");
});

test("delivery: not-configured provider is bounded terminal acknowledgement", async () => {
  const result = await simulateExpiredCheckoutRecoveryPass({
    sessionId: "cs_test_not_configured",
    eventId: "evt_not_configured",
    attemptId: "att_none",
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    send: async () => ({
      delivered: false,
      provider: "none",
      retryability: "not_configured",
      errorCode: "checkout_recovery_not_configured",
    }),
  });
  assert.equal(result.httpStatus, 200);
  assert.equal(result.eventFinalized, true);
  assert.equal(result.deliveredMarker, null);
  assert.equal(result.attemptRecord.retryability, "not_configured");
  assert.equal(isCheckoutRecoveryWebhookRetryable("not_configured"), false);
});

test("negative control: legacy 45-day pre-send lock would block retry after failure", async () => {
  const store = new Map();
  const first = await simulateExpiredCheckoutRecoveryPass({
    store,
    sessionId: "cs_test_legacy_lock",
    eventId: "evt_legacy_1",
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    useLegacyPreSendLock: true,
    send: async () => classifyCheckoutRecoveryHttpResult("resend", 503),
  });
  assert.equal(first.httpStatus, 503);
  assert.equal(first.legacyPreSendLock, 1);

  store.delete("stripe:event:evt_legacy_1");

  const blocked = await simulateExpiredCheckoutRecoveryPass({
    store,
    sessionId: "cs_test_legacy_lock",
    eventId: "evt_legacy_2",
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    existingSession: store.get("stripe:session:cs_test_legacy_lock"),
    useLegacyPreSendLock: true,
    send: async () => classifyCheckoutRecoveryHttpResult("resend", 200),
  });
  assert.equal(blocked.blockedByLegacyPreSendLock, true);
  assert.equal(blocked.providerCalls, 0);
  assert.equal(blocked.deliveredMarker, null);
  assert.equal(store.get(checkoutRecoveryEmailLegacyPreSendKey("cs_test_legacy_lock")), 2);
});

test("negative control: new path does not retain authoritative pre-send lock after failure", async () => {
  const store = new Map();
  const first = await simulateExpiredCheckoutRecoveryPass({
    store,
    sessionId: "cs_test_no_legacy",
    eventId: "evt_new_1",
    attemptId: "att_new_1",
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    send: async () => classifyCheckoutRecoveryHttpResult("resend", 503),
  });
  assert.equal(first.legacyPreSendLock, null);
  assert.equal(store.has(checkoutRecoveryEmailLegacyPreSendKey("cs_test_no_legacy")), false);

  const second = await simulateExpiredCheckoutRecoveryPass({
    store,
    sessionId: "cs_test_no_legacy",
    eventId: "evt_new_1",
    attemptId: "att_new_2",
    recoveryUrl: "https://example.test/recover",
    customerEmail: "buyer@example.test",
    existingSession: store.get("stripe:session:cs_test_no_legacy"),
    send: async () => classifyCheckoutRecoveryHttpResult("resend", 200),
  });
  assert.equal(second.providerCalls, 1);
  assert.equal(isCheckoutRecoveryDeliveredMarkerShape(second.deliveredMarker), true);
});

test("privacy: persisted diagnostic fields never include raw session/payment identifiers or provider bodies", async () => {
  const rawBody = '{"message":"boom","session":"cs_live_should_not_persist","pi":"pi_live_x"}';
  const classified = classifyCheckoutRecoveryHttpResult("resend", 500, rawBody);
  const fields = applyCheckoutRecoveryAlertToSessionFields({}, classified, 99);
  const blob = JSON.stringify({ classified, fields });
  assert.equal(blob.includes("cs_live_should_not_persist"), false);
  assert.equal(blob.includes("pi_live_x"), false);
  assert.equal(blob.includes("boom"), false);
  assert.equal(fields.recoveryEmailErrorCode, "provider_server_error");
});

test("source: Resend path sets Idempotency-Key from opaque builder; SendGrid does not", () => {
  assert.match(recoveryAlertsSource, /"Idempotency-Key":\s*idempotencyKey/);
  assert.match(recoveryAlertsSource, /buildCheckoutRecoveryResendIdempotencyKey\(input\.sessionId\)/);
  assert.match(recoveryAlertsSource, /SENDGRID_RECOVERY_CONCURRENCY_GUARANTEE/);
  assert.match(
    recoveryAlertsSource,
    /Intentionally no Idempotency-Key: SendGrid Mail Send has no equivalent guarantee/
  );
  const sendgridFn = recoveryAlertsSource.slice(
    recoveryAlertsSource.indexOf("async function sendWithSendgrid"),
    recoveryAlertsSource.indexOf("export async function sendCheckoutRecoveryAlert")
  );
  assert.equal(/"Idempotency-Key"\s*:/.test(sendgridFn), false);
});

test("source: webhook uses delivered marker and separate attempt records", () => {
  assert.match(webhookSource, /checkoutRecoveryEmailDeliveredKey/);
  assert.match(webhookSource, /checkoutRecoveryEmailAttemptKey/);
  assert.match(webhookSource, /CHECKOUT_RECOVERY_ATTEMPT_TTL_SECONDS/);
  assert.match(webhookSource, /buildCheckoutRecoveryAttemptRecord/);
  assert.match(webhookSource, /applyCheckoutRecoveryDeliveredSessionFields/);
  assert.match(webhookSource, /checkout_recovery_retryable/);
  assert.equal(webhookSource.includes("kv.incr(recoveryEmailKey"), false);
  assert.equal(webhookSource.includes("applyCheckoutRecoveryAlertToSessionFields"), false);
  assert.equal(webhookSource.includes("earlySession"), false);
  // Confirmed delivery persists session before marker; already-delivered/observed paths
  // must not repair-rewrite sessionKey with a stale provider.
  assert.match(webhookSource, /Persist canonical success before the separate delivered marker/);
  assert.match(webhookSource, /backfill marker only/);
  assert.equal(/stripe:checkout_recovery:email:\$\{/.test(webhookSource), false);
  assert.match(recoveryAlertsSource, /email_delivered/);
  assert.match(recoveryAlertsSource, /checkout_recovery:attempt/);
});

test("headers: Resend request carries opaque key; SendGrid headers omit Idempotency-Key", () => {
  const sessionId = "cs_test_header_check";
  const resendHeaders = buildResendRecoveryRequestHeaders(sessionId);
  assert.equal(resendHeaders["Idempotency-Key"], buildCheckoutRecoveryResendIdempotencyKey(sessionId));
  assert.equal(resendHeaders["Idempotency-Key"].includes(sessionId), false);
  const sendgridHeaders = buildSendgridRecoveryRequestHeaders();
  assert.equal(Object.hasOwn(sendgridHeaders, "Idempotency-Key"), false);
  assert.equal(SENDGRID_RECOVERY_CONCURRENCY_GUARANTEE, "best_effort_no_provider_idempotency");
});

/** @param {unknown} value */
function isCheckoutRecoveryDeliveredMarkerShape(value) {
  return Boolean(value && typeof value === "object" && value.delivered === true);
}
