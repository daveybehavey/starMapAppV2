/**
 * Runtime wiring for the print-order hold sweep (S96-1 F1): the raw-KV
 * store adapter and the scheduled-tick entry point used by
 * cloudflare-worker.ts. Mirrors reviewRequestRuntime.ts — configuration
 * is snapshotted from the Worker handler's env argument (the scheduled
 * path never assumes process.env). The alert senders read their provider
 * configuration from process.env, which under nodejs_compat mirrors the
 * same bindings; if that mirroring were ever absent, the senders fail
 * closed with `print_alert_not_configured` and the sweep records the
 * failure on the order instead of pretending the operator was told.
 */
import { printOrderKey, resolvePrintOrderKvWrite } from "@/lib/printOrders";
import {
  sendPrintOrderHoldAlert,
  sendPrintOrderHoldEscalationAlert,
} from "@/lib/printOrderAlerts";
import {
  resolvePrintOrderHoldSweepConfig,
  runPrintOrderHoldSweep,
  type PrintOrderHoldSweepStore,
  type PrintOrderHoldSweepSummary,
} from "@/lib/printOrderHoldSweep";

type RawKvNamespace = {
  list(options: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{
    keys: Array<{ name: string }>;
    list_complete: boolean;
    cursor?: string;
  }>;
  get<T>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

const HOLD_SWEEP_PAGE_SIZE = 100;

/** Store adapter over the raw STAR_MAP_KV binding (scheduled/worker entry). */
export function createPrintOrderHoldSweepStore(ns: RawKvNamespace): PrintOrderHoldSweepStore {
  return {
    async listKeys(prefix, cursor) {
      const result = await ns.list({
        prefix,
        cursor,
        limit: HOLD_SWEEP_PAGE_SIZE,
      });
      return {
        names: result.keys.map((entry) => entry.name),
        cursor: result.cursor ?? null,
        complete: result.list_complete,
      };
    },
    async getJson<T>(key: string) {
      return ns.get<T>(key, "json");
    },
    async persistRecord(sessionId, record) {
      // A bare KV put would strip the record's creation-anchored TTL and
      // make a PII-bearing order record permanent — always re-apply the
      // remaining retention, and refuse (skip) when it has run out,
      // exactly as persistPrintOrderRecord decides for route writers.
      const plan = resolvePrintOrderKvWrite(record.createdAt);
      if (plan.action === "delete") {
        return { outcome: "skipped", reason: "unretainable" };
      }
      await ns.put(printOrderKey(sessionId), JSON.stringify(record), {
        expirationTtl: plan.ttlSeconds,
      });
      return { outcome: "persisted" };
    },
  };
}

function envRecordFromBindings(env: unknown): Record<string, string | undefined> {
  const record: Record<string, string | undefined> = {};
  if (env && typeof env === "object") {
    for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
      if (typeof value === "string") record[key] = value;
    }
  }
  // Worker secrets/vars are string bindings on env; under nodejs_compat
  // they also mirror into process.env. Prefer the handler env; fall back
  // to process.env for values the generated env type does not surface.
  for (const key of ["PRINT_ORDER_HOLD_SWEEP_ENABLED", "PRINT_ORDER_HOLD_ESCALATION_HOURS"]) {
    if (record[key] === undefined && process.env[key]) {
      record[key] = process.env[key];
    }
  }
  return record;
}

/** Scheduled entry: total per record by construction; the worker still guards the call. */
export async function runScheduledPrintOrderHoldSweep(
  env: unknown,
): Promise<PrintOrderHoldSweepSummary> {
  const envRecord = (env ?? {}) as { STAR_MAP_KV?: RawKvNamespace };
  if (!envRecord.STAR_MAP_KV) {
    throw new Error("STAR_MAP_KV binding missing for print-order hold sweep");
  }
  return runPrintOrderHoldSweep({
    store: createPrintOrderHoldSweepStore(envRecord.STAR_MAP_KV),
    config: resolvePrintOrderHoldSweepConfig(envRecordFromBindings(env)),
    sendHoldAlert: sendPrintOrderHoldAlert,
    sendHoldEscalationAlert: sendPrintOrderHoldEscalationAlert,
    log: (summary) => {
      console.log(JSON.stringify({ event: "print_order_hold_sweep", ...summary }));
    },
  });
}
