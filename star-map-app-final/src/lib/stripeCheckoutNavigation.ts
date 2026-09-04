/**
 * Strict allowlist for Stripe hosted Checkout handoff URLs.
 *
 * Stripe documents redirecting customers to the full `session.url` string; the optional
 * `#fid…` fragment is an implementation detail and may be absent on some responses.
 * Security: exact hostname + HTTPS + canonical `/c/pay/cs_*` or `/f/pay/cs_*` path only —
 * never substring matching or wildcard `*.stripe.com`.
 */

/** Explicit Stripe Checkout hostnames (add custom Checkout domains here when configured). */
export const STRIPE_CHECKOUT_HOSTNAMES = ["checkout.stripe.com"] as const;

/** Canonical Checkout Session path: /(c|f)/pay/cs_{live|test}_<id> (Stripe hosts both shapes). */
export const STRIPE_CHECKOUT_SESSION_PATH_RE = /^\/(?:c|f)\/pay\/cs_(?:live|test)_[A-Za-z0-9]+$/;

export type StripeCheckoutUrlShape = {
  valid: boolean;
  hashPresent: boolean;
  urlLength: number;
  hostname: string | null;
  hasSessionPath: boolean;
};

export function describeStripeCheckoutUrlShape(url: string): StripeCheckoutUrlShape {
  try {
    const trimmed = url.trim();
    const parsed = new URL(trimmed);
    return {
      valid: isValidStripeCheckoutUrl(trimmed),
      hashPresent: parsed.hash.length > 1,
      urlLength: trimmed.length,
      hostname: parsed.hostname || null,
      hasSessionPath: STRIPE_CHECKOUT_SESSION_PATH_RE.test(parsed.pathname),
    };
  } catch {
    return {
      valid: false,
      hashPresent: false,
      urlLength: typeof url === "string" ? url.length : 0,
      hostname: null,
      hasSessionPath: false,
    };
  }
}

export function isValidStripeCheckoutUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    if (
      !STRIPE_CHECKOUT_HOSTNAMES.includes(
        parsed.hostname as (typeof STRIPE_CHECKOUT_HOSTNAMES)[number]
      )
    ) {
      return false;
    }
    if (!STRIPE_CHECKOUT_SESSION_PATH_RE.test(parsed.pathname)) return false;
    // Empty hash is valid (Stripe may omit #fid). Lone "#" is malformed.
    if (parsed.hash === "#") return false;
    return true;
  } catch {
    return false;
  }
}

export function redirectToStripeCheckout(url: string): void {
  if (!isValidStripeCheckoutUrl(url)) {
    throw new Error("invalid_checkout_url");
  }
  window.location.assign(url);
}

export const CHECKOUT_FETCH_TIMEOUT_MS = 45_000;

export function createCheckoutFetchSignal(): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), CHECKOUT_FETCH_TIMEOUT_MS);
  return {
    signal: controller.signal,
    clear: () => window.clearTimeout(timer),
  };
}

/** HTML handoff preserves Stripe Checkout URL fragments (HTTP redirects may drop #). */
export function stripeCheckoutHtmlRedirectBody(url: string): string {
  if (!isValidStripeCheckoutUrl(url)) {
    throw new Error("invalid_checkout_url");
  }
  const safeUrl = JSON.stringify(url);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="referrer" content="no-referrer" />
  <title>Redirecting to secure checkout…</title>
</head>
<body>
  <p style="font-family: system-ui, sans-serif; text-align: center; margin-top: 3rem;">Redirecting to secure checkout…</p>
  <script>window.location.replace(${safeUrl});</script>
</body>
</html>`;
}

const MAP_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildDownloadPath(opts: {
  sessionId?: string | null;
  mapId?: string | null;
  /** After digital checkout, trigger one automatic HD export on the download page. */
  autoExport?: boolean;
}) {
  const params = new URLSearchParams();
  const sessionId = opts.sessionId?.trim();
  const mapIdRaw = opts.mapId?.trim();
  const mapId = mapIdRaw && MAP_ID_REGEX.test(mapIdRaw) ? mapIdRaw : null;
  if (sessionId) params.set("session_id", sessionId);
  if (mapId) params.set("map_id", mapId);
  if (opts.autoExport) params.set("auto_export", "1");
  const query = params.toString();
  return query ? `/download?${query}` : "/download";
}

export function checkoutUrlErrorMessage(reason: string): string | null {
  if (reason === "invalid_checkout_url") {
    return "Checkout could not start securely. Please try again — do not copy the browser address bar from a previous attempt.";
  }
  if (reason === "checkout_timeout" || reason === "AbortError") {
    return "Checkout is taking longer than expected. Please try again in a moment.";
  }
  return null;
}
