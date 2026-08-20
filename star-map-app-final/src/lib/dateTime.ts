export function formatDateTimeForLocation(dateTime: string, timeZone?: string) {
  const date = new Date(dateTime);
  if (!Number.isFinite(date.getTime())) return null;
  const resolvedZone = typeof timeZone === "string" && timeZone.trim() ? timeZone.trim() : "UTC";
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: resolvedZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const get = (type: Intl.DateTimeFormatPart["type"]) =>
      parts.find((p) => p.type === type)?.value;

    const year = get("year");
    const month = get("month");
    const day = get("day");
    const hour = get("hour");
    const minute = get("minute");

    if (!year || !month || !day || !hour || !minute) return null;
    return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
  } catch {
    // Invalid IANA timezone must not crash render paths that call Intl.
    return null;
  }
}

function isValidCalendarYmd(year: number, month: number, day: number): boolean {
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

function parseYmdParam(dateParam: string): { year: number; month: number; day: number } | null {
  const trimmed = dateParam.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  if (!isValidCalendarYmd(year, month, day)) return null;
  return { year, month, day };
}

/**
 * Convert a wall-clock local date/time in `timeZone` to a UTC Date.
 * Mirrors the existing astronomy/dateInput offset approach (no new provider).
 */
function zonedWallTimeToUtcDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date | null {
  try {
    const testDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(testDate);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const localYear = get("year");
    const localMonth = get("month");
    const localDay = get("day");
    let localHour = get("hour");
    const localMinute = get("minute");
    // Some engines report midnight as 24.
    if (localHour === 24) localHour = 0;

    if (
      ![localYear, localMonth, localDay, localHour, localMinute].every((value) =>
        Number.isFinite(value)
      )
    ) {
      return null;
    }

    const localMs = Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute, 0);
    const offsetMs = testDate.getTime() - localMs;
    const targetLocalMs = Date.UTC(year, month - 1, day, hour, minute, 0);
    const result = new Date(targetLocalMs + offsetMs);
    if (!Number.isFinite(result.getTime())) return null;
    return result;
  } catch {
    return null;
  }
}

/**
 * Parse a YYYY-MM-DD editor query date into an ISO instant.
 *
 * - With `timeZone`: noon on that calendar date in the resolved city timezone
 *   (prevents browser/city TZ skew from shifting the intended calendar day).
 * - Without `timeZone`: preserves legacy browser-local noon behavior for
 *   generic/non-city name-only handoffs.
 */
export function parseCalendarDateParamToIso(
  dateParam: string,
  timeZone?: string | null
): string | null {
  const ymd = parseYmdParam(dateParam);
  if (!ymd) return null;
  const { year, month, day } = ymd;
  const resolvedZone = typeof timeZone === "string" ? timeZone.trim() : "";

  if (!resolvedZone) {
    const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
      return null;
    }
    return parsed.toISOString();
  }

  const zoned = zonedWallTimeToUtcDate(year, month, day, 12, 0, resolvedZone);
  if (!zoned) return null;

  const formatted = formatDateTimeForLocation(zoned.toISOString(), resolvedZone);
  if (!formatted) return null;
  const expected = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (formatted.date !== expected) return null;
  return zoned.toISOString();
}
