/** @type {import('next').NextConfig} */
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const redirectHosts = ["www.starmapco.com", "starmapco.ca", "www.starmapco.ca"];

const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    // Ensure Next resolves the app root to this package (not the monorepo root),
    // otherwise Turbopack may mis-detect `pages/` and `app/` in different folders.
    root: currentDir,
  },
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
