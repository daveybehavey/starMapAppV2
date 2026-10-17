/**
 * Client helpers for `/api/checkout` failure diagnostics, one retry, and fallback UX.
 */

export type CheckoutApiErrorPayload = {
  error?: string;
  code?: string;
  reason?: string;
  diagnosticId?: string;
  editorRecoveryUrl?: string;
};

export type CheckoutFailureDiagnostics = {
  code: string;
  /** Customer-readable `error` string from the API when present. */
  errorMessage: string | null;
  serverReason: string | null;
  diagnosticId: string | null;
  httpStatus: number;
  editorRecoveryUrl: string | null;
};

export function parseCheckoutApiErrorPayload(
  data: CheckoutApiErrorPayload | null | undefined,
  httpStatus: number,
): CheckoutFailureDiagnostics {
  const code =
    typeof data?.code === "string" && data.code.trim()
      ? data.code.trim()
      : httpStatus === 429
        ? "rate_limited"
        : typeof data?.error === "string" && data.error.trim()
          ? data.error.trim()
          : "checkout_failed";
  const errorMessage =
    typeof data?.error === "string" && data.error.trim() ? data.error.trim().slice(0, 240) : null;
  const serverReason =
    typeof data?.reason === "string" && data.reason.trim() ? data.reason.trim().slice(0, 80) : null;
  const diagnosticId =
    typeof data?.diagnosticId === "string" && data.diagnosticId.trim()
      ? data.diagnosticId.trim().slice(0, 64)
      : null;
  const editorRecoveryUrl =
    typeof data?.editorRecoveryUrl === "string" && data.editorRecoveryUrl.trim()
      ? data.editorRecoveryUrl.trim()
      : null;
  return { code, errorMessage, serverReason, diagnosticId, httpStatus, editorRecoveryUrl };
}

/** Errors that should not auto-retry (user/input issues). */
const NON_RETRYABLE_CHECKOUT_CODES = new Set([
  "promotion_not_applicable",
  "map_required",
  "map_not_found",
  "sky_location_required",
  "missing_shipping_country",
  "print_shipping_country_invalid",
  "print_checkout_disabled",
  "print_margin_guard_blocked",
  "print_promotion_margin_blocked",
  "missing_print_asset",
  "missing_card_print_asset",
  "qa_auth_required",
]);

/** Friendly status shown while the client auto-retries a soft failure (429, etc.). */
export const CHECKOUT_RETRY_STATUS_MESSAGE = "One moment, retrying…";

export function shouldRetryCheckoutFailure(code: string, httpStatus?: number): boolean {
  if (httpStatus === 429 || code === "rate_limited") return true;
  // Missing/expired handoff: retry once with a fresh browser token.
  if (code === "checkout_handoff_required") return true;
  if (!code) return true;
  if (NON_RETRYABLE_CHECKOUT_CODES.has(code)) return false;
  // Transient / unknown server failures — retry once.
  return (
    code === "unknown_error" ||
    code === "invalid_checkout_url" ||
    code === "checkout_failed" ||
    code === "Checkout failed" ||
    code.startsWith("stripe_") ||
    code === "missing_stripe_checkout_url" ||
    code === "invalid_stripe_checkout_url" ||
    code === "Too many requests. Please try again later."
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
      input.code === "sky_location_required" ||
      input.code === "missing_shipping_country" ||
      input.code === "print_shipping_country_invalid"
    ) {
      return false;
    }
  }
  if (input.code === "checkout_handoff_required") return false;
  if (input.orderType === "print") return true;
  if (input.plan && input.plan !== "single") return true;
  return false;
}

export const DIGITAL_SINGLE_FALLBACK_LABEL = "Try instant HD instead";
