import { kv } from "@/lib/kv";
import {
  getEffectivePrintOrderRecord,
  recordTerminalFailureAndDeliverAlert,
} from "@/lib/printOrderCoordinator";
import { sendPrintOrderFailureAlert } from "@/lib/printOrderAlerts";
import {
  lookupSessionIdByPrintfulOrderId,
  normalizePrintfulOrderId,
  resolvePrintfulWebhookSessionId,
} from "@/lib/printFulfillmentIndex";
import { printOrderKey, type PrintOrderRecord } from "@/lib/printOrders";
import {
  classifyPrintfulFileStatus,
  formatPrintfulFileFailureError,
  reviewPrintfulOrderFiles,
} from "@/lib/printfulOrderReview";

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
}): Promise<{
  ok: boolean;
  status: "updated" | "ignored" | "alert_failed";
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
    } else if (review?.pendingFiles.length) {
      // Waiting/unknown file states are not confirmed webhook terminal failure overrides.
      // Keep the webhook event error (order_failed etc.) as the terminal reason — order-level
      // failure webhooks remain terminal. File pending alone does not soften order_failed.
      void classifyPrintfulFileStatus;
    }
  }

  const nextRecord = await recordTerminalFailureAndDeliverAlert({
    record: {
      ...existing,
      printfulOrderId: reviewOrderId || existing.printfulOrderId,
    },
    error,
    source: "printful_webhook",
    sendFailureAlert: (order, opts) => sendPrintOrderFailureAlert(order, opts),
  });

  await kv.set(printOrderKey(sessionId), nextRecord);

  const effective = await getEffectivePrintOrderRecord(sessionId, nextRecord, {
    requireReadable: true,
  });
  const finalOrder = effective.ok ? effective.order : nextRecord;
  if (finalOrder.operatorFailureAlertError && !finalOrder.operatorFailureAlertedAt) {
    return {
      ok: false,
      status: "alert_failed",
      sessionId,
      error: finalOrder.operatorFailureAlertError,
    };
  }

  return {
    ok: true,
    status: "updated",
    sessionId,
  };
}
