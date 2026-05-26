/**
 * Branded HTML + plaintext shipping notification for StarMapCo customers.
 * Pure function — takes data, returns subject/html/text. No I/O.
 */

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

function inferTrackingUrl(trackingNumber: string, carrier: string | null | undefined): string {
  const num = trackingNumber.replace(/\s+/g, "");
  const lowerCarrier = (carrier ?? "").toLowerCase();

  // DHL Globalmail hands off to USPS for final mile (numbers begin with 9261/9270/9400/9205/9202)
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
  const siteUrl = (data.siteUrl?.trim() || "https://starmapco.com").replace(/\/+$/, "");
  const orderRefSuffix = data.orderReference?.trim() ? ` (${data.orderReference.trim()})` : "";

  const subject = `Your StarMapCo order is on its way — tracking inside`;

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
    `If anything looks off, just reply to this email or write to ${supportEmail}.`,
    "",
    "— The StarMapCo team",
    siteUrl,
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n");

  const trackingButton = `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0 4px;">
      <tr>
        <td style="border-radius: 999px; background:${BRAND_ACCENT};">
          <a href="${escapeHtml(trackingUrl)}"
             style="display:inline-block; padding: 14px 28px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:15px; font-weight:600; color:${BRAND_BG}; text-decoration:none; border-radius:999px;">
            Track your package
          </a>
        </td>
      </tr>
    </table>
  `;

  const trackingCard = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
           style="background:${CARD_BG}; border:1px solid ${CARD_BORDER}; border-radius:14px; margin-top:24px;">
      <tr>
        <td style="padding: 22px 24px;">
          <div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:${BRAND_MUTED};">Tracking number</div>
          <div style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size:18px; color:${BRAND_TEXT}; margin-top:6px; word-break: break-all;">${escapeHtml(data.trackingNumber)}</div>
          <div style="font-size:13px; color:${BRAND_MUTED}; margin-top:14px;">Carrier</div>
          <div style="font-size:15px; color:${BRAND_TEXT}; margin-top:2px;">${escapeHtml(carrierLabel)}</div>
          ${
            deliveryRange
              ? `<div style="font-size:13px; color:${BRAND_MUTED}; margin-top:14px;">Estimated delivery</div>
                 <div style="font-size:15px; color:${BRAND_TEXT}; margin-top:2px;">${escapeHtml(deliveryRange)}</div>`
              : ""
          }
          ${trackingButton}
        </td>
      </tr>
    </table>
  `;

  const addressCard =
    addressLines.length === 0
      ? ""
      : `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
           style="background:${CARD_BG}; border:1px solid ${CARD_BORDER}; border-radius:14px; margin-top:16px;">
      <tr>
        <td style="padding: 22px 24px;">
          <div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:${BRAND_MUTED};">Shipping to</div>
          <div style="font-size:15px; color:${BRAND_TEXT}; line-height:1.55; margin-top:8px;">
            ${addressLines.map((line) => escapeHtml(line)).join("<br/>")}
          </div>
        </td>
      </tr>
    </table>
  `;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark light" />
    <meta name="supported-color-schemes" content="dark light" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0; padding:0; background:${BRAND_BG}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:${BRAND_TEXT};">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">Tracking ${escapeHtml(data.trackingNumber)} · ${escapeHtml(carrierLabel)}${deliveryRange ? ` · arrives ${escapeHtml(deliveryRange)}` : ""}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${BRAND_BG};">
      <tr>
        <td align="center" style="padding: 28px 16px 8px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%;">
            <tr>
              <td style="padding: 8px 8px 24px;">
                <a href="${escapeHtml(siteUrl)}" style="text-decoration:none; color:${BRAND_TEXT};">
                  <span style="font-size:18px; font-weight:700; letter-spacing:0.18em; color:${BRAND_TEXT};">STARMAP<span style="color:${BRAND_ACCENT};">CO</span></span>
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 8px;">
                <h1 style="margin:0 0 8px; font-size:26px; line-height:1.2; font-weight:700; color:${BRAND_TEXT};">Your ${escapeHtml(productLabel)} is on its way</h1>
                <p style="margin:0; font-size:15px; line-height:1.6; color:${BRAND_MUTED};">
                  Hi ${escapeHtml(firstName)} — your StarMapCo order${escapeHtml(orderRefSuffix)} just shipped. The tracking link below will start updating within 48 hours.
                </p>
                ${trackingCard}
                ${addressCard}
                <p style="margin:24px 0 0; font-size:14px; line-height:1.6; color:${BRAND_MUTED};">
                  If anything looks off — wrong address, late delivery, package damaged — just reply to this email or write to <a href="mailto:${escapeHtml(supportEmail)}" style="color:${BRAND_ACCENT}; text-decoration:none;">${escapeHtml(supportEmail)}</a>. We'll make it right.
                </p>
                <p style="margin:20px 0 0; font-size:14px; line-height:1.6; color:${BRAND_TEXT};">
                  Thanks for choosing StarMapCo,<br/>
                  <span style="color:${BRAND_MUTED};">The StarMapCo team</span>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding: 36px 8px 24px;">
                <hr style="border:none; border-top:1px solid ${CARD_BORDER}; margin:0 0 16px;" />
                <p style="margin:0; font-size:12px; line-height:1.6; color:${BRAND_MUTED};">
                  You're receiving this because you placed an order at <a href="${escapeHtml(siteUrl)}" style="color:${BRAND_MUTED}; text-decoration:underline;">starmapco.com</a>. This is a transactional message about your order; you can't unsubscribe from order updates.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}
