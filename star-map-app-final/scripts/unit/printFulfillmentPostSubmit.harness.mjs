/** Keep in sync with src/lib/printFulfillmentPostSubmit.ts */
import {
  formatPrintfulFileFailureError,
  resolvePrintfulFileReviewOutcome,
} from "./printfulOrderReview.harness.mjs";
import {
  createMemoryPrintOrderTerminalStore,
  getEffectivePrintOrderRecord,
  overlayPrintOrderTerminalState,
  readPrintOrderTerminalState,
  recordPrintOrderTerminalFailure,
} from "./printOrderTerminalState.harness.mjs";

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
  const terminalStore = deps.terminalStore ?? createMemoryPrintOrderTerminalStore();
  const alreadyPending = isPrintfulFileReviewPending(sentRecord);
  const terminalDeps = { store: terminalStore };

  const { outcome, review } = await resolvePrintfulPostSubmitFileOutcome({
    printfulOrderId: sentRecord.printfulOrderId,
    reviewPrintfulOrderFiles: reviewFn,
    sleep: deps.sleep,
    maxAttempts: deps.maxAttempts,
    retryDelaysMs: deps.retryDelaysMs,
    preservePendingOnUnavailable: alreadyPending,
  });

  const terminalRead = await readPrintOrderTerminalState(sentRecord.sessionId, terminalDeps);
  if (!terminalRead.ok) {
    if (outcome === "ok" || outcome === "pending") {
      return {
        ...sentRecord,
        printfulFileReviewPendingAt: sentRecord.printfulFileReviewPendingAt ?? Date.now(),
        error: sentRecord.error || "print_order_terminal_store_unavailable",
      };
    }
  } else if (terminalRead.state) {
    const stored = await loadStored(sentRecord.sessionId);
    return overlayPrintOrderTerminalState(stored ?? sentRecord, terminalRead.state);
  }

  const stored = await loadStored(sentRecord.sessionId);
  const terminal = preferStoredTerminalFailure(sentRecord, stored);
  if (terminal) {
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
    const failedRecord = {
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
      },
      terminalDeps,
    );
    if (ledger.ok || ledger.conflict) {
      const withTerminal = overlayPrintOrderTerminalState(failedRecord, ledger.state);
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
    if (!failedRecord.operatorFailureAlertedAt) {
      const alertResult = await failureAlert(failedRecord);
      if (alertResult.delivered) {
        failedRecord.operatorFailureAlertedAt = Date.now();
        failedRecord.operatorFailureAlertProvider = alertResult.provider;
      } else {
        failedRecord.operatorFailureAlertError = alertResult.error;
      }
    }
    return failedRecord;
  }

  if (outcome === "pending") {
    return {
      ...sentRecord,
      printfulFileReviewPendingAt: sentRecord.printfulFileReviewPendingAt ?? Date.now(),
    };
  }

  const healthyGate = await getEffectivePrintOrderRecord(sentRecord.sessionId, sentRecord, {
    store: terminalStore,
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
    return healthyGate.order;
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

  const afterApproval = await readPrintOrderTerminalState(sentRecord.sessionId, terminalDeps);
  if (afterApproval.ok && afterApproval.state) {
    return overlayPrintOrderTerminalState(healthyRecord, afterApproval.state);
  }

  return healthyRecord;
}

/** Mirrors already-sent retry gating in print/orders/retry/route.ts */
export async function applyAlreadySentRetryReview(existing, deps = {}) {
  if (shouldRereviewPrintfulFilesOnAlreadySent(existing)) {
    return applyPrintfulPostSubmitReview(existing, deps);
  }
  if (shouldSendAlreadySentApprovalAlert(existing)) {
    const terminalStore = deps.terminalStore ?? createMemoryPrintOrderTerminalStore();
    const gate = await getEffectivePrintOrderRecord(existing.sessionId, existing, {
      store: terminalStore,
      requireTerminalReadable: true,
    });
    if (!gate.ok || gate.terminal || gate.order?.status === "failed") {
      return gate.ok && gate.order ? gate.order : existing;
    }
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
