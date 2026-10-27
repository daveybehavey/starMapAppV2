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
  "night-we-met",
  "mothers-day",
  "fathers-day",
  "christmas",
  "first-date",
  "long-distance",
  "retirement",
] as const;

/**
 * The five differentiated city-page survivors of the 2026-10-26 city-pages
 * prune (disposition map: 5 keep / 9 redirect to a survivor / 12 redirect to
 * /star-map-poster / 0 deleted). The 21 retired slugs permanently redirect via
 * next.config.mjs and must NOT be re-added here without differentiated
 * content meeting the survivor standard (see seoSurvivorContent.ts).
 */
export const INDEXABLE_LOCATION_SLUGS = [
  "vancouver-bc",
  "toronto-on",
  "new-york-ny",
  "los-angeles-ca",
  "london-uk",
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

