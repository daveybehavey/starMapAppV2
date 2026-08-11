import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  PRINT_FAILURE_ALERT_SAFE_PROVIDER_RETRY_WINDOW_MS,
  applyHealthyTransition,
  applyOperatorAuthorizedRecoveryTransition,
  applyPendingFilesTransition,
  applyTerminalFailureTransition,
  beginFailureAlertClaimTransition,
  bootstrapCoordinatorFromKvMirror,
  buildPrintOrderCoordinatorObjectName,
  buildPrintOrderFailureAlertResendIdempotencyKey,
  classifyPrintFailureAlertHttpResult,
  completeFailureAlertDeliveredTransition,
  completeFailureAlertRetryableErrorTransition,
  completeFailureAlertTerminalTransition,
  createUninitializedCoordinatorState,
  overlayCoordinatorOntoPrintOrderRecord,
  parseCoordinatorStateOrCorrupt,
  shouldBlockHealthyKvMirrorWrite,
} from "./printOrderCoordinator.harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "../..");

function readSrc(rel) {
  return readFileSync(path.join(appRoot, rel), "utf8");
}

test("identity: opaque DO name and alert key never embed raw session id", () => {
  const sessionId = "cs_test_abc123XYZ";
  const objectName = buildPrintOrderCoordinatorObjectName(sessionId);
  const alertKey = buildPrintOrderFailureAlertResendIdempotencyKey(sessionId);
  assert.match(objectName, /^poc_[a-f0-9]{48}$/);
  assert.match(alertKey, /^pfa_[a-f0-9]{48}$/);
  assert.equal(objectName.includes(sessionId), false);
  assert.equal(alertKey.includes(sessionId), false);
  assert.notEqual(objectName, buildPrintOrderCoordinatorObjectName("cs_test_other"));
});

test("scenario1: webhook terminal failure then stale healthy write remains failed", () => {
  const t0 = 1_700_000_000_000;
  let state = createUninitializedCoordinatorState("cs_test_race1", t0);
  state = applyTerminalFailureTransition(state, {
    error: "printful_order_failed:file",
    source: "printful_webhook",
    printfulOrderId: "99",
    nowMs: t0 + 1,
  });
  const healthy = applyHealthyTransition(state, { printfulOrderId: "99", nowMs: t0 + 2 });
  assert.equal(healthy.ok, false);
  assert.equal(healthy.reason, "terminal_failed");
  assert.equal(healthy.state.authorityStatus, "failed");

  const kvStale = {
    status: "sent",
    sessionId: "cs_test_race1",
    printfulOrderId: "99",
    attempts: 1,
    createdAt: t0,
  };
  const effective = overlayCoordinatorOntoPrintOrderRecord(kvStale, state);
  assert.equal(effective.status, "failed");
  assert.match(effective.error, /printful_order_failed/);
});

test("scenario2: concurrent failure detectors share one logical failure + one claim path", () => {
  const t0 = 1_700_000_000_000;
  let state = createUninitializedCoordinatorState("cs_test_race2", t0);
  state = applyTerminalFailureTransition(state, {
    error: "printful_files_failed:a:default=failed",
    source: "post_submit_files",
    nowMs: t0,
  });
  const second = applyTerminalFailureTransition(state, {
    error: "printful_order_failed",
    source: "printful_webhook",
    nowMs: t0 + 5,
  });
  assert.equal(second.authorityStatus, "failed");
  assert.equal(second.error, "printful_files_failed:a:default=failed");

  const claimA = beginFailureAlertClaimTransition(second, { claimOwner: "a", nowMs: t0 + 10 });
  assert.equal(claimA.claimed, true);
  const claimB = beginFailureAlertClaimTransition(claimA.state, { claimOwner: "b", nowMs: t0 + 11 });
  // Recoverable re-claim with same deterministic key (crash/retry semantics).
  assert.equal(claimB.claimed, true);
  assert.equal(claimB.idempotencyKey, claimA.idempotencyKey);
});

test("scenario3+4: pending files transition; healthy refused while pending does not auto-fail", () => {
  let state = createUninitializedCoordinatorState("cs_test_pending", 1000);
  const pending = applyPendingFilesTransition(state, { printfulOrderId: "1", nowMs: 1001 });
  assert.equal(pending.ok, true);
  assert.equal(pending.state.authorityStatus, "pending_files");
  // Pending is not terminal failure — alert claim denied.
  const claim = beginFailureAlertClaimTransition(pending.state, { claimOwner: "x", nowMs: 1002 });
  assert.equal(claim.claimed, false);
  assert.equal(claim.reason, "not_failed");
});

