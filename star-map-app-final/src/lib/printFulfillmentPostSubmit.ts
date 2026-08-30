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

/**
 * Optional post-submit file review. Must only run AFTER provider identity is
 * durably bound/mirrored. Confirmed `failed` files get ops annotation + failure alert
 * but do not flip authority/KV to terminal `failed` (authoritative webhooks do).
 * `waiting` / unknown / null review stay pending — no failure or approval alert.
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
    if (alertResult.delivered) {
      sentRecord.operatorAlertedAt = Date.now();
      sentRecord.operatorAlertProvider = alertResult.provider;
      sentRecord.operatorAlertError = undefined;
    } else {
      sentRecord.operatorAlertProvider = alertResult.provider;
      sentRecord.operatorAlertError = alertResult.error;
    }
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

/**
 * Bind successful Printful identity in the DO, mirror KV + index, THEN optional review.
 * Stale review annotations cannot clear DO terminal failure (mirror guard).
 */
export async function bindAcceptedPrintfulIdentityThenReview(input: {
  sessionId: string;
  sentRecord: PrintOrderRecord;
  existingKv?: PrintOrderRecord | null;
}): Promise<{
  record: PrintOrderRecord;
  identityPersist: PersistPrintOrderResult;
  reviewPersist: PersistPrintOrderResult | null;
  indexed: boolean;
  bindOk: boolean;
  bindBlockedByTerminal: boolean;
}> {
  const { sessionId, sentRecord, existingKv = null } = input;
  const providerId = normalizeAuthorityProviderOrderId(sentRecord.printfulOrderId);

  const current = await getPrintOrderAuthorityState(sessionId);
  if (!current || current.revision === 0) {
    await seedPrintOrderAuthorityFromKv(sessionId, existingKv);
  }

  let bindOk = false;
  let bindBlockedByTerminal = false;
  if (providerId) {
    const bind = await bindPrintProviderOrderId(sessionId, providerId);
    if (bind.ok) {
      bindOk = true;
    } else if ("reason" in bind && bind.reason === "terminal_blocks_bind") {
      bindBlockedByTerminal = true;
    }
  }

  const identityPersist = await persistPrintOrderRecord(sessionId, sentRecord, {
    allowClearTerminalFailure: false,
  });
  let indexed = false;
  if (sentRecord.printfulOrderId) {
    await setPrintFulfillmentIndex(sentRecord.printfulOrderId, sessionId);
    indexed = true;
  }

  if (identityPersist.outcome === "deleted_unretainable") {
    return { record: sentRecord, identityPersist, reviewPersist: null, indexed, bindOk, bindBlockedByTerminal };
  }
  if (identityPersist.outcome === "rejected_terminal_failure" || bindBlockedByTerminal) {
    return { record: sentRecord, identityPersist, reviewPersist: null, indexed, bindOk, bindBlockedByTerminal };
  }
  if (!providerId) {
    return { record: sentRecord, identityPersist, reviewPersist: null, indexed, bindOk, bindBlockedByTerminal };
  }

  const reviewed = await applyPrintfulPostSubmitReview(sentRecord);
  if (!reviewAnnotatedRecord(sentRecord, reviewed)) {
    return { record: reviewed, identityPersist, reviewPersist: null, indexed, bindOk, bindBlockedByTerminal };
  }

  const reviewPersist = await persistPrintOrderRecord(sessionId, reviewed, {
    allowClearTerminalFailure: false,
  });
  return { record: reviewed, identityPersist, reviewPersist, indexed, bindOk, bindBlockedByTerminal };
}
