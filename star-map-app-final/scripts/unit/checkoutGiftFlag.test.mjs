/**
 * checkoutGiftFlag.test.mjs — T1 gift-flag writers (review-engine design §4).
 *
 * The buyer's "This is a gift" indication must travel:
 *   editor checkbox → POST /api/checkout `isGift`
 *     → Stripe session metadata `is_gift = "true"`
 *     → webhook writers stamp an explicit-boolean `isGift` on the
 *       entitlement + print records
 *     → the review engine asks only literal `isGift === false` records
 *       (T-T1 fail-closed: true OR absent provenance is never asked).
 *
 * The derivation helpers in src/lib/checkoutGiftFlag.ts are the real code
 * both writers call; the route/component wiring is pinned by source text
 * (the house pattern for route-internal code), and the writer → reader
 * contract is exercised end-to-end against the REAL engine classifiers.
 * Session fixtures are shaped like the pinned Stripe API 2024-06-20:
 * session metadata is a flat string map.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

import {
  CHECKOUT_GIFT_METADATA_KEY,
  giftFlagForRecord,
  isGiftFromSessionMetadata,
} from "../../src/lib/checkoutGiftFlag.ts";
import {
  buildCheckoutPricingIdentity,
  priceDataComponent,
  priceIdComponent,
} from "../../src/lib/checkoutPricingIdentity.ts";
import { parsePrintVariant } from "../../src/lib/printCatalog.ts";
import { appendCheckoutIdempotencyQaSegment } from "../../src/lib/qaSession.mjs";

const { classifyDigitalEntitlement, classifyPrintRecord } = await import(
  "../../src/lib/reviewRequests.ts"
);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-20T12:00:00Z");

/** A paid checkout.session as the pinned API delivers it to the webhook. */
function paidSession(metadata) {
  return {
    id: "cs_live_gift_fixture",
    object: "checkout.session",
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    amount_total: 9900,
    currency: "usd",
    customer_details: { email: "buyer@example.com", name: "Buyer" },
    metadata,
  };
}

test("metadata key is the flat string-map key the checkout route writes", () => {
  assert.equal(CHECKOUT_GIFT_METADATA_KEY, "is_gift");
});

test("only the exact string 'true' marks a gift (Stripe metadata is case-sensitive)", () => {
  assert.equal(isGiftFromSessionMetadata({ is_gift: "true" }), true);
  assert.equal(isGiftFromSessionMetadata({ is_gift: "false" }), false);
  assert.equal(isGiftFromSessionMetadata({ is_gift: "TRUE" }), false);
  assert.equal(isGiftFromSessionMetadata({ is_gift: "1" }), false);
  assert.equal(isGiftFromSessionMetadata({}), false);
  assert.equal(isGiftFromSessionMetadata(null), false);
  assert.equal(isGiftFromSessionMetadata(undefined), false);
});

test("record value: explicit boolean — true for gift, false for non-gift (T-T1 provenance)", () => {
  assert.equal(giftFlagForRecord({ is_gift: "true" }), true);
  assert.equal(giftFlagForRecord({ order_type: "print" }), false);
  assert.equal(giftFlagForRecord(null), false);
  // As persisted to KV (JSON), a non-gift record now carries isGift: false —
  // the review engine fails closed on an ABSENT flag (gift_uncertain), so
  // provenance must be stamped, never implied.
  const stored = JSON.parse(JSON.stringify({ isGift: giftFlagForRecord({}) }));
  assert.equal(stored.isGift, false);
});

test("writer → reader, digital: a gift-flagged session lands isGift on the entitlement and is never due", () => {
  const session = paidSession({ order_type: "digital", plan: "single", is_gift: "true" });
  // The field writes in markSessionPaid (webhook), pinned by source below.
  const entitlement = {
    paid: true,
    created: NOW - 4 * DAY_MS, // inside the +3d..+14d due window
    customerEmail: session.customer_details.email,
    orderType: "digital",
    isGift: giftFlagForRecord(session.metadata),
  };
  assert.equal(entitlement.isGift, true);
  const verdict = classifyDigitalEntitlement(entitlement, NOW);
  assert.equal(verdict.outcome, "excluded");
  assert.equal(verdict.reason, "gift_order");
});

