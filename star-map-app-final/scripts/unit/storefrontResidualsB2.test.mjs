/**
 * Fix Lane F (audit PR #525 triage, items B2-02/B2-03/B2-04):
 *
 * - B2-02: the paywall dialog must reach the purchasable print formats
 *   without the long mobile scroll — the tab list and print panel (country
 *   first, then legal notice + second-copy toggle, then the format rows)
 *   precede the optional recovery-email / promo / gift fields, and the
 *   delivery-timing / gift-decision guidance sits after the rows.
 * - B2-03: "starts at" framing names the true cheapest print entry — the
 *   16×16 unframed poster ($39 fallback in printCatalog.ts) — qualified by
 *   size; the 18×18 ($49) keeps its own size-qualified label.
 * - B2-04: a standalone framed print qualifies for free standard shipping
 *   at its current price (merchandise subtotal ≥ the $89 threshold), so its
 *   price line must not read "+ shipping". Non-qualifying standalone
 *   formats keep the "+ shipping" line.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const { formatStandalonePrintPriceWithShipping } = await import(
  "../../src/lib/printCheckoutConfig.ts"
);

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const paywall = read("../../src/components/PaywallModal.tsx");
const posterPage = read("../../src/app/star-map-poster/page.tsx");
const shopPage = read("../../src/app/shop/page.tsx");
const framedProof = read("../../src/components/FramedProofSection.tsx");
const whatYouReceive = read("../../src/components/WhatYouReceiveModule.tsx");
const printCatalog = read("../../src/lib/printCatalog.ts");

function idx(haystack, needle) {
  const i = haystack.indexOf(needle);
  assert.notEqual(i, -1, `missing source marker: ${needle}`);
  return i;
}

test("B2-02: print panel and its format rows precede the optional fields", () => {
  const tablist = idx(paywall, 'role="tablist"');
  const printPanel = idx(paywall, 'id="paywall-tab-panel-print"');
  const rows = idx(paywall, "{printRows.map((row) => (");
  const recovery = idx(paywall, 'id="paywall-recovery-email"');
  const promo = idx(paywall, 'id="paywall-promo-code"');
  const digitalPanel = idx(paywall, 'id="paywall-tab-panel-digital"');
  assert.ok(tablist < printPanel, "tabs render before the print panel they control");
  assert.ok(printPanel < rows, "format rows live inside the print panel");
  assert.ok(rows < recovery, "first purchasable format precedes the optional recovery email");
  assert.ok(rows < promo, "first purchasable format precedes the optional promo field");
  assert.ok(recovery < digitalPanel, "optional fields still precede the digital panel");
});

test("B2-02: inside the print panel, country + disclosures precede the rows; guidance follows", () => {
  const country = idx(paywall, 'data-testid="print-shipping-country-control"');
  const legal = idx(paywall, "<CheckoutLegalNotice");
  const secondCopy = idx(paywall, "Add a second copy — 10% off");
  const rows = idx(paywall, "{printRows.map((row) => (");
  const deliveryInfo = idx(paywall, 'data-testid="paywall-print-delivery-info"');
  assert.ok(country < legal, "shipping country is chosen before the legal notice");
  assert.ok(legal < rows, "legal notice stays before the purchase buttons (submission)");
  assert.ok(secondCopy < rows, "the second-copy toggle stays before the rows it reprices");
  assert.ok(rows < deliveryInfo, "delivery-timing guidance moves after the purchasable rows");
});

test("B2-03: catalog fallbacks make the 16×16 the cheapest unframed entry", () => {
  const block16 = printCatalog.slice(
    idx(printCatalog, 'id: "poster_unframed_16x16"'),
    idx(printCatalog, 'id: "poster_framed"'),
  );
  assert.match(block16, /priceFallbackCents: 3900/);
  const block18 = printCatalog.slice(
    idx(printCatalog, 'id: "poster_unframed",'),
    idx(printCatalog, 'id: "poster_unframed_16x16"'),
  );
  assert.match(block18, /priceFallbackCents: 4900/);
});

test("B2-03: poster hero starts-at is the 16×16, qualified by size and linked to its route", () => {
  assert.match(posterPage, /title: "Unframed 16×16 starts at",\s*value: unframed16Price,/);
  assert.match(
    posterPage,
    /source=star-map-poster-hero-unframed-16x16&checkout=print&print_variant=poster_unframed_16x16/,
  );
  assert.match(posterPage, /unframed posters come in 16×16 \(the lowest-cost print entry\) and 18×18/);
  // The featured 18×18 keeps its own tier label (which names its size).
  assert.match(posterPage, /labelFallback: "Museum-grade poster \(18×18\)"|poster_unframed\.label/);
});

test("B2-03: shop summary qualifies its cheapest unframed price by size", () => {
  assert.match(shopPage, /unframed 16×16 from <span className="font-semibold text-midnight">\{unframed16Price\}<\/span>/);
});

test("B2-04: standalone framed price line reflects free-shipping eligibility", () => {
  assert.equal(
    formatStandalonePrintPriceWithShipping("poster_framed"),
    "$99.00 USD · free standard shipping",
  );
  // Below-threshold standalone formats keep the honest "+ shipping" line.
  assert.equal(formatStandalonePrintPriceWithShipping("poster_unframed"), "$49.00 USD + shipping");
  assert.equal(
    formatStandalonePrintPriceWithShipping("poster_unframed_16x16"),
    "$39.00 USD + shipping",
  );
});

test("B2-04: audited surfaces render the framed price through the eligibility-aware helper", () => {
  for (const [name, src] of [
    ["shop", shopPage],
    ["poster", posterPage],
    ["framed proof", framedProof],
    ["what you receive", whatYouReceive],
  ]) {
    assert.match(
      src,
      /const framedPrice = formatStandalonePrintPriceWithShipping\("poster_framed"\)/,
      `${name} framed price uses the standalone helper`,
    );
  }
});
