"use client";

import { useMemo } from "react";
import IOSSafeDateInput from "@/components/IOSSafeDateInput";
import {
  DEFAULT_TIME,
  MOBILE_DATE_HELPER_TEXT,
  STANDARD_DATE_PLACEHOLDER,
  combineDateTime,
  formatDateInput,
  isValidIsoDateInput,
  toISODate,
} from "@/lib/dateInput";
import { formatDateTimeForLocation } from "@/lib/dateTime";

type Props = {
  dateTime: string;
  onChange: (iso: string) => void;
  timezone?: string;
};

export default function DateTimeControls({ dateTime, onChange, timezone }: Props) {
  const selectedDate = useMemo(() => new Date(dateTime), [dateTime]);
  // U01: the fields read and write wall-clock time AT THE PLACE (the
  // location's timezone), not the visitor's device timezone — a Sydney map
  // shows the Sydney date, and typing 21:00 for Paris stores 21:00 in Paris.
  const { dateValue, timeValue } = useMemo(
    () => getDateTimeInputValues(dateTime, timezone, selectedDate),
    [dateTime, timezone, selectedDate],
  );
  const timezoneLabel = timezone || "UTC";
  const localPreview = useMemo(
    () => formatLocalPreview(selectedDate, timezoneLabel),
    [selectedDate, timezoneLabel],
  );

  const handleDateChange = (value: string) => {
    if (!value) return;
    if (!isValidIsoDateInput(value)) return;
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
        <IOSSafeDateInput
          id="star-date"
          value={dateValue}
          onChange={(e) => handleDateChange(e.target.value)}
          placeholder={STANDARD_DATE_PLACEHOLDER}
          className="ios-form-control w-full rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm text-white shadow-inner shadow-black/20 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
        />
        <p className="mt-1 text-[11px] text-white/55">{MOBILE_DATE_HELPER_TEXT}</p>
      </div>

      <div>
        <label htmlFor="star-time" className="mb-1 block text-xs font-semibold text-white">
          Time <span className="font-normal text-neutral-200">(optional, defaults to 9 PM)</span>
        </label>
        <input
          id="star-time"
          type="time"
          step={60}
          value={timeValue === DEFAULT_TIME ? "" : timeValue.slice(0, 5)}
          onChange={(e) => handleTimeChange(e.target.value)}
          className="w-full appearance-none rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm text-white shadow-inner shadow-black/20 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
        />
      </div>

      {localPreview && (
        <div className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/80">
          <div className="text-[11px] uppercase tracking-wide text-neutral-200">
            Local time in {timezoneLabel}
          </div>
          <div className="text-sm font-semibold text-white">{localPreview}</div>
        </div>
      )}
    </div>
  );
}

function formatTimeInput(date: Date) {
  if (!Number.isFinite(date.getTime())) return DEFAULT_TIME;
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/**
 * Field values for the stored instant: the calendar date and wall time in
 * the place's timezone when one is known (same contract as
 * SimplifiedEditor's getDateTimeInputValues). Falls back to device-local
 * fields when no timezone is supplied or the zone cannot resolve the
 * instant. The bare "UTC" placeholder carried by name-only drafts takes
 * the zoned branch like any real zone: combineDateTime parses an
 * explicit "UTC" as UTC (A2-4), so the fields render in the UTC frame
 * too and the read/write frames agree. (Before A2-4 the write side read
 * "UTC" as device-local and this function mirrored that sentinel frame;
 * the frames now agree on UTC instead.) Purely presentational — the
 * stored instant is never rewritten here; onChange only fires from the
 * field handlers above.
 */
function getDateTimeInputValues(dateTime: string, timezone: string | undefined, parsed: Date) {
  if (timezone) {
    const byTimezone = formatDateTimeForLocation(dateTime, timezone);
    if (byTimezone) {
      return { dateValue: byTimezone.date, timeValue: `${byTimezone.time}:00` };
    }
  }
  return { dateValue: formatDateInput(parsed), timeValue: formatTimeInput(parsed) };
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
