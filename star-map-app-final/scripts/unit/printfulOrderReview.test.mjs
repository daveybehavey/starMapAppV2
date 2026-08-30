import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildReviewFromStatuses,
  classifyPrintfulFileStatus,
  collectPrintfulFileFailures,
  collectPrintfulFilePending,
  formatPrintfulFileFailureError,
  summarizePrintfulFileReview,
} from "./printfulOrderReview.harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "../..");
const reviewSource = fs.readFileSync(path.join(appRoot, "src/lib/printfulOrderReview.ts"), "utf8");

test("classifyPrintfulFileStatus: ok healthy, waiting/unknown pending, failed confirmed", () => {
  assert.equal(classifyPrintfulFileStatus("ok"), "healthy");
  assert.equal(classifyPrintfulFileStatus("OK"), "healthy");
  assert.equal(classifyPrintfulFileStatus("waiting"), "pending");
  assert.equal(classifyPrintfulFileStatus("Waiting"), "pending");
  assert.equal(classifyPrintfulFileStatus("failed"), "failed");
  assert.equal(classifyPrintfulFileStatus("FAILED"), "failed");
  assert.equal(classifyPrintfulFileStatus("unknown"), "pending");
  assert.equal(classifyPrintfulFileStatus("processing"), "pending");
  assert.equal(classifyPrintfulFileStatus(""), "pending");
  assert.equal(classifyPrintfulFileStatus(null), "pending");
  assert.equal(classifyPrintfulFileStatus(undefined), "pending");
});

test("collectPrintfulFileFailures only includes confirmed failed (not waiting)", () => {
  const rows = [
    { item: "a", type: "default", status: "ok" },
    { item: "b", type: "default", status: "waiting" },
    { item: "c", type: "default", status: "failed" },
    { item: "d", type: "default", status: "weird" },
  ];
  assert.deepEqual(collectPrintfulFileFailures(rows), [
    { item: "c", type: "default", status: "failed" },
  ]);
  assert.deepEqual(collectPrintfulFilePending(rows), [
    { item: "b", type: "default", status: "waiting" },
    { item: "d", type: "default", status: "weird" },
  ]);
});

test("summarizePrintfulFileReview: waiting/unknown/empty/null stay pending or unavailable", () => {
  assert.equal(summarizePrintfulFileReview(null), "unavailable");
  assert.equal(summarizePrintfulFileReview(undefined), "unavailable");
  assert.equal(summarizePrintfulFileReview(buildReviewFromStatuses([])), "pending");
  assert.equal(
    summarizePrintfulFileReview(
      buildReviewFromStatuses([{ item: "a", type: "default", status: "waiting" }]),
    ),
    "pending",
  );
  assert.equal(
    summarizePrintfulFileReview(
      buildReviewFromStatuses([{ item: "a", type: "default", status: "unknown" }]),
    ),
    "pending",
  );
  assert.equal(
    summarizePrintfulFileReview(
      buildReviewFromStatuses([{ item: "a", type: "default", status: "ok" }]),
    ),
    "healthy",
  );
  assert.equal(
    summarizePrintfulFileReview(
      buildReviewFromStatuses([{ item: "a", type: "default", status: "failed" }]),
    ),
    "failed",
  );
});

test("formatPrintfulFileFailureError only for confirmed failed files", () => {
  const waiting = buildReviewFromStatuses([{ item: "a", type: "default", status: "waiting" }]);
  assert.equal(formatPrintfulFileFailureError(waiting), "");
  const failed = buildReviewFromStatuses([{ item: "Poster", type: "default", status: "failed" }]);
  assert.equal(formatPrintfulFileFailureError(failed), "printful_files_failed:Poster:default=failed");
});

test("source: classifier no longer treats any non-ok status as failure", () => {
  assert.match(reviewSource, /classifyPrintfulFileStatus/);
  assert.match(reviewSource, /normalized === "failed"/);
  assert.doesNotMatch(
    reviewSource,
    /filter\(\(row\) => row\.status && row\.status\.trim\(\)\.toLowerCase\(\) !== "ok"\)/,
  );
});
