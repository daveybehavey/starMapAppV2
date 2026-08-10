import { kv } from "@/lib/kv";
import { sendPrintOrderFailureAlert } from "@/lib/printOrderAlerts";
import {
  lookupSessionIdByPrintfulOrderId,
  normalizePrintfulOrderId,
  resolvePrintfulWebhookSessionId,
} from "@/lib/printFulfillmentIndex";
import { printOrderKey, type PrintOrderRecord } from "@/lib/printOrders";
import {
  formatPrintfulFileFailureError,
  reviewPrintfulOrderFiles,
} from "@/lib/printfulOrderReview";
import {
  overlayPrintOrderTerminalState,
  recordPrintOrderTerminalFailure,
  type PrintOrderTerminalStore,
} from "@/lib/printOrderTerminalState";

export const PRINTFUL_ORDER_FAILURE_WEBHOOK_TYPES = new Set([
  "order_failed",
  "order_canceled",
  "order_put_hold",
]);

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
  return PRINTFUL_ORDER_FAILURE_WEBHOOK_TYPES.has(eventType.trim());
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
  terminalStore?: PrintOrderTerminalStore;
}): Promise<{
  ok: boolean;
  status: "updated" | "ignored" | "alert_failed" | "terminal_unavailable";
  reason?: string;
  sessionId?: string;
  error?: string;
}> {
  const eventType = input.eventType.trim();
  const printfulOrderId = normalizePrintfulOrderId(input.printfulOrderId);
  const externalId = input.externalId.trim();
  const sessionId = await resolvePrintfulWebhookOrderSessionId({
    printfulOrderId,
    externalId,
  });

  if (!sessionId) {
    return {
      ok: true,
      status: "ignored",
      reason: "session_unresolved",
    };
  }

  const existing = await kv.get<PrintOrderRecord>(printOrderKey(sessionId));
  if (!existing) {
    return {
      ok: true,
      status: "ignored",
      reason: "print_order_missing",
      sessionId,
    };
  }

  let error = buildPrintfulWebhookFailureError(eventType, input.reason, input.orderStatus);
  const reviewOrderId = printfulOrderId || existing.printfulOrderId;
  if (reviewOrderId) {
    const review = await reviewPrintfulOrderFiles(reviewOrderId);
    if (review?.failedFiles.length) {
      error = formatPrintfulFileFailureError(review);
    }
  }

  // Authoritative terminal ledger first — before KV mirror / alerts.
  const terminalWrite = await recordPrintOrderTerminalFailure(
    {
      sessionId,
      error,
      source: "printful_webhook",
    },
    { store: input.terminalStore },
  );
  if (!terminalWrite.ok && "unavailable" in terminalWrite && terminalWrite.unavailable) {
    return {
      ok: false,
      status: "terminal_unavailable",
      sessionId,
      error: terminalWrite.error,
    };
  }

  let terminalState =
    terminalWrite.ok || ("conflict" in terminalWrite && terminalWrite.conflict)
      ? terminalWrite.state
      : null;

  const baseFailed: PrintOrderRecord = {
    ...existing,
    status: "failed",
    printfulOrderId: reviewOrderId || existing.printfulOrderId,
    error: terminalState?.error || error,
    printfulFileReviewPendingAt: undefined,
    operatorFailureAlertedAt: terminalState?.operatorFailureAlertedAt,
    operatorFailureAlertProvider: terminalState?.operatorFailureAlertProvider,
    operatorFailureAlertError: terminalState?.operatorFailureAlertError,
  };

  let nextRecord = overlayPrintOrderTerminalState(baseFailed, terminalState) ?? baseFailed;

  if (!nextRecord.operatorFailureAlertedAt) {
    const alertResult = await sendPrintOrderFailureAlert(nextRecord);
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

    const alertTerminal = await recordPrintOrderTerminalFailure(
      {
        sessionId,
        error: nextRecord.error || error,
        source: "printful_webhook",
        ...alertPatch,
      },
      { store: input.terminalStore },
    );
    if (alertTerminal.ok || ("conflict" in alertTerminal && alertTerminal.conflict)) {
      terminalState = alertTerminal.state;
      nextRecord = overlayPrintOrderTerminalState(
        {
          ...nextRecord,
          ...alertPatch,
        },
        terminalState,
      )!;
    } else {
      nextRecord = { ...nextRecord, ...alertPatch };
    }
  }

  await kv.set(printOrderKey(sessionId), nextRecord);

  if (nextRecord.operatorFailureAlertError) {
    return {
      ok: false,
      status: "alert_failed",
      sessionId,
      error: nextRecord.operatorFailureAlertError,
    };
  }

  return {
    ok: true,
    status: "updated",
    sessionId,
  };
}
