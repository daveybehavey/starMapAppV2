/**
 * U17 + U16(b) (persona sweep 2026-10-19): editor/paywall price-line formats.
 *
 * Bundle rows lead with the bundle TOTAL in the marketing pages' style
 * ("$106.00 USD · free shipping" — every price names its currency since
 * sweep U03); single-product rows keep the sitewide "$X + $Y shipping"
 * construction. The shipping footnote drops the internal
 * "Poster tiers" wording and leaves sentence punctuation to render sites
 * (the old trailing period doubled up in the desktop editor: "..").
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { formatPosterShippingFootnote, paywallSecondaryLine } from "./printPriceLines.harness.mjs";

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(UNIT_DIR, "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(APP_ROOT, "src", relativePath), "utf8");
}

test("editor bundle rows state the total, not a price-plus-add-on string", () => {
  assert.equal(
    paywallSecondaryLine({ variant: "poster_framed", includeDigitalAddOn: true, includeCardAddOn: false }),
    "$106.00 USD · free shipping",
  );
  assert.equal(
    paywallSecondaryLine({ variant: "poster_framed", includeDigitalAddOn: false, includeCardAddOn: true }),
    "$118.00 USD · free shipping",
  );
});

test("editor single-product rows keep product price + shipping estimate", () => {
  assert.equal(
    paywallSecondaryLine({ variant: "poster_framed", includeDigitalAddOn: false, includeCardAddOn: false }),
    "$99.00 USD + $10.77 USD shipping",
  );
  assert.equal(
    paywallSecondaryLine({ variant: "poster_unframed", includeDigitalAddOn: false, includeCardAddOn: false }),
    "$49.00 USD + $5.17 USD shipping",
  );
  assert.equal(
    paywallSecondaryLine({ variant: "canvas_wrap", includeDigitalAddOn: false, includeCardAddOn: false }),
    "$79.00 USD + $17.12 USD shipping",
  );
});

test("paywall presentation composes bundle rows from the merchandise subtotal", () => {
  const src = readSrc("lib/paywallPrintCheckout.ts");
  assert.match(src, /const isBundleRow = Boolean\(row\.includeDigitalAddOn \|\| row\.includeCardAddOn\);/);
  assert.match(src, /formatPrice\(merchandiseSubtotalCents, tier\.currency\)/);
  // The old parts-join strung add-on prices after the shipping label
  // ("$99.00 + free shipping + $7.00").
  assert.doesNotMatch(src, /if \(row\.includeDigitalAddOn\) parts\.push/);
  assert.doesNotMatch(src, /if \(row\.includeCardAddOn\) parts\.push/);
});

test("shipping footnote is customer-clean, jargon-free, and unpunctuated", () => {
  const footnote = formatPosterShippingFootnote("CA");
  assert.equal(footnote, "framed print $10.77 USD shipping, unframed poster $5.17 USD shipping");
  assert.doesNotMatch(footnote, /tiers/i);
  assert.doesNotMatch(footnote, /\.$/);
  assert.equal(formatPosterShippingFootnote(null), null);

  const src = readSrc("lib/paywallPrintCheckout.ts");
  assert.doesNotMatch(src, /Poster tiers/);
  assert.match(src, /return `framed print \$\{framed\}, unframed poster \$\{unframed\}`;/);
});

test("footnote render sites each close the sentence exactly once", () => {
  // Desktop editor and paywall modal append their own punctuation.
  const editor = readSrc("components/EditorExperience.tsx");
  assert.match(editor, /Estimated: \$\{posterShippingFootnote\}\.`/);
  assert.doesNotMatch(editor, /posterShippingFootnote\}\.\.`/);
  // Mobile editor + download upsell terminate the standalone sentence.
  const mobile = readSrc("app/MobileCreate.tsx");
  assert.match(mobile, /\{posterShippingFootnote\}\./);
  const download = readSrc("app/download/DownloadClient.tsx");
  assert.match(download, /\{posterShippingFootnote\}\./);
});
