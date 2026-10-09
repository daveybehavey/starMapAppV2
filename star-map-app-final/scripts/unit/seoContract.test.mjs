import assert from "node:assert/strict";
import test from "node:test";
import { assertCanonical, assertSitemap, loadSeoExports } from "./seoContract.harness.mjs";

const protectedPaths = ["/api/", "/editor", "/funnel", "/download", "/success", "/m/"];

function assertText(value, label) {
  assert.equal(typeof value, "string", `${label}: missing text`);
  assert.ok(value.trim().length > 0, `${label}: empty text`);
  assert.doesNotMatch(value, /undefined|null|\[object Object\]/, `${label}: unresolved text`);
}

function assertMetadata(metadata, origin, path) {
  assertText(metadata.title, `${path} title`);
  assertText(metadata.description, `${path} description`);
  assertCanonical(metadata.alternates?.canonical, origin, path);
  assert.equal(metadata.openGraph?.title, metadata.title, `${path}: OG title`);
  assert.equal(metadata.openGraph?.description, metadata.description, `${path}: OG description`);
  assertCanonical(metadata.openGraph?.url, origin, path, `${path} OG URL`);
  assert.equal(metadata.openGraph?.type, "website");
}

for (const origin of ["https://starmapco.com", "https://seo-contract.example"]) {
  for (const enabled of [false, true]) {
    test(`sitemap and robots contracts: ${origin}, optional lanes ${enabled}`, async () => {
      const load = loadSeoExports({
        ...(origin === "https://starmapco.com" ? {} : { NEXT_PUBLIC_SITE_URL: origin }),
        BULK_EVENT_ORDERS_ENABLED: String(enabled), NEXT_PUBLIC_SHOP_TAB_ENABLED: String(enabled),
      });
      const urls = assertSitemap(await load("app/sitemap").default(), origin);
      for (const path of ["/", "/about", "/blog", "/star-map-in/new-york-ny", "/star-map-for/new-baby"]) {
        assert.ok(urls.has(`${origin}${path}`), `sitemap missing representative route ${path}`);
      }
      assert.equal(urls.has(`${origin}/shop`), enabled);
      assert.equal(urls.has(`${origin}/bulk-event-orders`), enabled);
      const robots = load("app/robots").default();
      assertCanonical(robots.sitemap, origin, "/sitemap.xml", "robots sitemap linkage");
      assert.equal(robots.host, origin);
      const rule = robots.rules.find((item) => item.userAgent === "*");
      assert.ok(rule, "robots needs wildcard policy");
      assert.equal(rule.allow, "/");
      for (const path of protectedPaths) assert.ok(rule.disallow.includes(path), `robots must protect ${path}`);
      assert.equal(rule.disallow.includes("/bulk-event-orders"), !enabled);
      for (const value of urls) {
        const path = new URL(value).pathname;
        assert.ok(!rule.disallow.some((prefix) => path.startsWith(prefix)), `sitemap advertises robots-blocked route ${path}`);
      }
    });
  }

  test(`root, static and dynamic metadata use canonical origin ${origin}`, async () => {
    const load = loadSeoExports(origin === "https://starmapco.com" ? {} : { NEXT_PUBLIC_SITE_URL: origin });
    const root = load("app/layout").metadata;
    assert.equal(root.metadataBase.origin, origin);
    assertText(root.title.default, "root title");
    assertText(root.description, "root description");
    assertText(root.openGraph.title, "root OG title");
    assertText(root.openGraph.description, "root OG description");
    assertCanonical(new URL(root.openGraph.url).href, origin, "/", "root OG URL");
    assert.equal(root.openGraph.type, "website");
    const image = root.openGraph.images[0];
    assertCanonical(image.url, origin, "/custom-star-map-anniversary.png", "root OG image");
    assert.equal(image.width, 1200);
    assert.equal(image.height, 630);
    assertMetadata(load("app/about/page").metadata, origin, "/about");
    for (const [route, slug, titleTerm] of [
      ["star-map-in", "new-york-ny", /New York/],
      ["star-map-for", "new-baby", /New Baby/],
    ]) {
      const metadata = await load(`app/${route}/[slug]/page`).generateMetadata({ params: Promise.resolve({ slug }) });
      assertMetadata(metadata, origin, `/${route}/${slug}`);
      assert.match(metadata.title, titleTerm);
      assert.notEqual(metadata.robots?.index, false);
      const ogImage = metadata.openGraph.images[0];
      assertCanonical(ogImage.url, origin, "/og-default.png", `${route} OG image`);
      assert.equal(ogImage.width, 1200);
      assert.equal(ogImage.height, 630);
    }
  });
}

test("negative controls reject duplicate/malformed sitemap URLs and wrong canonical origin", () => {
  const origin = "https://seo-contract.example";
  const entry = { url: `${origin}/about` };
  assert.throws(() => assertSitemap([entry, entry], origin), /sitemap entry 1 .*duplicate URL/);
  for (const url of ["not a URL", `${origin}/bad path`, `${origin}/about?tracking=1`]) {
    assert.throws(() => assertSitemap([{ url }], origin), /sitemap entry 0 .*malformed URL|sitemap entry 0 .*query, fragment/);
  }
  assert.throws(() => assertCanonical("https://wrong.example/about", origin, "/about"), /wrong canonical origin/);
});
