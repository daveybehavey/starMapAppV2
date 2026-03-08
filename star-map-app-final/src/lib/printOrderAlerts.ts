import type { PrintOrderRecord } from "@/lib/printOrders";

type PrintOrderAlertProvider = "resend" | "sendgrid" | "none";

export type PrintOrderAlertResult = {
  delivered: boolean;
  provider: PrintOrderAlertProvider;
  error?: string;
};

type ParsedEmailAddress = {
  email: string;
  name?: string;
};

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
    process.env.PRINT_ORDER_ALERT_TO?.trim() ||
    process.env.PROMOTION_EMAIL_REPLY_TO?.trim() ||
    "support@starmapco.com"
  );
}

function getAlertFrom() {
  return process.env.PRINT_ORDER_ALERT_FROM?.trim() || process.env.PROMOTION_EMAIL_FROM?.trim() || "";
}

function getAlertReplyTo() {
  return process.env.PRINT_ORDER_ALERT_REPLY_TO?.trim() || process.env.PROMOTION_EMAIL_REPLY_TO?.trim() || "";
}

function formatAmount(amountTotal: number | null | undefined, currency: string | null | undefined) {
  if (typeof amountTotal !== "number" || !Number.isFinite(amountTotal)) return "Unknown";
  const code = (currency || "usd").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(amountTotal / 100);
  } catch {
    return `${(amountTotal / 100).toFixed(2)} ${code}`;
  }
}

function formatDestination(order: PrintOrderRecord) {
  const address = order.shippingDetails?.address;
  if (!address) return "Unknown destination";
  return [address.city, address.state, address.country].filter(Boolean).join(", ") || "Unknown destination";
}

function getVariantLabel(order: PrintOrderRecord) {
  return order.printVariant === "poster_framed" ? "Framed print" : "Unframed print";
}

function getSubject(order: PrintOrderRecord) {
  const prefix = order.includesDigitalAddOn ? "Print + HD" : "Print";
  return `New ${prefix} order ready for approval`;
}

function getCopy(order: PrintOrderRecord) {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com").replace(/\/+$/, "");
  const approvalMode =
    /^(0|false|no)$/i.test((process.env.PRINTFUL_AUTO_CONFIRM ?? "true").trim())
      ? "Printful created a draft order that still needs manual approval."
      : "Printful order was created automatically.";
  const createdAt = new Date(order.createdAt || Date.now()).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const amount = formatAmount(order.amountTotal, order.currency);
  const destination = formatDestination(order);
  const subject = getSubject(order);
  const text = [
    subject,
    "",
    approvalMode,
    "",
    `Session ID: ${order.sessionId}`,
    `Printful order ID: ${order.printfulOrderId ?? "Unknown"}`,
    `Variant: ${getVariantLabel(order)}`,
    `Digital add-on: ${order.includesDigitalAddOn ? "Yes" : "No"}`,
    `Amount paid: ${amount}`,
    `Customer: ${order.customerName || order.customerEmail || "Unknown"}`,
    `Destination: ${destination}`,
    `Created: ${createdAt}`,
    "",
    `Review in Printful: https://www.printful.com/dashboard/default/orders`,
    `Site: ${siteUrl}`,
  ].join("\n");

  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 620px; margin: 0 auto; color: #0b1324; line-height: 1.6;">
      <p style="font-size: 20px; font-weight: 700; margin: 0 0 12px;">${subject}</p>
      <p style="margin: 0 0 16px;">${approvalMode}</p>
      <table style="width: 100%; border-collapse: collapse; margin: 0 0 18px;">
        <tbody>
          <tr><td style="padding: 6px 0; font-weight: 700;">Session ID</td><td style="padding: 6px 0;">${order.sessionId}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Printful order ID</td><td style="padding: 6px 0;">${order.printfulOrderId ?? "Unknown"}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Variant</td><td style="padding: 6px 0;">${getVariantLabel(order)}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Digital add-on</td><td style="padding: 6px 0;">${order.includesDigitalAddOn ? "Yes" : "No"}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Amount paid</td><td style="padding: 6px 0;">${amount}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Customer</td><td style="padding: 6px 0;">${order.customerName || order.customerEmail || "Unknown"}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Destination</td><td style="padding: 6px 0;">${destination}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Created</td><td style="padding: 6px 0;">${createdAt}</td></tr>
        </tbody>
      </table>
      <p>
        <a href="https://www.printful.com/dashboard/default/orders" style="display: inline-block; padding: 10px 16px; border-radius: 999px; background: #f4c74e; color: #141414; text-decoration: none; font-weight: 700;">Open Printful Orders</a>
      </p>
      <p style="font-size: 13px; color: #4c5364;">Site: <a href="${siteUrl}" style="color: #b07d1b; text-decoration: none;">${siteUrl}</a></p>
    </div>
  `;

  return { subject, text, html };
}

async function sendWithResend(order: PrintOrderRecord) {
  const resendApiKey = process.env.RESEND_API_KEY?.trim() || "";
  const from = getAlertFrom();
  const to = getAlertRecipient();
  if (!resendApiKey || !from || !to) {
    return { delivered: false, provider: "none" as const, error: "print_alert_not_configured" };
  }

  const payload: {
    from: string;
    to: string[];
    subject: string;
    text: string;
    html: string;
    reply_to?: string;
  } = {
    from,
    to: [to],
    ...getCopy(order),
  };

  const replyTo = getAlertReplyTo();
  if (replyTo) {
    const parsed = parseEmailAddress(replyTo);
    payload.reply_to = parsed?.email || replyTo;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      delivered: false,
      provider: "resend" as const,
      error: body.slice(0, 280) || `resend_${response.status}`,
    };
  }

  return { delivered: true, provider: "resend" as const };
}

async function sendWithSendgrid(order: PrintOrderRecord) {
  const sendgridApiKey = process.env.SENDGRID_API_KEY?.trim() || "";
  const from = parseEmailAddress(getAlertFrom());
  const to = getAlertRecipient();
  if (!sendgridApiKey || !from || !to) {
    return { delivered: false, provider: "none" as const, error: "print_alert_not_configured" };
  }

  const copy = getCopy(order);
  const replyTo = parseEmailAddress(getAlertReplyTo());

  const payload = {
    personalizations: [{ to: [{ email: to }] }],
    from,
    subject: copy.subject,
    content: [
      { type: "text/plain", value: copy.text },
      { type: "text/html", value: copy.html },
    ],
    ...(replyTo ? { reply_to: replyTo } : {}),
  };

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sendgridApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      delivered: false,
      provider: "sendgrid" as const,
      error: body.slice(0, 280) || `sendgrid_${response.status}`,
    };
  }

  return { delivered: true, provider: "sendgrid" as const };
}

export async function sendPrintOrderApprovalAlert(order: PrintOrderRecord): Promise<PrintOrderAlertResult> {
  try {
    const resendResult = await sendWithResend(order);
    if (resendResult.provider !== "none") return resendResult;

    const sendgridResult = await sendWithSendgrid(order);
    if (sendgridResult.provider !== "none") return sendgridResult;

    return { delivered: false, provider: "none", error: "print_alert_not_configured" };
  } catch (error) {
    return {
      delivered: false,
      provider: "none",
      error: error instanceof Error ? error.message.slice(0, 280) : "print_alert_failed",
    };
  }
}
