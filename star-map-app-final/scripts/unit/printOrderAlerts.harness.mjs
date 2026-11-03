/** Mirror of buildPrintOrderAlertIdempotencyKey in src/lib/printOrderAlerts.ts */
export function buildPrintOrderAlertIdempotencyKey(order, kind, options) {
  const episode = kind === "hold" && options?.escalated ? "hold_escalation" : kind;
  return `print-order-alert:${episode}:${order.sessionId}`;
}
