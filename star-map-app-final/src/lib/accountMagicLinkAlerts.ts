type AccountMagicLinkAlertProvider = "resend" | "sendgrid" | "none";

export type AccountMagicLinkAlertInput = {
  email: string;
  link: string;
};

export type AccountMagicLinkAlertResult = {
  delivered: boolean;
  provider: AccountMagicLinkAlertProvider;
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

function getAlertFrom() {
  return (
    process.env.ACCOUNT_RECOVERY_EMAIL_FROM?.trim() ||
    process.env.PROMOTION_EMAIL_FROM?.trim() ||
    process.env.PRINT_ORDER_ALERT_FROM?.trim() ||
    ""
  );
}

function getAlertReplyTo() {
  return (
    process.env.ACCOUNT_RECOVERY_EMAIL_REPLY_TO?.trim() ||
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() ||
    process.env.PROMOTION_EMAIL_REPLY_TO?.trim() ||
    process.env.PRINT_ORDER_ALERT_REPLY_TO?.trim() ||
    ""
  );
}

function getCopy(link: string) {
  const subject = "Your StarMapCo sign-in link";
  const text = [
    "Hi,",
    "",
    "Use this secure link to open your My Downloads page:",
    link,
    "",
    "This link expires soon for security.",
    "",
    "On iPhone, downloaded files are in Files app -> Browse -> Downloads (not Photos).",
    "",
    "— StarMapCo",
  ].join("\n");

  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 560px; margin: 0 auto; color: #0b1324; line-height: 1.6;">
      <div style="border: 1px solid #e6dcc8; border-radius: 20px; overflow: hidden; background: #fbf7ef;">
        <div style="padding: 18px 22px; background: linear-gradient(135deg, #07112b, #11234d); color: #f7f1e6;">
          <div style="font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.82;">StarMapCo</div>
          <p style="font-size: 24px; font-weight: 700; margin: 8px 0 0;">Sign in to My Downloads</p>
          <p style="margin: 8px 0 0; color: #d9c78d;">Use this secure link to access your recent paid downloads.</p>
        </div>
        <div style="padding: 20px 22px;">
          <p style="margin: 0 0 16px;">
            <a href="${link}" style="display: inline-block; padding: 10px 16px; border-radius: 999px; background: #f4c74e; color: #141414; text-decoration: none; font-weight: 700;">Open My Downloads</a>
          </p>
          <p style="font-size: 13px; color: #5f6677; margin: 0 0 6px;">This link expires soon for security.</p>
          <p style="font-size: 13px; color: #5f6677; margin: 0;">On iPhone, downloads are in <strong>Files → Browse → Downloads</strong> (not Photos).</p>
        </div>
      </div>
    </div>
  `;

  return { subject, text, html };
}

async function sendWithResend(input: AccountMagicLinkAlertInput) {
  const resendApiKey = process.env.RESEND_API_KEY?.trim() || "";
  const from = getAlertFrom();
  if (!resendApiKey || !from) {
    return { delivered: false, provider: "none" as const, error: "account_magic_link_not_configured" };
  }

  const replyTo = getAlertReplyTo();
  const copy = getCopy(input.link);
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

async function sendWithSendgrid(input: AccountMagicLinkAlertInput) {
  const sendgridApiKey = process.env.SENDGRID_API_KEY?.trim() || "";
  const from = parseEmailAddress(getAlertFrom());
  if (!sendgridApiKey || !from) {
    return { delivered: false, provider: "none" as const, error: "account_magic_link_not_configured" };
  }

  const replyTo = parseEmailAddress(getAlertReplyTo());
  const copy = getCopy(input.link);
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

export function isAccountMagicLinkEmailConfigured() {
  return Boolean(getAlertFrom()) && Boolean(process.env.RESEND_API_KEY?.trim() || process.env.SENDGRID_API_KEY?.trim());
}

export async function sendAccountMagicLinkAlert(
  input: AccountMagicLinkAlertInput,
): Promise<AccountMagicLinkAlertResult> {
  try {
    const resendResult = await sendWithResend(input);
    if (resendResult.provider !== "none") return resendResult;

    const sendgridResult = await sendWithSendgrid(input);
    if (sendgridResult.provider !== "none") return sendgridResult;

    return { delivered: false, provider: "none", error: "account_magic_link_not_configured" };
  } catch (error) {
    return {
      delivered: false,
      provider: "none",
      error: error instanceof Error ? error.message.slice(0, 280) : "account_magic_link_unknown_error",
    };
  }
}
