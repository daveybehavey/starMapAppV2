import { kv } from "@/lib/kv";
import { isValidPrintCheckoutSessionId } from "@/lib/printOrders";

export function printFulfillmentIndexKey(printfulOrderId: string | number): string {
  const normalized = String(printfulOrderId).trim();
  return `print:fulfillment:by-printful:${normalized}`;
}

export function normalizePrintfulOrderId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return String(Math.trunc(value));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) return trimmed;
  }
  return null;
}

export type PrintfulWebhookSessionResolveInput = {
  printfulOrderId?: unknown;
  externalId?: string | null;
  indexedSessionId?: string | null;
};

/**
 * Pure resolution order for Printful package_shipped webhooks.
 * 1) KV index via Printful order ID
 * 2) Raw cs_live_* / cs_test_* external_id (legacy)
 */
export function resolvePrintfulWebhookSessionId(input: PrintfulWebhookSessionResolveInput): string | null {
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

export async function lookupSessionIdByPrintfulOrderId(printfulOrderId: string | number): Promise<string | null> {
  const key = printFulfillmentIndexKey(printfulOrderId);
  const sessionId = await kv.get<string>(key);
  if (typeof sessionId !== "string") return null;
  const trimmed = sessionId.trim();
  return isValidPrintCheckoutSessionId(trimmed) ? trimmed : null;
}

export async function setPrintFulfillmentIndex(
  printfulOrderId: string | number,
  sessionId: string,
): Promise<void> {
  const normalizedOrderId = normalizePrintfulOrderId(printfulOrderId);
  if (!normalizedOrderId) return;
  if (!isValidPrintCheckoutSessionId(sessionId)) return;
  await kv.set(printFulfillmentIndexKey(normalizedOrderId), sessionId.trim());
}

/**
 * Remove a Printful-id → session index entry only if it still points at this session.
 * Never deletes another session's alias.
 */
export async function deletePrintFulfillmentIndexIfOwned(
  printfulOrderId: string | number,
  sessionId: string,
): Promise<"deleted" | "not_owned" | "missing" | "invalid"> {
  const normalizedOrderId = normalizePrintfulOrderId(printfulOrderId);
  if (!normalizedOrderId) return "invalid";
  if (!isValidPrintCheckoutSessionId(sessionId)) return "invalid";
  const key = printFulfillmentIndexKey(normalizedOrderId);
  const current = await kv.get<string>(key);
  if (typeof current !== "string") return "missing";
  const trimmed = current.trim();
  if (trimmed !== sessionId.trim()) return "not_owned";
  await kv.deleteDurable(key);
  return "deleted";
}

