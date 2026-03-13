import type Stripe from "stripe";
import type { PrintVariant } from "@/lib/pricing";

export type PrintOrderRecord = {
  status: "pending" | "sent" | "failed";
  sessionId: string;
  mapId?: string;
  printVariant: PrintVariant;
  includesDigitalAddOn: boolean;
  amountTotal?: number | null;
  currency?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  shippingDetails?: Stripe.Checkout.Session.ShippingDetails | null;
  printAssetId?: string;
  printAssetUrl?: string;
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
  error?: string;
  createdAt: number;
};

export const printOrderKey = (sessionId: string) => `print:order:${sessionId}`;
const PRINT_CHECKOUT_SESSION_ID_REGEX = /^cs_(?:test|live)_[A-Za-z0-9_]+$/;
const DEFAULT_PRINT_MIN_CHARGE_CENTS = 100;

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

  return {
    name: shippingName,
    email: email || undefined,
    phone: undefined,
    address1: shippingAddress.line1,
    address2: shippingAddress.line2 || undefined,
    city: shippingAddress.city,
    state_code: shippingAddress.state || undefined,
    country_code: shippingAddress.country,
    zip: shippingAddress.postal_code,
  };
}
