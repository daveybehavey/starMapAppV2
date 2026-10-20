"use client";

/** Blank exact-time default: 9:00 PM in the picked location's timezone. */
export const DEFAULT_TIME = "21:00:00";
export const STANDARD_DATE_PLACEHOLDER = "YYYY-MM-DD";
export const IOS_DATE_FALLBACK_PLACEHOLDER = "YYYYMMDD";
export const DATE_INPUT_ERROR_MESSAGE =
  "Use a real date in YYYYMMDD, YYYY-MM-DD, or MM/DD/YYYY format.";
export const MOBILE_DATE_HELPER_TEXT = "Mobile tip: type 20240315 if your keyboard has no dashes.";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function detectIOSDateInputFallback() {
  if (typeof navigator === "undefined" || typeof document === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const iosUA = /iPad|iPhone|iPod/.test(ua);
  const ipadDesktopUA = /Macintosh|MacIntel/.test(platform || ua) && maxTouchPoints > 1;
  const iosWebkitShell = /AppleWebKit/i.test(ua) && /Mobile/i.test(ua) && !/Android/i.test(ua);
  return iosUA || ipadDesktopUA || iosWebkitShell;
}

export function isValidIsoDateInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!ISO_DATE_PATTERN.test(trimmed)) return false;
  const [yearStr, monthStr, dayStr] = trimmed.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

export function normalizeFlexibleDateInput(
  value: string,
  options?: { whileTyping?: boolean },
) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const yearFirst = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(trimmed);
  if (yearFirst) {
    const [, y, m, d] = yearFirst;
    const candidate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    if (isValidIsoDateInput(candidate)) {
      // While typing, the day is the trailing segment: a lone digit may be
      // the first half of a two-digit day, so padding it would complete the
      // field with the WRONG date (2019-07-1 -> 2019-07-01) and the real
      // second digit would then be lost. Leave the day as typed; padding
      // settles at blur. The month is closed by its separator, so padding
      // it is safe. (The month-first branch below needs no such guard: its
      // trailing segment is the 4-digit year, which cannot match partially.)
      return options?.whileTyping ? `${y}-${m.padStart(2, "0")}-${d}` : candidate;
    }
  }

  const monthFirst = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(trimmed);
  if (monthFirst) {
    const [, m, d, y] = monthFirst;
    const candidate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    if (isValidIsoDateInput(candidate)) return candidate;
  }

  const digits = trimmed.replace(/\D/g, "").slice(0, 8);
  if (digits.length === 8) {
    const startYear = Number(digits.slice(0, 4));
    const endYear = Number(digits.slice(4, 8));
    if (startYear >= 1900 && startYear <= 2100) {
      return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    }
    if (endYear >= 1900 && endYear <= 2100) {
      return `${digits.slice(4, 8)}-${digits.slice(0, 2)}-${digits.slice(2, 4)}`;
    }
  }
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

/**
 * The value a text-fallback date field settles on at blur. A typed entry
 * (valid or partial) stays as typed; an EMPTIED field restores the
 * controlled value, so the field never sits blank while a date is stored —
 * the native desktop date input is controlled by the stored value and
 * behaves the same way. Returns "" only when there is no controlled value
 * to restore (uncontrolled usage).
 */
export function resolveDateInputBlurValue(normalized: string, controlledValue?: string) {
  if (normalized) return normalized;
  return controlledValue ?? "";
}

/**
 * Whether the value a text-fallback field settles on at blur must be
 * notified to consumers via onChange. Typing handlers notify with the
 * as-typed value, which consumers reject while it is not a complete ISO
 * date; when blur settling pads a settled entry into a valid date
 * (2019-07-4 -> 2019-07-04), that settled date would otherwise never
 * reach the stored state and the display would silently diverge from
 * it. An unchanged value needs no notice, and an invalid settled value
 * is not notified (the field shows its error instead).
 */
export function shouldNotifyDateInputBlurValue(valueBeforeBlur: string, settled: string) {
  if (settled === valueBeforeBlur) return false;
  return !settled || isValidIsoDateInput(settled);
}

