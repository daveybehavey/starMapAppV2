import type { BulkQuoteRecord } from "@/lib/bulkQuotes";
import {
  getBulkQuoteBrandingLabel,
  getBulkQuoteFormatLabel,
  getBulkQuoteOrderTypeLabel,
  getBulkQuoteSupportEmail,
} from "@/lib/bulkQuotes";

type BulkQuoteAlertProvider = "resend" | "sendgrid" | "none";

export type BulkQuoteAlertResult = {
  delivered: boolean;
  provider: BulkQuoteAlertProvider;
  error?: string;
};

type ParsedEmailAddress = {
  email: string;
  name?: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseEmailAddress(value?: string | null): ParsedEmailAddress | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(.*)<([^>]+)>$/);
  if (match) {
    const name = match[1].trim().replace(/^"|"$/g, "");
    const email = match[2].trim();
    if (!email) return null;
    return name ? { email, name } : { email };
  }
  return { email: trimmed };
}

function getAlertRecipient() {
  return (
    process.env.BULK_QUOTE_ALERT_TO?.trim() ||
    process.env.PROMOTION_EMAIL_REPLY_TO?.trim() ||
    getBulkQuoteSupportEmail()
  );
}

function getAlertFrom() {
  return (
    process.env.BULK_QUOTE_ALERT_FROM?.trim() ||
    process.env.PROMOTION_EMAIL_FROM?.trim() ||
    process.env.PRINT_ORDER_ALERT_FROM?.trim() ||
    ""
  );
}

function getReplyTo(record: BulkQuoteRecord) {
  return parseEmailAddress(record.email)?.email || record.email;
}

function getSubject(record: BulkQuoteRecord) {
  const org = record.organization?.trim();
  const orderLabel = getBulkQuoteOrderTypeLabel(record.orderType);
  if (org) {
    return `New bulk quote request: ${org} (${orderLabel})`;
  }
  return `New bulk quote request: ${record.name} (${orderLabel})`;
}

