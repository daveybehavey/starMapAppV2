/**
 * checkoutGiftFlag.test.mjs — T1 gift-flag writers (review-engine design §4).
 *
 * The buyer's "This is a gift" indication must travel:
 *   editor checkbox → POST /api/checkout `isGift`
 *     → Stripe session metadata `is_gift = "true"`
 *     → webhook writers stamp `isGift` on the entitlement + print records
 *     → the review engine excludes `isGift === true` (never asked).
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

test("record value: true for gift, absent (undefined) for non-gift — the reader's expectation", () => {
  assert.equal(giftFlagForRecord({ is_gift: "true" }), true);
  assert.equal(giftFlagForRecord({ order_type: "print" }), undefined);
  assert.equal(giftFlagForRecord(null), undefined);
  // As persisted to KV (JSON), a non-gift record carries no isGift field.
  const stored = JSON.parse(JSON.stringify({ isGift: giftFlagForRecord({}) }));
  assert.equal("isGift" in stored, false);
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
  assert.equal(entitlement.isGift, undefined);
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
  assert.equal(printRecord.isGift, undefined);
  const verdict = classifyPrintRecord(printRecord, NOW, true);
  assert.equal(verdict.outcome, "due");
});

test("wiring: checkout route writes the metadata only from the POST body's isGift flag", () => {
  const route = read("src/app/api/checkout/route.ts");
  assert.match(route, /isGift = parseBoolean\(body\?\.isGift, false\);/);
  assert.match(route, /if \(isGift\) metadata\[CHECKOUT_GIFT_METADATA_KEY\] = "true";/);
  assert.match(route, /from "@\/lib\/checkoutGiftFlag"/);
});

test("wiring: the gift flag never enters the pricing identity or the idempotency/cache key", () => {
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
  assert.equal(idempotencyKey.includes("isGift"), false);
  assert.equal(idempotencyKey.includes("is_gift"), false);
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
