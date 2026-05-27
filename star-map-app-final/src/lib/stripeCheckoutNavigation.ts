/** Stripe hosted Checkout URLs require the #fid… fragment; without it the page fails to initialize. */
export function isValidStripeCheckoutUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
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

export function checkoutUrlErrorMessage(reason: string): string | null {
  if (reason === "invalid_checkout_url") {
    return "Checkout could not start securely. Please try again — do not copy the browser address bar from a previous attempt.";
  }
  if (reason === "checkout_timeout" || reason === "AbortError") {
    return "Checkout is taking longer than expected. Please try again in a moment.";
  }
  return null;
}
