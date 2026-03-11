/** @type {import('next').NextConfig} */
const redirectHosts = ["www.starmapco.com", "starmapco.ca", "www.starmapco.ca"];

const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async redirects() {
    return redirectHosts.map((host) => ({
      source: "/:path*",
      has: [{ type: "host", value: host }],
      destination: "https://starmapco.com/:path*",
      permanent: true,
    }));
  },
};

export default nextConfig;
