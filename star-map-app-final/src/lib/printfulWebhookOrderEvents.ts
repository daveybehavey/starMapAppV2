import { kv } from "@/lib/kv";
import { sendPrintOrderFailureAlert, sendPrintOrderHoldAlert } from "@/lib/printOrderAlerts";
import {
  lookupSessionIdByPrintfulOrderId,
  normalizePrintfulOrderId,
  resolvePrintfulWebhookSessionId,
} from "@/lib/printFulfillmentIndex";
import {
  getPrintOrderAuthorityState,
  markPrintOrderTerminalFailed,
} from "@/lib/printOrderAuthority";
import {
  isPrintfulTerminalFailureWebhookType,
  PRINTFUL_TERMINAL_FAILURE_WEBHOOK_TYPES,
} from "@/lib/printOrderAuthorityState";
import {
  isValidPrintCheckoutSessionId,
  persistPrintOrderRecord,
  printOrderKey,
  type PrintOrderRecord,
  type PrintOrderTerminalEventType,
} from "@/lib/printOrders";
import {
  formatPrintfulFileFailureError,
  reviewPrintfulOrderFiles,
} from "@/lib/printfulOrderReview";

/** Authoritative terminal provider failure/cancel only — not order_put_hold. */
export const PRINTFUL_ORDER_FAILURE_WEBHOOK_TYPES = PRINTFUL_TERMINAL_FAILURE_WEBHOOK_TYPES;

export type PrintfulOrderWebhookPayload = {
  type?: string;
  data?: {
    reason?: string | null;
    order?: {
      id?: number | string | null;
      external_id?: string | null;
      status?: string | null;
    } | null;
  } | null;
};

export function isPrintfulOrderFailureWebhookType(eventType: string): boolean {
  return isPrintfulTerminalFailureWebhookType(eventType);
}

/** S96-1 F1: Printful's hold notification — non-terminal, handled separately. */
export const PRINTFUL_ORDER_HOLD_WEBHOOK_TYPE = "order_put_hold";

export function isPrintfulOrderHoldWebhookType(eventType: string): boolean {
  return eventType.trim() === PRINTFUL_ORDER_HOLD_WEBHOOK_TYPE;
}

export function buildPrintfulWebhookFailureError(
  eventType: string,
  reason?: string | null,
  orderStatus?: string | null,
): string {
  const normalizedType = eventType.trim() || "order_event";
  const parts = [`printful_${normalizedType}`];
  const trimmedReason = reason?.trim();
  if (trimmedReason) parts.push(trimmedReason.slice(0, 240));
  const trimmedStatus = orderStatus?.trim();
  if (trimmedStatus) parts.push(`status=${trimmedStatus}`);
  return parts.join(":");
}

export async function resolvePrintfulWebhookOrderSessionId(input: {
  printfulOrderId: string | null;
  externalId: string;
}): Promise<string | null> {
  const externalId = input.externalId.trim();
  // AG-074: valid checkout external_id resolves without awaiting Printful-ID KV index.
  if (externalId && isValidPrintCheckoutSessionId(externalId)) {
    return externalId;
  }

  const indexedSessionId = input.printfulOrderId
    ? await lookupSessionIdByPrintfulOrderId(input.printfulOrderId)
    : null;
  return resolvePrintfulWebhookSessionId({
    printfulOrderId: input.printfulOrderId,
    externalId: input.externalId,
    indexedSessionId,
  });
}