test("writer → reader, digital: a non-gift session is due in the same window", () => {
  const session = paidSession({ order_type: "digital", plan: "single" });
  const entitlement = {
    paid: true,
    created: NOW - 4 * DAY_MS,
    customerEmail: session.customer_details.email,
    orderType: "digital",
    isGift: giftFlagForRecord(session.metadata),
  };
  assert.equal(entitlement.isGift, false);
  const verdict = classifyDigitalEntitlement(entitlement, NOW);
  assert.equal(verdict.outcome, "due");
});

test("writer → reader, physical: a gift-flagged print session lands isGift on the print record and is never due", () => {
  const session = paidSession({ order_type: "print", print_variant: "poster_framed", is_gift: "true" });
  // The field write in queuePrintOrder's payload (webhook), pinned by source below.
  const printRecord = {
    status: "sent",
    sessionId: session.id,
    customerEmail: session.customer_details.email,
    shippedAt: NOW - 8 * DAY_MS, // inside the +7d..+21d due window
    isGift: giftFlagForRecord(session.metadata),
  };
  assert.equal(printRecord.isGift, true);
  const verdict = classifyPrintRecord(printRecord, NOW, true);
  assert.equal(verdict.outcome, "excluded");
  assert.equal(verdict.reason, "gift_order");
});

test("writer → reader, physical: a non-gift print record is due in the same window", () => {
  const session = paidSession({ order_type: "print", print_variant: "poster_framed" });
  const printRecord = {
    status: "sent",
    sessionId: session.id,
    customerEmail: session.customer_details.email,
    shippedAt: NOW - 8 * DAY_MS,
    isGift: giftFlagForRecord(session.metadata),
  };
  assert.equal(printRecord.isGift, false);
  const verdict = classifyPrintRecord(printRecord, NOW, true);
  assert.equal(verdict.outcome, "due");
});

test("wiring: checkout route writes the metadata only from the POST body's isGift flag", () => {
  const route = read("src/app/api/checkout/route.ts");
  assert.match(route, /isGift = parseBoolean\(body\?\.isGift, false\);/);
  assert.match(route, /if \(isGift\) metadata\[CHECKOUT_GIFT_METADATA_KEY\] = "true";/);
  assert.match(route, /from "@\/lib\/checkoutGiftFlag"/);
});

