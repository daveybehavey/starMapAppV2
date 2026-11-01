import { getPromotionUnsubscribeUrl } from "@/lib/promotionSubscriptions";
import { getPromotionOfferName, getPromotionTargetLabel } from "@/lib/promotionOffer";
import {
  checkPromotionDispatchPermission,
  type PromotionDispatchPermissionChecker,
  type PromotionDispatchRefusalReason,
} from "@/lib/promotionDispatchGuard";
import {
  buildCaslIdentificationFooter,
  buildListUnsubscribeHeaders,
  resolveCommercialEmailMailingAddress,
} from "@/lib/transactionalEmailLayout";

/**
 * Frozen-payload compliance contract (CASL send alignment, S93-5
 * Part 1). Version 1 payloads render the shared CASL identification
 * footer (sender identity + mailing address + the signed unsubscribe
 * URL) into the copy AND carry the shared List-Unsubscribe message
 * headers, both frozen at job creation so a retry submits
 * byte-identical content under its idempotency key. Payloads frozen
 * before this contract existed carry no version: deliverPromotionSend
 * refuses them (`unconfigured`) rather than dispatch content that
 * cannot be shown compliant — their cancellation/recreation is a
 * separately reviewed migration, never an at-dispatch re-render.
 */
export const PROMOTION_COMPLIANCE_FORMAT_VERSION = 1;

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

/**
 * The compliance facts a compliant promotion payload is frozen with:
 * the recipient's signed unsubscribe URL and the business mailing
 * address, plus the List-Unsubscribe headers built from the URL.
 * Resolved ONCE, at payload preparation (job creation); a null here
 * means the deployment cannot currently produce a compliant send, and
 * preparation records that on the payload instead of rendering a
 * silently non-compliant email (see preparePromotionCouponPayload).
 */
type PromotionComplianceFacts = {
  unsubscribeUrl: string;
  mailingAddress: string;
  headers: Record<string, string>;
};

function resolvePromotionComplianceFacts(email: string): PromotionComplianceFacts | null {
  const unsubscribeUrl = getPromotionUnsubscribeUrl(email);
  const mailingAddress = resolveCommercialEmailMailingAddress(process.env);
  if (!unsubscribeUrl || !mailingAddress) return null;
  return {
    unsubscribeUrl,
    mailingAddress,
    headers: buildListUnsubscribeHeaders({
      unsubscribeUrl,
      // No one-click Post header: the /unsubscribe surface is a GET
      // page and does not implement an RFC 8058 one-click POST
      // (verified against src/app/unsubscribe — page only, no POST
      // route handler). The header builder's contract requires the
      // caller to assert one-click support; here it cannot.
      oneClick: false,
    }),
  };
}

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

function editorPromoUrl(source: string) {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com").replace(/\/+$/, "");
  return `${siteUrl}/editor?mode=quick&source=${encodeURIComponent(source)}`;
}

function weddingPromoUrl(source: string) {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com").replace(/\/+$/, "");
  return `${siteUrl}/wedding?source=${encodeURIComponent(source)}`;
}

