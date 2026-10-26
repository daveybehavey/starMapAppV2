import { getPrintDigitalAddOnPrice, getPrintPricingTiers } from "@/lib/pricing";
import type { PrintVariant } from "@/lib/pricing";
import { convertCadCentsToUsdCents } from "@/lib/checkoutCurrency";
import { getPrintCatalogRow } from "@/lib/printCatalog";
import { getPrintShippingEstimate } from "@/lib/printfulShipping";

type PrintMarginGuardConfig = {
  enabled: boolean;
  minMarginCents: number;
  stripePercent: number;
  stripeFixedCents: number;
};

export type PrintMarginEstimate = {
  revenueCents: number;
  discountAmountCents: number;
  stripeFeeCents: number;
  fulfillmentCents: number;
  shippingChargeCents: number;
  shippingCostCents: number;
  productCostCents: number;
  marginCents: number;
};

export type PrintMarginEvaluation = {
  allowed: boolean;
  enforced: boolean;
  code?: "margin_estimate_unavailable" | "margin_below_threshold";
  minMarginCents: number;
  estimate: PrintMarginEstimate | null;
};

const DEFAULT_STRIPE_PERCENT = 0.029;
const DEFAULT_STRIPE_FIXED_CENTS = 30;

function parseBool(value: string | undefined, fallback: boolean) {
  if (!value || !value.trim()) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes"].includes(normalized)) return true;
  if (["0", "false", "no"].includes(normalized)) return false;
  return fallback;
}

function parseIntValue(value: string | undefined, fallback: number, minimum = 0) {
  const parsed = value ? Number.parseInt(value.trim(), 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, parsed);
}

function parseFloatValue(value: string | undefined, fallback: number, minimum = 0) {
  const parsed = value ? Number.parseFloat(value.trim()) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, parsed);
}

function getVariantProductCostCents(variant: PrintVariant): number {
  const row = getPrintCatalogRow(variant);
  return parseIntValue(process.env[row.cogsEnv], row.defaultCogsCents, 0);
}

export function getPrintMarginGuardConfig(): PrintMarginGuardConfig {
  return {
    enabled: parseBool(process.env.PRINT_MARGIN_GUARD_ENABLED, false),
    minMarginCents: parseIntValue(process.env.PRINT_MIN_MARGIN_CENTS, 0, 0),
    stripePercent: parseFloatValue(process.env.PRINT_MARGIN_STRIPE_PERCENT, DEFAULT_STRIPE_PERCENT, 0),
    stripeFixedCents: parseIntValue(process.env.PRINT_MARGIN_STRIPE_FIXED_CENTS, DEFAULT_STRIPE_FIXED_CENTS, 0),
  };
}

function estimateStripeFeeCents(revenueCents: number, config: PrintMarginGuardConfig) {
  if (!Number.isFinite(revenueCents) || revenueCents <= 0) return 0;
  return Math.round(revenueCents * config.stripePercent) + config.stripeFixedCents;
}

function buildEstimate(input: {
  variant: PrintVariant;
  shippingCountry: string;
  shippingChargeCents: number;
  revenueCents: number;
  discountAmountCents?: number;
  config: PrintMarginGuardConfig;
  extraProductCostCents?: number;
}): PrintMarginEstimate | null {
  const shippingEstimate = getPrintShippingEstimate(input.variant, input.shippingCountry);
  if (!shippingEstimate) return null;

  const productCostCents =
    getVariantProductCostCents(input.variant) + Math.max(0, input.extraProductCostCents ?? 0);
  const shippingCostCents = shippingEstimate.amountCents;
  const fulfillmentCents = productCostCents + shippingCostCents;
  const stripeFeeCents = estimateStripeFeeCents(input.revenueCents, input.config);
  const marginCents = input.revenueCents - stripeFeeCents - fulfillmentCents;

  return {
    revenueCents: input.revenueCents,
    discountAmountCents: Math.max(0, Math.round(input.discountAmountCents ?? 0)),
    stripeFeeCents,
    fulfillmentCents,
    shippingChargeCents: input.shippingChargeCents,
    shippingCostCents,
    productCostCents,
    marginCents,
  };
}

