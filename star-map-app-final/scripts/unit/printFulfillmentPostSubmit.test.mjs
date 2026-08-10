import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildPrintfulOrderFileReview } from "./printfulOrderReview.harness.mjs";
import {
  PRINTFUL_POST_SUBMIT_FILE_REVIEW_MAX_ATTEMPTS,
  PRINTFUL_POST_SUBMIT_FILE_REVIEW_RETRY_DELAYS_MS,
  applyAlreadySentRetryReview,
  applyPrintfulPostSubmitReview,
  isPrintfulFileReviewPending,
  preferStoredTerminalFailure,
  resolvePrintfulPostSubmitFileOutcome,
  shouldRereviewPrintfulFilesOnAlreadySent,
  shouldSendAlreadySentApprovalAlert,
} from "./printFulfillmentPostSubmit.harness.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const postSubmitSrc = readFileSync(join(root, "src/lib/printFulfillmentPostSubmit.ts"), "utf8");
const retrySrc = readFileSync(join(root, "src/app/api/print/orders/retry/route.ts"), "utf8");
const printOrdersSrc = readFileSync(join(root, "src/lib/printOrders.ts"), "utf8");

function baseRecord(overrides = {}) {
  return {
    status: "sent",
    sessionId: "cs_test_post_submit_review",
    printVariant: "poster_framed",
    includesDigitalAddOn: false,
    printfulOrderId: 12345,
    attempts: 1,
    createdAt: 1,
    ...overrides,
  };
}

test("bounded recheck constants are hard-capped and read-only sized", () => {
  assert.equal(PRINTFUL_POST_SUBMIT_FILE_REVIEW_MAX_ATTEMPTS, 3);
  assert.equal(PRINTFUL_POST_SUBMIT_FILE_REVIEW_RETRY_DELAYS_MS.length, 2);
  assert.ok(PRINTFUL_POST_SUBMIT_FILE_REVIEW_MAX_ATTEMPTS <= 5);
});

test("ok remains clean: approval alert only, no failure alert", async () => {
  const alerts = { failure: 0, approval: 0 };
  const result = await applyPrintfulPostSubmitReview(baseRecord({ printfulFileReviewPendingAt: 99 }), {
    reviewPrintfulOrderFiles: async () =>
      buildPrintfulOrderFileReview(12345, [{ item: "poster", type: "default", status: "ok" }]),
    sleep: async () => {},
    loadStoredPrintOrder: async () => null,
    sendPrintOrderFailureAlert: async () => {
      alerts.failure += 1;
      return { delivered: true, provider: "test" };
    },
    sendPrintOrderApprovalAlert: async () => {
      alerts.approval += 1;
      return { delivered: true, provider: "test" };
    },
  });

  assert.equal(alerts.failure, 0);
  assert.equal(alerts.approval, 1);
  assert.equal(result.error, undefined);
  assert.ok(result.operatorAlertedAt);
  assert.equal(result.operatorFailureAlertedAt, undefined);
  assert.equal(isPrintfulFileReviewPending(result), false);
  assert.equal(String(result.error || "").includes("printful_files_failed"), false);
});

test("waiting does not produce printful_files_failed or failure alert", async () => {
  const alerts = { failure: 0, approval: 0 };
  const result = await applyPrintfulPostSubmitReview(baseRecord(), {
    maxAttempts: 2,
    retryDelaysMs: [0, 0],
    sleep: async () => {},
    loadStoredPrintOrder: async () => null,
    reviewPrintfulOrderFiles: async () =>
      buildPrintfulOrderFileReview(12345, [{ item: "poster", type: "default", status: "waiting" }]),
    sendPrintOrderFailureAlert: async () => {
      alerts.failure += 1;
      return { delivered: true, provider: "test" };
    },
    sendPrintOrderApprovalAlert: async () => {
      alerts.approval += 1;
      return { delivered: true, provider: "test" };
    },
  });

  assert.equal(alerts.failure, 0);
  assert.equal(alerts.approval, 0);
  assert.equal(result.error, undefined);
  assert.equal(result.operatorFailureAlertedAt, undefined);
  assert.equal(result.operatorAlertedAt, undefined);
  assert.equal(isPrintfulFileReviewPending(result), true);
  assert.equal(String(result.error || "").includes("printful_files_failed"), false);
});

