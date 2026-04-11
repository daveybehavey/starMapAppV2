export const PROMO_CODE_STORAGE_KEY = "star-map-promo-code";

export function normalizePromoCode(raw: string | null | undefined) {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,40}$/.test(normalized)) return null;
  return normalized;
}

export function readStoredPromoCode() {
  if (typeof window === "undefined") return null;
  try {
    return normalizePromoCode(window.localStorage.getItem(PROMO_CODE_STORAGE_KEY));
  } catch {
    return null;
  }
}
