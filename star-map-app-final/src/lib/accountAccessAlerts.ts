type AccountAccessAlertProvider = "resend" | "sendgrid" | "none";

export type AccountAccessAlertInput = {
  email: string;
  link: string;
  directDownloadLink?: string;
  /** Email template selector (e.g. "hd", "hd_archive_ready"); optional, defaults handled downstream. */
  mode?: string;
  supportEmail?: string;
};

export type AccountAccessAlertResult = {
  delivered: boolean;
  provider: AccountAccessAlertProvider;
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

function getCopy(input: { link: string; directDownloadLink?: string }) {
  const direct = input.directDownloadLink?.trim() || "";
  const hubFirst = Boolean(direct);
  const escapeHtml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const escapeHtmlAttr = (value: string) => escapeHtml(value);

  const safeLinkHref = escapeHtmlAttr(input.link);
  const safeDirectHref = direct ? escapeHtmlAttr(direct) : "";
  const subject = hubFirst
    ? "Your StarMapCo downloads are ready"
    : "Your StarMapCo download link is ready";
  const text = [
    "Hi,",
    "",
    hubFirst
      ? "Open My Downloads to see every map tied to this email:"
      : "Your secure StarMapCo download link is ready:",
    input.link,
    ...(direct
      ? [
          "",
          "Prefer a single-order download page? Use this direct link:",
          direct,
        ]
      : []),
    "",
    hubFirst ? "Check your email if you need to sign in again later." : "",
    "On iPhone, downloads are in Files app -> Browse -> Downloads (not Photos).",
    "",
    "— StarMapCo",
  ]
    .filter((line) => line !== "")
    .join("\n");

  const html = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fbf7ef; margin:0; padding:0;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="width:100%; max-width:560px; border:1px solid #e6dcc8; border-radius:16px; overflow:hidden;">
            <tr>
              <td style="padding:22px; background:linear-gradient(135deg, #07112b, #11234d); color:#f7f1e6;">
                <div style="font-size:11px; letter-spacing:0.22em; text-transform:uppercase; opacity:0.82; margin-bottom:8px;">StarMapCo</div>
                <div style="font-family: Georgia, 'Times New Roman', serif; font-size:26px; font-weight:700; line-height:1.25;">
                  ${hubFirst ? "Your downloads are ready" : "Your download link is ready"}
                </div>
                <div style="margin-top:10px; color:#d9c78d; font-size:14px; line-height:1.6;">
                  ${hubFirst ? "Open My Downloads to access every paid map tied to this email." : "Open this secure link on any device to access your HD file."}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:22px;">
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 16px 0;">
                  <tr>
                    <td align="center" bgcolor="#f4c74e" style="border-radius:999px;">
                      <a href="${safeLinkHref}" style="display:inline-block; padding:12px 18px; border-radius:999px; background:#f4c74e; color:#141414; text-decoration:none; font-weight:700; font-family:Arial, Helvetica, sans-serif;">
                        ${hubFirst ? "Open My Downloads" : "Open your download"}
                      </a>
                    </td>
                  </tr>
                </table>
                ${
                  direct
                    ? `<div style="margin:0 0 16px 0;">
                      <table role="presentation" cellspacing="0" cellpadding="0">
                        <tr>
                          <td align="center" bgcolor="#111827" style="border-radius:999px;">
                            <a href="${safeDirectHref}" style="display:inline-block; padding:12px 18px; border-radius:999px; background:#111827; color:#f9fafb; text-decoration:none; font-weight:700; font-family:Arial, Helvetica, sans-serif;">
                              Open this order&apos;s download page
                            </a>
                          </td>
                        </tr>
                      </table>
                    </div>`
                    : ""
                }
                <div style="font-size:13px; color:#5f6677; line-height:1.6; font-family:Arial, Helvetica, sans-serif;">
                  On iPhone, downloads are in <strong>Files → Browse → Downloads</strong> (not Photos).
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  return { subject, text, html };
}

async function sendWithResend(input: AccountAccessAlertInput) {
  const resendApiKey = process.env.RESEND_API_KEY?.trim() || "";
  const from = getAlertFrom();
  if (!resendApiKey || !from) {
    return { delivered: false, provider: "none" as const, error: "account_access_email_not_configured" };
  }

  const replyTo = getAlertReplyTo();
  const copy = getCopy({ link: input.link, directDownloadLink: input.directDownloadLink });
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

async function sendWithSendgrid(input: AccountAccessAlertInput) {
  const sendgridApiKey = process.env.SENDGRID_API_KEY?.trim() || "";
  const from = parseEmailAddress(getAlertFrom());
  if (!sendgridApiKey || !from) {
    return { delivered: false, provider: "none" as const, error: "account_access_email_not_configured" };
  }

  const replyTo = parseEmailAddress(getAlertReplyTo());
  const copy = getCopy({ link: input.link, directDownloadLink: input.directDownloadLink });
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

export function isAccountAccessEmailConfigured() {
  return Boolean(getAlertFrom()) && Boolean(process.env.RESEND_API_KEY?.trim() || process.env.SENDGRID_API_KEY?.trim());
}

export async function sendAccountAccessAlert(
  input: AccountAccessAlertInput,
): Promise<AccountAccessAlertResult> {
  try {
    const resendResult = await sendWithResend(input);
    if (resendResult.provider !== "none") return resendResult;

    const sendgridResult = await sendWithSendgrid(input);
    if (sendgridResult.provider !== "none") return sendgridResult;

    return { delivered: false, provider: "none", error: "account_access_email_not_configured" };
  } catch (error) {
    return {
      delivered: false,
      provider: "none",
      error: error instanceof Error ? error.message.slice(0, 280) : "account_access_email_unknown_error",
    };
  }
}
