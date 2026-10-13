/** Stripe Checkout session TTL for recovery-friendly abandonment (2 hours). */
export const CHECKOUT_SESSION_TTL_SECONDS = 2 * 60 * 60;

/**
 * Unix timestamp (seconds) for Stripe `expires_at`.
 * Stripe requires 30 minutes ≤ TTL ≤ 24 hours from creation.
 */
export function getCheckoutSessionExpiresAt(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000) + CHECKOUT_SESSION_TTL_SECONDS;
}
