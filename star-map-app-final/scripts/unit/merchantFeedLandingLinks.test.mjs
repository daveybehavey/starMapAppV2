/**
 * Regression: Merchant physical product landing URLs must stay crawlable.
 * /editor is robots-disallowed; FREE_LISTINGS cannot use it as g:link.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(process.cwd());
const FEED_PATH = resolve(ROOT, "public/merchant-feed.xml");
const GENERATOR_PATH = resolve(ROOT, "scripts/generate-merchant-feed.mjs");
const ROBOTS_PATH = resolve(ROOT, "src/app/robots.ts");

const PHYSICAL_OFFER_IDS = [
  "print_poster_unframed",
  "print_poster_framed",
  "print_poster_framed_hd_bundle",
];

function extractItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match = itemRegex.exec(xml);
  while (match) {
    const segment = match[1];
    const id = /<g:id>([\s\S]*?)<\/g:id>/i.exec(segment)?.[1]?.trim() || "";
    const link = /<g:link>([\s\S]*?)<\/g:link>/i.exec(segment)?.[1]?.trim() || "";
    items.push({ id, link });
    match = itemRegex.exec(xml);
  }
  return items;
}

function parseRobotsDisallowPaths(robotsSource) {
  const disallowBlock = /disallow:\s*\[([\s\S]*?)\]/m.exec(robotsSource)?.[1] || "";
  const paths = [];
  const pathRegex = /"(\/[^"]*)"/g;
  let match = pathRegex.exec(disallowBlock);
  while (match) {
    paths.push(match[1]);
    match = pathRegex.exec(disallowBlock);
  }
  return paths;
}

function pathnameOf(urlOrPath) {
  try {
    return new URL(urlOrPath).pathname;
  } catch {
    return urlOrPath.split("?")[0];
  }
}

function isDisallowedByRobots(pathname, disallowPaths) {
  return disallowPaths.some((rule) => {
    if (rule.endsWith("/")) {
      return pathname === rule.slice(0, -1) || pathname.startsWith(rule);
    }
    return pathname === rule || pathname.startsWith(`${rule}/`) || pathname.startsWith(`${rule}?`);
  });
}

test("robots.ts still disallows /editor (do not broaden crawl access)", () => {
  const robots = readFileSync(ROBOTS_PATH, "utf8");
  const disallow = parseRobotsDisallowPaths(robots);
  assert.ok(disallow.includes("/editor"), "expected /editor in robots disallow list");
});

test("generator source does not point framed+HD bundle at /editor", () => {
  const source = readFileSync(GENERATOR_PATH, "utf8");
  const bundleIdx = source.indexOf('id: "print_poster_framed_hd_bundle"');
  assert.ok(bundleIdx >= 0, "expected print_poster_framed_hd_bundle in generator");
  const bundleSlice = source.slice(bundleIdx, bundleIdx + 900);
  const linkMatch = /link:\s*`([^`]+)`/.exec(bundleSlice);
  assert.ok(linkMatch, "expected link template on bundle item");
  assert.equal(linkMatch[1], "${SITE_URL}/star-map-poster");
  assert.doesNotMatch(linkMatch[1], /\/editor/);
});

test("physical Merchant feed landing URLs avoid robots-disallowed routes", () => {
  const robots = readFileSync(ROBOTS_PATH, "utf8");
  const disallow = parseRobotsDisallowPaths(robots);
  const feed = readFileSync(FEED_PATH, "utf8");
  const items = extractItems(feed);
  const physical = items.filter((item) => PHYSICAL_OFFER_IDS.includes(item.id));

  assert.equal(physical.length, PHYSICAL_OFFER_IDS.length, "expected all three physical SKUs in feed");

  for (const item of physical) {
    assert.ok(item.link, `${item.id} missing g:link`);
    const pathname = pathnameOf(item.link);
    assert.equal(
      isDisallowedByRobots(pathname, disallow),
      false,
      `${item.id} landing ${item.link} collides with robots disallow`,
    );
    assert.doesNotMatch(item.link, /\/editor(\?|$|\/)/i);
  }

  const bundle = physical.find((item) => item.id === "print_poster_framed_hd_bundle");
  assert.ok(bundle);
  assert.match(bundle.link, /\/star-map-poster\/?$/);
  assert.equal(isDisallowedByRobots(pathnameOf(bundle.link), disallow), false);
});