test("wiring: the gift flag scopes the reuse identity — the key, never the pricing identity", () => {
  // G-dot recheck on PR #349 (fix round): the original design kept the
  // flag out of the key entirely, so a request differing only in the
  // gift tick reused the other flavour's cached URL / Stripe key. The
  // flag now appends a gift segment to the reuse identity — while the
  // PRICING identity (what is charged) stays exactly as PR #343 built
  // it: the flag is never priced and never enters the resolver.
  const route = read("src/app/api/checkout/route.ts");
  const pricingIdentity = route.slice(
    route.indexOf("function resolveCheckoutPricingIdentity"),
    route.indexOf("function checkoutIdempotencyKey"),
  );
  const idempotencyKey = route.slice(
    route.indexOf("function checkoutIdempotencyKey"),
    route.indexOf("async function createCheckoutSession"),
  );
  assert.ok(pricingIdentity.length > 0 && idempotencyKey.length > 0);
  assert.equal(pricingIdentity.includes("isGift"), false);
  assert.equal(pricingIdentity.includes("is_gift"), false);
  // Key builder: a typed gift input, a segment that exists only when
  // the box is ticked, appended after the (unchanged) pricing segment.
  assert.match(idempotencyKey, /isGift\?: boolean;/);
  assert.match(idempotencyKey, /const giftSegment = input\.isGift \? ":gift" : "";/);
  // Lever A: the copy segment (":c2", "" when off) appends after the gift
  // segment — non-copy keys, gift included, stay byte-identical.
  assert.match(idempotencyKey, /\$\{pricingSegment\}\$\{giftSegment\}\$\{copySegment\}`/);
  // The single call site threads the parsed flag into the builder.
  assert.match(route, /customerEmail: customerEmail \?\? null,\s*isGift,\s*pricingIdentity,/);
});

test("wiring: both webhook writers stamp the record from session metadata via the shared helper", () => {
  const webhook = read("src/app/api/stripe/webhook/route.ts");
  const stamps = webhook.match(/isGift: giftFlagForRecord\(session\.metadata\)/g) ?? [];
  assert.equal(stamps.length, 2); // markSessionPaid (entitlement) + queuePrintOrder (print record)
  assert.match(webhook, /from "@\/lib\/checkoutGiftFlag"/);
});

test("wiring: editor sends isGift in the checkout payload and offers the checkbox in panel + paywall", () => {
  const editor = read("src/components/EditorExperience.tsx");
  assert.match(editor, /if \(isGift\) checkoutPayload\.isGift = true;/);
  assert.match(editor, /const \[isGiftOrder, setIsGiftOrder\] = useState\(false\);/);
  assert.ok((editor.match(/isGift: isGiftOrder/g) ?? []).length >= 4); // panel, mobile, modal digital+print, merch
  assert.match(editor, /This is a gift/);
  const modal = read("src/components/PaywallModal.tsx");
  assert.match(modal, /onIsGiftChange/);
  assert.match(modal, /This is a gift/);
});

test("wiring: digital fallback checkouts preserve the gift selection (Codex P2, PR #349)", () => {
  // Both "digital_single" fallback handlers (inline editor + paywall modal)
  // must thread the checkbox state through; a bare startCheckout("single")
  // would silently reset the flag to false while the box stays ticked.
  const editor = read("src/components/EditorExperience.tsx");
  assert.equal(
    editor.split('startCheckout("single", { isGift: isGiftOrder })').length - 1,
    2,
    "both digital fallback handlers must pass the gift flag",
  );
  assert.ok(
    !editor.includes('startCheckout("single");'),
    'no bare startCheckout("single") calls may remain — they drop the gift flag',
  );
});

/**
 * Behavioural pins for the reuse identity, against the route's REAL key
 * builder extracted verbatim from source (route.ts cannot be imported
 * by the plain-Node runner — the pattern from
 * checkoutPricingIdentity.test.mjs). The two lib helpers the builder
 * calls are imported for real; the route-local helpers are extracted
 * with it, so the code under test is the production source text and
 * extraction fails loudly if any of it is renamed or restructured.
 */
const routeSource = read("src/app/api/checkout/route.ts");

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

function extractKeyBuilder(source) {
  const start = source.indexOf("function checkoutIdempotencyKey(");
  assert.ok(start >= 0, "route.ts must define checkoutIdempotencyKey (extraction target)");
  // The parameter is an inline object type, so the naive first-{ would
  // land inside the TYPE, not the body: skip to the signature's
  // closing ") {" first, then brace-match the body from there.
  const sigClose = source.indexOf(") {", start);
  assert.ok(sigClose > start, "could not find the key builder's body opening");
  const bodyOpen = sigClose + 2;
  let depth = 0;
  let end = -1;
  for (let i = bodyOpen; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  assert.ok(end > bodyOpen, "could not brace-match the key builder's body");
  return `function checkoutIdempotencyKey(input) ${source.slice(bodyOpen, end)}`;
}

const prefixMatch = routeSource.match(/const CHECKOUT_IDEMPOTENCY_PREFIX = "([^"]+)";/);
assert.ok(prefixMatch, "route.ts must define CHECKOUT_IDEMPOTENCY_PREFIX");
assert.equal(prefixMatch[1], "checkout:idempotency:url:", "key prefix drift alarm");

const normalizeRaw = extractRouteFunction(routeSource, "normalizeIdempotencyToken");
const normalizeSrc = normalizeRaw.replace("(raw: unknown, maxLen = 64)", "(raw, maxLen = 64)");
assert.notEqual(normalizeSrc, normalizeRaw, "normalize signature de-annotation must apply");
const tagRaw = extractRouteFunction(routeSource, "checkoutEmailIdempotencyTag");
const tagSrc = tagRaw.replace("(email: string): string", "(email)");
assert.notEqual(tagSrc, tagRaw, "tag signature de-annotation must apply");
const builderSrc = extractKeyBuilder(routeSource);
assert.match(builderSrc, /input\.isGift \? ":gift" : ""/, "extracted builder must carry the gift segment");

const { checkoutIdempotencyKey } = new Function(
  "parsePrintVariant",
  "appendCheckoutIdempotencyQaSegment",
  `"use strict";\n${prefixMatch[0]}\n${normalizeSrc}\n${tagSrc}\n${builderSrc}\nreturn { checkoutIdempotencyKey };`,
)(parsePrintVariant, appendCheckoutIdempotencyQaSegment);

const PACK3_PRICING_IDENTITY = buildCheckoutPricingIdentity([
  priceIdComponent("price_1USLXuLWqD0o9865w9H6msaa"),
]);
const DIGITAL_ORDER_IDENTITY = "checkout:idempotency:url:digital:pack3:poster_framed:0:0::::::";

test("reuse identity (behavioural): a gift tick re-keys the checkout; the same tick dedupes", () => {
  const input = {
    mapId: "map_abc123",
    plan: "pack3",
    orderType: "digital",
    pricingIdentity: PACK3_PRICING_IDENTITY,
  };
  const nonGift = checkoutIdempotencyKey({ ...input });
  const gift = checkoutIdempotencyKey({ ...input, isGift: true });
  // Byte-exact composition: a non-gift key is IDENTICAL to the pre-flag
  // grammar (the PR #343 key with the mapId appended) — the gift
  // segment is absent for non-gift, not zeroed in.
  assert.equal(nonGift, `${DIGITAL_ORDER_IDENTITY}:${PACK3_PRICING_IDENTITY}:map_abc123`);
  assert.equal(gift, `${DIGITAL_ORDER_IDENTITY}:${PACK3_PRICING_IDENTITY}:gift:map_abc123`);
  assert.notEqual(gift, nonGift, "toggling the gift checkbox must not reuse the other flavour's session");
  // Retries with the SAME tick still dedupe — in both flavours.
  assert.equal(checkoutIdempotencyKey({ ...input, isGift: true }), gift);
  assert.equal(checkoutIdempotencyKey({ ...input, isGift: false }), nonGift);
  // The Stripe idempotency key derives from this key (route:
  // `${key}:exp${expires_at}`, then bounded), so it differs too.
  const stripeFor = (key) => `${key}:exp1700007200`;
  assert.notEqual(stripeFor(gift), stripeFor(nonGift));
});

test("reuse identity (behavioural): print orders — the price segment stays byte-identical, gift rides after it", () => {
  const pricingIdentity = buildCheckoutPricingIdentity([
    priceIdComponent("price_print_a"),
    priceDataComponent("usd", 700),
  ]);
  assert.equal(pricingIdentity, "price:price_print_a+pd:usd:700");
  const input = {
    mapId: "map_print1",
    plan: "print",
    orderType: "print",
    printVariant: "poster_framed",
    includeDigitalAddOn: true,
    pricingIdentity,
  };
  const nonGift = checkoutIdempotencyKey({ ...input });
  const gift = checkoutIdempotencyKey({ ...input, isGift: true });
  assert.ok(nonGift.endsWith(`:${pricingIdentity}:map_print1`), "non-gift print key unchanged");
  assert.equal(gift, `${nonGift.slice(0, -":map_print1".length)}:gift:map_print1`);
  assert.notEqual(gift, nonGift);
});
