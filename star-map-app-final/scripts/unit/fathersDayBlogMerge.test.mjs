/**
 * Father's Day blog merge pins (B4 Fix A, 2026-10-27; survivor ruled by
 * SQ-07, 2026-10-26):
 *
 * - Exactly one Father's Day article survives in blogPosts:
 *   /blog/fathers-day-star-map-gift-ideas, keeping its original 2026-06-12
 *   publication date (sitemap lastmod honesty pins blog lastmod to `date`).
 * - The two retired posts are gone from blogPosts (so they leave the blog
 *   index and the sitemap) and permanently redirect, one hop, to the
 *   survivor via next.config.mjs — the mechanism is the repo's existing
 *   permanent-redirect table (same as the city-pages prune).
 * - The survivor carries the merged material: B's "night he became Dad"
 *   angle (title, date ideas, sample personalization fields, workflow,
 *   matte-paper print tips, ogImage) and C's situation-to-format decision
 *   table.
 * - B4 Fix C: the previously underlinked bundle page
 *   (/star-map-poster/framed-hd-bundle) gains internal links from two more
 *   surfaces — this merged article and the /star-map-gift hub — with anchor
 *   text naming the bundle. /star-map-poster itself stays bundle-free
 *   (pinned by merchantFeedLandingLinks.test.mjs).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(UNIT_DIR, "../..");

const SURVIVOR = "fathers-day-star-map-gift-ideas";
const RETIRED = ["fathers-day-star-map-gift-2", "fathers-day-star-map-format-choose"];

const blogSource = fs.readFileSync(path.join(APP_ROOT, "src/lib/blogPosts.tsx"), "utf8");

test("exactly one Father's Day post survives, with its original date", () => {
  const slugs = [...blogSource.matchAll(/slug:\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(
    slugs.filter((slug) => slug.startsWith("fathers-day")),
    [SURVIVOR],
    "only the survivor slug may remain in blogPosts",
  );
  const survivorBlock = new RegExp(`slug:\\s*"${SURVIVOR}"[\\s\\S]*?date:\\s*"([^"]+)"`).exec(blogSource);
  assert.ok(survivorBlock, "survivor post must exist");
  assert.equal(survivorBlock[1], "2026-06-12", "survivor keeps post A's publication date");
});

test("retired posts permanently redirect one hop to the survivor", async () => {
  const config = (await import(path.join(APP_ROOT, "next.config.mjs"))).default;
  const redirects = await config.redirects();
  const bySource = new Map(redirects.map((entry) => [entry.source, entry]));
  for (const slug of RETIRED) {
    const entry = bySource.get(`/blog/${slug}`);
    assert.ok(entry, `missing redirect for retired post ${slug}`);
    assert.equal(entry.destination, `/blog/${SURVIVOR}`);
    assert.equal(entry.permanent, true, `${slug} redirect must be permanent`);
  }
  assert.equal(
    bySource.has(`/blog/${SURVIVOR}`),
    false,
    "survivor must not itself be a redirect source (no chains/loops)",
  );
});

test("survivor carries the merged B and C material", () => {
  for (const needle of [
    "Honor the Night He Became Dad", // B's angle, as the survivor's title
    "The birth of a child", // B date ideas
    "The Night We Became Family", // B sample personalization fields
    "Matte paper keeps glare low and stars crisp", // B print tips
    'ogImage: "/og-fathers-day.svg"', // B's og image, carried deliberately
    "Fast decision table", // C's situation-to-format table
    "ready-to-display", // C table: framed row
  ]) {
    assert.ok(blogSource.includes(needle), `merged survivor is missing carried material: ${needle}`);
  }
});

test("bundle page is linked from the survivor article and the gift hub (B4 Fix C)", () => {
  const giftPage = fs.readFileSync(path.join(APP_ROOT, "src/app/star-map-gift/page.tsx"), "utf8");
  for (const [label, source] of [
    ["survivor article", blogSource],
    ["gift hub", giftPage],
  ]) {
    assert.ok(
      source.includes('href="/star-map-poster/framed-hd-bundle"'),
      `${label} must link the framed+HD bundle page`,
    );
    assert.ok(
      source.includes("framed print + HD digital download bundle"),
      `${label} anchor text must name the bundle specifically`,
    );
  }
});
