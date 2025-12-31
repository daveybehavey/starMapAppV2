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
      images: [`${baseUrl}/custom-star-map-anniversary.png`],
    },
    { url: `${baseUrl}/blog`, lastModified: now },
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
