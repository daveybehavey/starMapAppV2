/**
 * M03 (fleet walk, Oct 2026): the shop's "Customize mug" routes to
 * /editor?...&print_variant=mug_11oz, but the print purchase dialog's offer
 * set came only from PAYWALL_PRINT_CHECKOUT_ROWS (framed / unframed /
 * canvas) — the mug shopper saw the mug sizing line and NO mug buy button.
 *
 * The fix wires the offer set to the selected variant: resolvePaywallOfferRows
 * (printCatalog.ts, alias-free so it is behaviourally testable here) prepends
 * a plain row for a preferred variant the base set doesn't already offer.
 * Posters + canvas stay the default offer for everyone else (the recorded
 * "mug stays shop-led until pilot proof" decision is about proactive offers,
 * not about stranding a shopper who already chose the mug).
 * getPaywallPrintCheckoutPresentation itself uses the @/ alias and cannot be
 * imported by the plain-Node runner, so its delegation + both call sites are
 * pinned by source construction (same pattern as checkoutPricingIdentity).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PAYWALL_PRINT_CHECKOUT_ROWS, resolvePaywallOfferRows } from "../../src/lib/printCatalog.ts";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("base offer set is unchanged when no variant is preferred", () => {
  const rows = resolvePaywallOfferRows();
  assert.equal(rows, PAYWALL_PRINT_CHECKOUT_ROWS);
  assert.deepEqual(
    rows.map((r) => r.variant),
    ["poster_framed", "poster_framed", "poster_framed", "poster_unframed", "canvas_wrap"],
  );
  assert.ok(rows.every((r) => r.variant !== "mug_11oz"), "mug must not be pushed to non-mug shoppers");
});

test("mug shopper gets a mug purchase row, first, with no add-ons forced", () => {
  const rows = resolvePaywallOfferRows("mug_11oz");
  assert.equal(rows.length, 6);
  assert.deepEqual(rows[0], { variant: "mug_11oz", includeDigitalAddOn: false });
  // Base rows still follow for shoppers who change their mind in-dialog.
  assert.deepEqual(
    rows.slice(1).map((r) => r.variant),
    ["poster_framed", "poster_framed", "poster_framed", "poster_unframed", "canvas_wrap"],
  );
});

test("variants already in the base set are not duplicated", () => {
  for (const variant of ["poster_framed", "poster_unframed", "canvas_wrap"]) {
    assert.equal(resolvePaywallOfferRows(variant), PAYWALL_PRINT_CHECKOUT_ROWS, `${variant} must not add a row`);
  }
});

test("the add-on-only card variant never becomes a standalone row", () => {
  assert.equal(resolvePaywallOfferRows("card_4x6"), PAYWALL_PRINT_CHECKOUT_ROWS);
});

test("unknown or absent preferred variants leave the base set untouched", () => {
  assert.equal(resolvePaywallOfferRows("not_a_variant"), PAYWALL_PRINT_CHECKOUT_ROWS);
  assert.equal(resolvePaywallOfferRows(null), PAYWALL_PRINT_CHECKOUT_ROWS);
  assert.equal(resolvePaywallOfferRows(undefined), PAYWALL_PRINT_CHECKOUT_ROWS);
});

test("wiring: presentation delegates to the resolver and both call sites pass the preferred variant", () => {
  const presentation = read("../../src/lib/paywallPrintCheckout.ts");
  assert.match(presentation, /resolvePaywallOfferRows\(preferredVariant\)/);
  assert.match(presentation, /preferredVariant\?: PrintVariant \| string \| null/);

  const modal = read("../../src/components/PaywallModal.tsx");
  assert.match(modal, /getPaywallPrintCheckoutPresentation\(printShippingCountry, preferredPrintVariant\)/);
  // Codex P2 on PR #352: impression tracking must use the same resolved
  // rows as rendering, not the static base constant, or the mug gets no
  // impression and every later row's index misaligns with selection.
  assert.match(modal, /items: printRows\.filter\(\(row\) => !inAppMode \|\| !row\.includeDigitalAddOn\)\.map\(\(row\) => \(\{/);
  assert.ok(!modal.includes("PAYWALL_PRINT_CHECKOUT_ROWS"), "PaywallModal must not rebuild offers from the static constant");

  const editor = read("../../src/components/EditorExperience.tsx");
  assert.match(editor, /getPaywallPrintCheckoutPresentation\(printShippingCountry, preferredPrintVariant\)/);
});
