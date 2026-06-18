import type { PrintVariant } from "@/lib/printCatalog";
import { normalizeReferralAttribution, type ReferralAttribution } from "@/lib/referralAttribution";

/** Must match `REFERRAL_SOURCE_COOKIE_NAME` in referralCookie.ts (client-safe duplicate). */
const REFERRAL_SOURCE_COOKIE_NAME = "starmap_ref_src";

/** True when traffic came from a wedding money page on a print-intent CTA. */
export function isWeddingPrintLandingSource(source: string | null | undefined): boolean {
  if (!source) return false;
  const s = source.toLowerCase();
  if (!s.includes("wedding")) return false;
  return s.includes("framed") || s.includes("unframed") || s.includes("print");
}

export function isWeddingTrafficSource(source: string | null | undefined): boolean {
  if (!source) return false;
  return source.toLowerCase().includes("wedding");
}

export function isWeddingUtmCampaign(campaign: string | null | undefined): boolean {
  if (!campaign) return false;
  const c = campaign.toLowerCase();
  return c.includes("wedding") || c.includes("gift_wedding");
}

/** Preview-first wedding paths — keep digital tab and do not auto-open paywall. */
export function isNeutralWeddingPreviewSource(source: string | null | undefined): boolean {
  if (!source) return false;
  const s = source.toLowerCase();
  if (s === "wedding" || s === "sticky-wedding") return true;
  if (!s.includes("wedding")) return false;
  if (s.includes("preview") && !s.includes("framed") && !s.includes("unframed") && !s.includes("print")) {
    return true;
  }
  return false;
}

function decodeBase64UrlCookie(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  return atob(padded + "=".repeat(padLen));
}

/** Client-only: read marketing UTMs stored by UtmAttributionClient / checkout cookies. */
export function readClientMarketingAttribution(): ReferralAttribution | null {
  if (typeof document === "undefined") return null;
  const pattern = new RegExp(`(?:^|;\\s*)${REFERRAL_SOURCE_COOKIE_NAME}=([^;]*)`);
  const match = document.cookie.match(pattern);
  if (!match?.[1]) return null;
  try {
    const decoded = decodeBase64UrlCookie(decodeURIComponent(match[1].trim()));
    const parsed = JSON.parse(decoded) as {
      source?: unknown;
      medium?: unknown;
      campaign?: unknown;
      content?: unknown;
    };
    return normalizeReferralAttribution(parsed);
  } catch {
    return null;
  }
}

/** Wedding ads, landing pages, or stored wedding campaign attribution. */
export function isWeddingCommerceContext(source: string | null | undefined): boolean {
  if (isWeddingTrafficSource(source)) return true;
  const attribution = readClientMarketingAttribution();
  return isWeddingUtmCampaign(attribution?.campaign) || isWeddingTrafficSource(attribution?.source);
}

/** Default paywall to the Printed gift tab for wedding traffic and explicit print landings. */
export function shouldDefaultEditorPaywallToPrint(
  source: string | null | undefined,
  checkoutParam?: string | null,
  utmCampaign?: string | null,
): boolean {
  if (shouldAutoOpenEditorDigitalPaywall(source, checkoutParam)) return false;
  if (checkoutParam === "print") return true;
  if (source === "home-delivery-print-framed" || source === "home-delivery-print-unframed") return true;
  if (isWeddingPrintLandingSource(source)) return true;
  if (isWeddingUtmCampaign(utmCampaign)) return true;
  const attribution = readClientMarketingAttribution();
  if (isWeddingUtmCampaign(attribution?.campaign)) return true;
  if (isNeutralWeddingPreviewSource(source)) return false;
  return false;
}

/** Auto-open paywall after reveal when the visitor chose an explicit print checkout path. */
export function shouldAutoOpenEditorPrintPaywall(
  source: string | null | undefined,
  checkoutParam?: string | null,
): boolean {
  if (checkoutParam === "print") return true;
  if (source === "home-delivery-print-framed" || source === "home-delivery-print-unframed") {
    return true;
  }
  return isWeddingPrintLandingSource(source);
}

/** Auto-open paywall on the HD tab when map hub (or similar) sends explicit digital intent. */
export function isDigitalLandingSource(source: string | null | undefined): boolean {
  if (!source) return false;
  const s = source.toLowerCase();
  if (s.includes("hd-star-map") || s.includes("instant-hd")) return true;
  if (s.endsWith("-digital") || s.includes("-digital-")) return true;
  return false;
}

export function shouldAutoOpenEditorDigitalPaywall(
  source?: string | null,
  checkoutParam?: string | null,
): boolean {
  if (checkoutParam === "hd" || checkoutParam === "digital") return true;
  return isDigitalLandingSource(source);
}

export function resolvePreferredPrintVariantFromSource(
  source: string | null | undefined,
  explicitVariant: PrintVariant | null,
): PrintVariant {
  if (explicitVariant) return explicitVariant;
  if (source?.toLowerCase().includes("unframed")) return "poster_unframed";
  return "poster_framed";
}

export type EditorGiftTrafficIntent = {
  paywallIntent: "digital" | "print";
  preferredPrintVariant: PrintVariant;
  preferredIncludeDigitalAddOn: boolean;
  autoOpenPaywall: boolean;
};

/** Framed + HD bundle default for wedding / gift-wedding print intent (not unframed-only paths). */
export function resolvePreferredIncludeDigitalAddOn(params: {
  source: string | null | undefined;
  checkoutParam?: string | null;
  printVariantParam?: PrintVariant | null;
  utmCampaign?: string | null;
  explicitIncludeDigitalAddOn?: boolean;
}): boolean {
  if (params.explicitIncludeDigitalAddOn) return true;

  const sourceLower = params.source?.toLowerCase() ?? "";
  if (sourceLower.includes("unframed")) return false;
  if (params.printVariantParam === "poster_unframed") return false;

  const preferredVariant = resolvePreferredPrintVariantFromSource(
    params.source ?? null,
    params.printVariantParam ?? null,
  );
  if (preferredVariant !== "poster_framed") return false;

  if (isWeddingPrintLandingSource(params.source) && !isNeutralWeddingPreviewSource(params.source)) {
    return true;
  }

  if (!shouldDefaultEditorPaywallToPrint(params.source, params.checkoutParam, params.utmCampaign)) {
    return false;
  }

  return isWeddingTrafficSource(params.source) || isWeddingUtmCampaign(params.utmCampaign);
}

/** Wedding / gift-wedding campaign → editor paywall behavior (Block 1.1). */
export function resolveEditorGiftTrafficIntent(params: {
  source: string | null;
  checkoutParam: string | null;
  printVariantParam: PrintVariant | null;
  utmCampaign?: string | null;
  explicitIncludeDigitalAddOn?: boolean;
}): EditorGiftTrafficIntent {
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
