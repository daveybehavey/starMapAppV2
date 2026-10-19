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
  assert.match(route, /\$\{pricingSegment\}`;/, "the segment must land in the cache-key base");
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
