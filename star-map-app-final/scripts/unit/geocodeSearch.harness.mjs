/**
 * Keep in sync with the pure exports of src/lib/geocodeSearch.ts
 * (the fetch/cache functions are network-bound and intentionally not
 * mirrored; the test file pins that fetchGeocodeResults routes through
 * normalizeGeocodeResults).
 */

const POSTCODE_SEGMENT_PATTERNS = [
  /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/,
  /^[A-Za-z]{1,2}\d[A-Za-z\d]?[ -]?\d[A-Za-z]{2}$/,
  /^\d{5}(-\d{4})?$/,
  /^\d{4,6}$/,
];

function isPostcodeSegment(segment) {
  return POSTCODE_SEGMENT_PATTERNS.some((pattern) => pattern.test(segment));
}

function isAdminNoiseSegment(segment) {
  return (
    /regional district/i.test(segment) ||
    / county$/i.test(segment) ||
    / métropolitaine$/i.test(segment)
  );
}

export function shortenGeocodePlaceName(name) {
  const segments = name
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (segments.length === 0) return name;

  const seen = new Set();
  const kept = [];
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

export function normalizeGeocodeResults(results) {
  const seen = new Set();
  const normalized = [];
  for (const result of results) {
    const name = shortenGeocodePlaceName(result.name);
    const key = `${name.toLowerCase()}|${result.latitude}|${result.longitude}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(name === result.name ? result : { ...result, name });
  }
  return normalized;
}
