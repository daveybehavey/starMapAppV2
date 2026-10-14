import type Stripe from "stripe";

/**
 * Stripe `consent_collection.promotions: "auto"` is only supported on some
 * account countries (commonly US). Canadian and other accounts may reject it.
 *
 * Default: attempt promotions consent unless explicitly disabled via env.
 * Callers should catch unsupported errors and retry without promotions.
 */
export function shouldAttemptPromotionsConsent(): boolean {
  const raw = (process.env.STRIPE_CONSENT_PROMOTIONS_AUTO || "1").trim();
  if (/^(0|false|no|off)$/i.test(raw)) return false;
  return true;
}

export function buildCheckoutConsentCollection(
  includePromotions: boolean
): Stripe.Checkout.SessionCreateParams.ConsentCollection {
  return {
    terms_of_service: "required",
    ...(includePromotions ? { promotions: "auto" as const } : {}),
  };
}

/** Detect Stripe rejecting promotions consent for the account country. */
export function isPromotionsConsentUnsupportedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as {
    type?: string;
    code?: string;
    param?: string;
    message?: string;
    raw?: { param?: string; message?: string; code?: string };
  };
  const param = String(err.param ?? err.raw?.param ?? "").toLowerCase();
  const message = String(err.message ?? err.raw?.message ?? "").toLowerCase();
  const code = String(err.code ?? err.raw?.code ?? "").toLowerCase();

  if (param.includes("promotions") || param.includes("consent_collection")) {
    return true;
  }
  if (message.includes("promotions") && (message.includes("consent") || message.includes("not support"))) {
    return true;
  }
  if (code === "parameter_invalid_empty" && message.includes("promotions")) {
    return true;
  }
  return false;
}
