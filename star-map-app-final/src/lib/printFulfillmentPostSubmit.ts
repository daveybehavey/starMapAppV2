import type { PersistPrintOrderResult, PrintOrderRecord } from "@/lib/printOrders";
import { persistPrintOrderRecord } from "@/lib/printOrders";
import { setPrintFulfillmentIndex } from "@/lib/printFulfillmentIndex";
import { sendPrintOrderApprovalAlert, sendPrintOrderFailureAlert } from "@/lib/printOrderAlerts";
import {
  bindPrintProviderOrderId,
  getPrintOrderAuthorityState,
  seedPrintOrderAuthorityFromKv,
} from "@/lib/printOrderAuthority";
import { normalizeAuthorityProviderOrderId } from "@/lib/printOrderAuthorityState";
import {
  formatPrintfulFileFailureError,
  reviewPrintfulOrderFiles,
  summarizePrintfulFileReview,
} from "@/lib/printfulOrderReview";

export type BindAcceptedFailureReason =
  | "terminal_blocks_bind"
  | "conflicting_provider_id"
  | "authority_unread"
  | "missing_provider_id"
  | "invalid_provider_id"
  | "bind_rejected";

/**
 * Optional post-submit file review. Must only run AFTER provider identity is
 * durably bound/mirrored. Confirmed `failed` files get ops annotation + failure alert
 * but do not flip authority/KV to terminal `failed` (authoritative webhooks do).
 * `waiting` / unknown / null review stay pending — no failure or approval alert.
 *
 * Always returns a new object when approval/failure alert fields change so callers
 * can detect annotations without relying on shared-object identity.
 */
export async function applyPrintfulPostSubmitReview(
  sentRecord: PrintOrderRecord,
): Promise<PrintOrderRecord> {
  if (!sentRecord.printfulOrderId) {
    return sentRecord;
  }

  const review = await reviewPrintfulOrderFiles(sentRecord.printfulOrderId);
  const disposition = summarizePrintfulFileReview(review);

  if (disposition === "failed" && review) {
    const failedRecord: PrintOrderRecord = {
      ...sentRecord,
      error: formatPrintfulFileFailureError(review),
    };
    if (!failedRecord.operatorFailureAlertedAt) {
      const alertResult = await sendPrintOrderFailureAlert(failedRecord);
      if (alertResult.delivered) {
        failedRecord.operatorFailureAlertedAt = Date.now();
        failedRecord.operatorFailureAlertProvider = alertResult.provider;
        failedRecord.operatorFailureAlertError = undefined;
      } else {
        failedRecord.operatorFailureAlertProvider = alertResult.provider;
        failedRecord.operatorFailureAlertError = alertResult.error;
      }
    }
    return failedRecord;
  }

  // Pending/unavailable: do not invent failure or approval from incomplete review.
  if (disposition === "pending" || disposition === "unavailable") {
    return sentRecord;
  }

  if (!sentRecord.operatorAlertedAt) {
    const alertResult = await sendPrintOrderApprovalAlert(sentRecord);
    // Return a new record — in-place mutation of sentRecord defeats change detection.
    const approved: PrintOrderRecord = { ...sentRecord };
    if (alertResult.delivered) {
      approved.operatorAlertedAt = Date.now();
      approved.operatorAlertProvider = alertResult.provider;
      approved.operatorAlertError = undefined;
    } else {
      approved.operatorAlertProvider = alertResult.provider;
      approved.operatorAlertError = alertResult.error;
    }
    return approved;
  }

  return sentRecord;
}

function reviewAnnotatedRecord(before: PrintOrderRecord, after: PrintOrderRecord): boolean {
  return (
    before.error !== after.error ||
    before.operatorAlertedAt !== after.operatorAlertedAt ||
    before.operatorAlertProvider !== after.operatorAlertProvider ||
    before.operatorAlertError !== after.operatorAlertError ||
    before.operatorFailureAlertedAt !== after.operatorFailureAlertedAt ||
    before.operatorFailureAlertProvider !== after.operatorFailureAlertProvider ||
    before.operatorFailureAlertError !== after.operatorFailureAlertError
  );
}

