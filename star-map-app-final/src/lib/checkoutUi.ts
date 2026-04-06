export const PRINT_CHECKOUT_REDIRECT_LABEL = "Redirecting to secure checkout...";
export const DIGITAL_CHECKOUT_CTA_LABEL = "Buy HD download";
export const DIGITAL_CHECKOUT_REDIRECT_LABEL = "Opening secure checkout...";
export const DIGITAL_CHECKOUT_IN_FLIGHT_HELPER_TEXT =
  "Secure checkout is opening in this tab. Nothing is charged unless Stripe loads and you complete payment. If nothing appears after a few seconds, try again.";
export const DIGITAL_CHECKOUT_HELPER_TEXT =
  "Preview stays free until this exact map feels right. Continue to secure checkout to unlock the HD file without watermark.";
export const DIGITAL_CHECKOUT_TRUST_LINE =
  "One-time secure Stripe checkout supports cards plus Apple Pay, Google Pay, and Link on supported devices.";

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
      ? "Keep this tab open while Stripe loads. Nothing is charged unless Stripe opens and you complete payment. If nothing appears after a few seconds, try again."
      : hasShippingCountry
        ? "You'll stay in this tab and be redirected to secure Stripe checkout."
        : "Shipping country controls the available print route and shipping price. Select it first, then choose framed or unframed checkout.",
  };
}

export function getDigitalCheckoutPrimaryLabel(priceLabel?: string | null) {
  return priceLabel ? `Buy HD for ${priceLabel}` : DIGITAL_CHECKOUT_CTA_LABEL;
}

type CheckoutLaunchErrorInput = {
  reason: string;
  orderType: "digital" | "print";
};

export function getCheckoutLaunchErrorMessage({ reason, orderType }: CheckoutLaunchErrorInput) {
  if (reason === "invalid_promotion_code") {
    return "That promo code is invalid or expired. Nothing was charged. Try another code.";
  }
  if (reason === "promotion_not_applicable") {
    return orderType === "print"
      ? "That promo code does not apply to this print route. Nothing was charged. Try another code or remove it."
      : "That promo code does not apply to this order. Nothing was charged.";
  }
  if (reason === "promotion_lookup_failed") {
    return "We couldn't verify your promo code right now. Nothing was charged. Try again in a moment.";
  }
  if (reason === "print_asset_failed") {
    return "We couldn't prepare your print file yet. Nothing was charged. Your preview is still here, so try again.";
  }
  if (reason === "print_asset_too_large") {
    return "This map is too large for print checkout right now. Nothing was charged. Try a simpler style or use HD download instead.";
  }
  if (reason === "print_render_failed") {
    return "We couldn't render a high-res print from this device. Nothing was charged. Try again or use desktop for print checkout.";
  }
  if (reason === "missing_shipping_country") {
    return "Select your shipping country to continue with print checkout.";
  }
  if (reason === "print_shipping_country_invalid") {
    return "Shipping is not available for that country yet. Nothing was charged. Choose another country or use HD download.";
  }
  if (reason === "print_promotion_margin_blocked") {
    return "That promo code is not available for this print route right now. Nothing was charged. Try another code or remove it.";
  }
  if (reason === "print_margin_guard_blocked") {
    return "That print option is not available for the selected country right now. Nothing was charged. Try another format or country.";
  }
  if (reason === "print_checkout_disabled") {
    return "Print checkout is not live right now. Your preview is still here.";
  }
  if (reason === "map_required") {
    return "Generate your map preview before checkout.";
  }
  if (reason === "map_not_found") {
    return "We couldn't find this saved preview. Nothing was charged. Refresh the page, reopen the preview, then try again.";
  }
  if (reason.startsWith("save_failed_") || reason === "map_save_failed") {
    return "We couldn't save this preview yet. Nothing was charged. Retry in a moment.";
  }
  if (reason === "checkout_timeout") {
    return "Secure checkout took too long to open. Nothing was charged. Keep this preview open and try again.";
  }
  if (reason === "no url" || reason === "No checkout URL" || reason === "checkout_failed" || reason === "unknown") {
    return "We couldn't open secure checkout. Nothing was charged. Your preview is still here, so try again.";
  }
  return "Checkout is unavailable right now. Nothing was charged, and your preview is still here. Please try again shortly.";
}
