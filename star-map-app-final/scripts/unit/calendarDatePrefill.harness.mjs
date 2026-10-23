/**
 * Keep in sync with src/lib/dateTime.ts calendar-date helpers.
 */

export function formatDateTimeForLocation(dateTime, timeZone) {
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
    const get = (type) => parts.find((p) => p.type === type)?.value;

    const year = get("year");
    const month = get("month");
    const day = get("day");
    const hour = get("hour");
    const minute = get("minute");

    if (!year || !month || !day || !hour || !minute) return null;
    return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
  } catch {
    return null;
  }
}

function isValidCalendarYmd(year, month, day) {
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

function parseYmdParam(dateParam) {
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

function zonedWallTimeToUtcDate(year, month, day, hour, minute, timeZone) {
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

    // Zone offset in force at `instant`: the instant minus its own wall
    // fields read as UTC (negative east of Greenwich).
    const probeOffsetMs = (instant) => {
      const parts = formatter.formatToParts(instant);
      const get = (type) => Number(parts.find((part) => part.type === type)?.value);
      const localYear = get("year");
      const localMonth = get("month");
      const localDay = get("day");
      let localHour = get("hour");
      const localMinute = get("minute");
      if (localHour === 24) localHour = 0;

      if (![localYear, localMonth, localDay, localHour, localMinute].every((value) => Number.isFinite(value))) {
        return Number.NaN;
      }

      const localMs = Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute, 0);
      return instant.getTime() - localMs;
    };

    const targetLocalMs = Date.UTC(year, month - 1, day, hour, minute, 0);

    // Two-pass refinement, in sync with src/lib/dateTime.ts (A2-6).
    let offsetMs = probeOffsetMs(testDate);
    if (!Number.isFinite(offsetMs)) return null;
    let result = new Date(targetLocalMs + offsetMs);
    for (let pass = 0; pass < 2; pass += 1) {
      if (!Number.isFinite(result.getTime())) break;
      const refinedOffsetMs = probeOffsetMs(result);
      if (!Number.isFinite(refinedOffsetMs) || refinedOffsetMs === offsetMs) break;
      offsetMs = refinedOffsetMs;
      result = new Date(targetLocalMs + offsetMs);
    }
    if (!Number.isFinite(result.getTime())) return null;
    return result;
  } catch {
    return null;
  }
}

export function parseCalendarDateParamToIso(dateParam, timeZone) {
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

  // 21:00 mirrors EVENING_DEFAULT_TIME in src/lib/dateTime.ts: a date-only
  // prefill with a resolved city timezone lands on the evening default.
  const zoned = zonedWallTimeToUtcDate(year, month, day, 21, 0, resolvedZone);
  if (!zoned) return null;

  const formatted = formatDateTimeForLocation(zoned.toISOString(), resolvedZone);
  if (!formatted) return null;
  const expected = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (formatted.date !== expected) return null;
  return zoned.toISOString();
}
