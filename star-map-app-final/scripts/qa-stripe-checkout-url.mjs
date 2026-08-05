/**
 * Shared strict Stripe Checkout handoff validators for live QA probes.
 *
 * Contract mirrors buyer navigation (`src/lib/stripeCheckoutNavigation.ts`):
 * HTTPS + exact host `checkout.stripe.com` + `/c/pay/<session>` + nonempty fragment.
 * Session IDs are taken only from the validated pathname — never query/fragment scans.
 */

const CHECKOUT_SESSION_ID_PATH_RE = /^\/c\/pay\/(cs_(?:live|test)_[A-Za-z0-9]+)$/;

/**
 * Mirror of src/lib/stripeCheckoutNavigation.isValidStripeCheckoutUrl (plain JS for node --test).
 * @param {string} url
 */
export function isValidStripeCheckoutUrl(url) {
  try {
    const parsed = new URL(String(url).trim());
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "checkout.stripe.com" &&
      parsed.pathname.startsWith("/c/pay/") &&
      parsed.hash.length > 1
    );
  } catch {
    return false;
  }
}

/**
 * Validate hosted Stripe URL without echoing it.
 * Accepts only the repository's strict HTTPS / exact-host / /c/pay/ / nonempty-fragment contract.
 * @param {unknown} url
 */
export function assertHostedStripeCheckoutUrl(url) {
  if (typeof url !== "string" || !url.trim()) {
    throw new Error("Checkout response missing hosted Stripe URL.");
  }
  if (!isValidStripeCheckoutUrl(url.trim())) {
    throw new Error("Checkout response URL is not a Stripe-hosted checkout handoff.");
  }
  return true;
}

/**
 * Extract Checkout Session ID only from the canonical `/c/pay/<session-id>` pathname segment.
 * Never scans fragment, query, or unrelated URL components.
 *
 * @param {unknown} checkoutUrl
 * @returns {string}
 */
export function extractCheckoutSessionIdFromPayPath(checkoutUrl) {
  assertHostedStripeCheckoutUrl(checkoutUrl);
  const parsed = new URL(String(checkoutUrl).trim());
  const match = parsed.pathname.match(CHECKOUT_SESSION_ID_PATH_RE);
  if (!match) {
    throw new Error("BLOCKER: Checkout Session ID missing from canonical /c/pay/ pathname segment.");
  }
  return match[1];
}

/**
 * True only when the URL is a strict Stripe handoff and the path segment is a real session id.
 * Used by probes that must not accept substring `checkout.stripe.com` alone.
 *
 * @param {unknown} url
 * @returns {boolean}
 */
export function isStrictStripeCheckoutHandoff(url) {
  try {
    extractCheckoutSessionIdFromPayPath(url);
    return true;
  } catch {
    return false;
  }
}
