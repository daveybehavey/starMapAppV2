import assert from "node:assert/strict";
import test from "node:test";
import {
  getPrintProductLabel,
  renderPrintOrderConfirmationEmail,
} from "./printOrderConfirmationEmail.harness.mjs";

test("getPrintProductLabel maps framed and unframed variants", () => {
  assert.equal(getPrintProductLabel("poster_framed"), "Framed star map poster");
  assert.equal(getPrintProductLabel("poster_unframed"), "Star map poster (unframed)");
});

test("renderPrintOrderConfirmationEmail uses neutral transit when country missing", () => {
  const rendered = renderPrintOrderConfirmationEmail({
    productLabel: "Framed star map poster",
    successUrl: "https://starmapco.com/success?session_id=cs_live_test",
    supportEmail: "support@starmapco.com",
    manualReviewRequired: false,
  });
  assert.equal(rendered.subject, "Your StarMapCo print order is confirmed");
  assert.match(rendered.text, /Production is made to order \(2–5 business days typical\)/);
  assert.match(rendered.text, /varies by destination/i);
  assert.doesNotMatch(rendered.text, /United States/);
  assert.doesNotMatch(rendered.text, /4–6 business days typical U\.S\./);
  assert.match(rendered.text, /express is not available/i);
  assert.match(rendered.text, /https:\/\/starmapco\.com\/success\?session_id=cs_live_test/);
  assert.match(rendered.html, /Your print is on the way to production/);
});

test("renderPrintOrderConfirmationEmail uses Canada framed matrix when shippingCountry is CA", () => {
  const rendered = renderPrintOrderConfirmationEmail({
    productLabel: "Framed star map poster",
    successUrl: "https://starmapco.com/success?session_id=cs_live_test",
    manualReviewRequired: false,
    shippingCountry: "CA",
    printVariant: "poster_framed",
  });
  assert.match(rendered.text, /Canada/);
  assert.match(rendered.text, /7–10 business days/);
  assert.doesNotMatch(rendered.text, /United States/);
  assert.doesNotMatch(rendered.text, /4–6 business days/);
});

test("renderPrintOrderConfirmationEmail uses US framed matrix when shippingCountry is US", () => {
  const rendered = renderPrintOrderConfirmationEmail({
    productLabel: "Framed star map poster",
    successUrl: "https://starmapco.com/success?session_id=cs_live_test",
    manualReviewRequired: false,
    shippingCountry: "US",
    printVariant: "poster_framed",
  });
  assert.match(rendered.text, /United States/);
  assert.match(rendered.text, /4–6 business days/);
});

test("renderPrintOrderConfirmationEmail includes HD-first step for framed + HD bundles", () => {
  const rendered = renderPrintOrderConfirmationEmail({
    productLabel: "Framed star map poster",
    successUrl: "https://starmapco.com/success?session_id=cs_live_test",
    manualReviewRequired: false,
    includesDigitalAddOn: true,
  });
  assert.match(rendered.text, /HD digital file is available right away/);
  assert.match(rendered.text, /Instant HD after payment; the framed print follows standard production and shipping/);
});

test("renderPrintOrderConfirmationEmail keeps manual review path when flagged", () => {
  const rendered = renderPrintOrderConfirmationEmail({
    productLabel: "Star map poster (unframed)",
    successUrl: "https://starmapco.com/success?session_id=cs_live_test",
    manualReviewRequired: true,
  });
  assert.match(rendered.text, /Manual quality review before production/);
  assert.match(rendered.text, /Star map poster \(unframed\)/);
});
