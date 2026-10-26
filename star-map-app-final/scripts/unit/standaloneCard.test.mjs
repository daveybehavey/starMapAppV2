/**
 * Standalone keepsake card (decided 2026-10-25): card_4x6 sells on its
 * own at its catalog price, not only as the framed add-on.
 *
 * Behaviour is pinned through printCatalog.ts (alias-free, importable by
 * the plain-Node runner, same pattern as paywallMugOffer). The editor
 * artwork wiring, landing page, shop/gift-format surfaces, and sitemap
 * entry are pinned by source construction — the components use the @/
 * alias and cannot be imported here.
 *
 * What must NOT change (and is pinned here or in sibling suites):
 * - the framed + card bundle row and its pricing stay in the base offer
 *   set (paywallMugOffer.test.mjs);
 * - Lever A second copy never applies to the card
 *   (checkoutSecondCopy.test.mjs + the eligibility pin below);
 * - the Merchant Center variant route still 404s card-4x6
 *   (variantPages.test.mjs).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { isSecondCopyEligibleVariant, resolvePaywallOfferRows } from "../../src/lib/printCatalog.ts";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("the standalone card row is a plain purchase row, not the add-on row", () => {
  const [row] = resolvePaywallOfferRows("card_4x6");
  assert.equal(row.variant, "card_4x6");
  assert.equal(row.includeDigitalAddOn, false);
  assert.equal(row.includeCardAddOn, undefined, "standalone row must not carry the add-on flag");
});

test("second copy never applies to the card", () => {
  assert.equal(isSecondCopyEligibleVariant("card_4x6"), false);
});

test("editor: standalone card orders upload the 4x6 card export as the print asset", () => {
  const editor = read("../../src/components/EditorExperience.tsx");
  assert.match(editor, /const isStandaloneCard = printVariant === "card_4x6";/);
  // Poster-shaped export is skipped for the standalone card…
  assert.match(editor, /const exportWidths = isStandaloneCard\s*\n?\s*\? \[\]/);
  // …the dedicated card export block runs for it…
  assert.match(
    editor,
    /\(includeCardAddOn && printVariant === "poster_framed" && !includeDigitalAddOn\) \|\|\s*isStandaloneCard/,
  );
  // …and the uploaded card asset becomes the order's print asset, with no
  // cardPrintAssetId (that field is only for the framed add-on).
  assert.match(
    editor,
    /if \(isStandaloneCard\) \{\s*\/\/ The card export IS this order's print asset[\s\S]*?checkoutPayload\.printAssetId = uploadedCardAssetId;/,
  );
});

test("fulfilment: the Printful order builder prints the base variant's own file as a single item source", () => {
  const printful = read("../../src/lib/printful.ts");
  // Base variant leads the item list; add-ons follow only when present.
  assert.match(printful, /const itemVariants = \[input\.variant, \.\.\.additionalVariants\];/);
  assert.match(printful, /files: \[\{ url: input\.variantFileUrls\?\.\[itemVariant\] \?\? input\.fileUrl \}\]/);
  const webhook = read("../../src/app/api/stripe/webhook/route.ts");
  // The webhook only adds the card as an EXTRA item when the framed
  // add-on flag is set; a standalone card session never sets it, so the
  // card is the order's only item.
  assert.match(webhook, /additionalVariants: payload\.includesCardAddOn \? \["card_4x6"\] : undefined/);
});

test("landing page: exists, prices from the catalog tier, and enters checkout with the card preselected", () => {
  const pagePath = new URL("../../src/app/star-map-keepsake-card/page.tsx", import.meta.url);
  assert.ok(existsSync(pagePath), "keepsake card landing page must exist");
  const page = read("../../src/app/star-map-keepsake-card/page.tsx");
  // Price comes from the pricing tiers (the catalog helpers), never a literal.
  assert.match(page, /printTiers\.card_4x6/);
  assert.doesNotMatch(page, /\$19|1900/, "no hard-coded card price in the landing page");
  assert.match(page, /buildPrintEditorCheckoutHref\(\{\s*source: "keepsake-card",\s*variant: "card_4x6",\s*\}\)/);
  // Real card product render from the repo's print-proof assets.
  assert.match(page, /\/printproof\/gift-raw\/card\/card-mockup\.jpg/);
});

test("landing page: sticky CTA reuses the card checkout href, not the generic editor fallback", () => {
  const page = read("../../src/app/star-map-keepsake-card/page.tsx");
  // Without primaryHref, StickyCtaBar falls back to
  // /editor?mode=quick&source=sticky-keepsake-card — no checkout=print and
  // no print_variant, so the editor defaults to another variant and the
  // standalone card is unreachable from the sticky bar. The bar must get
  // the same primaryHref as the main CTA: buildPrintEditorCheckoutHref
  // with variant card_4x6 (checkout=print&print_variant=card_4x6, pinned
  // in the landing-page test above).
  assert.match(
    page,
    /<StickyCtaBar\s+source="sticky-keepsake-card"\s+primaryHref=\{primaryHref\}/,
  );
});

test("shop and gift formats link the card purchase path and the landing page", () => {
  const shop = read("../../src/app/shop/page.tsx");
  assert.match(shop, /print_variant=card_4x6/);
  assert.match(shop, /href="\/star-map-keepsake-card"/);

  const formats = read("../../src/app/star-map-gift-formats/page.tsx");
  assert.match(formats, /print_variant=card_4x6/);
  assert.match(formats, /href="\/star-map-keepsake-card"/);
});

test("sitemap carries the keepsake card page", () => {
  const sitemap = read("../../src/lib/buildSitemapEntries.ts");
  assert.match(sitemap, /url: `\$\{baseUrl\}\/star-map-keepsake-card`/);
});
