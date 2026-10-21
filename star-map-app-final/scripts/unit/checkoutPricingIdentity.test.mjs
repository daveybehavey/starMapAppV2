/**
 * Pricing-identity regression pins (G-dot P2 on PR #343, 2026-10-19).
 *
 * The checkout URL cache key (KV, 120s TTL) and the Stripe idempotency
 * key are both derived from the order identity built by
 * checkoutIdempotencyKey in src/app/api/checkout/route.ts. Before this
 * fix that identity omitted the effective price, so across a pricing
 * flip (the HD 3-pack $10 -> $19 repoint in this PR) a NEW checkout
 * could (a) be served the cached URL of a session minted at the old
 * price while the site displayed the new one, and (b) after the cache
 * lapsed, reuse the old Stripe idempotency key — same order identity,
 * same 5-minute expiry bucket — with the new Price ID, which Stripe
 * rejects as a parameter mismatch.
 *
 * The fix appends a pricing segment (resolveCheckoutPricingIdentity in
 * the route, formatted by src/lib/checkoutPricingIdentity.ts) to the
 * key: the resolved Stripe Price ID for the price-ID-configured path,
 * or currency + amount for the price_data fallback — for every charged
 * line (digital plan, geo single, print variant, digital add-on, card
 * add-on, merch). These tests pin:
 *   (a) price flip  -> different cache key AND different Stripe key;
 *   (b) same price  -> identical keys (dedupe preserved);
 *   (c) the 5-minute expiry bucketing is unchanged;
 *   (d) the route wiring that threads the segment into both keys,
 *       including the resolver consulting every configured price
 *       source (a drift guard for future price-configured plans).
 *
 * route.ts cannot be imported by the plain-Node unit runner (Next.js
 * graph), so route wiring is pinned by source construction — the same
 * pattern as pricingLadder.test.mjs — while the identity format and
 * the expiry bucketing are pinned behaviourally against the real lib
 * modules.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildCheckoutPricingIdentity,
  priceDataComponent,
  priceIdComponent,
} from "../../src/lib/checkoutPricingIdentity.ts";
import {
  CHECKOUT_SESSION_EXPIRY_BUCKET_SECONDS,
  CHECKOUT_SESSION_TTL_SECONDS,
  getCheckoutSessionExpiresAt,
} from "../../src/lib/checkoutSessionExpiry.ts";

const UNIT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(UNIT_DIR, "../..");
const route = fs.readFileSync(path.join(APP_ROOT, "src/app/api/checkout/route.ts"), "utf8");

// The two keys the defect lived in, composed with the route's grammar:
// KV cache key = checkoutIdempotencyKey(...) (order identity + pricing
// segment); Stripe key = `${idempotencyKey}:exp${expires_at}`.
const OLD_PACK3_PRICE_ID = "price_1SuOJMLWqD0o9865vhXRX5C3"; // $10, retired by PR #343
const NEW_PACK3_PRICE_ID = "price_1USLXuLWqD0o9865w9H6msaa"; // $19, verified against Stripe 2026-10-19
const ORDER_IDENTITY = "checkout:idempotency:url:digital:pack3:poster_framed:0:0::::::";
const cacheKeyFor = (pricingIdentity) => `${ORDER_IDENTITY}:${pricingIdentity}`;
const stripeKeyFor = (cacheKey, expiresAt) => `${cacheKey}:exp${expiresAt}`;

test("(a) price-ID flip: a checkout minted under price A is never reused after the flip to B", () => {
  const expiresAt = getCheckoutSessionExpiresAt(1_700_000_100_000);
  const keyA = cacheKeyFor(buildCheckoutPricingIdentity([priceIdComponent(OLD_PACK3_PRICE_ID)]));
  const keyB = cacheKeyFor(buildCheckoutPricingIdentity([priceIdComponent(NEW_PACK3_PRICE_ID)]));
  assert.notEqual(keyB, keyA, "the post-flip request must NOT hit the pre-flip cached URL entry");
  assert.notEqual(
    stripeKeyFor(keyB, expiresAt),
    stripeKeyFor(keyA, expiresAt),
    "same expiry bucket + flipped price must produce a different Stripe idempotency key",
  );
});

test("(a) price_data fallback flip: a tier amount change also re-keys both keys", () => {
  const expiresAt = getCheckoutSessionExpiresAt(1_700_000_100_000);
  const keyOld = cacheKeyFor(buildCheckoutPricingIdentity([priceDataComponent("USD", 1000)]));
  const keyNew = cacheKeyFor(buildCheckoutPricingIdentity([priceDataComponent("USD", 1900)]));
  assert.notEqual(keyNew, keyOld);
  assert.notEqual(stripeKeyFor(keyNew, expiresAt), stripeKeyFor(keyOld, expiresAt));
  // Currency is part of the fallback identity, normalized to lowercase.
  assert.equal(buildCheckoutPricingIdentity([priceDataComponent("USD", 1900)]), "pd:usd:1900");
});

test("(b) same price: retries still dedupe to the same cache entry and Stripe key", () => {
  const expiresAt = getCheckoutSessionExpiresAt(1_700_000_100_000);
  const first = cacheKeyFor(buildCheckoutPricingIdentity([priceIdComponent(NEW_PACK3_PRICE_ID)]));
  const retry = cacheKeyFor(buildCheckoutPricingIdentity([priceIdComponent(NEW_PACK3_PRICE_ID)]));
  assert.equal(retry, first);
  assert.equal(stripeKeyFor(retry, expiresAt), stripeKeyFor(first, expiresAt));
});

test("multi-line orders: identity covers every charged line; changing any one re-keys", () => {
  const framed = (printComponent, addOnComponent) =>
    buildCheckoutPricingIdentity([printComponent, addOnComponent]);
  const before = framed(priceIdComponent("price_print_a"), priceDataComponent("usd", 700));
  const addOnFlipped = framed(priceIdComponent("price_print_a"), priceDataComponent("usd", 900));
  const printFlipped = framed(priceIdComponent("price_print_b"), priceDataComponent("usd", 700));
  assert.notEqual(addOnFlipped, before, "an add-on-only price change must re-key");
  assert.notEqual(printFlipped, before, "a main-line price change must re-key");
  assert.equal(
    framed(priceIdComponent("price_print_a"), priceDataComponent("usd", 700)),
    before,
    "unchanged lines keep the same identity",
  );
});

test("(c) expiry bucketing is unchanged: 5-minute buckets, 2-hour TTL", () => {
  assert.equal(CHECKOUT_SESSION_EXPIRY_BUCKET_SECONDS, 5 * 60);
  assert.equal(CHECKOUT_SESSION_TTL_SECONDS, 2 * 60 * 60);
  const bucketStartMs = 1_700_000_100_000; // exactly on a 300s boundary
  const inBucket = getCheckoutSessionExpiresAt(bucketStartMs);
  assert.equal(getCheckoutSessionExpiresAt(bucketStartMs + 299_000), inBucket);
  assert.equal(getCheckoutSessionExpiresAt(bucketStartMs + 300_000), inBucket + 300);
  assert.equal(inBucket, bucketStartMs / 1000 + CHECKOUT_SESSION_TTL_SECONDS);
});

test("(d) wiring: the key builder appends the pricing segment and the handler supplies it", () => {
  assert.match(route, /pricingSegment = input\.pricingIdentity \? `:\$\{input\.pricingIdentity\}` : ""/);
  // PR #349 fix round appended a gift segment AFTER the pricing segment
  // (G-dot recheck: the gift flag belongs to the reuse identity). The
  // pricing segment's own content and position are unchanged — the key
  // base now ends pricing-then-gift.
  assert.match(route, /\$\{pricingSegment\}\$\{giftSegment\}`;/, "the pricing segment (then the gift segment) must land in the cache-key base");
  // Exactly one key-builder call site, and it receives the identity
  // resolved with the request's client country (geo pricing input).
  assert.equal([...route.matchAll(/checkoutIdempotencyKey\(\{/g)].length, 1);
  assert.match(route, /const pricingIdentity = resolveCheckoutPricingIdentity\(\{/);
  assert.match(route, /pricingIdentity,\s*\}\);/);
});

test("(d) wiring: the Stripe idempotency key still derives from the pricing-bearing key", () => {
  assert.match(
    route,
    /boundStripeIdempotencyKey\(`\$\{idempotencyKey\}:exp\$\{sessionParams\.expires_at \?\? ""\}`\)/,
  );
});

/**
 * Long-key bounding (Codex P2 test gap on the fix round, 2026-10-19).
 *
 * The Stripe key is NOT the raw `${key}:exp${expires_at}` string the
 * helpers above compose: the route passes it through
 * boundStripeIdempotencyKey, which leaves keys <= 200 chars untouched
 * but collapses longer ones to a 176-char prefix + ":h" + a hash tag
 * of the FULL string + the length. The short-key pins above therefore
 * never exercised the path where truncation happens — including the
 * tail case where the pricing segment sits beyond the retained prefix
 * and only the hash tag distinguishes the old price from the new one.
 *
 * Reachability: boundStripeIdempotencyKey and its tag helper are NOT
 * exported from route.ts, and route.ts cannot be imported by this
 * runner (Next.js graph — see header). So the tests below extract the
 * two function definitions VERBATIM from the route source and
 * evaluate them: the code under test is the production source text
 * itself (any production edit changes what runs here), and extraction
 * fails loudly if the functions are renamed or restructured. The only
 * mechanical transform is stripping the two TS type annotations from
 * the signatures. (If Jack later prefers a real import, exporting the
 * pair from the route or moving them into a lib module is a small
 * production diff — deliberately out of scope for this test-only fix.)
 */
function extractRouteFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `route.ts must define ${name} (extraction target)`);
  let depth = 0;
  let end = -1;
  for (let i = source.indexOf("{", start); i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  assert.ok(end > start, `could not brace-match ${name} in route.ts`);
  return source.slice(start, end);
}

const tagSourceRaw = extractRouteFunction(route, "checkoutEmailIdempotencyTag");
const boundSourceRaw = extractRouteFunction(route, "boundStripeIdempotencyKey");
// Drift alarms: if the hash or the bounding shape changes, these pins
// fail before the behavioural tests below can silently re-pin to it.
assert.match(tagSourceRaw, /2166136261/, "tag must stay the FNV-1a offset basis");
assert.match(tagSourceRaw, /16777619/, "tag must stay the FNV-1a prime");
assert.match(boundSourceRaw, /maxLength = 200/, "bound must keep the 200-char cap");
assert.match(boundSourceRaw, /slice\(0, maxLength - 24\)/, "bound must keep the 176-char retained prefix");
assert.match(boundSourceRaw, /key\.length\.toString\(36\)/, "bound must keep the length suffix");

const tagSource = tagSourceRaw.replace("(email: string): string", "(email)");
const boundSource = boundSourceRaw.replace(
  "(key: string, maxLength = 200): string",
  "(key, maxLength = 200)",
);
assert.notEqual(tagSource, tagSourceRaw, "tag signature de-annotation must apply");
assert.notEqual(boundSource, boundSourceRaw, "bound signature de-annotation must apply");
const { checkoutEmailIdempotencyTag, boundStripeIdempotencyKey } = new Function(
  `"use strict";\n${tagSource}\n${boundSource}\nreturn { checkoutEmailIdempotencyTag, boundStripeIdempotencyKey };`,
)();

