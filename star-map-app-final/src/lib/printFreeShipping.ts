import type { Stripe } from "stripe";
import { getPrintDigitalAddOnPrice, getPrintPricingTiers, formatPrice } from "./pricing";
import type { PrintVariant } from "./printCatalog";

const DEFAULT_THRESHOLD_CENTS = 10_000;
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
}): number {
  const tiers = getPrintPricingTiers();
  let total = tiers[input.variant].amountCents;
  if (input.includeDigitalAddOn) total += getPrintDigitalAddOnPrice().amountCents;
  if (input.includeCardAddOn) total += tiers.card_4x6.amountCents;
  return total;
}

export function qualifiesForPrintFreeShipping(merchandiseSubtotalCents: number): boolean {
  const threshold = getPrintFreeShippingThresholdCents();
  if (!threshold) return false;
  return merchandiseSubtotalCents >= threshold;
}

export function formatPrintFreeShippingThresholdLabel(currency = "usd"): string {
  const threshold = getPrintFreeShippingThresholdCents();
  if (!threshold) return "";
  return formatPrice(threshold, currency);
}

/** Marketing copy — must match checkout behavior. */
export function getPrintFreeShippingOfferLine(currency = "usd"): string | null {
  const thresholdLabel = formatPrintFreeShippingThresholdLabel(currency);
  if (!thresholdLabel) return null;
  return `Free standard shipping on print orders ${thresholdLabel}+ (merchandise before shipping).`;
}

export function getPrintFreeShippingQualifyingHint(currency = "usd"): string | null {
  const thresholdLabel = formatPrintFreeShippingThresholdLabel(currency);
  if (!thresholdLabel) return null;
  return `Framed print + HD digital (${formatPrice(10_600, currency)}) qualifies for free shipping.`;
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
): Stripe.Checkout.SessionCreateParams.ShippingOption[] | undefined {
  if (!options?.length) return options;
  const currency = (process.env.CURRENCY ?? process.env.NEXT_PUBLIC_CURRENCY ?? "usd").trim().toLowerCase();
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
    shippingOptions: zeroShippingOptions(selection.shippingOptions, FREE_SHIPPING_LABEL),
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
