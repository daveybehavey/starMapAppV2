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
  /**
   * S93-1 item 4 (fix round): checkout session ids whose aggregate
   * delta is already included in `conversions`/`rewardsGranted`,
   * recorded in the SAME write that applies the delta — the
   * application and its evidence are atomic, so a bookkeeping resume
   * observes the marker and never applies the delta twice. Only
   * in-flight bookkeeping resumes (and reversals of them) consult
   * it — terminal records short-circuit before bookkeeping.
   *
   * Fix round 2 (Codex P2, PR #471): the list is deliberately NOT
   * truncated. The single-write atomicity above is the only
   * atomicity this store offers, so the evidence must live exactly
   * as long as the counters it protects; the earlier 50-entry bound
   * evicted the marker of a conversion whose terminal write was
   * still outstanding, and its retry applied the delta a second
   * time. The cost is one session id (~35 bytes) per conversion on
   * this record for the life of the referral code — far under the
   * KV value ceiling for any single code's plausible total.
   */
  recentConversionSessionIds?: string[];
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

/**
 * S94-1 F2: the session's OWN generated referral code (the code this
 * buyer shares), stored in its own record. The link route used to
 * persist the generated code by rewriting the session record from a
 * stale snapshot — a whole-record write that could republish
 * pre-revocation/pre-debit state. This key is deliberately separate
 * from the settlement-metadata sidecar: that record's referralCode is
 * the ATTRIBUTION code (the code this buyer used at checkout), a
 * different field with different semantics, and the two must never be
 * merged into one another. Legacy codes written inline on the session
 * record before this change keep resolving through the merged view.
 */
export function referralSessionCodeKey(sessionId: string) {
  return `referral:session-code:v1:${sessionId}`;
}

export type ReferralSessionCodeRecord = {
  code: string;
  createdAt: number;
};

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
