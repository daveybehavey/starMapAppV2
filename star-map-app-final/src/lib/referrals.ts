export const REFERRAL_CODE_STORAGE_KEY = "star-map-referral-code";

export type ReferralRecord = {
  code: string;
  sessionId: string;
  createdAt: number;
  visits: number;
  conversions: number;
  rewardsGranted: number;
  lastConvertedAt?: number;
};

export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,24}$/.test(normalized)) return null;
  return normalized;
}

export function createReferralCode() {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now()}${Math.random().toString(16).slice(2)}`;
  return random.slice(0, 10).toUpperCase();
}

export function referralKey(code: string) {
  return `referral:${code}`;
}

export function referralRewardedKey(sessionId: string) {
  return `referral:rewarded:${sessionId}`;
}
