import {
  Observer,
  Horizon,
  Body,
  HelioVector,
  GeoVector,
  GeoMoon,
  MoonPhase,
  EquatorFromVector,
  Illumination
} from "astronomy-engine";

import stars from "./data/stars.json";
import constellations from "./data/constellations.json";

export type StarPoint = {
  x: number;
  y: number;
  magnitude: number;
  opacity?: number;
  bv?: number;
};

export type PlanetName = "Mercury" | "Venus" | "Mars" | "Jupiter" | "Saturn";

export type PlanetPoint = {
  name: PlanetName;
  x: number;
  y: number;
  magnitude: number;
};

export type MoonPoint = {
  name: "Moon";
  x: number;
  y: number;
  phase: number;
};

export type VisibleSky = {
  stars: StarPoint[];
  planets: PlanetPoint[];
  moon: MoonPoint | null;
  constellations: { name: string; lines: [number, number][] }[];
};

export type StarHorizontal = {
  ra: number;
  dec: number;
  magnitude: number;
  altitude: number;
  azimuth: number;
};

export type VisibleStarParams = {
  /**
   * Exact stored instant (ISO 8601). When present, the sky is computed for
   * this instant directly — never reconstructed from wall-clock fields,
   * which cannot represent DST transition windows or the fold hour (E-1).
   * Takes precedence over date/time/timezone.
   */
  datetimeISO?: string;
  /** Wall-clock date (YYYY-MM-DD) in `timezone` — genuine wall-time input only. */
  date?: string;
  time?: string;
  lat: number;
  lon: number;
  timezone?: string;
  bortle?: number;
  showConstellations?: boolean;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const toUTCDateFromLocal = (dateStr: string, timeStr: string, timezone: string): Date | null => {
  const [yearRaw, monthRaw, dayRaw] = dateStr.split("-").map(Number);
  if (!yearRaw || !monthRaw || !dayRaw) return null;
  const [hourRaw, minuteRaw] = timeStr.split(":").map(Number);
  if (Number.isNaN(hourRaw) || Number.isNaN(minuteRaw)) return null;

  const hour = clamp(hourRaw, 0, 23);
  const minute = clamp(minuteRaw, 0, 59);

  // Parse as local time in the specified timezone, then convert to UTC.
  // CONTRACT: genuine wall-time input only (a user picking a date + time).
  // The offset is resolved at the RESULTING instant (two refinement
  // passes, mirroring dateInput.combineDateTime), so wall times on DST
  // transition days land correctly. The fold hour's two occurrences
  // still cannot be distinguished — the wall fields have already
  // destroyed that information; the refinement deterministically
  // settles on the first occurrence. Never use this to rebuild a stored
  // instant for rendering; pass the instant itself
  // (VisibleStarParams.datetimeISO) instead.
  try {
    const testDate = new Date(Date.UTC(yearRaw, monthRaw - 1, dayRaw, hour, minute, 0));
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
    // fields read as UTC (negative east of Greenwich). Some engines
    // report midnight as hour 24 with the day already advanced;
    // normalize it (as dateTime.ts's zoned helper does) or Date.UTC
    // counts the day twice and the instant lands a day early (A2-5).
    const probeOffsetMs = (instant: Date): number => {
      const parts = formatter.formatToParts(instant);
      const localYear = Number(parts.find(p => p.type === "year")?.value);
      const localMonth = Number(parts.find(p => p.type === "month")?.value);
      const localDay = Number(parts.find(p => p.type === "day")?.value);
      const localHourPart = Number(parts.find(p => p.type === "hour")?.value);
      const localHour = localHourPart === 24 ? 0 : localHourPart;
      const localMinute = Number(parts.find(p => p.type === "minute")?.value);

      const localMs = Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute, 0);
      return instant.getTime() - localMs;
    };

    const targetLocalMs = Date.UTC(yearRaw, monthRaw - 1, dayRaw, hour, minute, 0);

    // Sample the offset at the entered wall time read as UTC, then
    // re-sample at each candidate instant: beside a DST transition the
    // two offsets differ by an hour, and only the offset in force at
    // the result is correct (A2-6). A stable offset short-circuits, so
    // non-transition inputs keep the exact single-pass result.
    let offsetMs = probeOffsetMs(testDate);
    let result = new Date(targetLocalMs + offsetMs);
    for (let pass = 0; pass < 2; pass += 1) {
      if (!Number.isFinite(result.getTime())) break;
      const refinedOffsetMs = probeOffsetMs(result);
      if (refinedOffsetMs === offsetMs) break;
      offsetMs = refinedOffsetMs;
      result = new Date(targetLocalMs + offsetMs);
    }
    return result;
  } catch (error) {
    console.warn("Failed to convert timezone:", timezone, error);
    // Fallback to treating as UTC
    return new Date(Date.UTC(yearRaw, monthRaw - 1, dayRaw, hour, minute, 0));
  }
};

