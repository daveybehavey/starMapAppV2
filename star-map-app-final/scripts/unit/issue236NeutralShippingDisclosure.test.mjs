import assert from "node:assert/strict";
import test from "node:test";
import {
  PRINT_NEUTRAL_SHIPPING_CARD_NOTE,
  PRINT_NEUTRAL_TRANSIT_DISCLOSURE,
  formatPrintDeliveryDisclosure,
  formatPrintDeliveryEstimate,
  getPrintDeliveryEtaLine,
  getPrintfulShippingRate,
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
