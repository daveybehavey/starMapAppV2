import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sitemapSource = readFileSync(new URL("../../src/app/sitemap.ts", import.meta.url), "utf8");

test("sitemap omits the redirecting personalized gift URL", () => {
  assert.doesNotMatch(sitemapSource, /\/best-personalized-star-map-gift\b/);
});

test("sitemap includes the canonical personalized star map URL exactly once", () => {
  const canonicalEntries = sitemapSource.match(/\burl\s*:\s*`\$\{baseUrl\}\/personalized-star-map`/g) ?? [];
  assert.equal(canonicalEntries.length, 1);
});
