import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildPrintfulOrderFileReview } from "./printfulOrderReview.harness.mjs";
import {
  PRINTFUL_POST_SUBMIT_FILE_REVIEW_MAX_ATTEMPTS,
  PRINTFUL_POST_SUBMIT_FILE_REVIEW_RETRY_DELAYS_MS,
  applyPrintfulPostSubmitReview,
  resolvePrintfulPostSubmitFileOutcome,
} from "./printFulfillmentPostSubmit.harness.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const postSubmitSrc = readFileSync(join(root, "src/lib/printFulfillmentPostSubmit.ts"), "utf8");

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
  const result = await applyPrintfulPostSubmitReview(baseRecord(), {
    reviewPrintfulOrderFiles: async () =>
      buildPrintfulOrderFileReview(12345, [{ item: "poster", type: "default", status: "ok" }]),
    sleep: async () => {},
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
  assert.equal(String(result.error || "").includes("printful_files_failed"), false);
});

test("waiting does not produce printful_files_failed or failure alert", async () => {
  const alerts = { failure: 0, approval: 0 };
  const result = await applyPrintfulPostSubmitReview(baseRecord(), {
    maxAttempts: 2,
    retryDelaysMs: [0, 0],
    sleep: async () => {},
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
  assert.equal(String(result.error || "").includes("printful_files_failed"), false);
});

test("waiting is not treated as final successful approval before resolve", async () => {
  const statuses = ["waiting", "waiting", "ok"];
  let calls = 0;
  const result = await applyPrintfulPostSubmitReview(baseRecord(), {
    maxAttempts: 3,
    retryDelaysMs: [0, 0],
    sleep: async () => {},
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
});

test("failed still produces failure signal and alert", async () => {
  const alerts = { failure: 0, approval: 0 };
  const result = await applyPrintfulPostSubmitReview(baseRecord(), {
    reviewPrintfulOrderFiles: async () =>
      buildPrintfulOrderFileReview(12345, [{ item: "poster", type: "default", status: "failed" }]),
    sleep: async () => {},
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
});

test("unknown status is fail-safe: no confirmed failure alert and no approval", async () => {
  const alerts = { failure: 0, approval: 0 };
  const result = await applyPrintfulPostSubmitReview(baseRecord(), {
    maxAttempts: 2,
    retryDelaysMs: [0],
    sleep: async () => {},
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

test("post-submit source keeps bounded read-only recheck and no provider mutation APIs", () => {
  assert.match(postSubmitSrc, /PRINTFUL_POST_SUBMIT_FILE_REVIEW_MAX_ATTEMPTS/);
  assert.match(postSubmitSrc, /resolvePrintfulPostSubmitFileOutcome/);
  assert.match(postSubmitSrc, /outcome === "pending"/);
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
    sendPrintOrderFailureAlert: async (record) => {
      assert.equal(JSON.stringify(record).includes("Bearer"), false);
      assert.equal(String(record.error || "").includes("{"), false);
      return { delivered: true, provider: "test" };
    },
    sendPrintOrderApprovalAlert: async () => ({ delivered: true, provider: "test" }),
  });
  assert.match(result.error || "", /^printful_files_failed:/);
});
