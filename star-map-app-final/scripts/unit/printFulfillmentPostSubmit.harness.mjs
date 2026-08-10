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

export function isPrintfulFileReviewPending(record) {
  return typeof record.printfulFileReviewPendingAt === "number" && record.printfulFileReviewPendingAt > 0;
}

export function shouldSendAlreadySentApprovalAlert(record) {
  return (
    record.status === "sent" &&
    !record.operatorAlertedAt &&
    !isPrintfulFileReviewPending(record) &&
    !record.error
  );
}

export function shouldRereviewPrintfulFilesOnAlreadySent(record) {
  return record.status === "sent" && isPrintfulFileReviewPending(record) && Boolean(record.printfulOrderId);
}

export function preferStoredTerminalFailure(candidate, stored) {
  if (!stored) return null;
  if (stored.status === "failed") return stored;
  return null;
}

export async function resolvePrintfulPostSubmitFileOutcome(input) {
  const maxAttempts = Math.max(1, input.maxAttempts ?? PRINTFUL_POST_SUBMIT_FILE_REVIEW_MAX_ATTEMPTS);
  const delays = input.retryDelaysMs ?? PRINTFUL_POST_SUBMIT_FILE_REVIEW_RETRY_DELAYS_MS;
  const sleep = input.sleep ?? defaultSleep;
  const preservePendingOnUnavailable = Boolean(input.preservePendingOnUnavailable);

  let review = null;
  let outcome = preservePendingOnUnavailable ? "pending" : "ok";
  let attempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      const delay = delays[attempt - 2] ?? delays[delays.length - 1] ?? 0;
      if (delay > 0) await sleep(delay);
    }

    review = await input.reviewPrintfulOrderFiles(input.printfulOrderId);
    attempts = attempt;

    if (!review) {
      if (outcome === "pending" || preservePendingOnUnavailable) {
        outcome = "pending";
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
  const loadStored = deps.loadStoredPrintOrder ?? (async () => null);
  const alreadyPending = isPrintfulFileReviewPending(sentRecord);

  const { outcome, review } = await resolvePrintfulPostSubmitFileOutcome({
    printfulOrderId: sentRecord.printfulOrderId,
    reviewPrintfulOrderFiles: reviewFn,
    sleep: deps.sleep,
    maxAttempts: deps.maxAttempts,
    retryDelaysMs: deps.retryDelaysMs,
    preservePendingOnUnavailable: alreadyPending,
  });

  const stored = await loadStored(sentRecord.sessionId);
  const terminal = preferStoredTerminalFailure(sentRecord, stored);
  if (terminal) {
    return terminal;
  }

  if (outcome === "failed" && review?.failedFiles.length) {
    const failedRecord = {
      ...sentRecord,
      error: formatPrintfulFileFailureError(review),
      printfulFileReviewPendingAt: undefined,
    };
    if (stored?.operatorFailureAlertedAt) {
      failedRecord.operatorFailureAlertedAt = stored.operatorFailureAlertedAt;
      failedRecord.operatorFailureAlertProvider = stored.operatorFailureAlertProvider;
      failedRecord.operatorFailureAlertError = stored.operatorFailureAlertError;
      return failedRecord;
    }
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
    const afterAlert = await loadStored(sentRecord.sessionId);
    const afterTerminal = preferStoredTerminalFailure(failedRecord, afterAlert);
    if (afterTerminal) {
      if (!afterTerminal.operatorFailureAlertedAt && failedRecord.operatorFailureAlertedAt) {
        return {
          ...afterTerminal,
          operatorFailureAlertedAt: failedRecord.operatorFailureAlertedAt,
          operatorFailureAlertProvider: failedRecord.operatorFailureAlertProvider,
          operatorFailureAlertError: failedRecord.operatorFailureAlertError,
        };
      }
      return afterTerminal;
    }
    return failedRecord;
  }

  if (outcome === "pending") {
    return {
      ...sentRecord,
      printfulFileReviewPendingAt: sentRecord.printfulFileReviewPendingAt ?? Date.now(),
    };
  }

  const healthyRecord = {
    ...sentRecord,
    printfulFileReviewPendingAt: undefined,
    error: sentRecord.error?.startsWith("printful_files_failed:") ? undefined : sentRecord.error,
  };

  if (!healthyRecord.operatorAlertedAt) {
    const alertResult = await approvalAlert(healthyRecord);
    if (alertResult.delivered) {
      healthyRecord.operatorAlertedAt = Date.now();
      healthyRecord.operatorAlertProvider = alertResult.provider;
      healthyRecord.operatorAlertError = undefined;
    } else {
      healthyRecord.operatorAlertProvider = alertResult.provider;
      healthyRecord.operatorAlertError = alertResult.error;
    }
  }

  const afterApproval = await loadStored(sentRecord.sessionId);
  const approvalTerminal = preferStoredTerminalFailure(healthyRecord, afterApproval);
  if (approvalTerminal) {
    return approvalTerminal;
  }

  return healthyRecord;
}

/** Mirrors already-sent retry gating in print/orders/retry/route.ts */
export async function applyAlreadySentRetryReview(existing, deps = {}) {
  if (shouldRereviewPrintfulFilesOnAlreadySent(existing)) {
    return applyPrintfulPostSubmitReview(existing, deps);
  }
  if (shouldSendAlreadySentApprovalAlert(existing)) {
    const approvalAlert = deps.sendPrintOrderApprovalAlert ?? (async () => ({ delivered: false, provider: "none" }));
    const alertResult = await approvalAlert(existing);
    return {
      ...existing,
      operatorAlertedAt: alertResult.delivered ? Date.now() : existing.operatorAlertedAt,
      operatorAlertProvider: alertResult.provider,
      operatorAlertError: alertResult.delivered ? undefined : alertResult.error,
    };
  }
  return existing;
}
