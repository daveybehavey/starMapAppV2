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
export function isWeddingTrafficSource(source) {
  if (!source) return false;
  return source.toLowerCase().includes("wedding");
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

/** @param {string | null | undefined} source */
export function isDigitalLandingSource(source) {
  if (!source) return false;
  const s = source.toLowerCase();
  if (s.includes("hd-star-map") || s.includes("instant-hd")) return true;
  if (s.endsWith("-digital") || s.includes("-digital-")) return true;
  return false;
}

/**
 * @param {string | null | undefined} [source]
 * @param {string | null | undefined} [checkoutParam]
 */
export function shouldAutoOpenEditorDigitalPaywall(source, checkoutParam) {
  if (checkoutParam === "hd" || checkoutParam === "digital") return true;
  return isDigitalLandingSource(source);
}

/**
 * @param {string | null | undefined} source
 * @param {string | null | undefined} [checkoutParam]
 * @param {string | null | undefined} [utmCampaign]
 */
export function shouldDefaultEditorPaywallToPrint(source, checkoutParam, utmCampaign) {
  if (shouldAutoOpenEditorDigitalPaywall(source, checkoutParam)) return false;
  if (checkoutParam === "print") return true;
  if (source === "home-delivery-print-framed" || source === "home-delivery-print-unframed") return true;
  if (isWeddingPrintLandingSource(source)) return true;
  if (isWeddingUtmCampaign(utmCampaign)) return true;
  if (isNeutralWeddingPreviewSource(source)) return false;
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
 *   source: string | null | undefined;
 *   checkoutParam?: string | null;
 *   printVariantParam?: string | null;
 *   utmCampaign?: string | null;
 *   explicitIncludeDigitalAddOn?: boolean;
 * }} params
 */
export function resolvePreferredIncludeDigitalAddOn(params) {
  if (params.explicitIncludeDigitalAddOn) return true;

  const sourceLower = params.source?.toLowerCase() ?? "";
  if (sourceLower.includes("unframed")) return false;
  if (params.printVariantParam === "poster_unframed") return false;

  const preferredVariant = resolvePreferredPrintVariantFromSource(params.source ?? null, params.printVariantParam ?? null);
  if (preferredVariant !== "poster_framed") return false;

  if (isWeddingPrintLandingSource(params.source) && !isNeutralWeddingPreviewSource(params.source)) {
    return true;
  }

  if (!shouldDefaultEditorPaywallToPrint(params.source, params.checkoutParam, params.utmCampaign)) {
    return false;
  }

  return isWeddingTrafficSource(params.source) || isWeddingUtmCampaign(params.utmCampaign);
}

/**
 * @param {{
 *   source: string | null;
 *   checkoutParam: string | null;
 *   printVariantParam: string | null;
 *   utmCampaign?: string | null;
 *   explicitIncludeDigitalAddOn?: boolean;
 * }} params
 */
export function resolveEditorGiftTrafficIntent(params) {
  const { source, checkoutParam, printVariantParam, utmCampaign, explicitIncludeDigitalAddOn } = params;
  const defaultToPrint = shouldDefaultEditorPaywallToPrint(source, checkoutParam, utmCampaign);
  const digitalAutoOpen = shouldAutoOpenEditorDigitalPaywall(source, checkoutParam);
  const printAutoOpen = shouldAutoOpenEditorPrintPaywall(source, checkoutParam);

  return {
    paywallIntent: digitalAutoOpen ? "digital" : defaultToPrint ? "print" : "digital",
    preferredPrintVariant: resolvePreferredPrintVariantFromSource(source, printVariantParam),
    preferredIncludeDigitalAddOn: resolvePreferredIncludeDigitalAddOn({
      source,
      checkoutParam,
      printVariantParam,
      utmCampaign,
      explicitIncludeDigitalAddOn,
    }),
    autoOpenPaywall: digitalAutoOpen || printAutoOpen,
  };
}