import { LRUCache } from "./lruCache";

// Cache for expensive astronomy calculations
// Increased from 20 to 50 entries for better cache hit rate during editing sessions
const astronomyCache = new LRUCache<string, VisibleSky>(50);

function createAstronomyCacheKey(params: VisibleStarParams, width: number, height: number): string {
  const bortle = params.bortle ?? 4.5;
  const showConst = params.showConstellations ?? false;
  if (params.datetimeISO) {
    return `iso:${params.datetimeISO}|${params.lat}|${params.lon}|${bortle}|${width}|${height}|${showConst}`;
  }
  const time = params.time?.trim() || "00:00";
  const timezone = params.timezone || "UTC";
  return `${params.date}|${time}|${timezone}|${params.lat}|${params.lon}|${bortle}|${width}|${height}|${showConst}`;
}

export function computeVisibleStars(
  params: VisibleStarParams,
  width: number,
  height: number
): VisibleSky {
  // Check cache first
  const cacheKey = createAstronomyCacheKey(params, width, height);
  const cached = astronomyCache.get(cacheKey);
  if (cached) return cached;

  // E-1: a stored instant is consumed exactly. Reconstructing it from
  // wall-clock fields in the location zone loses an hour around DST
  // transitions and cannot name the fold hour's second occurrence at all.
  // The wall-field path remains only for genuine wall-time inputs.
  let date: Date | null = null;
  if (params.datetimeISO) {
    const parsed = new Date(params.datetimeISO);
    date = Number.isFinite(parsed.getTime()) ? parsed : null;
  } else if (params.date) {
    const time = params.time?.trim() || "00:00";
    const timezone = params.timezone || "UTC";
    date = toUTCDateFromLocal(params.date, time, timezone);
  }
  if (!date || Number.isNaN(date.getTime())) {
    return { stars: [], planets: [], moon: null, constellations: [] };
  }

  // Validate coordinates are within valid ranges
  if (!Number.isFinite(params.lat) || params.lat < -90 || params.lat > 90) {
    console.warn("Invalid latitude:", params.lat);
    return { stars: [], planets: [], moon: null, constellations: [] };
  }
  if (!Number.isFinite(params.lon) || params.lon < -180 || params.lon > 180) {
    console.warn("Invalid longitude:", params.lon);
    return { stars: [], planets: [], moon: null, constellations: [] };
  }

  const observer = new Observer(params.lat, params.lon, 0);
  const output: StarPoint[] = [];
  const visibleIndexByHip = new Map<number, number>();
  // Default to class 4.5 if no bortle provided to avoid NaN in calculations
  const bortle = params.bortle ? clamp(params.bortle, 1, 9) : 4.5;
  const catalogStars = stars as Array<{ hip: number; ra: number; dec: number; mag: number; bv?: number }>;

  for (const star of catalogStars) {
    // Convert RA/Dec → Horizon (Alt/Az)
    // Horizon accepts RA in sidereal hours and Dec in degrees
    const hor = Horizon(
      date,
      observer,
      star.ra,
      star.dec
    );

    // Only stars above the horizon
    if (hor.altitude <= 0) continue;

    // Polar projection
    const r = (90 - hor.altitude) / 90;
    const angle = (hor.azimuth * Math.PI) / 180;

    const radius = Math.min(width, height) * 0.45;
    const x = width / 2 + r * Math.sin(angle) * radius;
    const y = height / 2 - r * Math.cos(angle) * radius;
    const mag = star.mag;
    const opacity = mag < 4
      ? 1
      : Math.max(0.2, 1 - ((bortle - 1) / 8) * ((mag - 4) / 2));
    const nextIndex = output.length;
    output.push({
      x,
      y,
      magnitude: mag,
      opacity,
      bv: star.bv
    });
    if (Number.isFinite(star.hip)) {
      visibleIndexByHip.set(star.hip, nextIndex);
    }
  }

  const visibleConstellations: { name: string; lines: [number, number][] }[] = [];
  if (params.showConstellations) {
    const constellationList = constellations as Array<{
      name: string;
      lines: [number, number][];
    }>;
    for (const constellation of constellationList) {
      const lines: [number, number][] = [];
      for (const [hipA, hipB] of constellation.lines) {
        const indexA = visibleIndexByHip.get(hipA);
        const indexB = visibleIndexByHip.get(hipB);
        if (indexA !== undefined && indexB !== undefined) {
          lines.push([indexA, indexB]);
        }
      }
      if (lines.length > 0) {
        visibleConstellations.push({ name: constellation.name, lines });
      }
    }
  }

  const planets: PlanetPoint[] = [];
  const planetTargets: Array<{ name: PlanetName; body: Body }> = [
    { name: "Mercury", body: Body.Mercury },
    { name: "Venus", body: Body.Venus },
    { name: "Mars", body: Body.Mars },
    { name: "Jupiter", body: Body.Jupiter },
    { name: "Saturn", body: Body.Saturn },
  ];

  for (const target of planetTargets) {
    HelioVector(target.body, date);
    const geo = GeoVector(target.body, date, true);
    const eq = EquatorFromVector(geo);
    const hor = Horizon(date, observer, eq.ra, eq.dec);
    if (hor.altitude <= 0) continue;
    const r = (90 - hor.altitude) / 90;
    const angle = (hor.azimuth * Math.PI) / 180;
    const radius = Math.min(width, height) * 0.45;
    const x = width / 2 + r * Math.sin(angle) * radius;
    const y = height / 2 - r * Math.cos(angle) * radius;
    // Calculate apparent magnitude for brightness-based sizing
    const illum = Illumination(target.body, date);
    planets.push({ name: target.name, x, y, magnitude: illum.mag });
  }

  let moon: MoonPoint | null = null;
  const moonVec = GeoMoon(date);
  const moonEq = EquatorFromVector(moonVec);
  const moonHor = Horizon(date, observer, moonEq.ra, moonEq.dec);
  if (moonHor.altitude > 0) {
    const r = (90 - moonHor.altitude) / 90;
    const angle = (moonHor.azimuth * Math.PI) / 180;
    const radius = Math.min(width, height) * 0.45;
    const x = width / 2 + r * Math.sin(angle) * radius;
    const y = height / 2 - r * Math.cos(angle) * radius;
    const phaseAngle = MoonPhase(date);
    const normalizedPhase = ((phaseAngle % 360) + 360) % 360;
    const phase = normalizedPhase / 360;
    moon = { name: "Moon", x, y, phase };
  }

  const result = { stars: output, planets, moon, constellations: visibleConstellations };

  // Store in cache (LRU eviction handled automatically)
  astronomyCache.set(cacheKey, result);

  return result;
}

/**
 * Compute which stars from the catalog are above the horizon for a given date and location.
 * Returns altitude/azimuth values only (no projection).
 * 
 * @param date - The date and time for the observation
 * @param latitude - Observer's latitude in degrees
 * @param longitude - Observer's longitude in degrees
 * @returns Array of stars above the horizon with their horizontal coordinates
 */
export function computeStarsAboveHorizon(
  date: Date,
  latitude: number,
  longitude: number
): StarHorizontal[] {
  const observer = new Observer(latitude, longitude, 0);
  const output: StarHorizontal[] = [];

  for (const star of stars) {
    // Convert RA/Dec → Horizon (Alt/Az) using astronomy-engine
    // Horizon accepts RA in sidereal hours and Dec in degrees
    const hor = Horizon(
      date,
      observer,
      star.ra,
      star.dec
    );

    // Only stars above the horizon
    if (hor.altitude <= 0) continue;

    output.push({
      ra: star.ra,
      dec: star.dec,
      magnitude: star.mag,
      altitude: hor.altitude,
      azimuth: hor.azimuth
    });
  }

  return output;
}