test("scenario5: DO unavailable fails closed for healthy KV mirror", () => {
  const gate = shouldBlockHealthyKvMirrorWrite({
    coordinator: { ok: false, unavailable: true, error: "print_order_coordinator_unavailable" },
    requireCoordinatorReadable: true,
  });
  assert.equal(gate.allow, false);
  assert.match(gate.error, /unavailable/);
});

test("scenario6: provider failure recorded then ordinary KV stale write stays failed", () => {
  let state = createUninitializedCoordinatorState("cs_test_kv_stale", 50);
  state = applyTerminalFailureTransition(state, {
    error: "printful_order_failed",
    source: "printful_webhook",
    nowMs: 51,
  });
  const gate = shouldBlockHealthyKvMirrorWrite({
    coordinator: { ok: true, state },
    requireCoordinatorReadable: true,
  });
  assert.equal(gate.allow, false);
  const mirrored = overlayCoordinatorOntoPrintOrderRecord(
    { status: "sent", sessionId: "cs_test_kv_stale", attempts: 1, createdAt: 1 },
    state,
  );
  assert.equal(mirrored.status, "failed");
});

test("scenario7+8+9: alert not-delivered remains retryable; crash-before-send and crash-after-send reuse key", () => {
  const t0 = 2_000_000_000_000;
  let state = createUninitializedCoordinatorState("cs_test_alert", t0);
  state = applyTerminalFailureTransition(state, {
    error: "print_order_failed",
    source: "retry",
    nowMs: t0,
  });
  const key = state.failureAlert.idempotencyKey;

  const claim1 = beginFailureAlertClaimTransition(state, { claimOwner: "c1", nowMs: t0 + 1 });
  assert.equal(claim1.claimed, true);
  assert.equal(claim1.idempotencyKey, key);

  // Crash before send: re-claim recovers with same key.
  const claim2 = beginFailureAlertClaimTransition(claim1.state, { claimOwner: "c2", nowMs: t0 + 2 });
  assert.equal(claim2.claimed, true);
  assert.equal(claim2.idempotencyKey, key);

  // Provider not delivered → retryable_error, then re-claim same key.
  const retryable = completeFailureAlertRetryableErrorTransition(claim2.state, {
    provider: "resend",
    error: "resend_500",
    nowMs: t0 + 3,
  });
  assert.equal(retryable.failureAlert.phase, "retryable_error");
  const claim3 = beginFailureAlertClaimTransition(retryable, { claimOwner: "c3", nowMs: t0 + 4 });
  assert.equal(claim3.claimed, true);
  assert.equal(claim3.idempotencyKey, key);

  // Crash after send before completion: provider accepted but local not completed —
  // retry still uses same key (deterministic builder).
  assert.equal(claim3.idempotencyKey, buildPrintOrderFailureAlertResendIdempotencyKey("cs_test_alert"));
  const delivered = completeFailureAlertDeliveredTransition(claim3.state, {
    provider: "resend",
    nowMs: t0 + 5,
  });
  assert.equal(delivered.failureAlert.phase, "delivered");
  const claim4 = beginFailureAlertClaimTransition(delivered, { claimOwner: "c4", nowMs: t0 + 6 });
  assert.equal(claim4.claimed, false);
  assert.equal(claim4.reason, "already_delivered");
});

test("scenario10: Resend 409 concurrent_idempotent_requests is retryable", () => {
  const result = classifyPrintFailureAlertHttpResult(
    409,
    JSON.stringify({ name: "concurrent_idempotent_requests" }),
  );
  assert.equal(result.delivered, false);
  assert.equal(result.retryability, "retryable");
  assert.equal(result.errorCode, "concurrent_idempotent_requests");
});

test("scenario11: safe-window expiry suppresses send and exposes operator action", () => {
  const t0 = 3_000_000_000_000;
  let state = createUninitializedCoordinatorState("cs_test_window", t0);
  state = applyTerminalFailureTransition(state, {
    error: "print_order_failed",
    source: "other",
    nowMs: t0,
  });
  const past = t0 + PRINT_FAILURE_ALERT_SAFE_PROVIDER_RETRY_WINDOW_MS + 1;
  const claim = beginFailureAlertClaimTransition(state, { claimOwner: "late", nowMs: past });
  assert.equal(claim.claimed, false);
  assert.equal(claim.reason, "safe_window_elapsed");
  assert.equal(claim.state.failureAlert.phase, "operator_action_required");
});

