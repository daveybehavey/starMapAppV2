import { kv } from "./kv";
import { type Ga4PurchaseInput, recordGa4PurchaseOnce } from "./ga4MeasurementProtocol";
import { FUNNEL_STEPS, type FunnelStep } from "./funnelSteps";

/** Presence-only browser handoff labels (STAR-006 / #215). Never a raw client token. */
export type CheckoutHandoffLabel = "browser" | "missing";

export type FunnelRecordInput = {
  step: FunnelStep;
  source?: string;
  plan?: string;
  /** Aggregate-only handoff class; raw tokens must never be passed here. */
  handoff?: CheckoutHandoffLabel | string;
  experiment?: string;
  variant?: string;
  occurredAt?: string | number | Date;
};

export type FunnelDashboardRow = {
  step: FunnelStep;
  total: number;
  lastNDays: number;
  fromPreviousPct: number | null;
  fromLandingPct: number | null;
};

/** Fixed allowlist of server checkout source labels already written by `/api/checkout`. */
export const CHECKOUT_CLASSIFICATION_SOURCES = [
  "checkout_api_print_post",
  "checkout_api_digital_post",
  "checkout_api_print_get",
  "checkout_api_digital_get",
] as const;

/** Digital plans + print variants recorded as `plan` on checkout funnel steps. */
export const CHECKOUT_CLASSIFICATION_PLANS = [
  "single",
  "pack3",
  "subscription",
  "poster_framed",
  "poster_unframed",
  "canvas_wrap",
  "mug_11oz",
  "card_4x6",
] as const;

export const CHECKOUT_CLASSIFICATION_HANDOFFS = ["browser", "missing"] as const;

/** Steps that carry production checkout type/handoff classification. */
export const CHECKOUT_CLASSIFICATION_STEPS = [
  "checkout_request_received",
  "checkout_session_created",
] as const;

export type CheckoutClassificationSource = (typeof CHECKOUT_CLASSIFICATION_SOURCES)[number];
export type CheckoutClassificationPlan = (typeof CHECKOUT_CLASSIFICATION_PLANS)[number];
export type CheckoutClassificationHandoff = (typeof CHECKOUT_CLASSIFICATION_HANDOFFS)[number];
export type CheckoutClassificationStep = (typeof CHECKOUT_CLASSIFICATION_STEPS)[number];

export type CheckoutClassificationDimensionCount = {
  key: string;
  /** Cumulative KV total (may include history before daily windows existed). */
  total: number;
  /** Sum of daily counters for the requested `days` window (0 when daily keys absent). */
  lastNDays: number;
  /** Fixed post-deploy windows from daily counters only. */
  windows: {
    d1: number;
    d7: number;
    d30: number;
  };
};

export type CheckoutClassificationStepBlock = {
  step: CheckoutClassificationStep;
  sources: CheckoutClassificationDimensionCount[];
  plans: CheckoutClassificationDimensionCount[];
  handoffs: CheckoutClassificationDimensionCount[];
};

/**
 * Safe aggregate checkout classification for revenue diagnosis without Stripe credentials.
 * Fixed allowlist only — never enumerates arbitrary KV keys or returns PII/tokens.
 */
export type CheckoutClassificationDiagnostics = {
  generatedAt: string;
  days: number;
  schemaVersion: 1;
  notes: {
    /** Source/plan `total` may predate daily window keys; treat as cumulative history. */
    sourcePlanTotalsAreCumulative: true;
    /** Handoff + type windows rely on daily counters written after this change deploys. */
    dailyWindowsSupportedGoingForward: true;
    /** Authenticated QA (`qaContext.enabled`) must not increment these counters. */
    qaTrafficExcluded: true;
    /** Only `browser` | `missing` labels are stored/returned — never raw handoff tokens. */
    noRawHandoffTokens: true;
  };
  byStep: CheckoutClassificationStepBlock[];
};

export type FunnelDashboardData = {
  generatedAt: string;
  days: number;
  rows: FunnelDashboardRow[];
  daily: Array<{ date: string; counts: Record<FunnelStep, number> }>;
  /** Allowlisted print/digital/handoff aggregates (#215). */
  checkoutClassification: CheckoutClassificationDiagnostics;
};

export type PaymentVerifiedWindowSyncResult = {
  days: number;
  dates: string[];
  previousWindowTotal: number;
  nextWindowTotal: number;
  adjustedTotal: number;
};

