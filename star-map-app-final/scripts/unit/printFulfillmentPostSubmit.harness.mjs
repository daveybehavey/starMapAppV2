/** Deterministic harness for bind-before-review + authority mirror guard. */
import {
  applyPrintOrderAuthorityOp,
  createSerializedAuthorityStore,
  createUnboundAuthorityState,
  normalizeAuthorityProviderOrderId,
} from "./printOrderAuthorityState.harness.mjs";
import {
  buildReviewFromStatuses,
  formatPrintfulFileFailureError,
  summarizePrintfulFileReview,
} from "./printfulOrderReview.harness.mjs";

export { buildReviewFromStatuses };

export const printOrderKey = (sessionId) => `print:order:${sessionId}`;
export const fulfillmentIndexKey = (id) => `print:fulfillment:by-printful:${id}`;

export function createMemoryKv() {
  const map = new Map();
  return {
    async get(key) {
      return map.has(key) ? structuredClone(map.get(key)) : null;
    },
    async set(key, value) {
      map.set(key, structuredClone(value));
    },
    async delete(key) {
      map.delete(key);
    },
  };
}

async function persistPrintOrderRecord(kv, authority, sessionId, record, options = {}) {
  if (record.status !== "failed" && !options.allowClearTerminalFailure) {
    const lifecycle = (await authority.get(sessionId)).lifecycle;
    if (lifecycle === "terminal_failed") {
      return { outcome: "rejected_terminal_failure" };
    }
    const existing = await kv.get(printOrderKey(sessionId));
    if (existing?.status === "failed") {
      return { outcome: "rejected_terminal_failure" };
    }
  }
  await kv.set(printOrderKey(sessionId), record);
  return { outcome: "persisted", ttlSeconds: 3600 };
}

/**
 * Models bindAcceptedPrintfulIdentityThenReview with injectable review + authority store.
 */
export async function bindAcceptedPrintfulIdentityThenReview(input) {
  const {
    sessionId,
    sentRecord,
    kv,
    authority = createSerializedAuthorityStore(),
    reviewResult = null,
    reviewThrow = null,
    events = [],
    alerts = [],
  } = input;

  const current = await authority.get(sessionId);
  if (current.revision === 0) {
    await authority.apply(sessionId, {
      type: "seed_from_kv",
      kvStatus: null,
      printfulOrderId: null,
      now: Date.now(),
    });
  }

  const providerId = normalizeAuthorityProviderOrderId(sentRecord.printfulOrderId);
  let bindBlockedByTerminal = false;
  let bindOk = false;
  if (providerId) {
    const bind = await authority.apply(sessionId, {
      type: "bind_provider_order_id",
      printfulOrderId: providerId,
      now: Date.now(),
    });
    events.push({ step: "bind", ok: bind.ok, reason: bind.reason });
    if (bind.ok) bindOk = true;
    else if (bind.reason === "terminal_blocks_bind") bindBlockedByTerminal = true;
  }

  events.push({ step: "identity_persist" });
  const identityPersist = await persistPrintOrderRecord(kv, authority, sessionId, sentRecord);
  let indexed = false;
  if (sentRecord.printfulOrderId) {
    events.push({ step: "index" });
    await kv.set(fulfillmentIndexKey(sentRecord.printfulOrderId), { sessionId });
    indexed = true;
  }

  if (identityPersist.outcome !== "persisted" || bindBlockedByTerminal || !providerId) {
    return {
      record: sentRecord,
      identityPersist,
      reviewPersist: null,
      indexed,
      bindOk,
      bindBlockedByTerminal,
      alerts,
      events,
      authority,
    };
  }

  events.push({ step: "review_start" });
  if (reviewThrow) throw reviewThrow;

  const disposition = summarizePrintfulFileReview(reviewResult);
  let reviewed = sentRecord;
  if (disposition === "failed" && reviewResult) {
    reviewed = { ...sentRecord, error: formatPrintfulFileFailureError(reviewResult) };
    alerts.push({ type: "failure" });
  } else if (disposition === "healthy") {
    alerts.push({ type: "approval" });
    reviewed = { ...sentRecord, operatorAlertedAt: Date.now() };
  }

  let reviewPersist = null;
  if (reviewed !== sentRecord && (reviewed.error !== sentRecord.error || reviewed.operatorAlertedAt)) {
    reviewPersist = await persistPrintOrderRecord(kv, authority, sessionId, reviewed);
  }

  return {
    record: reviewed,
    identityPersist,
    reviewPersist,
    indexed,
    bindOk,
    bindBlockedByTerminal,
    alerts,
    events,
    authority,
  };
}

export { createSerializedAuthorityStore, createUnboundAuthorityState, applyPrintOrderAuthorityOp };