test("waiting is not treated as final successful approval before resolve", async () => {
  const statuses = ["waiting", "waiting", "ok"];
  let calls = 0;
  const result = await applyPrintfulPostSubmitReview(baseRecord(), {
    maxAttempts: 3,
    retryDelaysMs: [0, 0],
    sleep: async () => {},
    loadStoredPrintOrder: async () => null,
    reviewPrintfulOrderFiles: async () => {
      const status = statuses[Math.min(calls, statuses.length - 1)];
      calls += 1;
      return buildPrintfulOrderFileReview(12345, [{ item: "poster", type: "default", status }]);
    },
    sendPrintOrderFailureAlert: async () => ({ delivered: true, provider: "test" }),
    sendPrintOrderApprovalAlert: async () => ({ delivered: true, provider: "test" }),
  });

  assert.equal(calls, 3);
  assert.ok(result.operatorAlertedAt);
  assert.equal(result.operatorFailureAlertedAt, undefined);
  assert.equal(isPrintfulFileReviewPending(result), false);
});

test("failed still produces failure signal and alert", async () => {
  const alerts = { failure: 0, approval: 0 };
  const result = await applyPrintfulPostSubmitReview(baseRecord(), {
    reviewPrintfulOrderFiles: async () =>
      buildPrintfulOrderFileReview(12345, [{ item: "poster", type: "default", status: "failed" }]),
    sleep: async () => {},
    loadStoredPrintOrder: async () => null,
    sendPrintOrderFailureAlert: async () => {
      alerts.failure += 1;
      return { delivered: true, provider: "test" };
    },
    sendPrintOrderApprovalAlert: async () => {
      alerts.approval += 1;
      return { delivered: true, provider: "test" };
    },
  });

  assert.equal(alerts.failure, 1);
  assert.equal(alerts.approval, 0);
  assert.equal(result.error, "printful_files_failed:poster:default=failed");
  assert.ok(result.operatorFailureAlertedAt);
  assert.equal(result.operatorAlertedAt, undefined);
  assert.equal(isPrintfulFileReviewPending(result), false);
});

test("unknown status is fail-safe: no confirmed failure alert and no approval", async () => {
  const alerts = { failure: 0, approval: 0 };
  const result = await applyPrintfulPostSubmitReview(baseRecord(), {
    maxAttempts: 2,
    retryDelaysMs: [0],
    sleep: async () => {},
    loadStoredPrintOrder: async () => null,
    reviewPrintfulOrderFiles: async () =>
      buildPrintfulOrderFileReview(12345, [
        { item: "poster", type: "default", status: "mystery_state" },
      ]),
    sendPrintOrderFailureAlert: async () => {
      alerts.failure += 1;
      return { delivered: true, provider: "test" };
    },
    sendPrintOrderApprovalAlert: async () => {
      alerts.approval += 1;
      return { delivered: true, provider: "test" };
    },
  });

  assert.equal(alerts.failure, 0);
  assert.equal(alerts.approval, 0);
  assert.equal(result.error, undefined);
  assert.equal(isPrintfulFileReviewPending(result), true);
  assert.equal(String(result.error || "").includes("printful_files_failed"), false);
});

test("bounded recheck has hard attempt limit and performs reads only", async () => {
  const sleeps = [];
  let reads = 0;
  const resolved = await resolvePrintfulPostSubmitFileOutcome({
    printfulOrderId: 12345,
    maxAttempts: 3,
    retryDelaysMs: [10, 20],
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    reviewPrintfulOrderFiles: async () => {
      reads += 1;
      return buildPrintfulOrderFileReview(12345, [{ item: "poster", type: "default", status: "waiting" }]);
    },
  });

  assert.equal(resolved.outcome, "pending");
  assert.equal(resolved.attempts, 3);
  assert.equal(reads, 3);
  assert.deepEqual(sleeps, [10, 20]);
  assert.ok(reads <= PRINTFUL_POST_SUBMIT_FILE_REVIEW_MAX_ATTEMPTS);
});

