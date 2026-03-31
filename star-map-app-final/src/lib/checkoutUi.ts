export const PRINT_CHECKOUT_REDIRECT_LABEL = "Redirecting to secure checkout...";
export const DIGITAL_CHECKOUT_CTA_LABEL = "Continue to secure checkout";
export const DIGITAL_CHECKOUT_REDIRECT_LABEL = "Opening secure checkout...";
export const DIGITAL_CHECKOUT_IN_FLIGHT_HELPER_TEXT =
  "Secure checkout is opening in this tab. If nothing appears, wait a few seconds, then try again.";
export const DIGITAL_CHECKOUT_HELPER_TEXT =
  "Free preview stays available. Continue to secure checkout to unlock HD without watermark.";
export const DIGITAL_CHECKOUT_TRUST_LINE =
  "Secure checkout supports cards plus Apple Pay, Google Pay, and Link on supported devices.";

type PrintCheckoutCtaStateInput = {
  checkoutInFlight: boolean;
  hasShippingCountry: boolean;
};

type PrintCheckoutCtaState = {
  disabledReason: string | null;
  helperText: string;
};

export function getPrintCheckoutCtaState({
  checkoutInFlight,
  hasShippingCountry,
}: PrintCheckoutCtaStateInput): PrintCheckoutCtaState {
  const disabledReason = checkoutInFlight
    ? "Redirecting to secure Stripe checkout in this tab..."
    : hasShippingCountry
      ? null
      : "Select a shipping country to unlock print checkout.";

  return {
    disabledReason,
    helperText: disabledReason ?? "You'll stay in this tab and be redirected to secure Stripe checkout.",
  };
}