export async function applyPrintfulOrderFailureFromWebhook(input: {
  eventType: string;
  printfulOrderId: string | number | null;
  externalId: string;
  reason?: string | null;
  orderStatus?: string | null;
}): Promise<{
  ok: boolean;
  status:
    | "updated"
    | "ignored"
    | "alert_failed"
    | "authority_unread"
    | "projection_missing"
    | "provider_id_conflict"
    | "session_unresolved";
  reason?: string;
  sessionId?: string;
  error?: string;
  terminalRevision?: number;
  authority?: {
    lifecycle: string;
    revision: number;
    printfulOrderId: string | null;
  };
}> {
  const eventType = input.eventType.trim();
  if (!isPrintfulOrderFailureWebhookType(eventType)) {
    return {
      ok: true,
      status: "ignored",
      reason: "non_terminal_event",
    };
  }

  const printfulOrderId = normalizePrintfulOrderId(input.printfulOrderId);
  const externalId = input.externalId.trim();
  const sessionId = await resolvePrintfulWebhookOrderSessionId({
    printfulOrderId,
    externalId,
  });

  if (!sessionId) {
    // AG-081: recoverable missing-index window (e.g. Printful accepted, bind failed,
    // hashed smc_ external_id not yet indexed). Keep terminal webhooks retryable —
    // do not ACK/ignore and permanently lose order_failed / order_canceled.
    return {
      ok: false,
      status: "session_unresolved",
      reason: "session_unresolved",
    };
  }

  // DO-first / AG-074 authority-first: atomic provider-id capture + terminal transition
  // BEFORE any KV record read / projection / seed.
  const terminal = await markPrintOrderTerminalFailed(sessionId, {
    eventType,
    reason: input.reason,
    printfulOrderId,
  });

  if (!terminal.ok && "reason" in terminal && terminal.reason === "authority_unread") {
    return {
      ok: false,
      status: "authority_unread",
      reason: "authority_unread",
      sessionId,
    };
  }
  if (!terminal.ok && "reason" in terminal && terminal.reason === "conflicting_provider_id") {
    return {
      ok: false,
      status: "provider_id_conflict",
      reason: "conflicting_provider_id",
      sessionId,
      authority: terminal.state
        ? {
            lifecycle: terminal.state.lifecycle,
            revision: terminal.state.revision,
            printfulOrderId: terminal.state.printfulOrderId,
          }
        : undefined,
    };
  }
  if (!terminal.ok || !terminal.state) {
    return {
      ok: false,
      status: "authority_unread",
      reason: "authority_unread",
      sessionId,
    };
  }

  const terminalRevision = terminal.state.revision;
  const authoritySnapshot = {
    lifecycle: terminal.state.lifecycle,
    revision: terminal.state.revision,
    printfulOrderId: terminal.state.printfulOrderId,
  };

  // Authority committed — only now may KV/review/alert projection work occur.
  const existing = await kv.get<PrintOrderRecord>(printOrderKey(sessionId));

  // Missing KV is a degraded projection, not a lost event.
  if (!existing) {
    return {
      ok: true,
      status: "projection_missing",
      reason: "reconciliation_needed",
      sessionId,
      terminalRevision,
      authority: authoritySnapshot,
    };
  }

  let error = buildPrintfulWebhookFailureError(eventType, input.reason, input.orderStatus);
  const reviewOrderId =
    printfulOrderId || terminal.state.printfulOrderId || existing.printfulOrderId;
  if (reviewOrderId) {
    const review = await reviewPrintfulOrderFiles(reviewOrderId);
    if (review?.failedFiles.length) {
      error = formatPrintfulFileFailureError(review);
    }
  }

  // Explicit terminal provenance is independent of mutable `error` (file review may
  // replace the error string with printful_files_failed:… without erasing provenance).
  const nextRecord: PrintOrderRecord = {
    ...existing,
    status: "failed",
    printfulOrderId: reviewOrderId || existing.printfulOrderId,
    error,
    terminalEventType: eventType as PrintOrderTerminalEventType,
    // S96-1 F1: a terminal failure supersedes any recorded hold.
    providerHoldAt: undefined,
    providerHoldReason: undefined,
    providerHoldOrderStatus: undefined,
    operatorHoldAlertedAt: undefined,
    operatorHoldAlertProvider: undefined,
    operatorHoldAlertError: undefined,
    operatorHoldEscalatedAt: undefined,
    operatorHoldEscalationAlertError: undefined,
  };

  if (!nextRecord.operatorFailureAlertedAt) {
    const alertResult = await sendPrintOrderFailureAlert(nextRecord);
    if (alertResult.delivered) {
      nextRecord.operatorFailureAlertedAt = Date.now();
      nextRecord.operatorFailureAlertProvider = alertResult.provider;
      nextRecord.operatorFailureAlertError = undefined;
    } else {
      nextRecord.operatorFailureAlertProvider = alertResult.provider;
      nextRecord.operatorFailureAlertError = alertResult.error;
    }
  }

  const latest = await getPrintOrderAuthorityState(sessionId);
  // Unreadable authority after a successful terminal transition must stay retryable.
  // Only a *readable* mismatched lifecycle/revision is a true stale-projection skip.
  if (!latest) {
    return {
      ok: false,
      status: "authority_unread",
      reason: "authority_unread",
      sessionId,
      terminalRevision,
      authority: authoritySnapshot,
    };
  }
  if (latest.lifecycle !== "terminal_failed" || latest.revision !== terminalRevision) {
    return {
      ok: true,
      status: "ignored",
      reason: "stale_terminal_projection_skipped",
      sessionId,
      terminalRevision,
      authority: {
        lifecycle: latest.lifecycle,
        revision: latest.revision,
        printfulOrderId: latest.printfulOrderId,
      },
    };
  }

  await persistPrintOrderRecord(sessionId, nextRecord, { allowClearTerminalFailure: true });

  if (nextRecord.operatorFailureAlertError) {
    return {
      ok: false,
      status: "alert_failed",
      sessionId,
      error: nextRecord.operatorFailureAlertError,
      terminalRevision,
      authority: authoritySnapshot,
    };
  }

  return {
    ok: true,
    status: "updated",
    sessionId,
    terminalRevision,
    authority: authoritySnapshot,
  };
}

