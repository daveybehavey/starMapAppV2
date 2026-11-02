/**
 * S96-1 F3: revisit sweep for post-submit Printful file reviews that
 * could not resolve at submission time.
 *
 * applyPrintfulPostSubmitReview runs exactly once, synchronously, after
 * a Printful submit. When Printful is still processing the files (or
 * the review call is unavailable) it now stamps the record
 * `fileReviewState: "pending"` — before S96-1 F3 it returned the record
 * untouched, so a pending review was indistinguishable from a resolved
 * one and nothing ever looked again: a file Printful later rejected
 * produced no failure alert, and a file that cleared produced no
 * approval alert. This sweep is the missing revisit: on the Worker's
 * existing 15-minute cron it re-runs the review for pending orders,
 * records the resolution (the review itself sends the approval/failure
 * alert), and sends ONE operator alert when a review stays pending
 * past the configured threshold.
 *
 * Records written before the stamps existed carry no fileReviewState;
 * for those the sweep derives candidacy from the submit age (past a
 * grace window, so an in-flight submission's own one-shot review is
 * never raced) plus the absence of any recorded review resolution.
 *
 * The engine is dependency-light (store + review + sender injected) so
 * it is unit-testable against this real source; the scheduled wiring
 * lives in printOrderReviewSweepRuntime.ts, following
 * printOrderHoldSweepRuntime.ts.
 */
import type { PrintOrderRecord } from "@/lib/printOrders";
import type { PrintOrderAlertResult } from "@/lib/printOrderAlerts";

export const PRINT_ORDER_KEY_PREFIX = "print:order:";
export const DEFAULT_PRINT_ORDER_REVIEW_PENDING_ALERT_HOURS = 24;
/**
 * How long after submission an UNSTAMPED (pre-S96-1 F3) record must age
 * before the sweep treats it as a missed review. The one-shot review
 * runs synchronously inside the submit request, so 15 minutes is far
 * past any in-flight pass while still revisiting stalled orders
 * promptly on the day they were placed.
 */
export const PRINT_ORDER_REVIEW_LEGACY_GRACE_MS = 15 * 60 * 1000;

export type PrintOrderReviewSweepConfig = {
  enabled: boolean;
  pendingAlertThresholdMs: number;
};

/**
 * Pure config snapshot from an env record (the scheduled path never
 * assumes process.env — the runtime snapshots the Worker bindings).
 * The sweep is INERT unless PRINT_ORDER_REVIEW_SWEEP_ENABLED is exactly
 * "true" (dashboard-owned activation, deliberately not in wrangler.toml
 * [vars] — the same posture as the hold sweep).
 */
export function resolvePrintOrderReviewSweepConfig(
  env: Record<string, string | undefined>,
): PrintOrderReviewSweepConfig {
  const enabled = (env.PRINT_ORDER_REVIEW_SWEEP_ENABLED ?? "").trim() === "true";
  const parsedHours = Number.parseFloat(env.PRINT_ORDER_REVIEW_PENDING_ALERT_HOURS ?? "");
  const hours =
    Number.isFinite(parsedHours) && parsedHours > 0
      ? parsedHours
      : DEFAULT_PRINT_ORDER_REVIEW_PENDING_ALERT_HOURS;
  return { enabled, pendingAlertThresholdMs: Math.round(hours * 60 * 60 * 1000) };
}

export type PrintOrderReviewSweepStore = {
  listKeys(
    prefix: string,
    cursor?: string,
  ): Promise<{ names: string[]; cursor: string | null; complete: boolean }>;
  getJson<T>(key: string): Promise<T | null>;
  /**
   * Persist a reviewed record. Implementations must preserve the
   * record's creation-anchored KV retention (see
   * printOrderReviewSweepRuntime.ts) and must apply the review outcome
   * as a merge onto the CURRENT stored record
   * (applyReviewOutcomeToCurrent) — the scanned snapshot may be stale.
   * "skipped" means nothing was written.
   */
  persistRecord(
    sessionId: string,
    record: PrintOrderRecord,
  ): Promise<{ outcome: "persisted" } | { outcome: "skipped"; reason: string }>;
};

export type PrintOrderReviewSweepSummary = {
  enabled: boolean;
  scanned: number;
  candidates: number;
  resolvedHealthy: number;
  resolvedFailed: number;
  stillPending: number;
  pendingAlertsSent: number;
  pendingAlertFailures: number;
  writesSkipped: number;
  authoritySkips: number;
  errors: number;
};

export type PrintOrderReviewSweepAuthorityGate = (
  sessionId: string,
) => Promise<"ok" | "terminal" | "unread">;

/**
 * The one candidacy decision the sweep makes per record. Only a `sent`,
 * unshipped order with a bound Printful id can have an outstanding
 * file review. A stamped record is a candidate exactly while its state
 * is "pending". A resolved record stays a candidate until the
 * resolving review's operator alert is delivered (approval stamp for
 * healthy, failure stamp for failed): the resolution alert is part of
 * what the revisit exists to guarantee, and a provider outage at the
 * resolving tick must not drop it permanently. An unstamped (legacy)
 * record is a candidate only when the submit is older than the grace
 * window AND no review resolution is recorded on it — a files-failed
 * error or a delivered approval alert means the one-shot review DID
 * resolve, stamp or no stamp.
 */
