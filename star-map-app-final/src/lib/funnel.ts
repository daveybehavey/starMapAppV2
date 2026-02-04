import { kv } from "./kv";
import { FUNNEL_STEPS, type FunnelStep } from "./funnelSteps";

export type FunnelRecordInput = {
  step: FunnelStep;
  source?: string;
  plan?: string;
  experiment?: string;
  variant?: string;
};

export type FunnelDashboardRow = {
  step: FunnelStep;
  total: number;
  lastNDays: number;
  fromPreviousPct: number | null;
  fromLandingPct: number | null;
};

export type FunnelDashboardData = {
  generatedAt: string;
  days: number;
  rows: FunnelDashboardRow[];
  daily: Array<{ date: string; counts: Record<FunnelStep, number> }>;
};

const DAILY_TTL_SECONDS = 400 * 24 * 60 * 60;
const DIMENSION_TTL_SECONDS = 180 * 24 * 60 * 60;

function totalKey(step: FunnelStep) {
  return `funnel:total:${step}`;
}

function dailyKey(date: string, step: FunnelStep) {
  return `funnel:daily:${date}:${step}`;
}

function sourceKey(step: FunnelStep, source: string) {
  return `funnel:source:${step}:${source}`;
}

function planKey(step: FunnelStep, plan: string) {
  return `funnel:plan:${step}:${plan}`;
}

function variantKey(step: FunnelStep, experiment: string, variant: string) {
  return `funnel:variant:${step}:${experiment}:${variant}`;
}

function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function normalizeDimension(input: string | undefined, max = 48): string | null {
  if (!input) return null;
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max);
  return cleaned || null;
}

function clampDays(days: number) {
  if (!Number.isFinite(days)) return 14;
  return Math.min(60, Math.max(1, Math.floor(days)));
}

function buildDateRange(days: number): string[] {
  const resolvedDays = clampDays(days);
  const out: string[] = [];
  const now = new Date();
  for (let i = resolvedDays - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    out.push(utcDateKey(d));
  }
  return out;
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

export async function recordFunnelStep(input: FunnelRecordInput): Promise<void> {
  const source = normalizeDimension(input.source);
  const plan = normalizeDimension(input.plan);
  const experiment = normalizeDimension(input.experiment);
  const variant = normalizeDimension(input.variant);
  const today = utcDateKey();
  const tasks: Array<Promise<number>> = [
    kv.incr(totalKey(input.step), 1),
    kv.incr(dailyKey(today, input.step), 1, { ex: DAILY_TTL_SECONDS }),
  ];

  if (source) {
    tasks.push(kv.incr(sourceKey(input.step, source), 1, { ex: DIMENSION_TTL_SECONDS }));
  }
  if (plan) {
    tasks.push(kv.incr(planKey(input.step, plan), 1, { ex: DIMENSION_TTL_SECONDS }));
  }
  if (experiment && variant) {
    tasks.push(kv.incr(variantKey(input.step, experiment, variant), 1, { ex: DIMENSION_TTL_SECONDS }));
  }

  await Promise.all(tasks);
}

export async function getFunnelDashboard(days = 14): Promise<FunnelDashboardData> {
  const resolvedDays = clampDays(days);
  const dates = buildDateRange(resolvedDays);

  const [totalsRaw, dailyRaw] = await Promise.all([
    Promise.all(FUNNEL_STEPS.map((step) => kv.get<number>(totalKey(step)))),
    Promise.all(
      dates.flatMap((date) => FUNNEL_STEPS.map((step) => kv.get<number>(dailyKey(date, step)))),
    ),
  ]);

  const totals = FUNNEL_STEPS.map((step, index) => ({
    step,
    total: totalsRaw[index] ?? 0,
  }));

  const daily: Array<{ date: string; counts: Record<FunnelStep, number> }> = [];
  let pointer = 0;
  for (const date of dates) {
    const counts = {} as Record<FunnelStep, number>;
    for (const step of FUNNEL_STEPS) {
      counts[step] = dailyRaw[pointer] ?? 0;
      pointer += 1;
    }
    daily.push({ date, counts });
  }

  const lastNDaysTotals = FUNNEL_STEPS.reduce(
    (acc, step) => {
      acc[step] = daily.reduce((sum, day) => sum + day.counts[step], 0);
      return acc;
    },
    {} as Record<FunnelStep, number>,
  );

  const landingTotal = totals.find((entry) => entry.step === "landing_view")?.total ?? 0;
  const rows: FunnelDashboardRow[] = totals.map((entry, index) => {
    const previous = index > 0 ? totals[index - 1].total : null;
    return {
      step: entry.step,
      total: entry.total,
      lastNDays: lastNDaysTotals[entry.step] ?? 0,
      fromPreviousPct: previous === null ? null : pct(entry.total, previous),
      fromLandingPct: pct(entry.total, landingTotal),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    days: resolvedDays,
    rows,
    daily,
  };
}
