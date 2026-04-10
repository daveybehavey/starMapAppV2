import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getClientIp } from "@/lib/rateLimit";

export const CHECKOUT_INTENT_COOKIE_NAME = "starmap_checkout_intent";
export const CHECKOUT_INTENT_TTL_SECONDS = 30 * 60;

export type StoredCheckoutIntent = {
  nonceHash: string;
  createdAt: number;
  fingerprintHash?: string;
  consumedAt?: number;
};

const MIN_SECRET_LENGTH = 16;

function getCheckoutIntentSecret() {
  const candidates = [
    process.env.CHECKOUT_INTENT_SECRET,
    process.env.REFERRAL_SIGNING_SECRET,
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_SECRET_KEY,
  ];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed && trimmed.length >= MIN_SECRET_LENGTH) {
      return trimmed;
    }
  }
  return null;
}

function signatureFor(nonce: string, secret: string) {
  return createHmac("sha256", secret)
    .update(nonce)
    .digest("base64url");
}

function fingerprintSource(req: Pick<NextRequest, "headers">) {
  const userAgent = req.headers.get("user-agent")?.trim() || "";
  const acceptLanguage = req.headers.get("accept-language")?.trim() || "";
  const ip = getClientIp(req as unknown as Request).trim();
  return `${ip}\n${userAgent}\n${acceptLanguage}`;
}

export function checkoutIntentKey(mapId: string) {
  return `checkout:intent:${mapId}`;
}

export function isCheckoutIntentProtectionEnabled() {
  return Boolean(getCheckoutIntentSecret());
}

export function createCheckoutIntentNonce() {
  return randomBytes(24).toString("base64url");
}

export function createStoredCheckoutIntent(
  nonce: string,
  req: Pick<NextRequest, "headers">,
  now = Date.now(),
): StoredCheckoutIntent | null {
  const normalizedNonce = nonce.trim();
  if (!normalizedNonce) return null;
  const secret = getCheckoutIntentSecret();
  if (!secret) return null;
  const fingerprintHash = signatureFor(fingerprintSource(req), secret);
  return {
    nonceHash: signatureFor(normalizedNonce, secret),
    createdAt: Math.max(0, Math.floor(now)),
    fingerprintHash,
  };
}

export function verifyStoredCheckoutIntent(
  nonce: string | null | undefined,
  stored: StoredCheckoutIntent | null | undefined,
  req: Pick<NextRequest, "headers">,
  now = Date.now(),
) {
  const normalizedNonce = typeof nonce === "string" ? nonce.trim() : "";
  if (!normalizedNonce || !stored?.nonceHash || !Number.isFinite(stored.createdAt)) {
    return false;
  }
  const ageMs = Math.max(0, now - stored.createdAt);
  if (ageMs > CHECKOUT_INTENT_TTL_SECONDS * 1000) {
    return false;
  }
  if (Number.isFinite(stored.consumedAt)) {
    return false;
  }
  const secret = getCheckoutIntentSecret();
  if (!secret) return false;
  if (stored.fingerprintHash) {
    const expectedFingerprint = signatureFor(fingerprintSource(req), secret);
    const fingerprintBuffer = Buffer.from(stored.fingerprintHash);
    const expectedFingerprintBuffer = Buffer.from(expectedFingerprint);
    if (fingerprintBuffer.length !== expectedFingerprintBuffer.length) return false;
    if (!timingSafeEqual(fingerprintBuffer, expectedFingerprintBuffer)) {
      return false;
    }
  }
  const expected = signatureFor(normalizedNonce, secret);
  const actualBuffer = Buffer.from(stored.nonceHash);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}
