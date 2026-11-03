/**
 * Sends a branded shipping notification to a StarMapCo customer based on a
 * PrintOrderRecord in KV. Idempotent — won't double-send for the same tracking
 * number.
 *
 * Reads address/recipient details out of the existing PrintOrderRecord shape
 * used elsewhere in the codebase (Stripe shipping_details + customerEmail).
 */

import { kv } from "@/lib/kv";
import {
  printOrderKey,
  persistPrintOrderRecord,
  type PrintOrderRecord,
} from "@/lib/printOrders";
import { renderShippingNotificationEmail, type ShippingNotificationData } from "@/lib/shippingNotificationEmail";
import { isResendConfigured, sendResendEmail } from "@/lib/resend";

export type ShippingNotificationInput = {
  trackingNumber: string;
  carrier?: string | null;
  trackingUrl?: string | null;
  estimatedDeliveryFrom?: string | null;
  estimatedDeliveryTo?: string | null;
  productLabel?: string | null;
};

export type ShippingNotificationResult =
  | { ok: true; status: "sent" | "already_sent"; provider: "resend"; messageId: string | null }
  | { ok: false; status: "skipped" | "failed"; reason: string; provider?: "resend" };

type ShippingNotificationFields = {
  shippingNotificationSentAt?: number;
  shippingNotificationProvider?: "resend";
  shippingNotificationTrackingNumber?: string;
  shippingNotificationMessageId?: string;
  shippingNotificationError?: string;
};

type ExtendedPrintOrderRecord = PrintOrderRecord & ShippingNotificationFields;

