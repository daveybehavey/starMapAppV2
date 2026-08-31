/** Deterministic harness for bind-before-review + authority mirror guard (AG-018). */
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

function classifyBindFailure(bind) {
  if (bind.reason === "terminal_blocks_bind") return "terminal_blocks_bind";
  if (bind.reason === "conflicting_provider_id") return "conflicting_provider_id";
  if (bind.reason === "authority_unread") return "authority_unread";
  if (bind.reason === "invalid_provider_id") return "invalid_provider_id";
  return "bind_rejected";
}

/**
 * Models bindAcceptedPrintfulIdentityThenReview with injectable review + authority store.
 * AG-018: fail closed unless bind succeeds — no KV/index/review on conflict/unread.
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

  const emptyFail = (reason) => ({
    record: sentRecord,
    identityPersist: null,
    reviewPersist: null,
    indexed: false,
    bindOk: false,
    bindBlockedByTerminal: reason === "terminal_blocks_bind",
    bindFailureReason: reason,
    alerts,
    events,
    authority,
  });

  const providerId = normalizeAuthorityProviderOrderId(sentRecord.printfulOrderId);
  if (!providerId) return emptyFail("missing_provider_id");

  const current = await authority.get(sessionId);
  if (current.revision === 0) {
    await authority.apply(sessionId, {
      type: "seed_from_kv",
      kvStatus: null,
      printfulOrderId: null,
      now: Date.now(),
    });
  }

  const bind = await authority.apply(sessionId, {
    type: "bind_provider_order_id",
    printfulOrderId: providerId,
    now: Date.now(),
  });
  events.push({ step: "bind", ok: bind.ok, reason: bind.reason });
  if (!bind.ok) {
    return emptyFail(classifyBindFailure(bind));
  }

  events.push({ step: "identity_persist" });
  const identityPersist = await persistPrintOrderRecord(kv, authority, sessionId, sentRecord);
  let indexed = false;
  if (identityPersist.outcome === "persisted" && sentRecord.printfulOrderId) {
    events.push({ step: "index" });
    await kv.set(fulfillmentIndexKey(sentRecord.printfulOrderId), { sessionId });
    indexed = true;
  }

  if (identityPersist.outcome !== "persisted") {
    return {
      record: sentRecord,
      identityPersist,
      reviewPersist: null,
      indexed,
      bindOk: true,
      bindBlockedByTerminal: identityPersist.outcome === "rejected_terminal_failure",
      bindFailureReason:
        identityPersist.outcome === "rejected_terminal_failure" ? "terminal_blocks_bind" : null,
      alerts,
      events,
      authority,
    };
  }

  events.push({ step: "review_start" });
  if (reviewThrow) throw reviewThrow;

  const beforeReview = { ...sentRecord };
  const disposition = summarizePrintfulFileReview(reviewResult);
  let reviewed = sentRecord;
  if (disposition === "failed" && reviewResult) {
    reviewed = { ...sentRecord, error: formatPrintfulFileFailureError(reviewResult) };
    alerts.push({ type: "failure" });
  } else if (disposition === "healthy") {
    // New object (not in-place mutation) so change detection persists approval fields.
    alerts.push({ type: "approval" });
    reviewed = {
      ...sentRecord,
      operatorAlertedAt: Date.now(),
      operatorAlertProvider: "resend",
      operatorAlertError: undefined,
    };
  }

  let reviewPersist = null;
  const annotated =
    beforeReview.error !== reviewed.error ||
    beforeReview.operatorAlertedAt !== reviewed.operatorAlertedAt ||
    beforeReview.operatorAlertProvider !== reviewed.operatorAlertProvider ||
    beforeReview.operatorAlertError !== reviewed.operatorAlertError;
  if (annotated) {
    reviewPersist = await persistPrintOrderRecord(kv, authority, sessionId, reviewed);
  }

  return {
    record: reviewed,
    identityPersist,
    reviewPersist,
    indexed,
    bindOk: true,
    bindBlockedByTerminal: false,
    bindFailureReason: null,
    alerts,
    events,
    authority,
  };
}

/**
 * Models applyPrintfulOrderFailureFromWebhook terminal revision guard (finding 3).
 */
export async function applyTerminalWebhookWithRevisionGuard(input) {
  const {
    sessionId,
    kv,
    authority,
    afterTerminalHook = null,
  } = input;

  const terminal = await authority.apply(sessionId, {
    type: "mark_terminal_failed",
    eventType: "order_failed",
    reason: "x",
    now: Date.now(),
  });
  if (!terminal.ok) {
    return { status: "authority_unread", kvWritten: false };
  }
  const terminalRevision = terminal.state.revision;

  if (afterTerminalHook) {
    await afterTerminalHook({ authority, kv, sessionId, terminalRevision });
  }

  const latest = await authority.get(sessionId);
  if (
    !latest ||
    latest.lifecycle !== "terminal_failed" ||
    latest.revision !== terminalRevision
  ) {
    return {
      status: "ignored",
      reason: "stale_terminal_projection_skipped",
      kvWritten: false,
      terminalRevision,
      latestLifecycle: latest?.lifecycle ?? null,
    };
  }

  await kv.set(printOrderKey(sessionId), { status: "failed", sessionId });
  return { status: "updated", kvWritten: true, terminalRevision };
}

export { createSerializedAuthorityStore, createUnboundAuthorityState, applyPrintOrderAuthorityOp };
