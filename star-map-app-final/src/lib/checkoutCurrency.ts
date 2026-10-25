import type { CheckoutOrderType } from "@/lib/pricing";

/**
 * Checkout currency resolution (T-FLEET-103: native CAD pricing for
 * Canadian buyers).
 *
 * Canadian buyers are charged from the fixed native CAD price book
 * (see pricing.ts / printCatalog.ts / merchCatalog.ts) instead of the
 * USD book run through Stripe Adaptive Pricing, whose presented rate
 * embeds a ~4% conversion uplift. Everyone else keeps the USD book and
 * the account-level Adaptive Pricing presentment, byte-for-byte.
 *
 * The rule follows the money (fulfillment country), per design §2/§7.5:
 * - print & merch orders: the buyer-selected SHIPPING country governs —
 *   CA -> CAD, anything else -> USD;
 * - digital orders: the client country (cf-ipcountry, via
 *   getRequestCountry) governs — CA -> CAD, anything else -> USD.
 *
 * This resolver is the single source for that decision: the checkout
 * route's line-item construction and its pricing-identity resolver
 * (resolveCheckoutPricingIdentity) both consult it, so the charged
 * price and the idempotency/cache identity can never drift apart.
 */

export type CheckoutCurrency = "usd" | "cad";

/**
 * Reference rate the CAD price book was struck at: 1.40 CAD per USD
 * with no conversion uplift (design §2.1 — the fee-free market rate
 * implied by the 2026-10-23 Adaptive Pricing observation, re-verified
 * 2026-10-25 at 1.4006, inside the owner's ±2% band). CAD amounts are
 * fixed until manually repriced; shipping conversion uses this same
 * rate so a session's merchandise and shipping stay consistent.
 */
export const CAD_REFERENCE_RATE = 1.4;

function normalizeCountryCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

export function resolveCheckoutCurrency(input: {
  orderType: CheckoutOrderType;
  shippingCountry?: string | null;
  clientCountry?: string | null;
}): CheckoutCurrency {
  if (input.orderType === "print") {
    return normalizeCountryCode(input.shippingCountry) === "CA" ? "cad" : "usd";
  }
  return normalizeCountryCode(input.clientCountry) === "CA" ? "cad" : "usd";
}

/**
 * Convert a USD-denominated shipping rate (dollars, as Printful quotes
 * it) into CAD cents at the reference rate, rounding to the nearest
 * cent (design §3.4).
 */
export function convertUsdShippingRateToCadCents(rateDollars: number): number {
  return Math.round(rateDollars * CAD_REFERENCE_RATE * 100);
}

/** Convert a USD cent amount into CAD cents at the reference rate. */
export function convertUsdCentsToCadCents(usdCents: number): number {
  return Math.round(usdCents * CAD_REFERENCE_RATE);
}
