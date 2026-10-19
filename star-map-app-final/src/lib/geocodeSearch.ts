/**
 * Shared geocoding search logic for the `/api/geocode` endpoint.
 *
 * Both the editor's LocationSearch and the quick-start LocationTypeahead
 * resolve places through this module, so the funnel's front door and the
 * editor itself search, cache, and name places the same way. No new
 * provider: this is the existing Nominatim-backed internal endpoint.
 * (Timezone resolution lives in lib/geocodeTimezone so bundle-sensitive
 * surfaces can load tz-lookup lazily.)
 *
 * Results are normalized here — once, for both surfaces — because the
 * raw Nominatim display names are verbose ("Tofino, Alberni-Clayoquot
 * Regional District, British Columbia, V0R 2Z0, Canada") and the same
 * place can come back twice with identical name and coordinates.
 * Whatever a visitor picks in either surface therefore stores the same
 * short name ("Tofino, British Columbia, Canada") in the editor draft
 * and on the printed map.
 */
import { LRUCache } from "@/lib/lruCache";

export type GeocodeResult = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  category?: string;
  type?: string;
  countryCode?: string;
  state?: string;
};

/** Postcode-shaped segments (CA, UK, US ZIP, bare numeric) carry no place meaning. */
const POSTCODE_SEGMENT_PATTERNS: readonly RegExp[] = [
  /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/, // Canada: V0R 2Z0
  /^[A-Za-z]{1,2}\d[A-Za-z\d]?[ -]?\d[A-Za-z]{2}$/, // UK: LL61 5TX, SW1A 1AA
  /^\d{5}(-\d{4})?$/, // US ZIP
  /^\d{4,6}$/, // bare numeric postcodes (AU / DE / …)
];

function isPostcodeSegment(segment: string): boolean {
  return POSTCODE_SEGMENT_PATTERNS.some((pattern) => pattern.test(segment));
}

/**
 * Administrative segments that pad a display name without identifying
 * the place: regional districts, counties, and metropolitan-country
 * qualifiers ("France métropolitaine" next to a plain "France").
 * Only applied past the first segment — a place actually named e.g.
 * "X County" keeps its name.
 */
function isAdminNoiseSegment(segment: string): boolean {
  return (
    /regional district/i.test(segment) ||
    / county$/i.test(segment) ||
    / métropolitaine$/i.test(segment)
  );
}

/**
 * Shorten a raw geocoder display name to "city, region, country" shape.
 *
 * Conservative by construction: postcode and administrative-noise
 * segments drop out, duplicate segments collapse, and names with more
 * than three remaining segments keep the first two plus the last (the
 * country). A name made only of droppable segments is returned
 * unchanged — shortening must never empty a name out.
 */
export function shortenGeocodePlaceName(name: string): string {
  const segments = name
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (segments.length === 0) return name;

  const seen = new Set<string>();
  const kept: string[] = [];
  segments.forEach((segment, index) => {
    if (isPostcodeSegment(segment)) return;
    if (index > 0 && isAdminNoiseSegment(segment)) return;
    const key = segment.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    kept.push(segment);
  });

  if (kept.length === 0) return name;
  if (kept.length <= 3) return kept.join(", ");
  return [kept[0], kept[1], kept[kept.length - 1]].join(", ");
}

/**
 * Trim result names and drop exact duplicates — same (shortened) name
 * at the same coordinates. Places that merely share a name but sit at
 * different coordinates are distinct and all survive.
 */
export function normalizeGeocodeResults(results: GeocodeResult[]): GeocodeResult[] {
  const seen = new Set<string>();
  const normalized: GeocodeResult[] = [];
  for (const result of results) {
    const name = shortenGeocodePlaceName(result.name);
    const key = `${name.toLowerCase()}|${result.latitude}|${result.longitude}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(name === result.name ? result : { ...result, name });
  }
  return normalized;
}

const cache = new LRUCache<string, GeocodeResult[]>(50);

function cacheKey(query: string): string {
  return query.trim().toLowerCase();
}

/** Cached results for a query, or undefined when the query is not cached. */
export function getCachedGeocodeResults(query: string): GeocodeResult[] | undefined {
  if (!query.trim()) return undefined;
  return cache.get(cacheKey(query));
}

/**
 * Fetch and cache geocode results from the internal endpoint.
 * Throws Error("Search failed") when the endpoint responds non-OK; aborts
 * propagate as AbortError like a raw fetch so callers can distinguish them.
 */
export async function fetchGeocodeResults(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const res = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`, { signal });
  if (!res.ok) {
    throw new Error("Search failed");
  }
  const data = normalizeGeocodeResults((await res.json()) as GeocodeResult[]);
  cache.set(cacheKey(trimmed), data);
  return data;
}
