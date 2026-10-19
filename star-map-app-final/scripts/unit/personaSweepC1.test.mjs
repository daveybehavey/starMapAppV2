/**
 * Persona sweep wave C1 source pins (Grok fleet sweep 2026-10-19,
 * coordination PR #15): U16(a), U17 (/shop suffixes), U21, U22.
 * Behaviour-level pins for U04/U17-editor live in giftFormatLadder.test.mjs
 * and paywallPriceLineFormats.test.mjs; U11 pins live in
 * previewStartLocation.test.mjs next to the PreviewStartForm guard.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(UNIT_DIR, "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(APP_ROOT, "src", relativePath), "utf8");
}

// U16(a): the HD-export guidance is a real instruction (each download spends
// an export on the design on screen), kept — but in customer language.
test("U16a: editor HD export note is customer language, not internal jargon", () => {
  const editor = readSrc("components/EditorExperience.tsx");
  assert.doesNotMatch(editor, /Pack reminder/);
  assert.doesNotMatch(editor, /current map only/);
  assert.match(editor, /Each HD download exports the/);
  assert.match(editor, /map currently on screen/);
});

// U17: /shop shipping suffixes use the prints' spaced construction.
test("U17: shop merch prices use the same spaced shipping suffix as prints", () => {
  const shop = readSrc("app/shop/page.tsx");
  assert.doesNotMatch(shop, /\$\{stickerPrice\}\+ shipping/);
  assert.doesNotMatch(shop, /\{priceLine\}\+ shipping/);
  assert.match(shop, /\$\{stickerPrice\} \+ shipping/);
  assert.match(shop, /\{priceLine\} \+ shipping at checkout/);
});

// U21: /support print-timing answer states the production window once.
test("U21: support print-timing answer does not repeat the production sentence", () => {
  const faq = readSrc("lib/supportFaq.ts");
  assert.doesNotMatch(faq, /Typical fulfillment time before shipment/);
  const timing = faq.slice(faq.indexOf('"print-timing"'), faq.indexOf('"delivery-estimates"'));
  // The shared delivery-estimate line carries the production window; the
  // answer adds shipping-only + upsell lines and the policy pointer once.
  assert.match(timing, /getPrintDeliveryEstimateLine\(\)/);
  assert.match(timing, /See our Shipping policy for country rates\./);
  assert.doesNotMatch(timing, /dates are estimates, not guarantees\."/);
});

// U21: digital-refund exceptions use one formulation everywhere — the
// Returns & Refunds wording is canonical.
test("U21: terms and support use the returns page's digital-refund exceptions", () => {
  const terms = readSrc("app/terms/page.tsx");
  assert.doesNotMatch(terms, /unprocessed payments/);
  assert.doesNotMatch(terms, /technical errors/);
  assert.match(terms, /duplicate\s+charges, failed delivery caused by a technical issue on our side/);

  const faq = readSrc("lib/supportFaq.ts");
  assert.match(faq, /duplicate charges, failed delivery caused by a technical issue on our side, or other billing errors/);

  const returns = readSrc("app/returns/ReturnsContent.tsx");
  assert.match(returns, /duplicate charges, failed delivery caused by a\s+technical issue on our side/);
});

// U21: /support must not frame custom orders as returnable.
test("U21: support policy list drops the 'start a return' framing", () => {
  const support = readSrc("app/support/page.tsx");
  assert.doesNotMatch(support, /how to start a return/);
  assert.match(support, /how to contact us about damage or defects/);
});

// U22: blog size advice must match the sold catalogue (framed 14×14,
// poster 18×18 — src/lib/printCatalog.ts).
test("U22: anniversary FAQ recommends only sizes that are sold", () => {
  const post = readSrc("app/blog/custom-star-map-for-anniversary/page.tsx");
  assert.doesNotMatch(post, /A3 or 18x24/);
  assert.match(post, /framed print is 14×14 inches/);
  assert.match(post, /unframed\s+poster is 18×18 inches/);
});
