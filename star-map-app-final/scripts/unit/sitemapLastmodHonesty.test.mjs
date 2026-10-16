/**
 * Sitemap lastmod honesty: never stamp generation-time "now"; keep real blog/policy dates.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { register } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SITEMAP_SOURCE = path.join(ROOT, "src/app/sitemap.ts");
const BUILD_SOURCE = path.join(ROOT, "src/lib/buildSitemapEntries.ts");
const BLOG_SOURCE = path.join(ROOT, "src/lib/blogPosts.tsx");

register("./tsResolveHook.mjs", pathToFileURL(path.dirname(fileURLToPath(import.meta.url)) + "/"));

async function loadTs(relPath) {
  return import(pathToFileURL(path.join(ROOT, relPath)).href);
}

/** Parse `{ slug, date }` pairs from blogPosts.tsx without importing the JSX module. */
function parseBlogPostDates(source) {
  const posts = [];
  const blockRegex = /\{\s*slug:\s*"([^"]+)"[\s\S]*?date:\s*"([^"]+)"/g;
  let match = blockRegex.exec(source);
  while (match) {
    posts.push({ slug: match[1], date: match[2] });
    match = blockRegex.exec(source);
  }
  return posts;
}

function normalizeLastModified(value) {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function isWithinGenerationWindow(lastModified, startedAtMs, finishedAtMs) {
  const normalized = normalizeLastModified(lastModified);
  if (!normalized) return false;
  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) {
    // Date-only ISO (YYYY-MM-DD) is never a generation-time stamp.
    return false;
  }
  // Allow a small clock skew buffer around the call window.
  return ms >= startedAtMs - 2000 && ms <= finishedAtMs + 2000;
}

test("sitemap sources do not stamp lastModified with generation-time now", () => {
  const sources = [fs.readFileSync(SITEMAP_SOURCE, "utf8"), fs.readFileSync(BUILD_SOURCE, "utf8")].join(
    "\n"
  );
  assert.doesNotMatch(
    sources,
    /lastModified:\s*now\b/,
    "static/data-driven entries must not use lastModified: now"
  );
  assert.doesNotMatch(
    sources,
    /lastModified:\s*new Date\(\)/,
    "lastModified must not be new Date() at generation time"
  );
  assert.doesNotMatch(
    sources,
    /const now = new Date\(\)\.toISOString\(\)/,
    "sitemap must not define a generation-time now for lastmod"
  );
});

test("no sitemap entry lastModified equals generation time; blog keeps post dates", async () => {
  const { buildSitemapEntries, BLOG_SITEMAP_EXCLUDED_SLUGS } = await loadTs(
    "src/lib/buildSitemapEntries.ts"
  );
  const { POLICY_LAST_UPDATED_ISO } = await loadTs("src/lib/policyMeta.ts");

  const blogPosts = parseBlogPostDates(fs.readFileSync(BLOG_SOURCE, "utf8"));
  assert.ok(blogPosts.length > 0, "expected to parse blog post dates from blogPosts.tsx");

  const startedAtMs = Date.now();
  const entries = buildSitemapEntries({
    baseUrl: "https://starmapco.com",
    blogPosts,
    bulkEnabled: true,
    shopNavEnabled: true,
  });
  const finishedAtMs = Date.now();

  assert.ok(Array.isArray(entries) && entries.length > 0, "sitemap should return entries");

  for (const entry of entries) {
    if (entry.lastModified === undefined) continue;
    assert.equal(
      isWithinGenerationWindow(entry.lastModified, startedAtMs, finishedAtMs),
      false,
      `lastModified must not equal generation time for ${entry.url} (got ${normalizeLastModified(entry.lastModified)})`
    );
  }

  const blogBySlug = new Map(blogPosts.map((post) => [post.slug, post]));
  const blogUrlEntries = entries.filter((entry) => {
    try {
      const pathname = new URL(entry.url).pathname;
      return pathname.startsWith("/blog/") && pathname !== "/blog/";
    } catch {
      return false;
    }
  });

  assert.ok(blogUrlEntries.length > 0, "expected blog post sitemap entries");

  for (const entry of blogUrlEntries) {
    const slug = new URL(entry.url).pathname.replace(/^\/blog\//, "");
    assert.equal(
      BLOG_SITEMAP_EXCLUDED_SLUGS.has(slug),
      false,
      `excluded redirect slug ${slug} must not appear in sitemap`
    );
    const post = blogBySlug.get(slug);
    if (post) {
      assert.equal(
        normalizeLastModified(entry.lastModified),
        post.date,
        `blog entry ${slug} must keep post.date as lastModified`
      );
    } else if (slug === "valentines-day-star-map") {
      assert.equal(normalizeLastModified(entry.lastModified), "2025-02-01");
    }
  }

  const pathOf = (entry) => {
    try {
      return new URL(entry.url).pathname;
    } catch {
      return entry.url;
    }
  };

  const byPath = new Map(entries.map((entry) => [pathOf(entry), entry]));

  assert.equal(normalizeLastModified(byPath.get("/privacy")?.lastModified), POLICY_LAST_UPDATED_ISO.privacy);
  assert.equal(normalizeLastModified(byPath.get("/terms")?.lastModified), POLICY_LAST_UPDATED_ISO.terms);
  assert.equal(normalizeLastModified(byPath.get("/shipping")?.lastModified), POLICY_LAST_UPDATED_ISO.shipping);
  assert.equal(normalizeLastModified(byPath.get("/returns")?.lastModified), POLICY_LAST_UPDATED_ISO.returns);

  // Representative static + data-driven URLs omit lastmod when no honest date exists.
  assert.equal(byPath.get("/")?.lastModified, undefined);
  assert.equal(byPath.get("/star-map-gift")?.lastModified, undefined);
  assert.equal(byPath.get("/star-map-in")?.lastModified, undefined);
  assert.equal(byPath.get("/shop")?.lastModified, undefined);
  assert.equal(byPath.get("/bulk-event-orders")?.lastModified, undefined);

  const locationEntry = entries.find((entry) => pathOf(entry).startsWith("/star-map-in/"));
  const occasionEntry = entries.find((entry) => pathOf(entry).startsWith("/star-map-for/"));
  assert.ok(locationEntry, "expected at least one location entry");
  assert.ok(occasionEntry, "expected at least one occasion entry");
  assert.equal(locationEntry.lastModified, undefined);
  assert.equal(occasionEntry.lastModified, undefined);
});
