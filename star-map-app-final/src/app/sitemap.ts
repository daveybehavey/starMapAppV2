import type { MetadataRoute } from "next";
import { blogPosts } from "@/lib/blogPosts";
import { seoLocations } from "@/data/seoLocations";
import { seoOccasions } from "@/data/seoOccasions";
import {
  getCanonicalOccasionPath,
  isIndexableLocationSlug,
  isIndexableOccasionSlug,
} from "@/data/seoIndexing";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString();

  const blogEntries: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: post.date,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/anniversary`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/birthday`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/wedding`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/constellation-map`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/star-map-poster`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      url: `${baseUrl}/night-sky-map-gift`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/star-map-generator`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/custom-night-sky-map`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      url: `${baseUrl}/personalized-star-map`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      url: `${baseUrl}/how-to-print-star-map`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/star-map-gift`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      url: `${baseUrl}/star-map-gift-formats`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.75,
    },
    {
      url: `${baseUrl}/star-map-gallery`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.75,
    },
    {
      url: `${baseUrl}/star-map-gift-ideas`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.75,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.75,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${baseUrl}/shipping`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${baseUrl}/returns`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${baseUrl}/star-map-in`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/star-map-for`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];

  const locationEntries: MetadataRoute.Sitemap = seoLocations
    .filter((location) => isIndexableLocationSlug(location.slug))
    .map((location) => ({
      url: `${baseUrl}/star-map-in/${location.slug}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    }));

  const occasionEntries: MetadataRoute.Sitemap = seoOccasions
    .filter((occasion) => isIndexableOccasionSlug(occasion.slug))
    .filter((occasion) => !getCanonicalOccasionPath(occasion.slug))
    .map((occasion) => ({
      url: `${baseUrl}/star-map-for/${occasion.slug}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    }));

  return [...staticEntries, ...locationEntries, ...occasionEntries, ...blogEntries];
}
