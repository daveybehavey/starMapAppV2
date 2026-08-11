import type { PrintOrderRecord } from "@/lib/printOrders";
import {
  getEffectivePrintOrderRecord,
  persistPrintOrderKvMirror,
  recordTerminalFailureAndDeliverAlert,
  type PrintOrderCoordinatorStore,
} from "@/lib/printOrderCoordinator";
import { kv } from "@/lib/kv";
import { printOrderKey } from "@/lib/printOrders";
import {
  sendPrintOrderApprovalAlert,
  sendPrintOrderFailureAlert,
  type PrintOrderFailureAlertSendOptions,
} from "@/lib/printOrderAlerts";
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
  sendPrintOrderFailureAlert?: (
    order: PrintOrderRecord,
    opts?: PrintOrderFailureAlertSendOptions,
  ) => ReturnType<typeof sendPrintOrderFailureAlert>;
  sendPrintOrderApprovalAlert?: typeof sendPrintOrderApprovalAlert;
  /** Re-read durable order state after polling (webhook races). Defaults to KV. */
  loadStoredPrintOrder?: (sessionId: string) => Promise<PrintOrderRecord | null>;
  coordinatorStore?: PrintOrderCoordinatorStore;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function defaultLoadStoredPrintOrder(sessionId: string): Promise<PrintOrderRecord | null> {
  return kv.get<PrintOrderRecord>(printOrderKey(sessionId));
}

export function isPrintfulFileReviewPending(
  record: Pick<PrintOrderRecord, "printfulFileReviewPendingAt">,
): boolean {
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
  const store = deps.coordinatorStore;

  const { outcome, review } = await resolvePrintfulPostSubmitFileOutcome({
    printfulOrderId: sentRecord.printfulOrderId,
    reviewPrintfulOrderFiles: reviewFn,
    sleep: deps.sleep,
    maxAttempts: deps.maxAttempts,
    retryDelaysMs: deps.retryDelaysMs,
    preservePendingOnUnavailable: alreadyPending,
  });

  // Authoritative coordinator wins over in-memory / KV snapshots.
  const effective = await getEffectivePrintOrderRecord(sentRecord.sessionId, sentRecord, {
    store,
    requireReadable: true,
  });
  if (!effective.ok) {
    // Fail closed for healthy / pending-approval paths when coordinator is unreadable.
    if (outcome === "ok" || outcome === "pending") {
      return {
        ...sentRecord,
        printfulFileReviewPendingAt: sentRecord.printfulFileReviewPendingAt ?? Date.now(),
        error: sentRecord.error || effective.error || "print_order_coordinator_unavailable",
      };
    }
  } else if (effective.state?.authorityStatus === "failed") {
    if (!effective.order.operatorFailureAlertedAt) {
      return recordTerminalFailureAndDeliverAlert({
        record: effective.order,
        error: effective.order.error || effective.state.error || "print_order_failed",
        source: "other",
        sendFailureAlert: (order, opts) => failureAlert(order, opts),
        store,
      });
    }
    return effective.order;
  }

  const stored = await loadStored(sentRecord.sessionId);
  const terminal = preferStoredTerminalFailure(sentRecord, stored);
  if (terminal) {
    return recordTerminalFailureAndDeliverAlert({
      record: terminal,
      error: terminal.error || "print_order_failed",
      source: "other",
      sendFailureAlert: (order, opts) => failureAlert(order, opts),
      store,
    });
  }

  if (outcome === "failed" && review?.failedFiles.length) {
    const failureError = formatPrintfulFileFailureError(review);
    return recordTerminalFailureAndDeliverAlert({
      record: {
        ...sentRecord,
        status: "failed",
        error: failureError,
        printfulFileReviewPendingAt: undefined,
      },
      error: failureError,
      source: "post_submit_files",
      sendFailureAlert: (order, opts) => failureAlert(order, opts),
      store,
    });
  }

  if (outcome === "pending") {
    if (store) {
      await store.recordPendingFiles({
        sessionId: sentRecord.sessionId,
        printfulOrderId: sentRecord.printfulOrderId,
      });
    } else {
      const coordinator = await import("@/lib/printOrderCoordinator").then((m) =>
        m.getPrintOrderCoordinatorStore(),
      );
      await coordinator.recordPendingFiles({
        sessionId: sentRecord.sessionId,
        printfulOrderId: sentRecord.printfulOrderId,
      });
    }
    return {
      ...sentRecord,
      printfulFileReviewPendingAt: sentRecord.printfulFileReviewPendingAt ?? Date.now(),
    };
  }

  // Healthy path: require coordinator readability and non-failed authority.
  const healthyGate = await getEffectivePrintOrderRecord(sentRecord.sessionId, sentRecord, {
    store,
    requireReadable: true,
  });
  if (!healthyGate.ok) {
    return {
      ...sentRecord,
      printfulFileReviewPendingAt: sentRecord.printfulFileReviewPendingAt ?? Date.now(),
      error: sentRecord.error || healthyGate.error,
    };
  }
  if (healthyGate.state?.authorityStatus === "failed") {
    return healthyGate.order;
  }

  const coordinatorStore =
    store ?? (await import("@/lib/printOrderCoordinator").then((m) => m.getPrintOrderCoordinatorStore()));
  const healthyWrite = await coordinatorStore.recordHealthy({
    sessionId: sentRecord.sessionId,
    printfulOrderId: sentRecord.printfulOrderId,
  });
  if (!healthyWrite.ok) {
    return {
      ...sentRecord,
      printfulFileReviewPendingAt: sentRecord.printfulFileReviewPendingAt ?? Date.now(),
      error: sentRecord.error || healthyWrite.error || "print_order_coordinator_unavailable",
    };
  }
  if (healthyWrite.state.authorityStatus === "failed" || healthyWrite.reason === "terminal_failed") {
    return recordTerminalFailureAndDeliverAlert({
      record: sentRecord,
      error: healthyWrite.state.error || "print_order_failed",
      source: "other",
      sendFailureAlert: (order, opts) => failureAlert(order, opts),
      store: coordinatorStore,
    });
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

  // Final coordinator check before returning a healthy snapshot for caller persistence.
  const afterApproval = await getEffectivePrintOrderRecord(sentRecord.sessionId, healthyRecord, {
    store: coordinatorStore,
    requireReadable: true,
  });
  if (!afterApproval.ok) {
    return {
      ...sentRecord,
      printfulFileReviewPendingAt: sentRecord.printfulFileReviewPendingAt ?? Date.now(),
      error: sentRecord.error || afterApproval.error,
      operatorAlertedAt: undefined,
      operatorAlertProvider: undefined,
      operatorAlertError: undefined,
    };
  }
  if (afterApproval.state?.authorityStatus === "failed") {
    return afterApproval.order;
  }

  return afterApproval.order;
}

/** Persist post-submit result through coordinator-aware KV mirror. */
export async function persistReviewedPrintOrder(
  sessionId: string,
  reviewed: PrintOrderRecord,
  deps?: { coordinatorStore?: PrintOrderCoordinatorStore },
): Promise<PrintOrderRecord> {
  const result = await persistPrintOrderKvMirror(sessionId, reviewed, {
    kvSet: (key, value) => kv.set(key, value),
    printOrderKey,
    store: deps?.coordinatorStore,
    requireCoordinatorReadable: true,
  });
  return result.order;
}
