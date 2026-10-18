/**
 * IANA timezone lookup for geocoded coordinates.
 *
 * Kept in its own module because tz-lookup carries a large dataset:
 * bundle-sensitive surfaces (the homepage hero) load this lazily via
 * dynamic import, while the editor imports it directly.
 */
import tzLookup from "tz-lookup";

/**
 * Timezone for a coordinate pair, with a documented fallback. Mirrors the
 * editor's long-standing behaviour: keep the caller's timezone when the
 * lookup cannot resolve, defaulting to "UTC".
 */
export function lookupGeocodeTimezone(latitude: number, longitude: number, fallback: string): string {
  try {
    return tzLookup(latitude, longitude);
  } catch {
    return fallback || "UTC";
  }
}
