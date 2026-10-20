/**
 * Copy pins for the merch purchase path (fleet walk Oct 2026, M04–M06).
 * The components/pages use the @/ alias or are server components, so these
 * are source-construction pins (the repo's pattern for such surfaces),
 * backed by the behavioural pins in merchPublicEnv.test.mjs /
 * paywallMugOffer.test.mjs for the underlying logic.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("M05: merch policy line carries the merch terms and shows at the purchase steps", () => {
  const policy = read("../../src/lib/loveItGuarantee.ts");
  assert.match(policy, /export const MERCH_POLICY_LINE/);
  assert.match(policy, /defective, damaged, or different from what you ordered/);
  assert.match(policy, /replace it free within 30 days of delivery/);
  assert.match(policy, /No change-of-mind returns, and no refunds or exchanges for size on apparel/);

  const editor = read("../../src/components/EditorExperience.tsx");
  assert.match(editor, /\{MERCH_POLICY_LINE\}/, "editor merch panel shows the merch policy at the checkout step");

  const modal = read("../../src/components/PaywallModal.tsx");
  assert.match(
    modal,
    /row\.variant === "mug_11oz" \? MERCH_POLICY_LINE : LOVE_IT_GUARANTEE_LINE/,
    "the mug row carries merch terms, print rows keep the Love-It line",
  );
});

test("M05: /returns and the support FAQ name the mug in merch coverage", () => {
  const returns = read("../../src/app/returns/ReturnsContent.tsx");
  assert.match(returns, /Merch \(stickers, magnets, pins, apparel, and mugs\)/);
  assert.match(returns, /tees, hoodies, and star map mugs/);

  const faq = read("../../src/lib/supportFaq.ts");
  assert.match(faq, /Merch \(stickers, magnets, pin buttons, tees, hoodies, and star map mugs\)/);
});

test("M04: merch-led editor landing names the requested product", () => {
  const editor = read("../../src/components/EditorExperience.tsx");
  // The requested family resolves from the merch_family param against the
  // ENABLED families only (the state default must not leak into print visits).
  assert.match(editor, /requestedMerchFamily/);
  assert.match(editor, /enabledMerchFamilies\.find\(\(f\) => f\.id === id\)/);
  // The landing line names the product for merch entries and keeps the
  // print line for everyone else.
  assert.match(editor, /Designing your \$\{requestedMerchFamily\.label\.toLowerCase\(\)\}/);
  assert.match(editor, /"Printed and framed options unlock after preview\."/);
});
