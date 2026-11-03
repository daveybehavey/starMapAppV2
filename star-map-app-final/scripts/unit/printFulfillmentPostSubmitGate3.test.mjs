/**
 * PR #502 gate round 3 — Codex P2 "Separate resolved-alert retries
 * from file re-review".
 *
 * The F8 merge used to reject EVERY resolved-to-different review
 * transition. Reproduction (the bot's): a failed review whose
 * operator failure alert was undelivered; the files are corrected
 * before the next sweep tick; the sweep re-reviews as healthy and
 * sends the approval alert — but the merge returned null, the
 * delivered approval stamp never persisted, and every subsequent
 * tick sent another approval email while the record stayed failed.
 *
 * Fix (in applyReviewOutcomeToCurrent, mirrored in the harness): a
 * resolution may be superseded by a review outcome that is at least
 * as fresh (fileReviewCheckedAt on both records, incoming >=
 * standing); a stale or unstamped outcome still cannot regress a
 * resolution. A failed-to-healthy supersede closes the failed
 * episode (its error + undelivered failure-alert error are cleared)
 * while preserving the newly delivered approval stamp.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { applyReviewOutcomeToCurrent } from "./printFulfillmentPostSubmit.harness.mjs";

const FAILED_CURRENT = {
  status: "sent",
  printfulOrderId: "PF-1",
  fileReviewState: "failed",
  fileReviewCheckedAt: 100,
  error: "printful_files_failed: file rejected",
  operatorFailureAlertProvider: "resend",
  operatorFailureAlertError: "resend_500",
};

test("gate round 3: a fresher healthy outcome supersedes a failed resolution and keeps its delivered approval stamp", () => {
  const reviewed = {
    status: "sent",
    printfulOrderId: "PF-1",
    fileReviewState: "healthy",
    fileReviewCheckedAt: 200,
    operatorAlertedAt: 200,
    operatorAlertProvider: "resend",
  };
  const merged = applyReviewOutcomeToCurrent(FAILED_CURRENT, reviewed);
  assert.notEqual(merged, null, "the fresh healthy outcome must merge, not be rejected");
  assert.equal(merged.fileReviewState, "healthy");
  assert.equal(merged.fileReviewCheckedAt, 200);
  assert.equal(merged.operatorAlertedAt, 200, "the delivered approval stamp persists — the next tick will not re-send it");
  assert.equal(merged.error, undefined, "the closed episode's file-failure error does not carry into the healthy record");
  assert.equal(merged.operatorFailureAlertError, undefined, "the undelivered failure alert is moot once the order is healthy");
  assert.equal(merged.operatorFailureAlertProvider, undefined);

  // Second tick: the same outcome against the now-healthy record is
  // no longer a transition at all, and the stamp stands.
  const again = applyReviewOutcomeToCurrent(merged, reviewed);
  assert.notEqual(again, null);
  assert.equal(again.operatorAlertedAt, 200);
  assert.equal(again.fileReviewState, "healthy");
});

test("gate round 3: stale or unstamped outcomes still cannot regress a resolution", () => {
  const healthyCurrent = {
    status: "sent",
    printfulOrderId: "PF-1",
    fileReviewState: "healthy",
    fileReviewCheckedAt: 300,
    operatorAlertedAt: 250,
  };
  assert.equal(
    applyReviewOutcomeToCurrent(healthyCurrent, {
      status: "sent",
      printfulOrderId: "PF-1",
      fileReviewState: "failed",
      fileReviewCheckedAt: 200,
      error: "printful_files_failed: file rejected",
    }),
    null,
    "an older failed outcome must not regress a healthy resolution",
  );
  assert.equal(
    applyReviewOutcomeToCurrent(FAILED_CURRENT, {
      status: "sent",
      printfulOrderId: "PF-1",
      fileReviewState: "pending",
      fileReviewCheckedAt: 50,
    }),
    null,
    "an older pending outcome must not regress a failed resolution",
  );
  assert.equal(
    applyReviewOutcomeToCurrent(
      { status: "sent", printfulOrderId: "PF-1", fileReviewState: "failed" },
      { status: "sent", printfulOrderId: "PF-1", fileReviewState: "healthy", fileReviewCheckedAt: 200 },
    ),
    null,
    "a resolution without a review stamp cannot be superseded",
  );
});

test("gate round 3: an equally fresh outcome may supersede (same-tick re-check)", () => {
  const merged = applyReviewOutcomeToCurrent(FAILED_CURRENT, {
    status: "sent",
    printfulOrderId: "PF-1",
    fileReviewState: "healthy",
    fileReviewCheckedAt: 100,
    operatorAlertedAt: 100,
    operatorAlertProvider: "resend",
  });
  assert.notEqual(merged, null);
  assert.equal(merged.fileReviewState, "healthy");
  assert.equal(merged.operatorAlertedAt, 100);
});

test("gate round 3: a fresher failed outcome supersedes a healthy resolution and writes its error", () => {
  const healthyCurrent = {
    status: "sent",
    printfulOrderId: "PF-1",
    fileReviewState: "healthy",
    fileReviewCheckedAt: 100,
    operatorAlertedAt: 90,
    operatorAlertProvider: "resend",
  };
  const merged = applyReviewOutcomeToCurrent(healthyCurrent, {
    status: "sent",
    printfulOrderId: "PF-1",
    fileReviewState: "failed",
    fileReviewCheckedAt: 200,
    error: "printful_files_failed: file rejected",
    operatorFailureAlertedAt: 200,
    operatorFailureAlertProvider: "resend",
  });
  assert.notEqual(merged, null);
  assert.equal(merged.fileReviewState, "failed");
  assert.equal(merged.error, "printful_files_failed: file rejected");
  assert.equal(merged.operatorFailureAlertedAt, 200);
  assert.equal(merged.operatorAlertedAt, 90, "the earlier delivered approval stamp remains as history");
});