/**
 * S96-1 F1: apply an `order_put_hold` webhook. Before this, the event fell
 * into the route's 200-ignored fallback: the order stayed `sent`/`bound`
 * forever with no record, no alert, and no sweep. Now the hold is recorded
 * on the KV record (the visible state the operator surfaces project), the
 * operator is alerted through the print-order alert path, and the hold
 * sweep retries/escalates from the recorded stamps. A hold is NOT a
 * terminal transition — the authority lifecycle is left untouched; a
 * terminal failure that already landed (or lands during the alert)
 * supersedes the hold.
 */
export async function applyPrintfulOrderHoldFromWebhook(input: {
  eventType: string;
  printfulOrderId: string | number | null;
  externalId: string;
  reason?: string | null;
  orderStatus?: string | null;
}): Promise<{
  ok: boolean;
  status:
    | "updated"
    | "ignored"
    | "alert_failed"
    | "authority_unread"
    | "projection_missing"
    | "unresolved_session";
  reason?: string;
  sessionId?: string;
  error?: string;
  authority?: {
    lifecycle: string;
    revision: number;
    printfulOrderId: string | null;
  };
}> {
  const eventType = input.eventType.trim();
  if (!isPrintfulOrderHoldWebhookType(eventType)) {
    return {
      ok: true,
      status: "ignored",
      reason: "non_hold_event",
    };
  }

  const printfulOrderId = normalizePrintfulOrderId(input.printfulOrderId);
  const externalId = input.externalId.trim();
  const sessionId = await resolvePrintfulWebhookOrderSessionId({
    printfulOrderId,
    externalId,
  });

  if (!sessionId) {
    // Same AG-081 doctrine as terminal events: a hold must not be ACKed
    // into oblivion while the session cannot be resolved — Printful retries.
    return {
      ok: false,
      status: "unresolved_session",
      reason: "unresolved_session",
    };
  }

  const authority = await getPrintOrderAuthorityState(sessionId);
  if (!authority) {
    return {
      ok: false,
      status: "authority_unread",
      reason: "authority_unread",
      sessionId,
    };
  }
  const authoritySnapshot = {
    lifecycle: authority.lifecycle,
    revision: authority.revision,
    printfulOrderId: authority.printfulOrderId,
  };

  if (authority.lifecycle === "terminal_failed") {
    // The terminal event already alerted the operator; a late hold adds nothing.
    return {
      ok: true,
      status: "ignored",
      reason: "superseded_by_terminal_failure",
      sessionId,
      authority: authoritySnapshot,
    };
  }

  const existing = await kv.get<PrintOrderRecord>(printOrderKey(sessionId));
  if (!existing) {
    return {
      ok: true,
      status: "projection_missing",
      reason: "reconciliation_needed",
      sessionId,
      authority: authoritySnapshot,
    };
  }

  const now = Date.now();
  const holdReason =
    typeof input.reason === "string" && input.reason.trim()
      ? input.reason.trim().slice(0, 240)
      : undefined;
  const holdOrderStatus =
    typeof input.orderStatus === "string" && input.orderStatus.trim()
      ? input.orderStatus.trim().slice(0, 64)
      : undefined;

  const nextRecord: PrintOrderRecord = {
    ...existing,
    // First hold wins for the timestamp (aging anchors to the first
    // notice); the reason/status track the latest hold event.
    providerHoldAt: existing.providerHoldAt ?? now,
    providerHoldReason: holdReason ?? existing.providerHoldReason,
    providerHoldOrderStatus: holdOrderStatus ?? existing.providerHoldOrderStatus,
  };

  if (!nextRecord.operatorHoldAlertedAt) {
    const alertResult = await sendPrintOrderHoldAlert(nextRecord);
    if (alertResult.delivered) {
      nextRecord.operatorHoldAlertedAt = now;
      nextRecord.operatorHoldAlertProvider = alertResult.provider;
      nextRecord.operatorHoldAlertError = undefined;
    } else {
      nextRecord.operatorHoldAlertProvider = alertResult.provider;
      nextRecord.operatorHoldAlertError = alertResult.error;
    }
  }

  // Re-read authority before projecting: a terminal transition that landed
  // during the alert must not be overwritten by a nonterminal hold write.
  const latest = await getPrintOrderAuthorityState(sessionId);
  if (!latest) {
    return {
      ok: false,
      status: "authority_unread",
      reason: "authority_unread",
      sessionId,
      authority: authoritySnapshot,
    };
  }
  if (latest.lifecycle === "terminal_failed") {
    return {
      ok: true,
      status: "ignored",
      reason: "superseded_by_terminal_failure",
      sessionId,
      authority: {
        lifecycle: latest.lifecycle,
        revision: latest.revision,
        printfulOrderId: latest.printfulOrderId,
      },
    };
  }

  const persistResult = await persistPrintOrderRecord(sessionId, nextRecord);
  if (persistResult.outcome === "rejected_terminal_failure") {
    return {
      ok: true,
      status: "ignored",
      reason: "superseded_by_terminal_failure",
      sessionId,
      authority: authoritySnapshot,
    };
  }
  if (persistResult.outcome === "deleted_unretainable") {
    return {
      ok: true,
      status: "projection_missing",
      reason: "reconciliation_needed",
      sessionId,
      authority: authoritySnapshot,
    };
  }

  if (nextRecord.operatorHoldAlertError) {
    // The hold itself is durably recorded; the 502 makes Printful retry,
    // and the sweep retries the alert from the recorded error either way.
    return {
      ok: false,
      status: "alert_failed",
      sessionId,
      error: nextRecord.operatorHoldAlertError,
      authority: authoritySnapshot,
    };
  }

  return {
    ok: true,
    status: "updated",
    sessionId,
    authority: authoritySnapshot,
  };
}
