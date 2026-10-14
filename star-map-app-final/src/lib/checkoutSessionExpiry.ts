/** Stripe Checkout session TTL for recovery-friendly abandonment (2 hours). */
export const CHECKOUT_SESSION_TTL_SECONDS = 2 * 60 * 60;

/**
 * Unix timestamp (seconds) for Stripe `expires_at`.
 * Stripe requires 30 minutes ≤ TTL ≤ 24 hours from creation.
 */
/** Expiry is quantized to this bucket so retries within it share one Stripe idempotency key. */
export const CHECKOUT_SESSION_EXPIRY_BUCKET_SECONDS = 5 * 60;

export function getCheckoutSessionExpiresAt(nowMs: number = Date.now()): number {
  const nowSec = Math.floor(nowMs / 1000);
  const bucketStart = nowSec - (nowSec % CHECKOUT_SESSION_EXPIRY_BUCKET_SECONDS);
  return bucketStart + CHECKOUT_SESSION_TTL_SECONDS;
}
