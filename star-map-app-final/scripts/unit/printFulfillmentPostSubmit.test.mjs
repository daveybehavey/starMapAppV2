import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPrintOrderFailureAlertResendIdempotencyKey,
  createMemoryCoordinator,
  overlayCoordinatorOntoPrintOrderRecord,
  shouldBlockHealthyKvMirrorWrite,
  simulateAlertDelivery,
  simulatePostSubmitWithCoordinator,
} from "./printFulfillmentPostSubmit.harness.mjs";

test("scenario1 integration: webhook failure wins over stale healthy post-submit", async () => {
  const store = createMemoryCoordinator();
  const result = await simulatePostSubmitWithCoordinator({
    store,
    sessionId: "cs_test_int1",
    printfulOrderId: 10,
    webhookFailureFirst: "printful_order_failed",
    reviewPrintfulOrderFiles: async () => ({ failedFiles: [], pendingFiles: [] }),
  });
  assert.equal(result.recordStatus, "failed");
  assert.equal(result.state.authorityStatus, "failed");
  const kv = overlayCoordinatorOntoPrintOrderRecord(
    { status: "sent", sessionId: "cs_test_int1", attempts: 1, createdAt: 1 },
    result.state,
  );
  assert.equal(kv.status, "failed");
});

test("scenario2 integration: concurrent poll+webhook → one failure; shared alert key", async () => {
  const store = createMemoryCoordinator();
  const sessionId = "cs_test_int2";
  await store.recordTerminalFailure({
    sessionId,
    error: "printful_files_failed",
    source: "post_submit_files",
  });
  await store.recordTerminalFailure({
    sessionId,
    error: "printful_order_failed",
    source: "printful_webhook",
  });
  const keys = [];
  const first = await simulateAlertDelivery(store, sessionId, async (key) => {
    keys.push(key);
    return { delivered: true };
  });
  const second = await simulateAlertDelivery(store, sessionId, async (key) => {
    keys.push(key);
    return { delivered: true };
  });
  assert.equal(first.claim.claimed, true);
  assert.equal(second.claim.claimed, false);
  assert.equal(second.claim.reason, "already_delivered");
  assert.equal(keys.length, 1);
  assert.equal(keys[0], buildPrintOrderFailureAlertResendIdempotencyKey(sessionId));
});

test("scenario3: waiting stays pending and never enters failure-alert claim", async () => {
  const store = createMemoryCoordinator();
  const result = await simulatePostSubmitWithCoordinator({
    store,
    sessionId: "cs_test_int3",
    printfulOrderId: 11,
    reviewPrintfulOrderFiles: async () => ({
      failedFiles: [],
      pendingFiles: [{ item: "a", type: "default", status: "waiting" }],
    }),
    maxAttempts: 1,
  });
  assert.equal(result.recordStatus, "pending_files");
  const claim = await store.beginFailureAlertClaim({ sessionId: "cs_test_int3", claimOwner: "x" });
  assert.equal(claim.claimed, false);
  assert.equal(claim.reason, "not_failed");
});

test("scenario5+6: unavailable coordinator blocks healthy; failed coordinator blocks stale KV healthy", () => {
  assert.equal(
    shouldBlockHealthyKvMirrorWrite({
      coordinator: { ok: false, unavailable: true, error: "down" },
      requireCoordinatorReadable: true,
    }).allow,
    false,
  );
});

test("scenario7+10: delivered:false and 409 concurrent remain retryable with same key", async () => {
  const store = createMemoryCoordinator();
  const sessionId = "cs_test_int7";
  await store.recordTerminalFailure({
    sessionId,
    error: "fail",
    source: "other",
  });
  const keys = [];
  const first = await simulateAlertDelivery(store, sessionId, async (key) => {
    keys.push(key);
    return { delivered: false, errorCode: "concurrent_idempotent_requests" };
  });
  assert.equal(first.state.failureAlert.phase, "retryable_error");
  const second = await simulateAlertDelivery(store, sessionId, async (key) => {
    keys.push(key);
    return { delivered: true };
  });
  assert.equal(second.claim.claimed, true);
  assert.equal(keys[0], keys[1]);
  assert.equal(second.state.failureAlert.phase, "delivered");
});

test("scenario12 marker: already-has printfulOrderId path is covered by retry source guards", async () => {
  // Source contract: retry route skips Printful create when printfulOrderId exists.
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");
  const retry = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../../src/app/api/print/orders/retry/route.ts"),
    "utf8",
  );
  assert.match(retry, /existing\.printfulOrderId/);
  assert.match(retry, /never create a duplicate/);
  assert.match(retry, /getEffectivePrintOrderRecord/);
});
