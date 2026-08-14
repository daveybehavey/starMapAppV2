import type Stripe from "stripe";
import type { PrintVariant } from "@/lib/pricing";
import type { MerchFamilyId } from "@/lib/merchCatalog";
import { kv } from "@/lib/kv";

export type PrintOrderRecord = {
  status: "pending" | "sent" | "failed";
  sessionId: string;
  mapId?: string;
  printVariant: PrintVariant;
  /**
   * Optional merch fulfillment fields (Printful v2 catalog orders).
   * When present, the physical item is resolved via catalog_variant_id, not legacy Printful variant_id.
   */
  merchFamily?: MerchFamilyId;
  merchCatalogVariantId?: number;
  merchSize?: string;
  merchColor?: string;
  includesDigitalAddOn: boolean;
  /** Bundled greeting card with framed print (C1). */
  includesCardAddOn?: boolean;
  amountTotal?: number | null;
  currency?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  /**
   * Checkout phone from Stripe `customer_details.phone` (phone_number_collection).
   * Optional for Printful/carriers; null/absent means do not invent a fallback.
   * Persisted only for fulfillment/retry; never returned on operator API/script surfaces.
   */
  customerPhone?: string | null;
  shippingDetails?: Stripe.Checkout.Session.ShippingDetails | null;
  /** Captured at checkout creation for margin guard + ops. */
  shippingChargeCents?: number | null;
  printAssetId?: string;
  printAssetUrl?: string;
  cardPrintAssetId?: string;
  cardPrintAssetUrl?: string;
  printfulOrderId?: string | number;
  attempts: number;
  webhookStatus?: number;
  sentAt?: number;
  operatorAlertedAt?: number;
  operatorAlertProvider?: string;
  operatorAlertError?: string;
  operatorFailureAlertedAt?: number;
  operatorFailureAlertProvider?: string;
  operatorFailureAlertError?: string;
  operatorResolvedAt?: number;
  operatorResolvedProvider?: "manual_printful" | "manual_other";
  operatorResolvedNote?: string;
  printConfirmationSentAt?: number;
  printConfirmationMessageId?: string;
  printConfirmationError?: string;
  shippingNotificationSentAt?: number;
  shippingNotificationProvider?: "resend";
  shippingNotificationTrackingNumber?: string;
  shippingNotificationMessageId?: string;
  shippingNotificationError?: string;
  error?: string;
  createdAt: number;
};

export const printOrderKey = (sessionId: string) => `print:order:${sessionId}`;
const PRINT_CHECKOUT_SESSION_ID_REGEX = /^cs_(?:test|live)_[A-Za-z0-9_]+$/;
const DEFAULT_PRINT_MIN_CHARGE_CENTS = 100;
const SECONDS_PER_DAY = 24 * 60 * 60;
/** Fixed maximum retention from original order creation (fulfillment + short support window). */
export const DEFAULT_PRINT_ORDER_RETENTION_DAYS = 60;
/** Cloudflare Workers KV rejects expirationTtl below this value. */
export const CLOUDFLARE_KV_MIN_EXPIRATION_TTL_SECONDS = 60;

export function getPrintMinChargeCents() {
  const raw = process.env.PRINT_MIN_CHARGE_CENTS?.trim();
  if (!raw) return DEFAULT_PRINT_MIN_CHARGE_CENTS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PRINT_MIN_CHARGE_CENTS;
  return Math.max(0, parsed);
}

export function hasSufficientPrintCharge(amountTotal?: number | null) {
  return typeof amountTotal === "number" && Number.isFinite(amountTotal) && amountTotal >= getPrintMinChargeCents();
}

export function isValidPrintCheckoutSessionId(sessionId: string) {
  const trimmed = sessionId.trim();
  if (!trimmed || trimmed.length > 255) return false;
  return PRINT_CHECKOUT_SESSION_ID_REGEX.test(trimmed);
}

export function buildPrintAssetUrl(siteUrl: string, assetId: string) {
  const normalizedSite = siteUrl.replace(/\/+$/, "");
  return `${normalizedSite}/api/print/assets?id=${encodeURIComponent(assetId)}`;
}

/** Trim and keep non-empty checkout phone strings; otherwise null (no invented fallback). */
export function normalizeCheckoutPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Trusted Stripe Checkout phone sources for print fulfillment.
 * Prefer `customer_details.phone` (phone_number_collection), then shipping phone if present.
 */
export function extractCheckoutPhoneFromStripeSession(session: {
  customer_details?: { phone?: string | null } | null;
  shipping_details?: { phone?: string | null } | null;
}): string | null {
  return (
    normalizeCheckoutPhone(session.customer_details?.phone) ??
    normalizeCheckoutPhone(session.shipping_details?.phone)
  );
}

/**
 * Remaining bounded KV retention for a print-order record, in whole seconds.
 * The deadline is anchored to the original `createdAt`: later webhook, retry,
 * shipping, or notification writes can never restart the retention window.
 * Configuration may shorten the default 60-day bound, but never extend it.
 * Malformed creation timestamps and already-elapsed windows return `0` so the
 * caller can fail closed (durable delete) instead of minting a sub-minute TTL.
 */
