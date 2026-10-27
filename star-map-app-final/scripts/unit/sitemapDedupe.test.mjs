/**
 * Sitemap URL uniqueness (SQ-30): the builder concatenates several source
 * lists; no URL may appear twice. The latent case is the Valentine's blog
 * route — a static entry that would be generated a second time if its slug
 * ever entered `blogPosts`.
 */
import assert from "node:assert/strict";
import { register } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

register("./tsResolveHook.mjs", pathToFileURL(path.dirname(fileURLToPath(import.meta.url)) + "/"));

async function loadTs(relPath) {
  return import(pathToFileURL(path.join(ROOT, relPath)).href);
}

test("every sitemap URL appears exactly once, incl. the conditional Valentine blog double-add", async () => {
  const { buildSitemapEntries } = await loadTs("src/lib/buildSitemapEntries.ts");

  const entries = buildSitemapEntries({
    baseUrl: "https://starmapco.com",
    // The latent SQ-30 condition: the static Valentine route's slug in blogPosts.
    blogPosts: [{ slug: "valentines-day-star-map", date: "2026-02-01" }],
    bulkEnabled: true,
    shopNavEnabled: true,
  });

  const counts = new Map();
  for (const entry of entries) {
    counts.set(entry.url, (counts.get(entry.url) ?? 0) + 1);
  }
  const duplicates = [...counts.entries()].filter(([, count]) => count > 1);
  assert.deepEqual(duplicates, [], `duplicate sitemap URLs: ${JSON.stringify(duplicates)}`);
  assert.equal(counts.get("https://starmapco.com/blog/valentines-day-star-map"), 1);
});

test("every indexable occasion slug appears exactly once in the sitemap", async () => {
  const { buildSitemapEntries } = await loadTs("src/lib/buildSitemapEntries.ts");
  const { INDEXABLE_OCCASION_SLUGS, getCanonicalOccasionPath } = await loadTs("src/data/seoIndexing.ts");

  const entries = buildSitemapEntries({
    baseUrl: "https://starmapco.com",
    blogPosts: [],
    bulkEnabled: true,
    shopNavEnabled: true,
  });
  const urls = entries.map((entry) => entry.url);

  for (const slug of INDEXABLE_OCCASION_SLUGS) {
    const url = `https://starmapco.com/star-map-for/${slug}`;
    if (getCanonicalOccasionPath(slug)) {
      assert.equal(urls.includes(url), false, `${slug} resolves to a canonical page and must not be an occasion sitemap entry`);
    } else {
      assert.equal(
        urls.filter((candidate) => candidate === url).length,
        1,
        `${url} must appear exactly once`
      );
    }
  }

  assert.equal(
    urls.filter((url) => url === "https://starmapco.com/star-map-for/valentines-day").length,
    1,
    "the Valentine's occasion URL must appear exactly once"
  );
});
