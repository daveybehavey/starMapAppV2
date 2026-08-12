import assert from "node:assert/strict";
import test from "node:test";
import {
  PRINT_NEUTRAL_SHIPPING_CARD_NOTE,
  PRINT_NEUTRAL_TRANSIT_DISCLOSURE,
  PRINT_SHIPPING_COUNTRY_PLACEHOLDER_LABEL,
  applyEditorPrintShippingCountrySelection,
  applyUnsetShippingCountrySelectInteraction,
  assertPrintCheckoutShippingCountry,
  buildPrintShippingCountrySelectOptionValues,
  formatPrintDeliveryDisclosure,
  formatPrintDeliveryEstimate,
  getPrintDeliveryEtaLine,
  getPrintfulShippingRate,
  resolveInitialPrintShippingCountry,
  resolveMatchingSelectOptionValue,
} from "./printfulShipping.harness.mjs";
import {
  getPrintDeliveryEstimateLine,
  getPrintDeliveryTimingFaqAnswer,
  getPrintFulfillmentProgressSteps,
  getPrintOrderConfirmationEtaNote,
  getPrintOrderConfirmationNextSteps,
  getPrintPhysicalOrderSummaryLine,
} from "./commerceFacts.harness.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "../../src");

function readSrc(relativePath) {
  return readFileSync(join(srcRoot, relativePath), "utf8");
}

const US_TRANSIT_MARKERS = [/United States/i, /\bU\.S\./i, /4–6 business days/];

function assertNoUsSpecificTransit(text, label) {
  for (const pattern of US_TRANSIT_MARKERS) {
    assert.doesNotMatch(text, pattern, `${label} must not emit US-specific transit (${pattern})`);
  }
}

test("formatPrintDeliveryDisclosure unknown country is destination-neutral", () => {
  for (const country of [undefined, null, "", "ZZ"]) {
    const line = formatPrintDeliveryDisclosure("poster_framed", country);
    assert.equal(line, PRINT_NEUTRAL_TRANSIT_DISCLOSURE);
    assertNoUsSpecificTransit(line, `unknown country=${String(country)}`);
  }
});

test("formatPrintDeliveryDisclosure known US framed remains matrix 4–6", () => {
  const line = formatPrintDeliveryDisclosure("poster_framed", "US");
  assert.match(line, /United States/);
  assert.match(line, /4–6 business days/);
  assert.equal(formatPrintDeliveryEstimate("poster_framed", "US"), "4–6 business days");
});

test("formatPrintDeliveryDisclosure known CA framed remains matrix 7–10", () => {
  const line = formatPrintDeliveryDisclosure("poster_framed", "CA");
  assert.match(line, /Canada/);
  assert.match(line, /7–10 business days/);
  assert.equal(formatPrintDeliveryEstimate("poster_unframed", "CA"), "2–5 business days");
});

test("formatPrintDeliveryDisclosure known GB framed remains matrix-backed", () => {
  const line = formatPrintDeliveryDisclosure("poster_framed", "GB");
  assert.match(line, /United Kingdom/);
  assert.match(line, /8–11 business days/);
});

test("getPrintDeliveryEtaLine stays null until a country exists", () => {
  assert.equal(getPrintDeliveryEtaLine(undefined), null);
  assert.equal(getPrintDeliveryEtaLine(null), null);
  assert.match(getPrintDeliveryEtaLine("CA"), /Canada/);
});

test("getPrintDeliveryEstimateLine unknown is neutral; known countries use matrix", () => {
  const unknown = getPrintDeliveryEstimateLine();
  assert.match(unknown, /2–5 business days/);
  assert.match(unknown, /varies by destination/i);
  assertNoUsSpecificTransit(unknown, "generic delivery estimate");

  const us = getPrintDeliveryEstimateLine({ country: "US", variant: "poster_framed" });
  assert.match(us, /United States/);
  assert.match(us, /4–6 business days/);

  const ca = getPrintDeliveryEstimateLine({ country: "CA", variant: "poster_framed" });
  assert.match(ca, /Canada/);
  assert.match(ca, /7–10 business days/);
});

