"use client";

import { useCallback } from "react";

type FunnelRow = {
  step: string;
  total: number;
  lastNDays: number;
  fromPreviousPct: number | null;
  fromLandingPct: number | null;
};

export type FunnelDaily = { date: string; counts: Record<string, number> };

type Props = {
  rows: FunnelRow[];
  daily: FunnelDaily[];
  generatedAt: string;
};

function safeNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "";
  return Number.isFinite(value) ? value.toFixed(2) : value.toString();
}

export function FunnelCsvDownloader({ rows, daily, generatedAt }: Props) {
  const handleDownload = useCallback(() => {
    const totalsHeader = ["Step", "Total", "Last 14d", "Step Conversion (%)", "From Landing (%)"];
    const totalsRows = rows.map((row) => [
      row.step,
      row.total,
      row.lastNDays,
      safeNumber(row.fromPreviousPct),
      safeNumber(row.fromLandingPct),
    ]);

    const dailyHeader = ["Date", ...rows.map((row) => row.step)];
    const dailyRows = daily.map((day) =>
      [day.date, ...rows.map((row) => day.counts[row.step] ?? 0)],
    );

    const now = new Date(generatedAt).toISOString();
    const csvLines = [
      `Funnel export generated at ${now}`,
      "",
      totalsHeader.join(","),
      ...totalsRows.map((cols) => cols.join(",")),
      "",
      `Daily counts (last ${daily.length} days)`,
      dailyHeader.join(","),
      ...dailyRows.map((cols) => cols.join(",")),
    ];

    const blob = new Blob([csvLines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `funnel-dashboard-${now}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [rows, daily, generatedAt]);

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="inline-flex items-center gap-1 rounded-full border border-amber-300/60 bg-amber-100/80 px-4 py-1 text-xs font-semibold text-amber-900 shadow-sm transition hover:bg-amber-200/80"
    >
      Download CSV
    </button>
  );
}
