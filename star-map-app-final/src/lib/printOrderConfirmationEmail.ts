/**
 * Branded HTML + plaintext print order confirmation for StarMapCo customers.
 * Pure function — no I/O.
 */

export type PrintOrderConfirmationData = {
  customerName?: string | null;
  productLabel: string;
  amountLabel?: string | null;
  shippingSummary?: string | null;
  orderReference?: string | null;
  successUrl: string;
  supportEmail?: string | null;
  siteUrl?: string | null;
  manualReviewRequired?: boolean;
};

export type RenderedPrintOrderConfirmationEmail = {
  subject: string;
  html: string;
  text: string;
};

const BRAND_BG = "#050915";
const BRAND_TEXT = "#ffffff";
const BRAND_MUTED = "#94a3b8";
const BRAND_ACCENT = "#fbbf24";
const CARD_BG = "#0f172a";
const CARD_BORDER = "#1e293b";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pickFirstName(fullName: string | null | undefined): string {
  if (!fullName) return "there";
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  const first = trimmed.split(/\s+/)[0];
  return first || "there";
}

export function getPrintProductLabel(variant: string | null | undefined): string {
  switch (variant) {
    case "poster_framed":
      return "Framed star map poster";
    case "poster_unframed":
      return "Star map poster (unframed)";
    case "canvas_wrap":
      return "Star map canvas";
    case "mug_11oz":
      return "Star map mug";
    case "card_4x6":
      return "Star map greeting card";
    default:
      return "Custom star map print";
  }
}

export function formatPrintOrderAmount(amountTotal: number | null | undefined, currency: string | null | undefined): string | null {
  if (typeof amountTotal !== "number" || !Number.isFinite(amountTotal)) return null;
  const code = (currency || "usd").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(amountTotal / 100);
  } catch {
    return `${(amountTotal / 100).toFixed(2)} ${code}`;
  }
}

export function formatPrintShippingSummary(
  shippingDetails?: {
    address?: { city?: string | null; state?: string | null; country?: string | null } | null;
  } | null,
): string | null {
  const address = shippingDetails?.address;
  if (!address) return null;
  const city = address.city?.trim();
  const state = address.state?.trim();
  const country = address.country?.trim();
  const cityLine = [city, state].filter(Boolean).join(", ");
  if (cityLine && country) return `Ships to ${cityLine}, ${country}`;
  if (country) return `Ships to ${country}`;
  if (cityLine) return `Ships to ${cityLine}`;
  return null;
}

export function renderPrintOrderConfirmationEmail(data: PrintOrderConfirmationData): RenderedPrintOrderConfirmationEmail {
  const firstName = pickFirstName(data.customerName);
  const productLabel = data.productLabel.trim() || "Custom star map print";
  const supportEmail = (data.supportEmail?.trim() || "support@starmapco.com").trim();
  const siteUrl = (data.siteUrl?.trim() || "https://starmapco.com").replace(/\/+$/, "");
  const orderRef = data.orderReference?.trim();
  const manualReview = data.manualReviewRequired !== false;

  const subject = "Your StarMapCo print order is confirmed";

  const nextSteps = manualReview
    ? [
        "We submit your print to our production partner.",
        "Our team reviews the order for quality before production begins.",
        "After approval, your print is produced and shipped.",
        "You will receive a separate email with tracking when your package ships.",
      ]
    : [
        "Your print is submitted to our production partner.",
        "After production, your order ships with tracking sent by email.",
      ];

  const textLines = [
    `Hi ${firstName},`,
    "",
    "Thank you — we received your payment and your print order is confirmed.",
    "",
    `Product: ${productLabel}`,
    ...(data.amountLabel ? [`Total paid: ${data.amountLabel}`] : []),
    ...(data.shippingSummary ? [`Shipping: ${data.shippingSummary}`] : []),
    ...(orderRef ? [`Order reference: ${orderRef}`] : []),
    "",
    "What happens next:",
    ...nextSteps.map((line, index) => `${index + 1}. ${line}`),
    "",
    `View your order confirmation: ${data.successUrl}`,
    "",
    `Questions? Email ${supportEmail} and include the email address you used at checkout.`,
    "",
    siteUrl,
  ];

  const detailRows = [
    `<tr><td style="padding:8px 0;color:${BRAND_MUTED};font-size:13px;">Product</td><td style="padding:8px 0;color:${BRAND_TEXT};font-size:13px;text-align:right;">${escapeHtml(productLabel)}</td></tr>`,
    ...(data.amountLabel
      ? [`<tr><td style="padding:8px 0;color:${BRAND_MUTED};font-size:13px;">Total paid</td><td style="padding:8px 0;color:${BRAND_TEXT};font-size:13px;text-align:right;">${escapeHtml(data.amountLabel)}</td></tr>`]
      : []),
    ...(data.shippingSummary
      ? [`<tr><td style="padding:8px 0;color:${BRAND_MUTED};font-size:13px;">Shipping</td><td style="padding:8px 0;color:${BRAND_TEXT};font-size:13px;text-align:right;">${escapeHtml(data.shippingSummary)}</td></tr>`]
      : []),
    ...(orderRef
      ? [`<tr><td style="padding:8px 0;color:${BRAND_MUTED};font-size:13px;">Reference</td><td style="padding:8px 0;color:${BRAND_TEXT};font-size:13px;text-align:right;">${escapeHtml(orderRef)}</td></tr>`]
      : []),
  ].join("");

  const stepsHtml = nextSteps
    .map(
      (line) =>
        `<li style="margin:0 0 8px;color:${BRAND_MUTED};font-size:14px;line-height:1.5;">${escapeHtml(line)}</li>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND_BG};font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND_BG};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 28px 8px;">
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND_ACCENT};">StarMapCo</p>
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:${BRAND_TEXT};">Print order confirmed</h1>
          <p style="margin:0;font-size:15px;line-height:1.6;color:${BRAND_MUTED};">Hi ${escapeHtml(firstName)}, we received your payment. Your custom star map print is in our queue.</p>
        </td></tr>
        <tr><td style="padding:8px 28px 20px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${detailRows}</table>
        </td></tr>
        <tr><td style="padding:0 28px 20px;">
          <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:${BRAND_TEXT};">What happens next</p>
          <ol style="margin:0;padding-left:20px;">${stepsHtml}</ol>
        </td></tr>
        <tr><td style="padding:0 28px 24px;" align="center">
          <a href="${escapeHtml(data.successUrl)}" style="display:inline-block;background:${BRAND_ACCENT};color:#0b1433;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:999px;">View order confirmation</a>
        </td></tr>
        <tr><td style="padding:0 28px 28px;border-top:1px solid ${CARD_BORDER};">
          <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:${BRAND_MUTED};">Questions? Email <a href="mailto:${escapeHtml(supportEmail)}" style="color:${BRAND_ACCENT};">${escapeHtml(supportEmail)}</a> and include the email you used at checkout.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html, text: textLines.join("\n") };
}
