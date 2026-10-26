import type Stripe from "stripe";
import {
  convertUsdShippingRateToCadCents,
  type CheckoutCurrency,
} from "@/lib/checkoutCurrency";
import {
  getMerchCadCheckoutPriceCents,
  getMerchCheckoutPriceCents,
  getMerchFamily,
  getMerchPublicDisplayLabel,
  getMerchStripePriceId,
  isMerchFamilyEnabledForCheckout,
  type MerchFamilyId,
} from "@/lib/merchCatalog";
import { MerchResolutionError, resolveMerchSelection, type ResolvedMerchVariant } from "@/lib/merchResolver";
import { fetchPrintfulV2ShippingRate } from "@/lib/printfulShippingRatesV2";

export class MerchCheckoutError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function resolveMerchForCheckout(input: {
  familyId: MerchFamilyId;
  options: { size?: string; color?: string };
}): Promise<ResolvedMerchVariant> {
  if (!isMerchFamilyEnabledForCheckout(input.familyId)) {
    throw new MerchCheckoutError("This product isn't available yet.", "merch_not_enabled", 503);
  }
  try {
    return await resolveMerchSelection({
      familyId: input.familyId,
      options: input.options,
    });
  } catch (error) {
    if (error instanceof MerchResolutionError) {
      throw new MerchCheckoutError(error.message, error.code, error.status);
    }
    throw error;
  }
}

export async function getMerchShippingOptionsForCountry(
  catalogVariantId: number,
  shippingCountry: string | null,
  currency: CheckoutCurrency = "usd",
): Promise<{
  shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] | undefined;
  shippingChargeCents: number | null;
}> {
  if (!shippingCountry) {
    return { shippingOptions: undefined, shippingChargeCents: null };
  }

  const rate = await fetchPrintfulV2ShippingRate({
    catalogVariantId,
    countryCode: shippingCountry,
  });
  if (!rate || !Number.isFinite(rate.rate)) {
    return { shippingOptions: undefined, shippingChargeCents: null };
  }

  // The Printful v2 quote is requested in USD (printfulShippingRatesV2
  // sends currency: "USD"), and the option has always been stamped in
  // the rate's own currency. A CAD session must be single-currency, so
  // for CAD the presented amount is converted at the 1.40 reference
  // rate and stamped "cad" (T-FLEET-103 design §3.4). The returned
  // shippingChargeCents stays the canonical USD charge, exactly as
  // before — it is an accounting figure, not the presented amount.
  const amountCents = Math.round(rate.rate * 100);
  const rateCurrency = (rate.currency || "USD").toLowerCase();
  const presentInCad = currency === "cad" && rateCurrency === "usd";
  const presentedAmountCents = presentInCad
    ? convertUsdShippingRateToCadCents(rate.rate)
    : amountCents;
  const presentedCurrency = presentInCad ? "cad" : rateCurrency;
  return {
    shippingOptions: [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: {
            amount: presentedAmountCents,
            currency: presentedCurrency,
          },
          display_name: "Standard shipping",
          ...(typeof rate.min_delivery_days === "number" && typeof rate.max_delivery_days === "number"
            ? {
                delivery_estimate: {
                  minimum: { unit: "business_day", value: rate.min_delivery_days },
                  maximum: { unit: "business_day", value: rate.max_delivery_days },
                },
              }
            : {}),
        },
      },
    ],
    shippingChargeCents: amountCents,
  };
}

export function buildMerchCheckoutLineItem(
  resolved: ResolvedMerchVariant,
  currency: CheckoutCurrency = "usd",
): {
  lineItem: Stripe.Checkout.SessionCreateParams.LineItem;
  promotionEstimate: { amountCents: number; priceId?: string | null };
} {
  const family = getMerchFamily(resolved.familyId);
  const label = getMerchPublicDisplayLabel(family);
  const sizeSuffix = resolved.options.size ? ` • ${resolved.options.size}` : "";
  const colorSuffix = resolved.options.color ? ` • ${resolved.options.color}` : "";
  const productData = {
    name: `Custom Star Map — ${label}${sizeSuffix}${colorSuffix}`,
    description: `${label} • Shipping address required`,
  };

  // CAD sessions always mint via price_data from the native CAD book —
  // a configured USD Stripe Price ID can never be charged in CAD
  // (T-FLEET-103 design §2.2). USD sessions are unchanged.
  if (currency === "cad") {
    const cadPriceCents = getMerchCadCheckoutPriceCents(family);
    return {
      lineItem: {
        price_data: {
          currency: "cad",
          unit_amount: cadPriceCents,
          product_data: productData,
        },
        quantity: 1,
      },
      promotionEstimate: { amountCents: cadPriceCents, priceId: null },
    };
  }

  const priceCents = getMerchCheckoutPriceCents(family);
  const priceId = getMerchStripePriceId(family);

  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = {
    ...(priceId
      ? { price: priceId }
      : {
          price_data: {
            currency: "usd",
            unit_amount: priceCents,
            product_data: productData,
          },
        }),
    quantity: 1,
  };

  return {
    lineItem,
    promotionEstimate: { amountCents: priceCents, priceId: priceId || null },
  };
}

export function applyMerchCheckoutMetadata(
  metadata: Record<string, string>,
  resolved: ResolvedMerchVariant,
): void {
  metadata.print_merch_family = resolved.familyId;
  metadata.print_merch_catalog_variant_id = String(resolved.catalogVariantId);
  if (resolved.options.size) metadata.print_merch_size = resolved.options.size;
  if (resolved.options.color) metadata.print_merch_color = resolved.options.color;
}
