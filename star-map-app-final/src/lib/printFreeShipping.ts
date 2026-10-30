import type { Stripe } from "stripe";
import {
  getPrintDigitalAddOnPrice,
  getPrintPricingTiers,
  getPrintSecondCopyPriceCents,
  formatPrice,
} from "./pricing";
import type { PrintVariant } from "./printCatalog";

// Lever B (2026-10-25 margin pack): $89 — the framed hero ($99) previously sat
// $1 under the $100 threshold, so every framed-only buyer was charged shipping.
// Env overrides still win; this is only the no-env default.
const DEFAULT_THRESHOLD_CENTS = 8_900;
const FREE_SHIPPING_LABEL = "Free standard shipping";

function parseThresholdCents(raw: string | undefined): number | null {
  if (!raw || !raw.trim()) return null;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

/** Server + client: minimum merchandise subtotal (excl. shipping) for waived print shipping. */
export function getPrintFreeShippingThresholdCents(): number | null {
  const raw =
    typeof window === "undefined"
      ? process.env.PRINT_FREE_SHIPPING_THRESHOLD_CENTS ?? process.env.NEXT_PUBLIC_PRINT_FREE_SHIPPING_THRESHOLD_CENTS
      : process.env.NEXT_PUBLIC_PRINT_FREE_SHIPPING_THRESHOLD_CENTS;
  return parseThresholdCents(raw) ?? DEFAULT_THRESHOLD_CENTS;
}

export function isPrintFreeShippingEnabled(): boolean {
  return getPrintFreeShippingThresholdCents() !== null;
}

export function getPrintMerchandiseSubtotalCents(input: {
  variant: PrintVariant;
  includeDigitalAddOn?: boolean;
  includeCardAddOn?: boolean;
  includeSecondCopy?: boolean;
}): number {
  const tiers = getPrintPricingTiers();
  let total = tiers[input.variant].amountCents;
  if (input.includeDigitalAddOn) total += getPrintDigitalAddOnPrice().amountCents;
  if (input.includeCardAddOn) total += tiers.card_4x6.amountCents;
  // Lever A: the second copy counts toward the free-shipping threshold
  // at its 90% price, exactly as its mirror entry does in the checkout
  // route's USD subtotal — display hints must agree with the route.
  if (input.includeSecondCopy) total += getPrintSecondCopyPriceCents(input.variant);
  return total;
}

export function qualifiesForPrintFreeShipping(merchandiseSubtotalCents: number): boolean {
  const threshold = getPrintFreeShippingThresholdCents();
  if (!threshold) return false;
  return merchandiseSubtotalCents >= threshold;
}

/**
 * The threshold is a USD merchandise-subtotal figure in BOTH markets:
 * checkout judges eligibility on the USD mirror subtotal (see the
 * checkout route's promotionEstimateLineItemsUsd), never on a converted
 * native-currency amount. The label therefore always formats the cents
 * explicitly as USD — relabelling the USD figure with the display
 * currency would state a threshold checkout does not use. The currency
 * argument is retained for call-site compatibility and ignored.
 */
export function formatPrintFreeShippingThresholdLabel(currency = "usd"): string {
  void currency;
  const threshold = getPrintFreeShippingThresholdCents();
  if (!threshold) return "";
  return formatPrice(threshold, "usd");
}

/** Marketing copy — must match checkout behavior. */
export function getPrintFreeShippingOfferLine(currency = "usd"): string | null {
  const thresholdLabel = formatPrintFreeShippingThresholdLabel(currency);
  if (!thresholdLabel) return null;
  return `Free standard shipping when your print order's USD merchandise subtotal is ${thresholdLabel} or more. Eligibility uses USD item values in both markets and excludes shipping.`;
}

/**
 * Short tag form of the free-shipping offer for cards, pills, and bullets.
 * The full threshold statement (`getPrintShippingDisclosure`) appears once per page.
 */
export function getPrintFreeShippingShortTag(currency = "usd"): string | null {
  const thresholdLabel = formatPrintFreeShippingThresholdLabel(currency);
  if (!thresholdLabel) return null;
  return `Free standard shipping · ${thresholdLabel}+ USD subtotal`;
}

/**
 * Retired: the old hint named a hardcoded bundle amount in the display
 * currency and claimed qualification unconditionally — the same
 * USD-figure-in-another-currency trap the label fix removes, plus a
 * claim no surface should make without the shopper's actual cart.
 * Returns null; the one caller (the shipping policy page) already
 * renders the hint only when non-null.
 */
export function getPrintFreeShippingQualifyingHint(currency = "usd"): string | null {
  void currency;
  return null;
}

export type PrintShippingCheckoutSelection = {
  shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] | undefined;
  shippingChargeCents: number | null;
};

