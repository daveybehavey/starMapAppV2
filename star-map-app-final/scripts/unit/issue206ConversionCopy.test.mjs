import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  FRAMED_HD_RECOMMENDED_BADGE,
  buildStandardGiftPreviewIntentDetails,
  getFramedHdEditorOpenDescription,
  getFramedHdGiftCtaLine,
  getFramedHdPremiumPositioningLine,
  getGiftLadderIntro,
} from "./moneyPageGiftCheckout.harness.mjs";
import {
  getPrintAddOnTimelinePoint,
  getPrintProductionReviewDisclosure,
  getPrintProductionReviewTrustPoint,
  isPrintfulAutoConfirmEnabled,
} from "./printCheckoutConfig.harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(ROOT, "src");
const PUBLIC = path.join(ROOT, "public");

/** Customer-facing sources that must not reintroduce unsupported transactional popularity claims. */
const SCAN_RELATIVE_PATHS = [
  "components/GiftFormatLadder.tsx",
  "components/DeliveryFormatModule.tsx",
  "components/PurchaseTrustPanel.tsx",
  "components/HomeOfferStack.tsx",
  "components/PaywallModal.tsx",
  "components/RevenueTrustModule.tsx",
  "app/HomeStaticSections.tsx",
  "app/HomeHero.tsx",
  "app/page.tsx",
  "app/shop/page.tsx",
  "app/wedding/page.tsx",
  "app/anniversary/page.tsx",
  "app/birthday/page.tsx",
  "app/star-map-poster/page.tsx",
  "app/personalized-star-map/page.tsx",
  "app/night-sky-map-gift/page.tsx",
  "app/star-map-for/page.tsx",
  "app/star-map-for/[slug]/page.tsx",
  "app/star-map-gift/page.tsx",
  "app/star-map-gift-formats/page.tsx",
  "lib/moneyPageGiftCheckout.ts",
  "lib/printGiftDecisionCopy.ts",
];

const POPULARITY_PATTERNS = [
  /most buyers choose/i,
  /most gift buyers choose/i,
  /most gift-givers choose/i,
  /path most gift buyers choose/i,
  /option most couples choose/i,
  /most couples choose framed/i,
  /\bTop pick\b/,
  /\bMOST POPULAR\b/,
  /badge:\s*["']Most popular["']/i,
  /Most popular —/,
  /most popular birthday gift choice/i,
  /top pick for gift buyers/i,
];

/** Hard-coded manual-review claims that must not appear outside auto-confirm-aware helpers. */
const HARDCODED_FULFILLMENT_PATTERNS = [
  /Every order is reviewed before production/i,
  /Print orders checked before production/i,
  /orders are reviewed before production starts/i,
  /manually approved before production begins/i,
  /then the order is reviewed before production/i,
];

function readSrc(relativePath) {
  return fs.readFileSync(path.join(SRC, relativePath), "utf8");
}

function collectMatches(source, patterns) {
  const hits = [];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) hits.push({ pattern: String(pattern), snippet: match[0] });
  }
  return hits;
}

test("shared gift positioning helpers stay factual (no popularity claims)", () => {
  const intro = getGiftLadderIntro();
  const occasionIntro = getGiftLadderIntro({ occasionLabel: "Wedding" });
  const editorOpen = getFramedHdEditorOpenDescription("$99 framed + HD");
  const cta = getFramedHdGiftCtaLine();
  const premium = getFramedHdPremiumPositioningLine("$99 framed + HD");
  const intentDetails = buildStandardGiftPreviewIntentDetails("$99 framed + HD");

  for (const sample of [
    intro,
    occasionIntro,
    editorOpen,
    cta,
    premium,
    ...intentDetails,
    FRAMED_HD_RECOMMENDED_BADGE,
  ]) {
    const hits = collectMatches(sample, POPULARITY_PATTERNS);
    assert.equal(hits.length, 0, `unexpected popularity claim in "${sample}": ${JSON.stringify(hits)}`);
  }

  assert.match(intro, /recommended presentation is framed \+ HD/i);
  assert.match(occasionIntro, /wedding/i);
  assert.match(editorOpen, /recommended premium gift presentation/i);
  assert.equal(FRAMED_HD_RECOMMENDED_BADGE, "Premium gift");
  assert.match(intentDetails[0], /premium gift route/i);
  assert.match(intentDetails[1], /Lower-cost physical option/i);
});