test("waiting that resolves to failed still alerts after recheck", async () => {
  const sequence = ["waiting", "failed"];
  let i = 0;
  const result = await applyPrintfulPostSubmitReview(baseRecord(), {
    maxAttempts: 3,
    retryDelaysMs: [0, 0],
    sleep: async () => {},
    loadStoredPrintOrder: async () => null,
    reviewPrintfulOrderFiles: async () => {
      const status = sequence[Math.min(i, sequence.length - 1)];
      i += 1;
      return buildPrintfulOrderFileReview(12345, [{ item: "poster", type: "default", status }]);
    },
    sendPrintOrderFailureAlert: async () => ({ delivered: true, provider: "test" }),
    sendPrintOrderApprovalAlert: async () => ({ delivered: true, provider: "test" }),
  });

  assert.equal(result.error, "printful_files_failed:poster:default=failed");
  assert.ok(result.operatorFailureAlertedAt);
});

test("P1: unresolved waiting persists durable pending marker and blocks already-sent approval", async () => {
  const pending = await applyPrintfulPostSubmitReview(baseRecord(), {
    maxAttempts: 2,
    retryDelaysMs: [0],
    sleep: async () => {},
    loadStoredPrintOrder: async () => null,
    reviewPrintfulOrderFiles: async () =>
      buildPrintfulOrderFileReview(12345, [{ item: "poster", type: "default", status: "waiting" }]),
    sendPrintOrderFailureAlert: async () => ({ delivered: true, provider: "test" }),
    sendPrintOrderApprovalAlert: async () => ({ delivered: true, provider: "test" }),
  });

  assert.equal(isPrintfulFileReviewPending(pending), true);
  assert.equal(shouldSendAlreadySentApprovalAlert(pending), false);
  assert.equal(shouldRereviewPrintfulFilesOnAlreadySent(pending), true);

  const alerts = { failure: 0, approval: 0 };
  const retried = await applyAlreadySentRetryReview(pending, {
    maxAttempts: 2,
    retryDelaysMs: [0],
    sleep: async () => {},
    loadStoredPrintOrder: async () => pending,
    reviewPrintfulOrderFiles: async () =>
      buildPrintfulOrderFileReview(12345, [{ item: "poster", type: "default", status: "waiting" }]),
    sendPrintOrderFailureAlert: async () => {
      alerts.failure += 1;
      return { delivered: true, provider: "test" };
    },
    sendPrintOrderApprovalAlert: async () => {
      alerts.approval += 1;
      return { delivered: true, provider: "test" };
    },
  });

  assert.equal(alerts.approval, 0);
  assert.equal(alerts.failure, 0);
  assert.equal(isPrintfulFileReviewPending(retried), true);
  assert.equal(retried.operatorAlertedAt, undefined);
});

test("P1: null/unavailable rereview on already-pending record preserves pending (no approval)", async () => {
  const alreadyPending = baseRecord({ printfulFileReviewPendingAt: 1_700_000_000_111 });
  const alerts = { failure: 0, approval: 0 };
  const result = await applyAlreadySentRetryReview(alreadyPending, {
    maxAttempts: 2,
    retryDelaysMs: [0],
    sleep: async () => {},
    loadStoredPrintOrder: async () => alreadyPending,
    reviewPrintfulOrderFiles: async () => null,
    sendPrintOrderFailureAlert: async () => {
      alerts.failure += 1;
      return { delivered: true, provider: "test" };
    },
    sendPrintOrderApprovalAlert: async () => {
      alerts.approval += 1;
      return { delivered: true, provider: "test" };
    },
  });

  assert.equal(alerts.approval, 0);
  assert.equal(alerts.failure, 0);
  assert.equal(isPrintfulFileReviewPending(result), true);
  assert.equal(result.printfulFileReviewPendingAt, alreadyPending.printfulFileReviewPendingAt);
  assert.equal(result.operatorAlertedAt, undefined);
  assert.equal(shouldSendAlreadySentApprovalAlert(result), false);
});

