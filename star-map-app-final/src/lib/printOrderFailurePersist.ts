import { kv } from "@/lib/kv";
import {
  isExplicitPrintOrderTerminalEventType,
  persistPrintOrderRecord,
  printOrderKey,
  type PersistPrintOrderResult,
  type PrintOrderRecord,
} from "@/lib/printOrders";
import { sendPrintOrderFailureAlert } from "@/lib/printOrderAlerts";
import { getPrintOrderAuthorityState } from "@/lib/printOrderAuthority";
import type { PrintOrderAuthorityLifecycle } from "@/lib/printOrderAuthorityState";

export type PrintOrderFailurePersistOutcome =
  | {
      persisted: true;
      record: PrintOrderRecord;
      result: PersistPrintOrderResult;
      failureAlertUndelivered: boolean;
    }
  | {
      persisted: false;
      record: PrintOrderRecord;
      reason: "advanced_past_failure";
      failureAlertUndelivered: boolean;
    };

/**
 * S96 follow-up writer audit F-3 + F-11: the ONE failure-persistence
 * path for the Stripe webhook's problem writer and the admin retry's
 * failure writer. Both used to await the failure-alert email and then
 * persist a whole record built from a snapshot taken before long
 * awaits, with no re-read. Because a write whose status is "failed"
 * skips the persist guard entirely, such a write could regress a
 * concurrently fulfilled order to failed — erasing the provider ID,
 * the sent stamp, hold fields, and confirmation state — and could
 * revert a concurrent operator resolution or downgrade a terminal
 * failure's provenance mirror.
 *
 * The pattern is the #497 doctrine, shared: send the alert first
 * (exactly as before), then re-read the latest KV record AND the
 * authority, and refuse the write when the order has advanced past
 * the failure — completed/bound, terminally failed in the authority,
 * resolved by an operator, shipped, hold episode changed, or a
 * different provider identity bound. When the write does land, only
 * the failure-owned fields are merged onto the LATEST record
 * (diagnostics, the progress-only failure-alert stamps, attempts —
 * never regressed), and explicit terminal provenance on the latest
 * record is never cleared by an ordinary failure write.
 */
export async function persistPrintOrderFailureLatestMerged(input: {
  sessionId: string;
  failureRecord: PrintOrderRecord;
}): Promise<PrintOrderFailurePersistOutcome> {
  const { sessionId } = input;
  const failureRecord: PrintOrderRecord = { ...input.failureRecord };

  // Track this pass's own alert attempt for the caller: the Stripe
  // webhook's S96-1 F9 rule (PR #502) keeps the event unfinalized when
  // the alert was attempted but not delivered, and it must survive
  // this helper integration — the alert outcome is therefore part of
  // the result, not just the stamps merged below.
  let failureAlertUndelivered = false;
  if (!failureRecord.operatorFailureAlertedAt) {
    const alertResult = await sendPrintOrderFailureAlert(failureRecord);
    if (alertResult.delivered) {
      failureRecord.operatorFailureAlertedAt = Date.now();
      failureRecord.operatorFailureAlertProvider = alertResult.provider;
      failureRecord.operatorFailureAlertError = undefined;
    } else {
      failureRecord.operatorFailureAlertProvider = alertResult.provider;
      failureRecord.operatorFailureAlertError = alertResult.error;
      failureAlertUndelivered = true;
    }
  }

  const latest = await kv.get<PrintOrderRecord>(printOrderKey(sessionId));
  if (!latest) {
    const result = await persistPrintOrderRecord(sessionId, failureRecord);
    return { persisted: true, record: failureRecord, result, failureAlertUndelivered };
  }

  const authority = await getPrintOrderAuthorityState(sessionId);
  if (failureWriteSuperseded(input.failureRecord, latest, authority?.lifecycle ?? null)) {
    return { persisted: false, record: latest, reason: "advanced_past_failure", failureAlertUndelivered };
  }

  const merged: PrintOrderRecord = {
    ...latest,
    status: failureRecord.status,
    error: failureRecord.error,
    attempts: Math.max(latest.attempts ?? 0, failureRecord.attempts ?? 0),
    // Clear terminal provenance only when the latest record is still
    // ordinary/nonterminal; an explicit terminal mirror is evidence,
    // not a stale marker an ordinary failure may erase.
    terminalEventType: isExplicitPrintOrderTerminalEventType(latest.terminalEventType)
      ? latest.terminalEventType
      : failureRecord.terminalEventType,
  };
  if (failureRecord.webhookStatus !== undefined) {
    merged.webhookStatus = failureRecord.webhookStatus;
  }
  if (failureRecord.printAssetUrl) {
    merged.printAssetUrl = failureRecord.printAssetUrl;
  }
  if (failureRecord.alternateDispatch) {
    merged.alternateDispatch = failureRecord.alternateDispatch;
  }
  // Failure-alert stamps are progress-only: a stamp already recorded
  // on the latest record is never overwritten by this pass's outcome.
  if (!latest.operatorFailureAlertedAt) {
    merged.operatorFailureAlertedAt = failureRecord.operatorFailureAlertedAt;
    merged.operatorFailureAlertProvider = failureRecord.operatorFailureAlertProvider;
    merged.operatorFailureAlertError = failureRecord.operatorFailureAlertError;
  }

  const result = await persistPrintOrderRecord(sessionId, merged);
  return { persisted: true, record: merged, result, failureAlertUndelivered };
}

function failureWriteSuperseded(
  snapshot: PrintOrderRecord,
  latest: PrintOrderRecord,
  lifecycle: PrintOrderAuthorityLifecycle | null,
): boolean {
  if (
    lifecycle === "bound" ||
    lifecycle === "operator_recovered" ||
    lifecycle === "terminal_failed"
  ) {
    return true;
  }
  if (latest.status === "sent") return true;
  if (latest.operatorResolvedAt && !snapshot.operatorResolvedAt) return true;
  if (latest.shippedAt && !snapshot.shippedAt) return true;
  if ((latest.providerHoldAt ?? null) !== (snapshot.providerHoldAt ?? null)) return true;
  const snapshotId = snapshot.printfulOrderId ? String(snapshot.printfulOrderId) : "";
  const latestId = latest.printfulOrderId ? String(latest.printfulOrderId) : "";
  if (snapshotId !== latestId) return true;
  return false;
}