function classifyBindFailure(
  bind: { ok: boolean; reason?: string } | { ok: false; reason: string; state: null },
): BindAcceptedFailureReason {
  if ("reason" in bind && bind.reason === "terminal_blocks_bind") return "terminal_blocks_bind";
  if ("reason" in bind && bind.reason === "conflicting_provider_id") return "conflicting_provider_id";
  if ("reason" in bind && bind.reason === "authority_unread") return "authority_unread";
  if ("reason" in bind && bind.reason === "invalid_provider_id") return "invalid_provider_id";
  return "bind_rejected";
}

/**
 * Bind successful Printful identity in the DO, mirror KV + index, THEN optional review.
 * Fail closed unless bind is successful/idempotent — no KV/index/review after conflict
 * or authority-unread. Stale review annotations cannot clear DO terminal failure.
 */
export async function bindAcceptedPrintfulIdentityThenReview(input: {
  sessionId: string;
  sentRecord: PrintOrderRecord;
  existingKv?: PrintOrderRecord | null;
}): Promise<{
  record: PrintOrderRecord;
  identityPersist: PersistPrintOrderResult | null;
  reviewPersist: PersistPrintOrderResult | null;
  indexed: boolean;
  bindOk: boolean;
  bindBlockedByTerminal: boolean;
  bindFailureReason: BindAcceptedFailureReason | null;
}> {
  const { sessionId, sentRecord, existingKv = null } = input;
  const providerId = normalizeAuthorityProviderOrderId(sentRecord.printfulOrderId);

  const emptyFail = (reason: BindAcceptedFailureReason) => ({
    record: sentRecord,
    identityPersist: null as PersistPrintOrderResult | null,
    reviewPersist: null as PersistPrintOrderResult | null,
    indexed: false,
    bindOk: false,
    bindBlockedByTerminal: reason === "terminal_blocks_bind",
    bindFailureReason: reason,
  });

  if (!providerId) {
    return emptyFail("missing_provider_id");
  }

  const current = await getPrintOrderAuthorityState(sessionId);
  if (!current || current.revision === 0) {
    await seedPrintOrderAuthorityFromKv(sessionId, existingKv);
  }

  const bind = await bindPrintProviderOrderId(sessionId, providerId);
  if (!bind.ok) {
    return emptyFail(classifyBindFailure(bind));
  }

  const identityPersist = await persistPrintOrderRecord(sessionId, sentRecord, {
    allowClearTerminalFailure: false,
  });
  let indexed = false;
  if (identityPersist.outcome === "persisted" && sentRecord.printfulOrderId) {
    await setPrintFulfillmentIndex(sentRecord.printfulOrderId, sessionId);
    indexed = true;
  }

  if (identityPersist.outcome === "deleted_unretainable") {
    // Provider accepted and DO bound; index best-effort for webhook correlation.
    if (sentRecord.printfulOrderId) {
      await setPrintFulfillmentIndex(sentRecord.printfulOrderId, sessionId);
      indexed = true;
    }
    return {
      record: sentRecord,
      identityPersist,
      reviewPersist: null,
      indexed,
      bindOk: true,
      bindBlockedByTerminal: false,
      bindFailureReason: null,
    };
  }
  if (identityPersist.outcome === "rejected_terminal_failure") {
    return {
      record: sentRecord,
      identityPersist,
      reviewPersist: null,
      indexed: false,
      bindOk: true,
      bindBlockedByTerminal: true,
      bindFailureReason: "terminal_blocks_bind",
    };
  }

  const beforeReview: PrintOrderRecord = { ...sentRecord };
  const reviewed = await applyPrintfulPostSubmitReview(sentRecord);
  if (!reviewAnnotatedRecord(beforeReview, reviewed)) {
    return {
      record: reviewed,
      identityPersist,
      reviewPersist: null,
      indexed,
      bindOk: true,
      bindBlockedByTerminal: false,
      bindFailureReason: null,
    };
  }

  const reviewPersist = await persistPrintOrderRecord(sessionId, reviewed, {
    allowClearTerminalFailure: false,
  });
  return {
    record: reviewed,
    identityPersist,
    reviewPersist,
    indexed,
    bindOk: true,
    bindBlockedByTerminal: false,
    bindFailureReason: null,
  };
}