test("scenario14: unrelated print orders use independent opaque keys", () => {
  const a = buildPrintOrderCoordinatorObjectName("cs_test_order_a");
  const b = buildPrintOrderCoordinatorObjectName("cs_test_order_b");
  assert.notEqual(a, b);
  const stateA = createUninitializedCoordinatorState("cs_test_order_a", 1);
  const stateB = createUninitializedCoordinatorState("cs_test_order_b", 1);
  const failedA = applyTerminalFailureTransition(stateA, {
    error: "fail_a",
    source: "other",
    nowMs: 2,
  });
  const healthyB = applyHealthyTransition(stateB, { nowMs: 2 });
  assert.equal(failedA.authorityStatus, "failed");
  assert.equal(healthyB.ok, true);
  assert.equal(healthyB.state.authorityStatus, "healthy");
});

test("bootstrap: KV failed cannot be invented as healthy", () => {
  const state = bootstrapCoordinatorFromKvMirror({
    sessionId: "cs_test_boot",
    kvStatus: "failed",
    kvError: "legacy_failed",
    nowMs: 10,
  });
  assert.equal(state.authorityStatus, "failed");
  assert.equal(state.error, "legacy_failed");
  const healthy = applyHealthyTransition(state, { nowMs: 11 });
  assert.equal(healthy.ok, false);
});

test("source: failure alerts are Resend-only with Idempotency-Key; no R2 ledger; SQLite DO migration present", () => {
  const alerts = readSrc("src/lib/printOrderAlerts.ts");
  const wrangler = readSrc("wrangler.toml");
  const workerEntry = readSrc("worker.entry.ts");
  const coordinatorDo = readSrc("src/durable-objects/PrintOrderCoordinator.ts");
  const state = readSrc("src/lib/printOrderCoordinatorState.ts");

  assert.match(alerts, /Idempotency-Key/);
  assert.match(alerts, /PRINT_ORDER_FAILURE_ALERT_PROVIDER_POLICY/);
  assert.match(alerts, /print_failure_alert_resend_required/);
  // Failure alerts explicitly refuse SendGrid fallback.
  assert.match(alerts, /Failure alerts are Resend-only/);
  assert.match(alerts, /SendGrid Mail Send lacks equivalent Idempotency-Key/);

  assert.match(wrangler, /new_sqlite_classes\s*=\s*\["PrintOrderCoordinator"\]/);
  assert.match(wrangler, /PRINT_ORDER_COORDINATOR/);
  assert.equal(wrangler.includes("print-order-state"), false);
  assert.equal(wrangler.includes("PRINT_ORDER_STATE_R2"), false);

  assert.match(workerEntry, /PrintOrderCoordinator/);
  assert.match(coordinatorDo, /ctx\.storage\.sql/);
  assert.equal(coordinatorDo.includes("blockConcurrencyWhile"), false);
  assert.equal(coordinatorDo.includes("fetch(\"https://api.printful"), false);
  assert.equal(coordinatorDo.includes("api.resend.com"), false);

  assert.match(state, /PRINT_FAILURE_ALERT_SAFE_PROVIDER_RETRY_WINDOW_MS/);
  assert.equal(state.includes("PRINT_ORDER_STATE_R2"), false);
});

test("source: #237 waiting classification preserved; post-submit uses coordinator", () => {
  const review = readSrc("src/lib/printfulOrderReview.ts");
  const post = readSrc("src/lib/printFulfillmentPostSubmit.ts");
  assert.match(review, /classifyPrintfulFileStatus/);
  assert.match(review, /waiting/);
  assert.match(review, /pendingFiles/);
  assert.match(post, /recordTerminalFailureAndDeliverAlert/);
  assert.match(post, /preservePendingOnUnavailable/);
  assert.equal(post.includes("printOrderTerminalState"), false);
  assert.equal(post.includes("PRINT_ORDER_STATE_R2"), false);
});

