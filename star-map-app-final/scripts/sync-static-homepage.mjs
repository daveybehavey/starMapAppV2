#!/usr/bin/env node

import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const indexPath = path.join(root, "public", "index.html");
const landingPath = path.join(root, "public", "landing.html");
const checkOnly = process.argv.includes("--check");
const defaultSiteOrigin = "https://starmapco.com";
const configuredSiteOrigin = new URL(
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || defaultSiteOrigin,
).origin;

function normalizeSiteOrigin(html) {
  return html.replaceAll(defaultSiteOrigin, configuredSiteOrigin);
}

async function main() {
  const [indexExists, landingExists] = await Promise.all([
    access(indexPath).then(() => true).catch(() => false),
    access(landingPath).then(() => true).catch(() => false),
  ]);
  if (!indexExists || !landingExists) {
    console.log("Static homepage files are absent; skipping homepage asset sync.");
    return;
  }

  const indexHtml = await readFile(indexPath, "utf8");
  const landingHtml = await readFile(landingPath, "utf8");
  const normalizedIndexHtml = normalizeSiteOrigin(indexHtml);
  const normalizedLandingHtml = normalizeSiteOrigin(landingHtml);

  const indexMatchesConfig = indexHtml === normalizedIndexHtml;
  const landingMatchesConfig = landingHtml === normalizedLandingHtml;
  const filesMatchAfterNormalization = normalizedIndexHtml === normalizedLandingHtml;

  if (indexMatchesConfig && landingMatchesConfig && filesMatchAfterNormalization) {
    console.log(`Homepage static files are already in sync for ${configuredSiteOrigin}.`);
    return;
  }

  if (checkOnly) {
    if (!indexMatchesConfig) {
      console.error(
        `public/index.html still references ${defaultSiteOrigin} instead of ${configuredSiteOrigin}`,
      );
    } else if (!landingMatchesConfig) {
      console.error(
        `public/landing.html still references ${defaultSiteOrigin} instead of ${configuredSiteOrigin}`,
      );
    } else {
      console.error("Homepage static files are out of sync after site URL normalization.");
    }
    process.exit(1);
  }

  await writeFile(indexPath, normalizedIndexHtml, "utf8");
  await writeFile(landingPath, normalizedIndexHtml, "utf8");
  console.log(`Synced homepage static files for ${configuredSiteOrigin}.`);
}

main().catch((error) => {
  console.error("Static homepage sync failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
