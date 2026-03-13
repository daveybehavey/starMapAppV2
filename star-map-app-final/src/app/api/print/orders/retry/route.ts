import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { kv } from "@/lib/kv";
import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";
import { isPrintfulConfigured, submitPrintfulOrder } from "@/lib/printful";
import { evaluatePrintMarginForPaidOrder } from "@/lib/printMargin";
import {
  buildPrintAssetUrl,
  getPrintMinChargeCents,
  getPrintRecipient,
  hasSufficientPrintCharge,
  isValidPrintCheckoutSessionId,
  printOrderKey,
  type PrintOrderRecord,
} from "@/lib/printOrders";
import { sendPrintOrderApprovalAlert, sendPrintOrderFailureAlert } from "@/lib/printOrderAlerts";

export const runtime = "nodejs";

const printFulfillmentWebhookUrl = process.env.PRINT_FULFILLMENT_WEBHOOK_URL?.trim() || "";
const printOrderSubmissionEnabled = /^(1|true|yes)$/i.test(
  (process.env.PRINT_ORDER_SUBMISSION_ENABLED || "").trim(),
);
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com").replace(/\/+$/, "");
const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe =
  stripeSecret &&
  new Stripe(stripeSecret, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
    timeout: 20_000,
  });

function requireAdmin(req: NextRequest) {
  const configured = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  const candidate = readAdminTokenFromHeaders(req.headers);
  return hasValidAdminToken(candidate, configured);
}

function extractShippingDetails(session: Stripe.Checkout.Session): Stripe.Checkout.Session.ShippingDetails | null {
  if (session.shipping_details) return session.shipping_details;
  const collected = (
    session as Stripe.Checkout.Session & {
      collected_information?: { shipping_details?: Stripe.Checkout.Session.ShippingDetails | null };
    }
  ).collected_information?.shipping_details;
  return collected ?? null;
}

