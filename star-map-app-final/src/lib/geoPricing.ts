import type { NextRequest } from "next/server";

const COUNTRY_REGEX = /^[A-Z]{2}$/;
const DEFAULT_MIN_GEO_DIGITAL_CENTS = 300;

type GeoPriceMap = Record<string, number>;

function parseBool(value: string | undefined) {
  if (!value || !value.trim()) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseIntEnv(value: string | undefined, fallback: number) {
  const parsed = value ? Number.parseInt(value.trim(), 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
}

function normalizeCountry(raw: string | null | undefined) {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  return COUNTRY_REGEX.test(code) ? code : null;
}

function parseGeoPriceMap(raw: string | undefined, minCents: number): GeoPriceMap {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: GeoPriceMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      const country = normalizeCountry(key);
      const cents = Number(value);
      if (!country || !Number.isFinite(cents) || cents < minCents) continue;
      next[country] = Math.round(cents);
    }
    return next;
  } catch {
    return {};
  }
}

let cachedRaw: string | undefined;
let cachedMin = DEFAULT_MIN_GEO_DIGITAL_CENTS;
let cachedMap: GeoPriceMap = {};

function getGeoPriceMap() {
  const raw = process.env.GEO_DIGITAL_SINGLE_PRICING_JSON;
  const minCents = parseIntEnv(process.env.GEO_DIGITAL_SINGLE_MIN_CENTS, DEFAULT_MIN_GEO_DIGITAL_CENTS);
  if (raw === cachedRaw && minCents === cachedMin) return cachedMap;
  cachedRaw = raw;
  cachedMin = minCents;
  cachedMap = parseGeoPriceMap(raw, minCents);
  return cachedMap;
}

export function getRequestCountry(req: NextRequest) {
  return (
    normalizeCountry(req.headers.get("cf-ipcountry")) ??
    normalizeCountry(req.headers.get("x-vercel-ip-country")) ??
    normalizeCountry(req.headers.get("cloudfront-viewer-country")) ??
    normalizeCountry(req.headers.get("x-country")) ??
    null
  );
}

export function getGeoDigitalSinglePrice(country: string | null | undefined) {
  const enabled = parseBool(process.env.GEO_DIGITAL_SINGLE_PRICING_ENABLED);
  if (!enabled) return null;
  const normalizedCountry = normalizeCountry(country);
  if (!normalizedCountry) return null;
  const priceMap = getGeoPriceMap();
  const cents = priceMap[normalizedCountry];
  if (!Number.isFinite(cents) || cents <= 0) return null;
  return {
    country: normalizedCountry,
    amountCents: cents,
  };
}