test("finding1: late 409/retryable completion never regresses delivered", () => {
  const t0 = 4_000_000_000_000;
  let state = createUninitializedCoordinatorState("cs_test_mono", t0);
  state = applyTerminalFailureTransition(state, {
    error: "fail",
    source: "printful_webhook",
    nowMs: t0,
  });
  const claimA = beginFailureAlertClaimTransition(state, { claimOwner: "a", nowMs: t0 + 1 });
  const claimB = beginFailureAlertClaimTransition(claimA.state, { claimOwner: "b", nowMs: t0 + 2 });
  assert.equal(claimB.claimed, true);
  // A succeeds and completes delivered first.
  const delivered = completeFailureAlertDeliveredTransition(claimB.state, {
    provider: "resend",
    claimOwner: "a",
    nowMs: t0 + 3,
  });
  assert.equal(delivered.failureAlert.phase, "delivered");
  // Late overlapping 409 completion must not regress.
  const late409 = completeFailureAlertRetryableErrorTransition(delivered, {
    provider: "resend",
    error: "concurrent_idempotent_requests",
    claimOwner: "b",
    nowMs: t0 + 4,
  });
  assert.equal(late409.failureAlert.phase, "delivered");
  const lateTerminal = completeFailureAlertTerminalTransition(delivered, {
    provider: "resend",
    error: "invalid_idempotent_request",
    claimOwner: "b",
    nowMs: t0 + 5,
  });
  assert.equal(lateTerminal.failureAlert.phase, "delivered");
});

test("finding3: operator-authorized recovery clears terminal failed after successful retry", () => {
  let state = createUninitializedCoordinatorState("cs_test_recover", 10);
  state = applyTerminalFailureTransition(state, {
    error: "print_order_failed",
    source: "retry",
    nowMs: 11,
  });
  assert.equal(applyHealthyTransition(state, { nowMs: 12 }).ok, false);
  const recovered = applyOperatorAuthorizedRecoveryTransition(state, {
    printfulOrderId: "777",
    note: "operator_authorized_retry_recovery",
    nowMs: 13,
  });
  assert.equal(recovered.authorityStatus, "healthy");
  assert.equal(recovered.printfulOrderId, "777");
  assert.equal(recovered.error, undefined);
  assert.equal(recovered.failureAlert.phase, "none");
});

test("finding5: corrupt coordinator rows fail closed", () => {
  const good = createUninitializedCoordinatorState("cs_test_corrupt", 100);
  assert.equal(parseCoordinatorStateOrCorrupt(good, "cs_test_corrupt").ok, true);
  assert.equal(
    parseCoordinatorStateOrCorrupt({ ...good, authorityStatus: "wat" }, "cs_test_corrupt").ok,
    false,
  );
  assert.equal(
    parseCoordinatorStateOrCorrupt(
      { ...good, failureAlert: { ...good.failureAlert, phase: "nope" } },
      "cs_test_corrupt",
    ).ok,
    false,
  );
  assert.equal(
    parseCoordinatorStateOrCorrupt(
      { ...good, opaqueOrderKey: "poc_deadbeef" },
      "cs_test_corrupt",
    ).ok,
    false,
  );
  assert.equal(
    parseCoordinatorStateOrCorrupt({ ...good, version: 99 }, "cs_test_corrupt").ok,
    false,
  );
});

test("finding6: terminal / not-configured alert outcomes go to operator_action_required", () => {
  let state = createUninitializedCoordinatorState("cs_test_term_alert", 20);
  state = applyTerminalFailureTransition(state, { error: "fail", source: "other", nowMs: 21 });
  const claimed = beginFailureAlertClaimTransition(state, { claimOwner: "c", nowMs: 22 });
  const terminal = completeFailureAlertTerminalTransition(claimed.state, {
    provider: "none",
    error: "invalid_idempotent_request",
    claimOwner: "c",
    nowMs: 23,
  });
  assert.equal(terminal.failureAlert.phase, "operator_action_required");
  const reclaim = beginFailureAlertClaimTransition(terminal, { claimOwner: "c2", nowMs: 24 });
  assert.equal(reclaim.claimed, false);
  assert.equal(reclaim.reason, "operator_action_required");
});

test("source: retry fail-closed + recovery + status fail-closed present in routes", () => {
  const retry = readSrc("src/app/api/print/orders/retry/route.ts");
  const status = readSrc("src/app/api/print/orders/status/route.ts");
  assert.match(retry, /print_order_coordinator_unavailable/);
  assert.match(retry, /operatorAuthorizedRecovery/);
  assert.match(retry, /wasTerminalFailed/);
  assert.match(status, /effective\.order/);
  assert.equal(status.includes("effective.ok ? effective.order : order"), false);
});
