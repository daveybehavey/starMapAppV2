"use client";

import { useMemo } from "react";

const DEFAULT_TIME = "23:59:59";

type Props = {
  dateTime: string;
  onChange: (iso: string) => void;
};

export default function DateTimeControls({ dateTime, onChange }: Props) {
  const selectedDate = useMemo(() => new Date(dateTime), [dateTime]);
  const dateValue = formatDateInput(selectedDate);
  const timeValue = formatTimeInput(selectedDate);

  const handleDateChange = (value: string) => {
    if (!value) return;
    const iso = combineDateTime(value, timeValue);
    if (iso) onChange(iso);
  };

  const handleTimeChange = (value: string) => {
    const iso = combineDateTime(dateValue || toISODate(new Date()), value ? `${value}:00` : DEFAULT_TIME);
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
          className="w-full rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm text-white shadow-inner shadow-black/20 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200/40"
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
          className="w-full rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm text-white shadow-inner shadow-black/20 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-200/40"
        />
      </div>
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

function combineDateTime(date: string, time: string) {
  if (!date) return null;
  const normalizedTime = normalizeTimeInput(time);
  const combined = new Date(`${date}T${normalizedTime}`);
  if (!Number.isFinite(combined.getTime())) return null;
  return combined.toISOString();
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
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "11:59 PM";
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
