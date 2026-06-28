import assert from "node:assert/strict";
import test from "node:test";
import {
  getPaywallPrintBullets,
  getPrintFulfillmentProgressSteps,
  getPrintOrderConfirmationEtaNote,
  getPrintOrderConfirmationNextSteps,
  getPrintStandardShippingOnlyLine,
  getPrintUrgentHdUpsellLine,
  getPrintUsTotalDeliveryEstimateLine,
} from "./commerceFacts.harness.mjs";

test("total delivery estimate combines production and standard transit", () => {
  const line = getPrintUsTotalDeliveryEstimateLine();
  assert.match(line, /2–5 business days/);
  assert.match(line, /4–6 business days/);
  assert.match(line, /1–2 weeks/i);
});

test("standard shipping disclosure states express is unavailable", () => {
  const line = getPrintStandardShippingOnlyLine();
  assert.match(line, /standard shipping/i);
  assert.match(line, /express is not available/i);
});

test("urgent HD upsell mentions instant unlock without shipping wait", () => {
  const withPrice = getPrintUrgentHdUpsellLine("$6.99");
  assert.match(withPrice, /Need it sooner\?/i);
  assert.match(withPrice, /\$6\.99/);
  assert.match(withPrice, /no production or shipping wait/i);

  const withoutPrice = getPrintUrgentHdUpsellLine();
  assert.match(withoutPrice, /HD digital unlocks right after payment/i);
});

test("paywall print bullets set honest production expectations", () => {
  const bullets = getPaywallPrintBullets();
  assert.equal(bullets.length, 4);
  assert.ok(bullets.some((b) => b.includes("2–5 business days")));
  assert.ok(!bullets.some((b) => /production reviewed/i.test(b)));
});

test("fulfillment progress steps reflect auto-confirm production path", () => {
  const steps = getPrintFulfillmentProgressSteps({ PRINTFUL_AUTO_CONFIRM: "true" });
  assert.equal(steps.length, 4);
  assert.ok(steps.some((s) => /Production \(2–5 business days/i.test(s)));
  assert.ok(!steps.some((s) => /manual quality review/i.test(s)));
});

test("fulfillment progress steps reflect manual review when auto-confirm off", () => {
  const steps = getPrintFulfillmentProgressSteps({ PRINTFUL_AUTO_CONFIRM: "false" });
  assert.ok(steps.some((s) => /quality review/i.test(s)));
});

test("order confirmation next steps include HD-first line for bundled orders", () => {
  const steps = getPrintOrderConfirmationNextSteps({
    manualReviewRequired: false,
    includesDigitalAddOn: true,
  });
  assert.match(steps[0], /HD digital file is available right away/);
});

test("order confirmation eta note mentions express unavailable", () => {
  const note = getPrintOrderConfirmationEtaNote({ includesDigitalAddOn: false });
  assert.match(note, /express is not available/i);
  assert.match(note, /Need it sooner\? HD digital unlocks right after payment/);
});
