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
  claimPrintOrderFailureAlertDelivery,
  getEffectivePrintOrderRecord,
  isPrintOrderTerminalWritePending,
  newPrintOrderFailureAlertClaimOwner,
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
  failureAlertClaimOwner?: string;
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
 * Deliver failure alert only after winning an R2 CAS claim.
 * Provider I/O stays outside the claim CAS loop.
 */
async function deliverClaimedFailureAlert(
  base: PrintOrderRecord,
  input: {
    error: string;
    source: "post_submit_files" | "other" | "retry" | "printful_webhook";
    claimOwner: string;
    failureAlert: typeof sendPrintOrderFailureAlert;
    terminalStore?: PrintOrderTerminalStore;
  },
): Promise<PrintOrderRecord> {
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
    status: "failed" as const,
    error: input.error,
    printOrderTerminalWritePendingAt: undefined,
  };

  // Provider I/O — outside CAS loops.
  const alertResult = await input.failureAlert(withClaim);
  const alertPatch = alertResult.delivered
    ? {
        operatorFailureAlertedAt: Date.now(),
        operatorFailureAlertProvider: alertResult.provider,
        operatorFailureAlertError: undefined as string | undefined,
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

  if (completed.ok || ("conflict" in completed && completed.conflict)) {
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
  const claimOwner = deps.failureAlertClaimOwner ?? newPrintOrderFailureAlertClaimOwner();

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
        error: sentRecord.error || terminalRead.error || "print_order_terminal_store_unavailable",
      };
    }
    // Confirmed failure while ledger unreadable: keep retryable pending-write marker (no alert yet).
    if (outcome === "failed" && review?.failedFiles.length) {
      const failureError = formatPrintfulFileFailureError(review);
      return {
        ...sentRecord,
        status: "failed",
        error: failureError,
        printfulFileReviewPendingAt: undefined,
        printOrderTerminalWritePendingAt: Date.now(),
      };
    }
  } else if (terminalRead.state) {
    const stored = await loadStored(sentRecord.sessionId);
    const withTerminal =
      overlayPrintOrderTerminalState(stored ?? sentRecord, terminalRead.state) ?? {
        ...sentRecord,
        status: "failed" as const,
        error: terminalRead.state.error,
        printOrderTerminalWritePendingAt: undefined,
      };
    if (!withTerminal.operatorFailureAlertedAt && !terminalRead.state.operatorFailureAlertClaimedAt) {
      return deliverClaimedFailureAlert(withTerminal, {
        error: withTerminal.error || terminalRead.state.error,
        source: "other",
        claimOwner,
        failureAlert,
        terminalStore: deps.terminalStore,
      });
    }
    return withTerminal;
  }

  const stored = await loadStored(sentRecord.sessionId);
  const terminal = preferStoredTerminalFailure(sentRecord, stored);
  if (terminal) {
    // Mirror into R2 if KV already failed but ledger missing (legacy / write-pending recovery).
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
    if (!ledger.ok && "unavailable" in ledger && ledger.unavailable) {
      return {
        ...terminal,
        printOrderTerminalWritePendingAt: terminal.printOrderTerminalWritePendingAt ?? Date.now(),
      };
    }
    const withTerminal =
      ledger.ok || ("conflict" in ledger && ledger.conflict)
        ? overlayPrintOrderTerminalState(terminal, ledger.state) ?? terminal
        : terminal;
    if (!withTerminal.operatorFailureAlertedAt) {
      return deliverClaimedFailureAlert(withTerminal, {
        error: withTerminal.error || "print_order_failed",
        source: "other",
        claimOwner,
        failureAlert,
        terminalStore: deps.terminalStore,
      });
    }
    return { ...withTerminal, printOrderTerminalWritePendingAt: undefined };
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
        return deliverClaimedFailureAlert(withTerminal, {
          error: failureError,
          source: "post_submit_files",
          claimOwner,
          failureAlert,
          terminalStore: deps.terminalStore,
        });
      }
      return { ...withTerminal, printOrderTerminalWritePendingAt: undefined };
    }

    // Ledger unavailable: durable KV failure + pending terminal write; no alert yet; retryable.
    return {
      ...failedRecord,
      printOrderTerminalWritePendingAt: Date.now(),
    };
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
  // Confirmed failure awaiting R2 backfill may write KV without terminal readability.
  const allowWithoutTerminal = isPrintOrderTerminalWritePending(reviewed);
  const requireTerminalReadable = !allowWithoutTerminal;

  const result = await persistPrintOrderKvMirror(sessionId, reviewed, {
    store: deps?.terminalStore,
    requireTerminalReadable,
  });

  if (!result.ok) {
    if (allowWithoutTerminal) {
      await kv.set(printOrderKey(sessionId), reviewed);
      return reviewed;
    }
    // Healthy/non-pending-failure path: fail closed at the write boundary — never persist
    // healthy sent/alerted state when the authoritative ledger cannot be read.
    const blocked: PrintOrderRecord = {
      ...reviewed,
      status: "sent",
      operatorAlertedAt: undefined,
      operatorAlertProvider: undefined,
      operatorAlertError: undefined,
      printfulFileReviewPendingAt: reviewed.printfulFileReviewPendingAt ?? Date.now(),
      error: reviewed.error || result.error,
    };
    await kv.set(printOrderKey(sessionId), blocked);
    return blocked;
  }

  return result.order;
}
