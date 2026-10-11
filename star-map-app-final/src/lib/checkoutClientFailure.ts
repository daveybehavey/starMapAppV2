/**
 * Client helpers for `/api/checkout` failure diagnostics, one retry, and fallback UX.
 */

export type CheckoutApiErrorPayload = {
  error?: string;
  code?: string;
  reason?: string;
  diagnosticId?: string;
};

export type CheckoutFailureDiagnostics = {
  code: string;
  serverReason: string | null;
  diagnosticId: string | null;
  httpStatus: number;
};

export function parseCheckoutApiErrorPayload(
  data: CheckoutApiErrorPayload | null | undefined,
  httpStatus: number,
): CheckoutFailureDiagnostics {
  const code =
    typeof data?.code === "string" && data.code.trim()
      ? data.code.trim()
      : typeof data?.error === "string" && data.error.trim()
        ? data.error.trim()
        : "checkout_failed";
  const serverReason =
    typeof data?.reason === "string" && data.reason.trim() ? data.reason.trim().slice(0, 80) : null;
  const diagnosticId =
    typeof data?.diagnosticId === "string" && data.diagnosticId.trim()
      ? data.diagnosticId.trim().slice(0, 64)
      : null;
  return { code, serverReason, diagnosticId, httpStatus };
}

/** Errors that should not auto-retry (user/input issues). */
const NON_RETRYABLE_CHECKOUT_CODES = new Set([
  "invalid_promotion_code",
  "promotion_not_applicable",
  "map_required",
  "map_not_found",
  "missing_shipping_country",
  "print_shipping_country_invalid",
  "print_checkout_disabled",
  "print_margin_guard_blocked",
  "print_promotion_margin_blocked",
  "missing_print_asset",
  "missing_card_print_asset",
  "checkout_handoff_required",
  "qa_auth_required",
  "rate_limited",
]);

export function shouldRetryCheckoutFailure(code: string): boolean {
  if (!code) return true;
  if (NON_RETRYABLE_CHECKOUT_CODES.has(code)) return false;
  // Transient / unknown server failures — retry once.
  return (
    code === "checkout_network_error" ||
    code === "checkout_timeout" ||
    code === "unknown_error" ||
    code === "invalid_checkout_url" ||
    code === "checkout_failed" ||
    code === "Checkout failed" ||
    code.startsWith("stripe_") ||
    code === "missing_stripe_checkout_url" ||
    code === "invalid_stripe_checkout_url"
  );
}

/** When print/pack/subscription fails, offer digital single as a recovery path. */
export function shouldOfferDigitalSingleFallback(input: {
  orderType?: string | null;
  plan?: string | null;
  code?: string | null;
}): boolean {
  if (input.code && NON_RETRYABLE_CHECKOUT_CODES.has(input.code) && input.code !== "unknown_error") {
    // Still offer fallback for unknown/transient after retries; skip for map/shipping input errors.
    if (
      input.code === "map_required" ||
      input.code === "map_not_found" ||
      input.code === "missing_shipping_country" ||
      input.code === "print_shipping_country_invalid" ||
      input.code === "checkout_handoff_required"
    ) {
      return false;
    }
  }
  if (input.orderType === "print") return true;
  if (input.plan && input.plan !== "single") return true;
  return false;
}

export const DIGITAL_SINGLE_FALLBACK_LABEL = "Try instant HD instead";

/** One bounded transport attempt; callers own the maximum of two attempts.
 * Normalize only fetch network/timeout failures, leaving programming errors visible.
 * Keep the payload (especially map ID and order options) unchanged across retries:
 * those fields bind the server's Stripe idempotency key.
 */
export async function requestCheckoutAttempt<T extends CheckoutApiErrorPayload & { url?: string }>(
  init: RequestInit,
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch("/api/checkout", { ...init, signal: controller.signal });
    const data = (await response.json().catch((error: unknown) => {
      if (controller.signal.aborted) throw error;
      return null;
    })) as T | null;
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    const timedOut = controller.signal.aborted || (error instanceof Error && error.name === "AbortError");
    if (!timedOut && !(error instanceof TypeError)) throw error;
    return {
      ok: false,
      status: 0,
      data: { code: timedOut ? "checkout_timeout" : "checkout_network_error" } as T,
    };
  } finally {
    clearTimeout(timeout);
  }
}
