import "server-only";

import { randomUUID } from "node:crypto";
import { kv } from "@/lib/kv";
import { normalizeReferralCode } from "@/lib/referrals";

export type ReferralEventType =
  | "link_created"
  | "visit_recorded"
  | "visit_deduped"
  | "conversion_recorded"
  | "reward_granted"
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
