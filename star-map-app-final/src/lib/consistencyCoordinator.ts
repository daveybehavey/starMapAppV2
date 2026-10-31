/**
 * Client for the Consistency Coordinator (T-SM-KVRACE; design S3-A).
 *
 * Routes and libs talk to the per-token / per-email Durable Object
 * through this client. Object names (the memo's identities):
 *   magic:v1:<sha256 hex of the raw token>   (the DO never sees the token)
 *   account:v1:<existing accountLite email hash>
 *   promotion:v1:<email hash, same algorithm>
 *
 * Failure contract (S3-A): a coordinator failure is a RETRYABLE error —
 * callers get a thrown ConsistencyCoordinatorUnavailableError, never a
 * silent fallback to the legacy KV write paths (a split authority would
 * be worse than an outage). The one exception is the sanctioned local
 * mode (dev / CI / tests, same gate as the entitlement authority's):
 * an in-memory store applying the SAME pure state machines under a
 * per-object lock.
 */
import { createHash } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  applyClaimPromotionJob,
  applyClearDeliverabilitySuppression,
  applyCompletePromotionJob,
  applyConsumeMagicToken,
  applyErasePromotionIdentity,
  applyReadAccountSessions,
  applyRecordDeliverabilitySuppression,
  applyRegisterMagicToken,
  applyRekeyPromotionTombstones,
  applySubscribePromotion,
  applyUnsubscribePromotion,
  applyUpsertAccountSession,
  type AccountIndexCoordinatorState,
  type AccountSessionsView,
  type ClaimPromotionJobResult,
  type ConsumeMagicTokenResult,
  type LegacyMagicLinkRecord,
  type MagicTokenCoordinatorState,
  type PromotionCoordinatorState,
  type PromotionCreationGateOutcome,
  type PromotionJobKind,
  type PromotionJobPayload,
  type PromotionLegacyFacts,
  type PromotionSendOutcome,
} from "@/lib/consistencyCoordinatorState";
import type { PromotionTombstoneLookupFacts } from "@/lib/promotionTombstones";
import type { AccountLiteSessionIndexItem } from "@/lib/accountLite";

export class ConsistencyCoordinatorUnavailableError extends Error {
  readonly code = "consistency_coordinator_unavailable";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "ConsistencyCoordinatorUnavailableError";
  }
}

/* ------------------------- object naming ------------------------- */

/** sha256 hex of the raw magic token (the raw token never leaves the
 *  client; the DO is named by its digest, per the S3-A identity table). */
export function magicCoordinatorName(token: string): string {
  return `magic:v1:${createHash("sha256").update(token).digest("hex")}`;
}

/** The existing accountLite email hash (sha256, base64url, 40 chars) —
 *  shared by the account and promotion object identities. */
export function coordinatorEmailHash(normalizedEmail: string): string {
  return createHash("sha256").update(normalizedEmail).digest("base64url").slice(0, 40);
}

export function accountCoordinatorName(emailHash: string): string {
  return `account:v1:${emailHash}`;
}

export function promotionCoordinatorName(emailHash: string): string {
  return `promotion:v1:${emailHash}`;
}

/* ------------------------- RPC surface ------------------------- */

