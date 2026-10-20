/**
 * Regression (PR #350, G-dot bounded recheck): the webhook payment gate
 * looked sound, but the OPERATOR RETRY path could still submit a
 * previously failed, unpaid order.
 *
 * The hole, verified in source: POST /api/print/orders/retry decided
 * purely from the persisted record (amount + margin) and never consulted
 * payment state. A record finalized by checkout.session.async_payment_failed
 * carries terminalEventType explicitly null — which (a) does NOT trip
 * isLegacyAmbiguousPrintOrderFailure (that guard fires only when the
 * property is ABSENT) and (b) yields NO authority terminal evidence on
 * seed (terminalEventTypeForAuthoritySeed returns null), so the authority
 * lifecycle stays unbound instead of terminal_failed. The record fell
 * through every check to submitPrintfulOrder with only its amount
 * inspected. A still-pending record for an unsettled session fell through
 * the same way.
 *
 * Fix pinned here: before the retry route may submit, the live checkout
 * session must pass evaluatePrintRetryPaymentGate — the webhook's own
 * isFulfillableCheckoutPayment predicate, fail-closed when the session
 * cannot be retrieved, mutating no state on denial. Paid orders and
 * $0-with-discount comp orders stay retryable.
 *
 * Fixtures are shaped like the PINNED Stripe API 2024-06-20 payloads:
 * discounts live under total_details.breakdown, never top-level.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  evaluatePrintRetryPaymentGate,
  isFulfillableCheckoutPayment,
} from "../../src/lib/checkoutPromotions.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RETRY_ROUTE = path.join(ROOT, "src/app/api/print/orders/retry/route.ts");
const WEBHOOK_ROUTE = path.join(ROOT, "src/app/api/stripe/webhook/route.ts");
const PRINT_ORDERS_LIB = path.join(ROOT, "src/lib/printOrders.ts");
const retrySource = fs.readFileSync(RETRY_ROUTE, "utf8");
const webhookSource = fs.readFileSync(WEBHOOK_ROUTE, "utf8");
const printOrdersSource = fs.readFileSync(PRINT_ORDERS_LIB, "utf8");

/** Pinned-API-shaped print checkout session (framed + HD, $106.00). */
function printSession(overrides = {}) {
  return {
    id: "cs_test_print_retry",
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

/** The exact record finalizeAsyncPaymentFailed writes for a failed async payment. */
function asyncFailedRecord(overrides = {}) {
  return {
    status: "failed",
    sessionId: "cs_test_print_retry",
    mapId: "map_retry",
    printVariant: "poster_framed",
    printAssetId: "asset_retry",
    amountTotal: 10600,
    currency: "usd",
    customerEmail: "buyer@example.com",
    attempts: 1,
    createdAt: 1_790_000_000_000,
    error: "async_payment_failed",
    // Explicitly present and null — the property whose ABSENCE the legacy
    // guard keys on is present, so the guard never fires for this record.
    terminalEventType: null,
    ...overrides,
  };
}

const retrieveReturning = (session) => async () => session;

test("sequence: async_payment_failed record -> admin retry is denied, record stays failed and untouched", async () => {
  const record = asyncFailedRecord();
  const snapshot = JSON.parse(JSON.stringify(record));

  // The failed async session: checkout completed, payment never settled.
  const failedSession = printSession({
    payment_status: "unpaid",
    payment_method_types: ["acss_debit"],
  });
  assert.equal(isFulfillableCheckoutPayment(failedSession), false);

  const gate = await evaluatePrintRetryPaymentGate({
    sessionId: record.sessionId,
    retrieveSession: retrieveReturning(failedSession),
  });
  assert.deepEqual(gate, { allowed: false, reason: "payment_not_fulfillable" });

  // Denial mutates nothing: the record remains terminal/failed exactly as
  // the webhook finalizer left it — no resubmission, no state rewrite.
  assert.deepEqual(record, snapshot);
  assert.equal(record.status, "failed");
  assert.equal(record.error, "async_payment_failed");
});

test("sequence: still-pending record for an unsettled session -> admin retry is denied", async () => {
  const pendingRecord = asyncFailedRecord({
    status: "pending",
    error: undefined,
    terminalEventType: undefined,
  });
  const gate = await evaluatePrintRetryPaymentGate({
    sessionId: pendingRecord.sessionId,
    retrieveSession: retrieveReturning(
      printSession({ payment_status: "unpaid", payment_method_types: ["acss_debit"] }),
    ),
  });
  assert.deepEqual(gate, { allowed: false, reason: "payment_not_fulfillable" });
  assert.equal(pendingRecord.status, "pending");
});

test("companion: paid order whose provider submission failed stays retryable", async () => {
  const paidFailureRecord = asyncFailedRecord({
    error: "printful_order_failed",
  });
  const gate = await evaluatePrintRetryPaymentGate({
    sessionId: paidFailureRecord.sessionId,
    retrieveSession: retrieveReturning(printSession()),
  });
  assert.deepEqual(gate, { allowed: true });
});

test("companion: $0 print order with an applied discount stays retryable", async () => {
  const gate = await evaluatePrintRetryPaymentGate({
    sessionId: "cs_test_print_retry",
    retrieveSession: retrieveReturning(
      printSession({
        payment_status: "no_payment_required",
        amount_total: 0,
        total_details: {
          amount_discount: 10600,
          breakdown: { discounts: [{ amount: 10600 }] },
        },
      }),
    ),
  });
  assert.deepEqual(gate, { allowed: true });
});

test("parity: $0 session with NO discount is denied (same rule as the webhook gate)", async () => {
  const gate = await evaluatePrintRetryPaymentGate({
    sessionId: "cs_test_print_retry",
    retrieveSession: retrieveReturning(
      printSession({ payment_status: "no_payment_required", amount_total: 0 }),
    ),
  });
  assert.deepEqual(gate, { allowed: false, reason: "payment_not_fulfillable" });
});

test("fail-closed: unretrievable session denies as payment_verification_unavailable", async () => {
  const nullGate = await evaluatePrintRetryPaymentGate({
    sessionId: "cs_test_print_retry",
    retrieveSession: async () => null,
  });
  assert.deepEqual(nullGate, {
    allowed: false,
    reason: "payment_verification_unavailable",
  });

  const throwingGate = await evaluatePrintRetryPaymentGate({
    sessionId: "cs_test_print_retry",
    retrieveSession: async () => {
      throw new Error("stripe unreachable");
    },
  });
  assert.deepEqual(throwingGate, {
    allowed: false,
    reason: "payment_verification_unavailable",
  });
});

test("source: the failed record shape above is the one the webhook finalizer writes", () => {
  const finalizer = webhookSource.slice(
    webhookSource.indexOf("async function finalizeAsyncPaymentFailed"),
    webhookSource.indexOf("export async function POST"),
  );
  assert.match(finalizer, /error: "async_payment_failed"/);
  assert.match(finalizer, /terminalEventType: null/);
});

test("source: the legacy guard keys on property ABSENCE (why the finalized record slipped through)", () => {
  assert.match(
    printOrdersSource,
    /return !Object\.prototype\.hasOwnProperty\.call\(record, "terminalEventType"\);/,
  );
});

test("source: retry route consults the payment gate before BOTH provider submission paths", () => {
  assert.match(
    retrySource,
    /import \{ evaluatePrintRetryPaymentGate \} from "@\/lib\/checkoutPromotions";/,
  );
  const gateIdx = retrySource.indexOf("await evaluatePrintRetryPaymentGate({");
  assert.ok(gateIdx > 0, "gate call present");
  // After the non-submitting already_sent early return…
  assert.ok(gateIdx > retrySource.indexOf('"already_sent"'));
  // …and before the Printful submission and the alternate webhook submission.
  assert.ok(gateIdx < retrySource.indexOf("submitPrintfulOrder({"));
  assert.ok(gateIdx < retrySource.indexOf("fetch(printFulfillmentWebhookUrl"));
  const gateSection = retrySource.slice(
    gateIdx,
    retrySource.indexOf("hydrateOrderRecipientData(existing)", gateIdx),
  );
  assert.match(gateSection, /paymentGate\.reason === "payment_not_fulfillable"/);
  assert.match(gateSection, /status: 409/);
  assert.match(gateSection, /status: 503/);
});
