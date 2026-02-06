type PromotionAutomationProvider = "resend" | "sendgrid" | "webhook" | "none";

export const PROMOTION_COUPON_CODE = process.env.PROMOTION_COUPON_CODE ?? "20OFF";

type PromotionAutomationResult = {
  delivered: boolean;
  provider: PromotionAutomationProvider;
  error?: string;
};

const promotionSubject = process.env.PROMOTION_EMAIL_SUBJECT ?? "Your 20% off StarMapCo code";
const promotionFromEmail = process.env.PROMOTION_EMAIL_FROM;
const promotionReplyTo = process.env.PROMOTION_EMAIL_REPLY_TO;

type ParsedEmailAddress = {
  email: string;
  name?: string;
};

function parseEmailAddress(value?: string): ParsedEmailAddress | null {
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

function getPromotionCopy(couponCode: string) {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com").replace(/\/+$/, "");
  const checkoutUrl = `${siteUrl}/`;
  const subject = promotionSubject;
  const text = [
    "Thanks for joining the StarMapCo insider list.",
    "",
    `Here is your 20% off code: ${couponCode}`,
    "",
    `Use it at checkout here: ${checkoutUrl}`,
    "",
    "This is a one-time offer reserved for subscribers.",
    "",
    "Need help? Reply to this email and we can help.",
    "",
    "— StarMapCo",
  ].join("\n");

  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 560px; margin: 0 auto; color: #0b1324; line-height: 1.6;">
      <p>Thanks for joining the StarMapCo insider list.</p>
      <p style="font-size: 18px; font-weight: 700; margin: 20px 0 8px;">Your 20% off code</p>
      <p style="font-size: 28px; font-weight: 700; margin: 0 0 18px; letter-spacing: 1px; color: #b07d1b;">${couponCode}</p>
      <p>Use it at checkout:</p>
      <p><a href="${checkoutUrl}" style="display: inline-block; padding: 10px 16px; border-radius: 999px; background: #f4c74e; color: #141414; text-decoration: none; font-weight: 700;">Create your star map</a></p>
      <p style="font-size: 13px; color: #3f485b;">This is a one-time offer reserved for subscribers.</p>
      <p style="font-size: 13px; color: #3f485b;">Need help? Reply and we can help.</p>
      <p style="margin-top: 18px;">— StarMapCo</p>
    </div>
  `;

  return { subject, text, html };
}

async function deliverWithResend(email: string, couponCode: string): Promise<PromotionAutomationResult> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey || !promotionFromEmail) {
    return { delivered: false, provider: "none" };
  }

  const copy = getPromotionCopy(couponCode);
  const payload: {
    from: string;
    to: string[];
    subject: string;
    text: string;
    html: string;
    reply_to?: string;
  } = {
    from: promotionFromEmail,
    to: [email],
    subject: copy.subject,
    text: copy.text,
    html: copy.html,
  };

  if (promotionReplyTo) {
    payload.reply_to = promotionReplyTo;
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
    const body = await response.text();
    return { delivered: false, provider: "resend", error: body.slice(0, 280) };
  }

  return { delivered: true, provider: "resend" };
}

async function deliverWithSendgrid(email: string, couponCode: string): Promise<PromotionAutomationResult> {
  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  const fromAddress = parseEmailAddress(promotionFromEmail);
  if (!sendgridApiKey || !fromAddress) {
    return { delivered: false, provider: "none" };
  }

  const copy = getPromotionCopy(couponCode);
  const replyToAddress = parseEmailAddress(promotionReplyTo);
  const payload: {
    personalizations: Array<{ to: Array<{ email: string }> }>;
    from: { email: string; name?: string };
    subject: string;
    content: Array<{ type: "text/plain" | "text/html"; value: string }>;
    reply_to?: { email: string; name?: string };
  } = {
    personalizations: [{ to: [{ email }] }],
    from: fromAddress,
    subject: copy.subject,
    content: [
      { type: "text/plain", value: copy.text },
      { type: "text/html", value: copy.html },
    ],
  };

  if (replyToAddress) {
    payload.reply_to = replyToAddress;
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sendgridApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    return { delivered: false, provider: "sendgrid", error: body.slice(0, 280) };
  }

  return { delivered: true, provider: "sendgrid" };
}

async function notifyPromotionWebhook(email: string, couponCode: string): Promise<PromotionAutomationResult> {
  const webhookUrl = process.env.PROMOTION_AUTOMATION_WEBHOOK_URL;
  if (!webhookUrl) {
    return { delivered: false, provider: "none" };
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      couponCode,
      list: "20_percent_waitlist",
      source: "promotion_signup",
      timestamp: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return { delivered: false, provider: "webhook", error: body.slice(0, 280) };
  }

  return { delivered: true, provider: "webhook" };
}

export async function runPromotionAutomation(
  email: string,
  couponCode: string,
): Promise<PromotionAutomationResult> {
  try {
    const resendResult = await deliverWithResend(email, couponCode);
    if (resendResult.provider !== "none") return resendResult;

    const sendgridResult = await deliverWithSendgrid(email, couponCode);
    if (sendgridResult.provider !== "none") return sendgridResult;

    const webhookResult = await notifyPromotionWebhook(email, couponCode);
    if (webhookResult.provider !== "none") return webhookResult;

    return { delivered: false, provider: "none", error: "No automation provider configured." };
  } catch (error) {
    console.error("promotion automation failed", error);
    return { delivered: false, provider: "none", error: "automation_failed" };
  }
}
