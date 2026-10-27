/**
 * Occasion pages PR 2 (#419): the new night-we-met entry is indexable with no
 * canonical redirect, carries the full christmas/new-baby story treatment,
 * its artwork files exist, it cross-references the First Date and Anniversary
 * pages (the load-bearing intent split), uses the buyers' own phrasings
 * ("where we met", "exact time" — Grok W23-2 headline finding), and stays
 * inside the lane's copy rules (no "instant" delivery language, no links to
 * pruned city pages).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { register } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

register("./tsResolveHook.mjs", pathToFileURL(path.dirname(fileURLToPath(import.meta.url)) + "/"));

async function loadTs(relPath) {
  return import(pathToFileURL(path.join(ROOT, relPath)).href);
}

async function loadNightWeMetEntry() {
  const { getOccasion } = await loadTs("src/data/seoOccasions.ts");
  const entry = getOccasion("night-we-met");
  assert.ok(entry, "night-we-met occasion entry must exist");
  return entry;
}

test("night-we-met is indexable and self-canonical (no redirect)", async () => {
  const { isIndexableOccasionSlug, getCanonicalOccasionPath } = await loadTs("src/data/seoIndexing.ts");
  assert.equal(isIndexableOccasionSlug("night-we-met"), true);
  assert.equal(getCanonicalOccasionPath("night-we-met"), null);
});

test("night-we-met entry carries the full story treatment", async () => {
  const entry = await loadNightWeMetEntry();
  assert.ok((entry.storyHeading ?? "").trim().length > 0, "story heading is required");
  assert.ok((entry.storyParagraphs ?? []).length >= 4, "story needs at least 4 paragraphs");
  assert.match(entry.storyCtaHref ?? "", /occasion-night-we-met-story-preview/);
  assert.ok((entry.artwork ?? []).length >= 2, "story needs at least 2 artwork items");
  assert.ok(entry.faqs.length >= 5 && entry.faqs.length <= 7, "rich entries carry 5-7 FAQs");
});

test("night-we-met artwork files exist under public/ with honest alt text", async () => {
  const entry = await loadNightWeMetEntry();
  for (const item of entry.artwork ?? []) {
    assert.equal(
      fs.existsSync(path.join(ROOT, "public", item.src.replace(/^\//, ""))),
      true,
      `artwork file missing: ${item.src}`
    );
    assert.ok(item.alt.trim().length > 0, `artwork alt text missing for ${item.src}`);
  }
});

test("no 'instant' delivery language anywhere in the night-we-met entry", async () => {
  const entry = await loadNightWeMetEntry();
  assert.doesNotMatch(JSON.stringify(entry), /instant/i);
});

test("no pruned city links in the night-we-met entry", async () => {
  const { INDEXABLE_LOCATION_SLUGS } = await loadTs("src/data/seoIndexing.ts");
  const entry = await loadNightWeMetEntry();
  for (const match of JSON.stringify(entry).matchAll(/\/star-map-in\/([a-z0-9-]+)/g)) {
    assert.ok(
      INDEXABLE_LOCATION_SLUGS.includes(match[1]),
      `night-we-met entry links to pruned city slug: ${match[1]}`
    );
  }
});

test("night-we-met holds the intent split: meeting night, not first date or anniversary", async () => {
  const entry = await loadNightWeMetEntry();
  const serialized = JSON.stringify(entry);
  assert.match(serialized, /\/star-map-for\/first-date/, "differentiation must reference the First Date page");
  assert.match(serialized, /\/anniversary/, "differentiation must reference the Anniversary page");
});

test("night-we-met copy uses the buyers' own phrasings (W23-2)", async () => {
  const entry = await loadNightWeMetEntry();
  const serialized = JSON.stringify(entry);
  assert.match(serialized, /where you met/i);
  assert.match(serialized, /exact time/i);
});
