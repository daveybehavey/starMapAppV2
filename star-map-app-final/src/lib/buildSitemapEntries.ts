import type { MetadataRoute } from "next";
import { seoLocations } from "../data/seoLocations";
import { seoOccasions } from "../data/seoOccasions";
import {
  getCanonicalOccasionPath,
  isIndexableLocationSlug,
  isIndexableOccasionSlug,
} from "../data/seoIndexing";
import { POLICY_LAST_UPDATED_ISO } from "./policyMeta";

/** Slugs that redirect to another blog URL (`next.config.mjs`); omit from sitemap to avoid crawl hops. */
export const BLOG_SITEMAP_EXCLUDED_SLUGS = new Set([
  "most-meaningful-valentines-day-gift-custom-star-map",
]);

export type SitemapBlogPostRef = {
  slug: string;
  date: string;
};

export type BuildSitemapOptions = {
  baseUrl: string;
  blogPosts: SitemapBlogPostRef[];
  bulkEnabled?: boolean;
  shopNavEnabled?: boolean;
};

/**
 * Build sitemap entries with honest lastModified values only.
 *
 * - Blog posts: each post's `date`
 * - Static indexable blog routes: fixed content dates on those entries
 * - Policy pages: `POLICY_LAST_UPDATED_ISO` from policyMeta
 * - Marketing, hub, location, and occasion URLs: omit lastModified (no generation-time "now")
 */
export function buildSitemapEntries(options: BuildSitemapOptions): MetadataRoute.Sitemap {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const bulkEnabled = Boolean(options.bulkEnabled);
  const shopNavEnabled = Boolean(options.shopNavEnabled);

  const staticIndexableBlogRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/blog/valentines-day-star-map`,
      lastModified: "2025-02-01",
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  const blogEntries: MetadataRoute.Sitemap = options.blogPosts
    .filter((post) => !BLOG_SITEMAP_EXCLUDED_SLUGS.has(post.slug))
    .map((post) => ({
      url: `${baseUrl}/blog/${post.slug}`,
      lastModified: post.date,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));

  // lastModified honesty: only stamp dates the codebase already owns
  // (blog post dates, policy revision ISO dates, static blog route dates).
  // Do not use generation-time "now" — Google ignores lastmod when it is always fake.
  // Marketing, hub, location, and occasion URLs omit lastModified until a truthful
  // content date exists (do not invent dates from git history).
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...(shopNavEnabled
      ? [
          {
            url: `${baseUrl}/shop`,
            changeFrequency: "weekly" as const,
            priority: 0.85,
          },
        ]
      : []),
    {
      url: `${baseUrl}/anniversary`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/birthday`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/hd-star-map`,
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      url: `${baseUrl}/wedding`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/constellation-map`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/star-map-poster`,
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      url: `${baseUrl}/star-map-poster/framed-hd-bundle`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/night-sky-map-gift`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/christmas-star-map-gift`,
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: `${baseUrl}/star-map-generator`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/custom-night-sky-map`,
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      url: `${baseUrl}/personalized-star-map`,
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      url: `${baseUrl}/best-personalized-star-map-gift`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/how-to-print-star-map`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/star-map-gift`,
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      url: `${baseUrl}/star-map-gift-formats`,
      changeFrequency: "monthly",
      priority: 0.75,
    },
    {
      url: `${baseUrl}/star-map-gallery`,
      changeFrequency: "monthly",
      priority: 0.75,
    },
    {
      url: `${baseUrl}/star-map-gift-ideas`,
      changeFrequency: "monthly",
      priority: 0.75,
    },
    {
      url: `${baseUrl}/blog`,
      changeFrequency: "weekly",
      priority: 0.75,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: POLICY_LAST_UPDATED_ISO.privacy,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${baseUrl}/contact`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${baseUrl}/support`,
      changeFrequency: "yearly",
      priority: 0.25,
    },
    {
      url: `${baseUrl}/about`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: POLICY_LAST_UPDATED_ISO.terms,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${baseUrl}/shipping`,
      lastModified: POLICY_LAST_UPDATED_ISO.shipping,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${baseUrl}/returns`,
      lastModified: POLICY_LAST_UPDATED_ISO.returns,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${baseUrl}/star-map-in`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/star-map-for`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    ...(bulkEnabled
      ? [
          {
            url: `${baseUrl}/bulk-event-orders`,
            changeFrequency: "monthly" as const,
            priority: 0.4,
          },
        ]
      : []),
  ];

  const locationEntries: MetadataRoute.Sitemap = seoLocations
    .filter((location) => isIndexableLocationSlug(location.slug))
    .map((location) => ({
      url: `${baseUrl}/star-map-in/${location.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));

  const occasionEntries: MetadataRoute.Sitemap = seoOccasions
    .filter((occasion) => isIndexableOccasionSlug(occasion.slug))
    .filter((occasion) => !getCanonicalOccasionPath(occasion.slug))
    .map((occasion) => ({
      url: `${baseUrl}/star-map-for/${occasion.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));

  return [...staticEntries, ...locationEntries, ...occasionEntries, ...staticIndexableBlogRoutes, ...blogEntries];
}
