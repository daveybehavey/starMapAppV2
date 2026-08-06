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
  "components/PreviewStartForm.tsx",
  "components/GiftFormatRoadmapModule.tsx",
  "components/FramedProofSection.tsx",
  "components/EditorExperience.tsx",
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
  "app/custom-night-sky-map/page.tsx",
  "app/star-map-generator/page.tsx",
  "app/constellation-map/page.tsx",
  "app/star-map-gift-ideas/page.tsx",
  "app/star-map-in/page.tsx",
  "app/star-map-in/[slug]/page.tsx",
  "lib/moneyPageGiftCheckout.ts",
  "lib/printGiftDecisionCopy.ts",
  "lib/mapCommerceLinks.ts",
  "lib/downloadPrintUpsellCatalog.ts",
  "data/seoOccasions.ts",
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

/** Qualified or plain “most … buyers only need …” generalizations. */
const MOST_BUYERS_ONLY_NEED_PATTERN = /\bmost(?:\s+[\w'-]+){0,5}\s+buyers\s+only\s+need\b/i;

/** Product/bundle popularity labels — must not match editorial “Popular occasions”. */
const POPULAR_BUNDLE_PATTERN = /\bPopular bundle\b/i;

/**
 * Direct transactional/product popularity claims beyond the exact “Popular bundle” label.
 * Catches: “<product> are/is popular”, “popular for …”, “one of the most popular uses”,
 * “most requested gifts”, “our popular …”, “popular variations”, “Is … popular?”.
 * Intentionally does NOT match navigation/editorial headings such as
 * “Popular occasions”, “Popular star map destinations”, or date-selection
 * “popular choices” / “Popular choices include…”.
 */
const PRODUCT_POPULARITY_PATTERN =
  /\b(?:are|is)\s+popular\b|\bpopular\s+for\b|\bpopular\s+(?:bundle|variations|framed)\b|\bour\s+popular\b|\bone\s+of\s+the\s+most\s+(?:popular\s+uses|requested\s+gifts)\b|\bmost\s+(?:popular\s+uses|requested\s+gifts)\b|\bIs\s+(?:a\s+|an\s+)?.{0,40}?\spopular\?/i;

/** Transactional format-popularity FAQs/answers in occasion data. */
const FORMAT_POPULARITY_QUESTION_PATTERN = /What format do .+ buyers choose most\?/i;
const FORMAT_POPULARITY_ANSWER_PATTERN = /\bMost choose framed\b|\bMost nursery gifts use\b/i;

/**
 * Subject-substitution frequency claims where “most” generalizes gifts/orders/files
 * without naming buyers (e.g. “covers most single-map gifts”).
 * Intentionally does NOT match editorial like “most searched gift occasions”,
 * “most meaningful gifts”, or date-selection “Most couples choose…”.
 */
const MOST_GIFTS_ORDERS_FILES_PATTERN =
  /\b(?:covers|for|across|on|not)\s+most\s+(?:[\w'-]+\s+){0,3}(?:gifts?|orders?|files?)\b|\bmost\s+(?:single-map|one-off|one[\s-]off)\s+gifts?\b|\bmost\s+(?:orders?|files?)\s+(?:need|require|use|include|cover)\b/i;

/**
 * Unsupported transactional/product superiority claims.
 * Catches reviewed examples and close offer-surface variants without a global ban on “best”
 * (FAQ questions like “What format is/works best for…” remain unmatched via lookbehind).
 * Includes generic “Best if …” / “Best when …” offer details from PreviewStartForm callers.
 */
const PRODUCT_SUPERIORITY_PATTERN =
  /\bbest wedding gift\b|\bHighest gift impact\b|\bhighest gift impact\b|\bBest gift route\b|\bBest gift\b|\bbest personalized star map gift\b|\bBest Personalized Star Map Gift\b|(?<!\b(?:is|works)\s)\bbest for\b|\bBest when\b|\bBest if\b|\bBest lower-cost\b|\bBest-looking\b|\bhighest-converting\b|\bhighest-intent pages\b/i;

const POPULARITY_PATTERNS = [
  BUYER_COHORT_POPULARITY_PATTERN,
  BUYER_FREQUENCY_PATTERN,
  MOST_BUYERS_ONLY_NEED_PATTERN,
  POPULAR_BUNDLE_PATTERN,
  PRODUCT_POPULARITY_PATTERN,
  FORMAT_POPULARITY_QUESTION_PATTERN,
  FORMAT_POPULARITY_ANSWER_PATTERN,
  MOST_GIFTS_ORDERS_FILES_PATTERN,
  PRODUCT_SUPERIORITY_PATTERN,
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
  /Production typically starts after order review/i,
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
  "Most first-time buyers only need one HD export",
  "Most gift buyers only need one finished file",
  "Buyers typically need three things before checkout",
  "Buyers often need three things before checkout",
  "Buyers generally need clarity before checkout",
  "Buyers commonly need three things before checkout",
  "Buyers frequently want clarity before checkout",
  "Gift buyers usually want clarity on deliverables and timing",
  "Night sky gift buyers usually decide between the framed route and unframed",
  "Buyers often choose framed + HD",
];

const ONLY_NEED_POSITIVE_FIXTURES = [
  "Most buyers only need three things before checkout",
  "Most first-time buyers only need one HD export",
  "Most gift buyers only need one finished file",
  "most first-time buyers only need one HD export. Use packs or unlimited if you plan to create more maps.",
];

const ONLY_NEED_NEGATIVE_FIXTURES = [
  "Most buyers decide faster once the wording is settled",
  "One HD export unlocks this map. Use packs or unlimited if you plan to create more maps.",
  "You only need the date and location to preview",
  "Preview only — no payment required yet",
];

const POPULAR_BUNDLE_POSITIVE_FIXTURES = [
  "Popular bundle: $106 framed + HD · free shipping",
  "Popular bundle",
];

const POPULAR_BUNDLE_NEGATIVE_FIXTURES = [
  "Popular occasions",
  "Framed + HD bundle: $106 framed + HD · free shipping",
  "Popular choices include a child’s birth date or a family milestone.",
];

const PRODUCT_POPULARITY_POSITIVE_FIXTURES = [
  "Birthday star maps are popular for 18th, 21st, 30th, 40th, 50th, and other milestone celebrations",
  "Yes — anniversary star maps are one of the most popular uses.",
  "Is a wedding star map popular?",
  "Yes. It’s one of the most requested gifts for weddings and anniversaries.",
  "our popular framed + HD gift bundle",
  "Explore these popular variations when searching for the perfect gift.",
  "popular for baby showers, hospital visits, and first birthdays",
  "popular for remembrance gifts and family keepsakes",
  "A custom star map is popular",
  "This gift is popular for weddings",
  "most popular uses",
  "most requested gifts",
];

const PRODUCT_POPULARITY_NEGATIVE_FIXTURES = [
  "Popular occasions",
  "Popular star map destinations",
  "Popular choices include a child’s birth date or a family milestone.",
  "anniversaries, first dates, and engagements are all popular choices.",
  "Most couples use their wedding date or the night they first met.",
  "Most people choose the proposal night, but you can also use the first date",
  "Most buyers decide faster once the wording is settled",
  "Framed + HD bundle: $106 framed + HD · free shipping",
  "Birthday star maps fit 18th, 21st, 30th, 40th, 50th, and other milestone celebrations",
  "Yes — an anniversary star map captures the exact sky from your shared date and place.",
  "Is a wedding star map a good gift?",
  "suited for baby showers, hospital visits, and first birthdays",
  "Explore these related gift formats when searching for the perfect gift.",
];

const FORMAT_POPULARITY_POSITIVE_FIXTURES = [
  "What format do engagement gift buyers choose most?",
  "What format do new-parent gift buyers choose most?",
  "Most choose framed print + HD digital for a wall-ready gift",
  "Most nursery gifts use framed print + HD digital",
];

const FORMAT_POPULARITY_NEGATIVE_FIXTURES = [
  "Which gift format fits an engagement best?",
  "Recommended presentation is framed print + HD digital for a wall-ready gift",
  "Most people choose the proposal night, but you can also use the first date",
  "Most couples choose their wedding date or the night they first met",
  "Popular occasions",
];

const MOST_GIFTS_ORDERS_FILES_POSITIVE_FIXTURES = [
  "One finished file covers most single-map gifts.",
  "Only for ongoing exports, not most one-off gifts.",
  "One file covers most gifts.",
  "This plan covers most orders.",
  "One export covers most files.",
  "Built for most one-off gifts.",
  "most single-map gifts",
  "most one-off gifts",
  "Most orders need only one finished file",
  "Most files cover a single map gift",
];

const MOST_GIFTS_ORDERS_FILES_NEGATIVE_FIXTURES = [
  "One finished file unlocks a single map.",
  "Built for ongoing exports across many maps.",
  "Most couples choose the proposal date",
  "Most people choose one of these moments",
  "These holidays bring the most gift searches each year",
  "Start with the most searched gift occasions",
  "Yes. It’s one of the most requested gifts for weddings and anniversaries.",
  "Yes. A custom star map gift is one of the most meaningful couples gifts",
  "Most buyers decide faster once the wording is settled",
];

const PRODUCT_SUPERIORITY_POSITIVE_FIXTURES = [
  "best wedding gift",
  "$106 framed + HD · free shipping — best wedding gift.",
  "Best wedding gift: framed print + HD digital",
  "Highest gift impact",
  "prefer the framed print + HD digital bundle for highest gift impact",
  "Best gift route",
  "Best gift",
  "Looking for the best personalized star map gift?",
  "Best Personalized Star Map Gift",
  "Best for gifting and finished presentation.",
  "Best for same-day gifting and local print shops.",
  "Best for last-minute gifting, fast turnaround",
  "Best for premium gifting",
  "Best when the buyer wants the gift to arrive finished",
  "Best when the gift should arrive ready to hang.",
  "Best if you want the finished piece to arrive ready to display.",
  "Best if you want the physical print with a lower total.",
  "Best if you already know the frame plan.",
  "Best if you just need this one finished map.",
  "Best when you only need this one finished map.",
  "Best lower-cost physical option",
  "Best-looking premium option for special occasions",
  "You get the highest-converting options first",
  "Start with the highest-intent pages",
];

const PRODUCT_SUPERIORITY_NEGATIVE_FIXTURES = [
  "What format is best for an anniversary gift?",
  "What gift format works best for a birthday star map?",
  "What delivery format works best for memorial gifts?",
  "Recommended presentation",
  "Premium gift route",
  "Premium gift",
  "Framed print + HD digital — free standard shipping on $100+ orders.",
  "Ready-to-hang presentation for a finished gift",
  "Built for same-day gifting and local print shops.",
  "Use this if you just need this one finished map.",
  "Use framed when the finished piece should arrive ready to display.",
  "Use unframed when you want the physical print with a lower total.",
  "Use framed when the gift should arrive ready to hang.",
  "Which personalized star map format should I choose?",
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
  "One HD export unlocks this map. Use packs or unlimited if you plan to create more maps.",
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

test("only-need matcher catches qualified buyer cohorts", () => {
  for (const sample of ONLY_NEED_POSITIVE_FIXTURES) {
    assert.match(sample, MOST_BUYERS_ONLY_NEED_PATTERN, `expected only-need positive fixture: ${sample}`);
  }
  for (const sample of ONLY_NEED_NEGATIVE_FIXTURES) {
    assert.doesNotMatch(
      sample,
      MOST_BUYERS_ONLY_NEED_PATTERN,
      `expected only-need negative fixture: ${sample}`
    );
  }
});

test("popular-bundle matcher catches product labels but not Popular occasions", () => {
  for (const sample of POPULAR_BUNDLE_POSITIVE_FIXTURES) {
    assert.match(sample, POPULAR_BUNDLE_PATTERN, `expected popular-bundle positive fixture: ${sample}`);
  }
  for (const sample of POPULAR_BUNDLE_NEGATIVE_FIXTURES) {
    assert.doesNotMatch(
      sample,
      POPULAR_BUNDLE_PATTERN,
      `expected popular-bundle negative fixture: ${sample}`
    );
  }
});

test("product-popularity matcher catches direct popularity claims but not editorial headings", () => {
  for (const sample of PRODUCT_POPULARITY_POSITIVE_FIXTURES) {
    assert.match(
      sample,
      PRODUCT_POPULARITY_PATTERN,
      `expected product-popularity positive fixture: ${sample}`
    );
    assert.ok(
      collectMatches(sample, POPULARITY_PATTERNS).length > 0,
      `expected product-popularity positive fixture to fail full scan: ${sample}`
    );
  }
  for (const sample of PRODUCT_POPULARITY_NEGATIVE_FIXTURES) {
    assert.doesNotMatch(
      sample,
      PRODUCT_POPULARITY_PATTERN,
      `expected product-popularity negative fixture: ${sample}`
    );
  }
});

test("format-popularity matcher catches transactional occasion FAQs only", () => {
  for (const sample of FORMAT_POPULARITY_POSITIVE_FIXTURES) {
    const matched =
      FORMAT_POPULARITY_QUESTION_PATTERN.test(sample) || FORMAT_POPULARITY_ANSWER_PATTERN.test(sample);
    assert.equal(matched, true, `expected format-popularity positive fixture: ${sample}`);
  }
  for (const sample of FORMAT_POPULARITY_NEGATIVE_FIXTURES) {
    assert.doesNotMatch(sample, FORMAT_POPULARITY_QUESTION_PATTERN, sample);
    assert.doesNotMatch(sample, FORMAT_POPULARITY_ANSWER_PATTERN, sample);
  }
});

test("most-gifts/orders/files matcher catches subject-substitution frequency claims", () => {
  for (const sample of MOST_GIFTS_ORDERS_FILES_POSITIVE_FIXTURES) {
    assert.match(sample, MOST_GIFTS_ORDERS_FILES_PATTERN, `expected most-gifts positive fixture: ${sample}`);
    assert.ok(
      collectMatches(sample, POPULARITY_PATTERNS).length > 0,
      `expected most-gifts positive fixture to fail full scan: ${sample}`
    );
  }
  for (const sample of MOST_GIFTS_ORDERS_FILES_NEGATIVE_FIXTURES) {
    assert.doesNotMatch(
      sample,
      MOST_GIFTS_ORDERS_FILES_PATTERN,
      `expected most-gifts negative fixture: ${sample}`
    );
  }
});

test("HomeOfferStack digital plans no longer generalize most gifts", () => {
  const source = readSrc("components/HomeOfferStack.tsx");
  assert.doesNotMatch(source, MOST_GIFTS_ORDERS_FILES_PATTERN);
  assert.doesNotMatch(source, /covers most single-map gifts/i);
  assert.doesNotMatch(source, /not most one-off gifts/i);
  assert.match(source, /One finished file unlocks a single map/);
  assert.match(source, /Built for ongoing exports across many maps/);
});

test("product-superiority matcher catches reviewed offer-surface claims", () => {
  for (const sample of PRODUCT_SUPERIORITY_POSITIVE_FIXTURES) {
    assert.match(sample, PRODUCT_SUPERIORITY_PATTERN, `expected superiority positive fixture: ${sample}`);
    assert.ok(
      collectMatches(sample, POPULARITY_PATTERNS).length > 0,
      `expected superiority positive fixture to fail full scan: ${sample}`
    );
  }
  for (const sample of PRODUCT_SUPERIORITY_NEGATIVE_FIXTURES) {
    assert.doesNotMatch(
      sample,
      PRODUCT_SUPERIORITY_PATTERN,
      `expected superiority negative fixture: ${sample}`
    );
  }
});

test("PreviewStartForm and offer surfaces no longer claim best wedding gift or gift-route superiority", () => {
  const preview = readSrc("components/PreviewStartForm.tsx");
  assert.doesNotMatch(preview, PRODUCT_SUPERIORITY_PATTERN);
  assert.doesNotMatch(preview, /Best wedding gift/i);
  assert.match(preview, /Framed print \+ HD digital/);

  const wedding = readSrc("app/wedding/page.tsx");
  assert.doesNotMatch(wedding, /best wedding gift/i);
  assert.match(wedding, /framed print plus instant HD/);

  const home = readSrc("components/HomeOfferStack.tsx");
  assert.doesNotMatch(home, /Highest gift impact/i);
  assert.doesNotMatch(home, /Best gift route/i);
  assert.match(home, /Premium presentation/);
  assert.match(home, /Premium gift route/);

  const delivery = readSrc("components/DeliveryFormatModule.tsx");
  assert.doesNotMatch(delivery, /Best wedding gift/i);
});

test("EditorExperience no longer renders Best gift superiority label", () => {
  const source = readSrc("components/EditorExperience.tsx");
  assert.doesNotMatch(source, /\bBest gift\b/);
  assert.doesNotMatch(source, PRODUCT_SUPERIORITY_PATTERN);
  assert.match(source, /Premium gift/);
});

test("PreviewStartForm caller intents no longer use Best if / Best when superiority", () => {
  for (const relativePath of [
    "app/custom-night-sky-map/page.tsx",
    "app/star-map-generator/page.tsx",
    "app/constellation-map/page.tsx",
    "app/star-map-gift-ideas/page.tsx",
    "app/star-map-in/page.tsx",
    "app/star-map-in/[slug]/page.tsx",
  ]) {
    const source = readSrc(relativePath);
    assert.doesNotMatch(source, /\bBest if\b/i, relativePath);
    assert.doesNotMatch(source, /\bBest when\b/i, relativePath);
    assert.doesNotMatch(source, PRODUCT_SUPERIORITY_PATTERN, relativePath);
  }
  assert.match(
    readSrc("app/custom-night-sky-map/page.tsx"),
    /Use framed when the finished piece should arrive ready to display/
  );
  assert.match(
    readSrc("app/star-map-gift-ideas/page.tsx"),
    /Use framed when the gift should arrive ready to hang/
  );
});

test("paywall value_anchor subtitle no longer generalizes first-time buyers", () => {
  const source = readSrc("components/PaywallModal.tsx");
  assert.doesNotMatch(source, MOST_BUYERS_ONLY_NEED_PATTERN);
  assert.doesNotMatch(source, /Most first-time buyers only need/i);
  assert.match(source, /One HD export unlocks this map/);
});

test("money pages no longer render Popular bundle product labels", () => {
  for (const relativePath of [
    "app/birthday/page.tsx",
    "app/anniversary/page.tsx",
    "app/personalized-star-map/page.tsx",
    "app/night-sky-map-gift/page.tsx",
    "app/star-map-for/[slug]/page.tsx",
  ]) {
    const source = readSrc(relativePath);
    assert.doesNotMatch(source, POPULAR_BUNDLE_PATTERN, relativePath);
    assert.match(source, /Framed \+ HD bundle:/, relativePath);
  }
  // Editorial heading must remain.
  assert.match(readSrc("app/star-map-for/page.tsx"), /Popular occasions/);
  assert.match(readSrc("components/OccasionLinks.tsx"), /Popular occasions/);
});

test("seoOccasions transactional format-popularity FAQs are factual", () => {
  const source = readSrc("data/seoOccasions.ts");
  assert.doesNotMatch(source, FORMAT_POPULARITY_QUESTION_PATTERN);
  assert.doesNotMatch(source, FORMAT_POPULARITY_ANSWER_PATTERN);
  assert.doesNotMatch(source, PRODUCT_POPULARITY_PATTERN);
  assert.doesNotMatch(source, /Is a wedding star map popular\?/i);
  assert.doesNotMatch(source, /most requested gifts/i);
  assert.doesNotMatch(source, /popular for baby showers/i);
  assert.doesNotMatch(source, /popular for remembrance gifts/i);
  assert.match(source, /Which gift format fits an engagement best\?/);
  assert.match(source, /Recommended presentation is framed print \+ HD digital/);
  assert.match(source, /Which gift format fits a new-parent keepsake best\?/);
  assert.match(source, /Is a wedding star map a good gift\?/);
  // Preserve date-selection editorial.
  assert.match(source, /Most people choose the proposal night/);
  assert.match(source, /Most couples choose their wedding date/);
  assert.match(source, /Popular choices include/);
});

test("birthday and night-sky money pages no longer claim product popularity", () => {
  const birthday = readSrc("app/birthday/page.tsx");
  assert.doesNotMatch(birthday, PRODUCT_POPULARITY_PATTERN);
  assert.doesNotMatch(birthday, /Birthday star maps are popular/i);
  assert.match(birthday, /Birthday star maps fit 18th/);

  const nightSky = readSrc("app/night-sky-map-gift/page.tsx");
  assert.doesNotMatch(nightSky, PRODUCT_POPULARITY_PATTERN);
  assert.doesNotMatch(nightSky, /most popular uses/i);
  assert.match(nightSky, /anniversary star map captures the exact sky/);

  const wedding = readSrc("app/wedding/page.tsx");
  assert.doesNotMatch(wedding, PRODUCT_POPULARITY_PATTERN);
  assert.doesNotMatch(wedding, /our popular framed/i);
  assert.match(wedding, /the framed \+ HD gift bundle/);

  const gift = readSrc("app/star-map-gift/page.tsx");
  assert.doesNotMatch(gift, PRODUCT_POPULARITY_PATTERN);
  assert.match(gift, /related gift formats/);

  // Preserve date-selection and navigation editorial.
  assert.match(readSrc("app/anniversary/page.tsx"), /are all popular choices/);
  assert.match(readSrc("app/star-map-for/page.tsx"), /Popular occasions/);
  assert.match(readSrc("app/HomeStaticSections.tsx"), /Popular star map destinations/);
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

  const llms = fs.readFileSync(path.join(PUBLIC, "llms.txt"), "utf8");
  for (const hit of collectMatches(llms, HARDCODED_FULFILLMENT_PATTERNS)) {
    failures.push(`public/llms.txt: ${hit.snippet}`);
  }
  // Default auto-confirm path must be described accurately for AI assistants.
  assert.match(
    llms,
    /By default, production begins after payment once the order is submitted to our print partner/i
  );
  assert.doesNotMatch(llms, /Production typically starts after order review/i);
  assert.doesNotMatch(llms, /highest gift impact/i);

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
