import { kv } from "@/lib/kv";

type CheckoutFailureInput = {
  reason: string;
  source?: string;
  plan?: string;
  occurredAt?: string | number | Date;
};

type CheckoutFailureRow = {
  reason: string;
  total: number;
  lastNDays: number;
};

type CheckoutFailureDashboard = {
  generatedAt: string;
  days: number;
  rows: CheckoutFailureRow[];
};

const DAILY_TTL_SECONDS = 120 * 24 * 60 * 60;
const TOTAL_PREFIX = "checkout_diag:reason_total:";
const DAILY_PREFIX = "checkout_diag:reason_daily:";

function normalizeReason(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function clampDays(days: number) {
  if (!Number.isFinite(days)) return 14;
  return Math.min(60, Math.max(1, Math.floor(days)));
}

function resolveOccurredAt(value: string | number | Date | undefined) {
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

function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function buildDateRange(days: number) {
  const resolvedDays = clampDays(days);
  const out: string[] = [];
  const now = new Date();
  for (let i = resolvedDays - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    out.push(utcDateKey(d));
  }
  return out;
}

function totalKey(reason: string) {
  return `${TOTAL_PREFIX}${reason}`;
}

function dailyKey(date: string, reason: string) {
  return `${DAILY_PREFIX}${date}:${reason}`;
}

export async function recordCheckoutFailure(input: CheckoutFailureInput) {
  const reason = normalizeReason(input.reason);
  if (!reason) return;
  const date = utcDateKey(resolveOccurredAt(input.occurredAt));
  await Promise.all([
    kv.incr(totalKey(reason), 1),
    kv.incr(dailyKey(date, reason), 1, { ex: DAILY_TTL_SECONDS }),
  ]);
}

export async function getCheckoutFailureDashboard(days = 14): Promise<CheckoutFailureDashboard> {
  const dates = buildDateRange(days);
  const listed = await kv.list({ prefix: TOTAL_PREFIX, limit: 500 });
  const reasons = listed.keys
    .map((key) => key.slice(TOTAL_PREFIX.length))
    .filter(Boolean)
    .sort();

  const rows = await Promise.all(
    reasons.map(async (reason) => {
      const [total, ...dailyCounts] = await Promise.all([
        kv.get<number>(totalKey(reason)),
        ...dates.map((date) => kv.get<number>(dailyKey(date, reason))),
      ]);
      return {
        reason,
        total: total ?? 0,
        lastNDays: dailyCounts.reduce<number>((sum, count) => sum + (count ?? 0), 0),
      };
    }),
  );

  rows.sort((a, b) => b.lastNDays - a.lastNDays || b.total - a.total || a.reason.localeCompare(b.reason));

  return {
    generatedAt: new Date().toISOString(),
    days: clampDays(days),
    rows,
  };
}
