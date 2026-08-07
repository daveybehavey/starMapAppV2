/**
 * Harness mirroring checkout classification KV keys/normalize rules from src/lib/funnel.ts.
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

const DAILY_TTL_SECONDS = 400 * 24 * 60 * 60;
const DIMENSION_TTL_SECONDS = 180 * 24 * 60 * 60;

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

export function sourceKey(step, source) {
  return `funnel:source:${step}:${source}`;
}

export function sourceDailyKey(date, step, source) {
  return `funnel:source_daily:${date}:${step}:${source}`;
}

export function planKey(step, plan) {
  return `funnel:plan:${step}:${plan}`;
}

export function planDailyKey(date, step, plan) {
  return `funnel:plan_daily:${date}:${step}:${plan}`;
}

export function handoffKey(step, handoff) {
  return `funnel:handoff:${step}:${handoff}`;
}

export function handoffDailyKey(date, step, handoff) {
  return `funnel:handoff_daily:${date}:${step}:${handoff}`;
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

export async function recordCheckoutClassificationStep(input) {
  const source = normalizeDimension(input.source);
  const plan = normalizeDimension(input.plan);
  const handoff = normalizeCheckoutHandoff(input.handoff);
  const today = utcDateKey(resolveOccurredAt(input.occurredAt));
  const tasks = [
    kv.incr(`funnel:total:${input.step}`, 1),
    kv.incr(`funnel:daily:${today}:${input.step}`, 1, { ex: DAILY_TTL_SECONDS }),
  ];
  if (source) {
    tasks.push(kv.incr(sourceKey(input.step, source), 1, { ex: DIMENSION_TTL_SECONDS }));
    tasks.push(kv.incr(sourceDailyKey(today, input.step, source), 1, { ex: DAILY_TTL_SECONDS }));
  }
  if (plan) {
    tasks.push(kv.incr(planKey(input.step, plan), 1, { ex: DIMENSION_TTL_SECONDS }));
    tasks.push(kv.incr(planDailyKey(today, input.step, plan), 1, { ex: DAILY_TTL_SECONDS }));
  }
  if (handoff) {
    tasks.push(kv.incr(handoffKey(input.step, handoff), 1, { ex: DIMENSION_TTL_SECONDS }));
    tasks.push(kv.incr(handoffDailyKey(today, input.step, handoff), 1, { ex: DAILY_TTL_SECONDS }));
  }
  await Promise.all(tasks);
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
              totalKey: sourceKey(step, source),
              dailyKeyForDate: (date) => sourceDailyKey(date, step, source),
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
              totalKey: planKey(step, plan),
              dailyKeyForDate: (date) => planDailyKey(date, step, plan),
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
              totalKey: handoffKey(step, handoff),
              dailyKeyForDate: (date) => handoffDailyKey(date, step, handoff),
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
      sourcePlanTotalsAreCumulative: true,
      dailyWindowsSupportedGoingForward: true,
      qaTrafficExcluded: true,
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
