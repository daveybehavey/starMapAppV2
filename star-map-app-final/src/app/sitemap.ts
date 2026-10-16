import type { MetadataRoute } from "next";
import { blogPosts } from "@/lib/blogPosts";
import { buildSitemapEntries } from "@/lib/buildSitemapEntries";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com";
const bulkEnabled = /^(1|true|yes)$/i.test((process.env.BULK_EVENT_ORDERS_ENABLED || "").trim());
const shopNavEnabled = /^(1|true|yes)$/i.test((process.env.NEXT_PUBLIC_SHOP_TAB_ENABLED || "").trim());

/** Regenerates on deploy; new indexable routes belong in `blogPosts`, SEO datasets, or explicit static entries in `buildSitemapEntries`. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemapEntries({
    baseUrl,
    blogPosts,
    bulkEnabled,
    shopNavEnabled,
  });
}
