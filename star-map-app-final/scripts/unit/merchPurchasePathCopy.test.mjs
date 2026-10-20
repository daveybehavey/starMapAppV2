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
