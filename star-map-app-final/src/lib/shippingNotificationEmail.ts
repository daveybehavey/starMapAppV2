/**
 * Branded HTML + plaintext shipping notification for StarMapCo customers.
 * Pure function — takes data, returns subject/html/text. No I/O.
 */

import {
  escapeHtml,
  normalizeSiteUrl,
  pickFirstName,
  renderInfoCard,
  renderPrimaryButton,
  renderStatusBadge,
  renderTransactionalEmailDocument,
} from "@/lib/transactionalEmailLayout";

export type ShippingNotificationData = {
  customerName?: string | null;
  trackingNumber: string;
  carrier?: string | null;
  trackingUrl?: string | null;
  estimatedDelivery?: { from?: string | null; to?: string | null } | null;
  productLabel?: string | null;
  shippingAddress?: {
    name?: string | null;
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    country?: string | null;
  } | null;
  orderReference?: string | null;
  supportEmail?: string | null;
  siteUrl?: string | null;
};

export type RenderedShippingEmail = {
  subject: string;
  html: string;
  text: string;
};

function inferTrackingUrl(trackingNumber: string, carrier: string | null | undefined): string {
  const num = trackingNumber.replace(/\s+/g, "");
  const lowerCarrier = (carrier ?? "").toLowerCase();

  if (/^(9261|9270|9400|9205|9202|9216)/.test(num) || lowerCarrier.includes("globalmail")) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(num)}`;
  }
  if (lowerCarrier.includes("usps")) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(num)}`;
  }
  if (lowerCarrier.includes("dhl")) {
    return `https://www.dhl.com/global-en/home/tracking.html?tracking-id=${encodeURIComponent(num)}`;
  }
  if (lowerCarrier.includes("ups")) {
    return `https://www.ups.com/track?tracknum=${encodeURIComponent(num)}`;
  }
  if (lowerCarrier.includes("fedex")) {
    return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(num)}`;
  }
  if (lowerCarrier.includes("canada post")) {
    return `https://www.canadapost-postescanada.ca/track-reperage/en#/details/${encodeURIComponent(num)}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(`${carrier ?? ""} tracking ${num}`.trim())}`;
}

function formatDeliveryRange(range: ShippingNotificationData["estimatedDelivery"]): string | null {
  if (!range) return null;
  const from = range.from?.trim();
  const to = range.to?.trim();
  if (from && to) return `${from} – ${to}`;
  if (from) return from;
  if (to) return to;
  return null;
}

function formatAddressLines(addr: ShippingNotificationData["shippingAddress"]): string[] {
  if (!addr) return [];
  const lines: string[] = [];
  if (addr.name?.trim()) lines.push(addr.name.trim());
  if (addr.address1?.trim()) lines.push(addr.address1.trim());
  if (addr.address2?.trim()) lines.push(addr.address2.trim());
  const cityLine = [addr.city, addr.state, addr.zip].map((p) => p?.trim()).filter(Boolean).join(", ");
  if (cityLine) lines.push(cityLine);
  if (addr.country?.trim()) lines.push(addr.country.trim());
  return lines;
}

export function renderShippingNotificationEmail(data: ShippingNotificationData): RenderedShippingEmail {
  const firstName = pickFirstName(data.customerName);
  const trackingUrl =
    data.trackingUrl?.trim() || inferTrackingUrl(data.trackingNumber, data.carrier ?? null);
  const deliveryRange = formatDeliveryRange(data.estimatedDelivery);
  const addressLines = formatAddressLines(data.shippingAddress);
  const productLabel = data.productLabel?.trim() || "Custom star map";
  const carrierLabel = data.carrier?.trim() || "Carrier";
  const supportEmail = (data.supportEmail?.trim() || "support@starmapco.com").trim();
  const siteUrl = normalizeSiteUrl(data.siteUrl);
  const orderRefSuffix = data.orderReference?.trim() ? ` (${data.orderReference.trim()})` : "";

  const subject = `Your StarMapCo order is on its way — tracking inside`;
  const preheader = `Tracking ${data.trackingNumber} · ${carrierLabel}${deliveryRange ? ` · est. ${deliveryRange}` : ""}`;

  const text = [
    `Hi ${firstName},`,
    "",
    `Good news — your ${productLabel} just shipped${orderRefSuffix}.`,
    "",
    `Tracking number: ${data.trackingNumber}`,
    `Carrier: ${carrierLabel}`,
    `Track package: ${trackingUrl}`,
    deliveryRange ? `Estimated delivery: ${deliveryRange}` : "",
    "",
    addressLines.length ? "Shipping to:" : "",
    ...addressLines.map((line) => `  ${line}`),
    "",
    "Tracking can take up to 48 hours to start updating after a label is created — that's normal.",
    "",
    `If anything looks off, reply to this email or write to ${supportEmail}.`,
    "",
    "— The StarMapCo team",
    siteUrl,
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n");

  const trackingCardBody = `
    <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:18px;color:#ffffff;margin-top:8px;word-break:break-all;letter-spacing:0.02em;">${escapeHtml(data.trackingNumber)}</div>
    <div style="font-size:13px;color:#94a3b8;margin-top:16px;">Carrier</div>
    <div style="font-size:15px;color:#ffffff;margin-top:4px;font-weight:500;">${escapeHtml(carrierLabel)}</div>
    ${
      deliveryRange
        ? `<div style="font-size:13px;color:#94a3b8;margin-top:16px;">Estimated delivery</div>
           <div style="font-size:15px;color:#ffffff;margin-top:4px;font-weight:500;">${escapeHtml(deliveryRange)}</div>`
        : ""
    }
    ${renderPrimaryButton(trackingUrl, "Track your package")}`;

  const addressCard =
    addressLines.length === 0
      ? ""
      : renderInfoCard(
          "Shipping to",
          `<div style="font-size:15px;color:#ffffff;line-height:1.6;margin-top:10px;font-weight:500;">${addressLines.map((line) => escapeHtml(line)).join("<br/>")}</div>`,
          { marginTop: "16px" },
        );

  const bodyHtml = `
    <div style="margin-bottom:8px;">${renderStatusBadge("Shipped")}</div>
    <h1 style="margin:16px 0 10px;font-size:26px;line-height:1.25;font-weight:700;color:#ffffff;">Your ${escapeHtml(productLabel)} is on its way</h1>
    <p style="margin:0;font-size:15px;line-height:1.65;color:#94a3b8;">
      Hi ${escapeHtml(firstName)} — your StarMapCo order${escapeHtml(orderRefSuffix)} has shipped. Tracking may take up to 48 hours to start updating; that's normal.
    </p>
    ${renderInfoCard("Tracking details", trackingCardBody, { marginTop: "24px" })}
    ${addressCard}
    <p style="margin:24px 0 0;font-size:14px;line-height:1.65;color:#ffffff;">
      Thanks for choosing StarMapCo,<br />
      <span style="color:#94a3b8;">The StarMapCo team</span>
    </p>`;

  const html = renderTransactionalEmailDocument({
    siteUrl,
    supportEmail,
    preheader,
    subject,
    bodyHtml,
  });

  return { subject, html, text };
}
