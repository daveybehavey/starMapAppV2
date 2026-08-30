/**
 * Deterministic harness for persist-ID-before-review + soft terminal guard.
 * Mirrors src/lib/printFulfillmentPostSubmit.ts + printOrders soft guard.
 */
import {
  buildReviewFromStatuses,
  summarizePrintfulFileReview,
  formatPrintfulFileFailureError,
} from "./printfulOrderReview.harness.mjs";

export function createMemoryKv(initial = new Map()) {
  const store = new Map(initial);
  return {
    store,
    async get(key) {
      return store.has(key) ? structuredClone(store.get(key)) : null;
    },
    async setDurable(key, value) {
      store.set(key, structuredClone(value));
    },
    async deleteDurable(key) {
      store.delete(key);
    },
  };
}

export function printOrderKey(sessionId) {
  return `print:order:${sessionId}`;
}

export function fulfillmentIndexKey(printfulOrderId) {
  return `print:fulfillment:by-printful:${String(printfulOrderId)}`;
}

/**
 * Soft-guard persist mirroring production persistPrintOrderRecord terminal rule.
 */
export async function persistPrintOrderRecord(kv, sessionId, record, options = {}) {
  const key = printOrderKey(sessionId);
  if (record.status !== "failed" && !options.allowClearTerminalFailure) {
    const existing = await kv.get(key);
    if (existing?.status === "failed") {
      return { outcome: "rejected_terminal_failure" };
    }
  }
  await kv.setDurable(key, record);
  return { outcome: "persisted", ttlSeconds: 3600 };
}

export async function setPrintFulfillmentIndex(kv, printfulOrderId, sessionId) {
  await kv.setDurable(fulfillmentIndexKey(printfulOrderId), { sessionId });
}

/**
 * Simulate applyPrintfulPostSubmitReview with injectable review + alerts.
 */
export async function applyPrintfulPostSubmitReview(sentRecord, deps) {
  if (!sentRecord.printfulOrderId) return sentRecord;
  const review = await deps.reviewPrintfulOrderFiles(sentRecord.printfulOrderId);
  const disposition = summarizePrintfulFileReview(review);

  if (disposition === "failed" && review) {
    const failedRecord = {
      ...sentRecord,
      error: formatPrintfulFileFailureError(review),
    };
    if (!failedRecord.operatorFailureAlertedAt) {
      const alertResult = await deps.sendFailureAlert(failedRecord);
      deps.alerts.push({ type: "failure", delivered: alertResult.delivered });
      if (alertResult.delivered) {
        failedRecord.operatorFailureAlertedAt = Date.now();
      }
    }
    return failedRecord;
  }

  if (disposition === "pending" || disposition === "unavailable") {
    return sentRecord;
  }

  if (!sentRecord.operatorAlertedAt) {
    const alertResult = await deps.sendApprovalAlert(sentRecord);
    deps.alerts.push({ type: "approval", delivered: alertResult.delivered });
    if (alertResult.delivered) {
      sentRecord.operatorAlertedAt = Date.now();
    }
  }
  return sentRecord;
}

/**
 * Ordering harness: identity persist + index BEFORE review callback.
 */
export async function persistAcceptedPrintfulIdentityThenReview(input) {
  const { sessionId, sentRecord, kv, reviewThrow, reviewResult, events } = input;
  const log = events || [];

  const identityPersist = await persistPrintOrderRecord(kv, sessionId, sentRecord);
  log.push({ step: "identity_persist", outcome: identityPersist.outcome, record: structuredClone(sentRecord) });

  let indexed = false;
  if (sentRecord.printfulOrderId) {
    await setPrintFulfillmentIndex(kv, sentRecord.printfulOrderId, sessionId);
    indexed = true;
    log.push({ step: "index", printfulOrderId: sentRecord.printfulOrderId, sessionId });
  }

  if (identityPersist.outcome === "rejected_terminal_failure") {
    return { record: sentRecord, identityPersist, reviewPersist: null, indexed, events: log };
  }

  if (!sentRecord.printfulOrderId) {
    return { record: sentRecord, identityPersist, reviewPersist: null, indexed, events: log };
  }

  const alerts = [];
  const deps = {
    alerts,
    reviewPrintfulOrderFiles: async () => {
      log.push({ step: "review_start" });
      if (reviewThrow) throw reviewThrow;
      return reviewResult;
    },
    sendFailureAlert: async () => ({ delivered: true, provider: "test" }),
    sendApprovalAlert: async () => ({ delivered: true, provider: "test" }),
  };

  let reviewed;
  try {
    reviewed = await applyPrintfulPostSubmitReview(sentRecord, deps);
  } catch (error) {
    log.push({ step: "review_threw", message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
  log.push({ step: "review_done", alerts: [...alerts], error: reviewed.error });

  const annotated =
    sentRecord.error !== reviewed.error ||
    sentRecord.operatorAlertedAt !== reviewed.operatorAlertedAt ||
    sentRecord.operatorFailureAlertedAt !== reviewed.operatorFailureAlertedAt;

  if (!annotated) {
    return { record: reviewed, identityPersist, reviewPersist: null, indexed, events: log, alerts };
  }

  const reviewPersist = await persistPrintOrderRecord(kv, sessionId, reviewed);
  log.push({ step: "review_persist", outcome: reviewPersist.outcome });
  return { record: reviewed, identityPersist, reviewPersist, indexed, events: log, alerts };
}

export { buildReviewFromStatuses, summarizePrintfulFileReview };
