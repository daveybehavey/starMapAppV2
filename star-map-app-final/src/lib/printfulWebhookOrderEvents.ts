import { kv } from "@/lib/kv";
import { sendPrintOrderFailureAlert } from "@/lib/printOrderAlerts";
import {
  lookupSessionIdByPrintfulOrderId,
  normalizePrintfulOrderId,
  resolvePrintfulWebhookSessionId,
} from "@/lib/printFulfillmentIndex";
import {
  getPrintOrderAuthorityState,
  markPrintOrderTerminalFailed,
  seedPrintOrderAuthorityFromKv,
} from "@/lib/printOrderAuthority";
import {
  isPrintfulTerminalFailureWebhookType,
  PRINTFUL_TERMINAL_FAILURE_WEBHOOK_TYPES,
} from "@/lib/printOrderAuthorityState";
import { persistPrintOrderRecord, printOrderKey, type PrintOrderRecord } from "@/lib/printOrders";
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
  status:
    | "updated"
    | "ignored"
    | "alert_failed"
    | "authority_unread"
    | "projection_missing"
    | "provider_id_conflict";
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
    return {
      ok: true,
      status: "ignored",
      reason: "session_unresolved",
    };
  }

  // DO-first: never gate terminal authority on KV readability.
  const existing = await kv.get<PrintOrderRecord>(printOrderKey(sessionId));

  let authority = await getPrintOrderAuthorityState(sessionId);
  if ((!authority || authority.revision === 0) && existing) {
    await seedPrintOrderAuthorityFromKv(sessionId, existing);
    authority = await getPrintOrderAuthorityState(sessionId);
  }

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

  // Authority transition succeeded. Missing KV is a degraded projection, not a lost event.
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

  const nextRecord: PrintOrderRecord = {
    ...existing,
    status: "failed",
    printfulOrderId: reviewOrderId || existing.printfulOrderId,
    error,
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