function getCopy(record: BulkQuoteRecord) {
  const subject = getSubject(record);
  const destination = record.shippingDestination || "Not provided";
  const deadline = record.deliveryDeadline || "Not provided";
  const org = record.organization || "Not provided";
  const notes = record.notes || "None";
  const size = record.sizePreference || "Not specified";
  const text = [
    subject,
    "",
    `Request ID: ${record.id}`,
    `Created: ${record.createdAt}`,
    `Status: ${record.status}`,
    `Name: ${record.name}`,
    `Email: ${record.email}`,
    `Organization: ${org}`,
    `Order type: ${getBulkQuoteOrderTypeLabel(record.orderType)}`,
    `Quantity: ${record.quantity}`,
    `Distinct versions: ${record.versionCount}`,
    `Format: ${getBulkQuoteFormatLabel(record.preferredFormat)}`,
    `Branding: ${getBulkQuoteBrandingLabel(record.brandingRequest)}`,
    `Event date(s): ${record.eventDates}`,
    `Map location(s): ${record.mapLocation}`,
    `Preferred size: ${size}`,
    `Deadline: ${deadline}`,
    `Shipping destination: ${destination}`,
    `Source: ${record.source || "bulk_event_orders_page"}`,
    `Notes: ${notes}`,
  ].join("\n");

  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 680px; margin: 0 auto; color: #0b1324; line-height: 1.6;">
      <div style="border: 1px solid #e6dcc8; border-radius: 20px; overflow: hidden; background: #fbf7ef;">
        <div style="padding: 18px 22px; background: linear-gradient(135deg, #07112b, #11234d); color: #f7f1e6;">
          <div style="font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.82;">StarMapCo Bulk Orders</div>
          <p style="font-size: 24px; font-weight: 700; margin: 8px 0 0;">${escapeHtml(subject)}</p>
          <p style="margin: 8px 0 0; color: #d9c78d;">Manual quote requested for ${escapeHtml(String(record.quantity))} pieces.</p>
        </div>
        <div style="padding: 20px 22px;">
          <div style="display: inline-block; padding: 6px 12px; border-radius: 999px; background: #f4c74e; color: #141414; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">
            ${escapeHtml(getBulkQuoteOrderTypeLabel(record.orderType))}
          </div>
          <div style="margin: 16px 0 20px; font-size: 28px; font-weight: 700; color: #0b1324;">${escapeHtml(String(record.quantity))} pieces</div>
          <table style="width: 100%; border-collapse: collapse; margin: 0 0 22px;">
            <tbody>
              <tr><td style="padding: 6px 0; font-weight: 700;">Contact</td><td style="padding: 6px 0;">${escapeHtml(record.name)} (${escapeHtml(record.email)})</td></tr>
              <tr><td style="padding: 6px 0; font-weight: 700;">Organization</td><td style="padding: 6px 0;">${escapeHtml(org)}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: 700;">Versions</td><td style="padding: 6px 0;">${escapeHtml(String(record.versionCount))}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: 700;">Format</td><td style="padding: 6px 0;">${escapeHtml(getBulkQuoteFormatLabel(record.preferredFormat))}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: 700;">Branding</td><td style="padding: 6px 0;">${escapeHtml(getBulkQuoteBrandingLabel(record.brandingRequest))}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: 700;">Event date(s)</td><td style="padding: 6px 0;">${escapeHtml(record.eventDates)}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: 700;">Map location(s)</td><td style="padding: 6px 0;">${escapeHtml(record.mapLocation)}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: 700;">Preferred size</td><td style="padding: 6px 0;">${escapeHtml(size)}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: 700;">Deadline</td><td style="padding: 6px 0;">${escapeHtml(deadline)}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: 700;">Destination</td><td style="padding: 6px 0;">${escapeHtml(destination)}</td></tr>
            </tbody>
          </table>
          <div style="padding: 16px; border-radius: 18px; background: rgba(11, 19, 36, 0.04); margin-bottom: 18px;">
            <div style="font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #775d23; font-weight: 700;">Notes</div>
            <p style="margin: 8px 0 0;">${escapeHtml(notes)}</p>
          </div>
          <p style="font-size: 12px; color: #5f6677; margin: 0;">Reply directly to this message to continue the quote conversation with the buyer.</p>
        </div>
      </div>
    </div>
  `;

  return { subject, text, html };
}

async function sendWithResend(record: BulkQuoteRecord): Promise<BulkQuoteAlertResult> {
  const resendApiKey = process.env.RESEND_API_KEY?.trim() || "";
  const from = getAlertFrom();
  const to = getAlertRecipient();
  if (!resendApiKey || !from || !to) {
    return { delivered: false, provider: "none", error: "bulk_quote_alert_not_configured" };
  }

  const copy = getCopy(record);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: copy.subject,
      text: copy.text,
      html: copy.html,
      reply_to: getReplyTo(record),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      delivered: false,
      provider: "resend",
      error: body.slice(0, 280) || `resend_${response.status}`,
    };
  }

  return { delivered: true, provider: "resend" };
}

async function sendWithSendgrid(record: BulkQuoteRecord): Promise<BulkQuoteAlertResult> {
  const sendgridApiKey = process.env.SENDGRID_API_KEY?.trim() || "";
  const from = parseEmailAddress(getAlertFrom());
  const to = getAlertRecipient();
  if (!sendgridApiKey || !from || !to) {
    return { delivered: false, provider: "none", error: "bulk_quote_alert_not_configured" };
  }

  const copy = getCopy(record);
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sendgridApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from,
      subject: copy.subject,
      content: [
        { type: "text/plain", value: copy.text },
        { type: "text/html", value: copy.html },
      ],
      reply_to: { email: getReplyTo(record) },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      delivered: false,
      provider: "sendgrid",
      error: body.slice(0, 280) || `sendgrid_${response.status}`,
    };
  }

  return { delivered: true, provider: "sendgrid" };
}

export async function sendBulkQuoteAlert(record: BulkQuoteRecord): Promise<BulkQuoteAlertResult> {
  try {
    const resendResult = await sendWithResend(record);
    if (resendResult.provider !== "none") return resendResult;

    const sendgridResult = await sendWithSendgrid(record);
    if (sendgridResult.provider !== "none") return sendgridResult;

    return { delivered: false, provider: "none", error: "bulk_quote_alert_not_configured" };
  } catch (error) {
    return {
      delivered: false,
      provider: "none",
      error: error instanceof Error ? error.message.slice(0, 280) : "bulk_quote_alert_failed",
    };
  }
}
