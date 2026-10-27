/**
 * Occasion pages PR 1 (#417): the valentines-day entry carries the full
 * christmas/new-baby story treatment, its artwork files exist, and the
 * touched entry stays inside the lane's copy rules (no "instant" delivery
 * language, no links to pruned city pages).
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

async function loadValentinesEntry() {
  const { getOccasion } = await loadTs("src/data/seoOccasions.ts");
  const entry = getOccasion("valentines-day");
  assert.ok(entry, "valentines-day occasion entry must exist");
  return entry;
}

test("valentines-day entry carries the full story treatment", async () => {
  const entry = await loadValentinesEntry();
  assert.ok((entry.storyHeading ?? "").trim().length > 0, "story heading is required");
  assert.ok((entry.storyParagraphs ?? []).length >= 4, "story needs at least 4 paragraphs");
  assert.match(entry.storyCtaHref ?? "", /occasion-valentines-day-story-preview/);
  assert.ok((entry.artwork ?? []).length >= 2, "story needs at least 2 artwork items");
  assert.ok(entry.faqs.length >= 5 && entry.faqs.length <= 7, "rich entries carry 5-7 FAQs");
});

test("valentines-day artwork files exist under public/ with honest alt text", async () => {
  const entry = await loadValentinesEntry();
  for (const item of entry.artwork ?? []) {
    assert.equal(
      fs.existsSync(path.join(ROOT, "public", item.src.replace(/^\//, ""))),
      true,
      `artwork file missing: ${item.src}`
    );
    assert.ok(item.alt.trim().length > 0, `artwork alt text missing for ${item.src}`);
  }
});

test("no 'instant' delivery language anywhere in the valentines-day entry", async () => {
  const entry = await loadValentinesEntry();
  assert.doesNotMatch(JSON.stringify(entry), /instant/i);
});

test("no pruned city links in the valentines-day entry", async () => {
  const { INDEXABLE_LOCATION_SLUGS } = await loadTs("src/data/seoIndexing.ts");
  const entry = await loadValentinesEntry();
  for (const match of JSON.stringify(entry).matchAll(/\/star-map-in\/([a-z0-9-]+)/g)) {
    assert.ok(
      INDEXABLE_LOCATION_SLUGS.includes(match[1]),
      `valentines-day entry links to pruned city slug: ${match[1]}`
    );
  }
});