type CoordinatorStub = {
  registerMagicToken(input: {
    email: string;
    emailHash: string;
    expiresAt: number;
    now: number;
  }): Promise<{ registered: boolean }>;
  consumeMagicToken(input: {
    legacyRecord: LegacyMagicLinkRecord | null;
    legacyTtlMs: number;
    now: number;
  }): Promise<ConsumeMagicTokenResult>;
  upsertAccountSession(input: {
    emailHash: string;
    session: AccountLiteSessionIndexItem;
    legacySessions: AccountLiteSessionIndexItem[] | null;
    legacyUpdatedAt: number | null;
    now: number;
  }): Promise<{ view: AccountSessionsView | null }>;
  getAccountSessions(input: {
    emailHash: string;
    legacySessions: AccountLiteSessionIndexItem[] | null;
    legacyUpdatedAt: number | null;
  }): Promise<{ view: AccountSessionsView | null }>;
  subscribePromotion(input: {
    emailHash: string;
    source: string;
    now: number;
    facts: PromotionLegacyFacts;
    couponPayload: PromotionJobPayload;
    followupPayload?: PromotionJobPayload;
    tombstoneLookup: PromotionTombstoneLookupFacts;
  }): Promise<{
    isNewSubscriber: boolean;
    state: PromotionCoordinatorState;
    creationGate: PromotionCreationGateOutcome;
  }>;
  erasePromotionIdentity(input: {
    emailHash: string;
    now: number;
    facts: PromotionLegacyFacts;
    keyedDigest: string;
    digestKeyVersion: number;
    authorityId: string;
  }): Promise<{
    state: PromotionCoordinatorState;
    alreadyErased: boolean;
    erasureRefused?: string;
  }>;
  rekeyPromotionTombstones(input: {
    fromVersion: number;
    toVersion: number;
    newKeyedDigest: string;
    now: number;
  }): Promise<{ state: PromotionCoordinatorState | null; restamped: number }>;
  unsubscribePromotion(input: {
    emailHash: string;
    now: number;
    reason: string;
    facts: PromotionLegacyFacts;
  }): Promise<{ wasAlreadyUnsubscribed: boolean; state: PromotionCoordinatorState }>;
  recordDeliverabilitySuppression(input: {
    emailHash: string;
    now: number;
    eventRef: string;
    facts: PromotionLegacyFacts;
  }): Promise<{ state: PromotionCoordinatorState }>;
  clearDeliverabilitySuppression(input: {
    now: number;
  }): Promise<{ state: PromotionCoordinatorState | null }>;
  claimPromotionJob(input: {
    kind: PromotionJobKind;
    now: number;
    attemptProvider?: string | null;
    attemptIdempotencyGuaranteed?: boolean | null;
  }): Promise<{ claim: ClaimPromotionJobResult }>;
  completePromotionJob(input: {
    kind: PromotionJobKind;
    outcome: PromotionSendOutcome;
    now: number;
    followupPayload?: PromotionJobPayload;
  }): Promise<{ state: PromotionCoordinatorState | null }>;
  getPromotionState(): Promise<PromotionCoordinatorState | null>;
};

type CoordinatorNamespace = {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): CoordinatorStub;
};

export type ConsistencyCoordinatorClient = {
  registerMagicToken(
    name: string,
    input: { email: string; emailHash: string; expiresAt: number; now: number },
  ): Promise<{ registered: boolean }>;
  consumeMagicToken(
    name: string,
    input: { legacyRecord: LegacyMagicLinkRecord | null; legacyTtlMs: number; now: number },
  ): Promise<ConsumeMagicTokenResult>;
  upsertAccountSession(
    name: string,
    input: {
      emailHash: string;
      session: AccountLiteSessionIndexItem;
      legacySessions: AccountLiteSessionIndexItem[] | null;
      legacyUpdatedAt: number | null;
      now: number;
    },
  ): Promise<{ view: AccountSessionsView | null }>;
  getAccountSessions(
    name: string,
    input: {
      emailHash: string;
      legacySessions: AccountLiteSessionIndexItem[] | null;
      legacyUpdatedAt: number | null;
    },
  ): Promise<{ view: AccountSessionsView | null }>;
  subscribePromotion(
    name: string,
    input: {
      emailHash: string;
      source: string;
      now: number;
      facts: PromotionLegacyFacts;
      couponPayload: PromotionJobPayload;
      followupPayload?: PromotionJobPayload;
      tombstoneLookup: PromotionTombstoneLookupFacts;
    },
  ): Promise<{
    isNewSubscriber: boolean;
    state: PromotionCoordinatorState;
    creationGate: PromotionCreationGateOutcome;
  }>;
  erasePromotionIdentity(
    name: string,
    input: {
      emailHash: string;
      now: number;
      facts: PromotionLegacyFacts;
      keyedDigest: string;
      digestKeyVersion: number;
      authorityId: string;
    },
  ): Promise<{
    state: PromotionCoordinatorState;
    alreadyErased: boolean;
    erasureRefused?: string;
  }>;
  rekeyPromotionTombstones(
    name: string,
    input: { fromVersion: number; toVersion: number; newKeyedDigest: string; now: number },
  ): Promise<{ state: PromotionCoordinatorState | null; restamped: number }>;
  unsubscribePromotion(
    name: string,
    input: {
      emailHash: string;
      now: number;
      reason: string;
      facts: PromotionLegacyFacts;
    },
  ): Promise<{ wasAlreadyUnsubscribed: boolean; state: PromotionCoordinatorState }>;
  recordDeliverabilitySuppression(
    name: string,
    input: { emailHash: string; now: number; eventRef: string; facts: PromotionLegacyFacts },
  ): Promise<{ state: PromotionCoordinatorState }>;
  clearDeliverabilitySuppression(
    name: string,
    input: { now: number },
  ): Promise<{ state: PromotionCoordinatorState | null }>;
  claimPromotionJob(
    name: string,
    input: {
      kind: PromotionJobKind;
      now: number;
      attemptProvider?: string | null;
      attemptIdempotencyGuaranteed?: boolean | null;
    },
  ): Promise<{ claim: ClaimPromotionJobResult }>;
  completePromotionJob(
    name: string,
    input: {
      kind: PromotionJobKind;
      outcome: PromotionSendOutcome;
      now: number;
      followupPayload?: PromotionJobPayload;
    },
  ): Promise<{ state: PromotionCoordinatorState | null }>;
  getPromotionState(name: string): Promise<PromotionCoordinatorState | null>;
};

