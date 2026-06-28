/** Keep in sync with src/lib/printFreeShipping.ts (checkout waive logic). */

const DEFAULT_THRESHOLD_CENTS = 10_000;

export function parseThresholdCents(raw) {
  if (!raw || !String(raw).trim()) return null;
  const parsed = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function qualifiesForPrintFreeShipping(merchandiseSubtotalCents, thresholdCents = DEFAULT_THRESHOLD_CENTS) {
  return merchandiseSubtotalCents >= thresholdCents;
}

export function zeroShippingCharge(shippingChargeCents) {
  return {
    shippingChargeCents: 0,
    freeShippingApplied: true,
    shippingSubsidyCents:
      typeof shippingChargeCents === "number" && Number.isFinite(shippingChargeCents)
        ? Math.max(0, Math.round(shippingChargeCents))
        : null,
  };
}

export function applyPrintFreeShippingToCheckout(selection, merchandiseSubtotalCents, thresholdCents = DEFAULT_THRESHOLD_CENTS) {
  if (!qualifiesForPrintFreeShipping(merchandiseSubtotalCents, thresholdCents)) {
    return { ...selection, freeShippingApplied: false, shippingSubsidyCents: null };
  }
  const originalCharge =
    typeof selection.shippingChargeCents === "number" && Number.isFinite(selection.shippingChargeCents)
      ? Math.max(0, Math.round(selection.shippingChargeCents))
      : null;
  if (!selection.shippingOptions?.length && originalCharge === null) {
    return { ...selection, freeShippingApplied: false, shippingSubsidyCents: null };
  }
  return {
    shippingOptions: selection.shippingOptions,
    ...zeroShippingCharge(originalCharge),
  };
}