// The real Stripe-key path: expiry suffix first, then the route's
// bounding function — unlike stripeKeyFor above, which stays raw.
const boundedStripeKeyFor = (cacheKey, expiresAt) =>
  boundStripeIdempotencyKey(stripeKeyFor(cacheKey, expiresAt));

test("(e) long keys: the real bounding keeps short keys untouched and caps long ones at the hash-tagged form", () => {
  const expiresAt = getCheckoutSessionExpiresAt(1_700_000_100_000);
  const shortKey = cacheKeyFor(buildCheckoutPricingIdentity([priceIdComponent(NEW_PACK3_PRICE_ID)]));
  assert.equal(
    boundedStripeKeyFor(shortKey, expiresAt),
    stripeKeyFor(shortKey, expiresAt),
    "a <=200-char key must pass through the bounding unchanged",
  );
  const longInput = stripeKeyFor(
    `${shortKey}:${"m".repeat(160)}`,
    expiresAt,
  );
  assert.ok(longInput.length > 200);
  const bounded = boundStripeIdempotencyKey(longInput);
  assert.ok(bounded.length <= 200, "bounded key must respect the 200-char cap");
  assert.ok(bounded.startsWith(longInput.slice(0, 176)), "bounded key keeps the 176-char prefix");
  assert.equal(bounded.slice(176, 178), ":h", "bounded key carries the hash-tag marker");
  assert.ok(
    bounded.endsWith(longInput.length.toString(36)),
    "bounded key ends with the full length (base36)",
  );
});

