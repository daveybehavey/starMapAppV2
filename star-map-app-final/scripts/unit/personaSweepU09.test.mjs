/**
 * Persona sweep U09: the policy pages (/returns, /support, /shipping,
 * /terms) covered digital + prints but were silent on merch (stickers,
 * magnets, pin buttons, tees, hoodies — all made to order). Merch now has
 * explicit, truthful coverage on all four:
 *
 * - Made to order.
 * - Defective, damaged, or incorrect items are replaced free (contact
 *   within 30 days of delivery, matching the print claim window).
 * - Wrong-size apparel: NO refunds or exchanges for size (owner decision,
 *   2026-10-19) — the size ordered is the size made.
 * - Merch is NOT folded into the print-scoped Love-It Guarantee wording.
 *
 * Copy is pinned from source, per repo convention.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(UNIT_DIR, "../..");
const SRC_ROOT = path.join(APP_ROOT, "src");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), "utf8");
}

test("U09: /returns carries a merch section — made to order, free replacement for defects", () => {
  const returns = readSrc("app/returns/ReturnsContent.tsx");
  assert.match(returns, /Merch \(stickers, magnets, pins, apparel, and mugs\)/);
  assert.match(returns, /Merch items — kiss-cut stickers, die-cut magnets, pin buttons, tees, hoodies, and star map mugs — are\s+made to order/);
  assert.match(returns, /arrives defective, damaged, or\s+different from what\s+you ordered/);
  assert.match(returns, /within 30 days of delivery with photos and order details, and we will replace it free/);
  assert.match(returns, /change-of-mind returns are not\s+accepted on merch/);
});

test("U09: /returns states the wrong-size rule plainly (no refunds or exchanges for size)", () => {
  const returns = readSrc("app/returns/ReturnsContent.tsx");
  assert.match(returns, /cannot offer refunds or exchanges for size: the size\s+you order is the size that gets made/);
  assert.match(returns, /double-check the size you select before ordering/);
});

test("U09: the /returns merch section does not borrow the print-scoped Love-It Guarantee", () => {
  const returns = readSrc("app/returns/ReturnsContent.tsx");
  const start = returns.indexOf("Merch (stickers, magnets, pins, apparel, and mugs)");
  const end = returns.indexOf("International shipping charges");
  assert.ok(start > 0 && end > start);
  const merchSection = returns.slice(start, end);
  assert.doesNotMatch(merchSection, /Love-It Guarantee/);
  assert.doesNotMatch(merchSection, /LOVE_IT_GUARANTEE_LINE/);
});

test("U09: /support FAQ covers damaged/wrong merch and the wrong-size rule", () => {
  const faq = readSrc("lib/supportFaq.ts");
  assert.match(faq, /id: "merch-damaged"/);
  assert.match(faq, /id: "merch-wrong-size"/);
  assert.match(faq, /My merch arrived damaged or wrong\. What should I do\?/);
  assert.match(faq, /Can I exchange a tee or hoodie for a different size\?/);
  assert.match(faq, /we will replace it free\. See our Returns & Refunds policy/);
  assert.match(faq, /we can't offer refunds or exchanges for size — the size you order is the size that gets made/);
  assert.match(faq, /please double-check your size before ordering/);
  // The merch entries sit with the other damage topics, after damaged-print.
  assert.ok(faq.indexOf('id: "merch-damaged"') > faq.indexOf('id: "damaged-print"'));
  assert.ok(faq.indexOf('id: "merch-wrong-size"') > faq.indexOf('id: "merch-damaged"'));
});

test("U09: /shipping explains merch fulfilment without implying the print rate table covers merch", () => {
  const shipping = readSrc("app/shipping/page.tsx");
  assert.match(shipping, /Merch orders/);
  assert.match(shipping, /printed merch, made to order by our print\s+partner/);
  assert.match(shipping, /Merch is ordered and shipped separately from star map prints/);
  assert.match(shipping, /calculated at checkout before you pay — the print rates in the table below do not apply to merch/);
  assert.match(shipping, /arrives defective, damaged, or different from what you ordered, contact us within\s+30 days of delivery/);
});

test("U09: /terms covers merch in the overview and the refunds section", () => {
  const terms = readSrc("app/terms/page.tsx");
  assert.match(terms, /made-to-order merch \(stickers, magnets, pin buttons, tees, and hoodies\)/);
  assert.match(terms, /Merch items \(stickers, magnets, pin buttons, tees, and hoodies\) are made to order/);
  assert.match(terms, /arrives defective, damaged, or different from what was ordered, we will replace it free/);
  assert.match(terms, /apparel cannot be refunded or exchanged for size: the size ordered is the size produced/);
  assert.match(terms, /change-of-mind returns are not accepted/);
});
