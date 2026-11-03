/**
 * PR #502 gate round 5 — local Codex seat P2 "Freshness checks
 * disappear when the standing review is pending".
 *
 * The round-3 freshness gate guarded only RESOLVED standing states.
 * Reproduction (the seat's): a review outcome stamped at 100 is
 * delayed while its operator approval email sends; meanwhile a newer
 * review persists `pending` at 300 (for example the supported
 * failed -> pending transition). When the older outcome resumed, the
 * freshness check was bypassed because the standing state was
 * pending: the old healthy outcome replaced the newer state, cleared
 * the carried file-failure error and undelivered failure-alert
 * residue, and stamped approval — removing the order from sweep
 * candidacy with a state older than the one it replaced. Same-state
 * outcomes could likewise move fileReviewCheckedAt backward.
 *
 * Fix (in applyReviewOutcomeToCurrent, mirrored in the harness): an
 * outcome older than the standing review stamp applies NONE of its
 * review fields, whatever the standing state. Its DELIVERED alert
 * stamps are still reconciled — they evidence a send, and losing one
 * would re-send the alert on a later tick; if nothing reconciles,
 * the stale outcome is refused whole (null).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { applyReviewOutcomeToCurrent } from "./printFulfillmentPostSubmit.harness.mjs";

const PENDING_CURRENT = {
  status: "sent",
  printfulOrderId: "PF-1",
  fileReviewState: "pending",
  fileReviewCheckedAt: 300,
  fileReviewPendingSince: 200,
  error: "printful_files_failed: file rejected",
  operatorFailureAlertProvider: "resend",
  operatorFailureAlertError: "resend_500",
};

test("gate round 5: a stale healthy outcome cannot replace a newer pending state (P2-C repro)", () => {
  const merged = applyReviewOutcomeToCurrent(PENDING_CURRENT, {
    status: "sent",
    printfulOrderId: "PF-1",
    fileReviewState: "healthy",
    fileReviewCheckedAt: 100,
    operatorAlertedAt: 100,
    operatorAlertProvider: "resend",
  });
  assert.notEqual(merged, null, "the delivered approval stamp is reconciled, so the merge is not refused whole");
  assert.equal(merged.fileReviewState, "pending", "the newer pending state stands");
  assert.equal(merged.fileReviewCheckedAt, 300, "the review stamp never moves backward");
  assert.equal(merged.fileReviewPendingSince, 200, "the order stays in sweep candidacy on its episode clock");
  assert.equal(merged.error, "printful_files_failed: file rejected", "the episode error is not cleared by a stale outcome");
  assert.equal(merged.operatorFailureAlertError, "resend_500", "the undelivered failure-alert residue survives for its retry");
  assert.equal(merged.operatorFailureAlertProvider, "resend");
  assert.equal(merged.operatorAlertedAt, 100, "the delivered approval stamp is retained as evidence — it will not be re-sent");
  assert.equal(merged.operatorAlertProvider, "resend");
});

test("gate round 5: a stale outcome with nothing to reconcile is refused whole", () => {
  assert.equal(
    applyReviewOutcomeToCurrent(PENDING_CURRENT, {
      status: "sent",
      printfulOrderId: "PF-1",
      fileReviewState: "failed",
      fileReviewCheckedAt: 100,
      error: "printful_files_failed: a different, older failure",
    }),
    null,
    "an older failed outcome must not overwrite the standing episode",
  );
  assert.equal(
    applyReviewOutcomeToCurrent(PENDING_CURRENT, {
      status: "sent",
      printfulOrderId: "PF-1",
      fileReviewState: "pending",
      fileReviewCheckedAt: 200,
      fileReviewPendingSince: 200,
    }),
    null,
    "an older pending outcome must not move fileReviewCheckedAt backward",
  );
});

test("gate round 5: a same-state stale outcome cannot move the stamp backward", () => {
  const healthyCurrent = {
    status: "sent",
    printfulOrderId: "PF-1",
    fileReviewState: "healthy",
    fileReviewCheckedAt: 300,
    operatorAlertedAt: 250,
    operatorAlertProvider: "resend",
  };
  assert.equal(
    applyReviewOutcomeToCurrent(healthyCurrent, {
      status: "sent",
      printfulOrderId: "PF-1",
      fileReviewState: "healthy",
      fileReviewCheckedAt: 200,
      operatorAlertedAt: 200,
      operatorAlertProvider: "resend",
    }),
    null,
    "the standing healthy resolution and its stamp are untouched by the older twin",
  );
});

test("gate round 5: a stale outcome's delivered failure-alert stamp is still reconciled", () => {
  const merged = applyReviewOutcomeToCurrent(PENDING_CURRENT, {
    status: "sent",
    printfulOrderId: "PF-1",
    fileReviewState: "failed",
    fileReviewCheckedAt: 100,
    error: "printful_files_failed: file rejected",
    operatorFailureAlertedAt: 110,
    operatorFailureAlertProvider: "resend",
  });
  assert.notEqual(merged, null);
  assert.equal(merged.fileReviewState, "pending", "the review state does not regress");
  assert.equal(merged.fileReviewCheckedAt, 300);
  assert.equal(merged.operatorFailureAlertedAt, 110, "the delivered failure-alert evidence is retained");
  assert.equal(merged.operatorFailureAlertError, undefined, "the delivered stamp supersedes the standing undelivered residue");
});

test("gate round 5: fresher outcomes over a pending standing state still apply in full", () => {
  const rechecked = applyReviewOutcomeToCurrent(
    {
      status: "sent",
      printfulOrderId: "PF-1",
      fileReviewState: "pending",
      fileReviewCheckedAt: 100,
      fileReviewPendingSince: 100,
    },
    {
      status: "sent",
      printfulOrderId: "PF-1",
      fileReviewState: "pending",
      fileReviewCheckedAt: 400,
      fileReviewPendingSince: 400,
    },
  );
  assert.notEqual(rechecked, null);
  assert.equal(rechecked.fileReviewState, "pending");
  assert.equal(rechecked.fileReviewCheckedAt, 400, "a fresher re-check advances the stamp");
  assert.equal(rechecked.fileReviewPendingSince, 100, "the episode clock keeps its earliest observation");

  const failed = applyReviewOutcomeToCurrent(
    {
      status: "sent",
      printfulOrderId: "PF-1",
      fileReviewState: "pending",
      fileReviewCheckedAt: 100,
      fileReviewPendingSince: 100,
    },
    {
      status: "sent",
      printfulOrderId: "PF-1",
      fileReviewState: "failed",
      fileReviewCheckedAt: 200,
      error: "printful_files_failed: file rejected",
      operatorFailureAlertedAt: 200,
      operatorFailureAlertProvider: "resend",
    },
  );
  assert.notEqual(failed, null);
  assert.equal(failed.fileReviewState, "failed");
  assert.equal(failed.error, "printful_files_failed: file rejected");
  assert.equal(failed.operatorFailureAlertedAt, 200);
});
