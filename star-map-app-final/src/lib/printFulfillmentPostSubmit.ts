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
import {
  getEffectivePrintOrderRecord,
  overlayPrintOrderTerminalState,
  persistPrintOrderKvMirror,
  readPrintOrderTerminalState,
  recordPrintOrderTerminalFailure,
  type PrintOrderTerminalStore,
} from "@/lib/printOrderTerminalState";

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
  terminalStore?: PrintOrderTerminalStore;
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
  const terminalDeps = { store: deps.terminalStore };

  const { outcome, review } = await resolvePrintfulPostSubmitFileOutcome({
    printfulOrderId: sentRecord.printfulOrderId,
    reviewPrintfulOrderFiles: reviewFn,
    sleep: deps.sleep,
    maxAttempts: deps.maxAttempts,
    retryDelaysMs: deps.retryDelaysMs,
    preservePendingOnUnavailable: alreadyPending,
  });

  // Authoritative terminal ledger wins over in-memory / KV snapshots.
  const terminalRead = await readPrintOrderTerminalState(sentRecord.sessionId, terminalDeps);
  if (!terminalRead.ok) {
    // Fail closed for any path that would approve / clear pending as healthy.
    if (outcome === "ok" || outcome === "pending") {
      return {
        ...sentRecord,
        printfulFileReviewPendingAt: sentRecord.printfulFileReviewPendingAt ?? Date.now(),
        error: sentRecord.error || "print_order_terminal_store_unavailable",
      };
    }
  } else if (terminalRead.state) {
    const stored = await loadStored(sentRecord.sessionId);
    return (
      overlayPrintOrderTerminalState(stored ?? sentRecord, terminalRead.state) ?? {
        ...sentRecord,
        status: "failed",
        error: terminalRead.state.error,
      }
    );
  }

  const stored = await loadStored(sentRecord.sessionId);
  const terminal = preferStoredTerminalFailure(sentRecord, stored);
  if (terminal) {
    // Mirror into R2 if KV already failed but ledger missing (legacy).
    await recordPrintOrderTerminalFailure(
      {
        sessionId: sentRecord.sessionId,
        error: terminal.error || "print_order_failed",
        source: "other",
        operatorFailureAlertedAt: terminal.operatorFailureAlertedAt,
        operatorFailureAlertProvider: terminal.operatorFailureAlertProvider,
        operatorFailureAlertError: terminal.operatorFailureAlertError,
      },
      terminalDeps,
    );
    return terminal;
  }

  if (outcome === "failed" && review?.failedFiles.length) {
    const failureError = formatPrintfulFileFailureError(review);
    const failedRecord: PrintOrderRecord = {
      ...sentRecord,
      status: "failed",
      error: failureError,
      printfulFileReviewPendingAt: undefined,
    };

    const ledger = await recordPrintOrderTerminalFailure(
      {
        sessionId: sentRecord.sessionId,
        error: failureError,
        source: "post_submit_files",
        operatorFailureAlertedAt: stored?.operatorFailureAlertedAt,
        operatorFailureAlertProvider: stored?.operatorFailureAlertProvider,
        operatorFailureAlertError: stored?.operatorFailureAlertError,
      },
      terminalDeps,
    );

    if (ledger.ok || ("conflict" in ledger && ledger.conflict)) {
      const withTerminal =
        overlayPrintOrderTerminalState(failedRecord, ledger.state) ?? failedRecord;
      if (!withTerminal.operatorFailureAlertedAt) {
        const alertResult = await failureAlert(withTerminal);
        if (alertResult.delivered) {
          withTerminal.operatorFailureAlertedAt = Date.now();
          withTerminal.operatorFailureAlertProvider = alertResult.provider;
          withTerminal.operatorFailureAlertError = undefined;
        } else {
          withTerminal.operatorFailureAlertProvider = alertResult.provider;
          withTerminal.operatorFailureAlertError = alertResult.error;
        }
        await recordPrintOrderTerminalFailure(
          {
            sessionId: sentRecord.sessionId,
            error: failureError,
            source: "post_submit_files",
            operatorFailureAlertedAt: withTerminal.operatorFailureAlertedAt,
            operatorFailureAlertProvider: withTerminal.operatorFailureAlertProvider,
            operatorFailureAlertError: withTerminal.operatorFailureAlertError,
          },
          terminalDeps,
        );
      }
      return withTerminal;
    }

    // Ledger unavailable: still surface failure, but do not approve.
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

  // Pending after bounded recheck: durable marker, neither confirmed failure nor approval.
  if (outcome === "pending") {
    return {
      ...sentRecord,
      printfulFileReviewPendingAt: sentRecord.printfulFileReviewPendingAt ?? Date.now(),
    };
  }

  // Healthy path: require authoritative terminal readability (fail closed).
  const healthyGate = await getEffectivePrintOrderRecord(sentRecord.sessionId, sentRecord, {
    store: deps.terminalStore,
    requireTerminalReadable: true,
  });
  if (!healthyGate.ok) {
    return {
      ...sentRecord,
      printfulFileReviewPendingAt: sentRecord.printfulFileReviewPendingAt ?? Date.now(),
      error: sentRecord.error || healthyGate.error,
    };
  }
  if (healthyGate.terminal) {
    return healthyGate.order ?? sentRecord;
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

  // Final ledger check before returning a healthy snapshot for caller persistence.
  const afterApproval = await readPrintOrderTerminalState(sentRecord.sessionId, terminalDeps);
  if (afterApproval.ok && afterApproval.state) {
    return overlayPrintOrderTerminalState(healthyRecord, afterApproval.state) ?? healthyRecord;
  }

  return healthyRecord;
}

/** Persist post-submit result through terminal-aware KV mirror. */
export async function persistReviewedPrintOrder(
  sessionId: string,
  reviewed: PrintOrderRecord,
  deps?: { terminalStore?: PrintOrderTerminalStore },
): Promise<PrintOrderRecord> {
  const result = await persistPrintOrderKvMirror(sessionId, reviewed, {
    store: deps?.terminalStore,
    requireTerminalReadable: false,
  });
  if (!result.ok) {
    // Fall back to direct KV write of reviewed (already fail-closed above for approvals).
    await kv.set(printOrderKey(sessionId), reviewed);
    return reviewed;
  }
  return result.order;
}
