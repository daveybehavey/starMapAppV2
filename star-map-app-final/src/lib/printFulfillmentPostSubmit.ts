import type { PersistPrintOrderResult, PrintOrderRecord } from "@/lib/printOrders";
import {
  persistPrintOrderRecord,
  preserveLatestHoldAnnotations,
  printOrderKey,
} from "@/lib/printOrders";
import { kv } from "@/lib/kv";
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
  const now = Date.now();

  if (disposition === "failed" && review) {
    const failedRecord: PrintOrderRecord = {
      ...sentRecord,
      error: formatPrintfulFileFailureError(review),
      // S96-1 F3: the review resolved — stamp it and close any pending
      // episode so the review sweep never revisits this order.
      fileReviewState: "failed",
      fileReviewCheckedAt: now,
      fileReviewPendingSince: undefined,
      fileReviewPendingAlertedAt: undefined,
      fileReviewPendingAlertError: undefined,
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

  // Pending/unavailable: do not invent failure or approval from incomplete
  // review — but DO stamp the state (S96-1 F3). Returning the record
  // unchanged used to make a pending review indistinguishable from a
  // resolved one, and nothing ever looked again; the stamp is what the
  // scheduled review sweep revisits. The pending-since is preserved
  // across re-checks so the aging clock measures the episode.
  if (disposition === "pending" || disposition === "unavailable") {
    return {
      ...sentRecord,
      fileReviewState: "pending",
      fileReviewCheckedAt: now,
      fileReviewPendingSince: sentRecord.fileReviewPendingSince ?? now,
    };
  }

  const healthyRecord: PrintOrderRecord = {
    ...sentRecord,
    fileReviewState: "healthy",
    fileReviewCheckedAt: now,
    fileReviewPendingSince: undefined,
    fileReviewPendingAlertedAt: undefined,
    fileReviewPendingAlertError: undefined,
  };

  if (!sentRecord.operatorAlertedAt) {
    const alertResult = await sendPrintOrderApprovalAlert(healthyRecord);
    // Return a new record — in-place mutation of sentRecord defeats change detection.
    const approved: PrintOrderRecord = { ...healthyRecord };
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

  return healthyRecord;
}

/**
 * S96-1 F8: apply a review outcome onto the CURRENT stored record,
 * carrying only the fields the review owns. Review writers used to
 * persist a spread of the pre-send snapshot (hold-annotation sync
 * excepted), so any field another writer landed during the Printful
 * review call — a shipment fact, a resolve, a newer annotation — was
 * silently reverted. Starting from `current` preserves all of it; the
 * review-owned fields are then applied as progress:
 * - the review stamps move to the reviewed state, except that NO
 *   standing state (resolved or pending) is regressed by a STALE
 *   review: an outcome older than the standing review stamp applies
 *   none of its review fields (a fresher outcome may supersede —
 *   the checkedAt stamps decide), and a pending episode keeps its
 *   earliest pending-since. A stale outcome's DELIVERED alert
 *   stamps are still reconciled — they evidence a send, and losing
 *   one would re-send the alert on a later tick;
 * - the failure `error` is written only by a failed review;
 * - operator alert stamps are set only when the current record lacks
 *   them (a delivered stamp is never replaced by a later failure).
 * Returns null when the record no longer describes the reviewed order
 * in `sent` (terminal projection, shipment, different bound id, or a
 * conflicting resolution) — the caller must not write at all.
 * The review sweep's runtime persists through this same merge.
 */
export function applyReviewOutcomeToCurrent(
  current: PrintOrderRecord | null | undefined,
  reviewed: PrintOrderRecord,
): PrintOrderRecord | null {
  if (!current) return null;
  if (current.status !== "sent" || current.shippedAt) return null;
  if (
    normalizeAuthorityProviderOrderId(current.printfulOrderId) !==
    normalizeAuthorityProviderOrderId(reviewed.printfulOrderId)
  ) {
    return null;
  }
  // Gate round 6 (bot P2 on PR #502): a stale (or unstamped)
  // resolved-to-different outcome no longer returns null here. That
  // early return fired BEFORE the stale-outcome alert reconciliation
  // below, so a delayed healthy outcome carrying a delivered approval
  // stamp over a newer failed resolution lost the stamp — the failed
  // record stayed sweep-eligible and a later healthy lookup re-sent
  // the approval email. The refusal now folds into `outcomeStale`:
  // the outcome applies none of its review fields, its delivered
  // alert stamps are still reconciled (they evidence a send), and
  // the merge returns null only when nothing reconciled — the same
  // contract as the round-5 stale path.
  let resolutionRefused = false;
  if (
    (current.fileReviewState === "healthy" || current.fileReviewState === "failed") &&
    reviewed.fileReviewState !== current.fileReviewState
  ) {
    // A resolution may be SUPERSEDED by a later review of the same
    // order — the sweep exists to re-check failed files, and files do
    // get corrected — but never by a STALE one. Freshness is the
    // review stamp: both records must carry one and the incoming
    // outcome must be at least as fresh as the standing resolution.
    // (Before this, every resolved-to-different transition was
    // rejected, which lost a delivered approval alert's stamp when a
    // corrected order turned healthy: the merge returned null, the
    // stamp never persisted, and every later tick re-sent the
    // approval email — Codex P2 on PR #502.)
    if (
      reviewed.fileReviewCheckedAt == null ||
      current.fileReviewCheckedAt == null ||
      reviewed.fileReviewCheckedAt < current.fileReviewCheckedAt
    ) {
      resolutionRefused = true;
    }
  }
  // Gate round 5 (local Codex seat P2-C): the freshness rule above
  // guards only resolutions (a resolved standing state). An outcome
  // older than the standing review stamp must not move ANY standing
  // state: a delayed healthy outcome resuming behind a newer pending
  // re-check otherwise replaced the newer state, cleared the
  // episode's error and undelivered-alert residue, and stamped an
  // approval that removed the order from sweep candidacy — and a
  // same-state outcome could move fileReviewCheckedAt backward. A
  // stale outcome therefore applies none of its review fields; its
  // delivered alert stamps are still reconciled further down.
  const outcomeStale =
    resolutionRefused ||
    (reviewed.fileReviewState != null &&
      current.fileReviewCheckedAt != null &&
      reviewed.fileReviewCheckedAt != null &&
      reviewed.fileReviewCheckedAt < current.fileReviewCheckedAt);
  const next: PrintOrderRecord = { ...current };
  if (!outcomeStale && reviewed.fileReviewState) {
    next.fileReviewState = reviewed.fileReviewState;
    next.fileReviewCheckedAt = reviewed.fileReviewCheckedAt;
    if (reviewed.fileReviewState === "pending") {
      next.fileReviewPendingSince =
        current.fileReviewPendingSince ?? reviewed.fileReviewPendingSince;
      if (!current.fileReviewPendingAlertedAt && reviewed.fileReviewPendingAlertedAt) {
        next.fileReviewPendingAlertedAt = reviewed.fileReviewPendingAlertedAt;
        next.fileReviewPendingAlertError = undefined;
      } else if (
        !current.fileReviewPendingAlertedAt &&
        !current.fileReviewPendingAlertError &&
        reviewed.fileReviewPendingAlertError
      ) {
        next.fileReviewPendingAlertError = reviewed.fileReviewPendingAlertError;
      }
    } else {
      next.fileReviewPendingSince = undefined;
      next.fileReviewPendingAlertedAt = undefined;
      next.fileReviewPendingAlertError = undefined;
    }
  }
  if (!outcomeStale && reviewed.fileReviewState === "failed" && reviewed.error) {
    next.error = reviewed.error;
  }
  if (!current.operatorAlertedAt && reviewed.operatorAlertedAt) {
    next.operatorAlertedAt = reviewed.operatorAlertedAt;
    next.operatorAlertProvider = reviewed.operatorAlertProvider;
    next.operatorAlertError = undefined;
  } else if (
    !current.operatorAlertedAt &&
    !current.operatorAlertError &&
    reviewed.operatorAlertError
  ) {
    next.operatorAlertProvider = reviewed.operatorAlertProvider;
    next.operatorAlertError = reviewed.operatorAlertError;
  }
  if (!current.operatorFailureAlertedAt && reviewed.operatorFailureAlertedAt) {
    next.operatorFailureAlertedAt = reviewed.operatorFailureAlertedAt;
    next.operatorFailureAlertProvider = reviewed.operatorFailureAlertProvider;
    next.operatorFailureAlertError = undefined;
  } else if (
    !current.operatorFailureAlertedAt &&
    !current.operatorFailureAlertError &&
    reviewed.operatorFailureAlertError
  ) {
    next.operatorFailureAlertProvider = reviewed.operatorFailureAlertProvider;
    next.operatorFailureAlertError = reviewed.operatorFailureAlertError;
  }
  if (
    !outcomeStale &&
    reviewed.fileReviewState === "healthy" &&
    (current.fileReviewState === "failed" || current.fileReviewState === "pending")
  ) {
    // A healthy outcome closes the review episode — including when a
    // pending re-check landed in between (failed -> pending ->
    // healthy), where the standing state at this merge is `pending`
    // and a failed-only cleanup would never run (Codex P2 on
    // PR #502). The failed episode's file-failure error and its
    // UNDELIVERED failure-alert residue do not carry into the healthy
    // record. Delivered stamps are history and stay: the approval
    // stamp merged above (it is what stops the next sweep tick from
    // re-sending the approval email) and a delivered failure alert's.
    // The error clear is prefix-scoped to the file-review failure
    // format so an unrelated error on the record is never erased.
    if (typeof next.error === "string" && next.error.startsWith("printful_files_failed")) {
      next.error = undefined;
    }
    if (!next.operatorFailureAlertedAt) {
      next.operatorFailureAlertError = undefined;
      next.operatorFailureAlertProvider = undefined;
    }
  }
  if (outcomeStale) {
    // Only the alert-stamp reconciliation above may survive a stale
    // outcome; if it changed nothing, the outcome is refused whole.
    const alertReconciled =
      next.operatorAlertedAt !== current.operatorAlertedAt ||
      next.operatorAlertProvider !== current.operatorAlertProvider ||
      next.operatorAlertError !== current.operatorAlertError ||
      next.operatorFailureAlertedAt !== current.operatorFailureAlertedAt ||
      next.operatorFailureAlertProvider !== current.operatorFailureAlertProvider ||
      next.operatorFailureAlertError !== current.operatorFailureAlertError;
    if (!alertReconciled) return null;
  }
  return next;
}

function reviewAnnotatedRecord(before: PrintOrderRecord, after: PrintOrderRecord): boolean {
  return (
    before.error !== after.error ||
    before.operatorAlertedAt !== after.operatorAlertedAt ||
    before.operatorAlertProvider !== after.operatorAlertProvider ||
    before.operatorAlertError !== after.operatorAlertError ||
    before.operatorFailureAlertedAt !== after.operatorFailureAlertedAt ||
    before.operatorFailureAlertProvider !== after.operatorFailureAlertProvider ||
    before.operatorFailureAlertError !== after.operatorFailureAlertError ||
    before.fileReviewState !== after.fileReviewState ||
    before.fileReviewCheckedAt !== after.fileReviewCheckedAt ||
    before.fileReviewPendingSince !== after.fileReviewPendingSince ||
    before.fileReviewPendingAlertedAt !== after.fileReviewPendingAlertedAt ||
    before.fileReviewPendingAlertError !== after.fileReviewPendingAlertError
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

  // A provider hold can be recorded by the Printful webhook at any
  // moment after the provider order exists — including during this
  // helper's awaits. Both persists below therefore re-read the stored
  // record and carry its hold annotations over the (older) snapshot
  // being written, so a recorded hold is never erased by a post-submit
  // write (the aging sweep keys off those stamps).
  const identityRecord = preserveLatestHoldAnnotations(
    sentRecord,
    await kv.get<PrintOrderRecord>(printOrderKey(sessionId)),
  );
  const identityPersist = await persistPrintOrderRecord(sessionId, identityRecord, {
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
      record: identityRecord,
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
      record: identityRecord,
      identityPersist,
      reviewPersist: null,
      indexed: false,
      bindOk: true,
      bindBlockedByTerminal: true,
      bindFailureReason: "terminal_blocks_bind",
    };
  }

  const beforeReview: PrintOrderRecord = { ...identityRecord };
  const reviewed = await applyPrintfulPostSubmitReview(identityRecord);
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

  // S96-1 F8: persist the review outcome by merging its owned fields
  // onto the FRESHEST record, not by spreading the reviewed snapshot —
  // a concurrent writer's fields (shipment, resolve, annotations)
  // landing during the review call survive. Hold annotations need no
  // special carry here: starting from the current record preserves
  // them by construction. When the merge refuses (the record moved to
  // a terminal projection, shipped, or a different bound id), nothing
  // is written and the fresh record is what callers see. Only when the
  // fresh read itself is unavailable does the previous hold-sync
  // snapshot write remain as the fallback.
  const freshReview = await kv.get<PrintOrderRecord>(printOrderKey(sessionId));
  const mergedReviewed = applyReviewOutcomeToCurrent(freshReview, reviewed);
  if (freshReview && !mergedReviewed) {
    return {
      record: freshReview,
      identityPersist,
      reviewPersist: null,
      indexed,
      bindOk: true,
      bindBlockedByTerminal: false,
      bindFailureReason: null,
    };
  }
  const preservedReviewed =
    mergedReviewed ?? preserveLatestHoldAnnotations(reviewed, freshReview);
  const reviewPersist = await persistPrintOrderRecord(sessionId, preservedReviewed, {
    allowClearTerminalFailure: false,
  });
  return {
    record: preservedReviewed,
    identityPersist,
    reviewPersist,
    indexed,
    bindOk: true,
    bindBlockedByTerminal: false,
    bindFailureReason: null,
  };
}
