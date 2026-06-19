import { normalizeReferralAttribution, type ReferralAttribution } from "@/lib/referralAttribution";

/** Client-readable mirror of httpOnly `starmap_ref_src` (checkout still uses the cookie server-side). */
export const MARKETING_ATTRIBUTION_STORAGE_KEY = "starmap_mkt_attr";

export function storeClientMarketingAttribution(attribution: ReferralAttribution): void {
  if (typeof sessionStorage === "undefined") return;
  const normalized = normalizeReferralAttribution(attribution);
  if (!normalized) return;
  try {
    sessionStorage.setItem(MARKETING_ATTRIBUTION_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readStoredClientMarketingAttribution(): ReferralAttribution | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(MARKETING_ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
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