test("generic FAQ / physical summary / progress steps stay country-neutral", () => {
  const faq = getPrintDeliveryTimingFaqAnswer("Shipping is shown before payment.");
  assertNoUsSpecificTransit(faq, "FAQ answer");

  const summary = getPrintPhysicalOrderSummaryLine();
  assert.match(summary, /Physical prints are made to order/);
  assertNoUsSpecificTransit(summary, "physical order summary");

  const steps = getPrintFulfillmentProgressSteps({ PRINTFUL_AUTO_CONFIRM: "true" });
  assert.ok(steps.some((s) => /varies by destination/i.test(s)));
  assert.ok(!steps.some((s) => /United States|U\.S\.|4–6/.test(s)));
});

test("country-aware confirmation / progress use destination matrix windows", () => {
  const usSteps = getPrintOrderConfirmationNextSteps({
    manualReviewRequired: false,
    country: "US",
    variant: "poster_framed",
  });
  assert.ok(usSteps.some((s) => /United States/.test(s) && /4–6 business days/.test(s)));

  const caSteps = getPrintOrderConfirmationNextSteps({
    manualReviewRequired: false,
    country: "CA",
    variant: "poster_framed",
  });
  assert.ok(caSteps.some((s) => /Canada/.test(s) && /7–10 business days/.test(s)));

  const caNote = getPrintOrderConfirmationEtaNote({
    includesDigitalAddOn: false,
    country: "CA",
    variant: "poster_framed",
  });
  assert.match(caNote, /Canada/);
  assert.match(caNote, /7–10 business days/);
  assert.doesNotMatch(caNote, /United States/);

  const missingNote = getPrintOrderConfirmationEtaNote({ includesDigitalAddOn: false });
  assertNoUsSpecificTransit(missingNote, "confirmation eta without country");
});

test("checkout shipping matrix rates for US and CA are unchanged by disclosure helpers", () => {
  const usFramed = getPrintfulShippingRate("poster_framed", "US");
  const caFramed = getPrintfulShippingRate("poster_framed", "CA");
  const caUnframed = getPrintfulShippingRate("poster_unframed", "CA");
  assert.ok(usFramed && Number.isFinite(usFramed.rate));
  assert.equal(usFramed.min_delivery_days, 4);
  assert.equal(usFramed.max_delivery_days, 6);
  assert.equal(caFramed.min_delivery_days, 7);
  assert.equal(caFramed.max_delivery_days, 10);
  assert.equal(caUnframed.min_delivery_days, 2);
  assert.equal(caUnframed.max_delivery_days, 5);
});

