import { createHmac, timingSafeEqual } from "node:crypto";

export const LEGACY_SUBSCRIPTION_KEY = "promotions:emails";
export const LEGACY_SENT_KEY = "promotions:coupon-sent";
export const LEGACY_FOLLOWUP_KEY = "promotions:print-tips-sent";
export const EMAIL_STATE_PREFIX = "promotions:email:";

export type PromotionEmailState = {
  subscribedAt: number;
  couponSentAt?: number;
  followupSentAt?: number;
  unsubscribedAt?: number;
  unsubscribeReason?: string;
  updatedAt: number;
  lastSource?: string;
};

const MIN_SIGNING_SECRET_LENGTH = 16;

function getSigningSecret() {
  const candidates = [
    process.env.PROMOTION_UNSUBSCRIBE_SECRET,
    process.env.REFERRAL_SIGNING_SECRET,
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_SECRET_KEY,
  ];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed && trimmed.length >= MIN_SIGNING_SECRET_LENGTH) {
      return trimmed;
    }
  }
  return null;
}

function signatureFor(email: string, secret: string) {
  return createHmac("sha256", secret)
    .update(email)
    .digest("base64url");
}

export function isValidPromotionEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizePromotionEmail(raw: unknown) {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

export function emailStateKey(email: string) {
  return `${EMAIL_STATE_PREFIX}${encodeURIComponent(email)}`;
}

export function keyNameToPromotionEmail(key: string) {
  if (!key.startsWith(EMAIL_STATE_PREFIX)) return null;
  const encoded = key.slice(EMAIL_STATE_PREFIX.length);
  try {
    const decoded = decodeURIComponent(encoded);
    return isValidPromotionEmail(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function createPromotionUnsubscribeToken(email: string) {
  const normalized = normalizePromotionEmail(email);
  if (!isValidPromotionEmail(normalized)) return null;
  const secret = getSigningSecret();
  if (!secret) return null;
  return signatureFor(normalized, secret);
}

export function verifyPromotionUnsubscribeToken(email: string, token: string) {
  const normalized = normalizePromotionEmail(email);
  const trimmedToken = token.trim();
  if (!isValidPromotionEmail(normalized) || !trimmedToken) return false;
  const secret = getSigningSecret();
  if (!secret) return false;
  const expected = signatureFor(normalized, secret);
  const givenBuffer = Buffer.from(trimmedToken);
  const expectedBuffer = Buffer.from(expected);
  if (givenBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(givenBuffer, expectedBuffer);
}

export function getPromotionUnsubscribeUrl(email: string) {
  const normalized = normalizePromotionEmail(email);
  const token = createPromotionUnsubscribeToken(normalized);
  if (!token) return null;
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com").replace(/\/+$/, "");
  const params = new URLSearchParams({ email: normalized, token });
  return `${siteUrl}/unsubscribe?${params.toString()}`;
}
