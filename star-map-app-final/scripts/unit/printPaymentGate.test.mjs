/**
 * Regression (audit pass 5, finding 3): print fulfillment was not
 * payment-gated. checkout.session.completed fires with
 * payment_status "unpaid" for async payment methods (e.g. ACSS / SEPA
 * debit), and the completed handler queued the Printful order anyway —
 * manufacturing a print order before settlement, never re-gated if the
 * payment later failed.
 *
 * Fix shape pinned here:
 * - the print queue consults isFulfillableCheckoutPayment (the same gate
 *   markSessionPaid / applyReferralReward always used) at its single call
 *   site inside the shared fulfillment pass;
 * - checkout.session.async_payment_succeeded re-runs that same pass once
 *   the session is fulfillable, and queuePrintOrder no-ops on a record
 *   already "sent", so the event pair queues exactly one provider order;
 * - checkout.session.async_payment_failed only finalizes a still-pending
 *   print record — it never submits anything.
 *
 * Fixtures are shaped like the PINNED Stripe API 2024-06-20 payloads:
 * discounts live under total_details.breakdown, never top-level.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { isFulfillableCheckoutPayment } from "../../src/lib/checkoutPromotions.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WEBHOOK = path.join(ROOT, "src/app/api/stripe/webhook/route.ts");
const webhookSource = fs.readFileSync(WEBHOOK, "utf8");

/** Pinned-API-shaped print checkout session (framed + HD, $106.00). */
function printSession(overrides = {}) {
  return {
    id: "cs_test_print_async",
    object: "checkout.session",
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    amount_total: 10600,
    currency: "usd",
    payment_method_types: ["card"],
    metadata: { order_type: "print", print_variant: "poster_framed" },
    total_details: { amount_discount: 0, breakdown: { discounts: [] } },
    ...overrides,
  };
}

test("gate: completed + paid print session is fulfillable (queue path open)", () => {
  assert.equal(isFulfillableCheckoutPayment(printSession()), true);
});

test("gate: completed + UNPAID print session (async payment method) is NOT fulfillable", () => {
  // checkout.session.completed for an ACSS-debit payment: checkout is
  // complete but the payment has not settled and can still fail.
  const session = printSession({
    payment_status: "unpaid",
    payment_method_types: ["acss_debit"],
  });
  assert.equal(isFulfillableCheckoutPayment(session), false);
});

test("gate: async_payment_succeeded settles the same session -> fulfillable", () => {
  const settled = printSession({
    payment_status: "paid",
    payment_method_types: ["acss_debit"],
  });
  assert.equal(isFulfillableCheckoutPayment(settled), true);
});

test("gate: $0 print session with an applied discount stays fulfillable at completed", () => {
  // 100% print promo / comp: no_payment_required is legitimate only with a
  // resolved discount (breakdown shape, pinned API).
  const session = printSession({
    payment_status: "no_payment_required",
    amount_total: 0,
    total_details: {
      amount_discount: 10600,
      breakdown: {
        discounts: [
          {
            amount: 10600,
            discount: { coupon: { id: "coup_comp_print", metadata: {} }, promotion_code: null },
          },
        ],
      },
    },
  });
  assert.equal(isFulfillableCheckoutPayment(session), true);
});

test("gate: $0 print session with NO discount is not fulfillable", () => {
  const session = printSession({ payment_status: "no_payment_required", amount_total: 0 });
  assert.equal(isFulfillableCheckoutPayment(session), false);
});

test("gate: subscription semantics unchanged (trial fulfillable, unpaid not)", () => {
  assert.equal(
    isFulfillableCheckoutPayment({ mode: "subscription", payment_status: "no_payment_required", amount_total: 0 }),
    true,
  );
  assert.equal(
    isFulfillableCheckoutPayment({ mode: "subscription", payment_status: "unpaid", amount_total: 1900 }),
    false,
  );
});

test("route: the print queue has exactly one call site and it is payment-gated", () => {
  const callSites = webhookSource.match(/queuePrintOrder\(/g) ?? [];
  // One function definition + one call, inside the shared fulfillment pass.
  assert.equal(callSites.length, 2);
  assert.match(
    webhookSource,
    /const paymentFulfillable = isFulfillableCheckoutPayment\(fulfilledSession\);/,
  );
  assert.match(
    webhookSource,
    /if \(!skipPrintOrder && paymentFulfillable\) \{\s*await queuePrintOrder\(fulfilledSession\);\s*\}/,
  );
  // The deferral is observable, not silent.
  assert.match(webhookSource, /print_order_deferred_until_payment_settles/);
});

test("route: queuePrintOrder still no-ops on an already-sent record (one order per session)", () => {
  assert.match(webhookSource, /if \(existing\?\.status === "sent"\) \{/);
});

test("route: completed and async_payment_succeeded run the same fulfillment pass", () => {
  assert.match(
    webhookSource,
    /case "checkout\.session\.completed": \{\s*const session = event\.data\.object as Stripe\.Checkout\.Session;\s*const \{ retryable \} = await processCheckoutFulfillment\(session, eventDedupeKey\);/,
  );
  assert.match(
    webhookSource,
    /case "checkout\.session\.async_payment_succeeded": \{\s*\/\/ Settlement of an async payment method\.[\s\S]*?const \{ retryable \} = await processCheckoutFulfillment\(session, eventDedupeKey\);/,
  );
});

test("route: async settlement events defer dedupe until successful handling", () => {
  // Refund/dispute events defer too since DL-1 Slice 3 (a transiently
  // deferred referral reversal must be redeliverable — Codex P2, PR #367).
  assert.match(
    webhookSource,
    /const deferDedupeUntilSuccess =\s*isExpiredCheckoutEvent \|\|\s*isCompletedCheckoutEvent \|\|\s*isAsyncPaymentSucceededEvent \|\|\s*isAsyncPaymentFailedEvent \|\|\s*isReferralReversalEvent;/,
  );
});

test("route: async_payment_failed finalizes pending print records and submits nothing", () => {
  assert.match(webhookSource, /case "checkout\.session\.async_payment_failed": \{/);
  const start = webhookSource.indexOf("async function finalizeAsyncPaymentFailed");
  assert.notEqual(start, -1);
  const body = webhookSource.slice(start, webhookSource.indexOf("\n}\n", start));
  assert.match(body, /existing\.status !== "pending"/);
  assert.match(body, /status: "failed"/);
  assert.match(body, /error: "async_payment_failed"/);
  assert.doesNotMatch(body, /queuePrintOrder|submitPrintful/);
});

test("route: entitlement grants keep their own payment gates (unchanged)", () => {
  assert.match(
    webhookSource,
    /async function markSessionPaid\(session: Stripe\.Checkout\.Session\) \{\s*if \(!session\.id\) return;\s*if \(!isFulfillableCheckoutPayment\(session\)\) return;/,
  );
  assert.match(
    webhookSource,
    /async function applyReferralReward\(session: Stripe\.Checkout\.Session\) \{\s*if \(!session\.id\) return;\s*if \(!isFulfillableCheckoutPayment\(session\)\) return;/,
  );
});
