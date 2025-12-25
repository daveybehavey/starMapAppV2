import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://starmapco.com";
  const now = new Date();
  return [
    {
      url: `${base}/`,
      lastModified: now,
      changeFreq: "daily",
      priority: 1.0,
    },
    {
      url: `${base}/wedding`,
      lastModified: now,
      changeFreq: "weekly",
      priority: 0.8,
    },
    {
      url: `${base}/anniversary`,
      lastModified: now,
      changeFreq: "weekly",
      priority: 0.8,
    },
    {
      url: `${base}/birthday`,
      lastModified: now,
      changeFreq: "weekly",
      priority: 0.8,
    },
  ];
}