async function hydrateOrderRecipientData(existing: PrintOrderRecord): Promise<PrintOrderRecord> {
  if (getPrintRecipient(existing)) return existing;
  if (!stripe) return existing;
  try {
    const session = await stripe.checkout.sessions.retrieve(existing.sessionId);
    const updated: PrintOrderRecord = {
      ...existing,
      amountTotal:
        typeof session.amount_total === "number" && Number.isFinite(session.amount_total)
          ? session.amount_total
          : existing.amountTotal ?? null,
      currency: session.currency ?? existing.currency ?? null,
      customerEmail: session.customer_details?.email ?? session.customer_email ?? existing.customerEmail ?? null,
      customerName: session.customer_details?.name ?? existing.customerName ?? null,
      shippingDetails: extractShippingDetails(session) ?? existing.shippingDetails ?? null,
    };
    if (
      updated.customerEmail !== existing.customerEmail ||
      updated.customerName !== existing.customerName ||
      JSON.stringify(updated.shippingDetails) !== JSON.stringify(existing.shippingDetails)
    ) {
      await kv.set(printOrderKey(existing.sessionId), updated);
    }
    return updated;
  } catch (error) {
    console.warn("Failed to refresh print order recipient details from Stripe", error);
    return existing;
  }
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!printOrderSubmissionEnabled) {
    return NextResponse.json(
      { ok: false, error: "Print order submission is disabled" },
      { status: 503 },
    );
  }

  let sessionId = "";
  try {
    const body = (await req.json()) as { sessionId?: unknown } | null;
    if (typeof body?.sessionId === "string") {
      sessionId = body.sessionId.trim();
    }
  } catch {
    sessionId = "";
  }
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "sessionId required" }, { status: 400 });
  }
  if (!isValidPrintCheckoutSessionId(sessionId)) {
    return NextResponse.json({ ok: false, error: "valid sessionId required" }, { status: 400 });
  }

  const persistFailedPrintOrder = async (record: PrintOrderRecord) => {
    const failedRecord: PrintOrderRecord = {
      ...record,
      status: "failed",
    };
    if (!failedRecord.operatorFailureAlertedAt) {
      const alertResult = await sendPrintOrderFailureAlert(failedRecord);
      if (alertResult.delivered) {
        failedRecord.operatorFailureAlertedAt = Date.now();
        failedRecord.operatorFailureAlertProvider = alertResult.provider;
        failedRecord.operatorFailureAlertError = undefined;
      } else {
        failedRecord.operatorFailureAlertProvider = alertResult.provider;
        failedRecord.operatorFailureAlertError = alertResult.error;
      }
    }
    await kv.set(printOrderKey(sessionId), failedRecord);
    return failedRecord;
  };

  const existing = await kv.get<PrintOrderRecord>(printOrderKey(sessionId));
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Print order not found" }, { status: 404 });
  }
  if (existing.status === "sent") {
    if (!existing.operatorAlertedAt) {
      const alertResult = await sendPrintOrderApprovalAlert(existing);
      const updated: PrintOrderRecord = {
        ...existing,
        operatorAlertedAt: alertResult.delivered ? Date.now() : existing.operatorAlertedAt,
        operatorAlertProvider: alertResult.provider,
        operatorAlertError: alertResult.delivered ? undefined : alertResult.error,
      };
      await kv.set(printOrderKey(sessionId), updated);
      return NextResponse.json({ ok: true, status: "already_sent", order: updated });
    }
    return NextResponse.json({ ok: true, status: "already_sent", order: existing });
  }

  const hydrated = await hydrateOrderRecipientData(existing);

  const printAssetId = hydrated.printAssetId?.trim();
  if (!printAssetId) {
    const failed = await persistFailedPrintOrder({
      ...hydrated,
      attempts: (hydrated.attempts ?? 0) + 1,
      error: "print_asset_missing",
    });
    return NextResponse.json({ ok: false, error: failed.error, order: failed }, { status: 400 });
  }

  const printAssetUrl = hydrated.printAssetUrl?.trim() || buildPrintAssetUrl(siteUrl, printAssetId);
  const recipient = getPrintRecipient(hydrated);
  if (!recipient) {
    const failed = await persistFailedPrintOrder({
      ...hydrated,
      attempts: (hydrated.attempts ?? 0) + 1,
      printAssetUrl,
      error: "shipping_details_missing",
    });
    return NextResponse.json({ ok: false, error: failed.error, order: failed }, { status: 400 });
  }

  if (!hasSufficientPrintCharge(hydrated.amountTotal)) {
    const failed = await persistFailedPrintOrder({
      ...hydrated,
      attempts: (hydrated.attempts ?? 0) + 1,
      printAssetUrl,
      error: `print_amount_below_minimum:${getPrintMinChargeCents()}`,
    });
    return NextResponse.json({ ok: false, error: failed.error, order: failed }, { status: 400 });
  }

  const marginCheck = evaluatePrintMarginForPaidOrder({
    variant: hydrated.printVariant,
    shippingCountry: recipient.country_code,
    amountTotalCents: hydrated.amountTotal ?? null,
  });
  if (!marginCheck.allowed) {
    const failed = await persistFailedPrintOrder({
      ...hydrated,
      attempts: (hydrated.attempts ?? 0) + 1,
      printAssetUrl,
      error:
        marginCheck.code === "margin_below_threshold"
          ? `print_margin_below_minimum:${marginCheck.minMarginCents}`
          : "print_margin_estimate_unavailable",
    });
    return NextResponse.json({ ok: false, error: failed.error, order: failed }, { status: 400 });
  }

  if (!isPrintfulConfigured() && !printFulfillmentWebhookUrl) {
    return NextResponse.json({ ok: false, error: "Fulfillment not configured" }, { status: 503 });
  }

  const attempts = (hydrated.attempts ?? 0) + 1;
  const now = Date.now();

  if (isPrintfulConfigured()) {
    const printful = await submitPrintfulOrder({
      externalId: sessionId,
      variant: hydrated.printVariant,
      fileUrl: printAssetUrl,
      recipient,
    });
    if (!printful.ok) {
      const failed = await persistFailedPrintOrder({
        ...hydrated,
        attempts,
        printAssetUrl,
        webhookStatus: printful.status,
        error: printful.error ?? "printful_order_failed",
      });
      return NextResponse.json({ ok: false, error: failed.error, order: failed }, { status: 502 });
    }
    const sent: PrintOrderRecord = {
      ...hydrated,
      status: "sent" as const,
      attempts,
      printAssetUrl,
      webhookStatus: printful.status,
      printfulOrderId: printful.orderId,
      sentAt: now,
      error: undefined,
    };
    if (!sent.operatorAlertedAt) {
      const alertResult = await sendPrintOrderApprovalAlert(sent);
      if (alertResult.delivered) {
        sent.operatorAlertedAt = Date.now();
        sent.operatorAlertProvider = alertResult.provider;
        sent.operatorAlertError = undefined;
      } else {
        sent.operatorAlertProvider = alertResult.provider;
        sent.operatorAlertError = alertResult.error;
      }
    }
    await kv.set(printOrderKey(sessionId), sent);
    return NextResponse.json({ ok: true, status: "sent", order: sent });
  }

  try {
    const response = await fetch(printFulfillmentWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...hydrated,
        printAssetUrl,
        recipient,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Webhook ${response.status}: ${body.slice(0, 280)}`);
    }

    const sent = {
      ...hydrated,
      status: "sent" as const,
      attempts,
      printAssetUrl,
      webhookStatus: response.status,
      sentAt: now,
      error: undefined,
    };
    await kv.set(printOrderKey(sessionId), sent);
    return NextResponse.json({ ok: true, status: "sent", order: sent });
  } catch (error) {
    const failed = await persistFailedPrintOrder({
      ...hydrated,
      attempts,
      printAssetUrl,
      error: error instanceof Error ? error.message.slice(0, 320) : "webhook_failed",
    });
    return NextResponse.json({ ok: false, error: failed.error, order: failed }, { status: 502 });
  }
}
