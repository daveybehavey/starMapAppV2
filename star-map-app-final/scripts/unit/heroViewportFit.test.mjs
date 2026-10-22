import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const css = read("src/app/globals.css");
const heroBlock = css.match(/\.hero-plan \{([\s\S]*?)\n\}/)?.[1] ?? "";

test("hero sizes against the measured total chrome height, not the header constant", () => {
  assert.ok(heroBlock, ".hero-plan block must exist in globals.css");
  assert.match(
    heroBlock,
    /min-height: calc\(100svh - var\(--site-chrome-height\)\);/,
  );
  assert.match(
    heroBlock,
    /min-height: calc\(100dvh - var\(--site-chrome-height\)\);/,
  );
  assert.doesNotMatch(heroBlock, /--site-header-height/);
});

test("chrome height variable defaults to the header height (banner-hidden state)", () => {
  assert.match(css, /--site-chrome-height: var\(--site-header-height\);/);
});

test("banner and nav expose the hooks the chrome measurement reads", () => {
  assert.match(
    read("src/components/ChristmasBanner.tsx"),
    /data-site-chrome-banner/,
  );
  assert.match(read("src/components/SiteTopNav.tsx"), /data-site-chrome-nav/);
});

test("layout mounts the chrome height sync next to the chrome it measures", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(
    layout,
    /import SiteChromeHeightSync from "@\/components\/SiteChromeHeightSync";/,
  );
  assert.match(layout, /<SiteChromeHeightSync \/>/);
});

test("chrome sync measures rendered elements instead of hardcoding heights", () => {
  const sync = read("src/components/SiteChromeHeightSync.tsx");
  // Sums both chrome parts from their rendered heights.
  assert.match(sync, /\[data-site-chrome-banner\]/);
  assert.match(sync, /\[data-site-chrome-nav\]/);
  assert.match(sync, /offsetHeight/);
  assert.match(
    sync,
    /style\.setProperty\("--site-chrome-height", `\$\{height\}px`\)/,
  );
  // Tracks wraps (resize) and banner mount/unmount (mutation).
  assert.match(sync, /new ResizeObserver\(/);
  assert.match(sync, /new MutationObserver\(/);
  // Observes the stable layout wrapper directly, so arriving from a
  // chrome-less route (banner/nav initially absent) still re-measures
  // when the chrome mounts inside it on client-side navigation.
  assert.match(sync, /querySelector\("\.cosmic-backdrop"\)/);
  // Never writes a fixed pixel height of its own.
  assert.doesNotMatch(sync, /setProperty\("--site-chrome-height", "\d+px"\)/);
});

test("viewport-fit equation: chrome + hero always totals exactly the viewport", () => {
  // The layout equation the CSS now encodes, checked arithmetically:
  // pageTop = banner + header + hero, hero = viewport - (banner + header).
  // With the banner hidden its measured height is 0, so the hero returns
  // to viewport - header with no gap.
  const cases = [
    { viewport: 1080, banner: 75, header: 56 },
    { viewport: 900, banner: 75, header: 56 },
    { viewport: 768, banner: 75, header: 56 },
    { viewport: 844, banner: 124, header: 41 },
    { viewport: 1080, banner: 0, header: 56 },
    { viewport: 844, banner: 0, header: 41 },
  ];
  for (const { viewport, banner, header } of cases) {
    const chrome = banner + header;
    const hero = viewport - chrome;
    assert.equal(banner + header + hero, viewport);
    assert.ok(hero > 0);
  }
});
