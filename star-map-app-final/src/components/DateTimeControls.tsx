"use client";

import { useMemo } from "react";

const DEFAULT_TIME = "00:00:00";

type Props = {
  dateTime: string;
  onChange: (iso: string) => void;
  timezone?: string;
};

export default function DateTimeControls({ dateTime, onChange, timezone }: Props) {
  const selectedDate = useMemo(() => new Date(dateTime), [dateTime]);
  const dateValue = formatDateInput(selectedDate);
  const timeValue = formatTimeInput(selectedDate);
  const timezoneLabel = timezone || "UTC";
  const localPreview = useMemo(
    () => formatLocalPreview(selectedDate, timezoneLabel),
    [selectedDate, timezoneLabel],
  );

  const handleDateChange = (value: string) => {
    if (!value) return;
    const iso = combineDateTime(value, timeValue, timezone);
    if (iso) onChange(iso);
  };

  const handleTimeChange = (value: string) => {
    const iso = combineDateTime(dateValue || toISODate(new Date()), value ? `${value}:00` : DEFAULT_TIME, timezone);
    if (iso) onChange(iso);
  };

  return (
    <div className="space-y-2">
      <div>
        <label htmlFor="star-date" className="mb-1 block text-xs font-semibold text-white">
          Date
        </label>
        <input
          id="star-date"
          type="date"
          value={dateValue}
          onChange={(e) => handleDateChange(e.target.value)}
          className="w-full appearance-none rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm text-white shadow-inner shadow-black/20 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200/40 focus:ring-inset"
        />
      </div>

      <div>
        <label htmlFor="star-time" className="mb-1 block text-xs font-semibold text-white">
          Time <span className="font-normal text-neutral-300">(optional, defaults to midnight)</span>
        </label>
        <input
          id="star-time"
          type="time"
          step={60}
          value={timeValue === DEFAULT_TIME ? "" : timeValue.slice(0, 5)}
          onChange={(e) => handleTimeChange(e.target.value)}
          className="w-full appearance-none rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm text-white shadow-inner shadow-black/20 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200/40 focus:ring-inset"
        />
      </div>

      {localPreview && (
        <div className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/80">
          <div className="text-[10px] uppercase tracking-wide text-neutral-300">
            Local time in {timezoneLabel}
          </div>
          <div className="text-sm font-semibold text-white">{localPreview}</div>
        </div>
      )}
    </div>
  );
}

function formatDateInput(date: Date) {
  if (!Number.isFinite(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTimeInput(date: Date) {
  if (!Number.isFinite(date.getTime())) return DEFAULT_TIME;
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatLocalPreview(date: Date, timezone: string) {
  if (!Number.isFinite(date.getTime())) return "";
  try {
    const dateLabel = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
    const timeLabel = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);
    return `${dateLabel} · ${timeLabel}`;
  } catch {
    return "";
  }
}

function combineDateTime(date: string, time: string, timezone?: string) {
  if (!date) return null;
  const normalizedTime = normalizeTimeInput(time);

  // If no timezone provided or UTC, use browser's interpretation (backward compatible)
  if (!timezone || timezone === "UTC") {
    const combined = new Date(`${date}T${normalizedTime}`);
    if (!Number.isFinite(combined.getTime())) return null;
    return combined.toISOString();
  }

  // Convert local time in specified timezone to UTC
  // This ensures user input is interpreted in the location's timezone, not browser's
  try {
    const [yearStr, monthStr, dayStr] = date.split("-");
    const [hourStr, minuteStr, secondStr] = normalizedTime.split(":");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    const hour = Number(hourStr);
    const minute = Number(minuteStr);

    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) ||
        !Number.isFinite(hour) || !Number.isFinite(minute)) {
      return null;
    }

    // Use the same logic as toUTCDateFromLocal in astronomy.ts
    const testDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(testDate);
    const localYear = Number(parts.find(p => p.type === "year")?.value);
    const localMonth = Number(parts.find(p => p.type === "month")?.value);
    const localDay = Number(parts.find(p => p.type === "day")?.value);
    const localHour = Number(parts.find(p => p.type === "hour")?.value);
    const localMinute = Number(parts.find(p => p.type === "minute")?.value);

    const localMs = Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute, 0);
    const utcMs = testDate.getTime();
    const offsetMs = utcMs - localMs;

    const targetLocalMs = Date.UTC(year, month - 1, day, hour, minute, 0);
    const result = new Date(targetLocalMs + offsetMs);

    if (!Number.isFinite(result.getTime())) return null;
    return result.toISOString();
  } catch (error) {
    console.warn("Failed to convert timezone in combineDateTime:", timezone, error);
    // Fallback to browser timezone
    const combined = new Date(`${date}T${normalizedTime}`);
    if (!Number.isFinite(combined.getTime())) return null;
    return combined.toISOString();
  }
}

function normalizeTimeInput(time: string) {
  if (!time) return DEFAULT_TIME;
  if (time.length === 5) return `${time}:00`;
  return time;
}

function humanDate(date: Date) {
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeLabel(time: string) {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "12:00 AM";
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = ((h + 11) % 12) + 1;
  return `${String(hour12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${suffix}`;
}

function toISODate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