test("print production disclosure mirrors auto-confirm true and false", () => {
  assert.equal(isPrintfulAutoConfirmEnabled({ PRINTFUL_AUTO_CONFIRM: "true" }), true);
  assert.equal(isPrintfulAutoConfirmEnabled({ PRINTFUL_AUTO_CONFIRM: "false" }), false);

  const autoOn = getPrintProductionReviewDisclosure({ PRINTFUL_AUTO_CONFIRM: "true" });
  const autoOff = getPrintProductionReviewDisclosure({ PRINTFUL_AUTO_CONFIRM: "false" });
  assert.match(autoOn, /submitted to our print partner/i);
  assert.doesNotMatch(autoOn, /reviewed before production/i);
  assert.match(autoOff, /reviewed before production/i);
  assert.match(autoOff, /manual approval mode/i);

  const trustOn = getPrintProductionReviewTrustPoint({ NEXT_PUBLIC_PRINTFUL_AUTO_CONFIRM: "true" });
  const trustOff = getPrintProductionReviewTrustPoint({ NEXT_PUBLIC_PRINTFUL_AUTO_CONFIRM: "false" });
  assert.match(trustOn, /submitted for fulfillment/i);
  assert.match(trustOff, /manual review before production/i);

  const timelineOn = getPrintAddOnTimelinePoint({ PRINTFUL_AUTO_CONFIRM: "1" });
  const timelineOff = getPrintAddOnTimelinePoint({ PRINTFUL_AUTO_CONFIRM: "0" });
  assert.match(timelineOn, /submitted for fulfillment after payment/i);
  assert.match(timelineOff, /manual review before production/i);
});

test("customer-facing sources do not reintroduce unsupported transactional popularity claims", () => {
  const failures = [];
  for (const relativePath of SCAN_RELATIVE_PATHS) {
    const source = readSrc(relativePath);
    const hits = collectMatches(source, POPULARITY_PATTERNS);
    for (const hit of hits) {
      failures.push(`${relativePath}: ${hit.snippet}`);
    }
  }

  const llms = fs.readFileSync(path.join(PUBLIC, "llms.txt"), "utf8");
  for (const hit of collectMatches(llms, POPULARITY_PATTERNS)) {
    failures.push(`public/llms.txt: ${hit.snippet}`);
  }

  assert.equal(failures.length, 0, `unsupported popularity claims remain:\n${failures.join("\n")}`);
});

test("hard-coded manual-review fulfillment copy is routed through auto-confirm helpers", () => {
  const failures = [];
  for (const relativePath of SCAN_RELATIVE_PATHS) {
    const source = readSrc(relativePath);
    // Helpers themselves may mention review only when auto-confirm is off; customer pages must call helpers.
    if (relativePath === "lib/moneyPageGiftCheckout.ts" || relativePath === "lib/printGiftDecisionCopy.ts") {
      continue;
    }
    const hits = collectMatches(source, HARDCODED_FULFILLMENT_PATTERNS);
    for (const hit of hits) {
      failures.push(`${relativePath}: ${hit.snippet}`);
    }
  }
  assert.equal(failures.length, 0, `hard-coded fulfillment contradictions remain:\n${failures.join("\n")}`);

  // Shared source of truth must keep both branches.
  const configSource = readSrc("lib/printCheckoutConfig.ts");
  assert.match(configSource, /function getPrintProductionReviewDisclosure/);
  assert.match(configSource, /isPrintfulAutoConfirmEnabled/);
  assert.match(configSource, /reviewed before production while manual approval mode is enabled/);
  assert.match(configSource, /submitted to our print partner/);
});

test("moneyPageGiftCheckout source keeps factual ladder/intent copy", () => {
  const source = readSrc("lib/moneyPageGiftCheckout.ts");
  assert.match(source, /FRAMED_HD_RECOMMENDED_BADGE = "Premium gift"/);
  assert.match(source, /recommended presentation is framed \+ HD/);
  assert.match(source, /premium gift route with instant HD/);
  assert.doesNotMatch(source, /most gift buyers choose/i);
  assert.doesNotMatch(source, /most buyers choose/i);
});
