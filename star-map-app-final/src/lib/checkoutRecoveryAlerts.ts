import { createHash, randomUUID } from "node:crypto";
import type { PrintVariant } from "@/lib/pricing";
import { getPrintPricingTiers } from "@/lib/pricing";

type CheckoutRecoveryAlertProvider = "resend" | "sendgrid" | "none";

export type CheckoutRecoveryRetryability = "delivered" | "retryable" | "terminal" | "not_configured";

export type CheckoutRecoveryAlertInput = {
  sessionId: string;
  email: string;
  recoveryUrl: string;
  orderType: "digital" | "print";
  plan?: string;
  printVariant?: PrintVariant;
  includesDigitalAddOn?: boolean;
  amountTotal?: number | null;
  currency?: string | null;
};

export type CheckoutRecoveryAlertResult = {
  delivered: boolean;
  provider: CheckoutRecoveryAlertProvider;
  status?: number;
  retryability: CheckoutRecoveryRetryability;
  /** Sanitized category-only code. Never a raw provider body or customer identifier. */
  errorCode?: string;
};

export type CheckoutRecoveryDeliveredMarker = {
  delivered: true;
  at: number;
};

/**
 * Sanitized per-invocation attempt diagnostic. Never includes raw provider bodies,
 * customer email, recovery URL, secrets, or message content.
 */
export type CheckoutRecoveryAttemptRecord = {
  attemptId: string;
  at: number;
  provider: CheckoutRecoveryAlertProvider;
  retryability: CheckoutRecoveryRetryability;
  delivered: boolean;
  errorCode?: string;
  /** HTTP status when available — operational category, not customer data. */
  status?: number;
  /** Stripe event id when available for operator correlation. */
  eventId?: string;
};

/**
 * Checkout recovery email is Resend-only.
 * Non-idempotent providers (e.g. SendGrid Mail Send) are intentionally not used:
 * a durable-session persist failure + lost 2xx / cross-worker Stripe retry must not
 * be able to send a second customer email without a provider Idempotency-Key.
 */
export const CHECKOUT_RECOVERY_EMAIL_PROVIDER_POLICY = "resend_only" as const;

/** Long-lived delivered marker TTL (matches prior successful-send window). */
export const CHECKOUT_RECOVERY_EMAIL_DELIVERED_TTL_SECONDS = 45 * 24 * 60 * 60;

/** Attempt diagnostic TTL — same retention window as delivered marker. */
export const CHECKOUT_RECOVERY_ATTEMPT_TTL_SECONDS = CHECKOUT_RECOVERY_EMAIL_DELIVERED_TTL_SECONDS;

/** Authoritative delivered marker — written only after confirmed provider success. */
export function checkoutRecoveryEmailDeliveredKey(sessionId: string): string {
  return `stripe:checkout_recovery:email_delivered:${sessionId}`;
}

/**
 * Unique per-invocation attempt diagnostic key.
 * One provider call → one attempt record; concurrent attempts are independently represented.
 */
export function checkoutRecoveryEmailAttemptKey(sessionId: string, attemptId: string): string {
  return `stripe:checkout_recovery:attempt:${sessionId}:${attemptId}`;
}

/**
 * Legacy pre-send counter key. Must not be used as authoritative email dedupe;
 * retaining a failed-send lock here was the #203 defect.
 */
export function checkoutRecoveryEmailLegacyPreSendKey(sessionId: string): string {
  return `stripe:checkout_recovery:email:${sessionId}`;
}

/**
 * Deterministic opaque Resend Idempotency-Key for a checkout.
 * Same session → same key; different sessions → different keys.
 * Never embeds the raw Stripe session identifier.
 */
export function buildCheckoutRecoveryResendIdempotencyKey(sessionId: string): string {
  const digest = createHash("sha256")
    .update(`starmapco:checkout-recovery-email:v1:${sessionId}`)
    .digest("hex");
  return `cre_${digest.slice(0, 48)}`;
}

/** Runtime-safe opaque attempt identifier (injectable in tests). */
export function createCheckoutRecoveryAttemptId(): string {
  return randomUUID().replace(/-/g, "");
}

export function isCheckoutRecoveryDeliveredMarker(value: unknown): value is CheckoutRecoveryDeliveredMarker {
  return Boolean(
    value && typeof value === "object" && (value as CheckoutRecoveryDeliveredMarker).delivered === true
  );
}

