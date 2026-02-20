import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/editor", "/funnel", "/download", "/success", "/media-kit", "/simple-test", "/m/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
