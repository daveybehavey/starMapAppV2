type CheckoutRecoveryAlertProvider = "resend" | "sendgrid" | "none";

export type CheckoutRecoveryAlertInput = {
  sessionId: string;
  email: string;
  recoveryUrl: string;
  orderType: "digital" | "print";
  plan?: string;
  printVariant?: "poster_unframed" | "poster_framed";
  includesDigitalAddOn?: boolean;
  amountTotal?: number | null;
  currency?: string | null;
};

export type CheckoutRecoveryAlertResult = {
  delivered: boolean;
  provider: CheckoutRecoveryAlertProvider;
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
    .replace(/\"/g, "&quot;")
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

function getAlertFrom() {
  return (
    process.env.CHECKOUT_RECOVERY_EMAIL_FROM?.trim() ||
    process.env.PROMOTION_EMAIL_FROM?.trim() ||
    process.env.PRINT_ORDER_ALERT_FROM?.trim() ||
    ""
  );
}

function getAlertReplyTo() {
  return (
    process.env.CHECKOUT_RECOVERY_EMAIL_REPLY_TO?.trim() ||
    process.env.PROMOTION_EMAIL_REPLY_TO?.trim() ||
    process.env.PRINT_ORDER_ALERT_REPLY_TO?.trim() ||
    ""
  );
}

function formatAmount(amountTotal: number | null | undefined, currency: string | null | undefined) {
  if (typeof amountTotal !== "number" || !Number.isFinite(amountTotal)) return null;
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

function getOfferLabel(input: CheckoutRecoveryAlertInput) {
  if (input.orderType === "print") {
    const printLabel = input.printVariant === "poster_framed" ? "framed print" : "unframed print";
    return input.includesDigitalAddOn ? `${printLabel} + HD download` : printLabel;
  }
  if (input.plan === "pack3") return "3-pack HD download";
  if (input.plan === "subscription") return "unlimited HD access";
  return "HD download";
}

function getSubject(input: CheckoutRecoveryAlertInput) {
  if (input.orderType === "print") {
    return input.printVariant === "poster_framed"
      ? "Your framed StarMapCo order is still waiting"
      : "Your StarMapCo print order is still waiting";
  }
  return "Complete your StarMapCo order";
}

function getCopy(input: CheckoutRecoveryAlertInput) {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com").replace(/\/+$/, "");
  const subject = getSubject(input);
  const offerLabel = getOfferLabel(input);
  const amount = formatAmount(input.amountTotal, input.currency);
  const text = [
    subject,
    "",
    `Your ${offerLabel} is still saved and ready.`,
    "",
    amount ? `Order total: ${amount}` : null,
    `Resume checkout: ${input.recoveryUrl}`,
    "",
    "If you have any questions, reply to this email and we can help.",
    "",
    "— StarMapCo",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 560px; margin: 0 auto; color: #0b1324; line-height: 1.6;">
      <div style="border: 1px solid #e6dcc8; border-radius: 20px; overflow: hidden; background: #fbf7ef;">
        <div style="padding: 18px 22px; background: linear-gradient(135deg, #07112b, #11234d); color: #f7f1e6;">
          <div style="font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.82;">StarMapCo</div>
          <p style="font-size: 24px; font-weight: 700; margin: 8px 0 0;">${escapeHtml(subject)}</p>
          <p style="margin: 8px 0 0; color: #d9c78d;">Your ${escapeHtml(offerLabel)} is still saved and ready.</p>
        </div>
        <div style="padding: 20px 22px;">
          <p style="margin: 0 0 14px;">Pick up where you left off and finish checkout when you are ready.</p>
          ${
            amount
              ? `<p style="font-size: 24px; font-weight: 700; margin: 0 0 18px; color: #0b1324;">${escapeHtml(amount)}</p>`
              : ""
          }
          <p style="margin: 0 0 16px;">
            <a href="${input.recoveryUrl}" style="display: inline-block; padding: 10px 16px; border-radius: 999px; background: #f4c74e; color: #141414; text-decoration: none; font-weight: 700;">Resume checkout</a>
          </p>
          <p style="font-size: 13px; color: #5f6677; margin: 0 0 6px;">You can also come back later from ${escapeHtml(siteUrl)}.</p>
          <p style="font-size: 13px; color: #5f6677; margin: 0;">If you have any questions, reply and we can help.</p>
        </div>
      </div>
    </div>
  `;

  return { subject, text, html };
}

async function sendWithResend(input: CheckoutRecoveryAlertInput) {
  const resendApiKey = process.env.RESEND_API_KEY?.trim() || "";
  const from = getAlertFrom();
  if (!resendApiKey || !from) {
    return { delivered: false, provider: "none" as const, error: "checkout_recovery_not_configured" };
  }

  const replyTo = getAlertReplyTo();
  const copy = getCopy(input);
  const payload: {
    from: string;
    to: string[];
    subject: string;
    text: string;
    html: string;
    reply_to?: string;
  } = {
    from,
    to: [input.email],
    ...copy,
  };

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

async function sendWithSendgrid(input: CheckoutRecoveryAlertInput) {
  const sendgridApiKey = process.env.SENDGRID_API_KEY?.trim() || "";
  const from = parseEmailAddress(getAlertFrom());
  if (!sendgridApiKey || !from) {
    return { delivered: false, provider: "none" as const, error: "checkout_recovery_not_configured" };
  }

  const replyTo = parseEmailAddress(getAlertReplyTo());
  const copy = getCopy(input);
  const payload = {
    personalizations: [{ to: [{ email: input.email }] }],
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

export async function sendCheckoutRecoveryAlert(
  input: CheckoutRecoveryAlertInput,
): Promise<CheckoutRecoveryAlertResult> {
  try {
    const resendResult = await sendWithResend(input);
    if (resendResult.provider !== "none") return resendResult;

    const sendgridResult = await sendWithSendgrid(input);
    if (sendgridResult.provider !== "none") return sendgridResult;

    return { delivered: false, provider: "none", error: "checkout_recovery_not_configured" };
  } catch (error) {
    return {
      delivered: false,
      provider: "none",
      error: error instanceof Error ? error.message.slice(0, 280) : "checkout_recovery_unknown_error",
    };
  }
}
