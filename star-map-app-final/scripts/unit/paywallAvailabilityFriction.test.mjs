/**
 * S94-4 Black Friday friction fixes (2026-11-02) — behavioural pins
 * against the REAL presentation lib:
 *
 * - F2 (availability earlier): with the production guard config
 *   (PRINT_MARGIN_GUARD_ENABLED=true, PRINT_MIN_MARGIN_CENTS=1000),
 *   getPaywallPrintCheckoutPresentation preflights the same margin
 *   evaluation the checkout route runs. Verified at source: the only
 *   row the route refuses in the production matrix is canvas wrap +
 *   second copy in the flat-$112.60 canvas-rate countries (e.g.
 *   Singapore) — free shipping waives the charge while the cost side
 *   still carries the full second-parcel rate. The presentation must
 *   flag exactly that row/country, and nothing else.
 * - F8 (Lever B progress): rows below the $89 threshold carry an
 *   "Add $X more for free shipping" line computed from the canonical
 *   threshold helper; qualifying rows carry none.
 * - F5/F9 placements are pinned at the bottom of this file.
 *
 * Env is set before import: the guard config is read per call, so the
 * matrix toggles it in place.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { register } from "node:module";

process.env.PRINT_MARGIN_GUARD_ENABLED = "true";
process.env.PRINT_MIN_MARGIN_CENTS = "1000";
process.env.NEXT_PUBLIC_PRINT_MARGIN_GUARD_ENABLED = "true";
process.env.NEXT_PUBLIC_PRINT_MIN_MARGIN_CENTS = "1000";

register("./tsAliasLoader.mjs", import.meta.url);

const { getPaywallPrintCheckoutPresentation } = await import(
  "../../src/lib/paywallPrintCheckout.ts"
);

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const findRow = (rows, variant, pred = () => true) =>
  rows.find((row) => row.variant === variant && pred(row));

test("F2: canvas + second copy is unavailable for Singapore, available for the US", () => {
  const sg = getPaywallPrintCheckoutPresentation("SG", null, true);
  const canvasSg = findRow(sg, "canvas_wrap");
  assert.ok(canvasSg, "canvas row is in the default offer set");
  assert.equal(canvasSg.checkoutAvailable, false);
  assert.match(canvasSg.unavailableNote, /Singapore/);

  const us = getPaywallPrintCheckoutPresentation("US", null, true);
  for (const row of us) {
    assert.equal(row.checkoutAvailable, true, `${row.variant} US row stays available`);
    assert.equal(row.unavailableNote, null);
  }
});

test("F2: canvas without the second copy stays available for Singapore", () => {
  const sg = getPaywallPrintCheckoutPresentation("SG", null, false);
  for (const row of sg) {
    assert.equal(row.checkoutAvailable, true, `${row.variant} SG row without copy stays available`);
  }
});

test("F2: no country selected means no availability signal", () => {
  const rows = getPaywallPrintCheckoutPresentation(null, null, true);
  for (const row of rows) {
    assert.equal(row.checkoutAvailable, true);
    assert.equal(row.unavailableNote, null);
  }
});

test("F2: with the guard disabled the preflight is inert", () => {
  process.env.PRINT_MARGIN_GUARD_ENABLED = "false";
  try {
    const sg = getPaywallPrintCheckoutPresentation("SG", null, true);
    assert.equal(findRow(sg, "canvas_wrap").checkoutAvailable, true);
  } finally {
    process.env.PRINT_MARGIN_GUARD_ENABLED = "true";
  }
});

test("F8: progress line names the exact remainder to the $89 threshold", () => {
  const rows = getPaywallPrintCheckoutPresentation("US", null, false);
  // Unframed 18x24 at $49.00 → $40.00 short of the threshold.
  const unframed = findRow(rows, "poster_unframed", (r) => !r.includeDigitalAddOn);
  assert.equal(unframed.freeShippingProgressLine, "Add $40.00 USD more for free shipping");
  // Framed at $99.00 already qualifies → no progress line, and the
  // secondary line already says "free shipping".
  const framed = findRow(rows, "poster_framed", (r) => !r.includeDigitalAddOn && !r.includeCardAddOn);
  assert.equal(framed.freeShippingProgressLine, null);
  assert.match(framed.secondaryLine, /free shipping/);
});

test("F8: the second copy can carry a row over the threshold", () => {
  const rows = getPaywallPrintCheckoutPresentation("US", null, true);
  // Unframed 18x24 ($49.00) + second copy at 90% ($44.10) = $93.10.
  const unframed = findRow(rows, "poster_unframed", (r) => !r.includeDigitalAddOn);
  assert.equal(unframed.freeShippingProgressLine, null);
  assert.match(unframed.secondaryLine, /free shipping/);
});

test("F2 wiring: the public env mirrors exist and match the server pair", () => {
  const wrangler = read("../../wrangler.toml");
  assert.match(wrangler, /^PRINT_MARGIN_GUARD_ENABLED = "true"$/m);
  assert.match(wrangler, /^NEXT_PUBLIC_PRINT_MARGIN_GUARD_ENABLED = "true"$/m);
  assert.match(wrangler, /^PRINT_MIN_MARGIN_CENTS = "1000"$/m);
  assert.match(wrangler, /^NEXT_PUBLIC_PRINT_MIN_MARGIN_CENTS = "1000"$/m);

  const margin = read("../../src/lib/printMargin.ts");
  assert.match(margin, /readGuardEnv\("PRINT_MARGIN_GUARD_ENABLED"\)/);
  assert.match(margin, /readGuardEnv\("PRINT_MIN_MARGIN_CENTS"\)/);
  // Fix round 1 (PR #479): the mirror reads must be LITERAL member
  // accesses. Next.js inlines only fully written-out
  // process.env.NEXT_PUBLIC_* references into browser bundles, so the
  // original dynamically indexed read silently yielded undefined in
  // the browser and left the guard disabled client-side while the
  // checkout route still enforced it. Pin the literals, and ban the
  // dynamic read for these keys (unrelated dynamic reads, e.g. the
  // catalog COGS knobs, are server-only and stay).
  assert.match(margin, /process\.env\.NEXT_PUBLIC_PRINT_MARGIN_GUARD_ENABLED/);
  assert.match(margin, /process\.env\.NEXT_PUBLIC_PRINT_MIN_MARGIN_CENTS/);
  assert.equal(margin.includes("process.env[publicName]"), false);
  assert.equal(margin.includes("NEXT_PUBLIC_${"), false);
});

test("F9: the second copy is priced per row, never from the preferred variant", () => {
  const rows = getPaywallPrintCheckoutPresentation("US", null, false);
  // Each eligible row carries its OWN copy price (canonical 90% of
  // its tier): unframed $49.00 → $44.10, framed $99.00 → $89.10,
  // canvas $79.00 → $71.10 — so the price beside a row is always the
  // price that row's purchase actually charges for the copy.
  assert.equal(
    findRow(rows, "poster_unframed", (r) => !r.includeDigitalAddOn).secondCopyPriceLine,
    "Second copy: $44.10 USD",
  );
  assert.equal(
    findRow(rows, "poster_framed", (r) => !r.includeDigitalAddOn && !r.includeCardAddOn)
      .secondCopyPriceLine,
    "Second copy: $89.10 USD",
  );
  assert.equal(findRow(rows, "canvas_wrap").secondCopyPriceLine, "Second copy: $71.10 USD");
  // Ineligible variants carry no copy price (a mug-led shopper's mug row).
  const mugRows = getPaywallPrintCheckoutPresentation("US", "mug_11oz", false);
  assert.equal(findRow(mugRows, "mug_11oz").secondCopyPriceLine, null);

  // Source pins: both surfaces render the price from the row, and the
  // old single preferred-variant checkbox label is gone (it advertised
  // the framed copy price beside an unframed purchase, and vice versa).
  for (const rel of ["../../src/components/PaywallModal.tsx", "../../src/components/EditorExperience.tsx"]) {
    const src = read(rel);
    assert.match(src, /Add a second copy — 10% off/, rel);
    assert.match(src, /row\.secondCopyPriceLine/, rel);
    assert.equal(src.includes("secondCopyPriceLabel"), false, rel);
  }
  const presentation = read("../../src/lib/paywallPrintCheckout.ts");
  assert.match(presentation, /getPrintSecondCopyPriceCents\(row\.variant\)/);
});

test("F5: the modal guarantee renders in policy blocks with a returns link, not per row", () => {
  const modal = read("../../src/components/PaywallModal.tsx");
  assert.match(modal, /href="\/returns"/);
  assert.equal(
    modal.includes('row.variant === "mug_11oz" ? MERCH_POLICY_LINE : LOVE_IT_GUARANTEE_LINE'),
    false,
    "the per-row policy ternary is gone",
  );
});
