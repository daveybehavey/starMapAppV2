/**
 * Harness mirroring trusted checkout classification KV rules from src/lib/funnel.ts.
 * Kept in lockstep via source assertions in the companion test file.
 */
import { kv } from "../../src/lib/kv.ts";

export const CHECKOUT_CLASSIFICATION_SOURCES = [
  "checkout_api_print_post",
  "checkout_api_digital_post",
  "checkout_api_print_get",
  "checkout_api_digital_get",
];

export const CHECKOUT_CLASSIFICATION_PLANS = [
  "single",
  "pack3",
  "subscription",
  "poster_framed",
  "poster_unframed",
  "canvas_wrap",
  "mug_11oz",
  "card_4x6",
];

export const CHECKOUT_CLASSIFICATION_HANDOFFS = ["browser", "missing"];

export const CHECKOUT_CLASSIFICATION_STEPS = [
  "checkout_request_received",
  "checkout_session_created",
];

export const CHECKOUT_CLASSIFICATION_TOTAL_RETENTION_DAYS = 180;
export const CHECKOUT_CLASSIFICATION_KV_PREFIX = "funnel:checkout_class";

const DAILY_TTL_SECONDS = 400 * 24 * 60 * 60;
const DIMENSION_TTL_SECONDS = CHECKOUT_CLASSIFICATION_TOTAL_RETENTION_DAYS * 24 * 60 * 60;

function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function resolveOccurredAt(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : new Date();
  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : new Date();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : new Date();
  }
  return new Date();
}

function normalizeDimension(input, max = 48) {
  if (!input) return null;
  const cleaned = String(input)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max);
  return cleaned || null;
}

/** Presence-only: browser|missing. Raw tokens must never pass. */
export function normalizeCheckoutHandoff(input) {
  if (!input) return null;
  const cleaned = String(input).trim().toLowerCase();
  if (cleaned === "browser" || cleaned === "missing") return cleaned;
  return null;
}

/** Legacy keys — must not be used for trusted classification totals/reads. */
export function legacySourceKey(step, source) {
  return `funnel:source:${step}:${source}`;
}

export function legacyPlanKey(step, plan) {
  return `funnel:plan:${step}:${plan}`;
}

export function trustedCheckoutSourceKey(step, source) {
  return `${CHECKOUT_CLASSIFICATION_KV_PREFIX}:source:${step}:${source}`;
}

export function trustedCheckoutSourceDailyKey(date, step, source) {
  return `${CHECKOUT_CLASSIFICATION_KV_PREFIX}:source_daily:${date}:${step}:${source}`;
}

export function trustedCheckoutPlanKey(step, plan) {
  return `${CHECKOUT_CLASSIFICATION_KV_PREFIX}:plan:${step}:${plan}`;
}

export function trustedCheckoutPlanDailyKey(date, step, plan) {
  return `${CHECKOUT_CLASSIFICATION_KV_PREFIX}:plan_daily:${date}:${step}:${plan}`;
}

export function trustedCheckoutHandoffKey(step, handoff) {
  return `${CHECKOUT_CLASSIFICATION_KV_PREFIX}:handoff:${step}:${handoff}`;
}

export function trustedCheckoutHandoffDailyKey(date, step, handoff) {
  return `${CHECKOUT_CLASSIFICATION_KV_PREFIX}:handoff_daily:${date}:${step}:${handoff}`;
}

function clampDays(days) {
  if (!Number.isFinite(days)) return 14;
  return Math.min(60, Math.max(1, Math.floor(days)));
}

function buildDateRange(days) {
  const resolvedDays = clampDays(days);
  const out = [];
  const now = new Date();
  for (let i = resolvedDays - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    out.push(utcDateKey(d));
  }
  return out;
}

function isCheckoutClassificationStep(step) {
  return CHECKOUT_CLASSIFICATION_STEPS.includes(step);
}

function isAllowlistedCheckoutSource(source) {
  return CHECKOUT_CLASSIFICATION_SOURCES.includes(source);
}

function isAllowlistedCheckoutPlan(plan) {
  return CHECKOUT_CLASSIFICATION_PLANS.includes(plan);
}

export function isProtectedCheckoutClassificationWrite(input) {
  if (!isCheckoutClassificationStep(input.step)) return false;
  if (input.handoff) return true;
  if (input.source && isAllowlistedCheckoutSource(input.source)) return true;
  if (input.plan && isAllowlistedCheckoutPlan(input.plan)) return true;
  return false;
}

/**
 * Mirrors recordFunnelStep classification gating + clean namespace from funnel.ts.
 */
