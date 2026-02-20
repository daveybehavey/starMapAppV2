const CANONICAL_OCCASION_REDIRECTS = {
  anniversary: "/anniversary",
  birthday: "/birthday",
  wedding: "/wedding",
} as const;

export const INDEXABLE_OCCASION_SLUGS = [
  "engagement",
  "proposal",
  "new-baby",
  "memorial",
  "graduation",
  "valentines-day",
  "mothers-day",
  "fathers-day",
  "christmas",
  "first-date",
  "long-distance",
  "retirement",
] as const;

export const INDEXABLE_LOCATION_SLUGS = [
  "new-york-ny",
  "los-angeles-ca",
  "chicago-il",
  "houston-tx",
  "san-diego-ca",
  "dallas-tx",
  "austin-tx",
  "san-francisco-ca",
  "seattle-wa",
  "denver-co",
  "washington-dc",
  "boston-ma",
  "nashville-tn",
  "las-vegas-nv",
  "atlanta-ga",
  "miami-fl",
  "new-orleans-la",
  "portland-or",
  "toronto-on",
  "vancouver-bc",
  "montreal-qc",
  "london-uk",
  "paris-fr",
  "tokyo-jp",
  "singapore-sg",
  "sydney-au",
] as const;

export function getCanonicalOccasionPath(slug: string): string | null {
  return CANONICAL_OCCASION_REDIRECTS[slug as keyof typeof CANONICAL_OCCASION_REDIRECTS] ?? null;
}

export function resolveOccasionIntentPath(slug: string): string {
  return getCanonicalOccasionPath(slug) ?? `/star-map-for/${slug}`;
}

export function isIndexableOccasionSlug(slug: string): boolean {
  return INDEXABLE_OCCASION_SLUGS.includes(slug as (typeof INDEXABLE_OCCASION_SLUGS)[number]);
}

export function isIndexableLocationSlug(slug: string): boolean {
  return INDEXABLE_LOCATION_SLUGS.includes(slug as (typeof INDEXABLE_LOCATION_SLUGS)[number]);
}