export function printOrderReviewSweepCandidate(
  record: PrintOrderRecord | null | undefined,
  now: number,
): boolean {
  if (!record) return false;
  if (record.status !== "sent" || record.shippedAt) return false;
  if (!record.printfulOrderId) return false;
  if (record.fileReviewState === "pending") return true;
  if (record.fileReviewState === "failed") {
    // Resolved, but the operator failure alert has not been delivered:
    // stay eligible so a later tick re-runs the review, which retries
    // the alert (it fires only while its stamp is unset). The file
    // disposition itself is NOT treated as pending again — the merge
    // in the persist path refuses to regress a resolved state.
    return !record.operatorFailureAlertedAt;
  }
  if (record.fileReviewState === "healthy") {
    return !record.operatorAlertedAt;
  }
  if (record.error?.startsWith("printful_files_failed")) return false;
  if (record.operatorAlertedAt) return false;
  return (
    typeof record.sentAt === "number" &&
    Number.isFinite(record.sentAt) &&
    now - record.sentAt >= PRINT_ORDER_REVIEW_LEGACY_GRACE_MS
  );
}

function emptySummary(enabled: boolean): PrintOrderReviewSweepSummary {
  return {
    enabled,
    scanned: 0,
    candidates: 0,
    resolvedHealthy: 0,
    resolvedFailed: 0,
    stillPending: 0,
    pendingAlertsSent: 0,
    pendingAlertFailures: 0,
    writesSkipped: 0,
    authoritySkips: 0,
    errors: 0,
  };
}

/**
 * Total over per-record failures (one bad record never stops the scan);
 * a store listing failure propagates to the caller's guard, mirroring
 * the hold sweep and the review-request tick.
 */
export async function runPrintOrderReviewSweep(deps: {
  store: PrintOrderReviewSweepStore;
  config: PrintOrderReviewSweepConfig;
  now?: () => number;
  /**
   * Re-run the post-submit review for one record (the runtime binds
   * applyPrintfulPostSubmitReview, which stamps the outcome and sends
   * the approval/failure alert on resolution).
   */
  reviewOrder: (record: PrintOrderRecord) => Promise<PrintOrderRecord>;
  /** One-shot operator alert for a review pending past the threshold. */
  sendReviewPendingAlert: (record: PrintOrderRecord) => Promise<PrintOrderAlertResult>;
  /**
   * Authority check BEFORE any review or alert for a record. The
   * scanned KV record is a projection: a terminal failure committed in
   * the authority while its KV projection lags must not be reviewed or
   * alerted as a live order. "terminal" and "unread" both skip the
   * record for this tick; the persist-side guard in the runtime store
   * stays as the second line for transitions landing mid-review.
   */
  authorityGate?: PrintOrderReviewSweepAuthorityGate;
  log?: (summary: PrintOrderReviewSweepSummary) => void;
}): Promise<PrintOrderReviewSweepSummary> {
  const summary = emptySummary(deps.config.enabled);
  if (!deps.config.enabled) {
    deps.log?.(summary);
    return summary;
  }
  const now = deps.now ?? Date.now;

  let cursor: string | undefined;
  let complete = false;
  while (!complete) {
    const page = await deps.store.listKeys(PRINT_ORDER_KEY_PREFIX, cursor);
    for (const key of page.names) {
      summary.scanned += 1;
      try {
        const record = await deps.store.getJson<PrintOrderRecord>(key);
        if (!printOrderReviewSweepCandidate(record, now()) || !record) continue;
        summary.candidates += 1;

        if (deps.authorityGate) {
          const gate = await deps.authorityGate(record.sessionId);
          if (gate !== "ok") {
            summary.authoritySkips += 1;
            continue;
          }
        }

        const reviewed = await deps.reviewOrder(record);
        let outgoing = reviewed;
        if (reviewed.fileReviewState === "failed") {
          summary.resolvedFailed += 1;
        } else if (reviewed.fileReviewState === "healthy") {
          summary.resolvedHealthy += 1;
        } else {
          // Still pending (or, defensively, an unstamped outcome): the
          // aging alert fires once per pending episode, measured from
          // the episode's first observation.
          summary.stillPending += 1;
          const pendingSince = reviewed.fileReviewPendingSince ?? reviewed.sentAt ?? now();
          if (
            !reviewed.fileReviewPendingAlertedAt &&
            now() - pendingSince >= deps.config.pendingAlertThresholdMs
          ) {
            const alertResult = await deps.sendReviewPendingAlert(reviewed);
            if (alertResult.delivered) {
              summary.pendingAlertsSent += 1;
              outgoing = {
                ...reviewed,
                fileReviewPendingAlertedAt: now(),
                fileReviewPendingAlertError: undefined,
              };
            } else {
              summary.pendingAlertFailures += 1;
              outgoing = {
                ...reviewed,
                fileReviewPendingAlertError: alertResult.error,
              };
            }
          }
        }

        const persisted = await deps.store.persistRecord(record.sessionId, outgoing);
        if (persisted.outcome !== "persisted") summary.writesSkipped += 1;
      } catch {
        summary.errors += 1;
      }
    }
    complete = page.complete;
    cursor = page.cursor ?? undefined;
    if (!complete && !cursor) {
      // A store that reports incomplete without a cursor cannot be
      // paginated further — stop rather than loop forever.
      complete = true;
    }
  }

  deps.log?.(summary);
  return summary;
}
