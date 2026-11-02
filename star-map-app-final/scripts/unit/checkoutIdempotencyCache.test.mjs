import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { decodeCachedCheckoutHandoff } from "../../src/lib/checkoutIdempotencyCache.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CHECKOUT_ROUTE = path.join(ROOT, "src/app/api/checkout/route.ts");
const SESSION_URL = "https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4e5f6";

// The field shaping the route applies whenever a handoff record (fresh or
// decoded) becomes the JSON the editor consumes: false warning flags are
// omitted from the wire (undefined); every other field is verbatim. The
// editor gates its promo warnings on these fields, so parity here is
// parity of what the buyer is told.
const editorFields = (record) => ({
  promoApplied: record.promoApplied,
  discountRejected: record.discountRejected || undefined,
  promoInvalidDropped: record.promoInvalidDropped || undefined,
  referralOfferApplied: record.referralOfferApplied,
  referralOfferVariant: record.referralOfferVariant,
  promoLookupFailed: record.promoLookupFailed,
});

// Cloudflare KV persists JSON.stringify(value) and reads it back with a
// JSON parse (src/lib/kv.ts); the local memory store keeps the value
// as-is. A cached record must decode identically down both paths.
const kvRoundTrip = (value) => JSON.parse(JSON.stringify(value));

// The outcome records exactly as POST /api/checkout builds them.
const FRESH_OUTCOMES = {
  manualPromoApplied: {
    url: SESSION_URL,
    promoApplied: true,
    referralOfferApplied: false,
    referralOfferVariant: null,
    discountRejected: false,
    promoInvalidDropped: false,
    promoLookupFailed: false,
  },
  referralOfferApplied: {
    url: SESSION_URL,
    promoApplied: false,
    referralOfferApplied: true,
    referralOfferVariant: "alt",
    discountRejected: false,
    promoInvalidDropped: false,
    promoLookupFailed: false,
  },
  promoInvalidDropped: {
    url: SESSION_URL,
    promoApplied: false,
    referralOfferApplied: false,
    referralOfferVariant: null,
    discountRejected: false,
    promoInvalidDropped: true,
    promoLookupFailed: false,
  },
  discountRejected: {
    url: SESSION_URL,
    promoApplied: false,
    referralOfferApplied: false,
    referralOfferVariant: null,
    discountRejected: true,
    promoInvalidDropped: true,
    promoLookupFailed: true,
  },
  noPromotion: {
    url: SESSION_URL,
    promoApplied: false,
    referralOfferApplied: false,
    referralOfferVariant: null,
    discountRejected: false,
    promoInvalidDropped: false,
    promoLookupFailed: false,
  },
};

test("fresh-vs-cached parity: every fresh outcome survives the cache round trip", () => {
  for (const [name, fresh] of Object.entries(FRESH_OUTCOMES)) {
    for (const stored of [fresh, kvRoundTrip(fresh)]) {
      const decoded = decodeCachedCheckoutHandoff(stored);
      assert.ok(decoded, `${name}: record must decode`);
      assert.equal(decoded.url, fresh.url, `${name}: url parity`);
      assert.deepEqual(editorFields(decoded), editorFields(fresh), `${name}: editor-field parity`);
    }
  }
});

test("the two warning flags the cache used to drop now replay as true", () => {
  // Regression pin for S95-2 N1: before the fix the cache stored only the
  // URL and the cache-hit response hardcoded both flags away.
  const dropped = decodeCachedCheckoutHandoff(kvRoundTrip(FRESH_OUTCOMES.promoInvalidDropped));
  assert.equal(dropped.promoInvalidDropped, true);
  assert.equal(editorFields(dropped).promoInvalidDropped, true);
  const rejected = decodeCachedCheckoutHandoff(kvRoundTrip(FRESH_OUTCOMES.discountRejected));
  assert.equal(rejected.discountRejected, true);
  assert.equal(editorFields(rejected).discountRejected, true);
});

test("legacy bare-URL records decode to the previous cache-hit defaults", () => {
  // Records written before the N1 fix are plain URL strings; within their
  // 120s TTL they must behave exactly like the old cache-hit response.
  assert.deepEqual(decodeCachedCheckoutHandoff(SESSION_URL), {
    url: SESSION_URL,
    promoApplied: false,
    referralOfferApplied: false,
    referralOfferVariant: null,
    discountRejected: false,
    promoInvalidDropped: false,
    promoLookupFailed: false,
  });
  assert.equal(decodeCachedCheckoutHandoff(`  ${SESSION_URL}  `).url, SESSION_URL);
});

test("unreadable records are cache misses, never partial replays", () => {
  for (const raw of [null, undefined, 42, true, [], {}, { url: 5 }, { url: "   " }, "", "   "]) {
    assert.equal(decodeCachedCheckoutHandoff(raw), null, JSON.stringify(raw));
  }
});

test("partial or loosely-typed records coerce strictly", () => {
  assert.deepEqual(decodeCachedCheckoutHandoff({ url: SESSION_URL }), {
    url: SESSION_URL,
    promoApplied: false,
    referralOfferApplied: false,
    referralOfferVariant: null,
    discountRejected: false,
    promoInvalidDropped: false,
    promoLookupFailed: false,
  });
  const loose = decodeCachedCheckoutHandoff({
    url: SESSION_URL,
    discountRejected: "yes",
    promoInvalidDropped: 1,
    referralOfferVariant: 7,
  });
  assert.equal(loose.discountRejected, false);
  assert.equal(loose.promoInvalidDropped, false);
  assert.equal(loose.referralOfferVariant, null);
});

test("source: route stores handoff records and replays them on cache hits", () => {
  const route = fs.readFileSync(CHECKOUT_ROUTE, "utf8");
  assert.match(route, /decodeCachedCheckoutHandoff\(await kv\.get<unknown>\(idempotencyKey\)\)/);
  // No bare-URL store remains at either cache-write site.
  assert.doesNotMatch(route, /kv\.set\(idempotencyKey, session\.url/);
  assert.match(route, /await kv\.set\(idempotencyKey, rejectedHandoff,/);
  assert.match(route, /\{ url: session\.url!\.trim\(\), \.\.\.handoffFlags \}/);
  // The cache-hit response replays both warning flags from the record.
  assert.match(route, /discountRejected: cachedRecord\.discountRejected \|\| undefined/);
  assert.match(route, /promoInvalidDropped: cachedRecord\.promoInvalidDropped \|\| undefined/);
});
