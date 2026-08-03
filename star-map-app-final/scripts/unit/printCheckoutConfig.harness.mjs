/** Keep in sync with src/lib/printCheckoutConfig.ts auto-confirm disclosure helpers. */

export function isPrintfulAutoConfirmEnabled(env = process.env) {
  const raw = (env.PRINTFUL_AUTO_CONFIRM ?? env.NEXT_PUBLIC_PRINTFUL_AUTO_CONFIRM ?? "true").trim();
  return /^(1|true|yes)$/i.test(raw);
}

export function getPrintProductionReviewDisclosure(env = process.env) {
  return isPrintfulAutoConfirmEnabled(env)
    ? "Production begins after payment once your order is submitted to our print partner."
    : "Physical orders are reviewed before production while manual approval mode is enabled.";
}

export function getPrintProductionReviewTrustPoint(env = process.env) {
  return isPrintfulAutoConfirmEnabled(env)
    ? "Production begins after payment once the order is submitted for fulfillment."
    : "Physical orders stay in manual review before production starts.";
}

export function getPrintAddOnTimelinePoint(env = process.env) {
  return isPrintfulAutoConfirmEnabled(env)
    ? "If you add print, the physical order is submitted for fulfillment after payment."
    : "If you add print, the physical order is created for manual review before production starts.";
}
