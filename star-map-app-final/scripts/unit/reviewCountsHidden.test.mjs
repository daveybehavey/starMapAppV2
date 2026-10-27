/**
 * Owner ruling (2026-10-27): StarMapCo may say "Google Reviews" and link
 * to the listing, but the site displays NO review-count or rating numbers
 * until the count is impressive. The verified numbers stay on file in
 * src/lib/googleRatings.ts (and in its unit test) — nowhere else.
 *
 * This pin sweeps every public surface under src/ for:
 *  - the aggregate display helpers / values leaving the lib module,
 *  - "N reviews"-style count statements and "X.X from …" rating claims,
 *  - any aggregateRating structured data.
 * Individual verbatim review quotes (googleRatings.ts `reviews`) are
 * content, not aggregates, and are not swept.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function listSrcFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSrcFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const AGGREGATE_HELPERS = ["formatGoogleRatingValue", "getGoogleReviewCountLabel", "getGoogleFullStarCount"];

test("aggregate rating helpers are referenced nowhere outside the lib module", () => {
  for (const full of listSrcFiles(path.join(ROOT, "src"))) {
    const rel = path.relative(ROOT, full);
    if (rel === "src/lib/googleRatings.ts") continue;
    const source = fs.readFileSync(full, "utf8");
    for (const helper of AGGREGATE_HELPERS) {
      assert.ok(!source.includes(helper), `${rel} must not reference ${helper} (numbers stay hidden)`);
    }
    assert.ok(!source.includes("aggregateRating"), `${rel} must not publish aggregateRating`);
    assert.ok(!source.includes("AggregateRating"), `${rel} must not publish AggregateRating`);
  }
});

test("no public copy states a review count or a numeric rating for StarMapCo", () => {
  const patterns = [
    /\b\d+\s+Google reviews\b/i,
    /\b\d+\s+reviews?\b/i,
    /\bRated\s+\d/i,
    /\b\d\.\d\s+(from|out of|stars)/i,
    /\bfrom\s+\d+\s+reviews/i,
  ];
  for (const full of listSrcFiles(path.join(ROOT, "src"))) {
    const rel = path.relative(ROOT, full);
    // The lib keeps the verified constants on file (owner ruling: hidden,
    // not deleted). Everything else is a public surface.
    if (rel === "src/lib/googleRatings.ts") continue;
    // The comparison page quotes the COMPETITOR's own published figures
    // (Trustpilot, over 10,000 reviews) — editorial facts about them, not
    // StarMapCo's count; it is pinned separately below.
    if (rel === "src/app/compare/starmapco-vs-the-night-sky/page.tsx") continue;
    const source = fs.readFileSync(full, "utf8");
    for (const pattern of patterns) {
      assert.doesNotMatch(source, pattern, `${rel} states a review number (${pattern}) — hidden by owner ruling`);
    }
  }
});

test("comparison page states no StarMapCo review numbers (competitor figures are theirs)", () => {
  const page = read("src/app/compare/starmapco-vs-the-night-sky/page.tsx");
  // StarMapCo's own Reviews-row cell must stay number-free. The
  // competitor's Trustpilot figures ("4.6 from over 10,000 reviews") are
  // their published numbers, quoted as editorial comparison facts — not
  // swept by the ruling. (Other rows legitimately carry digits: prices,
  // cutoff dates, return windows.)
  assert.doesNotMatch(page, /\d+\s+Google reviews/i);
  const reviewsRow = page.match(/label: "Reviews",\s*starmapco: "([^"]*)"/);
  assert.ok(reviewsRow, "comparison page must keep a Reviews row for StarMapCo");
  assert.doesNotMatch(reviewsRow[1], /\d/, "StarMapCo Reviews cell must state no numbers");
  assert.match(reviewsRow[1], /Google reviews/i);
});

test("trust component is qualitative: links to Google, renders no aggregate", () => {
  const component = read("src/components/GoogleRatingsTrust.tsx");
  assert.match(component, /Read reviews on Google/);
  assert.match(component, /Review us on Google/);
  assert.match(component, /Reviewed on Google/);
  assert.doesNotMatch(component, /\.ratingValue|\.reviewCount/);
  assert.doesNotMatch(component, /out of 5/);
});
