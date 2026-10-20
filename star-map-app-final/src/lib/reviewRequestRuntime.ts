/**
 * Runtime wiring for the review-request engine: KV store adapters, the
 * production sender (Resend), and the scheduled-tick entry point used by
 * cloudflare-worker.ts.
 *
 * Configuration is snapshotted from the Worker handler's env argument
 * (critique D2 — the scheduled path never assumes process.env); the Resend
 * adapter itself reads its API key/from from process.env, which under
 * nodejs_compat mirrors the same bindings. If that mirroring were ever
 * absent, the tick's resend_not_configured gate fails closed and says so in
 * its log line instead of sending.
 */
import { kv } from "@/lib/kv";
import { isResendConfigured, sendResendEmail } from "@/lib/resend";
import { createReviewLedgerClient } from "@/lib/reviewRequestLedger";
import {
  resolveReviewEngineConfig,
  runReviewRequestTick,
  REVIEW_SCAN_PAGE_SIZE,
  type ReviewEngineDeps,
  type ReviewScanStore,
  type ReviewSendInput,
  type ReviewSendResult,
  type ReviewTickSummary,
} from "@/lib/reviewRequests";

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
  put(key: string, value: string): Promise<void>;
};

/** Store adapter over the raw STAR_MAP_KV binding (scheduled/worker entry). */
export function createRawKvScanStore(ns: RawKvNamespace): ReviewScanStore {
  return {
    async listKeys(prefix, cursor) {
      const result = await ns.list({
        prefix,
        cursor,
        limit: REVIEW_SCAN_PAGE_SIZE,
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
    async putJson(key, value) {
      await ns.put(key, JSON.stringify(value));
    },
  };
}

/** Store adapter over the app kv wrapper (fetch-context routes). */
export function createWrapperKvScanStore(): ReviewScanStore {
  return {
    async listKeys(prefix, cursor) {
      const result = await kv.list({
        prefix,
        cursor: cursor ?? undefined,
        limit: REVIEW_SCAN_PAGE_SIZE,
      });
      return {
        names: result.keys,
        cursor: result.cursor ?? null,
        complete: result.listComplete,
      };
    },
    async getJson<T>(key: string) {
      return kv.get<T>(key);
    },
    async putJson(key, value) {
      await kv.set(key, value);
    },
  };
}

async function sendViaResend(input: ReviewSendInput): Promise<ReviewSendResult> {
  const result = await sendResendEmail({
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    headers: input.headers,
    idempotencyKey: input.idempotencyKey,
    tags: input.tags,
  });
  if (result.ok) {
    return { ok: true, id: result.id || null };
  }
  return { ok: false, error: result.error };
}

function envRecordFromBindings(env: unknown): Record<string, string | undefined> {
  const record: Record<string, string | undefined> = {};
  if (env && typeof env === "object") {
    for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
      if (typeof value === "string") record[key] = value;
    }
  }
  // Worker secrets/vars are string bindings on env; under nodejs_compat they
  // also mirror into process.env. Prefer the handler env; fall back to
  // process.env for values the generated env type does not surface.
  for (const key of [
    "REVIEW_REQUESTS_ENABLED",
    "REVIEW_REQUESTS_PHYSICAL_ENABLED",
    "REVIEW_REQUEST_MAILING_ADDRESS",
    "REVIEW_OPTOUT_SIGNING_SECRET",
    "PROMOTION_UNSUBSCRIBE_SECRET",
    "NEXT_PUBLIC_SITE_URL",
    "NEXT_PUBLIC_SUPPORT_EMAIL",
  ]) {
    if (record[key] === undefined && process.env[key]) {
      record[key] = process.env[key];
    }
  }
  return record;
}

/** Build production deps from the Worker handler env (scheduled entry). */
export function buildScheduledReviewDeps(env: unknown): ReviewEngineDeps {
  const envRecord = (env ?? {}) as { STAR_MAP_KV?: RawKvNamespace };
  if (!envRecord.STAR_MAP_KV) {
    throw new Error("STAR_MAP_KV binding missing for review-request tick");
  }
  return {
    store: createRawKvScanStore(envRecord.STAR_MAP_KV),
    ledger: createReviewLedgerClient(env),
    send: sendViaResend,
    config: resolveReviewEngineConfig(envRecordFromBindings(env), {
      resendConfigured: isResendConfigured(),
    }),
  };
}

/** Scheduled entry: total by construction; the worker still guards the call. */
export async function runScheduledReviewRequestTick(env: unknown): Promise<ReviewTickSummary> {
  const deps = buildScheduledReviewDeps(env);
  return runReviewRequestTick(deps);
}