function normalizeTracking(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function pickProductLabel(record: ExtendedPrintOrderRecord, override?: string | null): string {
  if (override?.trim()) return override.trim();
  if (record.merchFamily) {
    const family = String(record.merchFamily).replace(/[-_]/g, " ");
    const size = record.merchSize ? ` (${record.merchSize})` : "";
    return `${family}${size}`.replace(/\s+/g, " ").trim() || "Custom star map";
  }
  switch (record.printVariant) {
    case "poster_framed":
      return "Framed star map poster";
    case "poster_unframed":
      return "Star map poster";
    case "poster_unframed_16x16":
      return "Star map poster (16×16)";
    case "canvas_wrap":
      return "Star map canvas";
    case "mug_11oz":
      return "Star map mug";
    case "card_4x6":
      return "Star map card";
    default:
      return "Custom star map";
  }
}

function extractRecipientFromRecord(record: ExtendedPrintOrderRecord): ShippingNotificationData["shippingAddress"] {
  const shipping = record.shippingDetails as
    | {
        name?: string | null;
        address?: {
          line1?: string | null;
          line2?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          country?: string | null;
        } | null;
      }
    | null
    | undefined;
  if (!shipping) {
    return record.customerName ? { name: record.customerName } : null;
  }
  return {
    name: shipping.name ?? record.customerName ?? null,
    address1: shipping.address?.line1 ?? null,
    address2: shipping.address?.line2 ?? null,
    city: shipping.address?.city ?? null,
    state: shipping.address?.state ?? null,
    zip: shipping.address?.postal_code ?? null,
    country: shipping.address?.country ?? null,
  };
}

export async function sendShippingNotification(
  sessionId: string,
  input: ShippingNotificationInput,
): Promise<ShippingNotificationResult> {
  const trackingNumber = normalizeTracking(input.trackingNumber || "");
  if (!trackingNumber) {
    return { ok: false, status: "skipped", reason: "tracking_number_missing" };
  }

  const key = printOrderKey(sessionId);
  const loadedRecord = (await kv.get<ExtendedPrintOrderRecord>(key)) as ExtendedPrintOrderRecord | null;
  if (!loadedRecord) {
    return { ok: false, status: "skipped", reason: "order_not_found" };
  }

  const customerEmail = loadedRecord.customerEmail?.trim();
  if (!customerEmail) {
    return { ok: false, status: "skipped", reason: "customer_email_missing" };
  }

  if (
    loadedRecord.shippingNotificationSentAt &&
    loadedRecord.shippingNotificationTrackingNumber === trackingNumber
  ) {
    return {
      ok: true,
      status: "already_sent",
      provider: "resend",
      messageId: loadedRecord.shippingNotificationMessageId ?? null,
    };
  }

  // Persist the shipment FACT (shippedAt) before — and independently of —
  // the notification email outcome. The review-request engine anchors its
  // physical due window to this fact; anchoring it to email success would
  // let a Resend outage or missing config silently erase orders from the
  // review population (Codex design critique, P1). First-write-wins: a
  // reshipment with a new tracking number never resets the clock.
  // S96 follow-up writer audit F-8: anchor from the LATEST record, not
  // the load snapshot — a resolution or correction landing between the
  // load and the anchor is the base the anchor merges onto, and if
  // another writer anchored the shipment first, its stamp stands.
  let record = loadedRecord;
  if (!record.shippedAt) {
    const latest = (await kv.get<ExtendedPrintOrderRecord>(key)) as ExtendedPrintOrderRecord | null;
    if (latest?.shippedAt) {
      record = latest;
    } else {
      const anchorBase = latest ?? record;
      // S96-1 F1: shipment ends any recorded Printful hold — the order moved.
      const anchored: ExtendedPrintOrderRecord = {
        ...anchorBase,
        shippedAt: Date.now(),
        providerHoldAt: undefined,
        providerHoldReason: undefined,
        providerHoldOrderStatus: undefined,
        operatorHoldAlertedAt: undefined,
        operatorHoldAlertProvider: undefined,
        operatorHoldAlertError: undefined,
        operatorHoldEscalatedAt: undefined,
        operatorHoldEscalationAlertError: undefined,
      };
      const anchorResult = await persistPrintOrderRecord(sessionId, anchored);
      if (anchorResult.outcome !== "persisted") {
        // Fail closed before any email side effect, per the record-retention
        // posture used elsewhere in this codebase (AG-086).
        return { ok: false, status: "skipped", reason: "print_order_unretainable" };
      }
      record = anchored;
    }
  }

  // S96 follow-up writer audit F-8: the notification outcome persists
  // below used to write the whole pre-send snapshot back, erasing
  // anything that landed during the Resend await — in the deciding
  // interleaving, an operator resolution (this function happily loads
  // a failed record, anchors shippedAt onto it, and suspends in the
  // send; the resolve that lands meanwhile was reverted to the stale
  // failed snapshot by the outcome write). Outcomes now merge ONLY
  // the shipping-notification fields onto the latest record,
  // progress-only: a recorded success stamp is never erased by a
  // failure outcome, and never overwritten by a success for a
  // different tracking number (a concurrent send for another tracking
  // number keeps its own stamp; redelivery dedupes per number). The
  // persist outcome is handled explicitly — an unrecorded success
  // reports failure so the caller knows a redelivery may duplicate.
  const persistNotificationOutcome = async (
    outcomeFields: ShippingNotificationFields,
    successful: boolean,
  ): Promise<"persisted" | "superseded" | "unrecorded"> => {
    const latest = (await kv.get<ExtendedPrintOrderRecord>(key)) as ExtendedPrintOrderRecord | null;
    if (!latest) return "unrecorded";
    if (latest.shippingNotificationSentAt) {
      if (!successful) return "superseded";
      if (latest.shippingNotificationTrackingNumber !== trackingNumber) return "superseded";
    }
    const merged: ExtendedPrintOrderRecord = { ...latest, ...outcomeFields };
    const result = await persistPrintOrderRecord(sessionId, merged);
    return result.outcome === "persisted" ? "persisted" : "unrecorded";
  };

  if (!isResendConfigured()) {
    return { ok: false, status: "skipped", reason: "resend_not_configured" };
  }

  const rendered = renderShippingNotificationEmail({
    customerName: record.customerName ?? null,
    trackingNumber,
    carrier: input.carrier ?? null,
    trackingUrl: input.trackingUrl ?? null,
    estimatedDelivery:
      input.estimatedDeliveryFrom || input.estimatedDeliveryTo
        ? { from: input.estimatedDeliveryFrom ?? null, to: input.estimatedDeliveryTo ?? null }
        : null,
    productLabel: pickProductLabel(record, input.productLabel ?? null),
    // The record's stamped gift flag (webhook, from checkout metadata):
    // gift orders were promised no review ask, so the shipping email
    // suppresses its review blocks for them.
    isGift: record.isGift === true,
    shippingAddress: extractRecipientFromRecord(record),
    orderReference: record.printfulOrderId ? `#${record.printfulOrderId}` : null,
    supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@starmapco.com",
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://starmapco.com",
  });

  const sendResult = await sendResendEmail({
    to: customerEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    tags: {
      type: "shipping_notification",
      session_id: sessionId.slice(0, 64),
    },
  });

  if (!sendResult.ok) {
    // The send error is the primary fact; the error stamp is recorded
    // merge-only (F-8) so a concurrent resolution or success survives.
    await persistNotificationOutcome(
      { shippingNotificationError: sendResult.error.slice(0, 320) },
      false,
    );
    return { ok: false, status: "failed", reason: sendResult.error, provider: "resend" };
  }

  const recorded = await persistNotificationOutcome(
    {
      shippingNotificationSentAt: Date.now(),
      shippingNotificationProvider: "resend",
      shippingNotificationTrackingNumber: trackingNumber,
      shippingNotificationMessageId: sendResult.id || undefined,
      shippingNotificationError: undefined,
    },
    true,
  );
  if (recorded === "unrecorded") {
    // The email was delivered but its stamp could not be durably
    // recorded — report failure explicitly rather than claim a
    // recorded success a redelivery would duplicate.
    return { ok: false, status: "failed", reason: "shipping_notification_unrecorded", provider: "resend" };
  }

  return {
    ok: true,
    status: "sent",
    provider: "resend",
    messageId: sendResult.id || null,
  };
}
