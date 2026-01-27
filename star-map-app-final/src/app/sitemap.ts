import type { MetadataRoute } from "next";
import { blogPosts } from "@/lib/blogPosts";

const mapIdsEnv = process.env.SITEMAP_MAP_IDS ?? "";
const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString();

  const blogEntries = blogPosts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: post.date,
  }));

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
    },
    {
      url: `${baseUrl}/anniversary`,
      lastModified: now,
    },
    {
      url: `${baseUrl}/birthday`,
      lastModified: now,
    },
    {
      url: `${baseUrl}/wedding`,
      lastModified: now,
    },
    {
      url: `${baseUrl}/constellation-map`,
      lastModified: now,
    },
    {
      url: `${baseUrl}/star-map-poster`,
      lastModified: now,
    },
    {
      url: `${baseUrl}/night-sky-map-gift`,
      lastModified: now,
    },
    {
      url: `${baseUrl}/star-map-generator`,
      lastModified: now,
    },
    {
      url: `${baseUrl}/custom-night-sky-map`,
      lastModified: now,
    },
    {
      url: `${baseUrl}/personalized-star-map`,
      lastModified: now,
    },
    {
      url: `${baseUrl}/how-to-print-star-map`,
      lastModified: now,
    },
    {
      url: `${baseUrl}/media-kit`,
      lastModified: now,
    },
    {
      url: `${baseUrl}/star-map-gift`,
      lastModified: now,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: now,
    },
    {
      url: `${baseUrl}/returns`,
      lastModified: now,
    },
  ];

  const mapEntries: MetadataRoute.Sitemap = mapIdsEnv
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => ({
      url: `${baseUrl}/m/${id}`,
      lastModified: now,
    }));

  return [...staticEntries, ...blogEntries, ...mapEntries];
}
