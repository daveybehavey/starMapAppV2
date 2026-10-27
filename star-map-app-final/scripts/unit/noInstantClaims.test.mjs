/**
 * #414 (owner ruling, 2026-10-27): "instant" delivery claims are scrubbed
 * from StarMapCo marketing copy. Digital files ARE delivered right after
 * checkout, and the honest wording is "download right after checkout" —
 * never "instant".
 *
 * This pin guards the scrubbed surfaces:
 *  - occasions data (src/data/seoOccasions.ts) — whole-data scan
 *  - the shared occasion-template components and the copy libs they render
 *    (occasionSeo, digitalGiftCheckout, moneyPageGiftCheckout, commerceFacts,
 *    giftFormatLadder, printGiftDecisionCopy, loveItGuarantee)
 *  - the paywall (PaywallModal + the DIGITAL_CHECKOUT_SUPPORT_LINE)
 *  - Stripe checkout line-item descriptions (src/app/api/checkout/route.ts)
 *  - the merchant-feed generator (scripts/generate-merchant-feed.mjs)
 *
 * Most scrubbed files must contain no "instant" at all. A few files keep
 * the word inside code identifiers (InstantHdHeroExtras, getInstantHdPriceLine)
 * and analytics source ids ("hero-instant", "instant-hd") — those are not
 * copy. For those files the pin fails on any STANDALONE "instant" word that
 * is not part of a hyphenated analytics source id, and on "instantly"
 * anywhere. Rendered-output checks cover the main copy functions directly.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { register } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

register("./tsResolveHook.mjs", pathToFileURL(path.dirname(fileURLToPath(import.meta.url)) + "/"));

async function loadTs(relPath) {
  return import(pathToFileURL(path.join(ROOT, relPath)).href);
}

/** Files that must not contain the word at all (copy, comments, code). */
const STRICT_FILES = [
  "src/data/seoOccasions.ts",
  "src/lib/occasionSeo.ts",
  "src/lib/moneyPageGiftCheckout.ts",
  "src/lib/giftFormatLadder.ts",
  "src/lib/printGiftDecisionCopy.ts",
  "src/lib/loveItGuarantee.ts",
  "src/app/star-map-for/page.tsx",
  "src/components/DeliveryFormatModule.tsx",
  "src/components/GiftFormatLadder.tsx",
  "src/components/FramedProofSection.tsx",
  "src/components/MoneyPagePriceAtGlance.tsx",
  "src/app/api/checkout/route.ts",
  "src/app/page.tsx",
  "scripts/generate-merchant-feed.mjs",
];

/**
 * Files where "instant" survives only inside identifiers and hyphenated
 * analytics source ids. Any other standalone occurrence is copy — fail.
 */
const IDENTIFIER_FILES = [
  "src/app/star-map-for/[slug]/page.tsx",
  "src/components/InstantHdHeroExtras.tsx",
  "src/components/PaywallModal.tsx",
  "src/lib/digitalGiftCheckout.ts",
  "src/lib/commerceFacts.ts",
];

test("strict surfaces contain no 'instant' anywhere", () => {
  for (const rel of STRICT_FILES) {
    assert.doesNotMatch(read(rel), /instant/i, `${rel} must not contain 'instant' (#414)`);
  }
});

test("identifier surfaces keep 'instant' out of copy (identifiers/source ids only)", () => {
  for (const rel of IDENTIFIER_FILES) {
    const source = read(rel);
    assert.doesNotMatch(source, /instantly/i, `${rel} must not contain 'instantly' (#414)`);
    for (const match of source.matchAll(/\binstant\b/gi)) {
      const before = source[match.index - 1] ?? "";
      const after = source[match.index + match[0].length] ?? "";
      assert.ok(
        before === "-" || after === "-",
        `${rel}: standalone 'instant' outside an identifier or hyphenated source id: …${source.slice(
          Math.max(0, match.index - 40),
          match.index + 47,
        )}…`,
      );
    }
  }
});

test("occasions data carries no 'instant' claim in any entry", async () => {
  const { seoOccasions } = await loadTs("src/data/seoOccasions.ts");
  assert.doesNotMatch(JSON.stringify(seoOccasions), /instant/i);
});

test("rendered occasion SEO + paywall bullet outputs never emit 'instant'", async () => {
  // Modules whose import graph is loadable under node --test: occasionSeo
  // (type-only imports) and the occasions data. The remaining copy libs use
  // "@/…" value imports and are guarded by the source scans above; the
  // paywall bullets are additionally checked through the repo's own harness
  // mirror of commerceFacts (kept in sync with src/lib/commerceFacts.ts).
  const seo = await loadTs("src/lib/occasionSeo.ts");
  const { seoOccasions } = await loadTs("src/data/seoOccasions.ts");
  const factsHarness = await import("./commerceFacts.harness.mjs");

  const outputs = [
    JSON.stringify(factsHarness.getPaywallDigitalBullets()),
    JSON.stringify(factsHarness.getPaywallPrintBullets()),
    factsHarness.getPrintUrgentHdUpsellLine("$9"),
    factsHarness.getPrintUrgentHdUpsellLine(),
    ...seoOccasions.flatMap((occasion) => [
      seo.getOccasionSeoTitle(occasion),
      seo.getOccasionSeoDescription(occasion),
      seo.getOccasionPageH1(occasion),
    ]),
  ];

  for (const output of outputs) {
    assert.doesNotMatch(String(output), /instant/i, `copy output must not claim 'instant' (#414): ${output}`);
  }
});