/* ------------------- local in-memory fallback ------------------- */

type AnyCoordinatorState =
  | MagicTokenCoordinatorState
  | AccountIndexCoordinatorState
  | PromotionCoordinatorState;

const memoryStores = new Map<string, AnyCoordinatorState>();
const memoryLocks = new Map<string, Promise<void>>();

function isLocalCoordinatorFallbackAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.STARMAP_CONSISTENCY_COORDINATOR_LOCAL === "1") return true;
  if (env.CI === "1") return true;
  const nodeEnv = env.NODE_ENV?.trim();
  return nodeEnv === "development" || nodeEnv === "test";
}

async function withMemoryLock<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
  const prev = memoryLocks.get(name) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  memoryLocks.set(
    name,
    prev.then(() => gate),
  );
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

function memoryKind<K extends AnyCoordinatorState["kind"]>(
  name: string,
  kind: K,
): Extract<AnyCoordinatorState, { kind: K }> | null {
  const doc = memoryStores.get(name) ?? null;
  if (doc === null) return null;
  if (doc.kind !== kind) {
    throw new Error(`consistency coordinator kind mismatch for ${name}: expected ${kind}`);
  }
  return doc as Extract<AnyCoordinatorState, { kind: K }>;
}

/** Test-only: reset the in-memory coordinator (unit harnesses). */
export function __resetConsistencyCoordinatorMemoryForTests() {
  memoryStores.clear();
  memoryLocks.clear();
}

function createMemoryClient(): ConsistencyCoordinatorClient {
  return {
    registerMagicToken(name, input) {
      return withMemoryLock(name, () => {
        const result = applyRegisterMagicToken(memoryKind(name, "magic"), input);
        if (result.changed) memoryStores.set(name, result.state);
        return { registered: true };
      });
    },
    consumeMagicToken(name, input) {
      return withMemoryLock(name, () => {
        const result = applyConsumeMagicToken(memoryKind(name, "magic"), input);
        if (result.changed && result.state) memoryStores.set(name, result.state);
        return result.result;
      });
    },
    upsertAccountSession(name, input) {
      return withMemoryLock(name, () => {
        const result = applyUpsertAccountSession(memoryKind(name, "account"), input);
        if (result.changed) memoryStores.set(name, result.state);
        return { view: result.view };
      });
    },
    getAccountSessions(name, input) {
      return withMemoryLock(name, () => {
        const result = applyReadAccountSessions(memoryKind(name, "account"), input);
        if (result.changed && result.state) memoryStores.set(name, result.state);
        return { view: result.view };
      });
    },
    subscribePromotion(name, input) {
      return withMemoryLock(name, () => {
        const result = applySubscribePromotion(memoryKind(name, "promotion"), input);
        if (result.changed) memoryStores.set(name, result.state);
        return {
          isNewSubscriber: result.isNewSubscriber,
          state: result.state,
          creationGate: result.creationGate,
        };
      });
    },
    erasePromotionIdentity(name, input) {
      return withMemoryLock(name, () => {
        const result = applyErasePromotionIdentity(memoryKind(name, "promotion"), input);
        if (result.changed) memoryStores.set(name, result.state);
        return {
          state: result.state,
          alreadyErased: result.alreadyErased,
          erasureRefused: result.erasureRefused,
        };
      });
    },
    rekeyPromotionTombstones(name, input) {
      return withMemoryLock(name, () => {
        const current = memoryKind(name, "promotion");
        if (!current) return { state: null, restamped: 0 };
        const result = applyRekeyPromotionTombstones(current, input);
        if (result.changed) memoryStores.set(name, result.state);
        return { state: result.state, restamped: result.restamped };
      });
    },
    unsubscribePromotion(name, input) {
      return withMemoryLock(name, () => {
        const result = applyUnsubscribePromotion(memoryKind(name, "promotion"), input);
        if (result.changed) memoryStores.set(name, result.state);
        return {
          wasAlreadyUnsubscribed: result.wasAlreadyUnsubscribed,
          state: result.state,
        };
      });
    },
    recordDeliverabilitySuppression(name, input) {
      return withMemoryLock(name, () => {
        const result = applyRecordDeliverabilitySuppression(
          memoryKind(name, "promotion"),
          input,
        );
        if (result.changed) memoryStores.set(name, result.state);
        return { state: result.state };
      });
    },
    clearDeliverabilitySuppression(name, input) {
      return withMemoryLock(name, () => {
        const current = memoryKind(name, "promotion");
        if (!current) return { state: null };
        const result = applyClearDeliverabilitySuppression(current, input);
        if (result.changed) memoryStores.set(name, result.state);
        return { state: result.state };
      });
    },
    claimPromotionJob(name, input) {
      return withMemoryLock(name, () => {
        const current = memoryKind(name, "promotion");
        if (!current) return { claim: null };
        const result = applyClaimPromotionJob(current, input);
        if (result.changed) memoryStores.set(name, result.state);
        return { claim: result.claim };
      });
    },
    completePromotionJob(name, input) {
      return withMemoryLock(name, () => {
        const current = memoryKind(name, "promotion");
        if (!current) return { state: null };
        const result = applyCompletePromotionJob(current, input);
        if (result.changed) memoryStores.set(name, result.state);
        return { state: result.state };
      });
    },
    getPromotionState(name) {
      return withMemoryLock(name, () => memoryKind(name, "promotion"));
    },
  };
}