const DAILY_TTL_SECONDS = 400 * 24 * 60 * 60;
const DIMENSION_TTL_SECONDS = 180 * 24 * 60 * 60;
const SESSION_DEDUPE_TTL_SECONDS = 400 * 24 * 60 * 60;

function totalKey(step: FunnelStep) {
  return `funnel:total:${step}`;
}

function dailyKey(date: string, step: FunnelStep) {
  return `funnel:daily:${date}:${step}`;
}

function sourceKey(step: FunnelStep, source: string) {
  return `funnel:source:${step}:${source}`;
}

function sourceDailyKey(date: string, step: FunnelStep, source: string) {
  return `funnel:source_daily:${date}:${step}:${source}`;
}

function planKey(step: FunnelStep, plan: string) {
  return `funnel:plan:${step}:${plan}`;
}

function planDailyKey(date: string, step: FunnelStep, plan: string) {
  return `funnel:plan_daily:${date}:${step}:${plan}`;
}

function handoffKey(step: FunnelStep, handoff: CheckoutHandoffLabel) {
  return `funnel:handoff:${step}:${handoff}`;
}

function handoffDailyKey(date: string, step: FunnelStep, handoff: CheckoutHandoffLabel) {
  return `funnel:handoff_daily:${date}:${step}:${handoff}`;
}

function variantKey(step: FunnelStep, experiment: string, variant: string) {
  return `funnel:variant:${step}:${experiment}:${variant}`;
}

function normalizeCheckoutHandoff(input: string | undefined): CheckoutHandoffLabel | null {
  if (!input) return null;
  const cleaned = input.trim().toLowerCase();
  if (cleaned === "browser" || cleaned === "missing") return cleaned;
  return null;
}

function paymentVerifiedSessionKey(sessionId: string) {
  return `funnel:payment_verified:session:${sessionId}`;
}

function sessionScopedStepKey(step: FunnelStep, sessionId: string) {
  return `funnel:${step}:session:${sessionId}`;
}

function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function resolveOccurredAt(value: string | number | Date | undefined) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : new Date();
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : new Date();
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : new Date();
  }
  return new Date();
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
  const handoff = normalizeCheckoutHandoff(input.handoff);
  const experiment = normalizeDimension(input.experiment);
  const variant = normalizeDimension(input.variant);
  const today = utcDateKey(resolveOccurredAt(input.occurredAt));
  const tasks: Array<Promise<number>> = [
    kv.incr(totalKey(input.step), 1),
    kv.incr(dailyKey(today, input.step), 1, { ex: DAILY_TTL_SECONDS }),
  ];

  if (source) {
    // Preserve historical total counters; add daily keys for 1d/7d/30d windows going forward.
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
  if (experiment && variant) {
    tasks.push(kv.incr(variantKey(input.step, experiment, variant), 1, { ex: DIMENSION_TTL_SECONDS }));
  }

  await Promise.all(tasks);
}

export async function recordPaymentVerifiedOnce(input: {
  sessionId: string;
  amountTotal?: number | null;
  source?: string;
  plan?: string;
  experiment?: string;
  variant?: string;
  occurredAt?: string | number | Date;
  ga4Purchase?: Ga4PurchaseInput;
  /** When true, skip GA4 MP and internal payment_verified (live QA / automation). */
  skipProductionAnalytics?: boolean;
}): Promise<void> {
  const sessionId = input.sessionId.trim();
  if (!sessionId) return;
  const skipProduction = input.skipProductionAnalytics === true;
  const amountTotal =
    typeof input.amountTotal === "number" && Number.isFinite(input.amountTotal) ? input.amountTotal : null;
  // For KPI purposes, only treat real revenue sessions as "payment_verified".
  // Entitlements may still be granted for $0 / no_payment_required flows elsewhere.
  if (amountTotal !== null && amountTotal <= 0) return;
  // GA4 has its own dedupe; run before funnel dedupe so a later verify/webhook can retry MP if needed.
  if (input.ga4Purchase && !skipProduction) {
    await recordGa4PurchaseOnce(input.ga4Purchase);
  }
  const seen = await kv.incr(paymentVerifiedSessionKey(sessionId), 1, { ex: SESSION_DEDUPE_TTL_SECONDS });
  if (seen !== 1) return;
  if (skipProduction) return;
  await recordFunnelStep({
    step: "payment_verified",
    source: input.source,
    plan: input.plan,
    experiment: input.experiment,
    variant: input.variant,
    occurredAt: input.occurredAt,
  });
}

