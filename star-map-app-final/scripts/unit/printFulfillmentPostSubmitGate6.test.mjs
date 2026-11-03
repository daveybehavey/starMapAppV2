/**
 * PR #502 gate round 6 (FINAL) — Codex bot P2 "Reconcile delivered
 * alert stamps before rejecting stale resolutions".
 *
 * The round-3 resolved-to-different guard returned null BEFORE the
 * round-5 stale-outcome reconciliation could run. The bot's fixture:
 * a healthy review is delayed during approval-email delivery while a
 * newer failed review persists without a delivered failure alert.
 * The delayed outcome (reviewed at 100, its approval stamp delivered
 * at 400) then meets the standing failed resolution (300): the early
 * return discarded the delivered approval stamp, the failed record
 * stayed sweep-eligible, and a subsequent healthy lookup sent another
 * approval email.
 *
 * Fix (in applyReviewOutcomeToCurrent, mirrored in the harness): the
 * resolved-to-different refusal folds into the stale-outcome path —
 * a refused outcome applies none of its review fields, but its
 * DELIVERED alert stamps are reconciled exactly as for any stale
 * outcome, and the merge returns null only when nothing reconciled.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { applyReviewOutcomeToCurrent } from "./printFulfillmentPostSubmit.harness.mjs";

const FAILED_CURRENT = {
  status: "sent",
  printfulOrderId: "PF-1",
  fileReviewState: "failed",
  fileReviewCheckedAt: 300,
  error: "printful_files_failed: file rejected",
  operatorFailureAlertProvider: "resend",
  operatorFailureAlertError: "resend_500",
};

test("gate round 6: a delayed healthy outcome's delivered approval stamp survives a newer failed resolution (bot fixture)", () => {
  const merged = applyReviewOutcomeToCurrent(FAILED_CURRENT, {
    status: "sent",
    printfulOrderId: "PF-1",
    fileReviewState: "healthy",
    fileReviewCheckedAt: 100,
    operatorAlertedAt: 400,
    operatorAlertProvider: "resend",
  });
  assert.notEqual(merged, null, "the delivered approval stamp is reconciled, so the merge is not refused whole");
  assert.equal(merged.fileReviewState, "failed", "the newer failed disposition stands");
  assert.equal(merged.fileReviewCheckedAt, 300, "the review stamp never moves backward");
  assert.equal(merged.error, "printful_files_failed: file rejected", "the standing failure error is untouched");
  assert.equal(merged.operatorAlertedAt, 400, "the delivered approval stamp is NOT lost — no duplicate approval email on a later tick");
  assert.equal(merged.operatorAlertProvider, "resend");
  assert.equal(merged.operatorFailureAlertedAt, undefined, "the failure alert is still owed — the record remains sweep-eligible for it");
  assert.equal(merged.operatorFailureAlertError, "resend_500", "the undelivered failure-alert residue survives for its retry");
});

test("gate round 6: a stale resolved-to-different outcome with nothing to reconcile is still refused whole", () => {
  assert.equal(
    applyReviewOutcomeToCurrent(FAILED_CURRENT, {
      status: "sent",
      printfulOrderId: "PF-1",
      fileReviewState: "healthy",
      fileReviewCheckedAt: 100,
    }),
    null,
    "no delivered stamp evidence — the stale resolution change is refused, as before",
  );
});

test("gate round 6: a delayed failed outcome's delivered failure stamp survives a newer healthy resolution", () => {
  const healthyCurrent = {
    status: "sent",
    printfulOrderId: "PF-1",
    fileReviewState: "healthy",
    fileReviewCheckedAt: 300,
    operatorAlertedAt: 300,
    operatorAlertProvider: "resend",
  };
  const merged = applyReviewOutcomeToCurrent(healthyCurrent, {
    status: "sent",
    printfulOrderId: "PF-1",
    fileReviewState: "failed",
    fileReviewCheckedAt: 100,
    error: "printful_files_failed: file rejected",
    operatorFailureAlertedAt: 400,
    operatorFailureAlertProvider: "resend",
  });
  assert.notEqual(merged, null, "the delivered failure stamp is reconciled");
  assert.equal(merged.fileReviewState, "healthy", "the newer healthy disposition stands");
  assert.equal(merged.fileReviewCheckedAt, 300);
  assert.equal(merged.error, undefined, "the stale outcome's failure error is not applied");
  assert.equal(merged.operatorFailureAlertedAt, 400, "the delivered failure-alert evidence is retained — it will not be re-sent");
  assert.equal(merged.operatorFailureAlertProvider, "resend");
});

test("gate round 6: an unstamped resolved-to-different outcome reconciles delivered stamps but cannot supersede", () => {
  const merged = applyReviewOutcomeToCurrent(FAILED_CURRENT, {
    status: "sent",
    printfulOrderId: "PF-1",
    fileReviewState: "healthy",
    operatorAlertedAt: 400,
    operatorAlertProvider: "resend",
  });
  assert.notEqual(merged, null, "delivered evidence reconciles even when the outcome carries no review stamp");
  assert.equal(merged.fileReviewState, "failed", "an unstamped outcome never supersedes a stamped resolution");
  assert.equal(merged.fileReviewCheckedAt, 300);
  assert.equal(merged.operatorAlertedAt, 400);
  assert.equal(
    applyReviewOutcomeToCurrent(FAILED_CURRENT, {
      status: "sent",
      printfulOrderId: "PF-1",
      fileReviewState: "healthy",
    }),
    null,
    "an unstamped outcome with no delivered evidence is refused whole",
  );
});
