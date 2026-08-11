/**
 * In-memory coordinator + post-submit style flows for deterministic scenario tests.
 */
import {
  applyHealthyTransition,
  applyPendingFilesTransition,
  applyTerminalFailureTransition,
  beginFailureAlertClaimTransition,
  buildPrintOrderCoordinatorObjectName,
  buildPrintOrderFailureAlertResendIdempotencyKey,
  completeFailureAlertDeliveredTransition,
  completeFailureAlertRetryableErrorTransition,
  createUninitializedCoordinatorState,
  overlayCoordinatorOntoPrintOrderRecord,
  shouldBlockHealthyKvMirrorWrite,
} from "./printOrderCoordinator.harness.mjs";
import {
  resolvePrintfulFileReviewOutcome,
  resolvePrintfulPostSubmitFileOutcome,
} from "./printfulOrderReview.harness.mjs";

export function createMemoryCoordinator() {
  const map = new Map();
  const key = (sessionId) => buildPrintOrderCoordinatorObjectName(sessionId);
  return {
    async get(sessionId, nowMs = Date.now()) {
      return {
        ok: true,
        state: map.get(key(sessionId)) ?? createUninitializedCoordinatorState(sessionId, nowMs),
      };
    },
    async recordTerminalFailure(input) {
      const nowMs = input.nowMs ?? Date.now();
      let state = map.get(key(input.sessionId)) ?? createUninitializedCoordinatorState(input.sessionId, nowMs);
      state = applyTerminalFailureTransition(state, input);
      map.set(key(input.sessionId), state);
      return { ok: true, state };
    },
    async recordHealthy(input) {
      const nowMs = input.nowMs ?? Date.now();
      let state = map.get(key(input.sessionId)) ?? createUninitializedCoordinatorState(input.sessionId, nowMs);
      const result = applyHealthyTransition(state, input);
      map.set(key(input.sessionId), result.state);
      return { ok: true, state: result.state, reason: result.ok ? undefined : result.reason };
    },
    async recordPendingFiles(input) {
      const nowMs = input.nowMs ?? Date.now();
      let state = map.get(key(input.sessionId)) ?? createUninitializedCoordinatorState(input.sessionId, nowMs);
      const result = applyPendingFilesTransition(state, input);
      map.set(key(input.sessionId), result.state);
      return { ok: true, state: result.state, reason: result.ok ? undefined : result.reason };
    },
    async beginFailureAlertClaim(input) {
      const nowMs = input.nowMs ?? Date.now();
      let state = map.get(key(input.sessionId)) ?? createUninitializedCoordinatorState(input.sessionId, nowMs);
      const result = beginFailureAlertClaimTransition(state, input);
      if (result.ok) map.set(key(input.sessionId), result.state);
      return result;
    },
    async completeDelivered(input) {
      const nowMs = input.nowMs ?? Date.now();
      let state = map.get(key(input.sessionId)) ?? createUninitializedCoordinatorState(input.sessionId, nowMs);
      state = completeFailureAlertDeliveredTransition(state, input);
      map.set(key(input.sessionId), state);
      return { ok: true, state };
    },
    async completeRetryable(input) {
      const nowMs = input.nowMs ?? Date.now();
      let state = map.get(key(input.sessionId)) ?? createUninitializedCoordinatorState(input.sessionId, nowMs);
      state = completeFailureAlertRetryableErrorTransition(state, input);
      map.set(key(input.sessionId), state);
      return { ok: true, state };
    },
  };
}

/**
 * Simulate post-submit + optional concurrent webhook using coordinator authority.
 */
export async function simulatePostSubmitWithCoordinator(input) {
  const store = input.store;
  const sessionId = input.sessionId;
  const { outcome, review } = await resolvePrintfulPostSubmitFileOutcome({
    printfulOrderId: input.printfulOrderId,
    reviewPrintfulOrderFiles: input.reviewPrintfulOrderFiles,
    preservePendingOnUnavailable: Boolean(input.preservePendingOnUnavailable),
    maxAttempts: input.maxAttempts ?? 3,
    retryDelaysMs: input.retryDelaysMs ?? [0, 0],
    sleep: async () => undefined,
  });

  if (input.webhookFailureFirst) {
    await store.recordTerminalFailure({
      sessionId,
      error: input.webhookFailureFirst,
      source: "printful_webhook",
      printfulOrderId: input.printfulOrderId,
      nowMs: input.nowMs ?? Date.now(),
    });
  }

  const current = await store.get(sessionId);
  if (current.state.authorityStatus === "failed") {
    return { recordStatus: "failed", outcome, state: current.state, review };
  }

  if (outcome === "failed") {
    const recorded = await store.recordTerminalFailure({
      sessionId,
      error: "printful_files_failed",
      source: "post_submit_files",
      printfulOrderId: input.printfulOrderId,
    });
    return { recordStatus: "failed", outcome, state: recorded.state, review };
  }

  if (outcome === "pending") {
    const pending = await store.recordPendingFiles({
      sessionId,
      printfulOrderId: input.printfulOrderId,
    });
    return { recordStatus: "pending_files", outcome, state: pending.state, review };
  }

  const healthy = await store.recordHealthy({
    sessionId,
    printfulOrderId: input.printfulOrderId,
  });
  if (healthy.state.authorityStatus === "failed" || healthy.reason === "terminal_failed") {
    return { recordStatus: "failed", outcome, state: healthy.state, review };
  }
  return { recordStatus: "healthy", outcome, state: healthy.state, review };
}

export async function simulateAlertDelivery(store, sessionId, providerFn) {
  const claim = await store.beginFailureAlertClaim({ sessionId, claimOwner: "test" });
  if (!claim.claimed) return { claim, send: null };
  const send = await providerFn(claim.idempotencyKey);
  if (send.delivered) {
    await store.completeDelivered({ sessionId, provider: "resend" });
  } else {
    await store.completeRetryable({
      sessionId,
      provider: "resend",
      error: send.errorCode || send.error,
    });
  }
  return { claim, send, state: (await store.get(sessionId)).state };
}

export {
  buildPrintOrderFailureAlertResendIdempotencyKey,
  overlayCoordinatorOntoPrintOrderRecord,
  resolvePrintfulFileReviewOutcome,
  shouldBlockHealthyKvMirrorWrite,
};
