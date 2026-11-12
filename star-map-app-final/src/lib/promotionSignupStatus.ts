/** Storefront feedback for the existing `promo` query parameter. */
export const PROMOTION_SIGNUP_MESSAGES = {
  pending: "Request recorded. Email confirmation is not yet available. Your subscription is not complete.",
  error: "Please enter a valid email address and give fresh consent using the signup form.",
  rate_limited: "Too many requests. Please wait a minute and try again. Your subscription is not complete.",
  capture_unavailable: "We couldn't record your request. Please try again later. Your subscription is not complete.",
} as const;

export type PromotionSignupStatus = "success" | keyof typeof PROMOTION_SIGNUP_MESSAGES;

export function parsePromotionSignupStatus(value?: string): PromotionSignupStatus | undefined {
  return value === "success" || value === "pending" || value === "error" ||
    value === "rate_limited" || value === "capture_unavailable" ? value : undefined;
}
