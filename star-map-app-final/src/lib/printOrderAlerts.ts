import type { PrintOrderRecord } from "@/lib/printOrders";

type PrintOrderAlertProvider = "resend" | "sendgrid" | "none";
type PrintOrderAlertKind = "approval" | "failure" | "hold";

type PrintOrderAlertOptions = {
  /** Hold alerts only: this is the aging-sweep escalation, not the first notice. */
  escalated?: boolean;
};

export type PrintOrderAlertResult = {
  delivered: boolean;
  provider: PrintOrderAlertProvider;
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

function getPrintfulReviewUrl(order: PrintOrderRecord) {
  if (order.printfulOrderId) {
    return `https://www.printful.com/dashboard/default/orders/${encodeURIComponent(String(order.printfulOrderId))}`;
  }
  return "https://www.printful.com/dashboard/default/orders";
}

function getApprovalSubject(order: PrintOrderRecord) {
  const prefix = order.includesDigitalAddOn ? "Print + HD" : "Print";
  return `New ${prefix} order ready for approval`;
}

function getFailureSubject(order: PrintOrderRecord) {
  const prefix = order.includesDigitalAddOn ? "Print + HD" : "Print";
  return `${prefix} order needs intervention`;
}

function getHoldSubject(order: PrintOrderRecord, options?: PrintOrderAlertOptions) {
  const prefix = order.includesDigitalAddOn ? "Print + HD" : "Print";
  return options?.escalated
    ? `${prefix} order still on hold at Printful — escalation`
    : `${prefix} order on hold at Printful`;
}

function getFailureReason(order: PrintOrderRecord) {
  return order.error?.trim() || "unknown_failure";
}

function getHoldReason(order: PrintOrderRecord) {
  return order.providerHoldReason?.trim() || "unknown_hold_reason";
}

function getIntro(order: PrintOrderRecord, kind: PrintOrderAlertKind, options?: PrintOrderAlertOptions) {
  if (kind === "approval") {
    return /^(0|false|no)$/i.test((process.env.PRINTFUL_AUTO_CONFIRM ?? "true").trim())
      ? "Printful created a draft order that still needs manual approval."
      : "Printful order was created automatically.";
  }
  if (kind === "hold") {
    return options?.escalated
      ? "This paid print order has been on hold at Printful past the escalation threshold and still needs operator action."
      : "Printful has placed this paid print order on hold. Production will not start until the hold is resolved in Printful.";
  }
  if (order.status === "pending" && getFailureReason(order) === "submission_disabled") {
    return "A paid print order is waiting because fulfillment submission is disabled.";
  }
  return "A paid print order could not move into fulfillment and needs operator review.";
}

function getFooterNote(kind: PrintOrderAlertKind) {
  if (kind === "approval") {
    return "Approve this draft in Printful when you are ready to submit it to fulfillment.";
  }
  if (kind === "hold") {
    return "Resolve the hold in Printful (for example a file, address, or payment issue on their side). The hold clears here when Printful ships or fails the order, or when an operator resolves it.";
  }
  return "Check the stored error, correct the issue, then retry the order from the admin endpoint or Printful workflow.";
}

function getCopy(order: PrintOrderRecord, kind: PrintOrderAlertKind, options?: PrintOrderAlertOptions) {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com").replace(/\/+$/, "");
  const createdAt = new Date(order.createdAt || Date.now()).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const amount = formatAmount(order.amountTotal, order.currency);
  const destination = formatDestination(order);
  const customer = order.customerName || order.customerEmail || "Unknown";
  const printfulReviewUrl = getPrintfulReviewUrl(order);
  const subject =
    kind === "approval"
      ? getApprovalSubject(order)
      : kind === "hold"
        ? getHoldSubject(order, options)
        : getFailureSubject(order);
  const intro = getIntro(order, kind, options);
  const failureReason = getFailureReason(order);
  const holdReason = getHoldReason(order);
  const textLines = [
    subject,
    "",
    intro,
    "",
    `Session ID: ${order.sessionId}`,
    `Printful order ID: ${order.printfulOrderId ?? "Unknown"}`,
    `Variant: ${getVariantLabel(order)}`,
    `Digital add-on: ${order.includesDigitalAddOn ? "Yes" : "No"}`,
    `Amount paid: ${amount}`,
    `Customer: ${customer}`,
    `Destination: ${destination}`,
    `Created: ${createdAt}`,
  ];
  if (kind === "failure") {
    textLines.push(`Failure reason: ${failureReason}`);
  }
  if (kind === "hold") {
    textLines.push(`Hold reason: ${holdReason}`);
  }
  textLines.push("", `Review in Printful: ${printfulReviewUrl}`, `Site: ${siteUrl}`);

  const accentBg = kind === "approval" ? "#f4c74e" : kind === "hold" ? "#fb923c" : "#f87171";
  const accentText = kind === "failure" ? "#ffffff" : "#141414";
  const accentSubtle = kind === "approval" ? "#d9c78d" : kind === "hold" ? "#fed7aa" : "#fecaca";
  const failureRow =
    kind === "failure"
      ? `<tr><td style="padding: 6px 0; font-weight: 700;">Failure reason</td><td style="padding: 6px 0;">${escapeHtml(
          failureReason,
        )}</td></tr>`
      : kind === "hold"
        ? `<tr><td style="padding: 6px 0; font-weight: 700;">Hold reason</td><td style="padding: 6px 0;">${escapeHtml(
            holdReason,
          )}</td></tr>`
        : "";

  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 620px; margin: 0 auto; color: #0b1324; line-height: 1.6;">
      <div style="border: 1px solid #e6dcc8; border-radius: 20px; overflow: hidden; background: #fbf7ef;">
        <div style="padding: 18px 22px; background: linear-gradient(135deg, #07112b, #11234d); color: #f7f1e6;">
          <div style="font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.82;">StarMapCo Print Ops</div>
          <p style="font-size: 24px; font-weight: 700; margin: 8px 0 0;">${escapeHtml(subject)}</p>
          <p style="margin: 8px 0 0; color: ${accentSubtle};">${escapeHtml(intro)}</p>
        </div>
        <div style="padding: 20px 22px;">
          <div style="display: inline-block; padding: 6px 12px; border-radius: 999px; background: ${accentBg}; color: ${accentText}; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">
            ${escapeHtml(getVariantLabel(order))}${order.includesDigitalAddOn ? " + HD" : ""}
          </div>
          <div style="margin: 16px 0 20px; font-size: 28px; font-weight: 700; color: #0b1324;">${escapeHtml(amount)}</div>
          <table style="width: 100%; border-collapse: collapse; margin: 0 0 22px;">
            <tbody>
              <tr><td style="padding: 6px 0; font-weight: 700;">Customer</td><td style="padding: 6px 0;">${escapeHtml(customer)}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: 700;">Destination</td><td style="padding: 6px 0;">${escapeHtml(destination)}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: 700;">Created</td><td style="padding: 6px 0;">${escapeHtml(createdAt)}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: 700;">Printful order ID</td><td style="padding: 6px 0;">${escapeHtml(String(order.printfulOrderId ?? "Unknown"))}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: 700;">Session ID</td><td style="padding: 6px 0; font-size: 13px;">${escapeHtml(order.sessionId)}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: 700;">Digital add-on</td><td style="padding: 6px 0;">${order.includesDigitalAddOn ? "Yes" : "No"}</td></tr>
              ${failureRow}
            </tbody>
          </table>
          <p style="margin: 0 0 14px;">
            <a href="${printfulReviewUrl}" style="display: inline-block; padding: 10px 16px; border-radius: 999px; background: ${accentBg}; color: ${accentText}; text-decoration: none; font-weight: 700; margin-right: 10px;">Review in Printful</a>
            <a href="${siteUrl}" style="display: inline-block; padding: 10px 16px; border-radius: 999px; border: 1px solid #c7b481; color: #0b1324; text-decoration: none; font-weight: 700;">Open StarMapCo</a>
          </p>
          <p style="font-size: 12px; color: #5f6677; margin: 0;">${escapeHtml(getFooterNote(kind))}</p>
        </div>
      </div>
    </div>
  `;

  return { subject, text: textLines.join("\n"), html };
}

async function sendWithResend(order: PrintOrderRecord, kind: PrintOrderAlertKind, options?: PrintOrderAlertOptions) {
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
    ...getCopy(order, kind, options),
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

async function sendWithSendgrid(order: PrintOrderRecord, kind: PrintOrderAlertKind, options?: PrintOrderAlertOptions) {
  const sendgridApiKey = process.env.SENDGRID_API_KEY?.trim() || "";
  const from = parseEmailAddress(getAlertFrom());
  const to = getAlertRecipient();
  if (!sendgridApiKey || !from || !to) {
    return { delivered: false, provider: "none" as const, error: "print_alert_not_configured" };
  }

  const copy = getCopy(order, kind, options);
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

async function sendPrintOrderAlert(
  order: PrintOrderRecord,
  kind: PrintOrderAlertKind,
  options?: PrintOrderAlertOptions,
): Promise<PrintOrderAlertResult> {
  try {
    const resendResult = await sendWithResend(order, kind, options);
    if (resendResult.provider !== "none") return resendResult;

    const sendgridResult = await sendWithSendgrid(order, kind, options);
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

export async function sendPrintOrderApprovalAlert(order: PrintOrderRecord): Promise<PrintOrderAlertResult> {
  return sendPrintOrderAlert(order, "approval");
}

export async function sendPrintOrderFailureAlert(order: PrintOrderRecord): Promise<PrintOrderAlertResult> {
  return sendPrintOrderAlert(order, "failure");
}

/** S96-1 F1: first notice that Printful placed a paid order on hold. */
export async function sendPrintOrderHoldAlert(order: PrintOrderRecord): Promise<PrintOrderAlertResult> {
  return sendPrintOrderAlert(order, "hold");
}

/** S96-1 F1: the hold sweep's escalation when a hold ages unresolved. */
export async function sendPrintOrderHoldEscalationAlert(
  order: PrintOrderRecord,
): Promise<PrintOrderAlertResult> {
  return sendPrintOrderAlert(order, "hold", { escalated: true });
}
