import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isDurableKvPersistenceError,
  simulateAlternateWebhookThenPersist,
  simulateCompletedCheckoutDedupeFlow,
  simulateHydrateRecipientPersist,
  simulateStripeRedeliveryAfterDurableQueueFailure,
} from "./printOrderDurableOrdering.harness.mjs";
import {
  isDurableKvPersistenceError as productionIsDurableKvPersistenceError,
  KvDurableDeleteError,
  KvDurableWriteError,
} from "../../src/lib/kv.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "../..");
const webhookSource = fs.readFileSync(path.join(appRoot, "src/app/api/stripe/webhook/route.ts"), "utf8");
const retrySource = fs.readFileSync(path.join(appRoot, "src/app/api/print/orders/retry/route.ts"), "utf8");
const kvSource = fs.readFileSync(path.join(appRoot, "src/lib/kv.ts"), "utf8");

test("isDurableKvPersistenceError recognizes write/delete durable failures", () => {
  assert.equal(isDurableKvPersistenceError(new KvDurableWriteError("put failed")), true);
  assert.equal(isDurableKvPersistenceError(new KvDurableDeleteError("delete failed")), true);
  assert.equal(productionIsDurableKvPersistenceError(new KvDurableWriteError("put failed")), true);
  assert.equal(productionIsDurableKvPersistenceError(new Error("webhook_failed")), false);
  assert.equal(isDurableKvPersistenceError(new Error("Webhook 502: boom")), false);
  assert.equal(isDurableKvPersistenceError(null), false);
  assert.match(kvSource, /export function isDurableKvPersistenceError/);
});

test("completed-checkout dedupe finalizes only after durable queue success", () => {
  const success = simulateCompletedCheckoutDedupeFlow({ durableQueueSucceeds: true });
  assert.equal(success.outcome, "received");
  assert.equal(success.dedupeFinalized, true);
  assert.equal(success.queued, true);
  assert.equal(success.retryable, false);

  const durableFail = simulateCompletedCheckoutDedupeFlow({ durableQueueSucceeds: false });
  assert.equal(durableFail.outcome, "print_order_queue_retryable");
  assert.equal(durableFail.httpStatus, 503);
  assert.equal(durableFail.dedupeFinalized, false);
  assert.equal(durableFail.queued, false);
  assert.equal(durableFail.retryable, true);

  const duplicate = simulateCompletedCheckoutDedupeFlow({ priorDedupePresent: true });
  assert.equal(duplicate.outcome, "duplicate");
  assert.equal(duplicate.queued, false);
});

test("Stripe redelivery after initial durable queue failure can queue the paid order", () => {
  const { first, second } = simulateStripeRedeliveryAfterDurableQueueFailure();
  assert.equal(first.dedupeFinalized, false);
  assert.equal(first.retryable, true);
  assert.equal(first.httpStatus, 503);
  assert.equal(second.dedupeFinalized, true);
  assert.equal(second.queued, true);
  assert.equal(second.retryable, false);
  assert.equal(second.httpStatus, 200);
});

