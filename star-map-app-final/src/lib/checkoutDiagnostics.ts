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
  topSources?: Array<{ source: string; lastNDays: number }>;
};

type CheckoutFailureDashboard = {
  generatedAt: string;
  days: number;
  rows: CheckoutFailureRow[];
};

const DAILY_TTL_SECONDS = 120 * 24 * 60 * 60;
const TOTAL_PREFIX = "checkout_diag:reason_total:";
const DAILY_PREFIX = "checkout_diag:reason_daily:";
const DAILY_SOURCE_PREFIX = "checkout_diag:reason_source_daily:";

function normalizeReason(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function normalizeDimension(input: string, maxLen = 48) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLen);
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

function dailySourceKey(date: string, reason: string, source: string) {
  return `${DAILY_SOURCE_PREFIX}${date}:${reason}:${source}`;
}

export async function recordCheckoutFailure(input: CheckoutFailureInput) {
  const reason = normalizeReason(input.reason);
  if (!reason) return;
  const source = typeof input.source === "string" ? normalizeDimension(input.source) : "";
  const date = utcDateKey(resolveOccurredAt(input.occurredAt));
  const increments: Array<Promise<number>> = [
    kv.incr(totalKey(reason), 1),
    kv.incr(dailyKey(date, reason), 1, { ex: DAILY_TTL_SECONDS }),
  ];
  if (source) {
    increments.push(kv.incr(dailySourceKey(date, reason, source), 1, { ex: DAILY_TTL_SECONDS }));
  }
  await Promise.all(increments);
}

/**
 * Ordinary-buyer checkout failure diagnostics only.
 * Authenticated QA probes (`qaContext.enabled`) must not contaminate buyer dashboards.
 */
export function shouldRecordBuyerCheckoutFailure(
  qaContext: { enabled?: boolean } | null | undefined
): boolean {
  return qaContext?.enabled !== true;
}

export async function recordBuyerCheckoutFailure(
  qaContext: { enabled?: boolean } | null | undefined,
  input: CheckoutFailureInput
): Promise<void> {
  if (!shouldRecordBuyerCheckoutFailure(qaContext)) return;
  await recordCheckoutFailure(input);
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
    })
  );

  rows.sort((a, b) => b.lastNDays - a.lastNDays || b.total - a.total || a.reason.localeCompare(b.reason));

  const topReasonRows = rows.filter((row) => row.lastNDays > 0).slice(0, 12);
  const topSourcesByReason = new Map<string, Array<{ source: string; lastNDays: number }>>();
  await Promise.all(
    topReasonRows.map(async (row) => {
      const counts = new Map<string, number>();
      for (const date of dates) {
        const prefix = `${DAILY_SOURCE_PREFIX}${date}:${row.reason}:`;
        let cursor: string | undefined;
        let scanned = 0;
        while (true) {
          const listed = await kv.list({ prefix, cursor, limit: 200 });
          scanned += listed.keys.length;
          for (const key of listed.keys) {
            const source = key.slice(prefix.length);
            if (!source) continue;
            const value = await kv.get<number>(key);
            counts.set(source, (counts.get(source) ?? 0) + (value ?? 0));
          }
          if (listed.listComplete || !listed.cursor) break;
          cursor = listed.cursor ?? undefined;
          if (scanned >= 500) break;
        }
      }

      const topSources = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([source, lastNDays]) => ({ source, lastNDays }));
      if (topSources.length) {
        topSourcesByReason.set(row.reason, topSources);
      }
    })
  );

  const rowsWithSources: CheckoutFailureRow[] = rows.map((row) => {
    const topSources = topSourcesByReason.get(row.reason);
    return topSources ? { ...row, topSources } : row;
  });

  return {
    generatedAt: new Date().toISOString(),
    days: clampDays(days),
    rows: rowsWithSources,
  };
}
