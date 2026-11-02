/** Keep in sync with src/lib/printfulWebhookOrderEvents.ts / printOrderAuthorityState.ts */
export const PRINTFUL_ORDER_FAILURE_WEBHOOK_TYPES = new Set(["order_failed", "order_canceled"]);

export function isPrintfulOrderFailureWebhookType(eventType) {
  return PRINTFUL_ORDER_FAILURE_WEBHOOK_TYPES.has(eventType.trim());
}

export const PRINTFUL_ORDER_HOLD_WEBHOOK_TYPE = "order_put_hold";

export function isPrintfulOrderHoldWebhookType(eventType) {
  return eventType.trim() === PRINTFUL_ORDER_HOLD_WEBHOOK_TYPE;
}

/** Mirror of holdProviderIdConflicts in src/lib/printfulWebhookOrderEvents.ts */
export function holdProviderIdConflicts(eventPrintfulOrderId, authorityPrintfulOrderId) {
  return Boolean(
    eventPrintfulOrderId &&
      authorityPrintfulOrderId &&
      eventPrintfulOrderId !== authorityPrintfulOrderId,
  );
}

/** Mirror of mergeHoldAnnotationsIntoLatestRecord in src/lib/printfulWebhookOrderEvents.ts */
export function mergeHoldAnnotationsIntoLatestRecord({ existing, fresh, annotations }) {
  if (fresh.shippedAt) {
    return { outcome: "superseded", reason: "shipment" };
  }
  if (fresh.status === "failed" || fresh.terminalEventType) {
    return { outcome: "superseded", reason: "terminal_failure" };
  }
  if (existing.providerHoldAt && !fresh.providerHoldAt) {
    return { outcome: "superseded", reason: "operator_resolve" };
  }
  const freshAlertLanded = Boolean(fresh.operatorHoldAlertedAt);
  return {
    outcome: "merged",
    record: {
      ...fresh,
      providerHoldAt: fresh.providerHoldAt ?? annotations.providerHoldAt,
      providerHoldReason:
        annotations.providerHoldReason ?? fresh.providerHoldReason,
      providerHoldOrderStatus:
        annotations.providerHoldOrderStatus ?? fresh.providerHoldOrderStatus,
      operatorHoldAlertedAt:
        fresh.operatorHoldAlertedAt ?? annotations.operatorHoldAlertedAt,
      operatorHoldAlertProvider: freshAlertLanded
        ? fresh.operatorHoldAlertProvider
        : annotations.operatorHoldAlertProvider,
      operatorHoldAlertError: freshAlertLanded
        ? undefined
        : annotations.operatorHoldAlertError,
    },
  };
}

export function buildPrintfulWebhookFailureError(eventType, reason, orderStatus) {
  const normalizedType = eventType.trim() || "order_event";
  const parts = [`printful_${normalizedType}`];
  const trimmedReason = reason?.trim();
  if (trimmedReason) parts.push(trimmedReason.slice(0, 240));
  const trimmedStatus = orderStatus?.trim();
  if (trimmedStatus) parts.push(`status=${trimmedStatus}`);
  return parts.join(":");
}
