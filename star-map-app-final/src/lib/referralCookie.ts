import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeReferralCode } from "@/lib/referrals";

export const REFERRAL_COOKIE_NAME = "starmap_ref";
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

type ReferralCookiePayload = {
  code: string;
  issuedAt: number;
};

const MIN_SIGNING_SECRET_LENGTH = 16;

function getSigningSecret() {
  const candidates = [
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

function signatureFor(code: string, issuedAt: number, secret: string) {
  return createHmac("sha256", secret)
    .update(`${code}.${issuedAt}`)
    .digest("base64url");
}

export function createReferralCookieValue(code: string, now = Date.now()): string | null {
  const normalizedCode = normalizeReferralCode(code);
  if (!normalizedCode) return null;
  const secret = getSigningSecret();
  if (!secret) return null;
  const issuedAt = Math.max(0, Math.floor(now));
  const signature = signatureFor(normalizedCode, issuedAt, secret);
  return `${normalizedCode}.${issuedAt}.${signature}`;
}

export function parseReferralCookieValue(raw: unknown, now = Date.now()): ReferralCookiePayload | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(".");
  if (parts.length !== 3) return null;
  const [rawCode, rawIssuedAt, rawSignature] = parts;
  const code = normalizeReferralCode(rawCode);
  if (!code || !rawIssuedAt || !rawSignature) return null;

  const issuedAt = Number.parseInt(rawIssuedAt, 10);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) return null;

  const ageMs = Math.max(0, now - issuedAt);
  if (ageMs > REFERRAL_COOKIE_MAX_AGE_SECONDS * 1000) return null;

  const secret = getSigningSecret();
  if (!secret) return null;
  const expected = signatureFor(code, issuedAt, secret);
  const actualBuffer = Buffer.from(rawSignature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  return { code, issuedAt };
}
