export const PRINT_CHECKOUT_REDIRECT_LABEL = "Redirecting to secure checkout...";

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
