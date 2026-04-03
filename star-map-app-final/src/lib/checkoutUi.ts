export const PRINT_CHECKOUT_REDIRECT_LABEL = "Redirecting to secure checkout...";
export const DIGITAL_CHECKOUT_CTA_LABEL = "Continue to secure checkout";
export const DIGITAL_CHECKOUT_REDIRECT_LABEL = "Opening secure checkout...";
export const DIGITAL_CHECKOUT_IN_FLIGHT_HELPER_TEXT =
  "Secure checkout is opening in this tab. If nothing appears, wait a few seconds, then try again.";
export const DIGITAL_CHECKOUT_HELPER_TEXT =
  "Free preview stays available. Continue to secure checkout for this exact map to unlock the HD file without watermark.";
export const DIGITAL_CHECKOUT_TRUST_LINE =
  "Secure Stripe checkout supports cards plus Apple Pay, Google Pay, and Link on supported devices.";

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
    ? "Secure checkout is opening in this tab..."
    : hasShippingCountry
      ? null
      : "Choose a shipping country above to unlock print checkout.";

  return {
    disabledReason,
    helperText: checkoutInFlight
      ? "Keep this tab open while Stripe loads. If nothing appears after a few seconds, try again."
      : hasShippingCountry
        ? "You'll stay in this tab and be redirected to secure Stripe checkout."
        : "Shipping country controls the available print route and shipping price. Select it first, then choose framed or unframed checkout.",
  };
}
