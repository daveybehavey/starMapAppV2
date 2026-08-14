import { formatLocationDisplay, type SeoLocation } from "@/data/seoLocations";
import { getSeoLocationCoordinates } from "@/data/seoLocationCoordinates";

export type EditorLocationPrefill = {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

export type EditorLocationQueryResult = EditorLocationPrefill & {
  /** True only when lat/lon were present and valid in the query. */
  hasResolvedCoordinates: boolean;
};

type LocationPrefillInput = string | EditorLocationPrefill | null | undefined;

function splitHref(href: string): { path: string; query: string; hash: string } {
  const hashIndex = href.indexOf("#");
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  const queryIndex = withoutHash.indexOf("?");
  const path = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "";
  return { path, query, hash };
}

export function isValidEditorCoordinatePair(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * True when `timeZone` is accepted by `Intl.DateTimeFormat`.
 * Empty/whitespace is not valid — callers choose a documented fallback separately.
 */
export function isValidEditorTimeZone(timeZone: string): boolean {
  const trimmed = timeZone.trim();
  if (!trimmed) return false;
  try {
    // Throws RangeError for unknown IANA zone identifiers.
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(0);
    return true;
  } catch {
    return false;
  }
}

/**
 * True when the editor has a named place with confirmed coordinates.
 * The unset default `(0,0)` is not treated as a confirmed selection, so a
 * name-only handoff cannot unlock/reveal a wrong sky.
 */
export function hasConfirmedEditorLocation(location: {
  name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): boolean {
  const name = location.name?.trim() ?? "";
  if (!name) return false;
  const latitude = typeof location.latitude === "number" ? location.latitude : Number.NaN;
  const longitude = typeof location.longitude === "number" ? location.longitude : Number.NaN;
  if (!isValidEditorCoordinatePair(latitude, longitude)) return false;
  // Store default before geocode confirmation.
  if (latitude === 0 && longitude === 0) return false;
  return true;
}

/**
 * Resolve a city landing into a full editor prefill (name + coordinates + timezone).
 * Returns null when the slug has no canonical coordinates.
 */
export function resolveSeoLocationEditorPrefill(location: SeoLocation): EditorLocationPrefill | null {
  const coords = getSeoLocationCoordinates(location.slug);
  if (!coords) return null;
  return {
    name: formatLocationDisplay(location),
    latitude: coords.latitude,
    longitude: coords.longitude,
    timezone: coords.timezone,
  };
}

/**
 * Append editor location prefill params.
 * - string: name only (legacy / generic paths); strips any prior lat/lon/tz
 * - object: name + lat + lon + tz so the editor can treat the city as selected
 */
export function withEditorLocation(href: string, location?: LocationPrefillInput): string {
  if (location == null) return href;

  if (typeof location === "string") {
    const value = location.trim();
    if (!value) return href;
    const { path, query, hash } = splitHref(href);
    const params = new URLSearchParams(query);
    params.set("location", value);
    params.delete("lat");
    params.delete("lon");
    params.delete("tz");
    const search = params.toString();
    return search ? `${path}?${search}${hash}` : `${path}${hash}`;
  }

  const name = location.name.trim();
  if (!name || !isValidEditorCoordinatePair(location.latitude, location.longitude)) {
    return href;
  }

  const { path, query, hash } = splitHref(href);
  const params = new URLSearchParams(query);
  params.set("location", name);
  params.set("lat", String(location.latitude));
  params.set("lon", String(location.longitude));
  const tz = location.timezone.trim();
  params.set("tz", tz && isValidEditorTimeZone(tz) ? tz : "UTC");
  const search = params.toString();
  return search ? `${path}?${search}${hash}` : `${path}${hash}`;
}

type ParamGetter = { get(name: string): string | null };

/**
 * Parse editor location query params.
 *
 * - Valid lat+lon: resolved city selection (timezone validated; missing/invalid → UTC).
 * - Name-only: unresolved handoff — does **not** invent `(0,0)` as selected coordinates.
 *   Callers must apply name-only updates without wiping restored lat/lon/tz.
 */
export function parseEditorLocationQuery(params: ParamGetter): EditorLocationQueryResult | null {
  const name = params.get("location")?.trim() ?? "";
  if (!name) return null;

  const latRaw = params.get("lat");
  const lonRaw = params.get("lon");
  const tzRaw = params.get("tz")?.trim() ?? "";
  const latitude = latRaw == null || latRaw.trim() === "" ? Number.NaN : Number.parseFloat(latRaw);
  const longitude = lonRaw == null || lonRaw.trim() === "" ? Number.NaN : Number.parseFloat(lonRaw);
  const hasResolvedCoordinates = isValidEditorCoordinatePair(latitude, longitude);

  if (!hasResolvedCoordinates) {
    // Unresolved name-only: keep fields inert. Do not invent (0,0)/UTC as a selection.
    return {
      name,
      latitude: Number.NaN,
      longitude: Number.NaN,
      timezone: "",
      hasResolvedCoordinates: false,
    };
  }

  // Documented safe fallback when tz is missing or not a valid IANA identifier.
  const timezone = tzRaw && isValidEditorTimeZone(tzRaw) ? tzRaw : "UTC";

  return {
    name,
    latitude,
    longitude,
    timezone,
    hasResolvedCoordinates: true,
  };
}

/**
 * Pure apply helper for regression coverage.
 * - Resolved city query: always replaces name+lat+lon+timezone (no stale draft coords).
 * - Name-only query: updates name only; preserves prior coordinates/timezone.
 */
export function applyEditorLocationQueryToState(
  previous: { name: string; latitude: number; longitude: number; timezone: string },
  params: ParamGetter
): { name: string; latitude: number; longitude: number; timezone: string; hasResolvedCoordinates: boolean } | null {
  const parsed = parseEditorLocationQuery(params);
  if (!parsed) return null;
  if (!parsed.hasResolvedCoordinates) {
    return {
      name: parsed.name,
      latitude: previous.latitude,
      longitude: previous.longitude,
      timezone: previous.timezone,
      hasResolvedCoordinates: false,
    };
  }
  return {
    name: parsed.name,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    timezone: parsed.timezone,
    hasResolvedCoordinates: true,
  };
}
