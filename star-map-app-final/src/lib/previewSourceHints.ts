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
): boolean {
  if (checkoutParam === "print") return true;
  if (isWeddingPrintLandingSource(source)) return true;
  return isWeddingCommerceContext(source);
}

/** Auto-open paywall after reveal when the visitor chose a print checkout path. */
export function shouldAutoOpenEditorPrintPaywall(
  source: string | null | undefined,
  checkoutParam?: string | null,
): boolean {
  if (checkoutParam === "print") return true;
  if (
    source === "home-delivery-print-framed" ||
    source === "home-delivery-print-unframed"
  ) {
    return true;
  }
  return isWeddingPrintLandingSource(source);
}
