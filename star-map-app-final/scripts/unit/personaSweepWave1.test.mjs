/**
 * Persona sweep wave 1 (F1–F7): the full free-shipping disclosure is carried
 * exactly once per page (PurchaseTrustPanel), secondary mentions use the
 * canonical short tag, /shop copy uses the "our print partner" register, og
 * metadata is page-specific, the sitemap lists only canonical URLs, and the
 * 404 page is StarMapCo-voiced.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { register } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

register("./tsResolveHook.mjs", pathToFileURL(path.dirname(fileURLToPath(import.meta.url)) + "/"));

test("F6: sitemap omits the redirecting /personalized-star-map and keeps the canonical target", async () => {
  const { buildSitemapEntries } = await import(
    pathToFileURL(path.join(ROOT, "src/lib/buildSitemapEntries.ts")).href
  );
  const entries = buildSitemapEntries({ baseUrl: "https://starmapco.com", blogPosts: [] });
  const urls = entries.map((entry) => entry.url);
  assert.ok(
    !urls.some((url) => url.endsWith("/personalized-star-map")),
    "sitemap must not list /personalized-star-map (308 redirect)"
  );
  assert.ok(
    urls.some((url) => url.endsWith("/best-personalized-star-map-gift")),
    "sitemap keeps the canonical /best-personalized-star-map-gift"
  );
});

test("F1: HomeOfferStack framed card uses the short tag, not the full offer line", () => {
  const source = readSrc("src/components/HomeOfferStack.tsx");
  assert.doesNotMatch(source, /<li>\{freeShippingOffer\}<\/li>/);
  assert.match(source, /getPrintFreeShippingShortTag\(\) \?\? freeShippingOffer/);
});

test("F1: money pages pass the full disclosure to PurchaseTrustPanel only once and short-tag secondary mentions", () => {
  const cases = [
    {
      file: "src/app/star-map-gift/page.tsx",
      oldStrings: ["after previewing your design. ${shippingDisclosure}"],
    },
    {
      file: "src/app/personalized-star-map/page.tsx",
      oldStrings: ["during checkout. ${shippingDisclosure}"],
    },
    {
      file: "src/app/star-map-poster/page.tsx",
      oldStrings: [
        "same approved design. ${shippingDisclosure}",
        "ready-to-hang framed print. ${shippingDisclosure}",
        "ready to gift or display. ${shippingDisclosure}",
      ],
    },
    {
      file: "src/app/star-map-generator/page.tsx",
      oldStrings: ["without rebuilding the map. ${shippingDisclosure}"],
      keptStrings: ["HD digital delivery. ${shippingDisclosure}"],
    },
  ];
  for (const { file, oldStrings, keptStrings = [] } of cases) {
    const source = readSrc(file);
    assert.match(source, /shippingTagSentence/, `${file} defines the short-tag sentence`);
    for (const old of oldStrings) {
      assert.ok(!source.includes(old), `${file} no longer renders the full disclosure at: ${old}`);
    }
    for (const kept of keptStrings) {
      assert.ok(source.includes(kept), `${file} keeps its sole full-disclosure carrier: ${kept}`);
    }
  }

  const formats = readSrc("src/app/star-map-gift-formats/page.tsx");
  assert.match(formats, /\{shippingTagSentence\}/);
  assert.doesNotMatch(formats, /\{shippingDisclosure\}/, "gift-formats renders the disclosure only via the panel points");

  const gift = readSrc("src/app/star-map-gift/page.tsx");
  assert.doesNotMatch(gift, /\{shippingDisclosure\}/, "star-map-gift renders the disclosure only via the panel points");
});

test("F1: framed+HD bundle page short-tags its FAQ and price card; the trust panel keeps the full line", () => {
  const source = readSrc("src/app/star-map-poster/framed-hd-bundle/page.tsx");
  assert.ok(
    !source.includes("under current thresholds. ${freeShippingOfferLine ?? shippingDisclosure}"),
    "bundle FAQ no longer repeats the full offer line"
  );
  assert.match(source, /freeShippingTagOrOffer \?\? shippingDisclosure/);
  assert.ok(
    source.includes("${freeShippingOfferLine ?? shippingDisclosure} This bundle qualifies"),
    "PurchaseTrustPanel point keeps the full offer line (sole carrier)"
  );
});

test("F2: /shop customer copy never names Printful; the register is 'our print partner'", () => {
  const source = readSrc("src/app/shop/page.tsx");
  assert.doesNotMatch(source, /through Printful/);
  assert.doesNotMatch(source, /Printful fulfillment/);
  assert.doesNotMatch(source, /Fulfillment via Printful/);
  assert.doesNotMatch(source, /fulfilled via Printful/);
  assert.match(source, /through our print partner/);
  assert.match(source, /Made to order by our print partner/);
});

test("F3: bundle line and format-module intro use the canonical short tag format", () => {
  const form = readSrc("src/components/PreviewStartForm.tsx");
  assert.doesNotMatch(form, /free standard shipping on \$100\+ orders/);
  assert.match(form, /getPrintFreeShippingShortTag\(\)/);

  const module_ = readSrc("src/components/DeliveryFormatModule.tsx");
  assert.doesNotMatch(module_, /\$100\+ orders/);
  assert.match(module_, /freeShippingShortTag/);
});

test("F4: /about openGraph carries the standard site og image", () => {
  const source = readSrc("src/app/about/page.tsx");
  assert.match(source, /openGraph:\s*{[\s\S]*?custom-star-map-anniversary\.webp/);
});

test("F5: policy pages declare page-specific openGraph title/description", () => {
  const cases = [
    { file: "src/app/support/page.tsx", title: "Support | StarMapCo" },
    { file: "src/app/returns/page.tsx", title: "Returns & Refunds Policy | StarMapCo" },
    { file: "src/app/shipping/page.tsx", title: "Shipping Policy | StarMapCo" },
    { file: "src/app/contact/page.tsx", title: "Contact | StarMapCo" },
  ];
  for (const { file, title } of cases) {
    const source = readSrc(file);
    const ogBlock = new RegExp(`openGraph:\\s*{\\s*title: "${title.replace(/[|]/g, "\\|")}"`);
    assert.match(source, ogBlock, `${file} openGraph title is page-specific`);
    assert.match(source, /openGraph:\s*{[\s\S]*?description:/, `${file} openGraph has a description`);
  }
});

test("F7: the 404 page is StarMapCo-voiced with recovery links", () => {
  const source = readSrc("src/app/not-found.tsx");
  assert.doesNotMatch(source, /This page could not be found/);
  assert.match(source, /href="\/shop"/);
  assert.match(source, /href="\/editor"/);
});
