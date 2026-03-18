import { getPromotionUnsubscribeUrl } from "@/lib/promotionSubscriptions";
import { getPromotionOfferName, getPromotionTargetLabel } from "@/lib/promotionOffer";

type PromotionAutomationProvider = "resend" | "sendgrid" | "webhook" | "none";

export const PROMOTION_COUPON_CODE = process.env.PROMOTION_COUPON_CODE ?? "FIRST50";

const rawPromotionPercent = Number.parseFloat(process.env.PROMOTION_COUPON_PERCENT ?? "50");
const promotionPercent = Number.isFinite(rawPromotionPercent)
  ? Math.min(100, Math.max(1, Math.round(rawPromotionPercent)))
  : 50;
const promotionPercentLabel = `${promotionPercent}%`;
const promotionOfferName = getPromotionOfferName();
const promotionTargetLabel = getPromotionTargetLabel();

type PromotionAutomationResult = {
  delivered: boolean;
  provider: PromotionAutomationProvider;
  error?: string;
};

const promotionSubject =
  process.env.PROMOTION_EMAIL_SUBJECT ?? `Your ${promotionPercentLabel} off ${promotionOfferName} from StarMapCo`;
const promotionFollowupSubject =
  process.env.PROMOTION_FOLLOWUP_SUBJECT ??
  `Print tips for your star map (and your ${promotionPercentLabel} off ${promotionOfferName})`;
const promotionFollowupDelayHours = Number.parseInt(
  process.env.PROMOTION_FOLLOWUP_DELAY_HOURS ?? "24",
  10,
);
const promotionFollowupDelaySeconds =
  Number.isFinite(promotionFollowupDelayHours) && promotionFollowupDelayHours > 0
    ? promotionFollowupDelayHours * 3600
    : 24 * 3600;
const promotionFromEmail = process.env.PROMOTION_EMAIL_FROM;
const promotionReplyTo = process.env.PROMOTION_EMAIL_REPLY_TO;

type ParsedEmailAddress = {
  email: string;
  name?: string;
};

