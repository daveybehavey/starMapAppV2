/**
 * Occasion pages PR 3 (#424): the upgraded first-date entry keeps its tuned
 * title/H1 and URL, carries the full christmas/new-baby story treatment,
 * its artwork files exist, it demonstrates the SQ-59 First Date outline
 * (first-meeting-vs-first-date selection, date/location decisions) rather
 * than echoing Night We Met, uses the buyers' own phrasings ("first date",
 * "exact time" — Grok W23-2 headline finding), and stays inside the lane's
 * copy rules (no "instant" delivery language, no pruned city links). The
 * shared OccasionLinks retrofit gives the standalone Anniversary, Birthday
 * and Wedding pages their Night We Met cross-link.
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

async function loadFirstDateEntry() {
  const { getOccasion } = await loadTs("src/data/seoOccasions.ts");
  const entry = getOccasion("first-date");
  assert.ok(entry, "first-date occasion entry must exist");
  return entry;
}

test("first-date stays indexable and self-canonical (no redirect)", async () => {
  const { isIndexableOccasionSlug, getCanonicalOccasionPath } = await loadTs("src/data/seoIndexing.ts");
  assert.equal(isIndexableOccasionSlug("first-date"), true);
  assert.equal(getCanonicalOccasionPath("first-date"), null);
});

test("first-date keeps its GSC-tuned title and H1 (First Date is the search phrase)", async () => {
  const entry = await loadFirstDateEntry();
  assert.equal(entry.seoTitle, "First Date Star Map Gift — Custom Night Sky | StarMapCo");
  assert.equal(entry.seoH1, "First Date Star Map Gift");
  assert.equal(entry.exampleLine, "Our First Date · Seattle, WA · November 3, 2018");
});

test("first-date entry carries the full story treatment", async () => {
  const entry = await loadFirstDateEntry();
  assert.ok((entry.storyHeading ?? "").trim().length > 0, "story heading is required");
  assert.ok((entry.storyParagraphs ?? []).length >= 4, "story needs at least 4 paragraphs");
  assert.match(entry.storyCtaHref ?? "", /occasion-first-date-story-preview/);
  assert.ok((entry.artwork ?? []).length >= 2, "story needs at least 2 artwork items");
  assert.equal(entry.faqs.length, 7, "upgraded entries carry exactly 7 FAQs");
});

test("first-date artwork files exist under public/ with honest alt text", async () => {
  const entry = await loadFirstDateEntry();
  for (const item of entry.artwork ?? []) {
    assert.equal(
      fs.existsSync(path.join(ROOT, "public", item.src.replace(/^\//, ""))),
      true,
      `artwork file missing: ${item.src}`
    );
    assert.ok(item.alt.trim().length > 0, `artwork alt text missing for ${item.src}`);
    assert.match(item.alt, /night sky/i, `artwork alt must describe the sky: ${item.src}`);
  }
});

test("no 'instant' delivery language anywhere in the first-date entry", async () => {
  const entry = await loadFirstDateEntry();
  assert.doesNotMatch(JSON.stringify(entry), /instant/i);
});

test("no pruned city links in the first-date entry", async () => {
  const { INDEXABLE_LOCATION_SLUGS } = await loadTs("src/data/seoIndexing.ts");
  const entry = await loadFirstDateEntry();
  for (const match of JSON.stringify(entry).matchAll(/\/star-map-in\/([a-z0-9-]+)/g)) {
    assert.ok(
      INDEXABLE_LOCATION_SLUGS.includes(match[1]),
      `first-date entry links to pruned city slug: ${match[1]}`
    );
  }
});

test("first-date holds the intent split: first intentional date, not the meeting or the milestone", async () => {
  const entry = await loadFirstDateEntry();
  const serialized = JSON.stringify(entry);
  assert.match(serialized, /\/star-map-for\/night-we-met/, "differentiation must reference the Night We Met page");
  assert.match(serialized, /\/anniversary/, "differentiation must reference the Anniversary page");
});

test("first-date story is substantively its own (SQ-59 outline, no Night We Met echo)", async () => {
  const { getOccasion } = await loadTs("src/data/seoOccasions.ts");
  const firstDate = await loadFirstDateEntry();
  const nightWeMet = getOccasion("night-we-met");
  const nwmParagraphs = new Set(nightWeMet.storyParagraphs ?? []);
  for (const paragraph of firstDate.storyParagraphs ?? []) {
    assert.equal(nwmParagraphs.has(paragraph), false, "story paragraphs must not be shared with night-we-met");
  }
  const serialized = JSON.stringify(firstDate);
  assert.match(serialized, /first time you went out/i, "must carry the first-meeting-vs-first-date selection rule");
});

test("first-date copy uses the buyers' own phrasings (W23-2)", async () => {
  const entry = await loadFirstDateEntry();
  const serialized = JSON.stringify(entry);
  assert.match(serialized, /first date/i);
  assert.match(serialized, /exact time/i);
});

test("OccasionLinks retrofit: Night We Met joins the shared occasion link list", () => {
  const source = fs.readFileSync(path.join(ROOT, "src/components/OccasionLinks.tsx"), "utf8");
  assert.match(source, /slug: "night-we-met", label: "Night We Met"/);
  assert.match(source, /slug: "valentines-day", label: "Valentine's Day"/);
});
