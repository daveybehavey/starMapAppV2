/** Keep in sync with src/lib/printfulWebhookOrderEvents.ts */
export const PRINTFUL_ORDER_FAILURE_WEBHOOK_TYPES = new Set([
  "order_failed",
  "order_canceled",
]);

export function isPrintfulOrderFailureWebhookType(eventType) {
  return PRINTFUL_ORDER_FAILURE_WEBHOOK_TYPES.has(eventType.trim());
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
