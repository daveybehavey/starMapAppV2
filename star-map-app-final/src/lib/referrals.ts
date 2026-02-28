export const REFERRAL_CODE_STORAGE_KEY = "star-map-referral-code";
export const REFERRAL_ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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

type StoredReferralCode = {
  code: string;
  capturedAt: number;
};

function parseStoredReferral(raw: string | null): StoredReferralCode | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { code?: unknown; capturedAt?: unknown };
      const code = normalizeReferralCode(parsed.code);
      const capturedAt =
        typeof parsed.capturedAt === "number" && Number.isFinite(parsed.capturedAt)
          ? parsed.capturedAt
          : Number.NaN;
      if (!code || !Number.isFinite(capturedAt)) return null;
      return { code, capturedAt };
    } catch {
      return null;
    }
  }

  const code = normalizeReferralCode(trimmed);
  if (!code) return null;
  return { code, capturedAt: Date.now() };
}

export function readStoredReferralCode(now = Date.now()): string | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = parseStoredReferral(window.localStorage.getItem(REFERRAL_CODE_STORAGE_KEY));
    if (!parsed) {
      window.localStorage.removeItem(REFERRAL_CODE_STORAGE_KEY);
      return null;
    }
    if (now - parsed.capturedAt > REFERRAL_ATTRIBUTION_TTL_MS) {
      window.localStorage.removeItem(REFERRAL_CODE_STORAGE_KEY);
      return null;
    }
    const next = JSON.stringify({ code: parsed.code, capturedAt: parsed.capturedAt });
    if (window.localStorage.getItem(REFERRAL_CODE_STORAGE_KEY) !== next) {
      window.localStorage.setItem(REFERRAL_CODE_STORAGE_KEY, next);
    }
    return parsed.code;
  } catch {
    return null;
  }
}

export function writeStoredReferralCode(code: string, capturedAt = Date.now()): boolean {
  if (typeof window === "undefined") return false;
  const normalized = normalizeReferralCode(code);
  if (!normalized) return false;
  try {
    window.localStorage.setItem(
      REFERRAL_CODE_STORAGE_KEY,
      JSON.stringify({ code: normalized, capturedAt }),
    );
    return true;
  } catch {
    return false;
  }
}
