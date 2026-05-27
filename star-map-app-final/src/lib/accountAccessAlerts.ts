type AccountAccessAlertProvider = "resend" | "sendgrid" | "none";

export type AccountAccessEmailMode = "hub" | "hd" | "hd_archive_ready";

export type AccountAccessAlertInput = {
  email: string;
  link: string;
  directDownloadLink?: string;
  mode?: AccountAccessEmailMode;
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

function getSupportFooter(supportEmail: string) {
  return [
    "",
    `Questions? Contact ${supportEmail} — we respond to transactional messages about your order.`,
    "",
    "— StarMapCo",
  ].join("\n");
}

function getCopy(input: {
  link: string;
  directDownloadLink?: string;
  mode?: AccountAccessEmailMode;
  supportEmail?: string;
}) {
  const direct = input.directDownloadLink?.trim() || "";
  const supportEmail = input.supportEmail?.trim() || "support@starmapco.com";
  const mode = input.mode ?? "hub";
  const hubFirst = mode === "hub" && Boolean(direct);
  const hdMode = mode === "hd" || mode === "hd_archive_ready";
  const archiveReady = mode === "hd_archive_ready";

  const subject = archiveReady
    ? "Your StarMapCo HD file is ready"
    : hdMode
      ? "Your StarMapCo HD download"
      : hubFirst
        ? "Your StarMapCo downloads are ready"
        : "Your StarMapCo download link is ready";

  const headline = archiveReady
    ? "Your HD file is ready"
    : hdMode
      ? "Your HD download is ready"
      : hubFirst
        ? "Your downloads are ready"
        : "Your download link is ready";

  const intro = archiveReady
    ? "Your saved HD star map PNG is ready to download:"
    : hdMode
      ? "Use this secure link to download your HD star map:"
      : hubFirst
        ? "Open My Downloads to see every map tied to this email:"
        : "Your secure StarMapCo download link is ready:";

  const primaryCta = archiveReady
    ? "Download your HD file"
    : hdMode
      ? "Download your HD file"
      : hubFirst
        ? "Open My Downloads"
        : "Open your download";

  const secondaryCta = hdMode ? "Open download page" : "Open this order's download page";

  const text = [
    "Hi,",
    "",
    intro,
    input.link,
    ...(direct
      ? [
          "",
          hdMode
            ? "Need the full download page (preview, print add-ons, or another device)?"
            : "Prefer a single-order download page? Use this link:",
          direct,
        ]
      : []),
    "",
    "On iPhone, downloads are in Files app -> Browse -> Downloads (not Photos).",
    getSupportFooter(supportEmail),
  ]
    .filter((line) => line !== "")
    .join("\n");

  const subhead = archiveReady
    ? "Your archived PNG is attached to this order — use the button below on any device."
    : hdMode
      ? "This link opens your paid HD export. Keep it private."
      : hubFirst
        ? "Open My Downloads to access every paid map on this email."
        : "Open this secure link on any device to access your HD file.";

  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 560px; margin: 0 auto; color: #0b1324; line-height: 1.6;">
      <div style="border: 1px solid #e6dcc8; border-radius: 20px; overflow: hidden; background: #fbf7ef;">
        <div style="padding: 18px 22px; background: linear-gradient(135deg, #07112b, #11234d); color: #f7f1e6;">
          <div style="font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.82;">StarMapCo</div>
          <p style="font-size: 24px; font-weight: 700; margin: 8px 0 0;">${headline}</p>
          <p style="margin: 8px 0 0; color: #d9c78d;">${subhead}</p>
        </div>
        <div style="padding: 20px 22px;">
          <p style="margin: 0 0 16px;">
            <a href="${input.link}" style="display: inline-block; padding: 10px 16px; border-radius: 999px; background: #f4c74e; color: #141414; text-decoration: none; font-weight: 700;">${primaryCta}</a>
          </p>
          ${
            direct
              ? `<p style="margin: 0 0 16px;">
            <a href="${direct}" style="display: inline-block; padding: 10px 16px; border-radius: 999px; background: #111827; color: #f9fafb; text-decoration: none; font-weight: 700;">${secondaryCta}</a>
          </p>`
              : ""
          }
          <p style="font-size: 13px; color: #5f6677; margin: 0 0 12px;">On iPhone, downloads are in <strong>Files → Browse → Downloads</strong> (not Photos).</p>
          <p style="font-size: 12px; color: #5f6677; margin: 0;">Questions? <a href="mailto:${supportEmail}" style="color: #11234d;">${supportEmail}</a></p>
        </div>
      </div>
    </div>
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
  const copy = getCopy({
    link: input.link,
    directDownloadLink: input.directDownloadLink,
    mode: input.mode,
    supportEmail: input.supportEmail,
  });
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
  const copy = getCopy({
    link: input.link,
    directDownloadLink: input.directDownloadLink,
    mode: input.mode,
    supportEmail: input.supportEmail,
  });
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