export function getPrintOrderRetentionSeconds(createdAt: unknown, now = Date.now()) {
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) return 0;

  const raw = process.env.PRINT_ORDER_RETENTION_DAYS?.trim();
  const parsedDays = raw ? Number.parseInt(raw, 10) : Number.NaN;
  const configuredDays =
    Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : DEFAULT_PRINT_ORDER_RETENTION_DAYS;
  const retentionDays = Math.min(configuredDays, DEFAULT_PRINT_ORDER_RETENTION_DAYS);
  const maxRetentionSeconds = retentionDays * SECONDS_PER_DAY;
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const deadlineMs = createdAt + maxRetentionSeconds * 1000;
  const remainingSeconds = Math.ceil((deadlineMs - safeNow) / 1000);
  if (remainingSeconds <= 0) return 0;
  return Math.min(maxRetentionSeconds, remainingSeconds);
}

/**
 * Decide whether a print-order rewrite may use a provider-valid KV TTL, or must
 * durably delete. Never returns a sub-minute TTL and never extends past the
 * creation-anchored deadline.
 */
export function resolvePrintOrderKvWrite(
  createdAt: unknown,
  now = Date.now(),
): { action: "delete" } | { action: "persist"; ttlSeconds: number } {
  const remainingSeconds = getPrintOrderRetentionSeconds(createdAt, now);
  if (remainingSeconds < CLOUDFLARE_KV_MIN_EXPIRATION_TTL_SECONDS) {
    return { action: "delete" };
  }
  return { action: "persist", ttlSeconds: remainingSeconds };
}

/**
 * Brand-new print orders get `now`. When a prior record exists (including
 * pending/failed duplicates), preserve its `createdAt` exactly — even when
 * null/missing/non-finite — so persistence can fail closed instead of minting
 * a fresh retention window.
 */
export function resolvePrintOrderCreatedAt(
  existing: { createdAt?: unknown } | null | undefined,
  now = Date.now(),
): number {
  if (!existing) return now;
  // Intentionally return malformed values unchanged for fail-closed retention.
  return existing.createdAt as number;
}

export async function persistPrintOrderRecord(sessionId: string, record: PrintOrderRecord) {
  const key = printOrderKey(sessionId);
  const plan = resolvePrintOrderKvWrite(record.createdAt);
  if (plan.action === "delete") {
    // Remaining window is below Workers KV's minimum valid TTL (or malformed /
    // already expired). Do not attempt an invalid expirationTtl and do not
    // extend retention to 60s past the original deadline — remove the PII key.
    await kv.deleteDurable(key);
    return;
  }
  await kv.set(key, record, { ex: plan.ttlSeconds });
}

/**
 * Operator/status/retry/script-safe order view: never include phone values.
 * Exposes only a boolean so ops can confirm presence without logging PII.
 */
export function sanitizePrintOrderForOperatorResponse(record: PrintOrderRecord) {
  const hasCheckoutPhone = Boolean(
    normalizeCheckoutPhone(record.customerPhone) || normalizeCheckoutPhone(record.shippingDetails?.phone),
  );
  const rest = { ...record };
  delete rest.customerPhone;
  let safeShippingDetails: PrintOrderRecord["shippingDetails"] = rest.shippingDetails ?? null;
  if (safeShippingDetails && typeof safeShippingDetails === "object") {
    const shippingRest = { ...safeShippingDetails };
    delete (shippingRest as { phone?: string | null }).phone;
    safeShippingDetails = shippingRest;
  }
  return {
    ...rest,
    shippingDetails: safeShippingDetails,
    hasCheckoutPhone,
  };
}

type PrintfulRecipient = NonNullable<ReturnType<typeof getPrintRecipient>>;

/**
 * Outbound payload for the optional generic `PRINT_FULFILLMENT_WEBHOOK_URL`.
 * Omits checkout phone from both top-level record fields and recipient —
 * phone is shared only with Printful. Does not mutate the stored record.
 */
export function buildAlternateFulfillmentWebhookPayload(
  record: PrintOrderRecord,
  extras: {
    printAssetUrl?: string;
    cardPrintAssetUrl?: string;
    recipient: PrintfulRecipient;
  },
) {
  const sanitizedRecord = sanitizePrintOrderForOperatorResponse(record);
  const orderWithoutPhoneFlag = { ...sanitizedRecord };
  delete (orderWithoutPhoneFlag as { hasCheckoutPhone?: boolean }).hasCheckoutPhone;
  const recipientWithoutPhone = { ...extras.recipient };
  delete (recipientWithoutPhone as { phone?: string }).phone;
  return {
    ...orderWithoutPhoneFlag,
    ...(extras.printAssetUrl ? { printAssetUrl: extras.printAssetUrl } : {}),
    ...(extras.cardPrintAssetUrl ? { cardPrintAssetUrl: extras.cardPrintAssetUrl } : {}),
    recipient: recipientWithoutPhone,
  };
}

export function getPrintRecipient(record: PrintOrderRecord) {
  const shippingAddress = record.shippingDetails?.address;
  const shippingName = record.shippingDetails?.name?.trim() || record.customerName?.trim() || "";
  const email = record.customerEmail?.trim() || "";
  if (
    !shippingAddress ||
    !shippingName ||
    !shippingAddress.line1 ||
    !shippingAddress.city ||
    !shippingAddress.country ||
    !shippingAddress.postal_code
  ) {
    return null;
  }

  const phone =
    normalizeCheckoutPhone(record.customerPhone) ??
    normalizeCheckoutPhone(record.shippingDetails?.phone) ??
    undefined;

  return {
    name: shippingName,
    email: email || undefined,
    phone,
    address1: shippingAddress.line1,
    address2: shippingAddress.line2 || undefined,
    city: shippingAddress.city,
    state_code: shippingAddress.state || undefined,
    country_code: shippingAddress.country,
    zip: shippingAddress.postal_code,
  };
}
