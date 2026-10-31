/**
 * Shared layout primitives for StarMapCo customer transactional emails.
 * Table-based HTML for broad client support (Gmail, Apple Mail, Outlook).
 */

export const EMAIL = {
  bg: "#050915",
  text: "#ffffff",
  muted: "#94a3b8",
  accent: "#fbbf24",
  accentText: "#0b1433",
  cardBg: "#0f172a",
  cardBorder: "#1e293b",
  cardInner: "#131f36",
  success: "#34d399",
} as const;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function pickFirstName(fullName: string | null | undefined): string {
  if (!fullName) return "there";
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  const first = trimmed.split(/\s+/)[0];
  return first || "there";
}

export function normalizeSiteUrl(siteUrl?: string | null): string {
  return (siteUrl?.trim() || "https://starmapco.com").replace(/\/+$/, "");
}

export function renderBrandHeader(siteUrl: string): string {
  return `
    <tr>
      <td style="padding:8px 8px 28px;">
        <a href="${escapeHtml(siteUrl)}" style="text-decoration:none;">
          <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;letter-spacing:0.2em;color:${EMAIL.text};">STARMAP<span style="color:${EMAIL.accent};">CO</span></span>
        </a>
      </td>
    </tr>`;
}

export function renderStatusBadge(label: string, tone: "accent" | "success" = "accent"): string {
  const bg = tone === "success" ? EMAIL.success : EMAIL.accent;
  const color = tone === "success" ? EMAIL.accentText : EMAIL.accentText;
  return `<span style="display:inline-block;padding:6px 14px;border-radius:999px;background:${bg};color:${color};font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">${escapeHtml(label)}</span>`;
}

export function renderPrimaryButton(href: string, label: string): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 4px;">
      <tr>
        <td style="border-radius:999px;background:${EMAIL.accent};">
          <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:${EMAIL.accentText};text-decoration:none;border-radius:999px;">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>`;
}

export function renderInfoCard(title: string, bodyHtml: string, options?: { marginTop?: string }): string {
  const marginTop = options?.marginTop ?? "20px";
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${EMAIL.cardInner};border:1px solid ${EMAIL.cardBorder};border-radius:14px;margin-top:${marginTop};">
      <tr>
        <td style="padding:22px 24px;">
          <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${EMAIL.muted};font-weight:600;">${escapeHtml(title)}</div>
          ${bodyHtml}
        </td>
      </tr>
    </table>`;
}

export function renderDetailRow(label: string, value: string, options?: { last?: boolean }): string {
  const border = options?.last ? "" : `border-bottom:1px solid ${EMAIL.cardBorder};`;
  return `
    <tr>
      <td style="padding:12px 0;${border}color:${EMAIL.muted};font-size:13px;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:12px 0;${border}color:${EMAIL.text};font-size:14px;text-align:right;vertical-align:top;font-weight:500;">${escapeHtml(value)}</td>
    </tr>`;
}

export function renderTimelineSteps(steps: string[]): string {
  const rows = steps
    .map((step, index) => {
      const isLast = index === steps.length - 1;
      const stepNum = index + 1;
      return `
        <tr>
          <td width="36" valign="top" style="padding:0 0 ${isLast ? "0" : "16px"} 0;">
            <div style="width:26px;height:26px;border-radius:50%;background:${EMAIL.accent};color:${EMAIL.accentText};font-size:12px;font-weight:700;line-height:26px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${stepNum}</div>
          </td>
          <td valign="top" style="padding:2px 0 ${isLast ? "0" : "16px"} 0;font-size:14px;line-height:1.55;color:${EMAIL.muted};">${escapeHtml(step)}</td>
        </tr>`;
    })
    .join("");
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:12px;">
      ${rows}
    </table>`;
}

