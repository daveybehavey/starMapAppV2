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

test("renderPrintOrderConfirmationEmail includes manual review and success link", () => {
  const rendered = renderPrintOrderConfirmationEmail({
    productLabel: "Framed star map poster",
    successUrl: "https://starmapco.com/success?session_id=cs_live_test",
    supportEmail: "support@starmapco.com",
    manualReviewRequired: true,
  });
  assert.equal(rendered.subject, "Your StarMapCo print order is confirmed");
  assert.match(rendered.text, /Manual quality review before production/);
  assert.match(rendered.text, /https:\/\/starmapco\.com\/success\?session_id=cs_live_test/);
  assert.match(rendered.html, /Your print is on the way to production/);
});

test("renderPrintOrderConfirmationEmail includes product label", () => {
  const rendered = renderPrintOrderConfirmationEmail({
    productLabel: "Star map poster (unframed)",
    successUrl: "https://starmapco.com/success?session_id=cs_live_test",
    manualReviewRequired: true,
  });
  assert.match(rendered.text, /Star map poster \(unframed\)/);
});
