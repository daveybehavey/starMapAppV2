import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyPrintfulFileStatus,
  collectPrintfulFileFailures,
  collectPrintfulPendingFiles,
  resolvePrintfulFileReviewOutcome,
  resolvePrintfulPostSubmitFileOutcome,
} from "./printfulOrderReview.harness.mjs";

test("classify: ok / waiting / failed / unknown", () => {
  assert.equal(classifyPrintfulFileStatus("ok"), "ok");
  assert.equal(classifyPrintfulFileStatus("WAITING"), "waiting");
  assert.equal(classifyPrintfulFileStatus("failed"), "failed");
  assert.equal(classifyPrintfulFileStatus("processing"), "unknown");
  assert.equal(classifyPrintfulFileStatus("  "), "empty");
});

test("waiting is pending, not failure", () => {
  const rows = [
    { item: "poster", type: "default", status: "waiting" },
    { item: "poster", type: "preview", status: "ok" },
  ];
  assert.equal(collectPrintfulFileFailures(rows).length, 0);
  assert.equal(collectPrintfulPendingFiles(rows).length, 1);
  assert.equal(
    resolvePrintfulFileReviewOutcome({
      failedFiles: collectPrintfulFileFailures(rows),
      pendingFiles: collectPrintfulPendingFiles(rows),
    }),
    "pending",
  );
});

test("failed is confirmed failure", () => {
  const rows = [{ item: "poster", type: "default", status: "failed" }];
  assert.equal(collectPrintfulFileFailures(rows).length, 1);
  assert.equal(
    resolvePrintfulFileReviewOutcome({
      failedFiles: collectPrintfulFileFailures(rows),
      pendingFiles: collectPrintfulPendingFiles(rows),
    }),
    "failed",
  );
});

test("scenario4: pending rereview unavailable/null remains pending", async () => {
  const result = await resolvePrintfulPostSubmitFileOutcome({
    printfulOrderId: 1,
    reviewPrintfulOrderFiles: async () => null,
    preservePendingOnUnavailable: true,
    maxAttempts: 2,
    retryDelaysMs: [0],
    sleep: async () => undefined,
  });
  assert.equal(result.outcome, "pending");
  assert.equal(result.review, null);
});

test("bounded recheck: waiting then ok resolves healthy without failure", async () => {
  let n = 0;
  const result = await resolvePrintfulPostSubmitFileOutcome({
    printfulOrderId: 1,
    reviewPrintfulOrderFiles: async () => {
      n += 1;
      if (n === 1) {
        return {
          failedFiles: [],
          pendingFiles: [{ item: "a", type: "default", status: "waiting" }],
        };
      }
      return { failedFiles: [], pendingFiles: [] };
    },
    maxAttempts: 3,
    retryDelaysMs: [0, 0],
    sleep: async () => undefined,
  });
  assert.equal(result.outcome, "ok");
  assert.equal(n, 2);
});