/* ------------------------- DO-backed client ------------------------- */

function namespaceFromEnvRecord(env: unknown): CoordinatorNamespace | null {
  if (!env || typeof env !== "object") return null;
  const binding = (env as { CONSISTENCY_COORDINATOR?: CoordinatorNamespace })
    .CONSISTENCY_COORDINATOR;
  return binding ?? null;
}

export function createConsistencyCoordinatorClient(
  explicitEnv?: unknown,
): ConsistencyCoordinatorClient {
  const resolveNamespace = (): CoordinatorNamespace | null => {
    const fromExplicit = namespaceFromEnvRecord(explicitEnv);
    if (fromExplicit) return fromExplicit;
    try {
      const { env } = getCloudflareContext();
      return namespaceFromEnvRecord(env);
    } catch {
      return null;
    }
  };

  const memory = createMemoryClient();

  async function call<T>(
    name: string,
    method: keyof CoordinatorStub,
    input: unknown,
    memoryCall: () => Promise<T>,
  ): Promise<T> {
    const ns = resolveNamespace();
    if (ns) {
      try {
        const stub = ns.get(ns.idFromName(name));
        const fn = stub[method] as (arg: unknown) => Promise<T>;
        return await fn.call(stub, input);
      } catch (error) {
        if (isLocalCoordinatorFallbackAllowed()) return memoryCall();
        throw new ConsistencyCoordinatorUnavailableError(
          `consistency coordinator call failed (${method} for ${name})`,
          { cause: error },
        );
      }
    }
    if (isLocalCoordinatorFallbackAllowed()) return memoryCall();
    throw new ConsistencyCoordinatorUnavailableError(
      `consistency coordinator binding unavailable (${method} for ${name})`,
    );
  }

  return {
    registerMagicToken: (name, input) =>
      call(name, "registerMagicToken", input, () => memory.registerMagicToken(name, input)),
    consumeMagicToken: (name, input) =>
      call(name, "consumeMagicToken", input, () => memory.consumeMagicToken(name, input)),
    upsertAccountSession: (name, input) =>
      call(name, "upsertAccountSession", input, () => memory.upsertAccountSession(name, input)),
    getAccountSessions: (name, input) =>
      call(name, "getAccountSessions", input, () => memory.getAccountSessions(name, input)),
    subscribePromotion: (name, input) =>
      call(name, "subscribePromotion", input, () => memory.subscribePromotion(name, input)),
    erasePromotionIdentity: (name, input) =>
      call(name, "erasePromotionIdentity", input, () => memory.erasePromotionIdentity(name, input)),
    rekeyPromotionTombstones: (name, input) =>
      call(name, "rekeyPromotionTombstones", input, () =>
        memory.rekeyPromotionTombstones(name, input),
      ),
    unsubscribePromotion: (name, input) =>
      call(name, "unsubscribePromotion", input, () => memory.unsubscribePromotion(name, input)),
    recordDeliverabilitySuppression: (name, input) =>
      call(name, "recordDeliverabilitySuppression", input, () =>
        memory.recordDeliverabilitySuppression(name, input),
      ),
    clearDeliverabilitySuppression: (name, input) =>
      call(name, "clearDeliverabilitySuppression", input, () =>
        memory.clearDeliverabilitySuppression(name, input),
      ),
    claimPromotionJob: (name, input) =>
      call(name, "claimPromotionJob", input, () => memory.claimPromotionJob(name, input)),
    completePromotionJob: (name, input) =>
      call(name, "completePromotionJob", input, () => memory.completePromotionJob(name, input)),
    getPromotionState: (name) =>
      call(name, "getPromotionState", undefined, () => memory.getPromotionState(name)),
  };
}
