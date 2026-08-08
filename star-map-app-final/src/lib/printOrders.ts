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
/** Matches default entitled print-asset retention (fulfillment + short support window). */
export const DEFAULT_PRINT_ORDER_RETENTION_DAYS = 60;

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

/** Bounded KV retention for print-order records (including checkout phone). */
export function getPrintOrderRetentionSeconds() {
  const raw = process.env.PRINT_ORDER_RETENTION_DAYS?.trim();
  const days = raw ? Number.parseInt(raw, 10) : Number.NaN;
  const safeDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_PRINT_ORDER_RETENTION_DAYS;
  return safeDays * 24 * 60 * 60;
}

export async function persistPrintOrderRecord(sessionId: string, record: PrintOrderRecord) {
  await kv.set(printOrderKey(sessionId), record, { ex: getPrintOrderRetentionSeconds() });
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