function getPromotionCopy(
  email: string,
  couponCode: string,
  facts: PromotionComplianceFacts | null,
): EmailCopy {
  const checkoutUrl = editorPromoUrl("promo-welcome");
  const weddingUrl = weddingPromoUrl("promo-welcome");
  const subject = promotionSubject;
  // The mandatory CASL identification block (S93-5 Part 1) replaces
  // the old optional unsubscribe fragment: sender identity, mailing
  // address, and the same signed URL the headers carry — in both
  // renderings. Null facts render no block; such a payload is marked
  // unconfigured at preparation and never dispatches.
  const footer = facts
    ? buildCaslIdentificationFooter({
        senderIdentity: "StarMapCo",
        mailingAddress: facts.mailingAddress,
        unsubscribeUrl: facts.unsubscribeUrl,
        unsubscribeLabel: "Unsubscribe",
        presentation: "promoPlain",
      })
    : null;
  const text = [
    "Thanks for joining the StarMapCo insider list.",
    "",
    `Here is your ${promotionPercentLabel} off code for ${promotionTargetLabel}: ${couponCode}`,
    "",
    `Start your free preview: ${checkoutUrl}`,
    `Wedding gift path: ${weddingUrl}`,
    "",
    `This one-time offer applies to ${promotionTargetLabel}.`,
    "Framed and unframed prints remain available separately after preview.",
    "",
    "Need help? Reply to this email and we can help.",
    "",
    "— StarMapCo",
    footer ? "" : undefined,
    footer?.text,
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
      <p style="font-size: 13px; color: #3f485b; margin-top: 10px;">Shopping for a wedding gift? <a href="${weddingUrl}" style="color: #b07d1b; font-weight: 600;">Preview the wedding sky</a>.</p>
      <p style="font-size: 13px; color: #3f485b;">This one-time offer applies to ${promotionTargetLabel}.</p>
      <p style="font-size: 13px; color: #3f485b;">Framed and unframed print routes still stay available after preview.</p>
      <p style="font-size: 13px; color: #3f485b;">Need help? Reply and we can help.</p>
      <p style="margin-top: 18px;">— StarMapCo</p>
      ${footer ? footer.html : ""}
    </div>
  `;

  return { subject, text, html };
}

function getPromotionFollowupCopy(
  email: string,
  couponCode: string,
  facts: PromotionComplianceFacts | null,
): EmailCopy {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com").replace(/\/+$/, "");
  const checkoutUrl = editorPromoUrl("promo-followup");
  const weddingUrl = weddingPromoUrl("promo-followup");
  const printGuideUrl = `${siteUrl}/how-to-print-star-map`;
  const galleryUrl = `${siteUrl}/star-map-gallery`;
  const subject = promotionFollowupSubject;
  // Mandatory CASL identification block — see getPromotionCopy.
  const footer = facts
    ? buildCaslIdentificationFooter({
        senderIdentity: "StarMapCo",
        mailingAddress: facts.mailingAddress,
        unsubscribeUrl: facts.unsubscribeUrl,
        unsubscribeLabel: "Unsubscribe",
        presentation: "promoPlain",
      })
    : null;
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
    "",
    "— StarMapCo",
    footer ? "" : undefined,
    footer?.text,
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
      <p>
        <a href="${checkoutUrl}" style="display: inline-block; padding: 10px 16px; border-radius: 999px; background: #f4c74e; color: #141414; text-decoration: none; font-weight: 700;">Continue your map</a>
        <a href="${weddingUrl}" style="display: inline-block; margin-left: 8px; padding: 10px 16px; border-radius: 999px; border: 1px solid #d4d4d8; color: #141414; text-decoration: none; font-weight: 700;">Wedding gift path</a>
      </p>
      <p style="font-size: 13px; color: #3f485b; margin-top: 14px;">
        Need inspiration? Browse the <a href="${galleryUrl}" style="color: #b07d1b; text-decoration: none;">star map gallery</a>.
      </p>
      <p style="font-size: 13px; color: #3f485b;">Need help? Reply and we can help.</p>
      <p style="margin-top: 18px;">— StarMapCo</p>
      ${footer ? footer.html : ""}
    </div>
  `;

  return { subject, text, html };
}


/* ------------------------------------------------------------------ */
/* Durable delivery (T-SM-KVRACE, A2-3)                                */
/*                                                                     */
/* The coordinator's delivery jobs carry a FROZEN payload (rendered    */
/* copy + schedule, captured at job creation) and a stable provider    */
/* idempotency key. deliverPromotionSend submits exactly that payload  */
/* and classifies the outcome so the job state machine can decide:     */
/*   accepted            provider confirmed the send                   */
/*   definitive_failure  provider answered with a rejection that an    */
/*                       identical retry cannot fix                    */
/*   ambiguous           the provider may or may not have accepted     */
/*                       (timeout, 429, 5xx) — safe to retry ONLY      */
/*                       with the same key + payload, and only when    */
/*                       the provider guarantees idempotency (Resend   */
/*                       keeps keys 24h; SendGrid/webhook have no      */
/*                       equivalent guarantee)                         */
/*   unconfigured        no provider is configured at all              */
/* The provider chain is Resend, then SendGrid; the first CONFIGURED   */
/* provider's outcome ends the chain, exactly as the legacy wrappers   */
/* behaved. The automation webhook is no longer a delivery leg: it     */
/* cannot carry the frozen compliant content (S93-5 Part 1).           */
/* ------------------------------------------------------------------ */

export type PromotionJobKind = "coupon" | "followup";

export type PromotionSendPayload = {
  email: string;
  couponCode: string;
  kind: PromotionJobKind;
  subject: string;
  text: string;
  html: string;
  /** List-Unsubscribe message headers, frozen at job creation from
   *  the same signed URL the rendered footer carries (S93-5 Part 1).
   *  Absent on payloads frozen before the compliance contract
   *  existed — those never dispatch (see deliverPromotionSend). */
  headers?: Record<string, string>;
  /** Compliance contract version this payload was frozen under
   *  (PROMOTION_COMPLIANCE_FORMAT_VERSION). Absent = legacy payload. */
  complianceFormatVersion?: number;
  /** Followup only: the provider-scheduled send instant, frozen at job
   *  creation so a retry submits the identical request. */
  scheduledAtIso?: string;
};

export type PromotionDeliveryOutcome =
  | { outcome: "accepted"; provider: PromotionAutomationProvider; providerMessageId?: string | null }
  | { outcome: "definitive_failure"; provider: PromotionAutomationProvider; error?: string }
  | { outcome: "ambiguous"; provider: PromotionAutomationProvider; error?: string; idempotencyGuaranteed: boolean }
  | { outcome: "unconfigured"; provider: "none"; error?: string }
  | { outcome: "refused"; provider: "none"; reason: PromotionDispatchRefusalReason };

type LegResult =
  | { configured: false }
  | { configured: true; outcome: "accepted"; providerMessageId?: string | null }
  | { configured: true; outcome: "definitive_failure" | "ambiguous"; error: string };

export function getPromotionFollowupDelaySeconds(): number {
  return promotionFollowupDelaySeconds;
}

export function preparePromotionCouponPayload(
  email: string,
  couponCode: string,
): PromotionSendPayload {
  const facts = resolvePromotionComplianceFacts(email);
  const copy = getPromotionCopy(email, couponCode, facts);
  if (!facts) {
    // Compliance facts unavailable (no signing secret for the
    // unsubscribe URL, or no mailing address configured): freeze the
    // payload WITHOUT the compliance contract. deliverPromotionSend
    // refuses such payloads as `unconfigured` — the job stays
    // undelivered rather than sending a non-compliant email, and a
    // later recreation under a fixed configuration freezes a
    // compliant payload instead.
    return { email, couponCode, kind: "coupon", subject: copy.subject, text: copy.text, html: copy.html };
  }
  return {
    email,
    couponCode,
    kind: "coupon",
    subject: copy.subject,
    text: copy.text,
    html: copy.html,
    headers: facts.headers,
    complianceFormatVersion: PROMOTION_COMPLIANCE_FORMAT_VERSION,
  };
}

export function preparePromotionFollowupPayload(
  email: string,
  couponCode: string,
  scheduledAtIso: string,
): PromotionSendPayload {
  const facts = resolvePromotionComplianceFacts(email);
  const copy = getPromotionFollowupCopy(email, couponCode, facts);
  if (!facts) {
    return {
      email,
      couponCode,
      kind: "followup",
      subject: copy.subject,
      text: copy.text,
      html: copy.html,
      scheduledAtIso,
    };
  }
  return {
    email,
    couponCode,
    kind: "followup",
    subject: copy.subject,
    text: copy.text,
    html: copy.html,
    headers: facts.headers,
    complianceFormatVersion: PROMOTION_COMPLIANCE_FORMAT_VERSION,
    scheduledAtIso,
  };
}

function isAmbiguousHttpStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function sendLegResend(
  payload: PromotionSendPayload,
  idempotencyKey?: string,
): Promise<LegResult> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey || !promotionFromEmail) {
    return { configured: false };
  }

  const body: {
    from: string;
    to: string[];
    subject: string;
    text: string;
    html: string;
    headers?: Record<string, string>;
    reply_to?: string;
    scheduled_at?: string;
  } = {
    from: promotionFromEmail,
    to: [payload.email],
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  };
  if (payload.headers && Object.keys(payload.headers).length > 0) {
    // Frozen List-Unsubscribe MESSAGE headers (S93-5 Part 1) — kept
    // distinct from the HTTP headers below (Authorization /
    // Idempotency-Key), which are transport, not message, headers.
    body.headers = payload.headers;
  }
  if (payload.scheduledAtIso) {
    body.scheduled_at = payload.scheduledAtIso;
  }
  if (promotionReplyTo) {
    body.reply_to = promotionReplyTo;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${resendApiKey}`,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) {
    // Resend dedupes the same key + identical payload for 24h and
    // returns the original response instead of sending again.
    headers["Idempotency-Key"] = idempotencyKey;
  }

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (error) {
    return {
      configured: true,
      outcome: "ambiguous",
      error: error instanceof Error ? error.message.slice(0, 280) : "resend_fetch_failed",
    };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      configured: true,
      outcome: isAmbiguousHttpStatus(response.status) ? "ambiguous" : "definitive_failure",
      error: `resend_http_${response.status}:${text.slice(0, 280)}`,
    };
  }

  const parsed = (await response.json().catch(() => null)) as { id?: unknown } | null;
  return {
    configured: true,
    outcome: "accepted",
    providerMessageId: typeof parsed?.id === "string" ? parsed.id : null,
  };
}

async function sendLegSendgrid(payload: PromotionSendPayload): Promise<LegResult> {
  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  const fromAddress = parseEmailAddress(promotionFromEmail);
  if (!sendgridApiKey || !fromAddress) {
    return { configured: false };
  }

  const replyToAddress = parseEmailAddress(promotionReplyTo);
  const body: {
    personalizations: Array<{ to: Array<{ email: string }> }>;
    from: { email: string; name?: string };
    subject: string;
    content: Array<{ type: "text/plain" | "text/html"; value: string }>;
    headers?: Record<string, string>;
    reply_to?: { email: string; name?: string };
    send_at?: number;
  } = {
    personalizations: [{ to: [{ email: payload.email }] }],
    from: fromAddress,
    subject: payload.subject,
    content: [
      { type: "text/plain", value: payload.text },
      { type: "text/html", value: payload.html },
    ],
  };
  if (payload.headers && Object.keys(payload.headers).length > 0) {
    // Frozen List-Unsubscribe message headers (S93-5 Part 1), carried
    // in SendGrid's top-level `headers` field.
    body.headers = payload.headers;
  }
  if (replyToAddress) {
    body.reply_to = replyToAddress;
  }
  if (payload.scheduledAtIso) {
    const sendAt = Math.floor(Date.parse(payload.scheduledAtIso) / 1000);
    if (Number.isFinite(sendAt)) {
      body.send_at = sendAt;
    }
  }

  let response: Response;
  try {
    response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sendgridApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return {
      configured: true,
      outcome: "ambiguous",
      error: error instanceof Error ? error.message.slice(0, 280) : "sendgrid_fetch_failed",
    };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      configured: true,
      outcome: isAmbiguousHttpStatus(response.status) ? "ambiguous" : "definitive_failure",
      error: `sendgrid_http_${response.status}:${text.slice(0, 280)}`,
    };
  }

  return {
    configured: true,
    outcome: "accepted",
    providerMessageId: response.headers.get("x-message-id"),
  };
}

/**
 * The automation-webhook leg is REMOVED from compliant delivery
 * (S93-5 Part 1): its contract posts campaign metadata (email, coupon
 * code, sequence) — not the frozen rendered copy — so it cannot
 * establish delivery of the CASL identification footer or the
 * List-Unsubscribe headers, and claiming otherwise would misstate the
 * send's compliance. A deployment whose only configured provider is
 * the webhook now resolves as `unconfigured` (no compliant provider),
 * and selectPromotionProvider never selects it for a claim stamp.
 * Re-enabling it requires an explicit downstream contract that
 * carries the frozen content + headers, with acceptance evidence.
 */

/**
 * The provider the delivery chain will use for the next send — the
 * first configured COMPLIANT leg, in chain order — and whether that
 * provider guarantees idempotency for the attempt. The coordinator
 * stamps this selection on the job at claim time, BEFORE the provider
 * call, so a driver that dies mid-attempt leaves behind proof of
 * which guarantee covered the attempt; the alarm's stale-claim
 * reclaim reads the stamp (S3-A: an ambiguous attempt may be retried
 * only under a proven guarantee — otherwise it blocks). Mirrors the
 * legs' configured checks exactly; deliverPromotionSend remains the
 * authority at send time. The webhook is never selected: it is not a
 * compliant-delivery provider (see the removal note above).
 */
export function selectPromotionProvider(): {
  provider: PromotionAutomationProvider;
  idempotencyGuaranteed: boolean;
} | null {
  if (process.env.RESEND_API_KEY && promotionFromEmail) {
    return { provider: "resend", idempotencyGuaranteed: true };
  }
  if (process.env.SENDGRID_API_KEY && parseEmailAddress(promotionFromEmail)) {
    return { provider: "sendgrid", idempotencyGuaranteed: false };
  }
  return null;
}

/**
 * Submit one frozen payload through the provider chain. The idempotency
 * key is passed to Resend (the only leg with a documented idempotency
 * guarantee); ambiguous outcomes report whether that guarantee covers
 * the attempt that produced them.
 *
 * DISPATCH FENCE (CASL gate-1 fencing build; S91-4): before any leg is
 * attempted, the recipient's permission is re-read from the authority
 * (the per-email coordinator state, legacy KV only when the coordinator
 * has never seen the recipient). A refusal returns
 * `{ outcome: "refused" }` and NO leg runs — no provider call, no
 * fallback walk. Callers with their own authority handle
 * (the coordinator drivers) inject their checker via
 * `options.checkDispatchPermission`; every other caller gets the
 * default production checker. A checker that throws is treated as an
 * unreadable authority and refuses (`authority_unavailable`) — the
 * fence fails closed, never open.
 *
 * COMPLIANCE GATE (CASL send alignment; S93-5 Part 1): after the
 * fence, before any leg, the payload must carry the compliance
 * contract (PROMOTION_COMPLIANCE_FORMAT_VERSION + frozen
 * List-Unsubscribe headers) AND the deployment must still resolve the
 * compliance facts (a signing secret for the unsubscribe URL and a
 * mailing address). Either failing returns
 * `{ outcome: "unconfigured", provider: "none" }` with a sanitized
 * category and NO leg runs. Facts are never re-rendered into an
 * existing payload at dispatch: that would change the request under
 * the job's idempotency key. A compliant payload therefore retries
 * byte-identically even if the environment changes afterwards; the
 * current-configuration check only proves the deployment has not
 * withdrawn the facts the payload was frozen under.
 */
export async function deliverPromotionSend(
  payload: PromotionSendPayload,
  idempotencyKey?: string,
  options?: { checkDispatchPermission?: PromotionDispatchPermissionChecker },
): Promise<PromotionDeliveryOutcome> {
  const checkDispatchPermission =
    options?.checkDispatchPermission ?? checkPromotionDispatchPermission;
  let decision: Awaited<ReturnType<PromotionDispatchPermissionChecker>>;
  try {
    decision = await checkDispatchPermission(payload.email);
  } catch {
    decision = { permitted: false, reason: "authority_unavailable" };
  }
  if (!decision.permitted) {
    return { outcome: "refused", provider: "none", reason: decision.reason };
  }

  if (
    payload.complianceFormatVersion !== PROMOTION_COMPLIANCE_FORMAT_VERSION ||
    !payload.headers ||
    Object.keys(payload.headers).length === 0 ||
    !resolvePromotionComplianceFacts(payload.email)
  ) {
    return {
      outcome: "unconfigured",
      provider: "none",
      error: "promotion_compliance_unconfigured",
    };
  }

  const legs: Array<{
    provider: PromotionAutomationProvider;
    run: () => Promise<LegResult>;
    idempotencyGuaranteed: boolean;
  }> = [
    { provider: "resend", run: () => sendLegResend(payload, idempotencyKey), idempotencyGuaranteed: true },
    { provider: "sendgrid", run: () => sendLegSendgrid(payload), idempotencyGuaranteed: false },
  ];

  for (const leg of legs) {
    let result: LegResult;
    try {
      result = await leg.run();
    } catch (error) {
      return {
        outcome: "ambiguous",
        provider: leg.provider,
        error: error instanceof Error ? error.message.slice(0, 280) : "promotion_send_failed",
        idempotencyGuaranteed: leg.idempotencyGuaranteed,
      };
    }
    if (!result.configured) continue;
    if (result.outcome === "accepted") {
      return {
        outcome: "accepted",
        provider: leg.provider,
        providerMessageId: result.providerMessageId ?? null,
      };
    }
    if (result.outcome === "definitive_failure") {
      return { outcome: "definitive_failure", provider: leg.provider, error: result.error };
    }
    return {
      outcome: "ambiguous",
      provider: leg.provider,
      error: result.error,
      idempotencyGuaranteed: leg.idempotencyGuaranteed,
    };
  }

  return { outcome: "unconfigured", provider: "none", error: "No automation provider configured." };
}

function toLegacyResult(outcome: PromotionDeliveryOutcome): PromotionAutomationResult {
  if (outcome.outcome === "accepted") {
    return { delivered: true, provider: outcome.provider };
  }
  if (outcome.outcome === "refused") {
    return {
      delivered: false,
      provider: "none",
      error: `promotion_dispatch_refused:${outcome.reason}`,
    };
  }
  if (outcome.outcome === "unconfigured") {
    return { delivered: false, provider: "none", error: outcome.error ?? "No automation provider configured." };
  }
  return { delivered: false, provider: outcome.provider, error: outcome.error };
}

export async function runPromotionAutomation(
  email: string,
  couponCode: string,
  options?: { idempotencyKey?: string },
): Promise<PromotionAutomationResult> {
  try {
    const payload = preparePromotionCouponPayload(email, couponCode);
    return toLegacyResult(await deliverPromotionSend(payload, options?.idempotencyKey));
  } catch (error) {
    console.error("promotion automation failed", error);
    return { delivered: false, provider: "none", error: "automation_failed" };
  }
}

export async function runPromotionFollowup(
  email: string,
  couponCode: string,
  options?: { idempotencyKey?: string; scheduledAtIso?: string },
): Promise<PromotionAutomationResult> {
  try {
    const scheduledAtIso =
      options?.scheduledAtIso ??
      new Date(Date.now() + promotionFollowupDelaySeconds * 1000).toISOString();
    const payload = preparePromotionFollowupPayload(email, couponCode, scheduledAtIso);
    return toLegacyResult(await deliverPromotionSend(payload, options?.idempotencyKey));
  } catch (error) {
    console.error("promotion followup failed", error);
    return { delivered: false, provider: "none", error: "automation_failed" };
  }
}
