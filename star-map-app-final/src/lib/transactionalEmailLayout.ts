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
