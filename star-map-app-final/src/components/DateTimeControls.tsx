"use client";

import { useMemo, useState } from "react";

const DEFAULT_TIME = "23:59:59";

type Props = {
  dateTime: string;
  onChange: (iso: string) => void;
};

export default function DateTimeControls({ dateTime, onChange }: Props) {
  const selectedDate = useMemo(() => new Date(dateTime), [dateTime]);
  const dateValue = formatDateInput(selectedDate);
  const timeValue = formatTimeInput(selectedDate);

  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [customTimeEnabled, setCustomTimeEnabled] = useState(() => timeValue !== DEFAULT_TIME);

  const handleDateChange = (value: string) => {
    if (!value) {
      setDateOpen(false);
      return;
    }
    const iso = combineDateTime(value, customTimeEnabled ? timeValue : DEFAULT_TIME);
    if (iso) onChange(iso);
    setDateOpen(false);
  };

  const handleTimeChange = (value: string) => {
    if (!value) {
      setTimeOpen(false);
      return;
    }
    const iso = combineDateTime(dateValue || toISODate(new Date()), `${value}:00`);
    if (iso) onChange(iso);
    setTimeOpen(false);
  };

  const toggleCustomTime = () => {
    if (customTimeEnabled) {
      setCustomTimeEnabled(false);
      setTimeOpen(false);
      const iso = combineDateTime(dateValue || toISODate(new Date()), DEFAULT_TIME);
      if (iso) onChange(iso);
    } else {
      setCustomTimeEnabled(true);
      setTimeOpen(true);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-black/5 bg-white/80 p-4 shadow-inner shadow-black/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-neutral-800">Date &amp; Time</div>
          <p className="text-xs text-neutral-500">Pick your date, add time only if you want.</p>
        </div>
        <div className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gold shadow-sm">
          Local time
        </div>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => setDateOpen((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-lg border border-black/10 bg-amber-50/70 px-3 py-3 text-left text-sm font-semibold text-midnight shadow-inner shadow-amber-100 transition hover:-translate-y-[1px] hover:shadow"
            aria-expanded={dateOpen}
          >
            <span>{dateValue ? humanDate(selectedDate) : "Choose a date"}</span>
            <span className="text-[11px] uppercase tracking-wide text-gold">Select</span>
          </button>
          {dateOpen && (
            <div className="absolute left-0 right-0 top-full z-10 mt-2 rounded-xl border border-black/10 bg-white p-3 shadow-lg shadow-black/10">
              <label className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
                Select date
              </label>
              <input
                type="date"
                value={dateValue}
                onChange={(e) => handleDateChange(e.target.value)}
                className="mt-2 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm shadow-inner shadow-black/5 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-neutral-800">
              {customTimeEnabled ? "Custom time" : "Default time set to midnight"}
            </span>
            <button
              type="button"
              onClick={toggleCustomTime}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide transition ${
                customTimeEnabled
                  ? "border-gold bg-amber-50 text-midnight shadow-sm"
                  : "border-black/10 bg-white text-neutral-700 shadow-sm"
              }`}
              aria-pressed={customTimeEnabled}
            >
              {customTimeEnabled ? "Remove time" : "Add custom time"}
            </button>
          </div>

          {customTimeEnabled && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setTimeOpen((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-lg border border-black/10 bg-amber-50/70 px-3 py-3 text-left text-sm font-semibold text-midnight shadow-inner shadow-amber-100 transition hover:-translate-y-[1px] hover:shadow"
                aria-expanded={timeOpen}
              >
                <span>{timeValue ? formatTimeLabel(timeValue) : "Choose a time"}</span>
                <span className="text-[11px] uppercase tracking-wide text-gold">Select</span>
              </button>
              {timeOpen && (
                <div className="absolute left-0 right-0 top-full z-10 mt-2 rounded-xl border border-black/10 bg-white p-3 shadow-lg shadow-black/10">
                  <label className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
                    Select time
                  </label>
                  <input
                    type="time"
                    step={60}
                    value={timeValue.slice(0, 5)}
                    onChange={(e) => handleTimeChange(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm shadow-inner shadow-black/5 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
                  />
                  <p className="mt-1 text-xs text-neutral-500">Stored as 24h; tap outside to close.</p>
                </div>
              )}
            </div>
          )}
        </div>
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
    month: "short",
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
