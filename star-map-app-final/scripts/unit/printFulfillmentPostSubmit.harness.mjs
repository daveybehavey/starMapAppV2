/** Keep in sync with src/lib/printFulfillmentPostSubmit.ts */
import {
  formatPrintfulFileFailureError,
  resolvePrintfulFileReviewOutcome,
} from "./printfulOrderReview.harness.mjs";
import {
  claimPrintOrderFailureAlertDelivery,
  createMemoryPrintOrderTerminalStore,
  getEffectivePrintOrderRecord,
  isPrintOrderTerminalWritePending,
  newPrintOrderFailureAlertClaimOwner,
  overlayPrintOrderTerminalState,
  persistPrintOrderKvMirror,
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

async function deliverClaimedFailureAlert(base, input) {
  const terminalDeps = { store: input.terminalStore };
  const claim = await claimPrintOrderFailureAlertDelivery(
    {
      sessionId: base.sessionId,
      claimOwner: input.claimOwner,
      error: input.error,
      source: input.source,
    },
    terminalDeps,
  );

  if (!claim.ok) {
    return {
      ...base,
      status: "failed",
      error: input.error,
      printOrderTerminalWritePendingAt: base.printOrderTerminalWritePendingAt ?? Date.now(),
    };
  }

  if (!claim.claimed) {
    return overlayPrintOrderTerminalState(base, claim.state) ?? {
      ...base,
      status: "failed",
      error: claim.state.error || input.error,
      printOrderTerminalWritePendingAt: undefined,
    };
  }

  const withClaim = overlayPrintOrderTerminalState(base, claim.state) ?? {
    ...base,
    status: "failed",
    error: input.error,
    printOrderTerminalWritePendingAt: undefined,
  };

  const alertResult = await input.failureAlert(withClaim);
  const alertPatch = alertResult.delivered
    ? {
        operatorFailureAlertedAt: Date.now(),
        operatorFailureAlertProvider: alertResult.provider,
        operatorFailureAlertError: undefined,
      }
    : {
        operatorFailureAlertProvider: alertResult.provider,
        operatorFailureAlertError: alertResult.error,
      };

  const completed = await recordPrintOrderTerminalFailure(
    {
      sessionId: base.sessionId,
      error: input.error,
      source: input.source,
      operatorFailureAlertClaimedAt: claim.state.operatorFailureAlertClaimedAt,
      operatorFailureAlertClaimOwner: claim.state.operatorFailureAlertClaimOwner,
      ...alertPatch,
    },
    terminalDeps,
  );

  if (completed.ok || completed.conflict) {
    return (
      overlayPrintOrderTerminalState({ ...withClaim, ...alertPatch }, completed.state) ?? {
        ...withClaim,
        ...alertPatch,
        printOrderTerminalWritePendingAt: undefined,
      }
    );
  }

  return {
    ...withClaim,
    ...alertPatch,
    printOrderTerminalWritePendingAt: Date.now(),
  };
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
  const claimOwner = deps.failureAlertClaimOwner ?? newPrintOrderFailureAlertClaimOwner();

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
        error: sentRecord.error || terminalRead.error || "print_order_terminal_store_unavailable",
      };
    }
    if (outcome === "failed" && review?.failedFiles.length) {
      return {
        ...sentRecord,
        status: "failed",
        error: formatPrintfulFileFailureError(review),
        printfulFileReviewPendingAt: undefined,
        printOrderTerminalWritePendingAt: Date.now(),
      };
    }
  } else if (terminalRead.state) {
    const stored = await loadStored(sentRecord.sessionId);
    const withTerminal = overlayPrintOrderTerminalState(stored ?? sentRecord, terminalRead.state);
    if (!withTerminal.operatorFailureAlertedAt && !terminalRead.state.operatorFailureAlertClaimedAt) {
      return deliverClaimedFailureAlert(withTerminal, {
        error: withTerminal.error || terminalRead.state.error,
        source: "other",
        claimOwner,
        failureAlert,
        terminalStore,
      });
    }
    return withTerminal;
  }

  const stored = await loadStored(sentRecord.sessionId);
  const terminal = preferStoredTerminalFailure(sentRecord, stored);
  if (terminal) {
    const ledger = await recordPrintOrderTerminalFailure(
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
    if (!ledger.ok && ledger.unavailable) {
      return {
        ...terminal,
        printOrderTerminalWritePendingAt: terminal.printOrderTerminalWritePendingAt ?? Date.now(),
      };
    }
    const withTerminal =
      ledger.ok || ledger.conflict ? overlayPrintOrderTerminalState(terminal, ledger.state) : terminal;
    if (!withTerminal.operatorFailureAlertedAt) {
      return deliverClaimedFailureAlert(withTerminal, {
        error: withTerminal.error || "print_order_failed",
        source: "other",
        claimOwner,
        failureAlert,
        terminalStore,
      });
    }
    return { ...withTerminal, printOrderTerminalWritePendingAt: undefined };
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
        return deliverClaimedFailureAlert(withTerminal, {
          error: failureError,
          source: "post_submit_files",
          claimOwner,
          failureAlert,
          terminalStore,
        });
      }
      return { ...withTerminal, printOrderTerminalWritePendingAt: undefined };
    }
    return {
      ...failedRecord,
      printOrderTerminalWritePendingAt: Date.now(),
    };
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
  if (afterApproval.state) {
    return overlayPrintOrderTerminalState(healthyRecord, afterApproval.state);
  }

  return healthyRecord;
}

export async function persistReviewedPrintOrder(sessionId, reviewed, deps = {}) {
  const terminalStore = deps.terminalStore ?? createMemoryPrintOrderTerminalStore();
  const allowWithoutTerminal = isPrintOrderTerminalWritePending(reviewed);
  const result = await persistPrintOrderKvMirror(sessionId, reviewed, {
    store: terminalStore,
    requireTerminalReadable: !allowWithoutTerminal,
    kvStore: deps.kvStore,
  });
  if (!result.ok) {
    if (allowWithoutTerminal) {
      return reviewed;
    }
    return {
      ...reviewed,
      status: "sent",
      operatorAlertedAt: undefined,
      operatorAlertProvider: undefined,
      operatorAlertError: undefined,
      printfulFileReviewPendingAt: reviewed.printfulFileReviewPendingAt ?? Date.now(),
      error: reviewed.error || result.error,
    };
  }
  return result.order;
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
