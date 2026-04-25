import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com";
  const bulkEnabled = /^(1|true|yes)$/i.test((process.env.BULK_EVENT_ORDERS_ENABLED || "").trim());
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/editor",
          "/funnel",
          "/download",
          "/success",
          "/media-kit",
          "/simple-test",
          "/m/",
          ...(bulkEnabled
            ? []
            : [
                // Dark lane: keep out of indexing until intentionally enabled.
                "/bulk-event-orders",
              ]),
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