export type PrintFreeShippingApplication = PrintShippingCheckoutSelection & {
  freeShippingApplied: boolean;
  shippingSubsidyCents: number | null;
};

function zeroShippingOptions(
  options: Stripe.Checkout.SessionCreateParams.ShippingOption[] | undefined,
  displayName: string,
  sessionCurrency?: string | null,
): Stripe.Checkout.SessionCreateParams.ShippingOption[] | undefined {
  if (!options?.length) return options;
  // The waived (zero-amount) option must be stamped in the SESSION's
  // currency: Stripe validates a session as single-currency, so a CAD
  // session whose shipping is waived still fails creation if the zero
  // option carries the USD default. Callers pass the session currency
  // (T-FLEET-103); when absent, the configured storefront currency
  // applies exactly as before.
  const normalizedSessionCurrency =
    typeof sessionCurrency === "string" && sessionCurrency.trim()
      ? sessionCurrency.trim().toLowerCase()
      : null;
  const currency =
    normalizedSessionCurrency ??
    (process.env.CURRENCY ?? process.env.NEXT_PUBLIC_CURRENCY ?? "usd").trim().toLowerCase();
  return options.map((option) => {
    if ("shipping_rate" in option && option.shipping_rate) {
      return {
        shipping_rate_data: {
          type: "fixed_amount" as const,
          fixed_amount: { amount: 0, currency },
          display_name: displayName,
        },
      };
    }
    if (!("shipping_rate_data" in option) || !option.shipping_rate_data) return option;
    const optionCurrency = option.shipping_rate_data.fixed_amount?.currency ?? currency;
    return {
      shipping_rate_data: {
        ...option.shipping_rate_data,
        type: "fixed_amount",
        fixed_amount: {
          amount: 0,
          currency: optionCurrency,
        },
        display_name: displayName,
      },
    };
  });
}

/** Waive customer shipping when merchandise subtotal clears the threshold. */
export function applyPrintFreeShippingToCheckout(
  selection: PrintShippingCheckoutSelection,
  merchandiseSubtotalCents: number,
  sessionCurrency?: string | null,
): PrintFreeShippingApplication {
  if (!qualifiesForPrintFreeShipping(merchandiseSubtotalCents)) {
    return {
      ...selection,
      freeShippingApplied: false,
      shippingSubsidyCents: null,
    };
  }

  const originalCharge =
    typeof selection.shippingChargeCents === "number" && Number.isFinite(selection.shippingChargeCents)
      ? Math.max(0, Math.round(selection.shippingChargeCents))
      : null;

  if (!selection.shippingOptions?.length && originalCharge === null) {
    return {
      ...selection,
      freeShippingApplied: false,
      shippingSubsidyCents: null,
    };
  }

  return {
    shippingOptions: zeroShippingOptions(selection.shippingOptions, FREE_SHIPPING_LABEL, sessionCurrency),
    shippingChargeCents: 0,
    freeShippingApplied: true,
    shippingSubsidyCents: originalCharge,
  };
}

export function formatCheckoutShippingLine(input: {
  variant: PrintVariant;
  country: string | null | undefined;
  includeDigitalAddOn?: boolean;
  includeCardAddOn?: boolean;
  includeSecondCopy?: boolean;
  shippingAmountCents?: number | null;
  currency?: string;
  fallback?: string;
}): string {
  const merchandiseSubtotalCents = getPrintMerchandiseSubtotalCents(input);
  if (qualifiesForPrintFreeShipping(merchandiseSubtotalCents)) {
    return "Free shipping";
  }
  if (typeof input.shippingAmountCents === "number" && Number.isFinite(input.shippingAmountCents)) {
    return `${formatPrice(input.shippingAmountCents, input.currency ?? "usd")} shipping`;
  }
  return input.fallback ?? "shipping";
}
