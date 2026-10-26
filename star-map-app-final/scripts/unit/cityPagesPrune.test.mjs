import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(UNIT_DIR, "../..");
const SRC_ROOT = path.join(APP_ROOT, "src");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), "utf8");
}

function readApp(relativePath) {
  return fs.readFileSync(path.join(APP_ROOT, relativePath), "utf8");
}

const SURVIVORS = ["vancouver-bc", "toronto-on", "new-york-ny", "los-angeles-ca", "london-uk"];

/** The full disposition map (2026-10-26): every retired slug -> its one-hop destination. */
const EXPECTED_REDIRECTS = {
  "boston-ma": "/star-map-in/new-york-ny",
  "washington-dc": "/star-map-in/new-york-ny",
  "san-francisco-ca": "/star-map-in/los-angeles-ca",
  "san-diego-ca": "/star-map-in/los-angeles-ca",
  "seattle-wa": "/star-map-in/los-angeles-ca",
  "portland-or": "/star-map-in/los-angeles-ca",
  "las-vegas-nv": "/star-map-in/los-angeles-ca",
  "denver-co": "/star-map-in/los-angeles-ca",
  "montreal-qc": "/star-map-in/toronto-on",
  "chicago-il": "/star-map-poster",
  "houston-tx": "/star-map-poster",
  "dallas-tx": "/star-map-poster",
  "austin-tx": "/star-map-poster",
  "nashville-tn": "/star-map-poster",
  "atlanta-ga": "/star-map-poster",
  "miami-fl": "/star-map-poster",
  "new-orleans-la": "/star-map-poster",
  "paris-fr": "/star-map-poster",
  "tokyo-jp": "/star-map-poster",
  "singapore-sg": "/star-map-poster",
  "sydney-au": "/star-map-poster",
};

test("city prune: next.config redirects pin the full 21-entry map, one hop, no chains", async () => {
  const config = (await import(path.join(APP_ROOT, "next.config.mjs"))).default;
  const redirects = await config.redirects();
  const cityRedirects = redirects.filter(
    (entry) => typeof entry.source === "string" && entry.source.startsWith("/star-map-in/")
  );

  assert.equal(cityRedirects.length, 21, "exactly the 21 retired city URLs redirect");

  const bySource = new Map(cityRedirects.map((entry) => [entry.source, entry]));
  for (const [slug, destination] of Object.entries(EXPECTED_REDIRECTS)) {
    const entry = bySource.get(`/star-map-in/${slug}`);
    assert.ok(entry, `missing redirect for retired slug ${slug}`);
    assert.equal(entry.destination, destination, `${slug} must land on ${destination}`);
    assert.equal(entry.permanent, true, `${slug} redirect must be permanent`);
  }

  const sources = new Set(bySource.keys());
  for (const entry of cityRedirects) {
    assert.ok(
      !sources.has(entry.destination),
      `redirect chain: ${entry.source} -> ${entry.destination} is itself redirected`
    );
    assert.ok(
      SURVIVORS.some((slug) => entry.destination === `/star-map-in/${slug}`) ||
        entry.destination === "/star-map-poster",
      `destination ${entry.destination} must be a survivor page or the poster hub`
    );
  }
  for (const slug of SURVIVORS) {
    assert.ok(!sources.has(`/star-map-in/${slug}`), `survivor ${slug} must not be redirected`);
  }
});

test("city prune: INDEXABLE_LOCATION_SLUGS is exactly the five survivors", () => {
  const indexing = readSrc("data/seoIndexing.ts");
  const block = indexing.match(/INDEXABLE_LOCATION_SLUGS = \[([\s\S]*?)\] as const/);
  assert.ok(block, "INDEXABLE_LOCATION_SLUGS block must exist");
  const slugs = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...slugs].sort(), [...SURVIVORS].sort());
});

test("city prune: sitemap, hub and template all derive city listings from the indexable set", () => {
  const sitemap = readSrc("lib/buildSitemapEntries.ts");
  assert.match(sitemap, /isIndexableLocationSlug\(location\.slug\)/);
  const hub = readSrc("app/star-map-in/page.tsx");
  assert.match(hub, /isIndexableLocationSlug\(location\.slug\)/);
  const template = readSrc("app/star-map-in/[slug]/page.tsx");
  assert.match(template, /isIndexableLocationSlug\(item\.slug\)/);
  // The template refuses to render a slug without differentiated survivor content.
  assert.match(template, /getSurvivorContent\(location\.slug\)/);
  assert.match(template, /if \(!survivor\) notFound\(\)/);
  // The retired shared example date is gone from the template.
  assert.doesNotMatch(template, /June 12, 2024/);
});

/** Name-masked differentiation markers: strings unique to each survivor's own content. */
const SURVIVOR_MARKERS = {
  "vancouver-bc": ["Spanish Banks Beach", "August 12, 2024", "Western Canada", "Perseid"],
  "toronto-on": ["Centre Island", "September 17, 2024", "Eastern Canada", "lunar eclipse"],
  "new-york-ny": ["Brooklyn Bridge Park", "October 17, 2024", "New England", "largest full moon"],
  "los-angeles-ca": ["Griffith Observatory", "November 16, 2024", "Mountain West", "Saturn"],
  "london-uk": ["Primrose Hill", "August 19, 2024", "United Kingdom", "Sturgeon Moon"],
};

const COVERAGE_MARKERS = {
  "vancouver-bc": ["Western Canada", "Calgary"],
  "toronto-on": ["Eastern Canada", "Montréal", "published in English"],
  "new-york-ny": ["New England", "Boston", "A Boston sky is not a New York sky"],
  "los-angeles-ca": ["Mountain West", "Denver", "A Denver sky is not a Los Angeles sky"],
  "london-uk": ["whole United Kingdom", "aren't claimed here", "Paris"],
};

test("city prune: every survivor carries its own unique, name-masked-differentiable content", () => {
  const content = readSrc("data/seoSurvivorContent.ts");
  assert.doesNotMatch(content, /June 12, 2024/, "the shared example date is retired everywhere");

  for (const slug of SURVIVORS) {
    for (const marker of SURVIVOR_MARKERS[slug]) {
      assert.ok(content.includes(marker), `${slug} is missing its differentiation marker: ${marker}`);
    }
    for (const marker of COVERAGE_MARKERS[slug]) {
      assert.ok(content.includes(marker), `${slug} coverage statement is missing: ${marker}`);
    }
  }

  // Titles are the pages' own: five unique titles, none equal to the old shared template shape.
  const titles = [...content.matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
  assert.equal(titles.length, 5);
  assert.equal(new Set(titles).size, 5, "survivor titles must be unique");
  for (const title of titles) {
    assert.doesNotMatch(title, /^Star Map in .+ \| StarMapCo$/, "title must not be the shared name template");
  }

  // Every survivor block carries the standard's parts: use case, worked example,
  // sourced guidance, coverage statement, and a survivor FAQ.
  for (const field of ["useCase", "example", "guidance", "coverage", "faq", "sources"]) {
    const occurrences = content.split(field).length - 1;
    assert.ok(occurrences >= 5, `expected ${field} on all five survivors, found ${occurrences} mentions`);
  }
});

test("city prune: next.config keeps the host redirects alongside the city map", async () => {
  const config = (await import(path.join(APP_ROOT, "next.config.mjs"))).default;
  const redirects = await config.redirects();
  const hostRedirects = redirects.filter((entry) => entry.has?.some((cond) => cond.type === "host"));
  assert.equal(hostRedirects.length, 3, "the three legacy host redirects must survive the prune");
  assert.equal(readApp("next.config.mjs").includes("cityPageRedirects"), true);
});
