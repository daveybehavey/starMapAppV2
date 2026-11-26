import { CAD_REFERENCE_RATE } from "@/lib/checkoutCurrency";
import { getMerchMinMarginCents } from "@/lib/merchMargin";

type CostProfile = {
  productCents: number;
  providerTaxCents: number;
  processingBps: number;
  processingFixedCents: number;
  fxBps: number;
  replacementReserveCents: number;
};

const cents = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Reviewed USD landed-cost estimates keyed by exact catalog variant; never family defaults. */
function profileFor(variantId: number): CostProfile | null {
  try {
    const profile = JSON.parse(process.env.MERCH_VARIANT_COSTS_JSON || "{}")[String(variantId)];
    const keys: Array<keyof CostProfile> = ["productCents", "providerTaxCents", "processingBps", "processingFixedCents", "fxBps", "replacementReserveCents"];
    if (!profile || !keys.every((key) => cents(profile[key]))) return null;
    if (profile.productCents <= 0 || profile.processingBps > 10000 || profile.fxBps > 10000) return null;
    return profile;
  } catch { return null; }
}

export type MerchContributionInput = {
  catalogVariantId?: number;
  amountTotalCents?: number | null;
  taxCents?: number | null;
  currency?: string | null;
  shippingCostUsdCents?: number | null;
  /** Actual provider total replaces product + shipping + provider tax before confirmation. */
  providerTotalUsdCents?: number;
};

export function evaluateMerchContribution(input: MerchContributionInput): {
  allowed: boolean;
  code: "merch_margin_ok" | "merch_margin_estimate_unavailable" | "merch_margin_below_minimum";
  minMarginCents: number;
  contributionUsdCents?: number;
} {
  const minMarginCents = getMerchMinMarginCents();
  const unavailable = { allowed: false, code: "merch_margin_estimate_unavailable" as const, minMarginCents };
  const profile = input.catalogVariantId ? profileFor(input.catalogVariantId) : null;
  if (!profile || !cents(input.amountTotalCents) || !cents(input.taxCents) ||
      input.taxCents > input.amountTotalCents || !cents(input.shippingCostUsdCents) ||
      !["usd", "cad"].includes(input.currency || "")) return unavailable;
  if (input.providerTotalUsdCents !== undefined && !cents(input.providerTotalUsdCents)) return unavailable;
  const rate = input.currency === "cad" ? CAD_REFERENCE_RATE : 1;
  const netRevenue = Math.floor((input.amountTotalCents - input.taxCents) / rate);
  const grossRevenue = Math.ceil(input.amountTotalCents / rate);
  const fees = Math.ceil(grossRevenue * (profile.processingBps + (input.currency === "cad" ? profile.fxBps : 0)) / 10000) + profile.processingFixedCents;
  const providerCost = input.providerTotalUsdCents ?? (profile.productCents + profile.providerTaxCents + input.shippingCostUsdCents);
  const contributionUsdCents = netRevenue - providerCost - fees - profile.replacementReserveCents;
  return { allowed: contributionUsdCents >= minMarginCents, code: contributionUsdCents >= minMarginCents ? "merch_margin_ok" : "merch_margin_below_minimum", minMarginCents, contributionUsdCents };
}
