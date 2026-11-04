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
import {
  printOrderKey,
  resolvePrintOrderKvWrite,
  type PrintOrderRecord,
} from "@/lib/printOrders";
import {
  sendPrintOrderHoldAlert,
  sendPrintOrderHoldEscalationAlert,
} from "@/lib/printOrderAlerts";
import {
  readAuthorityLifecycleForMirrorGuard,
  readAuthorityLifecycleForMirrorGuardFromNamespace,
  shouldRejectNonterminalKvMirror,
  type AuthorityNamespace,
} from "@/lib/printOrderAuthority";
import {
  applyHoldSweepStampsToCurrent,
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
export function createPrintOrderHoldSweepStore(
  ns: RawKvNamespace,
  authorityNamespace?: AuthorityNamespace | null,
): PrintOrderHoldSweepStore {
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
      // Re-read and merge the sweep's stamps onto the CURRENT record:
      // the sweep worked from a snapshot, and a terminal failure,
      // shipment, or operator resolve that landed mid-scan must not be
      // overwritten by it (applyHoldSweepStampsToCurrent refuses when
      // the hold episode has ended or changed).
      const key = printOrderKey(sessionId);
      const current = await ns.get<PrintOrderRecord>(key, "json");
      const merged = applyHoldSweepStampsToCurrent(current, record);
      if (!merged) {
        return { outcome: "skipped", reason: "hold_state_changed" };
      }
      // Terminal-authority guard, identical in mechanism to
      // persistPrintOrderRecord's: a terminal failure is authority state,
      // re-checked after the merge read, so a failure landing mid-scan can
      // never be mirrored over by this nonterminal (sent) write.
      // Unreadable authority fails closed; the next tick retries. The
      // sweep runs from the scheduled handler, outside any fetch request
      // context, so the authority MUST be read through the binding passed
      // in from the scheduled event's env — the context-based lookup
      // cannot resolve it there and would report every order unreadable.
      const lifecycle = authorityNamespace
        ? await readAuthorityLifecycleForMirrorGuardFromNamespace(
            authorityNamespace,
            sessionId,
          )
        : await readAuthorityLifecycleForMirrorGuard(sessionId);
      if (shouldRejectNonterminalKvMirror(lifecycle)) {
        return { outcome: "skipped", reason: "authority_terminal_failure" };
      }
      // #551 N3 (fresh-eyes audit): the authority read above is a
      // wide window — a shipment write (shippedAt + notification
      // stamps) or a hold-clearing resolve can land in KV while it is
      // awaited, and the merge was computed from the record read
      // BEFORE it, so putting that merge would erase the concurrent
      // write and resurrect the ended hold. Re-read and re-merge onto
      // the freshest record (the review adapter's post-authority
      // pattern, PR #502 gate round 5): if the hold episode has ended
      // or changed, applyHoldSweepStampsToCurrent refuses and nothing
      // is written; otherwise the concurrent fields survive by
      // construction. Between this re-read and the put there are no
      // awaits — the residual is the same read->put KV no-CAS window
      // every writer in this family documents.
      const fresh = await ns.get<PrintOrderRecord>(key, "json");
      const remerged = applyHoldSweepStampsToCurrent(fresh, record);
      if (!remerged) {
        return { outcome: "skipped", reason: "hold_state_changed" };
      }
      // A bare KV put would strip the record's creation-anchored TTL and
      // make a PII-bearing order record permanent — always re-apply the
      // remaining retention, and refuse (skip) when it has run out,
      // exactly as persistPrintOrderRecord decides for route writers.
      const plan = resolvePrintOrderKvWrite(remerged.createdAt);
      if (plan.action === "delete") {
        return { outcome: "skipped", reason: "unretainable" };
      }
      await ns.put(key, JSON.stringify(remerged), {
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
  const envRecord = (env ?? {}) as {
    STAR_MAP_KV?: RawKvNamespace;
    PRINT_ORDER_AUTHORITY?: AuthorityNamespace;
  };
  if (!envRecord.STAR_MAP_KV) {
    throw new Error("STAR_MAP_KV binding missing for print-order hold sweep");
  }
  return runPrintOrderHoldSweep({
    store: createPrintOrderHoldSweepStore(
      envRecord.STAR_MAP_KV,
      envRecord.PRINT_ORDER_AUTHORITY,
    ),
    // Pre-alert authority gate (same binding route + predicate as the
    // persist guard): a terminally failed order whose KV projection
    // lags must never be alerted or escalated as "on hold", and an
    // unreadable authority stays silent rather than guessing.
    authorityGate: async (sessionId) => {
      const lifecycle = envRecord.PRINT_ORDER_AUTHORITY
        ? await readAuthorityLifecycleForMirrorGuardFromNamespace(
            envRecord.PRINT_ORDER_AUTHORITY,
            sessionId,
          )
        : await readAuthorityLifecycleForMirrorGuard(sessionId);
      if (!shouldRejectNonterminalKvMirror(lifecycle)) return "ok";
      return lifecycle === "terminal_failed" ? "terminal" : "unread";
    },
    config: resolvePrintOrderHoldSweepConfig(envRecordFromBindings(env)),
    sendHoldAlert: sendPrintOrderHoldAlert,
    sendHoldEscalationAlert: sendPrintOrderHoldEscalationAlert,
    log: (summary) => {
      console.log(JSON.stringify({ event: "print_order_hold_sweep", ...summary }));
    },
  });
}
