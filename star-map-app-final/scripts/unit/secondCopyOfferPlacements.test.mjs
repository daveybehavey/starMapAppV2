/**
 * S55-7 merchandising spec — Lever A surfacing placement/exclusion pins.
 *
 * Source-construction pins for the surfaces that cannot be imported
 * here: the copy deck string is exact, each enabled surface renders
 * the note at the specced DOM position behind the specced gate, and
 * the excluded paths (digital/merch/partner, the merch panel, the
 * not-yet-enabled shared inputs) carry no offer.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const COPY = "Add a second copy of the same design at checkout for 10% off that copy.";

test("copy deck: A1 is the single shared string, with no prohibited wording", () => {
  const note = read("src/components/SecondCopyOfferNote.tsx");
  assert.ok(note.includes(`"${COPY}"`));
  assert.doesNotMatch(note, /\binstant\b/i);
  assert.doesNotMatch(read("src/lib/secondCopyOffer.ts"), /\binstant\b/i);
});

test("variant page: note sits in the price box after the shipping disclosure, gated on the page's own variant", () => {
  const page = read("src/app/products/star-map/[variant]/[market]/page.tsx");
  assert.ok(page.includes("isSecondCopyEligibleVariant(offer.variant)"));
  const disclosureIdx = page.indexOf("{shippingDisclosure}");
  const noteIdx = page.indexOf("<SecondCopyOfferNote");
  const ctaIdx = page.indexOf("Create yours — free preview");
  assert.ok(disclosureIdx > -1 && noteIdx > disclosureIdx && noteIdx < ctaIdx);
});

test("poster + custom map: joint hero note and both shared components enabled", () => {
  for (const rel of ["src/app/star-map-poster/page.tsx", "src/app/custom-night-sky-map/page.tsx"]) {
    const page = read(rel);
    assert.ok(page.includes("<SecondCopyOfferNote"), rel);
    assert.ok(page.includes("showSecondCopyOffer={showSecondCopyOffer}"), rel);
    assert.ok(page.includes("resolveSecondCopyOfferVisibility()"), rel);
  }
});

test("delivery format module: note in both print cards only, opt-in default off", () => {
  const mod = read("src/components/DeliveryFormatModule.tsx");
  assert.ok(mod.includes("showSecondCopyOffer = false"));
  assert.equal(mod.split("<SecondCopyOfferNote").length - 1, 2);
  const digitalCard = mod.slice(mod.indexOf("HD digital delivery"), mod.indexOf("printCheckoutEnabled ?"));
  assert.ok(!digitalCard.includes("SecondCopyOfferNote"));
});

test("purchase trust panel: offer is a list item right after the shipping item, default off", () => {
  const panel = read("src/components/PurchaseTrustPanel.tsx");
  assert.ok(panel.includes("showSecondCopyOffer = false"));
  const shippingIdx = panel.indexOf("getPrintFreeShippingShortTag() ?? shippingDisclosure");
  const offerIdx = panel.indexOf("<li>{SECOND_COPY_OFFER_COPY}</li>");
  const formatIdx = panel.indexOf("Framed print is the premium gift route");
  assert.ok(shippingIdx > -1 && offerIdx > shippingIdx && offerIdx < formatIdx);
});

test("shop: hero note present; card notes gated per-card on the card's own variant", () => {
  const shop = read("src/app/shop/page.tsx");
  assert.ok(shop.includes("<SecondCopyOfferNote"));
  assert.ok(shop.includes("isSecondCopyEligibleVariant(card.variant)"));
  assert.ok(shop.includes('variant: "poster_framed" as PrintVariant | null'));
  assert.ok(shop.includes('variant: "canvas_wrap" as PrintVariant | null'));
  assert.ok(shop.includes('variant: "mug_11oz" as PrintVariant | null'));
  assert.ok(shop.includes("variant: null"));
});

test("not-yet-enabled shared inputs stay off: no consumer enables them", () => {
  const glance = read("src/components/MoneyPagePriceAtGlance.tsx");
  assert.ok(glance.includes("secondCopyOfferPaths"));
  const giftPanel = read("src/components/PrintGiftDecisionPanel.tsx");
  assert.ok(giftPanel.includes("showSecondCopyOffer = false"));

  const consumers = [
    "src/app/anniversary/page.tsx",
    "src/app/birthday/page.tsx",
    "src/app/christmas-star-map-gift/page.tsx",
    "src/app/hd-star-map/page.tsx",
    "src/app/night-sky-map-gift/page.tsx",
    "src/app/personalized-star-map/page.tsx",
    "src/app/star-map-gift-formats/page.tsx",
    "src/app/star-map-gift-ideas/page.tsx",
    "src/app/star-map-gift/page.tsx",
    "src/components/WeddingLandingHero.tsx",
    "src/components/EditorExperience.tsx",
    "src/components/PaywallModal.tsx",
    "src/app/MobileCreate.tsx",
  ];
  for (const rel of consumers) {
    const source = read(rel);
    assert.ok(!source.includes("secondCopyOfferPaths"), rel);
    assert.ok(!/<PrintGiftDecisionPanel[^>]*showSecondCopyOffer/.test(source), rel);
  }
});

test("merch purchase panel carries no Lever A claim", () => {
  const merch = read("src/components/MerchPurchasePanel.tsx");
  assert.ok(!merch.includes("SecondCopyOffer"));
  assert.ok(!merch.includes("second copy"));
});
