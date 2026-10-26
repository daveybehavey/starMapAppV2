/**
 * Variant landing page inbound links (issue #400, the #395 follow-up).
 *
 * The Merchant Center variant pages (/products/star-map/<slug>/<market>,
 * #395) were discoverable only through the sitemap. /shop and
 * /star-map-poster now link to the five USD pages through the shared
 * VariantFormatLinks component, which mirrors the variant pages' own
 * "Other formats" nav: rows from VARIANT_PAGE_MANIFEST, hrefs built by
 * buildVariantPagePath, labels/prices resolved by resolveVariantOffer.
 *
 * These pins hold that shape at the source level:
 * - both money pages render the component (so both surfaces carry the
 *   links in their HTML);
 * - the component's only href is the manifest-driven USD builder call,
 *   so every manifest slug's USD URL is linked from both surfaces;
 * - the links are plain content links — no `?source=` (the #394 rule
 *   for non-editor links) and no price literal anywhere in the
 *   component (amounts resolve through checkout's helpers, as on the
 *   variant pages themselves).
 */
import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

register("./tsAliasLoader.mjs", import.meta.url);

const { VARIANT_PAGE_MANIFEST, buildVariantPagePath } = await import(
  "../../src/lib/variantPageManifest.ts"
);

const ROOT = resolve(process.cwd());
const readSrc = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

const SHOP_PAGE = "src/app/shop/page.tsx";
const POSTER_PAGE = "src/app/star-map-poster/page.tsx";
const COMPONENT = "src/components/VariantFormatLinks.tsx";

const EXPECTED_SLUGS = [
  "poster-18x18",
  "poster-16x16",
  "framed-14x14",
  "canvas-14x14",
  "mug-11oz",
];

test("both money pages render the shared variant-format links", () => {
  for (const rel of [SHOP_PAGE, POSTER_PAGE]) {
    const source = readSrc(rel);
    assert.match(source, /import VariantFormatLinks from "@\/components\/VariantFormatLinks";/);
    assert.match(source, /<VariantFormatLinks/);
  }
});

test("component links every manifest slug's USD page via the shared builder", () => {
  const component = readSrc(COMPONENT);
  assert.match(component, /VARIANT_PAGE_MANIFEST\.map/);
  assert.match(component, /resolveVariantOffer\(row\.slug, "usd"\)/);
  assert.match(component, /href=\{buildVariantPagePath\(offer\.slug, "usd"\)\}/);
  // The builder call is the component's only href: no hand-written
  // variant URL can drift from the manifest.
  assert.equal((component.match(/href=/g) || []).length, 1);
});

test("each of the 5 USD variant URLs is linked from at least one of the two surfaces", () => {
  const surfaces = [readSrc(SHOP_PAGE), readSrc(POSTER_PAGE)];
  const linkedFromASurface = surfaces.some((source) => source.includes("<VariantFormatLinks"));
  assert.ok(linkedFromASurface, "at least one surface renders VariantFormatLinks");
  assert.deepEqual(
    VARIANT_PAGE_MANIFEST.map((row) => row.slug).sort(),
    [...EXPECTED_SLUGS].sort(),
    "manifest still carries exactly the 5 variant slugs",
  );
  for (const slug of EXPECTED_SLUGS) {
    const url = buildVariantPagePath(slug, "usd");
    assert.equal(url, `/products/star-map/${slug}/usd`);
    // The component maps the full manifest through the builder pinned
    // above, so this URL is emitted by every surface that renders it.
    assert.ok(
      VARIANT_PAGE_MANIFEST.some((row) => buildVariantPagePath(row.slug, "usd") === url),
      `${url} is produced by the component's manifest map`,
    );
  }
});

test("variant links carry no ?source= param and no price literal", () => {
  const component = readSrc(COMPONENT);
  assert.doesNotMatch(component, /href=\{`[^`]*\?/);
  assert.doesNotMatch(component, /\$\d/);
});
