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
  params.set("tz", location.timezone.trim() || "UTC");
  const search = params.toString();
  return search ? `${path}?${search}${hash}` : `${path}${hash}`;
}

type ParamGetter = { get(name: string): string | null };

/**
 * Parse editor location query params into an explicit location state.
 * Always returns latitude/longitude/timezone fields so callers can overwrite
 * stale draft coordinates when applying a city (or name-only) prefill.
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

  return {
    name,
    latitude: hasResolvedCoordinates ? latitude : 0,
    longitude: hasResolvedCoordinates ? longitude : 0,
    timezone: hasResolvedCoordinates && tzRaw ? tzRaw : "UTC",
    hasResolvedCoordinates,
  };
}

/**
 * Pure apply helper for regression coverage: given any prior location (e.g. draft),
 * applying a query-derived location always replaces coordinates — never keeps stale
 * lat/lon under a new city name.
 */
export function applyEditorLocationQueryToState(
  _previous: { name: string; latitude: number; longitude: number; timezone: string },
  params: ParamGetter
): { name: string; latitude: number; longitude: number; timezone: string; hasResolvedCoordinates: boolean } | null {
  const parsed = parseEditorLocationQuery(params);
  if (!parsed) return null;
  return {
    name: parsed.name,
    // Explicit overwrite: do not spread/merge previous coordinates.
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    timezone: parsed.timezone,
    hasResolvedCoordinates: parsed.hasResolvedCoordinates,
  };
}
