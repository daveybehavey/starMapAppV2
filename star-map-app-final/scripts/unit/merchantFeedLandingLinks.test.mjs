/**
 * Regression: Merchant physical product landing URLs must stay crawlable,
 * and the framed+HD bundle must land on a bundle-specific page (not generic
 * /star-map-poster and not robots-disallowed /editor).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(process.cwd());
const FEED_PATH = resolve(ROOT, "public/merchant-feed.xml");
const GENERATOR_PATH = resolve(ROOT, "scripts/generate-merchant-feed.mjs");
const ROBOTS_PATH = resolve(ROOT, "src/app/robots.ts");
const BUNDLE_PAGE_PATH = resolve(ROOT, "src/app/star-map-poster/framed-hd-bundle/page.tsx");
const POSTER_PAGE_PATH = resolve(ROOT, "src/app/star-map-poster/page.tsx");
const PRICING_PATH = resolve(ROOT, "src/lib/pricing.ts");
const PRINT_FREE_SHIPPING_PATH = resolve(ROOT, "src/lib/printFreeShipping.ts");
const PRINT_CHECKOUT_CONFIG_PATH = resolve(ROOT, "src/lib/printCheckoutConfig.ts");

const PHYSICAL_OFFER_IDS = [
  "print_poster_unframed",
  "print_poster_framed",
  "print_poster_framed_hd_bundle",
];

const BUNDLE_LANDING_PATH = "/star-map-poster/framed-hd-bundle";
const BUNDLE_PRODUCT_NAME = "Custom Star Map Framed Print + HD Digital Download";

function extractItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match = itemRegex.exec(xml);
  while (match) {
    const segment = match[1];
    const id = /<g:id>([\s\S]*?)<\/g:id>/i.exec(segment)?.[1]?.trim() || "";
    const link = /<g:link>([\s\S]*?)<\/g:link>/i.exec(segment)?.[1]?.trim() || "";
    const price = /<g:price>([\s\S]*?)<\/g:price>/i.exec(segment)?.[1]?.trim() || "";
    const title = /<g:title>([\s\S]*?)<\/g:title>/i.exec(segment)?.[1]?.trim() || "";
    items.push({ id, link, price, title });
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
  assert.equal(
    isDisallowedByRobots(BUNDLE_LANDING_PATH, disallow),
    false,
    "bundle landing must remain crawlable",
  );
});

test("generator source points framed+HD bundle at crawlable bundle-specific route", () => {
  const source = readFileSync(GENERATOR_PATH, "utf8");
  const bundleIdx = source.indexOf('id: "print_poster_framed_hd_bundle"');
  assert.ok(bundleIdx >= 0, "expected print_poster_framed_hd_bundle in generator");
  const bundleSlice = source.slice(bundleIdx, bundleIdx + 900);
  const linkMatch = /link:\s*`([^`]+)`/.exec(bundleSlice);
  assert.ok(linkMatch, "expected link template on bundle item");
  assert.equal(linkMatch[1], `\${SITE_URL}${BUNDLE_LANDING_PATH}`);
  assert.doesNotMatch(linkMatch[1], /\/editor/);
  assert.doesNotMatch(linkMatch[1], /\/star-map-poster`$/);
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
  assert.match(bundle.link, /\/star-map-poster\/framed-hd-bundle\/?$/);
  assert.equal(bundle.title, BUNDLE_PRODUCT_NAME);
  assert.match(bundle.price, /^106\.00\s+USD$/i);
  assert.equal(isDisallowedByRobots(pathnameOf(bundle.link), disallow), false);

  const framed = physical.find((item) => item.id === "print_poster_framed");
  const unframed = physical.find((item) => item.id === "print_poster_unframed");
  assert.match(framed.link, /\/star-map-poster\/?$/);
  assert.match(unframed.link, /\/star-map-poster\/?$/);
});

test("bundle landing source presents framed+HD semantics and preselect CTA", () => {
  const page = readFileSync(BUNDLE_PAGE_PATH, "utf8");
  const checkoutConfig = readFileSync(PRINT_CHECKOUT_CONFIG_PATH, "utf8");
  assert.match(page, new RegExp(BUNDLE_PRODUCT_NAME.replace(/[+]/g, "\\$&")));
  assert.match(page, /getPrintDigitalAddOnPrice/);
  assert.match(page, /getPrintMerchandiseSubtotalCents/);
  assert.match(page, /includeDigitalAddOn:\s*true/);
  assert.match(page, /variant:\s*"poster_framed"/);
  assert.match(page, /buildPrintEditorCheckoutHref/);
  assert.match(checkoutConfig, /checkout:\s*"print"/);
  assert.match(checkoutConfig, /print_variant/);
  assert.match(checkoutConfig, /include_digital_addon/);
  assert.doesNotMatch(page, /Framed starts at/);
  assert.doesNotMatch(page, /Unframed starts at/);
  // Primary offer must not be framed-only $99 messaging.
  assert.doesNotMatch(page, /formatPrintPriceWithShipping\(\s*printTiers\.poster_framed/);
});

test("bundle Product/Offer structured data derives same price basis as feed", () => {
  const page = readFileSync(BUNDLE_PAGE_PATH, "utf8");
  const feed = readFileSync(FEED_PATH, "utf8");
  const generator = readFileSync(GENERATOR_PATH, "utf8");
  const pricing = readFileSync(PRICING_PATH, "utf8");
  const freeShipping = readFileSync(PRINT_FREE_SHIPPING_PATH, "utf8");
  const checkoutConfig = readFileSync(PRINT_CHECKOUT_CONFIG_PATH, "utf8");

  assert.match(page, /"@type":\s*"Product"/);
  assert.match(page, /"@type":\s*"Offer"/);
  assert.match(page, /availability:\s*"https:\/\/schema\.org\/InStock"/);
  assert.match(page, /\(bundleCents\s*\/\s*100\)\.toFixed\(2\)/);
  assert.match(page, new RegExp(`name:\\s*BUNDLE_PRODUCT_NAME|name:\\s*"${BUNDLE_PRODUCT_NAME.replace(/[+]/g, "\\$&")}"`));

  assert.match(generator, /PRINT_FRAMED_HD_BUNDLE_CENTS\s*=\s*PRINT_FRAMED_CENTS\s*\+\s*PRINT_DIGITAL_ADDON_CENTS/);
  assert.match(pricing, /function getPrintDigitalAddOnPrice/);
  assert.match(freeShipping, /includeDigitalAddOn[\s\S]*getPrintDigitalAddOnPrice/);
  assert.match(checkoutConfig, /includeDigitalAddOn[\s\S]*include_digital_addon/);

  const bundle = extractItems(feed).find((item) => item.id === "print_poster_framed_hd_bundle");
  assert.ok(bundle);
  assert.match(bundle.price, /^106\.00\s+USD$/i);
});

test("generic /star-map-poster page remains framed/unframed money page (unchanged role)", () => {
  const poster = readFileSync(POSTER_PAGE_PATH, "utf8");
  assert.match(poster, /Framed starts at/);
  assert.match(poster, /Unframed starts at/);
  assert.match(poster, /print_variant=poster_framed/);
  assert.match(poster, /print_variant=poster_unframed/);
  assert.doesNotMatch(poster, /framed-hd-bundle/);
  assert.doesNotMatch(poster, /Custom Star Map Framed Print \+ HD Digital Download/);
});