export function renderTransactionalFooter(siteUrl: string, supportEmail: string): string {
  return `
    <tr>
      <td style="padding:36px 8px 24px;">
        <hr style="border:none;border-top:1px solid ${EMAIL.cardBorder};margin:0 0 16px;" />
        <p style="margin:0 0 10px;font-size:12px;line-height:1.65;color:${EMAIL.muted};">
          Questions? Reply to this email or write to
          <a href="mailto:${escapeHtml(supportEmail)}" style="color:${EMAIL.accent};text-decoration:none;">${escapeHtml(supportEmail)}</a>.
        </p>
        <p style="margin:0;font-size:12px;line-height:1.65;color:${EMAIL.muted};">
          You're receiving this because you placed an order at
          <a href="${escapeHtml(siteUrl)}" style="color:${EMAIL.muted};text-decoration:underline;">starmapco.com</a>.
          This is a transactional message about your order.
        </p>
      </td>
    </tr>`;
}

/* ------------------------------------------------------------------ */
/* CASL send alignment (S93-5 Part 1)                                  */
/*                                                                     */
/* Shared List-Unsubscribe header + identification-footer builders     */
/* for the three commercial send classes (promotion transport,         */
/* review requests, checkout recovery). These helpers are pure          */
/* presentation: they FORMAT facts a caller resolved from its own       */
/* consent mechanism — they never sign tokens, choose a consent         */
/* scope, or read configuration. The mechanisms stay deliberately       */
/* separate (promotion HMAC over the email vs review HMAC over          */
/* `opt-out:${email}`, different routes and secrets); sharing a         */
/* formatter confers no permission to share consent authority.          */
/* ------------------------------------------------------------------ */

/**
 * Resolve the business mailing address for commercial email from an
 * environment record. The send-agnostic binding
 * (COMMERCIAL_EMAIL_MAILING_ADDRESS) wins; the review engine's
 * original binding (REVIEW_REQUEST_MAILING_ADDRESS) remains as a
 * deprecated fallback so already-provisioned environments keep
 * resolving during the migration. Deterministic over the supplied
 * record — this resolver never reads process.env itself; callers pass
 * the environment they already snapshot.
 */
export function resolveCommercialEmailMailingAddress(
  env: Record<string, string | undefined>,
): string | null {
  const current = env.COMMERCIAL_EMAIL_MAILING_ADDRESS?.trim();
  if (current) return current;
  const legacy = env.REVIEW_REQUEST_MAILING_ADDRESS?.trim();
  if (legacy) return legacy;
  return null;
}

function requireHeaderSafeValue(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`CASL ${field} is required and must not be blank.`);
  }
  if (/[\r\n]/.test(trimmed)) {
    throw new Error(`CASL ${field} must not contain line breaks.`);
  }
  return trimmed;
}

/**
 * Build the List-Unsubscribe message headers for a send whose
 * unsubscribe URL the CALLER already resolved from its own mechanism.
 *
 * `oneClick` asserts the destination implements an RFC 8058 one-click
 * POST that commits the opt-out without further interaction — a signed
 * clickable URL alone does NOT establish that, so callers must only
 * pass true for destinations verified to handle POST (the review
 * opt-out route does; the promotion /unsubscribe page does not — it is
 * a GET surface — so promotion and recovery sends omit the Post
 * header until that surface implements one-click).
 *
 * Output preserves the review engine's long-standing header bytes:
 * `List-Unsubscribe: <url>[, <mailto:address?subject=unsubscribe>]`
 * plus `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
 */
