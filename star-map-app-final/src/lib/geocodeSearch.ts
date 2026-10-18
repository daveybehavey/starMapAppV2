/**
 * Shared geocoding search logic for the `/api/geocode` endpoint.
 *
 * Both the editor's LocationSearch and the quick-start LocationTypeahead
 * resolve places through this module, so the funnel's front door and the
 * editor itself search, cache, and name places the same way. No new
 * provider: this is the existing Nominatim-backed internal endpoint.
 */
import tzLookup from "tz-lookup";
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
  const data = (await res.json()) as GeocodeResult[];
  cache.set(cacheKey(trimmed), data);
  return data;
}

/**
 * IANA timezone for a coordinate pair, with a documented fallback.
 * Mirrors the editor's previous behaviour: keep the caller's timezone
 * when the lookup cannot resolve, defaulting to "UTC".
 */
export function lookupGeocodeTimezone(latitude: number, longitude: number, fallback: string): string {
  try {
    return tzLookup(latitude, longitude);
  } catch {
    return fallback || "UTC";
  }
}