export async function recordCheckoutExpiredOnce(input: {
  sessionId: string;
  source?: string;
  plan?: string;
  experiment?: string;
  variant?: string;
  occurredAt?: string | number | Date;
}): Promise<void> {
  const sessionId = input.sessionId.trim();
  if (!sessionId) return;
  const seen = await kv.incr(sessionScopedStepKey("checkout_expired", sessionId), 1, {
    ex: SESSION_DEDUPE_TTL_SECONDS,
  });
  if (seen !== 1) return;
  await recordFunnelStep({
    step: "checkout_expired",
    source: input.source,
    plan: input.plan,
    experiment: input.experiment,
    variant: input.variant,
    occurredAt: input.occurredAt,
  });
}

export async function hasPaymentVerifiedRecord(sessionId: string): Promise<boolean> {
  const normalized = sessionId.trim();
  if (!normalized) return false;
  const seen = await kv.get<number>(paymentVerifiedSessionKey(normalized));
  return typeof seen === "number" && seen > 0;
}

export async function syncPaymentVerifiedWindow(input: {
  days: number;
  countsByDate: Record<string, number>;
}): Promise<PaymentVerifiedWindowSyncResult> {
  const dates = buildDateRange(input.days);
  const currentTotal: number = (await kv.get<number>(totalKey("payment_verified"))) ?? 0;
  const currentWindowCounts = await Promise.all(
    dates.map((date) => kv.get<number>(dailyKey(date, "payment_verified"))),
  );
  const previousWindowTotal = currentWindowCounts.reduce<number>(
    (sum, count) => sum + (typeof count === "number" ? count : 0),
    0,
  );
  const nextWindowTotal = dates.reduce<number>((sum, date) => sum + (input.countsByDate[date] ?? 0), 0);

  await Promise.all(
    dates.map((date) =>
      kv.set(dailyKey(date, "payment_verified"), input.countsByDate[date] ?? 0, { ex: DAILY_TTL_SECONDS }),
    ),
  );

  const adjustedTotal = Math.max(0, currentTotal - previousWindowTotal + nextWindowTotal);
  await kv.set(totalKey("payment_verified"), adjustedTotal);

  return {
    days: clampDays(input.days),
    dates,
    previousWindowTotal,
    nextWindowTotal,
    adjustedTotal,
  };
}

async function readDimensionCount(input: {
  totalKey: string;
  dailyKeyForDate: (date: string) => string;
  lastNDates: string[];
  d1Dates: string[];
  d7Dates: string[];
  d30Dates: string[];
  key: string;
}): Promise<CheckoutClassificationDimensionCount> {
  const uniqueDates = Array.from(
    new Set([...input.lastNDates, ...input.d1Dates, ...input.d7Dates, ...input.d30Dates]),
  );
  const [total, ...dailyValues] = await Promise.all([
    kv.get<number>(input.totalKey),
    ...uniqueDates.map((date) => kv.get<number>(input.dailyKeyForDate(date))),
  ]);
  const dailyByDate = new Map<string, number>();
  uniqueDates.forEach((date, index) => {
    dailyByDate.set(date, dailyValues[index] ?? 0);
  });
  const sumDates = (dates: string[]) =>
    dates.reduce((sum, date) => sum + (dailyByDate.get(date) ?? 0), 0);

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

/**
 * Fixed-allowlist checkout source / plan / handoff aggregates.
 * Uses direct key reads only (no KV list/scan). Safe for operator diagnosis without Stripe.
 */
export async function getCheckoutClassificationDiagnostics(
  days = 14,
): Promise<CheckoutClassificationDiagnostics> {
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

      return { step, sources, plans, handoffs } satisfies CheckoutClassificationStepBlock;
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
    },
    byStep,
  };
}

export async function getFunnelDashboard(days = 14): Promise<FunnelDashboardData> {
  const resolvedDays = clampDays(days);
  const dates = buildDateRange(resolvedDays);

  const [totalsRaw, dailyRaw, checkoutClassification] = await Promise.all([
    Promise.all(FUNNEL_STEPS.map((step) => kv.get<number>(totalKey(step)))),
    Promise.all(
      dates.flatMap((date) => FUNNEL_STEPS.map((step) => kv.get<number>(dailyKey(date, step)))),
    ),
    getCheckoutClassificationDiagnostics(resolvedDays),
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
    checkoutClassification,
  };
}
