import "server-only";

import { kv } from "@/lib/kv";
import type { ReferralEvent } from "@/lib/referralLedger";

type ReferralDashboardBucket = {
  value: string;
  count: number;
};

type ReferralDashboardReferrer = {
  code: string;
  conversions: number;
  rewardsGranted: number;
  rewardSkips: number;
};

export type ReferralDashboard = {
  generatedAt: string;
  days: number;
  totalCodes: number;
  lastNDays: {
    conversions: number;
    conversionReversals: number;
    rewardsGrantedCredits: number;
    rewardReversals: number;
    rewardSkips: number;
  };
  topSkipReasons: ReferralDashboardBucket[];
  topOfferVariants: ReferralDashboardBucket[];
  topReferrers: ReferralDashboardReferrer[];
};

const REFERRAL_EVENTS_PREFIX = "referral:events:";

function incrementBucket(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function toSortedBuckets(map: Map<string, number>, limit = 5): ReferralDashboardBucket[] {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function extractCodeFromEventsKey(key: string): string | null {
  if (!key.startsWith(REFERRAL_EVENTS_PREFIX)) return null;
  const code = key.slice(REFERRAL_EVENTS_PREFIX.length).trim().toUpperCase();
  return code || null;
}

function normalizeDetailValue(raw: unknown, fallback: string) {
  if (typeof raw !== "string") return fallback;
  const value = raw.trim().toLowerCase();
  return value || fallback;
}

function readRewardCredits(raw: unknown) {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.floor(raw));
}

export async function getReferralDashboard(days = 14): Promise<ReferralDashboard> {
  const safeDays = Math.max(1, Math.min(90, Math.floor(days)));
  const now = Date.now();
  const windowStart = now - safeDays * 24 * 60 * 60 * 1000;
  const eventKeys: string[] = [];

  let cursor: string | undefined;
  do {
    const result = await kv.list({ prefix: REFERRAL_EVENTS_PREFIX, cursor, limit: 1000 });
    for (const key of result.keys) {
      if (key.startsWith(REFERRAL_EVENTS_PREFIX)) {
        eventKeys.push(key);
      }
    }
    cursor = result.listComplete ? undefined : result.cursor ?? undefined;
  } while (cursor);

  const lastNDays = {
    conversions: 0,
    conversionReversals: 0,
    rewardsGrantedCredits: 0,
    rewardReversals: 0,
    rewardSkips: 0,
  };
  const skipReasonBuckets = new Map<string, number>();
  const offerVariantBuckets = new Map<string, number>();
  const referrerBuckets = new Map<string, { conversions: number; rewardsGranted: number; rewardSkips: number }>();

  for (const key of eventKeys) {
    const code = extractCodeFromEventsKey(key);
    if (!code) continue;
    const events = (await kv.get<ReferralEvent[]>(key)) ?? [];
    const referrer = referrerBuckets.get(code) ?? { conversions: 0, rewardsGranted: 0, rewardSkips: 0 };

    for (const event of events) {
      if (!event || typeof event.createdAt !== "number" || event.createdAt < windowStart) {
        continue;
      }
      if (event.type === "conversion_recorded") {
        lastNDays.conversions += 1;
        referrer.conversions += 1;
        const offerVariant = normalizeDetailValue(event.details?.offerVariant, "unspecified");
        incrementBucket(offerVariantBuckets, offerVariant);
        continue;
      }
      if (event.type === "conversion_reversed") {
        lastNDays.conversionReversals += 1;
        continue;
      }
      if (event.type === "reward_granted") {
        const rewardGranted = readRewardCredits(event.details?.rewardGranted);
        lastNDays.rewardsGrantedCredits += rewardGranted;
        referrer.rewardsGranted += rewardGranted;
        continue;
      }
      if (event.type === "reward_reversed") {
        lastNDays.rewardReversals += 1;
        continue;
      }
      if (event.type === "reward_skipped") {
        lastNDays.rewardSkips += 1;
        referrer.rewardSkips += 1;
        const reason = normalizeDetailValue(event.details?.reason, "unknown");
        incrementBucket(skipReasonBuckets, reason);
      }
    }

    referrerBuckets.set(code, referrer);
  }

  const topReferrers = Array.from(referrerBuckets.entries())
    .map(([code, stats]) => ({
      code,
      conversions: stats.conversions,
      rewardsGranted: stats.rewardsGranted,
      rewardSkips: stats.rewardSkips,
    }))
    .filter((entry) => entry.conversions > 0 || entry.rewardsGranted > 0 || entry.rewardSkips > 0)
    .sort((a, b) => b.conversions - a.conversions || b.rewardsGranted - a.rewardsGranted || a.code.localeCompare(b.code))
    .slice(0, 5);

  return {
    generatedAt: new Date(now).toISOString(),
    days: safeDays,
    totalCodes: eventKeys.length,
    lastNDays,
    topSkipReasons: toSortedBuckets(skipReasonBuckets),
    topOfferVariants: toSortedBuckets(offerVariantBuckets),
    topReferrers,
  };
}
