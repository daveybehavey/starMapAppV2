/** @type {import('next').NextConfig} */
const redirectHosts = ["www.starmapco.com", "starmapco.ca", "www.starmapco.ca"];

const nextConfig = {
  async redirects() {
    return redirectHosts.map((host) => ({
      source: "/:path*",
      has: [{ type: "host", value: host }],
      destination: "https://starmapco.com/:path*",
      permanent: true,
    }));
  },
  async rewrites() {
    return [
      {
        source: "/merchant-feed.xml",
        destination: "/merchant-feed",
      },
    ];
  },
};

export default nextConfig;