export function formatDateInput(date: Date) {
  if (!Number.isFinite(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatTimeInput(date: Date, fallback = DEFAULT_TIME) {
  if (!Number.isFinite(date.getTime())) return fallback;
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function normalizeTimeInput(time: string, fallback = DEFAULT_TIME) {
  if (!time) return fallback;
  if (time.length === 5) return `${time}:00`;
  return time;
}

export function combineDateTime(date: string, time: string, timezone?: string, fallback = DEFAULT_TIME) {
  if (!date) return null;
  const normalizedTime = normalizeTimeInput(time, fallback);

  if (!timezone || timezone === "UTC") {
    const combined = new Date(`${date}T${normalizedTime}`);
    if (!Number.isFinite(combined.getTime())) return null;
    return combined.toISOString();
  }

  try {
    const [yearStr, monthStr, dayStr] = date.split("-");
    const [hourStr, minuteStr] = normalizedTime.split(":");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    const hour = Number(hourStr);
    const minute = Number(minuteStr);

    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day) ||
      !Number.isFinite(hour) ||
      !Number.isFinite(minute)
    ) {
      return null;
    }

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

    // Zone offset in force at `instant`: the instant minus its own wall
    // fields read as UTC (negative east of Greenwich).
    const probeOffsetMs = (instant: Date): number => {
      const parts = formatter.formatToParts(instant);
      const localYear = Number(parts.find((p) => p.type === "year")?.value);
      const localMonth = Number(parts.find((p) => p.type === "month")?.value);
      const localDay = Number(parts.find((p) => p.type === "day")?.value);
      const localHourPart = Number(parts.find((p) => p.type === "hour")?.value);
      // Some engines report midnight as hour 24 with the day already
      // advanced; normalize it (as dateTime.ts's zoned helper does) or
      // Date.UTC counts the day twice and the instant lands a day early.
      const localHour = localHourPart === 24 ? 0 : localHourPart;
      const localMinute = Number(parts.find((p) => p.type === "minute")?.value);

      const localMs = Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute, 0);
      return instant.getTime() - localMs;
    };

    const targetLocalMs = Date.UTC(year, month - 1, day, hour, minute, 0);

    // The offset must be the one in force at the RESULTING instant, not
    // only at the entered wall time read as UTC: beside a DST transition
    // the two differ by an hour, so a single-pass conversion read back an
    // hour off (03:30 in New York on 2026-03-08 came back as 04:30).
    // Resolve with a fixed two refinement passes, re-sampling the offset
    // at each candidate instant; a stable offset short-circuits, so
    // non-transition inputs keep the exact result the single pass has
    // always produced.
    let offsetMs = probeOffsetMs(testDate);
    let result = new Date(targetLocalMs + offsetMs);
    for (let pass = 0; pass < 2; pass += 1) {
      if (!Number.isFinite(result.getTime())) break;
      const refinedOffsetMs = probeOffsetMs(result);
      if (refinedOffsetMs === offsetMs) break;
      offsetMs = refinedOffsetMs;
      result = new Date(targetLocalMs + offsetMs);
    }

    if (!Number.isFinite(result.getTime())) return null;
    return result.toISOString();
  } catch (error) {
    console.warn("Failed to convert timezone in combineDateTime:", timezone, error);
    const combined = new Date(`${date}T${normalizedTime}`);
    if (!Number.isFinite(combined.getTime())) return null;
    return combined.toISOString();
  }
}

export function toISODate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getDateInputPlaceholder(
  requestedPlaceholder: string | undefined,
  useTextFallback: boolean,
) {
  if (!useTextFallback) return requestedPlaceholder ?? STANDARD_DATE_PLACEHOLDER;
  if (!requestedPlaceholder || requestedPlaceholder === STANDARD_DATE_PLACEHOLDER) {
    return IOS_DATE_FALLBACK_PLACEHOLDER;
  }
  return requestedPlaceholder;
}
