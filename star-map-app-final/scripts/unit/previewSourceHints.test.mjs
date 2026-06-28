import assert from "node:assert/strict";
import test from "node:test";
import {
  isDigitalLandingSource,
  isNeutralWeddingPreviewSource,
  resetMarketingAttributionStorageForTests,
  resolveEditorGiftTrafficIntent,
  shouldAutoOpenEditorDigitalPaywall,
  shouldAutoOpenEditorPrintPaywall,
  shouldDefaultEditorPaywallToPrint,
} from "./previewSourceHints.harness.mjs";
import { storeClientMarketingAttribution } from "./marketingAttributionStorage.harness.mjs";

test("wedding framed landing defaults to print and auto-opens paywall", () => {
  const intent = resolveEditorGiftTrafficIntent({
    source: "wedding-hero-framed",
    checkoutParam: "print",
    printVariantParam: "poster_framed",
    utmCampaign: null,
  });
  assert.equal(intent.paywallIntent, "print");
  assert.equal(intent.preferredPrintVariant, "poster_framed");
  assert.equal(intent.preferredIncludeDigitalAddOn, true);
  assert.equal(intent.autoOpenPaywall, true);
});

test("preview-first wedding paths stay neutral", () => {
  for (const source of ["wedding", "sticky-wedding", "wedding-hero-preview"]) {
    assert.equal(isNeutralWeddingPreviewSource(source), true);
    const intent = resolveEditorGiftTrafficIntent({
      source,
      checkoutParam: null,
      printVariantParam: null,
      utmCampaign: null,
    });
    assert.equal(intent.paywallIntent, "digital", source);
    assert.equal(intent.autoOpenPaywall, false, source);
  }
});

test("gift_wedding_2026 UTM defaults print tab and auto-opens paywall for paid wedding traffic", () => {
  const intent = resolveEditorGiftTrafficIntent({
    source: "wedding-hero-preview",
    checkoutParam: null,
    printVariantParam: null,
    utmCampaign: "gift_wedding_2026",
  });
  assert.equal(intent.paywallIntent, "print");
  assert.equal(intent.preferredIncludeDigitalAddOn, true);
  assert.equal(intent.autoOpenPaywall, true);

  const withPrintSource = resolveEditorGiftTrafficIntent({
    source: "wedding-framed",
    checkoutParam: "print",
    printVariantParam: null,
    utmCampaign: "gift_wedding_2026",
  });
  assert.equal(withPrintSource.paywallIntent, "print");
  assert.equal(withPrintSource.preferredPrintVariant, "poster_framed");
  assert.equal(withPrintSource.autoOpenPaywall, true);
});

test("sticky wedding print CTA auto-opens paywall", () => {
  const intent = resolveEditorGiftTrafficIntent({
    source: "sticky-wedding-framed-hd",
    checkoutParam: "print",
    printVariantParam: "poster_framed",
    utmCampaign: null,
  });
  assert.equal(intent.paywallIntent, "print");
  assert.equal(intent.autoOpenPaywall, true);
});

test("utm-only editor entry defaults print intent to framed bundle and opens paywall", () => {
  const intent = resolveEditorGiftTrafficIntent({
    source: null,
    checkoutParam: null,
    printVariantParam: null,
    utmCampaign: "gift_wedding_2026",
  });
  assert.equal(intent.paywallIntent, "print");
  assert.equal(intent.preferredPrintVariant, "poster_framed");
  assert.equal(intent.preferredIncludeDigitalAddOn, true);
  assert.equal(intent.autoOpenPaywall, true);
});

test("unframed wedding source selects poster_unframed", () => {
  assert.equal(
    shouldDefaultEditorPaywallToPrint("wedding-unframed", "print"),
    true,
  );
  assert.equal(
    shouldAutoOpenEditorPrintPaywall("wedding-unframed", "print"),
    true,
  );
  const intent = resolveEditorGiftTrafficIntent({
    source: "wedding-unframed",
    checkoutParam: "print",
    printVariantParam: null,
    utmCampaign: null,
  });
  assert.equal(intent.preferredPrintVariant, "poster_unframed");
  assert.equal(intent.preferredIncludeDigitalAddOn, false);
});

test("instant HD landing opens digital paywall and stays on digital tab", () => {
  assert.equal(isDigitalLandingSource("hd-star-map-hero-instant"), true);
  assert.equal(isDigitalLandingSource("birthday-ladder-digital"), true);
  assert.equal(shouldAutoOpenEditorDigitalPaywall("hd-star-map-hero-instant", "digital"), true);
  assert.equal(shouldDefaultEditorPaywallToPrint("hd-star-map-hero-instant", "digital"), false);

  const intent = resolveEditorGiftTrafficIntent({
    source: "birthday-hero-instant-hd",
    checkoutParam: "digital",
    printVariantParam: null,
    utmCampaign: null,
  });
  assert.equal(intent.paywallIntent, "digital");
  assert.equal(intent.autoOpenPaywall, true);
  assert.equal(shouldAutoOpenEditorPrintPaywall("birthday-hero-instant-hd", "digital"), false);
});

test("stored gift_wedding_2026 attribution auto-opens paywall without utm param", () => {
  resetMarketingAttributionStorageForTests();
  storeClientMarketingAttribution({ source: "google", medium: "cpc", campaign: "gift_wedding_2026" });

  const intent = resolveEditorGiftTrafficIntent({
    source: "wedding-hero-preview",
    checkoutParam: null,
    printVariantParam: null,
    utmCampaign: null,
  });
  assert.equal(intent.paywallIntent, "print");
  assert.equal(intent.autoOpenPaywall, true);
});

test("digital checkout param beats wedding UTM default-to-print", () => {
  const intent = resolveEditorGiftTrafficIntent({
    source: "wedding-hero-preview",
    checkoutParam: "digital",
    printVariantParam: null,
    utmCampaign: "gift_wedding_2026",
  });
  assert.equal(intent.paywallIntent, "digital");
  assert.equal(intent.autoOpenPaywall, true);
});
