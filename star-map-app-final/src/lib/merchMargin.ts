import { getMerchFamily, type MerchFamilyId } from "@/lib/merchCatalog";

function parsePositiveInt(raw: string | undefined) {
  const parsed = raw ? Number.parseInt(raw.trim(), 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getMerchMinMarginCents() {
  const fallback = 600;
  const parsed = parsePositiveInt(process.env.MERCH_MIN_MARGIN_CENTS);
  return parsed ?? fallback;
}

export function getMerchCogsCents(familyId: MerchFamilyId) {
  const family = getMerchFamily(familyId);
  const parsed = parsePositiveInt(process.env[family.cogsEnv]);
  return parsed ?? family.defaultCogsCents;
}

export function evaluateMerchMarginForPaidOrder(input: {
  familyId: MerchFamilyId;
  amountTotalCents: number | null | undefined;
  shippingChargeCents: number | null | undefined;
}): { allowed: true } | { allowed: false; code: "merch_margin_below_minimum" | "merch_margin_estimate_unavailable"; minMarginCents: number } {
  const minMarginCents = getMerchMinMarginCents();
  const cogs = getMerchCogsCents(input.familyId);
  const total = input.amountTotalCents;
  const ship = input.shippingChargeCents;
  if (typeof total !== "number" || !Number.isFinite(total) || typeof ship !== "number" || !Number.isFinite(ship)) {
    return { allowed: false, code: "merch_margin_estimate_unavailable", minMarginCents };
  }

  // Conservative definition: require (total - shipping - cogs) >= minMargin
  const margin = total - ship - cogs;
  if (margin < minMarginCents) {
    return { allowed: false, code: "merch_margin_below_minimum", minMarginCents };
  }
  return { allowed: true };
}