test("(e) long keys (long mapId): a price flip still re-keys through the bounding; same price still dedupes", () => {
  const expiresAt = getCheckoutSessionExpiresAt(1_700_000_100_000);
  // Real key grammar (checkoutIdempotencyKey + qa segment): the
  // pricing segment rides in the base and the mapId trails it, so a
  // long mapId pushes the FULL Stripe input past 200 chars.
  const longMapId = `map_${"a".repeat(140)}`;
  const longCacheKeyFor = (pricingIdentity) => `${ORDER_IDENTITY}:${pricingIdentity}:${longMapId}`;
  const keyA = longCacheKeyFor(buildCheckoutPricingIdentity([priceIdComponent(OLD_PACK3_PRICE_ID)]));
  const keyB = longCacheKeyFor(buildCheckoutPricingIdentity([priceIdComponent(NEW_PACK3_PRICE_ID)]));
  assert.ok(
    stripeKeyFor(keyA, expiresAt).length > 200,
    "the composed Stripe input must actually exceed the 200-char bound",
  );
  const boundedA = boundedStripeKeyFor(keyA, expiresAt);
  const boundedB = boundedStripeKeyFor(keyB, expiresAt);
  assert.notEqual(boundedB, boundedA, "post-flip long key must not reuse the pre-flip Stripe key");
  assert.equal(
    boundedStripeKeyFor(keyB, expiresAt),
    boundedB,
    "same price + same long order must still dedupe after truncation",
  );
});

test("(e) long keys (pricing segment beyond the retained prefix): only the hash tag distinguishes the flip", () => {
  const expiresAt = getCheckoutSessionExpiresAt(1_700_000_100_000);
  // Every pre-pricing token at the key builder's real caps
  // (normalizeIdempotencyToken maxLen: merchFamily 32, merchSize 16,
  // merchColor 16, shipping 8, promo 48, referral 48) plus the email
  // tag — a maximal-but-legal key whose pricing segment starts past
  // char 176, so the retained prefixes of the two prices are
  // byte-identical and the hash tag alone carries the distinction.
  const emailSegment = `:em${checkoutEmailIdempotencyTag("buyer@example.com")}`;
  const deepBase = [
    "checkout:idempotency:url:digital:subscription:poster_unframed:0:0",
    "f".repeat(32),
    "s".repeat(16),
    "c".repeat(16),
    "u".repeat(8),
    "p".repeat(48),
    "r".repeat(48),
  ].join(":") + emailSegment;
  const deepCacheKeyFor = (pricingIdentity) => `${deepBase}:${pricingIdentity}:map_deep`;
  const keyA = deepCacheKeyFor(buildCheckoutPricingIdentity([priceIdComponent(OLD_PACK3_PRICE_ID)]));
  const keyB = deepCacheKeyFor(buildCheckoutPricingIdentity([priceIdComponent(NEW_PACK3_PRICE_ID)]));
  const inputA = stripeKeyFor(keyA, expiresAt);
  const inputB = stripeKeyFor(keyB, expiresAt);
  assert.ok(inputA.length > 200 && inputB.length > 200, "both inputs must exceed the bound");
  assert.ok(
    inputA.indexOf("price:price_") >= 176,
    "the pricing segment must start beyond the retained 176-char prefix",
  );
  assert.equal(
    inputA.slice(0, 176),
    inputB.slice(0, 176),
    "precondition: the retained prefixes are identical — the flip is invisible to the prefix",
  );
  const boundedA = boundStripeIdempotencyKey(inputA);
  const boundedB = boundStripeIdempotencyKey(inputB);
  assert.equal(boundedA.slice(0, 176), boundedB.slice(0, 176), "bounded prefixes stay identical");
  assert.notEqual(
    boundedB,
    boundedA,
    "the hash tag over the full string must still distinguish the flipped price",
  );
  assert.equal(
    boundStripeIdempotencyKey(inputB),
    boundedB,
    "same price + same deep key must still dedupe to the same bounded key",
  );
});

test("(d) resolver drift guard: every configured price source feeds the identity", () => {
  const resolverStart = route.indexOf("function resolveCheckoutPricingIdentity");
  const resolverEnd = route.indexOf("function checkoutIdempotencyKey");
  assert.ok(resolverStart >= 0 && resolverEnd > resolverStart, "resolver must precede the key builder");
  const resolver = route.slice(resolverStart, resolverEnd);
  for (const source of [
    "stripePriceIds[", // digital plans (single / pack3 / subscription)
    "getGeoDigitalSinglePrice(", // geo-priced digital single
    "stripePrintVariantPriceIds[", // print variants + card add-on
    "stripePrintDigitalAddOnPriceId", // print digital add-on
    "getMerchStripePriceId(", // merch families with a configured Price ID
    "getPricingTiers()", // digital price_data fallback tiers
    "getPrintPricingTiers()", // print + card price_data fallback tiers
    "getPrintDigitalAddOnPrice()", // add-on price_data fallback
    "getMerchCheckoutPriceCents(", // merch price_data fallback
  ]) {
    assert.ok(resolver.includes(source), `pricing resolver must consult ${source}`);
  }
});
