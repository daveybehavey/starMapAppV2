/**
 * Minimal Resend client backed by fetch (no SDK dependency so it works on
 * Cloudflare Workers / OpenNext as well as plain Node).
 *
 * Configuration (all optional unless you actually want to send mail):
 *   RESEND_API_KEY       Resend API key (required to send)
 *   RESEND_FROM_EMAIL    Default From address (e.g. orders@starmapco.com)
 *   RESEND_FROM_NAME     Optional friendly name (e.g. "StarMapCo")
 *   RESEND_REPLY_TO      Optional Reply-To (e.g. support@starmapco.com)
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type ResendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  tags?: Record<string, string>;
};

export type ResendSendResult =
  | { ok: true; provider: "resend"; id: string }
  | { ok: false; provider: "resend"; error: string };

export function isResendConfigured(): boolean {
  return Boolean(getResendApiKey()) && Boolean(getDefaultFromAddress());
}

export function getResendApiKey(): string {
  return process.env.RESEND_API_KEY?.trim() || "";
}

export function getDefaultFromAddress(): string {
  const email = process.env.RESEND_FROM_EMAIL?.trim();
  if (!email) return "";
  const name = process.env.RESEND_FROM_NAME?.trim();
  return name ? `${name} <${email}>` : email;
}

export function getDefaultReplyTo(): string | undefined {
  return process.env.RESEND_REPLY_TO?.trim() || undefined;
}

function toRecipientList(value: string | string[]): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => v.trim()).filter(Boolean);
  }
  return [value.trim()].filter(Boolean);
}

export async function sendResendEmail(input: ResendEmailInput): Promise<ResendSendResult> {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    return { ok: false, provider: "resend", error: "resend_not_configured" };
  }

  const from = (input.from?.trim() || getDefaultFromAddress()).trim();
  if (!from) {
    return { ok: false, provider: "resend", error: "resend_from_missing" };
  }

  const toList = toRecipientList(input.to);
  if (toList.length === 0) {
    return { ok: false, provider: "resend", error: "resend_recipient_missing" };
  }

  const body: Record<string, unknown> = {
    from,
    to: toList,
    subject: input.subject,
    html: input.html,
  };
  if (input.text) body.text = input.text;
  const replyTo = input.replyTo?.trim() || getDefaultReplyTo();
  if (replyTo) body.reply_to = replyTo;
  if (input.tags) {
    body.tags = Object.entries(input.tags).map(([name, value]) => ({ name, value }));
  }

  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return {
      ok: false,
      provider: "resend",
      error: error instanceof Error ? `resend_fetch_failed:${error.message.slice(0, 200)}` : "resend_fetch_failed",
    };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      ok: false,
      provider: "resend",
      error: `resend_http_${response.status}:${text.slice(0, 280)}`,
    };
  }

  let parsed: { id?: unknown } | null = null;
  try {
    parsed = (await response.json()) as { id?: unknown };
  } catch {
    parsed = null;
  }
  const id = typeof parsed?.id === "string" && parsed.id.trim() ? parsed.id.trim() : "";
  return { ok: true, provider: "resend", id };
}
