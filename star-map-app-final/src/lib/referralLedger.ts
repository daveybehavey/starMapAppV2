import "server-only";

import { randomUUID } from "node:crypto";
import { kv } from "@/lib/kv";
import { normalizeReferralCode } from "@/lib/referrals";

export type ReferralEventType =
  | "link_created"
  | "visit_recorded"
  | "visit_deduped"
  | "conversion_recorded"
  | "conversion_reversed"
  | "reward_granted"
  | "reward_reversed"
  | "reward_skipped";

export type ReferralEvent = {
  id: string;
  code: string;
  type: ReferralEventType;
  createdAt: number;
  details?: Record<string, string | number | boolean | null | undefined>;
};

const REFERRAL_EVENT_HISTORY_LIMIT = 200;

function referralEventsKey(code: string) {
  return `referral:events:${code}`;
}

function normalizeDetails(
  details?: Record<string, unknown>,
): Record<string, string | number | boolean | null | undefined> | undefined {
  if (!details) return undefined;
  const next: Record<string, string | number | boolean | null | undefined> = {};
  for (const [key, value] of Object.entries(details)) {
    if (value === null) {
      next[key] = null;
      continue;
    }
    if (value === undefined) {
      next[key] = undefined;
      continue;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      next[key] = value;
    }
  }
  return Object.keys(next).length ? next : undefined;
}

export async function appendReferralEvent(input: {
  code: string;
  type: ReferralEventType;
  details?: Record<string, unknown>;
  createdAt?: number;
  eventId?: string;
}) {
  const normalizedCode = normalizeReferralCode(input.code);
  if (!normalizedCode) return null;

  const event: ReferralEvent = {
    id: input.eventId?.trim() || randomUUID(),
    code: normalizedCode,
    type: input.type,
    createdAt: Math.max(0, Math.floor(input.createdAt ?? Date.now())),
    details: normalizeDetails(input.details),
  };

  const key = referralEventsKey(normalizedCode);
  const existing = (await kv.get<ReferralEvent[]>(key)) ?? [];
  const next = [event, ...existing.filter((entry) => entry.id !== event.id)].slice(
    0,
    REFERRAL_EVENT_HISTORY_LIMIT,
  );
  await kv.set(key, next);
  return event;
}

export async function getReferralEvents(code: string, limit = 20) {
  const normalizedCode = normalizeReferralCode(code);
  if (!normalizedCode) return [];
  const existing = (await kv.get<ReferralEvent[]>(referralEventsKey(normalizedCode))) ?? [];
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  return existing.slice(0, safeLimit);
}

/**
 * S94-1 F7: the reward-cap count must not depend on the display feed.
 * The feed is a bounded newest-first log (200 stored, 50 per read), so
 * a referrer's older reward_granted entries fall out of the counted
 * slice long before they leave the 24h/30d cap windows under any
 * realistic event volume (visits/conversions share the same feed).
 * Grants are therefore ALSO recorded in this dedicated per-code
 * ledger, which holds nothing but reward_granted entries and prunes
 * only by age (31 days — the widest cap window plus margin), never by
 * count. Entries are keyed by the same deterministic event id as the
 * feed append, so the union count below dedupes by id.
 */
const REFERRAL_REWARD_GRANT_RETENTION_MS = 31 * 24 * 60 * 60 * 1000;

function referralRewardGrantsKey(code: string) {
  return `referral:reward-grants:${code}`;
}

export async function appendReferralRewardGrant(input: {
  code: string;
  eventId: string;
  createdAt: number;
  details?: Record<string, unknown>;
}) {
  const normalizedCode = normalizeReferralCode(input.code);
  if (!normalizedCode) return null;

  const event: ReferralEvent = {
    id: input.eventId.trim(),
    code: normalizedCode,
    type: "reward_granted",
    createdAt: Math.max(0, Math.floor(input.createdAt)),
    details: normalizeDetails(input.details),
  };

  const key = referralRewardGrantsKey(normalizedCode);
  const existing = (await kv.get<ReferralEvent[]>(key)) ?? [];
  const cutoff = event.createdAt - REFERRAL_REWARD_GRANT_RETENTION_MS;
  const next = [
    event,
    ...existing.filter((entry) => entry.id !== event.id && entry.createdAt >= cutoff),
  ];
  await kv.set(key, next);
  return event;
}

export async function countRecentReferralRewardGrants(
  code: string,
  windowMs: number,
  now = Date.now(),
) {
  const normalizedCode = normalizeReferralCode(code);
  if (!normalizedCode) return 0;
  const windowStart = now - windowMs;
  const seen = new Set<string>();
  let count = 0;
  const consider = (event: ReferralEvent) => {
    if (event.type !== "reward_granted") return;
    if (event.createdAt < windowStart) return;
    if (seen.has(event.id)) return;
    seen.add(event.id);
    count += 1;
  };
  // Read the raw feed storage, NOT getReferralEvents: its 50-entry
  // read clamp is a display concern and must not bound cap evidence.
  const feed = (await kv.get<ReferralEvent[]>(referralEventsKey(normalizedCode))) ?? [];
  feed.forEach(consider);
  const grants = (await kv.get<ReferralEvent[]>(referralRewardGrantsKey(normalizedCode))) ?? [];
  grants.forEach(consider);
  return count;
}
