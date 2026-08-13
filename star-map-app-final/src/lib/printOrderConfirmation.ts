import { kv } from "@/lib/kv";
import { persistPrintOrderRecord, printOrderKey, type PrintOrderRecord } from "@/lib/printOrders";
import {
  formatPrintOrderAmount,
  formatPrintShippingSummary,
  getPrintProductLabel,
  renderPrintOrderConfirmationEmail,
} from "@/lib/printOrderConfirmationEmail";
import { isResendConfigured, sendResendEmail } from "@/lib/resend";

export type PrintOrderConfirmationResult =
  | { ok: true; status: "sent" | "already_sent"; provider: "resend"; messageId: string | null }
  | { ok: false; status: "skipped" | "failed"; reason: string; provider?: "resend" };

type ExtendedPrintOrderRecord = PrintOrderRecord & {
  printConfirmationSentAt?: number;
  printConfirmationMessageId?: string;
  printConfirmationError?: string;
};

function isManualReviewRequired() {
  return /^(0|false|no)$/i.test((process.env.PRINTFUL_AUTO_CONFIRM ?? "true").trim());
}

function buildOrderReference(sessionId: string, printfulOrderId?: string | number | null) {
  const sessionSuffix = sessionId.length > 8 ? sessionId.slice(-8) : sessionId;
  if (printfulOrderId) {
    return `#${String(printfulOrderId)} (···${sessionSuffix})`;
  }
  return `···${sessionSuffix}`;
}

export async function sendPrintOrderConfirmation(sessionId: string): Promise<PrintOrderConfirmationResult> {
  const key = printOrderKey(sessionId);
  const record = (await kv.get<ExtendedPrintOrderRecord>(key)) as ExtendedPrintOrderRecord | null;
  if (!record) {
    return { ok: false, status: "skipped", reason: "order_not_found" };
  }
  if (record.status !== "sent") {
    return { ok: false, status: "skipped", reason: "order_not_submitted" };
  }

  if (record.printConfirmationSentAt) {
    return {
      ok: true,
      status: "already_sent",
      provider: "resend",
      messageId: record.printConfirmationMessageId ?? null,
    };
  }

  const customerEmail = record.customerEmail?.trim();
  if (!customerEmail) {
    return { ok: false, status: "skipped", reason: "customer_email_missing" };
  }

  if (!isResendConfigured()) {
    return { ok: false, status: "skipped", reason: "resend_not_configured" };
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://starmapco.com").replace(/\/+$/, "");
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@starmapco.com";
  const rendered = renderPrintOrderConfirmationEmail({
    customerName: record.customerName ?? null,
    productLabel: getPrintProductLabel(record.printVariant),
    amountLabel: formatPrintOrderAmount(record.amountTotal ?? null, record.currency ?? null),
    shippingSummary: formatPrintShippingSummary(record.shippingDetails),
    shippingCountry: record.shippingDetails?.address?.country ?? null,
    printVariant: record.printVariant ?? null,
    orderReference: buildOrderReference(sessionId, record.printfulOrderId),
    successUrl: `${siteUrl}/success?session_id=${encodeURIComponent(sessionId)}`,
    supportEmail,
    siteUrl,
    manualReviewRequired: isManualReviewRequired(),
    includesDigitalAddOn: record.includesDigitalAddOn === true,
  });

  const sendResult = await sendResendEmail({
    to: customerEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    tags: {
      type: "print_order_confirmation",
      session_id: sessionId.slice(0, 64),
    },
  });

  if (!sendResult.ok) {
    const failed: ExtendedPrintOrderRecord = {
      ...record,
      printConfirmationError: sendResult.error.slice(0, 320),
    };
    await persistPrintOrderRecord(sessionId, failed);
    console.warn("Print confirmation email failed", { sessionId, error: sendResult.error });
    return { ok: false, status: "failed", reason: sendResult.error, provider: "resend" };
  }

  const sent: ExtendedPrintOrderRecord = {
    ...record,
    printConfirmationSentAt: Date.now(),
    printConfirmationMessageId: sendResult.id || undefined,
    printConfirmationError: undefined,
  };
  await persistPrintOrderRecord(sessionId, sent);

  return {
    ok: true,
    status: "sent",
    provider: "resend",
    messageId: sendResult.id || null,
  };
}
