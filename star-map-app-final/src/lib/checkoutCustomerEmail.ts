/**
 * Optional pre-checkout email for Stripe Checkout recovery.
 * Passed as `customer_email` only when valid — never invent or require it.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normalize and validate an optional customer email for Stripe Checkout. */
export function normalizeCheckoutCustomerEmail(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.length > 254) return undefined;
  if (!EMAIL_RE.test(trimmed)) return undefined;
  return trimmed;
}