test("source: checkout.session.completed defers dedupe until after durable queueing", () => {
  assert.match(webhookSource, /isCompletedCheckoutEvent/);
  assert.match(webhookSource, /deferDedupeUntilSuccess/);
  assert.match(webhookSource, /completedCheckoutRetryable/);
  assert.match(webhookSource, /print_order_queue_retryable/);
  assert.match(webhookSource, /isDurableKvPersistenceError\(error\)/);
  // Must not pre-incr dedupe for completed checkout (only non-deferred types).
  assert.match(webhookSource, /if \(!deferDedupeUntilSuccess\)/);
  assert.match(
    webhookSource,
    /await queuePrintOrder\(session\);[\s\S]*?await kv\.set\(eventDedupeKey/,
  );
  // Dedupe set for completed happens after successful handling, not before queuePrintOrder.
  const completedCase = webhookSource.slice(
    webhookSource.indexOf('case "checkout.session.completed"'),
    webhookSource.indexOf('case "checkout.session.expired"'),
  );
  assert.match(completedCase, /queuePrintOrder\(session\)/);
  assert.match(completedCase, /kv\.set\(eventDedupeKey/);
  assert.ok(
    completedCase.indexOf("queuePrintOrder(session)") < completedCase.indexOf("kv.set(eventDedupeKey"),
    "dedupe finalize must follow queuePrintOrder",
  );
});

test("successful alternate webhook + durable persist failure does not mark webhook_failed", () => {
  const failPersist = simulateAlternateWebhookThenPersist({
    webhookOk: true,
    persistThrowsDurable: true,
  });
  assert.equal(failPersist.markedWebhookFailed, false);
  assert.equal(failPersist.orderStatus, "unchanged_pending");
  assert.equal(failPersist.durableErrorPropagates, true);

  const webhookFail = simulateAlternateWebhookThenPersist({ webhookOk: false });
  assert.equal(webhookFail.markedWebhookFailed, true);
  assert.equal(webhookFail.orderStatus, "failed");

  const ok = simulateAlternateWebhookThenPersist({ webhookOk: true, persistThrowsDurable: false });
  assert.equal(ok.orderStatus, "sent");
  assert.equal(ok.markedWebhookFailed, false);
});

test("source: retry + webhook keep durable sent-write outside outbound failure catch", () => {
  assert.match(retrySource, /isDurableKvPersistenceError/);
  assert.match(webhookSource, /Successful external side effect/);

  // Retry: outbound catch must not wrap the sent persist call.
  const retryAltSection = retrySource.slice(retrySource.lastIndexOf("printFulfillmentWebhookUrl"));
  assert.match(retryAltSection, /Restrict this catch to outbound fulfillment failures only/);
  assert.ok(
    retryAltSection.indexOf("persistFailedPrintOrder") <
      retryAltSection.indexOf("await persistPrintOrderRecord(sessionId, sent)"),
    "failed webhook path precedes durable sent persist",
  );
  assert.match(retryAltSection, /await persistPrintOrderRecord\(sessionId, sent\)/);

  // Webhook queuePrintOrder alt path: persist sent after outbound try/catch.
  assert.match(
    webhookSource,
    /Successful external side effect: persist "sent" outside the outbound catch/,
  );
  assert.match(webhookSource, /if \(isDurableKvPersistenceError\(error\)\) throw error;/);
});

test("recipient hydration rethrows durable persist failures", () => {
  const softStripeFail = simulateHydrateRecipientPersist({ stripeRetrieveOk: false });
  assert.equal(softStripeFail.usedExisting, true);
  assert.equal(softStripeFail.threwDurable, false);

  const durableFail = simulateHydrateRecipientPersist({
    stripeRetrieveOk: true,
    persistThrowsDurable: true,
  });
  assert.equal(durableFail.threwDurable, true);
  assert.equal(durableFail.hydratedPersisted, false);

  const ok = simulateHydrateRecipientPersist({
    stripeRetrieveOk: true,
    persistThrowsDurable: false,
  });
  assert.equal(ok.hydratedPersisted, true);
  assert.equal(ok.threwDurable, false);
});

test("source: hydrateOrderRecipientData rethrows durable persistence errors", () => {
  const hydrateFn = retrySource.slice(
    retrySource.indexOf("async function hydrateOrderRecipientData"),
    retrySource.indexOf("export async function POST"),
  );
  assert.match(hydrateFn, /persistPrintOrderRecord/);
  assert.match(
    hydrateFn,
    /isDurableKvPersistenceError\(error\)\s*\|\|\s*isPrintOrderUnretainableError\(error\)\)\s*throw error/,
  );
  assert.match(hydrateFn, /assertPrintOrderRetained\(await persistPrintOrderRecord/);
  assert.match(hydrateFn, /Failed to refresh print order recipient details from Stripe/);
});
