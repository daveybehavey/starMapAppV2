import { getPrintDigitalAddOnPrice, getPrintPricingTiers, type PrintVariant } from "@/lib/pricing";
import { getPrintShippingEstimate } from "@/lib/printfulShipping";

type PrintMarginGuardConfig = {
  enabled: boolean;
  minMarginCents: number;
  stripePercent: number;
  stripeFixedCents: number;
  cogsUnframedCents: number;
  cogsFramedCents: number;
};

export type PrintMarginEstimate = {
  revenueCents: number;
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
const DEFAULT_PRINT_COGS_UNFRAMED_CENTS = 1300;
const DEFAULT_PRINT_COGS_FRAMED_CENTS = 5200;

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

function getVariantProductCostCents(config: PrintMarginGuardConfig, variant: PrintVariant) {
  return variant === "poster_framed" ? config.cogsFramedCents : config.cogsUnframedCents;
}

export function getPrintMarginGuardConfig(): PrintMarginGuardConfig {
  return {
    enabled: parseBool(process.env.PRINT_MARGIN_GUARD_ENABLED, false),
    minMarginCents: parseIntValue(process.env.PRINT_MIN_MARGIN_CENTS, 0, 0),
    stripePercent: parseFloatValue(process.env.PRINT_MARGIN_STRIPE_PERCENT, DEFAULT_STRIPE_PERCENT, 0),
    stripeFixedCents: parseIntValue(process.env.PRINT_MARGIN_STRIPE_FIXED_CENTS, DEFAULT_STRIPE_FIXED_CENTS, 0),
    cogsUnframedCents: parseIntValue(
      process.env.PRINT_COGS_POSTER_UNFRAMED_CENTS,
      DEFAULT_PRINT_COGS_UNFRAMED_CENTS,
      0,
    ),
    cogsFramedCents: parseIntValue(process.env.PRINT_COGS_POSTER_FRAMED_CENTS, DEFAULT_PRINT_COGS_FRAMED_CENTS, 0),
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
  config: PrintMarginGuardConfig;
}): PrintMarginEstimate | null {
  const shippingEstimate = getPrintShippingEstimate(input.variant, input.shippingCountry);
  if (!shippingEstimate) return null;

  const productCostCents = getVariantProductCostCents(input.config, input.variant);
  const shippingCostCents = shippingEstimate.amountCents;
  const fulfillmentCents = productCostCents + shippingCostCents;
  const stripeFeeCents = estimateStripeFeeCents(input.revenueCents, input.config);
  const marginCents = input.revenueCents - stripeFeeCents - fulfillmentCents;

  return {
    revenueCents: input.revenueCents,
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
  const fallbackShippingCharge = Number.isFinite(input.shippingChargeCents ?? Number.NaN)
    ? Math.max(0, Math.round(input.shippingChargeCents ?? 0))
    : getPrintShippingEstimate(input.variant, input.shippingCountry)?.amountCents ?? 0;
  const revenueCents =
    printTier.amountCents +
    (input.includeDigitalAddOn ? digitalAddOn.amountCents : 0) +
    fallbackShippingCharge;
  const estimate = buildEstimate({
    variant: input.variant,
    shippingCountry: input.shippingCountry,
    shippingChargeCents: fallbackShippingCharge,
    revenueCents,
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

export function evaluatePrintMarginForPaidOrder(input: {
  variant: PrintVariant;
  shippingCountry: string | null | undefined;
  amountTotalCents: number | null | undefined;
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
    revenueCents: amountTotalCents,
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
