/**
 * Branded HTML + plaintext print order confirmation for StarMapCo customers.
 * Pure function — no I/O.
 */

import {
  escapeHtml,
  normalizeSiteUrl,
  pickFirstName,
  renderDetailRow,
  renderInfoCard,
  renderPrimaryButton,
  renderStatusBadge,
  renderTimelineSteps,
  renderTransactionalEmailDocument,
} from "@/lib/transactionalEmailLayout";
import {
  getPrintOrderConfirmationEtaNote,
  getPrintOrderConfirmationNextSteps,
  getPrintOrderConfirmationPreheader,
} from "@/lib/commerceFacts";

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
  includesDigitalAddOn?: boolean;
};

export type RenderedPrintOrderConfirmationEmail = {
  subject: string;
  html: string;
  text: string;
};

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
  if (cityLine && country) return `${cityLine}, ${country}`;
  if (country) return country;
  if (cityLine) return cityLine;
  return null;
}

export function renderPrintOrderConfirmationEmail(data: PrintOrderConfirmationData): RenderedPrintOrderConfirmationEmail {
  const firstName = pickFirstName(data.customerName);
  const productLabel = data.productLabel.trim() || "Custom star map print";
  const supportEmail = (data.supportEmail?.trim() || "support@starmapco.com").trim();
  const siteUrl = normalizeSiteUrl(data.siteUrl);
  const orderRef = data.orderReference?.trim();
  const manualReview = data.manualReviewRequired !== false;
  const includesDigitalAddOn = data.includesDigitalAddOn === true;

  const subject = "Your StarMapCo print order is confirmed";

  const nextSteps = getPrintOrderConfirmationNextSteps({
    manualReviewRequired: manualReview,
    includesDigitalAddOn,
  });

  const preheader = getPrintOrderConfirmationPreheader(manualReview);
  const etaNote = getPrintOrderConfirmationEtaNote({ includesDigitalAddOn });

  const textLines = [
    `Hi ${firstName},`,
    "",
    "Thank you for your order. Your StarMapCo print is confirmed and in our fulfillment queue.",
    "",
    `Product: ${productLabel}`,
    ...(data.amountLabel ? [`Total paid: ${data.amountLabel}`] : []),
    ...(data.shippingSummary ? [`Ships to: ${data.shippingSummary}`] : []),
    ...(orderRef ? [`Order reference: ${orderRef}`] : []),
    "",
    "What happens next:",
    ...nextSteps.map((line, index) => `${index + 1}. ${line}`),
    "",
    "Delivery timing:",
    etaNote,
    "",
    `View your order: ${data.successUrl}`,
    "",
    `Questions? Email ${supportEmail} and include the email address you used at checkout.`,
    "",
    "— The StarMapCo team",
    siteUrl,
  ];

  const detailEntries: Array<[string, string]> = [
    ["Product", productLabel],
    ...(data.amountLabel ? ([["Total paid", data.amountLabel]] as Array<[string, string]>) : []),
    ...(data.shippingSummary ? ([["Ships to", data.shippingSummary]] as Array<[string, string]>) : []),
    ...(orderRef ? ([["Reference", orderRef]] as Array<[string, string]>) : []),
  ];
  const detailRows = detailEntries
    .map(([label, value], index) => renderDetailRow(label, value, { last: index === detailEntries.length - 1 }))
    .join("");

  const orderSummaryBody = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:14px;">
      ${detailRows || renderDetailRow("Product", productLabel, { last: true })}
    </table>`;

  const bodyHtml = `
    <div style="margin-bottom:8px;">${renderStatusBadge("Order confirmed", "success")}</div>
    <h1 style="margin:16px 0 10px;font-size:26px;line-height:1.25;font-weight:700;color:#ffffff;">Your print is on the way to production</h1>
    <p style="margin:0;font-size:15px;line-height:1.65;color:#94a3b8;">
      Hi ${escapeHtml(firstName)} — thank you for choosing StarMapCo. We've received your payment and your custom star map is queued for fulfillment.
    </p>
    ${renderInfoCard("Order summary", orderSummaryBody, { marginTop: "24px" })}
    ${renderInfoCard("What happens next", renderTimelineSteps(nextSteps), { marginTop: "16px" })}
    ${renderInfoCard("Delivery timing", `<p style="margin:0;font-size:14px;line-height:1.65;color:#cbd5e1;">${escapeHtml(etaNote)}</p>`, { marginTop: "16px" })}
    ${renderPrimaryButton(data.successUrl, "View order status")}
    <p style="margin:20px 0 0;font-size:14px;line-height:1.65;color:#ffffff;">
      Thanks for trusting us with a meaningful moment,<br />
      <span style="color:#94a3b8;">The StarMapCo team</span>
    </p>`;

  const html = renderTransactionalEmailDocument({
    siteUrl,
    supportEmail,
    preheader,
    subject,
    bodyHtml,
  });

  return { subject, html, text: textLines.join("\n") };
}
