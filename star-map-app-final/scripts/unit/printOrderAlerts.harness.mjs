/** Mirror of buildPrintOrderAlertIdempotencyKey in src/lib/printOrderAlerts.ts */
export function buildPrintOrderAlertIdempotencyKey(order, kind, options) {
  const episode = kind === "hold" && options?.escalated ? "hold_escalation" : kind;
  const episodeStamp =
    kind === "hold"
      ? (order.providerHoldAt ?? 0)
      : kind === "review_pending"
        ? (order.fileReviewPendingSince ?? order.createdAt ?? 0)
        : (order.attempts ?? 0);
  return `print-order-alert:${episode}:${order.sessionId}:${episodeStamp}`;
}
