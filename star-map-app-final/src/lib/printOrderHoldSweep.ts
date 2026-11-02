/**
 * S96-1 F1: aging/escalation sweep for Printful-held print orders.
 *
 * The `order_put_hold` webhook records the hold on the KV record and
 * attempts an immediate operator alert (printfulWebhookOrderEvents.ts).
 * This sweep is the backstop the state inventory found missing: on the
 * Worker's existing 15-minute cron it re-scans held orders, retries a
 * hold alert that never landed, and escalates a hold that is still
 * unresolved past the configured threshold — once each, from the stamps
 * on the record. Terminal failure, shipment, and operator resolve clear
 * the hold fields at their own write points, so a record that still
 * carries them with status `sent` and no shipment fact is, by
 * construction, a live hold.
 *
 * The engine is dependency-light (store + senders injected) so it is
 * unit-testable against this real source; the scheduled wiring lives in
 * printOrderHoldSweepRuntime.ts, following reviewRequestRuntime.ts.
 */
import type { PrintOrderRecord } from "@/lib/printOrders";
import type { PrintOrderAlertResult } from "@/lib/printOrderAlerts";

export const PRINT_ORDER_KEY_PREFIX = "print:order:";
export const DEFAULT_PRINT_ORDER_HOLD_ESCALATION_HOURS = 24;

export type PrintOrderHoldSweepConfig = {
  enabled: boolean;
  escalationThresholdMs: number;
};

/**
 * Pure config snapshot from an env record (the scheduled path never
 * assumes process.env — the runtime snapshots the Worker bindings).
 * The sweep is INERT unless PRINT_ORDER_HOLD_SWEEP_ENABLED is exactly
 * "true" (dashboard-owned activation, deliberately not in wrangler.toml
 * [vars] — the same posture as REVIEW_REQUESTS_ENABLED).
 */
export function resolvePrintOrderHoldSweepConfig(
  env: Record<string, string | undefined>,
): PrintOrderHoldSweepConfig {
  const enabled = (env.PRINT_ORDER_HOLD_SWEEP_ENABLED ?? "").trim().toLowerCase() === "true";
  const parsedHours = Number.parseFloat(env.PRINT_ORDER_HOLD_ESCALATION_HOURS ?? "");
  const hours =
    Number.isFinite(parsedHours) && parsedHours > 0
      ? parsedHours
      : DEFAULT_PRINT_ORDER_HOLD_ESCALATION_HOURS;
  return { enabled, escalationThresholdMs: Math.round(hours * 60 * 60 * 1000) };
}

export type PrintOrderHoldSweepStore = {
  listKeys(
    prefix: string,
    cursor?: string,
  ): Promise<{ names: string[]; cursor: string | null; complete: boolean }>;
  getJson<T>(key: string): Promise<T | null>;
  /**
   * Persist an annotated record. Implementations must preserve the
   * record's creation-anchored KV retention (see
   * printOrderHoldSweepRuntime.ts); "skipped" means the record could
   * not be retained and nothing was written.
   */
  persistRecord(
    sessionId: string,
    record: PrintOrderRecord,
  ): Promise<{ outcome: "persisted" } | { outcome: "skipped"; reason: string }>;
};

export type PrintOrderHoldSweepSummary = {
  enabled: boolean;
  scanned: number;
  held: number;
  alertsSent: number;
  alertFailures: number;
  escalationsSent: number;
  escalationFailures: number;
  writesSkipped: number;
  errors: number;
};

export type PrintOrderHoldSweepAction = "alert" | "escalate";

/**
 * The one decision the sweep makes per record. A live hold whose first
 * alert never landed is (re-)alerted immediately — the webhook already
 * attempted once, so a missing stamp means failure, not newness. An
 * alerted hold escalates once it ages past the threshold. Anything
 * else (no hold fact, no longer `sent`, already shipped) is not the
 * sweep's business.
 */
export function printOrderHoldSweepAction(
  record: PrintOrderRecord | null | undefined,
  config: PrintOrderHoldSweepConfig,
  now: number,
): PrintOrderHoldSweepAction | null {
  if (!record) return null;
  if (typeof record.providerHoldAt !== "number" || !Number.isFinite(record.providerHoldAt)) {
    return null;
  }
  if (record.status !== "sent" || record.shippedAt) return null;
  if (!record.operatorHoldAlertedAt) return "alert";
  if (!record.operatorHoldEscalatedAt && now - record.providerHoldAt >= config.escalationThresholdMs) {
    return "escalate";
  }
  return null;
}

function emptySummary(enabled: boolean): PrintOrderHoldSweepSummary {
  return {
    enabled,
    scanned: 0,
    held: 0,
    alertsSent: 0,
    alertFailures: 0,
    escalationsSent: 0,
    escalationFailures: 0,
    writesSkipped: 0,
    errors: 0,
  };
}

/**
 * Total over per-record failures (one bad record never stops the scan);
 * a store listing failure propagates to the caller's guard, mirroring
 * the review-request tick.
 */
export async function runPrintOrderHoldSweep(deps: {
  store: PrintOrderHoldSweepStore;
  config: PrintOrderHoldSweepConfig;
  now?: () => number;
  sendHoldAlert: (record: PrintOrderRecord) => Promise<PrintOrderAlertResult>;
  sendHoldEscalationAlert: (record: PrintOrderRecord) => Promise<PrintOrderAlertResult>;
  log?: (summary: PrintOrderHoldSweepSummary) => void;
}): Promise<PrintOrderHoldSweepSummary> {
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
        if (
          record &&
          typeof record.providerHoldAt === "number" &&
          Number.isFinite(record.providerHoldAt)
        ) {
          summary.held += 1;
        }
        const action = printOrderHoldSweepAction(record, deps.config, now());
        if (!action || !record) continue;

        const at = now();
        if (action === "alert") {
          const result = await deps.sendHoldAlert(record);
          const next: PrintOrderRecord = result.delivered
            ? {
                ...record,
                operatorHoldAlertedAt: at,
                operatorHoldAlertProvider: result.provider,
                operatorHoldAlertError: undefined,
              }
            : {
                ...record,
                operatorHoldAlertProvider: result.provider,
                operatorHoldAlertError: result.error,
              };
          if (result.delivered) summary.alertsSent += 1;
          else summary.alertFailures += 1;
          const persisted = await deps.store.persistRecord(record.sessionId, next);
          if (persisted.outcome !== "persisted") summary.writesSkipped += 1;
        } else {
          const result = await deps.sendHoldEscalationAlert(record);
          const next: PrintOrderRecord = result.delivered
            ? {
                ...record,
                operatorHoldEscalatedAt: at,
                operatorHoldEscalationAlertError: undefined,
              }
            : {
                ...record,
                operatorHoldEscalationAlertError: result.error,
              };
          if (result.delivered) summary.escalationsSent += 1;
          else summary.escalationFailures += 1;
          const persisted = await deps.store.persistRecord(record.sessionId, next);
          if (persisted.outcome !== "persisted") summary.writesSkipped += 1;
        }
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
