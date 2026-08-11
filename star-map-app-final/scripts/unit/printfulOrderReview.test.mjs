import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildPrintfulOrderFileReview,
  classifyPrintfulFileStatus,
  collectPrintfulFileFailures,
  collectPrintfulPendingFiles,
  formatPrintfulFileFailureError,
  resolvePrintfulFileReviewOutcome,
} from "./printfulOrderReview.harness.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const reviewSrc = readFileSync(join(root, "src/lib/printfulOrderReview.ts"), "utf8");

test("classifyPrintfulFileStatus maps provider contract", () => {
  assert.equal(classifyPrintfulFileStatus("ok"), "ok");
  assert.equal(classifyPrintfulFileStatus(" OK "), "ok");
  assert.equal(classifyPrintfulFileStatus("waiting"), "waiting");
  assert.equal(classifyPrintfulFileStatus("Waiting"), "waiting");
  assert.equal(classifyPrintfulFileStatus("failed"), "failed");
  assert.equal(classifyPrintfulFileStatus("processing"), "unknown");
  assert.equal(classifyPrintfulFileStatus(""), "empty");
  assert.equal(classifyPrintfulFileStatus("   "), "empty");
});

test("collectPrintfulFileFailures only includes confirmed failed", () => {
  const rows = [
    { item: "poster", type: "default", status: "ok" },
    { item: "poster", type: "preview", status: "waiting" },
    { item: "poster", type: "default", status: "failed" },
    { item: "poster", type: "default", status: "weird_status" },
    { item: "poster", type: "default", status: "" },
  ];
  assert.deepEqual(collectPrintfulFileFailures(rows), [
    { item: "poster", type: "default", status: "failed" },
  ]);
});

test("collectPrintfulPendingFiles includes waiting and unknown only", () => {
  const rows = [
    { item: "poster", type: "default", status: "ok" },
    { item: "poster", type: "preview", status: "waiting" },
    { item: "poster", type: "default", status: "failed" },
    { item: "poster", type: "default", status: "queued" },
  ];
  assert.deepEqual(collectPrintfulPendingFiles(rows), [
    { item: "poster", type: "preview", status: "waiting" },
    { item: "poster", type: "default", status: "queued" },
  ]);
});

test("ok review outcome is clean", () => {
  const review = buildPrintfulOrderFileReview(1, [{ item: "poster", type: "default", status: "ok" }]);
  assert.equal(resolvePrintfulFileReviewOutcome(review), "ok");
  assert.equal(formatPrintfulFileFailureError(review), "");
  assert.equal(review.failedFiles.length, 0);
  assert.equal(review.pendingFiles.length, 0);
});

test("waiting is pending, not printful_files_failed", () => {
  const review = buildPrintfulOrderFileReview(1, [{ item: "poster", type: "default", status: "waiting" }]);
  assert.equal(resolvePrintfulFileReviewOutcome(review), "pending");
  assert.equal(review.failedFiles.length, 0);
  assert.equal(formatPrintfulFileFailureError(review), "");
  assert.equal(formatPrintfulFileFailureError(review).includes("printful_files_failed"), false);
});

test("waiting is not final successful approval", () => {
  const review = buildPrintfulOrderFileReview(1, [{ item: "poster", type: "default", status: "waiting" }]);
  assert.notEqual(resolvePrintfulFileReviewOutcome(review), "ok");
});

test("failed still produces printful_files_failed summary", () => {
  const review = buildPrintfulOrderFileReview(1, [
    { item: "poster", type: "default", status: "failed" },
  ]);
  assert.equal(resolvePrintfulFileReviewOutcome(review), "failed");
  assert.equal(formatPrintfulFileFailureError(review), "printful_files_failed:poster:default=failed");
});

test("unknown status is pending fail-safe, not confirmed failure or approval", () => {
  const review = buildPrintfulOrderFileReview(1, [
    { item: "poster", type: "default", status: "unexpected_provider_state" },
  ]);
  assert.equal(resolvePrintfulFileReviewOutcome(review), "pending");
  assert.equal(review.failedFiles.length, 0);
  assert.equal(formatPrintfulFileFailureError(review), "");
  assert.notEqual(resolvePrintfulFileReviewOutcome(review), "ok");
});

test("failure summary does not include raw provider payloads or secrets", () => {
  const review = buildPrintfulOrderFileReview(99, [
    { item: "poster", type: "default", status: "failed" },
  ]);
  const err = formatPrintfulFileFailureError(review);
  assert.match(err, /^printful_files_failed:/);
  assert.equal(err.includes("Bearer"), false);
  assert.equal(err.includes("token"), false);
  assert.equal(err.includes("http"), false);
  assert.equal(err.includes("{"), false);
  assert.equal(err.includes("email"), false);
});

test("source review module keeps waiting out of confirmed-failure collection", () => {
  assert.match(reviewSrc, /classifyPrintfulFileStatus/);
  assert.match(reviewSrc, /collectPrintfulPendingFiles/);
  assert.match(reviewSrc, /===\s*"waiting"/);
  assert.match(reviewSrc, /===\s*"failed"/);
  assert.equal(reviewSrc.includes('!== "ok"'), false);
});