export function evaluatePrintMarginForCheckout(input: {
  variant: PrintVariant;
  shippingCountry: string | null;
  shippingChargeCents: number | null;
  includeDigitalAddOn: boolean;
  includeCardAddOn?: boolean;
  discountAmountCents?: number | null;
}): PrintMarginEvaluation {
  const config = getPrintMarginGuardConfig();
  const enforced = config.enabled && config.minMarginCents > 0;
  if (!input.shippingCountry) {
    return {
      allowed: !enforced,
      enforced,
      code: enforced ? "margin_estimate_unavailable" : undefined,
      minMarginCents: config.minMarginCents,
      estimate: null,
    };
  }

  const printTier = getPrintPricingTiers()[input.variant];
  const digitalAddOn = getPrintDigitalAddOnPrice();
  const cardTier = getPrintPricingTiers().card_4x6;
  const fallbackShippingCharge = Number.isFinite(input.shippingChargeCents ?? Number.NaN)
    ? Math.max(0, Math.round(input.shippingChargeCents ?? 0))
    : getPrintShippingEstimate(input.variant, input.shippingCountry)?.amountCents ?? 0;
  const baseRevenueCents =
    printTier.amountCents +
    (input.includeDigitalAddOn ? digitalAddOn.amountCents : 0) +
    (input.includeCardAddOn ? cardTier.amountCents : 0) +
    fallbackShippingCharge;
  const discountAmountCents = Number.isFinite(input.discountAmountCents ?? Number.NaN)
    ? Math.max(0, Math.round(input.discountAmountCents ?? 0))
    : 0;
  const revenueCents = Math.max(0, baseRevenueCents - discountAmountCents);
  const estimate = buildEstimate({
    variant: input.variant,
    shippingCountry: input.shippingCountry,
    shippingChargeCents: fallbackShippingCharge,
    revenueCents,
    discountAmountCents,
    config,
    extraProductCostCents: input.includeCardAddOn ? getVariantProductCostCents("card_4x6") : 0,
  });

  if (!estimate) {
    return {
      allowed: !enforced,
      enforced,
      code: enforced ? "margin_estimate_unavailable" : undefined,
      minMarginCents: config.minMarginCents,
      estimate: null,
    };
  }

  if (enforced && estimate.marginCents < config.minMarginCents) {
    return {
      allowed: false,
      enforced,
      code: "margin_below_threshold",
      minMarginCents: config.minMarginCents,
      estimate,
    };
  }

  return {
    allowed: true,
    enforced,
    minMarginCents: config.minMarginCents,
    estimate,
  };
}

export function evaluatePrintMarginForPaidOrder(input: {
  variant: PrintVariant;
  shippingCountry: string | null | undefined;
  amountTotalCents: number | null | undefined;
  /**
   * The session's recorded charge currency (PrintOrderRecord.currency,
   * from Stripe). amountTotalCents is denominated in THIS currency:
   * Stripe reports amount_total in the session currency, so a CAD
   * session's total is CAD cents. The guard compares revenue against
   * USD costs, so CAD revenue is normalized to USD at the 1.40
   * reference rate below before the comparison. Absent/null (legacy
   * pre-CAD records) and "usd" pass through unchanged.
   */
  currency?: string | null;
}): PrintMarginEvaluation {
  const config = getPrintMarginGuardConfig();
  const enforced = config.enabled && config.minMarginCents > 0;
  const shippingCountry = typeof input.shippingCountry === "string" ? input.shippingCountry.trim().toUpperCase() : "";
  const amountTotalCents =
    typeof input.amountTotalCents === "number" && Number.isFinite(input.amountTotalCents)
      ? Math.max(0, Math.round(input.amountTotalCents))
      : null;

  if (!shippingCountry || !amountTotalCents) {
    return {
      allowed: !enforced,
      enforced,
      code: enforced ? "margin_estimate_unavailable" : undefined,
      minMarginCents: config.minMarginCents,
      estimate: null,
    };
  }

  // Currency normalization at the guard boundary (T-FLEET-103 fix):
  // without it, a CAD session's cents are read as USD cents and the
  // margin is overstated by the full conversion gap — e.g. a CA framed
  // order discounted on the hosted Stripe page to CA$84.48 total reads
  // as US$84.48 and passes a US$10 floor with a phantom +US$19.03,
  // while the normalized revenue (CA$84.48 / 1.40 = US$60.34) leaves a
  // negative margin. The checkout-time guard cannot see hosted-page
  // discounts, so this paid-order guard is the boundary that must
  // normalize. USD sessions are byte-identical to before.
  const isCadSession =
    typeof input.currency === "string" && input.currency.trim().toLowerCase() === "cad";
  const revenueCents = isCadSession ? convertCadCentsToUsdCents(amountTotalCents) : amountTotalCents;

  const shippingEstimate = getPrintShippingEstimate(input.variant, shippingCountry);
  if (!shippingEstimate) {
    return {
      allowed: !enforced,
      enforced,
      code: enforced ? "margin_estimate_unavailable" : undefined,
      minMarginCents: config.minMarginCents,
      estimate: null,
    };
  }

  const estimate = buildEstimate({
    variant: input.variant,
    shippingCountry,
    shippingChargeCents: shippingEstimate.amountCents,
    revenueCents,
    discountAmountCents: 0,
    config,
  });

  if (!estimate) {
    return {
      allowed: !enforced,
      enforced,
      code: enforced ? "margin_estimate_unavailable" : undefined,
      minMarginCents: config.minMarginCents,
      estimate: null,
    };
  }

  if (enforced && estimate.marginCents < config.minMarginCents) {
    return {
      allowed: false,
      enforced,
      code: "margin_below_threshold",
      minMarginCents: config.minMarginCents,
      estimate,
    };
  }

  return {
    allowed: true,
    enforced,
    minMarginCents: config.minMarginCents,
    estimate,
  };
}
