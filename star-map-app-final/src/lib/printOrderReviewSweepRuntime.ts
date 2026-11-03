/**
 * Runtime wiring for the print-order review sweep (S96-1 F3): the
 * raw-KV store adapter and the scheduled-tick entry point used by
 * cloudflare-worker.ts. Mirrors printOrderHoldSweepRuntime.ts —
 * configuration is snapshotted from the Worker handler's env argument
 * (the scheduled path never assumes process.env). The review and the
 * alert senders read their provider configuration from process.env,
 * which under nodejs_compat mirrors the same bindings; if that
 * mirroring were ever absent, the review reads as unavailable (the
 * record stays pending) and the senders fail closed with
 * `print_alert_not_configured`, recorded on the order rather than
 * pretending the operator was told.
 */
import {
  printOrderKey,
  resolvePrintOrderKvWrite,
  type PrintOrderRecord,
} from "@/lib/printOrders";
import { sendPrintOrderReviewPendingAlert } from "@/lib/printOrderAlerts";
import {
  readAuthorityLifecycleForMirrorGuard,
  readAuthorityLifecycleForMirrorGuardFromNamespace,
  shouldRejectNonterminalKvMirror,
  type AuthorityNamespace,
} from "@/lib/printOrderAuthority";
import {
  applyPrintfulPostSubmitReview,
  applyReviewOutcomeToCurrent,
} from "@/lib/printFulfillmentPostSubmit";
import {
  resolvePrintOrderReviewSweepConfig,
  runPrintOrderReviewSweep,
  type PrintOrderReviewSweepStore,
  type PrintOrderReviewSweepSummary,
} from "@/lib/printOrderReviewSweep";

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

const REVIEW_SWEEP_PAGE_SIZE = 100;

/** Store adapter over the raw STAR_MAP_KV binding (scheduled/worker entry). */
export function createPrintOrderReviewSweepStore(
  ns: RawKvNamespace,
  authorityNamespace?: AuthorityNamespace | null,
): PrintOrderReviewSweepStore {
  return {
    async listKeys(prefix, cursor) {
      const result = await ns.list({
        prefix,
        cursor,
        limit: REVIEW_SWEEP_PAGE_SIZE,
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
      // Re-read and merge the review outcome onto the CURRENT record:
      // the sweep worked from a snapshot, and a terminal failure,
      // shipment, or operator resolve that landed mid-scan must not be
      // overwritten by it (applyReviewOutcomeToCurrent refuses when the
      // record no longer describes the reviewed order in `sent`).
      const key = printOrderKey(sessionId);
      const current = await ns.get<PrintOrderRecord>(key, "json");
      const merged = applyReviewOutcomeToCurrent(current, record);
      if (!merged) {
        return { outcome: "skipped", reason: "review_state_changed" };
      }
      // Terminal-authority guard, identical in mechanism to
      // persistPrintOrderRecord's: a terminal failure is authority
      // state, re-checked after the merge read, so a failure landing
      // mid-scan can never be mirrored over by this nonterminal (sent)
      // write. Unreadable authority fails closed; the next tick
      // retries. The sweep runs from the scheduled handler, outside
      // any fetch request context, so the authority MUST be read
      // through the binding passed in from the scheduled event's env —
      // the context-based lookup cannot resolve it there and would
      // report every order unreadable.
      const lifecycle = authorityNamespace
        ? await readAuthorityLifecycleForMirrorGuardFromNamespace(
            authorityNamespace,
            sessionId,
          )
        : await readAuthorityLifecycleForMirrorGuard(sessionId);
      if (shouldRejectNonterminalKvMirror(lifecycle)) {
        return { outcome: "skipped", reason: "authority_terminal_failure" };
      }
      // Gate round 5 (local Codex seat P2-B): the authority read above
      // is a wide window — a shipment write (shippedAt/tracking) or an
      // operator resolve can land in KV while it is awaited, and the
      // merge was computed from the record read BEFORE it, so putting
      // that snapshot would erase the concurrent write (losing
      // shippedAt also re-exposes the order to review and alerts).
      // Re-read and re-merge onto the freshest record: if the order
      // no longer describes the reviewed one in `sent`, the merge
      // refuses and nothing is written; otherwise the concurrent
      // fields survive by construction. Between this re-read and the
      // put there are no awaits — the residual is the same read->put
      // KV no-CAS window every writer in this family documents.
      const fresh = await ns.get<PrintOrderRecord>(key, "json");
      const remerged = applyReviewOutcomeToCurrent(fresh, record);
      if (!remerged) {
        return { outcome: "skipped", reason: "review_state_changed" };
      }
      // A bare KV put would strip the record's creation-anchored TTL
      // and make a PII-bearing order record permanent — always re-apply
      // the remaining retention, and refuse (skip) when it has run out,
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
  for (const key of ["PRINT_ORDER_REVIEW_SWEEP_ENABLED", "PRINT_ORDER_REVIEW_PENDING_ALERT_HOURS"]) {
    if (record[key] === undefined && process.env[key]) {
      record[key] = process.env[key];
    }
  }
  return record;
}

/** Scheduled entry: total per record by construction; the worker still guards the call. */
export async function runScheduledPrintOrderReviewSweep(
  env: unknown,
): Promise<PrintOrderReviewSweepSummary> {
  const envRecord = (env ?? {}) as {
    STAR_MAP_KV?: RawKvNamespace;
    PRINT_ORDER_AUTHORITY?: AuthorityNamespace;
  };
  if (!envRecord.STAR_MAP_KV) {
    throw new Error("STAR_MAP_KV binding missing for print-order review sweep");
  }
  return runPrintOrderReviewSweep({
    store: createPrintOrderReviewSweepStore(
      envRecord.STAR_MAP_KV,
      envRecord.PRINT_ORDER_AUTHORITY,
    ),
    // Pre-review authority gate (same binding route + predicate as the
    // persist guard): a terminally failed order whose KV projection
    // lags must never be reviewed or alerted as pending, and an
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
    config: resolvePrintOrderReviewSweepConfig(envRecordFromBindings(env)),
    reviewOrder: (record) => applyPrintfulPostSubmitReview(record),
    sendReviewPendingAlert: sendPrintOrderReviewPendingAlert,
    log: (summary) => {
      console.log(JSON.stringify({ event: "print_order_review_sweep", ...summary }));
    },
  });
}