export async function recordFunnelStepMirror(input) {
  const source = normalizeDimension(input.source);
  const plan = normalizeDimension(input.plan);
  const handoff = normalizeCheckoutHandoff(input.handoff);
  const today = utcDateKey(resolveOccurredAt(input.occurredAt));
  const trusted = input.trustedCheckoutClassification === true;
  const classStep = isCheckoutClassificationStep(input.step);
  const tasks = [
    kv.incr(`funnel:total:${input.step}`, 1),
    kv.incr(`funnel:daily:${today}:${input.step}`, 1, { ex: DAILY_TTL_SECONDS }),
  ];

  if (source) {
    const protectedSource = classStep && isAllowlistedCheckoutSource(source);
    if (protectedSource) {
      if (trusted) {
        tasks.push(
          kv.incr(trustedCheckoutSourceKey(input.step, source), 1, { ex: DIMENSION_TTL_SECONDS }),
        );
        tasks.push(
          kv.incr(trustedCheckoutSourceDailyKey(today, input.step, source), 1, {
            ex: DAILY_TTL_SECONDS,
          }),
        );
      }
    } else {
      tasks.push(kv.incr(legacySourceKey(input.step, source), 1, { ex: DIMENSION_TTL_SECONDS }));
    }
  }
  if (plan) {
    const protectedPlan = classStep && isAllowlistedCheckoutPlan(plan);
    if (protectedPlan) {
      if (trusted) {
        tasks.push(kv.incr(trustedCheckoutPlanKey(input.step, plan), 1, { ex: DIMENSION_TTL_SECONDS }));
        tasks.push(
          kv.incr(trustedCheckoutPlanDailyKey(today, input.step, plan), 1, { ex: DAILY_TTL_SECONDS }),
        );
      }
    } else {
      tasks.push(kv.incr(legacyPlanKey(input.step, plan), 1, { ex: DIMENSION_TTL_SECONDS }));
    }
  }
  if (handoff && trusted && classStep) {
    tasks.push(kv.incr(trustedCheckoutHandoffKey(input.step, handoff), 1, { ex: DIMENSION_TTL_SECONDS }));
    tasks.push(
      kv.incr(trustedCheckoutHandoffDailyKey(today, input.step, handoff), 1, { ex: DAILY_TTL_SECONDS }),
    );
  }
  await Promise.all(tasks);
}

export async function recordTrustedCheckoutClassificationStep(input) {
  await recordFunnelStepMirror({
    ...input,
    trustedCheckoutClassification: true,
  });
}

async function readDimensionCount(input) {
  const uniqueDates = Array.from(
    new Set([...input.lastNDates, ...input.d1Dates, ...input.d7Dates, ...input.d30Dates]),
  );
  const [total, ...dailyValues] = await Promise.all([
    kv.get(input.totalKey),
    ...uniqueDates.map((date) => kv.get(input.dailyKeyForDate(date))),
  ]);
  const dailyByDate = new Map();
  uniqueDates.forEach((date, index) => {
    dailyByDate.set(date, dailyValues[index] ?? 0);
  });
  const sumDates = (dates) => dates.reduce((sum, date) => sum + (dailyByDate.get(date) ?? 0), 0);
  return {
    key: input.key,
    total: total ?? 0,
    lastNDays: sumDates(input.lastNDates),
    windows: {
      d1: sumDates(input.d1Dates),
      d7: sumDates(input.d7Dates),
      d30: sumDates(input.d30Dates),
    },
  };
}

export async function getCheckoutClassificationDiagnostics(days = 14) {
  const resolvedDays = clampDays(days);
  const lastNDates = buildDateRange(resolvedDays);
  const d1Dates = buildDateRange(1);
  const d7Dates = buildDateRange(7);
  const d30Dates = buildDateRange(30);

  const byStep = await Promise.all(
    CHECKOUT_CLASSIFICATION_STEPS.map(async (step) => {
      const [sources, plans, handoffs] = await Promise.all([
        Promise.all(
          CHECKOUT_CLASSIFICATION_SOURCES.map((source) =>
            readDimensionCount({
              key: source,
              totalKey: trustedCheckoutSourceKey(step, source),
              dailyKeyForDate: (date) => trustedCheckoutSourceDailyKey(date, step, source),
              lastNDates,
              d1Dates,
              d7Dates,
              d30Dates,
            }),
          ),
        ),
        Promise.all(
          CHECKOUT_CLASSIFICATION_PLANS.map((plan) =>
            readDimensionCount({
              key: plan,
              totalKey: trustedCheckoutPlanKey(step, plan),
              dailyKeyForDate: (date) => trustedCheckoutPlanDailyKey(date, step, plan),
              lastNDates,
              d1Dates,
              d7Dates,
              d30Dates,
            }),
          ),
        ),
        Promise.all(
          CHECKOUT_CLASSIFICATION_HANDOFFS.map((handoff) =>
            readDimensionCount({
              key: handoff,
              totalKey: trustedCheckoutHandoffKey(step, handoff),
              dailyKeyForDate: (date) => trustedCheckoutHandoffDailyKey(date, step, handoff),
              lastNDates,
              d1Dates,
              d7Dates,
              d30Dates,
            }),
          ),
        ),
      ]);
      return { step, sources, plans, handoffs };
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    days: resolvedDays,
    schemaVersion: 1,
    notes: {
      sourcePlanTotalsRetainUpTo180Days: true,
      trustedTotalsUseCleanNamespace: true,
      dailyWindowsSupportedGoingForward: true,
      qaTrafficExcluded: true,
      trustedCheckoutWritesOnly: true,
      noRawHandoffTokens: true,
      browserMeansHandoffNotVerifiedHuman: true,
      untaggedResearchInternalBrowserActivityMayBeCounted: true,
      handoffLabels: {
        browser: "browser handoff (not verified human)",
        missing: "missing/direct handoff",
      },
    },
    byStep,
  };
}