export function buildCheckoutRecoveryAttemptRecord(input: {
  attemptId: string;
  result: CheckoutRecoveryAlertResult;
  eventId?: string;
  now?: number;
}): CheckoutRecoveryAttemptRecord {
  const now = input.now ?? Date.now();
  const record: CheckoutRecoveryAttemptRecord = {
    attemptId: input.attemptId,
    at: now,
    provider: input.result.provider,
    retryability: input.result.retryability,
    delivered: input.result.delivered === true,
  };
  if (input.result.errorCode) record.errorCode = input.result.errorCode;
  if (typeof input.result.status === "number" && Number.isFinite(input.result.status)) {
    record.status = input.result.status;
  }
  if (input.eventId) record.eventId = input.eventId;
  return record;
}

type ParsedEmailAddress = {
  email: string;
  name?: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseEmailAddress(value?: string | null): ParsedEmailAddress | null {
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

function getAlertFrom() {
  return (
    process.env.CHECKOUT_RECOVERY_EMAIL_FROM?.trim() ||
    process.env.PROMOTION_EMAIL_FROM?.trim() ||
    process.env.PRINT_ORDER_ALERT_FROM?.trim() ||
    ""
  );
}

function getAlertReplyTo() {
  return (
    process.env.CHECKOUT_RECOVERY_EMAIL_REPLY_TO?.trim() ||
    process.env.PROMOTION_EMAIL_REPLY_TO?.trim() ||
    process.env.PRINT_ORDER_ALERT_REPLY_TO?.trim() ||
    ""
  );
}

function formatAmount(amountTotal: number | null | undefined, currency: string | null | undefined) {
  if (typeof amountTotal !== "number" || !Number.isFinite(amountTotal)) return null;
  const code = (currency || "usd").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(amountTotal / 100);
  } catch {
    return `${(amountTotal / 100).toFixed(2)} ${code}`;
  }
}

function getOfferLabel(input: CheckoutRecoveryAlertInput) {
  if (input.orderType === "print") {
    const tiers = getPrintPricingTiers();
    const printLabel = input.printVariant ? tiers[input.printVariant].label.toLowerCase() : "print";
    return input.includesDigitalAddOn ? `${printLabel} + HD download` : printLabel;
  }
  if (input.plan === "pack3") return "3 HD export credits";
  if (input.plan === "subscription") return "unlimited HD access";
  return "HD download";
}

function getSubject(input: CheckoutRecoveryAlertInput) {
  if (input.orderType === "print") {
    if (input.printVariant === "poster_framed") {
      return "Your framed star map design is saved — pick up where you left off";
    }
    if (input.printVariant === "poster_unframed") {
      return "Your star map print design is saved — pick up where you left off";
    }
    if (input.printVariant) {
      return `Your ${getPrintPricingTiers()[input.printVariant].label} design is saved — pick up where you left off`;
    }
    return "Your star map design is saved — pick up where you left off";
  }
  if (input.plan === "subscription") return "Your StarMapCo subscription is one step away";
  return "Your star map download is waiting — complete in seconds";
}

function getIncludesBullets(input: CheckoutRecoveryAlertInput): string[] {
  if (input.orderType !== "print") return [];
  const tiers = getPrintPricingTiers();
  const bullets: string[] = [];
  if (input.printVariant && tiers[input.printVariant]) {
    bullets.push(tiers[input.printVariant].label);
  } else {
    bullets.push("Printed star map");
  }
  if (input.includesDigitalAddOn) {
    bullets.push("HD digital download (unlocked instantly after payment)");
  }
  bullets.push("Your custom text, date, and location — all saved");
  return bullets;
}

function getCopy(input: CheckoutRecoveryAlertInput) {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com").replace(/\/+$/, "");
  const subject = getSubject(input);
  const offerLabel = getOfferLabel(input);
  const amount = formatAmount(input.amountTotal, input.currency);
  const includesBullets = getIncludesBullets(input);

  const text = [
    subject,
    "",
    "Your design is saved — no need to start over.",
    "",
    ...(includesBullets.length > 0
      ? ["What's included:", ...includesBullets.map((b) => `  • ${b}`), ""]
      : []),
    amount ? `Order total: ${amount}` : null,
    `Resume checkout: ${input.recoveryUrl}`,
    "",
    "This link returns you directly to your saved checkout. Reply here with any questions and we will help.",
    "",
    "— StarMapCo",
    siteUrl,
  ]
    .filter(Boolean)
    .join("\n");

  const includesBulletsHtml =
    includesBullets.length > 0
      ? `<div style="margin: 0 0 18px;">
          <p style="font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #8c7a4a; margin: 0 0 8px;">What's included</p>
          <ul style="margin: 0; padding: 0 0 0 18px; font-size: 14px; color: #2a3246;">
            ${includesBullets.map((b) => `<li style="margin-bottom: 4px;">${escapeHtml(b)}</li>`).join("")}
          </ul>
        </div>`
      : "";

  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 560px; margin: 0 auto; color: #0b1324; line-height: 1.6;">
      <div style="border: 1px solid #e6dcc8; border-radius: 20px; overflow: hidden; background: #fbf7ef;">
        <div style="padding: 18px 22px; background: linear-gradient(135deg, #07112b, #11234d); color: #f7f1e6;">
          <div style="font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.82;">StarMapCo</div>
          <p style="font-size: 22px; font-weight: 700; margin: 8px 0 0; line-height: 1.3;">${escapeHtml(subject)}</p>
          <p style="margin: 8px 0 0; color: #d9c78d; font-size: 14px;">Your ${escapeHtml(offerLabel)} is still saved and ready.</p>
        </div>
        <div style="padding: 20px 22px;">
          <p style="margin: 0 0 16px; font-size: 15px;">Your design is saved — no need to start over. Just pick up where you left off.</p>
          ${includesBulletsHtml}
          ${
            amount
              ? `<p style="font-size: 26px; font-weight: 700; margin: 0 0 18px; color: #0b1324;">${escapeHtml(amount)}</p>`
              : ""
          }
          <p style="margin: 0 0 14px;">
            <a href="${input.recoveryUrl}" style="display: inline-block; padding: 12px 22px; border-radius: 999px; background: #f4c74e; color: #141414; text-decoration: none; font-weight: 700; font-size: 15px;">Resume checkout →</a>
          </p>
          <p style="font-size: 12px; color: #8c7a4a; margin: 0 0 14px;">This link returns you directly to your saved checkout.</p>
          <hr style="border: none; border-top: 1px solid #e6dcc8; margin: 0 0 14px;" />
          <p style="font-size: 13px; color: #5f6677; margin: 0;">Questions? Reply to this email and we will help.</p>
        </div>
      </div>
    </div>
  `;

  return { subject, text, html };
}

function notConfiguredResult(): CheckoutRecoveryAlertResult {
  return {
    delivered: false,
    provider: "none",
    retryability: "not_configured",
    errorCode: "checkout_recovery_not_configured",
  };
}

/**
 * Safely extract Resend's machine-readable error `name` from a JSON body snippet.
 * Never returns or persists the raw body.
 */
export function extractResendErrorName(bodySnippet?: string): string | null {
  if (typeof bodySnippet !== "string" || !bodySnippet.trim()) return null;
  try {
    const parsed = JSON.parse(bodySnippet) as unknown;
    if (parsed && typeof parsed === "object" && typeof (parsed as { name?: unknown }).name === "string") {
      const name = (parsed as { name: string }).name.trim();
      return name || null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Classify an HTTP provider response into a bounded delivery result.
 * May inspect a body snippet for exact Resend 409 name extraction only;
 * never returns or persists the raw body.
 *
 * Resend 409 taxonomy (official Idempotency Keys docs):
 * - concurrent_idempotent_requests → retryable
 * - invalid_idempotent_request → terminal (retrying unchanged is useless)
 * - unknown/malformed 409 → terminal provider_conflict
 */
export function classifyCheckoutRecoveryHttpResult(
  provider: "resend" | "sendgrid",
  status: number,
  bodySnippet?: string
): CheckoutRecoveryAlertResult {
  if (status >= 200 && status < 300) {
    return { delivered: true, provider, status, retryability: "delivered" };
  }

  if (provider === "resend" && status === 409) {
    const errorName = extractResendErrorName(bodySnippet);
    if (errorName === "concurrent_idempotent_requests") {
      return {
        delivered: false,
        provider,
        status,
        retryability: "retryable",
        errorCode: "concurrent_idempotent_requests",
      };
    }
    if (errorName === "invalid_idempotent_request") {
      return {
        delivered: false,
        provider,
        status,
        retryability: "terminal",
        errorCode: "invalid_idempotent_request",
      };
    }
    return {
      delivered: false,
      provider,
      status,
      retryability: "terminal",
      errorCode: "provider_conflict",
    };
  }

  if (status === 429) {
    return {
      delivered: false,
      provider,
      status,
      retryability: "retryable",
      errorCode: "provider_rate_limited",
    };
  }

  if (status >= 500) {
    return {
      delivered: false,
      provider,
      status,
      retryability: "retryable",
      errorCode: "provider_server_error",
    };
  }

  let errorCode = "provider_client_error";
  if (status === 401 || status === 403) errorCode = "provider_auth_error";
  else if (status === 422) errorCode = "provider_validation_error";

  return {
    delivered: false,
    provider,
    status,
    retryability: "terminal",
    errorCode,
  };
}

export function classifyCheckoutRecoveryNetworkFailure(
  provider: CheckoutRecoveryAlertProvider = "none"
): CheckoutRecoveryAlertResult {
  return {
    delivered: false,
    provider,
    retryability: "retryable",
    errorCode: "provider_network_error",
  };
}

/** Whether Stripe should redeliver a checkout.session.expired event after this outcome. */
export function isCheckoutRecoveryWebhookRetryable(
  retryability: CheckoutRecoveryRetryability | "skipped" | "already_delivered"
): boolean {
  return retryability === "retryable";
}

export type CheckoutRecoverySessionEmailFields = {
  recoveryEmailSentAt?: number;
  recoveryEmailProvider?: string;
  /** @deprecated Historical failure field — new failures write separate attempt records. */
  recoveryEmailError?: string;
  /** @deprecated Historical failure field — new failures write separate attempt records. */
  recoveryEmailErrorCode?: string;
  /** @deprecated Historical aggregate — new attempts use unique attempt records. */
  recoveryEmailRetryability?: CheckoutRecoveryRetryability;
  /** @deprecated Historical aggregate — new attempts use unique attempt records. */
  recoveryEmailLastAttemptAt?: number;
  /** @deprecated Historical aggregate — new attempts use unique attempt records. */
  recoveryEmailAttemptCount?: number;
};

/**
 * Success-only session fields. Non-delivered results must not use this path —
 * they persist via {@link buildCheckoutRecoveryAttemptRecord} instead.
 */
export function applyCheckoutRecoveryDeliveredSessionFields(
  result: CheckoutRecoveryAlertResult,
  now = Date.now()
): Pick<
  CheckoutRecoverySessionEmailFields,
  | "recoveryEmailSentAt"
  | "recoveryEmailProvider"
  | "recoveryEmailError"
  | "recoveryEmailErrorCode"
  | "recoveryEmailRetryability"
> {
  return {
    recoveryEmailSentAt: now,
    recoveryEmailProvider: result.provider,
    recoveryEmailError: undefined,
    recoveryEmailErrorCode: undefined,
    recoveryEmailRetryability: "delivered",
  };
}

/**
 * @deprecated Prefer {@link applyCheckoutRecoveryDeliveredSessionFields} for success and
 * separate attempt records for failures. Retained for harness negative controls.
 */
export function applyCheckoutRecoveryAlertToSessionFields(
  previous: Pick<CheckoutRecoverySessionEmailFields, "recoveryEmailAttemptCount" | "recoveryEmailSentAt">,
  result: CheckoutRecoveryAlertResult,
  now = Date.now()
): CheckoutRecoverySessionEmailFields {
  const attemptCount = (previous.recoveryEmailAttemptCount ?? 0) + 1;
  if (result.delivered) {
    return {
      ...applyCheckoutRecoveryDeliveredSessionFields(result, now),
      recoveryEmailLastAttemptAt: now,
      recoveryEmailAttemptCount: attemptCount,
    };
  }
  return {
    recoveryEmailSentAt: previous.recoveryEmailSentAt,
    recoveryEmailProvider: result.provider,
    recoveryEmailError: result.errorCode,
    recoveryEmailErrorCode: result.errorCode,
    recoveryEmailRetryability: result.retryability,
    recoveryEmailLastAttemptAt: now,
    recoveryEmailAttemptCount: attemptCount,
  };
}

async function sendWithResend(input: CheckoutRecoveryAlertInput) {
  const resendApiKey = process.env.RESEND_API_KEY?.trim() || "";
  const from = getAlertFrom();
  if (!resendApiKey || !from) {
    return notConfiguredResult();
  }

  const replyTo = getAlertReplyTo();
  const copy = getCopy(input);
  const payload: {
    from: string;
    to: string[];
    subject: string;
    text: string;
    html: string;
    reply_to?: string;
  } = {
    from,
    to: [input.email],
    ...copy,
  };

  if (replyTo) {
    const parsed = parseEmailAddress(replyTo);
    payload.reply_to = parsed?.email || replyTo;
  }

  const idempotencyKey = buildCheckoutRecoveryResendIdempotencyKey(input.sessionId);

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return classifyCheckoutRecoveryNetworkFailure("resend");
  }

  const body = response.ok ? "" : await response.text().catch(() => "");
  return classifyCheckoutRecoveryHttpResult("resend", response.status, body);
}

/**
 * Checkout recovery delivery is Resend-only ({@link CHECKOUT_RECOVERY_EMAIL_PROVIDER_POLICY}).
 * When Resend is not configured, returns truthful `not_configured` — never falls back to
 * a non-idempotent provider.
 */
export async function sendCheckoutRecoveryAlert(
  input: CheckoutRecoveryAlertInput
): Promise<CheckoutRecoveryAlertResult> {
  try {
    const resendResult = await sendWithResend(input);
    if (resendResult.provider !== "none") return resendResult;
    return notConfiguredResult();
  } catch {
    return {
      delivered: false,
      provider: "none",
      retryability: "retryable",
      errorCode: "checkout_recovery_unknown_error",
    };
  }
}
