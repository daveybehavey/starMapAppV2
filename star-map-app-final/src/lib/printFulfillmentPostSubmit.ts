import { kv } from "@/lib/kv";
import type { PrintOrderRecord } from "@/lib/printOrders";
import { printOrderKey } from "@/lib/printOrders";
import { sendPrintOrderApprovalAlert, sendPrintOrderFailureAlert } from "@/lib/printOrderAlerts";
import {
  formatPrintfulFileFailureError,
  resolvePrintfulFileReviewOutcome,
  reviewPrintfulOrderFiles,
  type PrintfulFileReviewOutcome,
  type PrintfulOrderFileReview,
} from "@/lib/printfulOrderReview";

/** Hard cap on read-only file-status polls after submit (includes the initial read). */
export const PRINTFUL_POST_SUBMIT_FILE_REVIEW_MAX_ATTEMPTS = 3;

/** Backoff between rechecks (ms). Length must be maxAttempts - 1. */
export const PRINTFUL_POST_SUBMIT_FILE_REVIEW_RETRY_DELAYS_MS = [750, 1500] as const;

export type PrintfulPostSubmitReviewDeps = {
  reviewPrintfulOrderFiles?: typeof reviewPrintfulOrderFiles;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  retryDelaysMs?: readonly number[];
  sendPrintOrderFailureAlert?: typeof sendPrintOrderFailureAlert;
  sendPrintOrderApprovalAlert?: typeof sendPrintOrderApprovalAlert;
  /** Re-read durable order state after polling (webhook races). Defaults to KV. */
  loadStoredPrintOrder?: (sessionId: string) => Promise<PrintOrderRecord | null>;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function defaultLoadStoredPrintOrder(sessionId: string): Promise<PrintOrderRecord | null> {
  return kv.get<PrintOrderRecord>(printOrderKey(sessionId));
}

export function isPrintfulFileReviewPending(record: Pick<PrintOrderRecord, "printfulFileReviewPendingAt">): boolean {
  return typeof record.printfulFileReviewPendingAt === "number" && record.printfulFileReviewPendingAt > 0;
}

/** Already-sent retry may only approve when provider file review is not pending and not failed. */
export function shouldSendAlreadySentApprovalAlert(
  record: Pick<PrintOrderRecord, "status" | "operatorAlertedAt" | "printfulFileReviewPendingAt" | "error">,
): boolean {
  return (
    record.status === "sent" &&
    !record.operatorAlertedAt &&
    !isPrintfulFileReviewPending(record) &&
    !record.error
  );
}

export function shouldRereviewPrintfulFilesOnAlreadySent(
  record: Pick<PrintOrderRecord, "status" | "printfulOrderId" | "printfulFileReviewPendingAt">,
): boolean {
  return record.status === "sent" && isPrintfulFileReviewPending(record) && Boolean(record.printfulOrderId);
}

/**
 * Prefer a concurrently persisted terminal failure (e.g. order_failed webhook)
 * over a stale in-memory post-submit snapshot.
 */
export function preferStoredTerminalFailure(
  _candidate: PrintOrderRecord,
  stored: PrintOrderRecord | null | undefined,
): PrintOrderRecord | null {
  if (!stored) return null;
  if (stored.status === "failed") return stored;
  return null;
}

/**
 * Read-only bounded recheck until file statuses resolve to ok/failed, or attempts exhaust.
 * Never mutates Printful orders (no create/confirm/cancel).
 */
export async function resolvePrintfulPostSubmitFileOutcome(input: {
  printfulOrderId: string | number;
  reviewPrintfulOrderFiles: (orderId: string | number) => Promise<PrintfulOrderFileReview | null>;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  retryDelaysMs?: readonly number[];
  /**
   * When the durable record is already pending, a null/unavailable provider GET must stay
   * pending — never be treated as healthy approval.
   */
  preservePendingOnUnavailable?: boolean;
}): Promise<{
  outcome: PrintfulFileReviewOutcome;
  review: PrintfulOrderFileReview | null;
  attempts: number;
}> {
  const maxAttempts = Math.max(1, input.maxAttempts ?? PRINTFUL_POST_SUBMIT_FILE_REVIEW_MAX_ATTEMPTS);
  const delays = input.retryDelaysMs ?? PRINTFUL_POST_SUBMIT_FILE_REVIEW_RETRY_DELAYS_MS;
  const sleep = input.sleep ?? defaultSleep;
  const preservePendingOnUnavailable = Boolean(input.preservePendingOnUnavailable);

  let review: PrintfulOrderFileReview | null = null;
  let outcome: PrintfulFileReviewOutcome = preservePendingOnUnavailable ? "pending" : "ok";
  let attempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      const delay = delays[attempt - 2] ?? delays[delays.length - 1] ?? 0;
      if (delay > 0) await sleep(delay);
    }

    review = await input.reviewPrintfulOrderFiles(input.printfulOrderId);
    attempts = attempt;

    if (!review) {
      // Unavailable GET: keep pending if we already observed pending (in-loop or durable).
      // First-submit legacy: null with no prior pending observation still proceeds as ok.
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

export async function applyPrintfulPostSubmitReview(
  sentRecord: PrintOrderRecord,
  deps: PrintfulPostSubmitReviewDeps = {},
): Promise<PrintOrderRecord> {
  if (!sentRecord.printfulOrderId) {
    return sentRecord;
  }

  const reviewFn = deps.reviewPrintfulOrderFiles ?? reviewPrintfulOrderFiles;
  const failureAlert = deps.sendPrintOrderFailureAlert ?? sendPrintOrderFailureAlert;
  const approvalAlert = deps.sendPrintOrderApprovalAlert ?? sendPrintOrderApprovalAlert;
  const loadStored = deps.loadStoredPrintOrder ?? defaultLoadStoredPrintOrder;
  const alreadyPending = isPrintfulFileReviewPending(sentRecord);

  const { outcome, review } = await resolvePrintfulPostSubmitFileOutcome({
    printfulOrderId: sentRecord.printfulOrderId,
    reviewPrintfulOrderFiles: reviewFn,
    sleep: deps.sleep,
    maxAttempts: deps.maxAttempts,
    retryDelaysMs: deps.retryDelaysMs,
    preservePendingOnUnavailable: alreadyPending,
  });

  // Re-read after polling sleeps so a concurrent order_failed webhook wins.
  const stored = await loadStored(sentRecord.sessionId);
  const terminal = preferStoredTerminalFailure(sentRecord, stored);
  if (terminal) {
    return terminal;
  }

  if (outcome === "failed" && review?.failedFiles.length) {
    const failedRecord: PrintOrderRecord = {
      ...sentRecord,
      error: formatPrintfulFileFailureError(review),
      printfulFileReviewPendingAt: undefined,
    };
    // Preserve webhook/idempotency markers if store already alerted without status flip.
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
    // Final race check: webhook may have persisted failure during alert send.
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

  // Pending after bounded recheck: durable marker, neither confirmed failure nor approval.
  if (outcome === "pending") {
    return {
      ...sentRecord,
      printfulFileReviewPendingAt: sentRecord.printfulFileReviewPendingAt ?? Date.now(),
    };
  }

  const healthyRecord: PrintOrderRecord = {
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
