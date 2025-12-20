import {
  Observer,
  Horizon,
  Body,
  HelioVector,
  GeoVector,
  GeoMoon,
  MoonPhase,
  EquatorFromVector
} from "astronomy-engine";

import stars from "./data/stars.json";
import constellations from "./data/constellations.json";

export type StarPoint = {
  x: number;
  y: number;
  magnitude: number;
  opacity?: number;
};

export type PlanetName = "Mercury" | "Venus" | "Mars" | "Jupiter" | "Saturn";

export type PlanetPoint = {
  name: PlanetName;
  x: number;
  y: number;
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
  date: string;
  time?: string;
  lat: number;
  lon: number;
  bortle?: number;
  showConstellations?: boolean;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const toApproximateUTCDate = (dateStr: string, timeStr: string, lon: number): Date | null => {
  const [yearRaw, monthRaw, dayRaw] = dateStr.split("-").map(Number);
  if (!yearRaw || !monthRaw || !dayRaw) return null;
  const [hourRaw, minuteRaw] = timeStr.split(":").map(Number);
  if (Number.isNaN(hourRaw) || Number.isNaN(minuteRaw)) return null;

  const hour = clamp(hourRaw, 0, 23);
  const minute = clamp(minuteRaw, 0, 59);
  const utcMs = Date.UTC(yearRaw, monthRaw - 1, dayRaw, hour, minute, 0);
  const lonOffsetMs = (lon / 15) * 60 * 60 * 1000;
  return new Date(utcMs - lonOffsetMs);
};

export function computeVisibleStars(
  params: VisibleStarParams,
  width: number,
  height: number
): VisibleSky {
  const time = params.time?.trim() || "23:59";
  const date = toApproximateUTCDate(params.date, time, params.lon);
  if (!date || Number.isNaN(date.getTime())) {
    return { stars: [], planets: [], moon: null, constellations: [] };
  }

  const observer = new Observer(params.lat, params.lon, 0);
  const output: StarPoint[] = [];
  const visibleIndexByHip = new Map<number, number>();
  const bortle = params.bortle ? clamp(params.bortle, 1, 9) : null;
  const catalogStars = stars as Array<{ hip: number; ra: number; dec: number; mag: number }>;

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
    const opacity = bortle
      ? mag < 4
        ? 1
        : Math.max(0.2, 1 - ((bortle - 1) / 8) * ((mag - 4) / 2))
      : 1;
    const nextIndex = output.length;
    output.push({
      x,
      y,
      magnitude: mag,
      opacity
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
    planets.push({ name: target.name, x, y });
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

  return { stars: output, planets, moon, constellations: visibleConstellations };
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