test("editor shipping-country init never silently invents first-list US", () => {
  const allowed = ["US", "CA", "GB"];
  assert.equal(allowed[0], "US", "fixture preserves US-first list order");

  // 1. Fresh visitor: no storage, no query => remains unset
  assert.equal(resolveInitialPrintShippingCountry(null, allowed), null);
  assert.equal(resolveInitialPrintShippingCountry(undefined, allowed), null);
  assert.equal(resolveInitialPrintShippingCountry("", allowed), null);
  assert.equal(
    applyEditorPrintShippingCountrySelection({ stored: null, query: null, allowedCountries: allowed }),
    null,
  );
  assert.equal(
    formatPrintDeliveryDisclosure(
      "poster_framed",
      applyEditorPrintShippingCountrySelection({ stored: null, query: null, allowedCountries: allowed }),
    ),
    PRINT_NEUTRAL_TRANSIT_DISCLOSURE,
  );

  // Unsupported stored value does not fall back to US
  assert.equal(resolveInitialPrintShippingCountry("ZZ", allowed), null);

  // 2. Stored US restores US
  assert.equal(resolveInitialPrintShippingCountry("US", allowed), "US");
  assert.equal(resolveInitialPrintShippingCountry("us", allowed), "US");
  assert.equal(
    applyEditorPrintShippingCountrySelection({ stored: "US", allowedCountries: allowed }),
    "US",
  );

  // 3. Stored CA restores CA
  assert.equal(resolveInitialPrintShippingCountry("CA", allowed), "CA");
  assert.equal(
    applyEditorPrintShippingCountrySelection({ stored: "CA", allowedCountries: allowed }),
    "CA",
  );

  // 4. Explicit supported query selection works (overrides missing storage)
  assert.equal(
    applyEditorPrintShippingCountrySelection({
      stored: null,
      query: "GB",
      allowedCountries: allowed,
    }),
    "GB",
  );
  assert.equal(
    applyEditorPrintShippingCountrySelection({
      stored: "US",
      query: "CA",
      allowedCountries: allowed,
    }),
    "CA",
  );
  assert.equal(
    applyEditorPrintShippingCountrySelection({
      stored: null,
      query: "ZZ",
      allowedCountries: allowed,
    }),
    null,
  );

  // 5. User selection persists / wins over stored+query
  assert.equal(
    applyEditorPrintShippingCountrySelection({
      stored: "US",
      query: "GB",
      userSelected: "CA",
      allowedCountries: allowed,
    }),
    "CA",
  );

  // 6. Checkout/provider paths cannot silently convert unset to US
  assert.deepEqual(assertPrintCheckoutShippingCountry(null, allowed), {
    ok: false,
    reason: "missing_shipping_country",
    country: null,
  });
  assert.deepEqual(assertPrintCheckoutShippingCountry(undefined, allowed), {
    ok: false,
    reason: "missing_shipping_country",
    country: null,
  });
  assert.deepEqual(assertPrintCheckoutShippingCountry("ZZ", allowed), {
    ok: false,
    reason: "print_shipping_country_invalid",
    country: null,
  });
  assert.deepEqual(assertPrintCheckoutShippingCountry("CA", allowed), {
    ok: true,
    reason: null,
    country: "CA",
  });

  const editorSource = readSrc("components/EditorExperience.tsx");
  assert.match(editorSource, /resolveInitialPrintShippingCountry/);
  assert.doesNotMatch(editorSource, /printShippingCountries\[0\]/);
  assert.doesNotMatch(
    editorSource,
    /setPrintShippingCountryValue\(\s*printShippingCountries\[0\]/,
  );
});

test("unset shipping-country selects show placeholder instead of US-first fallthrough", () => {
  const allowed = ["US", "CA", "GB"];
  assert.equal(allowed[0], "US");

  // Without placeholder, controlled value "" falls through to first/US (the P1 defect).
  const withoutPlaceholder = buildPrintShippingCountrySelectOptionValues(allowed, { withPlaceholder: false });
  assert.equal(resolveMatchingSelectOptionValue("", withoutPlaceholder), "US");

  // With placeholder, unset stays visually and logically unset.
  const withPlaceholder = buildPrintShippingCountrySelectOptionValues(allowed, { withPlaceholder: true });
  assert.equal(withPlaceholder[0], "");
  assert.equal(resolveMatchingSelectOptionValue("", withPlaceholder), "");
  assert.equal(PRINT_SHIPPING_COUNTRY_PLACEHOLDER_LABEL, "Select shipping country");

  const unset = applyUnsetShippingCountrySelectInteraction({
    currentCountry: null,
    nextSelectedValue: "",
    allowedCountries: allowed,
  });
  assert.equal(unset.displayValue, "");
  assert.equal(unset.nextCountry, null);
  assert.equal(unset.emittedChange, false);

  // US buyer can select US directly once from placeholder (real change "" -> US).
  const selectUs = applyUnsetShippingCountrySelectInteraction({
    currentCountry: null,
    nextSelectedValue: "US",
    allowedCountries: allowed,
  });
  assert.equal(selectUs.displayValue, "");
  assert.equal(selectUs.nextDisplayValue, "US");
  assert.equal(selectUs.emittedChange, true);
  assert.equal(selectUs.nextCountry, "US");

  // Stored/query restoration still matches a real option, not placeholder.
  assert.equal(resolveMatchingSelectOptionValue("CA", withPlaceholder), "CA");
  assert.equal(
    applyUnsetShippingCountrySelectInteraction({
      currentCountry: "CA",
      nextSelectedValue: "CA",
      allowedCountries: allowed,
    }).emittedChange,
    false,
  );

  const selectorSurfaces = [
    "components/EditorExperience.tsx",
    "components/PaywallModal.tsx",
    "app/MobileCreate.tsx",
  ];
  for (const relativePath of selectorSurfaces) {
    const source = readSrc(relativePath);
    assert.match(source, /PRINT_SHIPPING_COUNTRY_PLACEHOLDER_LABEL/, relativePath);
    assert.match(source, /<option[\s\S]*?value=""[\s\S]*?>/, relativePath);
    assert.match(source, /value=\{printShippingCountry \?\? ""\}/, relativePath);
  }
});

test("generic/indexable surfaces no longer hard-code US transit disclosures", () => {
  const paths = [
    "components/MoneyPagePriceAtGlance.tsx",
    "components/DeliveryFormatModule.tsx",
    "components/WeddingGiftJourneySection.tsx",
    "components/HomeOfferStack.tsx",
    "components/FramedProofSection.tsx",
    "app/shop/page.tsx",
    "app/shipping/page.tsx",
    "app/star-map-gift-formats/page.tsx",
    "app/HomeHero.tsx",
    "lib/supportFaq.ts",
    "lib/commerceFacts.ts",
  ];

  for (const relativePath of paths) {
    const source = readSrc(relativePath);
    assert.doesNotMatch(source, /getPrintUsTotalDeliveryEstimateLine/, relativePath);
    assert.doesNotMatch(source, /formatPrintDeliveryDisclosure\([^)]*["']US["']/, relativePath);
    assert.doesNotMatch(source, /printShippingCountry\s*=\s*["']US["']/, relativePath);
    assert.doesNotMatch(source, /proofShippingCountry\s*=\s*["']US["']/, relativePath);
    assert.doesNotMatch(source, /Est\. to U\.S\./, relativePath);
    assert.doesNotMatch(source, /Typical U\.S\./, relativePath);
    assert.doesNotMatch(source, /U\.S\. shipping shown before you pay/, relativePath);
    assert.doesNotMatch(source, /US shipping starts around/, relativePath);
    assert.doesNotMatch(source, /shipping_country=US/, relativePath);
    assert.doesNotMatch(source, /getPrintShippingEstimate\([^)]*["']US["']/, relativePath);
  }

  assert.match(readSrc("lib/printfulShipping.ts"), /PRINT_NEUTRAL_TRANSIT_DISCLOSURE/);
  assert.match(readSrc("lib/printfulShipping.ts"), /PRINT_NEUTRAL_SHIPPING_CARD_NOTE/);
  assert.equal(PRINT_NEUTRAL_SHIPPING_CARD_NOTE.includes("United States"), false);

  const giftFormats = readSrc("app/star-map-gift-formats/page.tsx");
  assert.match(giftFormats, /PRINT_NEUTRAL_SHIPPING_CARD_NOTE/);
  assert.doesNotMatch(giftFormats, /shipping_country=US/);

  const homeHero = readSrc("app/HomeHero.tsx");
  assert.match(homeHero, /Shipping shown before you pay/);
  assert.doesNotMatch(homeHero, /U\.S\. shipping/);
});

test("post-checkout helpers accept shippingCountry without expanding address/PII surface", () => {
  const verifySource = readSrc("app/api/stripe/verify/route.ts");
  assert.match(verifySource, /shippingCountry/);
  assert.match(verifySource, /normalizeShippingCountryCode/);
  assert.doesNotMatch(verifySource, /shippingDetails\.address\.(line1|city|postal_code)/);

  const successSource = readSrc("app/success/SuccessClient.tsx");
  assert.match(successSource, /shippingCountry/);
  assert.match(successSource, /getPrintFulfillmentProgressSteps\(\{/);

  const confirmSource = readSrc("lib/printOrderConfirmation.ts");
  assert.match(confirmSource, /shippingCountry:\s*record\.shippingDetails\?\.address\?\.country/);
});
