/**
 * Deterministic control-flow harness for print-order durable failure ordering.
 * Keep in sync with:
 * - src/app/api/stripe/webhook/route.ts (completed-checkout dedupe + alt webhook persist)
 * - src/app/api/print/orders/retry/route.ts (hydration + alt webhook persist)
 * - src/lib/kv.ts (isDurableKvPersistenceError)
 */

export function isDurableKvPersistenceError(error) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? error.code : undefined;
  const name = "name" in error ? error.name : undefined;
  return (
    code === "kv_durable_write_failed" ||
    code === "kv_durable_delete_failed" ||
    name === "KvDurableWriteError" ||
    name === "KvDurableDeleteError"
  );
}

/**
 * Models checkout.session.completed dedupe: soft-check first, finalize only after
 * durable queue persistence succeeds. Stripe redelivery stays eligible on durable failure.
 */
export function simulateCompletedCheckoutDedupeFlow({
  priorDedupePresent = false,
  durableQueueSucceeds = true,
} = {}) {
  if (priorDedupePresent) {
    return {
      outcome: "duplicate",
      httpStatus: 200,
      dedupeFinalized: true,
      queued: false,
      retryable: false,
    };
  }
  if (!durableQueueSucceeds) {
    return {
      outcome: "print_order_queue_retryable",
      httpStatus: 503,
      dedupeFinalized: false,
      queued: false,
      retryable: true,
    };
  }
  return {
    outcome: "received",
    httpStatus: 200,
    dedupeFinalized: true,
    queued: true,
    retryable: false,
  };
}

/**
 * Models: first delivery fails durable queue (no dedupe); Stripe redelivery queues successfully.
 */
export function simulateStripeRedeliveryAfterDurableQueueFailure() {
  const first = simulateCompletedCheckoutDedupeFlow({ durableQueueSucceeds: false });
  const second = simulateCompletedCheckoutDedupeFlow({
    priorDedupePresent: first.dedupeFinalized,
    durableQueueSucceeds: true,
  });
  return { first, second };
}

/**
 * Models alternate-fulfillment webhook then durable "sent" persist.
 * Provider success + durable failure must NOT rewrite status as webhook_failed.
 */
export function simulateAlternateWebhookThenPersist({
  webhookOk = true,
  persistThrowsDurable = false,
} = {}) {
  if (!webhookOk) {
    return {
      orderStatus: "failed",
      markedWebhookFailed: true,
      durableErrorPropagates: false,
      httpStatus: 502,
    };
  }
  if (persistThrowsDurable) {
    return {
      orderStatus: "unchanged_pending",
      markedWebhookFailed: false,
      durableErrorPropagates: true,
      httpStatus: 500,
    };
  }
  return {
    orderStatus: "sent",
    markedWebhookFailed: false,
    durableErrorPropagates: false,
    httpStatus: 200,
  };
}

/**
 * Models recipient hydration: Stripe retrieval/parsing soft-fail returns existing;
 * durable persist failure must propagate.
 */
export function simulateHydrateRecipientPersist({
  stripeRetrieveOk = true,
  persistThrowsDurable = false,
} = {}) {
  if (!stripeRetrieveOk) {
    return { usedExisting: true, threwDurable: false, hydratedPersisted: false };
  }
  if (persistThrowsDurable) {
    return { usedExisting: false, threwDurable: true, hydratedPersisted: false };
  }
  return { usedExisting: false, threwDurable: false, hydratedPersisted: true };
}
