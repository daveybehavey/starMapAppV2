import type { PersistPrintOrderResult, PrintOrderRecord } from "@/lib/printOrders";
import { persistPrintOrderRecord } from "@/lib/printOrders";
import { setPrintFulfillmentIndex } from "@/lib/printFulfillmentIndex";
import { sendPrintOrderApprovalAlert, sendPrintOrderFailureAlert } from "@/lib/printOrderAlerts";
import {
  formatPrintfulFileFailureError,
  reviewPrintfulOrderFiles,
  summarizePrintfulFileReview,
} from "@/lib/printfulOrderReview";

/**
 * Optional post-submit file review. Must only run AFTER provider identity is
 * durably persisted. Confirmed `failed` files get ops annotation + failure alert
 * but do not flip KV `status` to terminal `failed` (authoritative webhooks do).
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
 * Persist successful Printful identity (+ fulfillment index) BEFORE any optional
 * file-status review/alerts. Review annotations may re-persist afterward, but a
 * soft terminal-failure guard refuses to clear a known `failed` status.
 */
export async function persistAcceptedPrintfulIdentityThenReview(input: {
  sessionId: string;
  sentRecord: PrintOrderRecord;
}): Promise<{
  record: PrintOrderRecord;
  identityPersist: PersistPrintOrderResult;
  reviewPersist: PersistPrintOrderResult | null;
  indexed: boolean;
}> {
  const { sessionId, sentRecord } = input;

  const identityPersist = await persistPrintOrderRecord(sessionId, sentRecord);
  let indexed = false;
  if (sentRecord.printfulOrderId) {
    await setPrintFulfillmentIndex(sentRecord.printfulOrderId, sessionId);
    indexed = true;
  }

  if (identityPersist.outcome === "deleted_unretainable") {
    return { record: sentRecord, identityPersist, reviewPersist: null, indexed };
  }

  // Soft guard rejected a stale nonterminal write over an existing terminal failure.
  // Do not run review/alerts that could claim approval over that terminal state.
  if (identityPersist.outcome === "rejected_terminal_failure") {
    return { record: sentRecord, identityPersist, reviewPersist: null, indexed };
  }

  if (!sentRecord.printfulOrderId) {
    return { record: sentRecord, identityPersist, reviewPersist: null, indexed };
  }

  const reviewed = await applyPrintfulPostSubmitReview(sentRecord);
  if (!reviewAnnotatedRecord(sentRecord, reviewed)) {
    return { record: reviewed, identityPersist, reviewPersist: null, indexed };
  }

  const reviewPersist = await persistPrintOrderRecord(sessionId, reviewed);
  return { record: reviewed, identityPersist, reviewPersist, indexed };
}
