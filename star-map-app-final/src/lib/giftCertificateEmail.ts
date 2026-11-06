/**
 * Branded HTML + plaintext gift-certificate delivery email for
 * StarMapCo. Pure function — no I/O. The redeem code appears in
 * plaintext here (and in the buyer's printable certificate view) by
 * design: those are the certificate's two delivery channels. At rest
 * the code exists only as a keyed hash (see giftCertificates.ts).
 */

import {
  escapeHtml,
  normalizeSiteUrl,
  pickFirstName,
  renderDetailRow,
  renderInfoCard,
  renderPrimaryButton,
  renderStatusBadge,
  renderTransactionalEmailDocument,
} from "@/lib/transactionalEmailLayout";
import { formatPrice } from "@/lib/pricing";
import {
  formatGiftCertificateCode,
  normalizeGiftCertificateCode,
  type GiftCertificateTier,
} from "@/lib/giftCertificates";

export type GiftCertificateEmailData = {
  buyerName?: string | null;
  tier: GiftCertificateTier;
  /** Amount actually charged, in `currency` (session facts). */
  amountCents: number;
  currency: string;
  /** The plaintext redeem code (delivery-time only; never stored). */
  code: string;
  /** Code redemption deadline (ms epoch). */
  expiresAt: number;
  siteUrl?: string | null;
  supportEmail?: string | null;
};

export type RenderedGiftCertificateEmail = {
  subject: string;
  html: string;
  text: string;
};

function formatExpiryDate(expiresAt: number): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(expiresAt));
}

export function renderGiftCertificateEmail(
  data: GiftCertificateEmailData,
): RenderedGiftCertificateEmail {
  const firstName = pickFirstName(data.buyerName);
  const supportEmail = (data.supportEmail?.trim() || "support@starmapco.com").trim();
  const siteUrl = normalizeSiteUrl(data.siteUrl);
  const normalized = normalizeGiftCertificateCode(data.code) ?? data.code;
  const code = formatGiftCertificateCode(normalized);
  const amountLabel = formatPrice(data.amountCents, data.currency);
  const expiryLabel = formatExpiryDate(data.expiresAt);
  const redeemUrl = `${siteUrl}/redeem`;
  const certificateUrl = `${siteUrl}/gift-card`;

  const subject = "Your StarMapCo gift certificate is ready to give";

  const textLines = [
    `Hi ${firstName},`,
    "",
    "Thank you — your StarMapCo gift certificate is ready to give.",
    "",
    `Certificate: ${data.tier.label} gift certificate`,
    `Total paid: ${amountLabel}`,
    `Redeem code: ${code}`,
    `Redeem at: ${redeemUrl}`,
    `Please redeem by: ${expiryLabel}`,
    "",
    "How it works:",
    "1. Give the recipient this email (or print the certificate from your purchase confirmation page).",
    "2. They enter the code at the redeem link above — no account needed.",
    "3. The code adds the download to their access right away, and they create their own star map with it.",
    "",
    "Good to know: the code can be redeemed once, any time within 12 months of purchase.",
    "Once it is redeemed, the download itself follows our usual terms — paid downloads do not expire.",
    "",
    `Questions? Email ${supportEmail}.`,
    "",
    "— The StarMapCo team",
    siteUrl,
  ];

  const detailEntries: Array<[string, string]> = [
    ["Certificate", `${data.tier.label} gift certificate`],
    ["Total paid", amountLabel],
    ["Redeem code", code],
    ["Redeem by", expiryLabel],
  ];
  const detailRows = detailEntries
    .map(([label, value], index) =>
      renderDetailRow(label, value, { last: index === detailEntries.length - 1 }),
    )
    .join("");
  const summaryBody = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:14px;">
      ${detailRows}
    </table>`;

  const steps = [
    "Give the recipient this email, or print the certificate from your purchase confirmation page.",
    "They enter the code at the redeem page — no account needed.",
    "The code adds the download to their access right away, and they create their own star map with it.",
  ];

  const bodyHtml = `
    <div style="margin-bottom:8px;">${renderStatusBadge("Gift certificate", "success")}</div>
    <h1 style="margin:16px 0 10px;font-size:26px;line-height:1.25;font-weight:700;color:#ffffff;">Your gift certificate is ready to give</h1>
    <p style="margin:0;font-size:15px;line-height:1.65;color:#94a3b8;">
      Hi ${escapeHtml(firstName)} — thank you for choosing StarMapCo. Your gift certificate is below:
      pass it to your recipient as-is, or print the certificate from your confirmation page.
    </p>
    ${renderInfoCard("Gift certificate", summaryBody, { marginTop: "24px" })}
    ${renderInfoCard(
      "How the recipient uses it",
      `<ol style="margin:0;padding-left:18px;font-size:14px;line-height:1.65;color:#cbd5e1;">${steps
        .map((step) => `<li>${escapeHtml(step)}</li>`)
        .join("")}</ol>`,
      { marginTop: "16px" },
    )}
    ${renderInfoCard(
      "Good to know",
      `<p style="margin:0;font-size:14px;line-height:1.65;color:#cbd5e1;">The code can be redeemed once, any time within 12 months of purchase (by ${escapeHtml(expiryLabel)}). Once it is redeemed, the download itself follows our usual terms — paid downloads do not expire.</p>`,
      { marginTop: "16px" },
    )}
    ${renderPrimaryButton(redeemUrl, "Open the redeem page")}
    <p style="margin:20px 0 0;font-size:14px;line-height:1.65;color:#ffffff;">
      Thanks for trusting us with a meaningful moment,<br />
      <span style="color:#94a3b8;">The StarMapCo team</span>
    </p>
    <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#94a3b8;">
      Bought this by mistake, or want the paper version? Your confirmation page is at
      <a href="${escapeHtml(certificateUrl)}" style="color:#fbbf24;">${escapeHtml(certificateUrl)}</a>.
    </p>`;

  const html = renderTransactionalEmailDocument({
    siteUrl,
    supportEmail,
    preheader: `Your ${data.tier.label} gift certificate and redeem code are inside.`,
    subject,
    bodyHtml,
  });

  return { subject, html, text: textLines.join("\n") };
}
