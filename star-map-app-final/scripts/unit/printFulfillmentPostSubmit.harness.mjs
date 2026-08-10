/** Keep in sync with src/lib/printFulfillmentPostSubmit.ts */
import {
  formatPrintfulFileFailureError,
  resolvePrintfulFileReviewOutcome,
} from "./printfulOrderReview.harness.mjs";

export const PRINTFUL_POST_SUBMIT_FILE_REVIEW_MAX_ATTEMPTS = 3;
export const PRINTFUL_POST_SUBMIT_FILE_REVIEW_RETRY_DELAYS_MS = [750, 1500];

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function resolvePrintfulPostSubmitFileOutcome(input) {
  const maxAttempts = Math.max(1, input.maxAttempts ?? PRINTFUL_POST_SUBMIT_FILE_REVIEW_MAX_ATTEMPTS);
  const delays = input.retryDelaysMs ?? PRINTFUL_POST_SUBMIT_FILE_REVIEW_RETRY_DELAYS_MS;
  const sleep = input.sleep ?? defaultSleep;

  let review = null;
  let outcome = "ok";
  let attempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      const delay = delays[attempt - 2] ?? delays[delays.length - 1] ?? 0;
      if (delay > 0) await sleep(delay);
    }

    review = await input.reviewPrintfulOrderFiles(input.printfulOrderId);
    attempts = attempt;

    if (!review) {
      if (outcome === "pending") {
        continue;
      }
      return { outcome: "ok", review: null, attempts };
    }

    outcome = resolvePrintfulFileReviewOutcome(review);
    if (outcome !== "pending") {
      return { outcome, review, attempts };
    }
  }

  return { outcome: "pending", review, attempts };
}

export async function applyPrintfulPostSubmitReview(sentRecord, deps = {}) {
  if (!sentRecord.printfulOrderId) {
    return sentRecord;
  }

  const reviewFn = deps.reviewPrintfulOrderFiles;
  if (typeof reviewFn !== "function") {
    throw new Error("reviewPrintfulOrderFiles dependency required in harness");
  }
  const failureAlert = deps.sendPrintOrderFailureAlert ?? (async () => ({ delivered: false, provider: "none" }));
  const approvalAlert = deps.sendPrintOrderApprovalAlert ?? (async () => ({ delivered: false, provider: "none" }));

  const { outcome, review } = await resolvePrintfulPostSubmitFileOutcome({
    printfulOrderId: sentRecord.printfulOrderId,
    reviewPrintfulOrderFiles: reviewFn,
    sleep: deps.sleep,
    maxAttempts: deps.maxAttempts,
    retryDelaysMs: deps.retryDelaysMs,
  });

  if (outcome === "failed" && review?.failedFiles.length) {
    const failedRecord = {
      ...sentRecord,
      error: formatPrintfulFileFailureError(review),
    };
    if (!failedRecord.operatorFailureAlertedAt) {
      const alertResult = await failureAlert(failedRecord);
      if (alertResult.delivered) {
        failedRecord.operatorFailureAlertedAt = Date.now();
        failedRecord.operatorFailureAlertProvider = alertResult.provider;
        failedRecord.operatorFailureAlertError = undefined;
      } else {
        failedRecord.operatorFailureAlertProvider = alertResult.provider;
        failedRecord.operatorFailureAlertError = alertResult.error;
      }
    }
    return failedRecord;
  }

  if (outcome === "pending") {
    return sentRecord;
  }

  if (!sentRecord.operatorAlertedAt) {
    const alertResult = await approvalAlert(sentRecord);
    if (alertResult.delivered) {
      sentRecord.operatorAlertedAt = Date.now();
      sentRecord.operatorAlertProvider = alertResult.provider;
      sentRecord.operatorAlertError = undefined;
    } else {
      sentRecord.operatorAlertProvider = alertResult.provider;
      sentRecord.operatorAlertError = alertResult.error;
    }
  }

  return sentRecord;
}
