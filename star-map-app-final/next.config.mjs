/** @type {import('next').NextConfig} */
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const redirectHosts = ["www.starmapco.com", "starmapco.ca", "www.starmapco.ca"];

/**
 * City-pages prune (2026-10-26 disposition): the 21 retired /star-map-in/*
 * clones permanently redirect, one hop, to the differentiated survivor whose
 * coverage statement names their region — or, where no survivor covers them,
 * to the location-neutral /star-map-poster hub. The five surviving slugs
 * (vancouver-bc, toronto-on, new-york-ny, los-angeles-ca, london-uk) are NOT
 * listed here; they serve their own pages. No destination is itself a source
 * (no chains). Pinned by scripts/unit/cityPagesPrune.test.mjs.
 */
const cityPageRedirects = [
  // Northeast corridor -> New York survivor
  { source: "/star-map-in/boston-ma", destination: "/star-map-in/new-york-ny" },
  { source: "/star-map-in/washington-dc", destination: "/star-map-in/new-york-ny" },
  // Western US -> Los Angeles survivor
  { source: "/star-map-in/san-francisco-ca", destination: "/star-map-in/los-angeles-ca" },
  { source: "/star-map-in/san-diego-ca", destination: "/star-map-in/los-angeles-ca" },
  { source: "/star-map-in/seattle-wa", destination: "/star-map-in/los-angeles-ca" },
  { source: "/star-map-in/portland-or", destination: "/star-map-in/los-angeles-ca" },
  { source: "/star-map-in/las-vegas-nv", destination: "/star-map-in/los-angeles-ca" },
  { source: "/star-map-in/denver-co", destination: "/star-map-in/los-angeles-ca" },
  // Eastern Canada -> Toronto survivor
  { source: "/star-map-in/montreal-qc", destination: "/star-map-in/toronto-on" },
  // No covering survivor -> the /star-map-poster hub
  { source: "/star-map-in/chicago-il", destination: "/star-map-poster" },
  { source: "/star-map-in/houston-tx", destination: "/star-map-poster" },
  { source: "/star-map-in/dallas-tx", destination: "/star-map-poster" },
  { source: "/star-map-in/austin-tx", destination: "/star-map-poster" },
  { source: "/star-map-in/nashville-tn", destination: "/star-map-poster" },
  { source: "/star-map-in/atlanta-ga", destination: "/star-map-poster" },
  { source: "/star-map-in/miami-fl", destination: "/star-map-poster" },
  { source: "/star-map-in/new-orleans-la", destination: "/star-map-poster" },
  { source: "/star-map-in/paris-fr", destination: "/star-map-poster" },
  { source: "/star-map-in/tokyo-jp", destination: "/star-map-poster" },
  { source: "/star-map-in/singapore-sg", destination: "/star-map-poster" },
  { source: "/star-map-in/sydney-au", destination: "/star-map-poster" },
].map((redirect) => ({ ...redirect, permanent: true }));

const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Sentry source maps (SQ-58 / #429): browser bundles emit source maps only
  // for builds that will upload them to Sentry in the same job (CI sets
  // SENTRY_SOURCEMAPS=1 when SENTRY_ORG/SENTRY_PROJECT repo variables exist).
  // Maps are never emitted for ordinary production builds, so they are never
  // part of the publicly served assets.
  productionBrowserSourceMaps: process.env.SENTRY_SOURCEMAPS === "1",
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    // Ensure Next resolves the app root to this package (not the monorepo root),
    // otherwise Turbopack may mis-detect `pages/` and `app/` in different folders.
    root: currentDir,
  },
  async redirects() {
    return [
      ...redirectHosts.map((host) => ({
        source: "/:path*",
        has: [{ type: "host", value: host }],
        destination: "https://starmapco.com/:path*",
        permanent: true,
      })),
      ...cityPageRedirects,
    ];
  },
};

export default nextConfig;
