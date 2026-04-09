import { createHash } from "node:crypto";
import { isValidPromotionEmail, normalizePromotionEmail } from "@/lib/promotionSubscriptions";

export const BULK_QUOTE_KEY_PREFIX = "bulk:quote:";
export const BULK_QUOTE_RATE_LIMIT_PER_HOUR = 5;
export const BULK_QUOTE_RETENTION_SECONDS = 60 * 60 * 24 * 400;

export const BULK_QUOTE_ORDER_TYPES = ["corporate", "memorial", "wedding", "milestone", "other"] as const;
export const BULK_QUOTE_FORMATS = ["unframed", "framed", "not_sure"] as const;
export const BULK_QUOTE_BRANDING_OPTIONS = ["none", "bottom_left_logo", "subtle_logo", "custom_branding"] as const;
export const BULK_QUOTE_STATUSES = ["new", "contacted", "quoted", "won", "lost", "archived"] as const;

export type BulkQuoteOrderType = (typeof BULK_QUOTE_ORDER_TYPES)[number];
export type BulkQuoteFormat = (typeof BULK_QUOTE_FORMATS)[number];
export type BulkQuoteBrandingOption = (typeof BULK_QUOTE_BRANDING_OPTIONS)[number];
export type BulkQuoteStatus = (typeof BULK_QUOTE_STATUSES)[number];

export type BulkQuoteRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: BulkQuoteStatus;
  name: string;
  email: string;
  organization: string | null;
  orderType: BulkQuoteOrderType;
  quantity: number;
  versionCount: number;
  eventDates: string;
  mapLocation: string;
  preferredFormat: BulkQuoteFormat;
  sizePreference: string | null;
  deliveryDeadline: string | null;
  shippingDestination: string;
  brandingRequest: BulkQuoteBrandingOption;
  notes: string | null;
  source: string | null;
  alertDelivered: boolean;
  alertProvider: "resend" | "sendgrid" | "none";
  alertError?: string;
  ipHash: string;
  userAgent?: string | null;
};

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type BulkQuoteInput = {
  name: string;
  email: string;
  organization: string | null;
  orderType: BulkQuoteOrderType;
  quantity: number;
  versionCount: number;
  eventDates: string;
  mapLocation: string;
  preferredFormat: BulkQuoteFormat;
  sizePreference: string | null;
  deliveryDeadline: string | null;
  shippingDestination: string;
  brandingRequest: BulkQuoteBrandingOption;
  notes: string | null;
  source: string | null;
};

function cleanString(raw: unknown, maxLength: number) {
  if (typeof raw !== "string") return "";
  return raw.replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function validateRequiredText(raw: unknown, maxLength: number, error: string): ValidationResult<string> {
  const value = cleanString(raw, maxLength);
  if (!value) return { ok: false, error };
  return { ok: true, value };
}

function validateOptionalText(raw: unknown, maxLength: number) {
  const value = cleanString(raw, maxLength);
  return value || null;
}

function validateEnum<T extends readonly string[]>(raw: unknown, values: T, fallback: T[number], error: string): ValidationResult<T[number]> {
  if (typeof raw !== "string") return { ok: true, value: fallback };
  const value = raw.trim();
  if (!value) return { ok: true, value: fallback };
  if ((values as readonly string[]).includes(value)) {
    return { ok: true, value: value as T[number] };
  }
  return { ok: false, error };
}

function validateInteger(raw: unknown, min: number, max: number, error: string): ValidationResult<number> {
  const numeric = typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseInt(raw.trim(), 10) : Number.NaN;
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
    return { ok: false, error };
  }
  return { ok: true, value: numeric };
}

export function bulkQuoteKey(id: string) {
  return `${BULK_QUOTE_KEY_PREFIX}${id}`;
}

export function hashClientIp(ip: string) {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export function isBulkOrdersEnabled() {
  return /^(1|true|yes)$/i.test((process.env.BULK_EVENT_ORDERS_ENABLED || "").trim());
}

export function getBulkQuoteSupportEmail() {
  return (process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@starmapco.com").trim() || "support@starmapco.com";
}

export function getBulkQuoteOrderTypeLabel(value: BulkQuoteOrderType) {
  switch (value) {
    case "corporate":
      return "Corporate";
    case "memorial":
      return "Memorial";
    case "wedding":
      return "Wedding";
    case "milestone":
      return "Milestone";
    default:
      return "Other";
  }
}

export function getBulkQuoteFormatLabel(value: BulkQuoteFormat) {
  switch (value) {
    case "unframed":
      return "Unframed";
    case "framed":
      return "Framed";
    default:
      return "Not sure yet";
  }
}

export function getBulkQuoteBrandingLabel(value: BulkQuoteBrandingOption) {
  switch (value) {
    case "none":
      return "No branding";
    case "bottom_left_logo":
      return "Bottom-left logo";
    case "subtle_logo":
      return "Subtle logo";
    default:
      return "Custom branding note";
  }
}

export function parseBulkQuoteInput(raw: unknown): ValidationResult<BulkQuoteInput> {
  const payload = typeof raw === "object" && raw ? (raw as Record<string, unknown>) : null;
  if (!payload) return { ok: false, error: "invalid_payload" };

  const name = validateRequiredText(payload.name, 80, "invalid_name");
  if (!name.ok) return name;

  const normalizedEmail = normalizePromotionEmail(payload.email);
  if (!normalizedEmail || !isValidPromotionEmail(normalizedEmail)) {
    return { ok: false, error: "invalid_email" };
  }

  const orderType = validateEnum(payload.orderType, BULK_QUOTE_ORDER_TYPES, "corporate", "invalid_order_type");
  if (!orderType.ok) return orderType;

  const quantity = validateInteger(payload.quantity, 25, 5000, "invalid_quantity");
  if (!quantity.ok) return quantity;

  const versionCount = validateInteger(payload.versionCount, 1, 5000, "invalid_version_count");
  if (!versionCount.ok) return versionCount;
  if (versionCount.value > quantity.value) {
    return { ok: false, error: "version_count_exceeds_quantity" };
  }

  const eventDates = validateRequiredText(payload.eventDates, 280, "invalid_event_dates");
  if (!eventDates.ok) return eventDates;

  const mapLocation = validateRequiredText(payload.mapLocation, 180, "invalid_map_location");
  if (!mapLocation.ok) return mapLocation;

  const preferredFormat = validateEnum(payload.preferredFormat, BULK_QUOTE_FORMATS, "unframed", "invalid_preferred_format");
  if (!preferredFormat.ok) return preferredFormat;

  const shippingDestination = validateRequiredText(payload.shippingDestination, 180, "invalid_shipping_destination");
  if (!shippingDestination.ok) return shippingDestination;

  const brandingRequest = validateEnum(payload.brandingRequest, BULK_QUOTE_BRANDING_OPTIONS, "none", "invalid_branding_request");
  if (!brandingRequest.ok) return brandingRequest;

  const source = validateOptionalText(payload.source, 48);

  return {
    ok: true,
    value: {
      name: name.value,
      email: normalizedEmail,
      organization: validateOptionalText(payload.organization, 120),
      orderType: orderType.value,
      quantity: quantity.value,
      versionCount: versionCount.value,
      eventDates: eventDates.value,
      mapLocation: mapLocation.value,
      preferredFormat: preferredFormat.value,
      sizePreference: validateOptionalText(payload.sizePreference, 80),
      deliveryDeadline: validateOptionalText(payload.deliveryDeadline, 80),
      shippingDestination: shippingDestination.value,
      brandingRequest: brandingRequest.value,
      notes: validateOptionalText(payload.notes, 1200),
      source,
    },
  };
}
