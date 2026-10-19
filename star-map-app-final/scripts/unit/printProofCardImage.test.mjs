import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PRINT_PROOF_IMAGE_PATHS } from "../../src/lib/printProofImagePaths.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// The greeting-card upsell slot must show a real greeting card photo.
// Before this pin, proofAssets() mapped card_4x6 to the unframed POSTER
// mockup (the mug had the identical latent pattern until PR #312). The
// card image is a genuine Printful Mockup Generator render of catalog
// product 568 / variant 14457 — the variant production orders pin in
// src/lib/printCatalog.ts (PRINTFUL_VARIANT_ID_CARD_4X6 = "14457").
test("card proof path points at the real card mockup and the file exists", () => {
  assert.equal(PRINT_PROOF_IMAGE_PATHS.card.src, "/printproof/gift-raw/card/card-mockup.jpg");
  assert.equal(PRINT_PROOF_IMAGE_PATHS.card.fallback, "/printproof/gift-raw/card/card-mockup.jpg");
  const onDisk = path.join(ROOT, "public", PRINT_PROOF_IMAGE_PATHS.card.src);
  assert.ok(fs.existsSync(onDisk), `missing public asset: ${PRINT_PROOF_IMAGE_PATHS.card.src}`);
});

test("download upsell catalog resolves card_4x6 to the card proof, not the poster", () => {
  const catalog = read("src/lib/downloadPrintUpsellCatalog.ts");
  assert.match(catalog, /variant === "card_4x6"\) \{\s*return PRINT_PROOF_IMAGE_PATHS\.card;/);
  assert.doesNotMatch(catalog, /poster_unframed" \|\| variant === "card_4x6/);
  // The poster keeps its own proof.
  assert.match(catalog, /variant === "poster_unframed"\) \{\s*return PRINT_PROOF_IMAGE_PATHS\.unframed;/);
});
