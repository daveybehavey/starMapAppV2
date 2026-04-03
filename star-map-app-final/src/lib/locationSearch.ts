import tzLookup from "tz-lookup";

export type GeocodeSuggestion = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  category?: string;
  type?: string;
  countryCode?: string;
  state?: string;
};

export function inferTimezoneFromCoordinates(
  latitude: number,
  longitude: number,
  fallback = "UTC",
): string {
  try {
    return tzLookup(latitude, longitude);
  } catch {
    return fallback;
  }
}

export async function fetchGeocodeSuggestions(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodeSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const res = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`, {
    signal,
  });

  if (!res.ok) {
    throw new Error("Location search failed");
  }

  return (await res.json()) as GeocodeSuggestion[];
}

export async function resolveGeocodeSuggestion(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodeSuggestion | null> {
  const results = await fetchGeocodeSuggestions(query, signal);
  return results[0] ?? null;
}
