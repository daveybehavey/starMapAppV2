/** @type {import('next').NextConfig} */
const redirectHosts = ["www.starmapco.com", "starmapco.ca", "www.starmapco.ca"];
const redirectedBlogSlugs = [
  {
    source: "/blog/most-meaningful-valentines-day-gift-custom-star-map",
    destination: "/blog/valentines-day-star-map",
    permanent: true,
  },
];
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return [
      ...redirectHosts.map((host) => ({
        source: "/:path*",
        has: [{ type: "host", value: host }],
        destination: "https://starmapco.com/:path*",
        permanent: true,
      })),
      ...redirectedBlogSlugs,
    ];
  },
};

export default nextConfig;
