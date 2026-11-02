/**
 * S95-2 N1: the checkout idempotency cache must replay the discount outcome
 * of the session it points at, not just its URL.
 *
 * POST /api/checkout caches the created Stripe session under a cart-identity
 * key so a retry within the TTL returns the same session instead of minting
 * a second one. The fresh response carries discount-outcome flags
 * (promoApplied / discountRejected / promoInvalidDropped /
 * referralOfferApplied / referralOfferVariant / promoLookupFailed) that the
 * editor uses to warn the buyer before the handoff — a dropped code or a
 * Stripe-rejected discount still hands off, at full price. When the cache
 * stored only the bare URL, a cache-hit response silently dropped those
 * flags and the buyer lost even the warning a fresh response would have
 * shown.
 *
 * The cache now stores the full handoff record below. Records written by
 * older deploys are bare URL strings: they decode to the previous cache-hit
 * defaults (no warning flags, exactly what the old cache-hit response
 * returned) and expire within the TTL, so a deploy straddle cannot produce
 * a malformed response.
 */
export type CachedCheckoutHandoff = {
  url: string;
  promoApplied: boolean;
  referralOfferApplied: boolean;
  referralOfferVariant: string | null;
  discountRejected: boolean;
  promoInvalidDropped: boolean;
  promoLookupFailed: boolean;
};

/**
 * Narrow an unknown stored value to a handoff record. Bare strings are
 * legacy URL-only records; objects must carry a non-empty string `url` and
 * have every flag strictly coerced (only literal `true` counts). Anything
 * else is treated as a cache miss (null) so the caller mints a fresh
 * session instead of replaying an unreadable record.
 */
export function decodeCachedCheckoutHandoff(raw: unknown): CachedCheckoutHandoff | null {
  if (typeof raw === "string") {
    const url = raw.trim();
    if (!url) return null;
    return {
      url,
      promoApplied: false,
      referralOfferApplied: false,
      referralOfferVariant: null,
      discountRejected: false,
      promoInvalidDropped: false,
      promoLookupFailed: false,
    };
  }
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Partial<CachedCheckoutHandoff>;
  if (typeof record.url !== "string" || !record.url.trim()) return null;
  return {
    url: record.url.trim(),
    promoApplied: record.promoApplied === true,
    referralOfferApplied: record.referralOfferApplied === true,
    referralOfferVariant:
      typeof record.referralOfferVariant === "string" ? record.referralOfferVariant : null,
    discountRejected: record.discountRejected === true,
    promoInvalidDropped: record.promoInvalidDropped === true,
    promoLookupFailed: record.promoLookupFailed === true,
  };
}