test("P1: first-submit null review without prior pending still follows legacy ok path", async () => {
  const alerts = { failure: 0, approval: 0 };
  const result = await applyPrintfulPostSubmitReview(baseRecord(), {
    maxAttempts: 1,
    sleep: async () => {},
    loadStoredPrintOrder: async () => null,
    reviewPrintfulOrderFiles: async () => null,
    sendPrintOrderFailureAlert: async () => {
      alerts.failure += 1;
      return { delivered: true, provider: "test" };
    },
    sendPrintOrderApprovalAlert: async () => {
      alerts.approval += 1;
      return { delivered: true, provider: "test" };
    },
  });

  assert.equal(alerts.approval, 1);
  assert.equal(alerts.failure, 0);
  assert.equal(isPrintfulFileReviewPending(result), false);
  assert.ok(result.operatorAlertedAt);
});

test("P1: concurrent order_failed webhook during poll delay is not overwritten", async () => {
  const store = {
    current: baseRecord({ status: "pending" }),
  };
  const webhookFailed = {
    ...store.current,
    status: "failed",
    error: "printful_order_failed:provider_rejected",
    operatorFailureAlertedAt: 1_700_000_000_000,
    operatorFailureAlertProvider: "webhook",
  };

  const alerts = { failure: 0, approval: 0 };
  const result = await applyPrintfulPostSubmitReview(baseRecord(), {
    maxAttempts: 3,
    retryDelaysMs: [5, 5],
    sleep: async () => {
      // Simulate authoritative webhook persistence during backoff.
      store.current = webhookFailed;
    },
    loadStoredPrintOrder: async () => store.current,
    reviewPrintfulOrderFiles: async () =>
      buildPrintfulOrderFileReview(12345, [{ item: "poster", type: "default", status: "waiting" }]),
    sendPrintOrderFailureAlert: async () => {
      alerts.failure += 1;
      return { delivered: true, provider: "test" };
    },
    sendPrintOrderApprovalAlert: async () => {
      alerts.approval += 1;
      return { delivered: true, provider: "test" };
    },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.error, "printful_order_failed:provider_rejected");
  assert.equal(result.operatorFailureAlertedAt, webhookFailed.operatorFailureAlertedAt);
  assert.equal(alerts.failure, 0);
  assert.equal(alerts.approval, 0);
  assert.equal(preferStoredTerminalFailure(baseRecord(), webhookFailed)?.status, "failed");
});

test("P1: poll observing failed does not duplicate alert when webhook already alerted", async () => {
  const storedFailed = baseRecord({
    status: "failed",
    error: "printful_order_failed:already_alerted",
    operatorFailureAlertedAt: 42,
    operatorFailureAlertProvider: "webhook",
  });
  const alerts = { failure: 0, approval: 0 };
  const result = await applyPrintfulPostSubmitReview(baseRecord(), {
    reviewPrintfulOrderFiles: async () =>
      buildPrintfulOrderFileReview(12345, [{ item: "poster", type: "default", status: "failed" }]),
    sleep: async () => {},
    loadStoredPrintOrder: async () => storedFailed,
    sendPrintOrderFailureAlert: async () => {
      alerts.failure += 1;
      return { delivered: true, provider: "test" };
    },
    sendPrintOrderApprovalAlert: async () => {
      alerts.approval += 1;
      return { delivered: true, provider: "test" };
    },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.error, storedFailed.error);
  assert.equal(result.operatorFailureAlertedAt, 42);
  assert.equal(alerts.failure, 0);
  assert.equal(alerts.approval, 0);
});

test("post-submit source keeps bounded read-only recheck and no provider mutation APIs", () => {
  assert.match(postSubmitSrc, /PRINTFUL_POST_SUBMIT_FILE_REVIEW_MAX_ATTEMPTS/);
  assert.match(postSubmitSrc, /resolvePrintfulPostSubmitFileOutcome/);
  assert.match(postSubmitSrc, /printfulFileReviewPendingAt/);
  assert.match(postSubmitSrc, /preferStoredTerminalFailure/);
  assert.match(printOrdersSrc, /printfulFileReviewPendingAt/);
  assert.match(retrySrc, /shouldRereviewPrintfulFilesOnAlreadySent/);
  assert.match(retrySrc, /shouldSendAlreadySentApprovalAlert/);
  assert.equal(postSubmitSrc.includes("/orders/") && postSubmitSrc.includes("method:"), false);
  assert.equal(postSubmitSrc.includes("method: \"POST\""), false);
  assert.equal(postSubmitSrc.includes("method: \"PUT\""), false);
  assert.equal(postSubmitSrc.includes("method: \"DELETE\""), false);
  assert.equal(postSubmitSrc.includes("fetch("), false);
});

test("alert paths do not embed raw provider payloads", async () => {
  const result = await applyPrintfulPostSubmitReview(baseRecord(), {
    reviewPrintfulOrderFiles: async () =>
      buildPrintfulOrderFileReview(12345, [{ item: "poster", type: "default", status: "failed" }]),
    sleep: async () => {},
    loadStoredPrintOrder: async () => null,
    sendPrintOrderFailureAlert: async (record) => {
      assert.equal(JSON.stringify(record).includes("Bearer"), false);
      assert.equal(String(record.error || "").includes("{"), false);
      return { delivered: true, provider: "test" };
    },
    sendPrintOrderApprovalAlert: async () => ({ delivered: true, provider: "test" }),
  });
  assert.match(result.error || "", /^printful_files_failed:/);
});

test("P1/#239: confirmed failure with R2 outage stays write-pending and retryable (no alert yet)", async () => {
  const { createAlwaysUnavailableTerminalStore } = await import("./printOrderTerminalState.harness.mjs");
  const { persistReviewedPrintOrder } = await import("./printFulfillmentPostSubmit.harness.mjs");
  const { ensurePrintOrderTerminalFromKvFailure, createMemoryPrintOrderTerminalStore } = await import(
    "./printOrderTerminalState.harness.mjs"
  );

  const alerts = { failure: 0, approval: 0 };
  const failed = await applyPrintfulPostSubmitReview(baseRecord(), {
    terminalStore: createAlwaysUnavailableTerminalStore(),
    reviewPrintfulOrderFiles: async () =>
      buildPrintfulOrderFileReview(12345, [{ item: "poster", type: "default", status: "failed" }]),
    sleep: async () => {},
    loadStoredPrintOrder: async () => null,
    sendPrintOrderFailureAlert: async () => {
      alerts.failure += 1;
      return { delivered: true, provider: "test" };
    },
    sendPrintOrderApprovalAlert: async () => {
      alerts.approval += 1;
      return { delivered: true, provider: "test" };
    },
  });

  assert.equal(failed.status, "failed");
  assert.match(failed.error || "", /^printful_files_failed:/);
  assert.ok(failed.printOrderTerminalWritePendingAt);
  assert.equal(failed.operatorFailureAlertedAt, undefined);
  assert.equal(alerts.failure, 0);

  // Durable KV queue survives; later R2 recovery backfills authoritative terminal.
  const recoveredStore = createMemoryPrintOrderTerminalStore();
  const backfill = await ensurePrintOrderTerminalFromKvFailure(failed, { store: recoveredStore });
  assert.equal(backfill.ok, true);
  assert.equal(backfill.state.error, failed.error);

  const persisted = await persistReviewedPrintOrder(failed.sessionId, failed, {
    terminalStore: createAlwaysUnavailableTerminalStore(),
  });
  assert.ok(persisted.printOrderTerminalWritePendingAt);
});

test("P1/#239: healthy final persistence requires terminal readability at write boundary", async () => {
  const {
    createMemoryPrintOrderTerminalStore,
    createAlwaysUnavailableTerminalStore,
    persistPrintOrderKvMirror,
  } = await import("./printOrderTerminalState.harness.mjs");
  const { persistReviewedPrintOrder } = await import("./printFulfillmentPostSubmit.harness.mjs");

  const healthy = baseRecord({
    status: "sent",
    operatorAlertedAt: 99,
    operatorAlertProvider: "test",
  });

  const okStore = createMemoryPrintOrderTerminalStore();
  const okPersist = await persistPrintOrderKvMirror(healthy.sessionId, healthy, {
    store: okStore,
    requireTerminalReadable: true,
  });
  assert.equal(okPersist.ok, true);
  assert.equal(okPersist.order.status, "sent");

  const blocked = await persistReviewedPrintOrder(healthy.sessionId, healthy, {
    terminalStore: createAlwaysUnavailableTerminalStore(),
  });
  assert.equal(blocked.status, "sent");
  assert.equal(blocked.operatorAlertedAt, undefined);
  assert.ok(blocked.printfulFileReviewPendingAt);
  assert.match(blocked.error || "", /print_order_terminal/);
});

test("P1/#239: concurrent failure detectors claim once — single provider alert send", async () => {
  const {
    createMemoryPrintOrderTerminalStore,
    claimPrintOrderFailureAlertDelivery,
    recordPrintOrderTerminalFailure,
  } = await import("./printOrderTerminalState.harness.mjs");

  const store = createMemoryPrintOrderTerminalStore();
  const sessionId = "cs_test_post_submit_review";
  await recordPrintOrderTerminalFailure(
    {
      sessionId,
      error: "printful_files_failed:poster:default=failed",
      source: "post_submit_files",
    },
    { store },
  );

  const sends = [];
  async function race(owner) {
    const claim = await claimPrintOrderFailureAlertDelivery(
      {
        sessionId,
        claimOwner: owner,
        error: "printful_files_failed:poster:default=failed",
        source: "post_submit_files",
      },
      { store },
    );
    if (!claim.ok || !claim.claimed) return { owner, claimed: false, reason: claim.reason };
    // Provider I/O only after claim.
    sends.push(owner);
    await recordPrintOrderTerminalFailure(
      {
        sessionId,
        error: "printful_files_failed:poster:default=failed",
        source: "post_submit_files",
        operatorFailureAlertClaimedAt: claim.state.operatorFailureAlertClaimedAt,
        operatorFailureAlertClaimOwner: owner,
        operatorFailureAlertedAt: Date.now(),
        operatorFailureAlertProvider: "test",
      },
      { store },
    );
    return { owner, claimed: true };
  }

  const [a, b] = await Promise.all([race("worker_a"), race("worker_b")]);
  const claimedCount = [a, b].filter((r) => r.claimed).length;
  assert.equal(claimedCount, 1);
  assert.equal(sends.length, 1);

  // End-to-end post-submit + second detector also only one alert.
  const alerts = { failure: 0 };
  const terminalStore = createMemoryPrintOrderTerminalStore();
  const first = await applyPrintfulPostSubmitReview(baseRecord({ sessionId: "cs_test_claim_e2e" }), {
    terminalStore,
    failureAlertClaimOwner: "detector_1",
    reviewPrintfulOrderFiles: async () =>
      buildPrintfulOrderFileReview(12345, [{ item: "poster", type: "default", status: "failed" }]),
    sleep: async () => {},
    loadStoredPrintOrder: async () => null,
    sendPrintOrderFailureAlert: async () => {
      alerts.failure += 1;
      return { delivered: true, provider: "test" };
    },
    sendPrintOrderApprovalAlert: async () => ({ delivered: true, provider: "test" }),
  });
  assert.ok(first.operatorFailureAlertedAt);

  const second = await applyPrintfulPostSubmitReview(baseRecord({ sessionId: "cs_test_claim_e2e" }), {
    terminalStore,
    failureAlertClaimOwner: "detector_2",
    reviewPrintfulOrderFiles: async () =>
      buildPrintfulOrderFileReview(12345, [{ item: "poster", type: "default", status: "failed" }]),
    sleep: async () => {},
    loadStoredPrintOrder: async () => first,
    sendPrintOrderFailureAlert: async () => {
      alerts.failure += 1;
      return { delivered: true, provider: "test" };
    },
    sendPrintOrderApprovalAlert: async () => ({ delivered: true, provider: "test" }),
  });
  assert.equal(alerts.failure, 1);
  assert.equal(second.operatorFailureAlertedAt, first.operatorFailureAlertedAt);
});