export function buildListUnsubscribeHeaders(input: {
  unsubscribeUrl: string;
  mailtoAddress?: string | null;
  oneClick: boolean;
}): Record<string, string> {
  const url = requireHeaderSafeValue(input.unsubscribeUrl, "unsubscribe URL");
  const parts = [`<${url}>`];
  const mailto = input.mailtoAddress?.trim();
  if (mailto) {
    parts.push(`<mailto:${requireHeaderSafeValue(mailto, "mailto address")}?subject=unsubscribe>`);
  }
  const headers: Record<string, string> = {
    "List-Unsubscribe": parts.join(", "),
  };
  if (input.oneClick) {
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  return headers;
}

/**
 * The finite set of footer presentations — one per send class, matching
 * the styles those classes already render. Never arbitrary caller HTML.
 *  - "dark": the transactional document footer tone (review requests)
 *  - "lightMuted": the recovery card's muted footer tone
 *  - "promoPlain": the promotion copy's plain sign-off footer tone
 */
export type CaslFooterPresentation = "dark" | "lightMuted" | "promoPlain";

const CASL_FOOTER_STYLES: Record<
  CaslFooterPresentation,
  { htmlOpen: string; linkStyle: string }
> = {
  dark: {
    htmlOpen: `<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;">`,
    linkStyle: "color:#94a3b8;text-decoration:underline;",
  },
  lightMuted: {
    htmlOpen: `<p style="font-size: 12px; line-height: 1.6; color: #5f6677; margin: 14px 0 0;">`,
    linkStyle: "color: #5f6677; text-decoration: underline;",
  },
  promoPlain: {
    htmlOpen: `<p style="font-size: 12px; color: #6b7280;">`,
    linkStyle: "color: #6b7280;",
  },
};

/**
 * Render the CASL identification fragment shared by every commercial
 * send: sender identity · mailing address, an optional receiving-reason
 * line, and the unsubscribe link. Generates ONLY the fragment — each
 * class keeps its own surrounding layout and wording.
 *
 * The reason is supplied separately for HTML and text so a class can
 * keep a reason in one rendering only (the review engine's reason
 * appears in HTML but not in its plain text). Blank identity/address/
 * URL facts throw: callers convert that into their existing no-send
 * outcome — a commercial send without identification or a working
 * unsubscribe mechanism does not go out. The FACTS (identity, address,
 * URL) are HTML-escaped, including the URL; the receiving reason is
 * authored class copy (a code literal, never configuration or user
 * input) and is inserted as written, preserving the classes'
 * long-standing rendered bytes.
 */
export function buildCaslIdentificationFooter(input: {
  senderIdentity: string;
  mailingAddress: string;
  unsubscribeUrl: string;
  unsubscribeLabel: string;
  receivingReasonHtmlText?: string;
  receivingReasonText?: string;
  presentation: CaslFooterPresentation;
}): { html: string; text: string } {
  const senderIdentity = input.senderIdentity.trim();
  if (!senderIdentity) {
    throw new Error("CASL sender identity is required and must not be blank.");
  }
  const mailingAddress = input.mailingAddress.trim();
  if (!mailingAddress) {
    throw new Error("A business mailing address is required for CASL.");
  }
  const unsubscribeUrl = input.unsubscribeUrl.trim();
  if (!unsubscribeUrl) {
    throw new Error("CASL unsubscribe URL is required and must not be blank.");
  }
  const unsubscribeLabel = input.unsubscribeLabel.trim();
  if (!unsubscribeLabel) {
    throw new Error("CASL unsubscribe label is required and must not be blank.");
  }

  const style = CASL_FOOTER_STYLES[input.presentation];
  const reasonHtml = input.receivingReasonHtmlText?.trim();
  const html =
    `${style.htmlOpen}${escapeHtml(senderIdentity)} · ${escapeHtml(mailingAddress)}<br/>` +
    (reasonHtml ? `${reasonHtml} ` : "") +
    `<a href="${escapeHtml(unsubscribeUrl)}" style="${style.linkStyle}">${escapeHtml(unsubscribeLabel)}</a></p>`;

  const reasonText = input.receivingReasonText?.trim();
  const text = [
    `${senderIdentity} · ${mailingAddress}`,
    ...(reasonText ? [reasonText] : []),
    `${unsubscribeLabel}: ${unsubscribeUrl}`,
  ].join("\n");

  return { html, text };
}

export type TransactionalEmailDocumentInput = {
  siteUrl: string;
  supportEmail: string;
  preheader: string;
  subject: string;
  bodyHtml: string;
};

export function renderTransactionalEmailDocument(input: TransactionalEmailDocumentInput): string {
  const siteUrl = normalizeSiteUrl(input.siteUrl);
  const supportEmail = input.supportEmail.trim() || "support@starmapco.com";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark light" />
    <meta name="supported-color-schemes" content="dark light" />
    <title>${escapeHtml(input.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:${EMAIL.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${EMAIL.text};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${EMAIL.bg};">
      <tr>
        <td align="center" style="padding:28px 16px 8px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;">
            ${renderBrandHeader(siteUrl)}
            <tr>
              <td style="padding:0 8px;">
                ${input.bodyHtml}
              </td>
            </tr>
            ${renderTransactionalFooter(siteUrl, supportEmail)}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
