/**
 * Review-request email builder + opt-out token signing (StarMapCo T1).
 *
 * Destination is Google only (design decision: one ask, one destination —
 * the Trustpilot dual-ask in the shipping email is a separate removal PR).
 * The canonical review URL is consolidated here as GOOGLE_REVIEW_URL,
 * derived from the existing GOOGLE_RATINGS constant so there is one source.
 *
 * Compliance shape mirrors OurImprint's review email: CASL identification
 * (the builder THROWS without a business mailing address), an HMAC-signed
 * one-click opt-out URL, and List-Unsubscribe / List-Unsubscribe-Post
 * headers. The mailing address is owner-supplied configuration
 * (REVIEW_REQUEST_MAILING_ADDRESS); this module never invents one.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { GOOGLE_RATINGS } from "@/lib/googleRatings";
import {
  escapeHtml,
  renderPrimaryButton,
  renderTransactionalEmailDocument,
} from "@/lib/transactionalEmailLayout";
import type { ReviewRequestKind } from "@/lib/reviewRequestLedgerState";

/** Canonical Google review destination (single source: GOOGLE_RATINGS.reviewUrl). */
export const GOOGLE_REVIEW_URL = `${GOOGLE_RATINGS.reviewUrl.replace(/\/+$/, "")}/review`;

export const REVIEW_REQUEST_SUBJECT = "How did your star map turn out?";

const OPTOUT_SECRET_MIN_LENGTH = 16;

/**
 * Signing-secret resolution for review opt-out tokens.
 *
 * Deliberately narrow (Step-0 Codex critique, P1): only purpose-built email
 * opt-out secrets qualify. Stripe secrets are NEVER a fallback — signing
 * opt-out tokens with a payment secret would turn the unsubscribe surface
 * into an oracle for a payments credential and violates secret separation.
 */
export function getReviewOptOutSecret(
  env: Record<string, string | undefined> = process.env,
): string | null {
  for (const key of ["REVIEW_OPTOUT_SIGNING_SECRET", "PROMOTION_UNSUBSCRIBE_SECRET"] as const) {
    const value = env[key]?.trim();
    if (value && value.length >= OPTOUT_SECRET_MIN_LENGTH) return value;
  }
  return null;
}

function signOptOutPayload(email: string, secret: string): string {
  return createHmac("sha256", secret).update(`opt-out:${email}`).digest("base64url");
}

/**
 * Build the signed one-click opt-out URL. `email` must already be normalized
 * (normalizePromotionEmail) — the ledger/suppression keys use the same form.
 */
export function buildReviewOptOutUrl(baseUrl: string, email: string, secret: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const token = signOptOutPayload(email, secret);
  return `${base}/api/reviews/opt-out?e=${encodeURIComponent(email)}&t=${encodeURIComponent(token)}`;
}

export function verifyReviewOptOutToken(email: string, token: string, secret: string): boolean {
  const expected = signOptOutPayload(email, secret);
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(token);
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export type BuiltReviewRequestEmail = {
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
};

export function buildReviewRequestEmail(input: {
  kind: ReviewRequestKind;
  siteUrl: string;
  supportEmail: string;
  mailingAddress: string;
  optOutUrl: string;
}): BuiltReviewRequestEmail {
  const mailingAddress = input.mailingAddress.trim();
  if (!mailingAddress) {
    // Ported CASL gate: no identification address, no email — the engine
    // checks this before claiming anything, so a throw here is a bug alarm,
    // not a runtime path.
    throw new Error("A business mailing address is required for CASL.");
  }
  const supportEmail = input.supportEmail.trim();
  const optOutUrl = input.optOutUrl.trim();
  const subject = REVIEW_REQUEST_SUBJECT;
  const isPhysical = input.kind === "physical";

  const introHtml = isPhysical
    ? `<p style="margin:0 0 16px;">Thanks for ordering a printed star map from StarMapCo. Once it arrives and you've had a chance to live with it, we'd love to hear how it turned out.</p>`
    : `<p style="margin:0 0 16px;">Thanks for creating a star map with StarMapCo. We hope the moment you captured looks as good printed or on screen as it did in the sky.</p>`;
  const introText = isPhysical
    ? "Thanks for ordering a printed star map from StarMapCo. Once it arrives and you've had a chance to live with it, we'd love to hear how it turned out."
    : "Thanks for creating a star map with StarMapCo. We hope the moment you captured looks as good printed or on screen as it did in the sky.";

  const bodyHtml = [
    introHtml,
    `<p style="margin:0 0 20px;">A quick Google review helps other stargazers find us — and takes less than a minute:</p>`,
    renderPrimaryButton(GOOGLE_REVIEW_URL, "Review us on Google"),
    `<p style="margin:20px 0 0;">Prefer to share your story here instead? Just reply to this email — with your permission, we may feature it on our site.</p>`,
    `<p style="margin:12px 0 0;">Anything not right with your order? Reply and tell us — we'll make it right.</p>`,
    `<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;">StarMapCo · ${escapeHtml(mailingAddress)}<br/>You're receiving this one-time email because you ordered from StarMapCo. <a href="${escapeHtml(optOutUrl)}" style="color:#94a3b8;text-decoration:underline;">Unsubscribe from review requests</a></p>`,
  ].join("\n");

  const html = renderTransactionalEmailDocument({
    subject,
    preheader: isPhysical
      ? "Once your star map arrives, tell us how it turned out."
      : "Tell us how your star map turned out.",
    bodyHtml,
    siteUrl: input.siteUrl,
    supportEmail,
  });

  const text = [
    introText,
    "",
    "A quick Google review helps other stargazers find us — and takes less than a minute:",
    GOOGLE_REVIEW_URL,
    "",
    "Prefer to share your story here instead? Just reply to this email — with your permission, we may feature it on our site.",
    "",
    "Anything not right with your order? Reply and tell us — we'll make it right.",
    "",
    `StarMapCo · ${mailingAddress}`,
    `Unsubscribe from review requests: ${optOutUrl}`,
  ].join("\n");

  return {
    subject,
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${optOutUrl}>, <mailto:${supportEmail}?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
