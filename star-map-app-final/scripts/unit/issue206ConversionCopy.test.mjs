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
  "components/WeddingGiftJourneySection.tsx",
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

/**
 * Transactional buyer-popularity claims.
 * Catches: "most buyers choose", "most birthday buyers prefer",
 * "most first-time gift buyers pick", etc.
 * Intentionally does NOT match ordinary editorial like
 * "Most couples choose the proposal date" or "Most buyers decide faster".
 */
const BUYER_COHORT_POPULARITY_PATTERN = /\bmost(?:\s+[\w'-]+){0,5}\s+buyers\s+(?:choose|prefer|pick)\b/i;

/**
 * Behavioral-frequency substitutions that preserve unsupported buyer generalizations
 * (e.g. rewriting "Most buyers only need…" into "Buyers usually need…").
 */
const BUYER_FREQUENCY_PATTERN =
  /\b(?:gift\s+)?buyers?\s+(?:usually|typically|often|generally|commonly|frequently)\s+(?:need|want|decide|choose|prefer|pick|take|start)\b/i;

const MOST_BUYERS_ONLY_NEED_PATTERN = /\bmost\s+buyers\s+only\s+need\b/i;

const POPULARITY_PATTERNS = [
  BUYER_COHORT_POPULARITY_PATTERN,
  BUYER_FREQUENCY_PATTERN,
  MOST_BUYERS_ONLY_NEED_PATTERN,
  /\bmost(?:\s+[\w'-]+){0,3}\s+gift-?givers?\s+(?:choose|prefer|pick)\b/i,
  /\bmost couples choose framed\b/i,
  /path most gift buyers choose/i,
  /option most couples choose/i,
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

/** Exact regressions that previously escaped the narrow matcher. */
const BUYER_COHORT_POSITIVE_FIXTURES = [
  "Most buyers choose framed + HD",
  "Most birthday buyers choose framed + HD",
  "Most anniversary buyers choose the framed print",
  "Most wedding buyers choose framed + HD",
  "most gift buyers choose this path",
  "Most first-time gift buyers choose framed + HD",
  "Most US wedding gift buyers prefer framed + HD",
  "Most anniversary buyers pick the framed route",
];

/** Frequency substitutions introduced/caught by this slice. */
const BUYER_FREQUENCY_POSITIVE_FIXTURES = [
  "Buyers usually need three things before checkout: confidence in the file, clarity on print delivery, and reassurance that support exists if anything goes wrong.",
  "Most buyers only need three things before checkout",
  "Buyers typically need three things before checkout",
  "Buyers often need three things before checkout",
  "Buyers generally need clarity before checkout",
  "Buyers commonly need three things before checkout",
  "Buyers frequently want clarity before checkout",
  "Gift buyers usually want clarity on deliverables and timing",
  "Night sky gift buyers usually decide between the framed route and unframed",
  "Buyers often choose framed + HD",
];

/** Editorial / non-transactional wording that must remain unmatched. */
const BUYER_COHORT_NEGATIVE_FIXTURES = [
  "Most couples choose the proposal date",
  "Most people choose one of these moments",
  "Most couples choose their wedding date or the night they first met",
  "Most buyers decide faster once the wording is settled",
  "Most couples finish a preview in under five minutes",
  "These holidays bring the most gift searches each year",
  "Recommended presentation is framed + HD",
  "The premium gift route is the framed print",
];

const BUYER_FREQUENCY_NEGATIVE_FIXTURES = [
  "Before checkout: confidence in the file, clarity on print delivery, and support if anything goes wrong.",
  "Deliverables and timing are listed below — this is the exact package you unlock.",
  "Choose between the presentation-ready framed route and the lower-cost unframed route.",
  "Shipping usually arrives within the estimate shown at checkout",
  "Production typically takes 2–5 business days",
  "Maps are often framed after local printing",
  "Print orders commonly ship with tracking",
  "Most buyers decide faster once the wording is settled",
  "When used as a custom star map for anniversary gift, couples often choose:",
  "Yes — anniversary star maps are one of the most popular uses.",
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

test("buyer-cohort popularity matcher catches occasion and multiword qualifiers", () => {
  for (const sample of BUYER_COHORT_POSITIVE_FIXTURES) {
    assert.match(sample, BUYER_COHORT_POPULARITY_PATTERN, `expected positive fixture to match: ${sample}`);
    assert.ok(
      collectMatches(sample, POPULARITY_PATTERNS).length > 0,
      `expected positive fixture to fail full scan: ${sample}`
    );
  }
});

test("buyer-cohort popularity matcher ignores ordinary editorial most-* wording", () => {
  for (const sample of BUYER_COHORT_NEGATIVE_FIXTURES) {
    assert.doesNotMatch(
      sample,
      BUYER_COHORT_POPULARITY_PATTERN,
      `expected negative fixture to remain unmatched: ${sample}`
    );
  }
});

test("buyer-frequency matcher catches usually/typically/often substitutions", () => {
  for (const sample of BUYER_FREQUENCY_POSITIVE_FIXTURES) {
    const matched = BUYER_FREQUENCY_PATTERN.test(sample) || MOST_BUYERS_ONLY_NEED_PATTERN.test(sample);
    assert.equal(matched, true, `expected frequency positive fixture to match: ${sample}`);
    assert.ok(
      collectMatches(sample, POPULARITY_PATTERNS).length > 0,
      `expected frequency positive fixture to fail full scan: ${sample}`
    );
  }
});

test("buyer-frequency matcher ignores non-buyer and factual checkout copy", () => {
  for (const sample of BUYER_FREQUENCY_NEGATIVE_FIXTURES) {
    assert.doesNotMatch(
      sample,
      BUYER_FREQUENCY_PATTERN,
      `expected frequency negative fixture to remain unmatched: ${sample}`
    );
    assert.doesNotMatch(sample, MOST_BUYERS_ONLY_NEED_PATTERN, sample);
  }
});

test("homepage trust intro no longer generalizes buyer frequency", () => {
  const source = readSrc("app/HomeStaticSections.tsx");
  assert.doesNotMatch(source, /Buyers usually need three things/i);
  assert.doesNotMatch(source, /Most buyers only need three things/i);
  assert.doesNotMatch(source, BUYER_FREQUENCY_PATTERN);
  assert.match(
    source,
    /Before checkout: confidence in the file, clarity on print delivery, and support if anything goes wrong/
  );
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

test("occasion money pages no longer contain qualified buyer-choose claims", () => {
  for (const relativePath of ["app/birthday/page.tsx", "app/anniversary/page.tsx", "app/wedding/page.tsx"]) {
    const source = readSrc(relativePath);
    assert.doesNotMatch(source, BUYER_COHORT_POPULARITY_PATTERN, relativePath);
    assert.doesNotMatch(source, /Most birthday buyers choose/i, relativePath);
    assert.doesNotMatch(source, /Most anniversary buyers choose/i, relativePath);
    assert.doesNotMatch(source, /Most wedding buyers choose/i, relativePath);
  }
});
