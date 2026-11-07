/**
 * Shipping-copy accuracy (Grok cascade triage 2026-11-07, #352 F1/F2/F3):
 *
 * - F1: free shipping is judged on the merchandise subtotal BEFORE
 *   promo-code discounts (printFreeShipping.ts + the checkout route), so
 *   a code never removes free shipping a cart already qualifies for. The
 *   /shipping policy page must state that rule — the old sentence claimed
 *   the pre-F4 behaviour ("may remove free shipping").
 * - F2: a standalone framed print qualifies for free standard shipping
 *   at its current price, so framed price lines must render through the
 *   eligibility-aware helper (`formatStandalonePrintPriceWithShipping`,
 *   behaviour pinned by storefrontResidualsB2 B2-04) — not the generic
 *   "+ shipping" label. Below-threshold formats (poster, canvas, card)
 *   keep the generic label.
 * - F3: the keepsake card has no variant product page, so the format
 *   link list must not claim "every format" has one.
 * - F4 (follow-up, PR #600 gate observation): the gate's round-1 probe
 *   read the home FAQ JSON-LD as still saying framed "+ shipping".
 *   Re-verified after the deploy settled: the schema is built from the
 *   same `buildHomeFaqItems` items as the visible block and receives
 *   the eligibility-aware framed label, at source and in the live
 *   HTML — the observation was the same deploy lag the gate recorded
 *   for /shipping and /shop. The schema wiring is pinned below so it
 *   cannot silently regress. The same sweep found one genuine
 *   remaining instance of the F2 class: the success page's print
 *   upsell cards appended "+ shipping shown at checkout" to every
 *   variant, including the framed card they recommend — its sibling
 *   surface (the download page's upsell cards) already branches on
 *   eligibility. Those cards now use the standalone helper too.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const shippingPage = read("../../src/app/shipping/page.tsx");
const homePage = read("../../src/app/page.tsx");
const homeSections = read("../../src/app/HomeStaticSections.tsx");
const productPage = read("../../src/app/products/star-map/[variant]/[market]/page.tsx");
const giftFormatsPage = read("../../src/app/star-map-gift-formats/page.tsx");
const priceAtGlance = read("../../src/components/MoneyPagePriceAtGlance.tsx");
const deliveryFormats = read("../../src/components/DeliveryFormatModule.tsx");
const revenueTrust = read("../../src/components/RevenueTrustModule.tsx");
const roadmap = read("../../src/components/GiftFormatRoadmapModule.tsx");
const formatLinks = read("../../src/components/VariantFormatLinks.tsx");
const successClient = read("../../src/app/success/SuccessClient.tsx");

test("F1: /shipping states the pre-discount free-shipping rule", () => {
  assert.match(
    shippingPage,
    /Free shipping is judged on that subtotal\s+before any promo-code discount is applied, so a promo code never removes free shipping/,
  );
  assert.doesNotMatch(shippingPage, /may remove free shipping/);
});

test("F2: framed price lines use the eligibility-aware standalone helper", () => {
  assert.match(homePage, /const printFramedLabel = formatStandalonePrintPriceWithShipping\("poster_framed"\)/);
  assert.match(homeSections, /framed: formatStandalonePrintPriceWithShipping\("poster_framed"\)/);
  assert.match(priceAtGlance, /const framedPrice = formatStandalonePrintPriceWithShipping\("poster_framed"\)/);
  assert.match(deliveryFormats, /framed: formatStandalonePrintPriceWithShipping\("poster_framed"\)/);
  assert.match(revenueTrust, /formatStandalonePrintPriceWithShipping\("poster_framed"\)/);
  assert.match(giftFormatsPage, /price: formatStandalonePrintPriceWithShipping\("poster_framed"\)/);
  assert.match(roadmap, /const framedPriceLabel = formatStandalonePrintPriceWithShipping\("poster_framed"\)/);
  assert.doesNotMatch(roadmap, /Framed print \(\{framedPriceLabel\} \+ shipping\)/);
});

test("F2: below-threshold formats keep the generic '+ shipping' label", () => {
  // Unframed poster entries stay on the generic helper on the same surfaces.
  assert.match(
    homeSections,
    /unframed: formatPrintPriceWithShipping\(\s+printTiers\.poster_unframed\.amountCents/,
  );
  assert.match(
    priceAtGlance,
    /const unframedPrice = formatPrintPriceWithShipping\(\s+printTiers\.poster_unframed_16x16\.amountCents/,
  );
  assert.match(
    giftFormatsPage,
    /price: formatPrintPriceWithShipping\(printPricing\.card_4x6\.amountCents, printPricing\.card_4x6\.currency\)/,
  );
});

test("F2: the variant product page qualifies its own offer before labelling shipping", () => {
  assert.match(
    productPage,
    /qualifiesForPrintFreeShipping\(\s+getPrintMerchandiseSubtotalCents\(\{ variant: offer\.variant \}\)/,
  );
  assert.match(productPage, /· free standard shipping/);
  // Below-threshold variants fall back to the generic line.
  assert.match(productPage, /: formatPrintPriceWithShipping\(offer\.amountCents, offer\.currency\)/);
});

test("F4: the home FAQ JSON-LD is built from the same items with the eligibility-aware framed label", () => {
  // page.tsx feeds the FAQPage schema the shared item set, with the
  // framed slot filled by the standalone helper's label — the schema
  // cannot carry a framed "+ shipping" line the visible block lacks.
  assert.match(
    homePage,
    /mainEntity: buildHomeFaqItems\(\{\s+single: priceLabel,\s+framed: printFramedLabel,\s+unframed: printUnframedOfferLabel,/,
  );
  // Both framed answers in the shared builder interpolate that label;
  // neither hardcodes a framed price or shipping claim of its own.
  assert.match(homeSections, /framed route from \$\{input\.framed\}/);
  assert.match(homeSections, /framed print \(\$\{input\.framed\}\)/);
});

test("F4: success-page print upsell cards use the eligibility-aware standalone helper", () => {
  assert.match(successClient, /priceLine: formatStandalonePrintPriceWithShipping\(card\.variant\)/);
  assert.doesNotMatch(successClient, /\+ shipping shown at checkout/);
});

test("F3: the format link list no longer claims every format has a page", () => {
  assert.match(formatLinks, /heading = "Each format here, on its own page"/);
  assert.doesNotMatch(formatLinks, /Every format, on its own page/);
});
