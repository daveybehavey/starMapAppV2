/** Keep in sync with src/lib/printFulfillmentIndex.ts */
const PRINT_CHECKOUT_SESSION_ID_REGEX = /^cs_(?:test|live)_[A-Za-z0-9_]+$/;

export function printFulfillmentIndexKey(printfulOrderId) {
  const normalized = String(printfulOrderId).trim();
  return `print:fulfillment:by-printful:${normalized}`;
}

export function normalizePrintfulOrderId(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return String(Math.trunc(value));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) return trimmed;
  }
  return null;
}

export function isValidPrintCheckoutSessionId(sessionId) {
  const trimmed = sessionId.trim();
  if (!trimmed || trimmed.length > 255) return false;
  return PRINT_CHECKOUT_SESSION_ID_REGEX.test(trimmed);
}

export function resolvePrintfulWebhookSessionId(input) {
  const indexed = input.indexedSessionId?.trim();
  if (indexed && isValidPrintCheckoutSessionId(indexed)) {
    return indexed;
  }

  const externalId = input.externalId?.trim() || "";
  if (externalId && isValidPrintCheckoutSessionId(externalId)) {
    return externalId;
  }

  return null;
}
