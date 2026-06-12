/**
 * Pure preview-source helpers for Node unit tests. Keep in sync with previewSourceHints.ts.
 */

/** @param {string | null | undefined} source */
export function isWeddingPrintLandingSource(source) {
  if (!source) return false;
  const s = source.toLowerCase();
  if (!s.includes("wedding")) return false;
  return s.includes("framed") || s.includes("unframed") || s.includes("print");
}

/** @param {string | null | undefined} source */
export function isNeutralWeddingPreviewSource(source) {
  if (!source) return false;
  const s = source.toLowerCase();
  if (s === "wedding" || s === "sticky-wedding") return true;
  if (!s.includes("wedding")) return false;
  if (s.includes("preview") && !s.includes("framed") && !s.includes("unframed") && !s.includes("print")) {
    return true;
  }
  return false;
}

/** @param {string | null | undefined} campaign */
export function isWeddingUtmCampaign(campaign) {
  if (!campaign) return false;
  const c = campaign.toLowerCase();
  return c.includes("wedding") || c.includes("gift_wedding");
}

/**
 * @param {string | null | undefined} source
 * @param {string | null | undefined} [checkoutParam]
 * @param {string | null | undefined} [utmCampaign]
 */
export function shouldDefaultEditorPaywallToPrint(source, checkoutParam, utmCampaign) {
  if (checkoutParam === "print") return true;
  if (source === "home-delivery-print-framed" || source === "home-delivery-print-unframed") return true;
  if (isWeddingPrintLandingSource(source)) return true;
  if (isNeutralWeddingPreviewSource(source)) return false;
  if (isWeddingUtmCampaign(utmCampaign)) return true;
  return false;
}

/**
 * @param {string | null | undefined} source
 * @param {string | null | undefined} [checkoutParam]
 */
export function shouldAutoOpenEditorPrintPaywall(source, checkoutParam) {
  if (checkoutParam === "print") return true;
  if (source === "home-delivery-print-framed" || source === "home-delivery-print-unframed") return true;
  return isWeddingPrintLandingSource(source);
}

/**
 * @param {string | null | undefined} source
 * @param {string | null | undefined} explicitVariant
 */
export function resolvePreferredPrintVariantFromSource(source, explicitVariant) {
  if (explicitVariant) return explicitVariant;
  if (source?.toLowerCase().includes("unframed")) return "poster_unframed";
  return "poster_framed";
}

/**
 * @param {{
 *   source: string | null;
 *   checkoutParam: string | null;
 *   printVariantParam: string | null;
 *   utmCampaign?: string | null;
 * }} params
 */
export function resolveEditorGiftTrafficIntent(params) {
  const { source, checkoutParam, printVariantParam, utmCampaign } = params;
  const defaultToPrint = shouldDefaultEditorPaywallToPrint(source, checkoutParam, utmCampaign);
  return {
    paywallIntent: defaultToPrint ? "print" : "digital",
    preferredPrintVariant: resolvePreferredPrintVariantFromSource(source, printVariantParam),
    autoOpenPaywall: shouldAutoOpenEditorPrintPaywall(source, checkoutParam),
  };
}