type EmailCopy = {
  subject: string;
  text: string;
  html: string;
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

function getPromotionCopy(email: string, couponCode: string): EmailCopy {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com").replace(/\/+$/, "");
  const checkoutUrl = `${siteUrl}/`;
  const subject = promotionSubject;
  const unsubscribeUrl = getPromotionUnsubscribeUrl(email) ?? null;
  const text = [
    "Thanks for joining the StarMapCo insider list.",
    "",
    `Here is your ${promotionPercentLabel} off code for ${promotionTargetLabel}: ${couponCode}`,
    "",
    `Use it at checkout here: ${checkoutUrl}`,
    "",
    `This one-time offer applies to ${promotionTargetLabel}.`,
    "Framed and unframed prints remain available separately after preview.",
    "",
    "Need help? Reply to this email and we can help.",
    unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : undefined,
    "",
    "— StarMapCo",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 560px; margin: 0 auto; color: #0b1324; line-height: 1.6;">
      <p>Thanks for joining the StarMapCo insider list.</p>
      <p style="font-size: 18px; font-weight: 700; margin: 20px 0 8px;">Your ${promotionPercentLabel} off ${promotionOfferName}</p>
      <p style="font-size: 28px; font-weight: 700; margin: 0 0 18px; letter-spacing: 1px; color: #b07d1b;">${couponCode}</p>
      <p>Use it at checkout:</p>
      <p><a href="${checkoutUrl}" style="display: inline-block; padding: 10px 16px; border-radius: 999px; background: #f4c74e; color: #141414; text-decoration: none; font-weight: 700;">Create your star map</a></p>
      <p style="font-size: 13px; color: #3f485b;">This one-time offer applies to ${promotionTargetLabel}.</p>
      <p style="font-size: 13px; color: #3f485b;">Framed and unframed print routes still stay available after preview.</p>
      <p style="font-size: 13px; color: #3f485b;">Need help? Reply and we can help.</p>
      ${unsubscribeUrl ? `<p style="font-size: 12px; color: #6b7280;">No longer want updates? <a href="${unsubscribeUrl}" style="color: #6b7280;">Unsubscribe</a>.</p>` : ""}
      <p style="margin-top: 18px;">— StarMapCo</p>
    </div>
  `;

  return { subject, text, html };
}

function getPromotionFollowupCopy(email: string, couponCode: string): EmailCopy {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com").replace(/\/+$/, "");
  const checkoutUrl = `${siteUrl}/`;
  const printGuideUrl = `${siteUrl}/how-to-print-star-map`;
  const galleryUrl = `${siteUrl}/star-map-gallery`;
  const subject = promotionFollowupSubject;
  const unsubscribeUrl = getPromotionUnsubscribeUrl(email) ?? null;
  const text = [
    "Quick print tips for your star map:",
    "",
    "1) Matte or fine‑art paper keeps the stars crisp.",
    "2) Popular sizes: 11x14, 16x20, and 24x36.",
    "3) A simple black or wood frame keeps it timeless.",
    "",
    `Full guide: ${printGuideUrl}`,
    "",
    `Your ${promotionPercentLabel} off code for ${promotionTargetLabel} still works: ${couponCode}`,
    `Start or finish your map here: ${checkoutUrl}`,
    "",
    "Need help? Reply to this email and we can help.",
    unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : undefined,
    "",
    "— StarMapCo",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 560px; margin: 0 auto; color: #0b1324; line-height: 1.6;">
      <p style="font-size: 18px; font-weight: 700; margin: 0 0 10px;">Quick print tips for your star map</p>
      <ol style="padding-left: 18px; margin: 0 0 16px;">
        <li>Matte or fine‑art paper keeps the stars crisp.</li>
        <li>Popular sizes: 11x14, 16x20, and 24x36.</li>
        <li>A simple black or wood frame keeps it timeless.</li>
      </ol>
      <p><a href="${printGuideUrl}" style="color: #b07d1b; font-weight: 700; text-decoration: none;">Read the full print guide</a></p>
      <p style="margin-top: 18px;">Your ${promotionPercentLabel} off ${promotionOfferName} still works:</p>
      <p style="font-size: 24px; font-weight: 700; margin: 0 0 14px; letter-spacing: 1px; color: #b07d1b;">${couponCode}</p>
      <p><a href="${checkoutUrl}" style="display: inline-block; padding: 10px 16px; border-radius: 999px; background: #f4c74e; color: #141414; text-decoration: none; font-weight: 700;">Continue your map</a></p>
      <p style="font-size: 13px; color: #3f485b; margin-top: 14px;">
        Need inspiration? Browse the <a href="${galleryUrl}" style="color: #b07d1b; text-decoration: none;">star map gallery</a>.
      </p>
      <p style="font-size: 13px; color: #3f485b;">Need help? Reply and we can help.</p>
      ${unsubscribeUrl ? `<p style="font-size: 12px; color: #6b7280;">No longer want updates? <a href="${unsubscribeUrl}" style="color: #6b7280;">Unsubscribe</a>.</p>` : ""}
      <p style="margin-top: 18px;">— StarMapCo</p>
    </div>
  `;

  return { subject, text, html };
}

async function sendWithResend(email: string, copy: EmailCopy): Promise<PromotionAutomationResult> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey || !promotionFromEmail) {
    return { delivered: false, provider: "none" };
  }

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

async function sendWithSendgrid(
  email: string,
  copy: EmailCopy,
  sendAt?: number,
): Promise<PromotionAutomationResult> {
  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  const fromAddress = parseEmailAddress(promotionFromEmail);
  if (!sendgridApiKey || !fromAddress) {
    return { delivered: false, provider: "none" };
  }

  const replyToAddress = parseEmailAddress(promotionReplyTo);
  const payload: {
    personalizations: Array<{ to: Array<{ email: string }> }>;
    from: { email: string; name?: string };
    subject: string;
    content: Array<{ type: "text/plain" | "text/html"; value: string }>;
    reply_to?: { email: string; name?: string };
    send_at?: number;
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

  if (sendAt) {
    payload.send_at = sendAt;
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

async function notifyPromotionWebhook(
  email: string,
  couponCode: string,
  sequence: "welcome" | "print_tips",
): Promise<PromotionAutomationResult> {
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
      list: "first_digital_offer",
      source: "promotion_signup",
      sequence,
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
    const copy = getPromotionCopy(email, couponCode);
    const resendResult = await sendWithResend(email, copy);
    if (resendResult.provider !== "none") return resendResult;

    const sendgridResult = await sendWithSendgrid(email, copy);
    if (sendgridResult.provider !== "none") return sendgridResult;

    const webhookResult = await notifyPromotionWebhook(email, couponCode, "welcome");
    if (webhookResult.provider !== "none") return webhookResult;

    return { delivered: false, provider: "none", error: "No automation provider configured." };
  } catch (error) {
    console.error("promotion automation failed", error);
    return { delivered: false, provider: "none", error: "automation_failed" };
  }
}

export async function runPromotionFollowup(
  email: string,
  couponCode: string,
): Promise<PromotionAutomationResult> {
  try {
    const copy = getPromotionFollowupCopy(email, couponCode);
    const sendAt = Math.floor(Date.now() / 1000) + promotionFollowupDelaySeconds;

    const resendResult = await sendWithResend(email, copy);
    if (resendResult.provider !== "none") return resendResult;

    const sendgridResult = await sendWithSendgrid(email, copy, sendAt);
    if (sendgridResult.provider !== "none") return sendgridResult;

    const webhookResult = await notifyPromotionWebhook(email, couponCode, "print_tips");
    if (webhookResult.provider !== "none") return webhookResult;

    return { delivered: false, provider: "none", error: "No automation provider configured." };
  } catch (error) {
    console.error("promotion followup failed", error);
    return { delivered: false, provider: "none", error: "automation_failed" };
  }
}
