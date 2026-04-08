/** @type {import('next').NextConfig} */
const redirectHosts = ["www.starmapco.com", "starmapco.ca", "www.starmapco.ca"];
const redirectedBlogSlugs = [
  {
    source: "/blog/most-meaningful-valentines-day-gift-custom-star-map",
    destination: "/blog/valentines-day-star-map",
    permanent: true,
  },
];

const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
