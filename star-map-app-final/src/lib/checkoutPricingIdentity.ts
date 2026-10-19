/**
 * Pricing identity for checkout idempotency.
 *
 * The checkout URL cache key and the Stripe idempotency key are built
 * from the ORDER identity (map, plan, variant, add-ons, ...). They must
 * also carry the PRICING identity — what the session will actually
 * charge — or a pricing change (a repointed Stripe Price ID, a tier
 * amount change) leaks across the flip: the 120s URL cache can hand
 * back a session minted at the old price while the site displays the
 * new one, and a same-bucket retry can reuse the old Stripe
 * idempotency key with new parameters, which Stripe rejects.
 *
 * A component is one charged line's effective price source, resolved
 * exactly the way the checkout route builds its line items:
 * - a configured Stripe Price ID, or
 * - the price_data fallback's currency + amount.
 * The route resolves the components (it owns the resolvers and the
 * env Price-ID maps); this module only formats them, so the format is
 * pinned by unit tests and the two keys can never drift apart.
 */

export type CheckoutPriceComponent =
  | { kind: "price"; priceId: string }
  | { kind: "price_data"; currency: string; amountCents: number };

export function priceIdComponent(priceId: string): CheckoutPriceComponent {
  return { kind: "price", priceId };
}

export function priceDataComponent(currency: string, amountCents: number): CheckoutPriceComponent {
  return { kind: "price_data", currency, amountCents };
}

export function formatCheckoutPriceComponent(component: CheckoutPriceComponent): string {
  return component.kind === "price"
    ? `price:${component.priceId}`
    : `pd:${component.currency.trim().toLowerCase()}:${component.amountCents}`;
}

/**
 * The pricing segment appended to the checkout idempotency key (and,
 * through it, to the Stripe idempotency key). Empty when no component
 * was resolved — the caller treats that as "no pricing segment", so
 * key shapes without pricing stay byte-identical to before.
 */
export function buildCheckoutPricingIdentity(components: CheckoutPriceComponent[]): string {
  return components.map(formatCheckoutPriceComponent).join("+");
}
