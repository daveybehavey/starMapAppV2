import { createHmac, timingSafeEqual } from "node:crypto";
import { kv } from "@/lib/kv";

export const LEGACY_SUBSCRIPTION_KEY = "promotions:emails";
export const LEGACY_SENT_KEY = "promotions:coupon-sent";
export const LEGACY_FOLLOWUP_KEY = "promotions:print-tips-sent";
export const EMAIL_STATE_PREFIX = "promotions:email:";

export const PROMOTION_FOLLOWUP_STEPS = ["objection", "urgency"] as const;

export type PromotionFollowupStep = (typeof PROMOTION_FOLLOWUP_STEPS)[number];

export type PromotionFollowupHistoryEntry = {
  step: PromotionFollowupStep;
  sentAt: number;
};

export type PromotionEmailState = {
  subscribedAt: number;
  couponSentAt?: number;
  followupSentAt?: number;
  followupDueAt?: number;
  followupLastError?: string;
  followupNextStep?: PromotionFollowupStep;
  followupHistory?: PromotionFollowupHistoryEntry[];
  unsubscribedAt?: number;
  unsubscribeReason?: string;
  updatedAt: number;
  lastSource?: string;
};

export type PromotionLifecycleStepCounts = Record<PromotionFollowupStep, number>;

export type PromotionLifecycleSummary = {
  welcomeSent: number;
  legacyFollowupSent: number;
  pending: number;
  dueNow: number;
  queuedByStep: PromotionLifecycleStepCounts;
  dueByStep: PromotionLifecycleStepCounts;
  sentByStep: PromotionLifecycleStepCounts;
  completed: number;
};

const MIN_SIGNING_SECRET_LENGTH = 16;

function getSigningSecret() {
  const candidates = [
    process.env.PROMOTION_UNSUBSCRIBE_SECRET,
    process.env.REFERRAL_SIGNING_SECRET,
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_SECRET_KEY,
  ];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed && trimmed.length >= MIN_SIGNING_SECRET_LENGTH) {
      return trimmed;
    }
  }
  return null;
}

function signatureFor(email: string, secret: string) {
  return createHmac("sha256", secret)
    .update(email)
    .digest("base64url");
}

export function isValidPromotionEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizePromotionEmail(raw: unknown) {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

export function emailStateKey(email: string) {
  return `${EMAIL_STATE_PREFIX}${encodeURIComponent(email)}`;
}

export function keyNameToPromotionEmail(key: string) {
  if (!key.startsWith(EMAIL_STATE_PREFIX)) return null;
  const encoded = key.slice(EMAIL_STATE_PREFIX.length);
  try {
    const decoded = decodeURIComponent(encoded);
    return isValidPromotionEmail(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function createPromotionUnsubscribeToken(email: string) {
  const normalized = normalizePromotionEmail(email);
  if (!isValidPromotionEmail(normalized)) return null;
  const secret = getSigningSecret();
  if (!secret) return null;
  return signatureFor(normalized, secret);
}

export function verifyPromotionUnsubscribeToken(email: string, token: string) {
  const normalized = normalizePromotionEmail(email);
  const trimmedToken = token.trim();
  if (!isValidPromotionEmail(normalized) || !trimmedToken) return false;
  const secret = getSigningSecret();
  if (!secret) return false;
  const expected = signatureFor(normalized, secret);
  const givenBuffer = Buffer.from(trimmedToken);
  const expectedBuffer = Buffer.from(expected);
  if (givenBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(givenBuffer, expectedBuffer);
}

export function getPromotionUnsubscribeUrl(email: string) {
  const normalized = normalizePromotionEmail(email);
  const token = createPromotionUnsubscribeToken(normalized);
  if (!token) return null;
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://starmapco.com").replace(/\/+$/, "");
  const params = new URLSearchParams({ email: normalized, token });
  return `${siteUrl}/unsubscribe?${params.toString()}`;
}

export type PromotionSubscriberSummary = {
  total: number;
  active: number;
  unsubscribed: number;
  listComplete: boolean;
  lifecycle: PromotionLifecycleSummary;
};

function createStepCounts(): PromotionLifecycleStepCounts {
  return {
    objection: 0,
    urgency: 0,
  };
}

function buildPromotionLifecycleSummary(states: PromotionEmailState[]): PromotionLifecycleSummary {
  const queuedByStep = createStepCounts();
  const dueByStep = createStepCounts();
  const sentByStep = createStepCounts();
  let welcomeSent = 0;
  let legacyFollowupSent = 0;
  let pending = 0;
  let dueNow = 0;
  let completed = 0;
  const now = Date.now();

  for (const state of states) {
    if (state.unsubscribedAt) continue;
    if (state.couponSentAt) {
      welcomeSent += 1;
    }

    const sentSteps = new Set<PromotionFollowupStep>();
    for (const entry of state.followupHistory ?? []) {
      if (PROMOTION_FOLLOWUP_STEPS.includes(entry.step)) {
        sentSteps.add(entry.step);
      }
    }
    for (const step of sentSteps) {
      sentByStep[step] += 1;
    }

    const nextStep = state.followupNextStep;
    if (nextStep) {
      pending += 1;
      queuedByStep[nextStep] += 1;
      if (typeof state.followupDueAt === "number" && Number.isFinite(state.followupDueAt) && state.followupDueAt <= now) {
        dueNow += 1;
        dueByStep[nextStep] += 1;
      }
    }

    const hasLegacyFollowup = Boolean(state.followupSentAt) && sentSteps.size === 0;
    if (hasLegacyFollowup) {
      legacyFollowupSent += 1;
    }
    if (!nextStep && (hasLegacyFollowup || sentSteps.has("urgency"))) {
      completed += 1;
    }
  }

  return {
    welcomeSent,
    legacyFollowupSent,
    pending,
    dueNow,
    queuedByStep,
    dueByStep,
    sentByStep,
    completed,
  };
}

export function summarizePromotionEmailStates(
  states: Array<PromotionEmailState | null | undefined>,
  listComplete = true,
): PromotionSubscriberSummary {
  const validStates = states.filter((state): state is PromotionEmailState => Boolean(state));
  let active = 0;
  let unsubscribed = 0;

  for (const state of validStates) {
    if (state.unsubscribedAt) {
      unsubscribed += 1;
    } else {
      active += 1;
    }
  }

  return {
    total: validStates.length,
    active,
    unsubscribed,
    listComplete,
    lifecycle: buildPromotionLifecycleSummary(validStates),
  };
}

export async function getPromotionSubscriberSummary(limit = 500): Promise<PromotionSubscriberSummary> {
  const listed = await kv.list({ prefix: EMAIL_STATE_PREFIX, limit });
  const states = await Promise.all(
    listed.keys.map((key) => kv.get<PromotionEmailState>(key)),
  );
  return summarizePromotionEmailStates(states, listed.listComplete);
}
