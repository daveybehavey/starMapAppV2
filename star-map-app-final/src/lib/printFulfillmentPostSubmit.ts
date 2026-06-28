import type { PrintOrderRecord } from "@/lib/printOrders";
import { sendPrintOrderApprovalAlert, sendPrintOrderFailureAlert } from "@/lib/printOrderAlerts";
import {
  formatPrintfulFileFailureError,
  reviewPrintfulOrderFiles,
} from "@/lib/printfulOrderReview";

export async function applyPrintfulPostSubmitReview(
  sentRecord: PrintOrderRecord,
): Promise<PrintOrderRecord> {
  if (!sentRecord.printfulOrderId) {
    return sentRecord;
  }

  const review = await reviewPrintfulOrderFiles(sentRecord.printfulOrderId);
  if (review?.failedFiles.length) {
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
