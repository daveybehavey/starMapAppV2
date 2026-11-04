import { expect, test } from "@playwright/test";
import { INDEXABLE_LOCATION_SLUGS, INDEXABLE_OCCASION_SLUGS } from "../src/data/seoIndexing";
import { listVariantPagePaths } from "../src/lib/variantPageManifest";

// Cover every existing Product surface and every new landing-page instance.
const productPaths = [
  "/", "/shop", "/wedding", "/anniversary", "/birthday", "/night-sky-map-gift",
  "/star-map-generator", "/star-map-poster", "/star-map-poster/framed-hd-bundle",
  "/star-map-keepsake-card", "/christmas-star-map-gift", "/custom-night-sky-map",
  "/hd-star-map", "/personalized-star-map", "/star-map-gift", "/constellation-map",
  ...INDEXABLE_OCCASION_SLUGS.map(slug => `/star-map-for/${slug}`),
  ...INDEXABLE_LOCATION_SLUGS.map(slug => `/star-map-in/${slug}`),
  ...listVariantPagePaths(),
];
const collectionPaths = [
  "/star-map-for", "/star-map-in", "/star-map-gift-ideas", "/star-map-gift-formats",
  "/star-map-gallery", "/black-friday",
];

for (const path of [...productPaths, ...collectionPaths]) {
  test(`storefront JSON-LD parses and has factual offer fields: ${path}`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const html = await response.text();
    const scripts = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
    expect(scripts.length).toBeGreaterThan(0);
    const entities: Record<string, unknown>[] = [];
    function collect(value: unknown) {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) { value.forEach(collect); return; }
      const object = value as Record<string, unknown>;
      expect(object).not.toHaveProperty("review");
      expect(object).not.toHaveProperty("aggregateRating");
      entities.push(object);
      Object.values(object).forEach(collect);
    }
    scripts.forEach(match => collect(JSON.parse(match[1])));
    if (path !== "/") {
      const breadcrumb = entities.find(entity => entity["@type"] === "BreadcrumbList");
      expect(breadcrumb).toBeDefined();
      const items = breadcrumb!.itemListElement as { position: number; item: { "@id": string } }[];
      expect(items.length).toBeGreaterThan(1);
      items.forEach((item, index) => {
        expect(item.position).toBe(index + 1);
        expect(new URL(item.item["@id"]).protocol).toMatch(/^https?:$/);
      });
      expect(new URL(items.at(-1)!.item["@id"]).pathname).toBe(path);
    }
    if (productPaths.includes(path)) {
      expect(entities.filter(entity => entity["@type"] === "Product")).toHaveLength(1);
      const offers = entities.filter(entity => entity["@type"] === "Offer");
      expect(offers.length).toBeGreaterThan(0);
      for (const offer of offers) {
        expect(String(offer.price)).toMatch(/^\d+(\.\d{2})?$/);
        expect(Number(offer.price)).toBeGreaterThan(0);
        expect(offer.priceCurrency).toMatch(/^[A-Z]{3}$/);
        expect(offer.availability).toMatch(/^https:\/\/schema.org\/(InStock|OutOfStock|PreOrder|BackOrder)$/);
        expect(new URL(offer.url as string).protocol).toMatch(/^https?:$/);
      }
    }
  });
}
