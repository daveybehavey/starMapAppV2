"use client";

export const DEFAULT_TIME = "00:00:00";
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

export function normalizeFlexibleDateInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const yearFirst = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(trimmed);
  if (yearFirst) {
    const [, y, m, d] = yearFirst;
    const candidate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    if (isValidIsoDateInput(candidate)) return candidate;
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

    const parts = formatter.formatToParts(testDate);
    const localYear = Number(parts.find((p) => p.type === "year")?.value);
    const localMonth = Number(parts.find((p) => p.type === "month")?.value);
    const localDay = Number(parts.find((p) => p.type === "day")?.value);
    const localHour = Number(parts.find((p) => p.type === "hour")?.value);
    const localMinute = Number(parts.find((p) => p.type === "minute")?.value);

    const localMs = Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute, 0);
    const utcMs = testDate.getTime();
    const offsetMs = utcMs - localMs;

    const targetLocalMs = Date.UTC(year, month - 1, day, hour, minute, 0);
    const result = new Date(targetLocalMs + offsetMs);

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
