/**
 * Shared strict Stripe Checkout handoff validators for live QA probes.
 *
 * Contract mirrors buyer navigation (`src/lib/stripeCheckoutNavigation.ts`):
 * HTTPS + exact host allowlist + canonical `/(c|f)/pay/cs_*` path.
 * Fragment (#fid…) is optional — Stripe may return session.url without a hash.
 * Session IDs are taken only from the validated pathname — never query/fragment scans.
 */

const CHECKOUT_SESSION_ID_PATH_RE = /^\/(?:c|f)\/pay\/(cs_(?:live|test)_[A-Za-z0-9]+)$/;
const STRIPE_CHECKOUT_HOSTNAMES = ["checkout.stripe.com"];

/**
 * Mirror of src/lib/stripeCheckoutNavigation.isValidStripeCheckoutUrl (plain JS for node --test).
 * @param {string} url
 */
export function isValidStripeCheckoutUrl(url) {
  try {
    const parsed = new URL(String(url).trim());
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    if (!STRIPE_CHECKOUT_HOSTNAMES.includes(parsed.hostname)) return false;
    if (!parsed.pathname.match(/^\/(?:c|f)\/pay\/cs_(?:live|test)_[A-Za-z0-9]+$/)) return false;
    if (parsed.hash === "#") return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate hosted Stripe URL without echoing it.
 * Accepts only the repository's strict HTTPS / exact-host / /(c|f)/pay/ contract.
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
 * Extract Checkout Session ID only from the canonical `/(c|f)/pay/<session-id>` pathname segment.
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
    throw new Error(
      "BLOCKER: Checkout Session ID missing from canonical /(c|f)/pay/ pathname segment."
    );
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
