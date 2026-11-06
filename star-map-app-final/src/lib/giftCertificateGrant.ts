/**
 * GiftCertificateGrantDO client + the redeem grant orchestration
 * (Tier C review condition 1, 2026-11-06).
 *
 * The state machine and the soundness argument live in
 * giftCertificateGrantState.ts. This module resolves the DO namespace
 * (request context or explicit env), mirrors the entitlement
 * authority's fail-closed local-fallback posture, and exposes
 * `publishGiftCertificateGrant` — the redeem route's grant entry
 * point, delegating to the authority's single serialized `publish`
 * operation (the DO performs the entitlement KV write itself; the
 * local fallback runs the same sequence under its per-session lock).
 * Factored out so the two-isolate interleaving test executes THIS
 * code against scripted stores rather than a copy.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ENTITLEMENT_KV } from "@/lib/entitlementsStore";
import {
  buildGiftCertificateEntitlementRecord,
  confirmGiftCertificateGrantPublished,
  createEmptyGiftCertificateGrantRow,
  initializeGiftCertificateGrant,
  type ConfirmGiftCertificateGrantResult,
  type GiftCertificateEntitlementRecord,
  type GiftCertificateGrantPublishResult,
  type GiftCertificateGrantRow,
  type GiftCertificateGrantTerms,
  type InitializeGiftCertificateGrantResult,
} from "@/lib/giftCertificateGrantState";

export {
  buildGiftCertificateEntitlementRecord,
  type GiftCertificateEntitlementRecord,
} from "@/lib/giftCertificateGrantState";

type GiftCertificateGrantNamespace = {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): {
    getRow(entitlementSessionId: string): Promise<GiftCertificateGrantRow>;
    initialize(
      entitlementSessionId: string,
      input: { terms: GiftCertificateGrantTerms; now: number },
    ): Promise<InitializeGiftCertificateGrantResult>;
    confirmPublished(
      entitlementSessionId: string,
      input: { now: number },
    ): Promise<ConfirmGiftCertificateGrantResult>;
    publish(
      entitlementSessionId: string,
      input: {
        terms: GiftCertificateGrantTerms;
        now: number;
        entitlementKey: string;
      },
    ): Promise<GiftCertificateGrantPublishResult>;
  };
};

export type GiftCertificateGrantClient = {
  getRow(entitlementSessionId: string): Promise<GiftCertificateGrantRow | null>;
  initialize(
    entitlementSessionId: string,
    input: { terms: GiftCertificateGrantTerms; now: number },
  ): Promise<InitializeGiftCertificateGrantResult | null>;
  confirmPublished(
    entitlementSessionId: string,
    input: { now: number },
  ): Promise<ConfirmGiftCertificateGrantResult | null>;
  publish(
    entitlementSessionId: string,
    input: {
      terms: GiftCertificateGrantTerms;
      now: number;
      writeEntitlementRecord: (
        record: GiftCertificateEntitlementRecord,
      ) => Promise<void>;
    },
  ): Promise<GiftCertificateGrantPublishResult | null>;
};

const memoryRows = new Map<string, GiftCertificateGrantRow>();
const memoryLocks = new Map<string, Promise<void>>();

/**
 * Whether the volatile in-memory store may stand in for the DO. Same
 * posture as the entitlement authority (PR #362 hardening): the
 * explicit named opt-in or a development/test NODE_ENV — neither of
 * which a production deployment carries. Production behaviour with no
 * DO binding resolved: fail closed (null), and the redeem route
 * answers a retryable 503.
 */
export function isLocalGiftCertificateGrantFallbackAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.STARMAP_GIFT_CERTIFICATE_GRANT_LOCAL === "1") return true;
  const nodeEnv = env.NODE_ENV?.trim();
  return nodeEnv === "development" || nodeEnv === "test";
}

async function withMemoryLock<T>(
  entitlementSessionId: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  const prev = memoryLocks.get(entitlementSessionId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  memoryLocks.set(
    entitlementSessionId,
    prev.then(() => gate),
  );
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

function getMemoryRow(entitlementSessionId: string): GiftCertificateGrantRow {
  return memoryRows.get(entitlementSessionId) ?? createEmptyGiftCertificateGrantRow(entitlementSessionId);
}

/** Test-only: reset the in-memory grant authority (unit harnesses). */
export function __resetGiftCertificateGrantMemoryForTests() {
  memoryRows.clear();
  memoryLocks.clear();
}

function namespaceFromEnvRecord(env: unknown): GiftCertificateGrantNamespace | null {
  if (!env || typeof env !== "object") return null;
  const binding = (env as { GIFT_CERTIFICATE_GRANT?: GiftCertificateGrantNamespace })
    .GIFT_CERTIFICATE_GRANT;
  return binding ?? null;
}

/**
 * Build a grant client. Pass the Worker handler's env explicitly from
 * non-request entry points; route handlers may omit it and resolve
 * via the OpenNext Cloudflare context.
 */
export function createGiftCertificateGrantClient(
  explicitEnv?: unknown,
): GiftCertificateGrantClient {
  const resolveNamespace = (): GiftCertificateGrantNamespace | null => {
    const fromExplicit = namespaceFromEnvRecord(explicitEnv);
    if (fromExplicit) return fromExplicit;
    try {
      const { env } = getCloudflareContext();
      return namespaceFromEnvRecord(env);
    } catch {
      return null;
    }
  };

  return {
    async getRow(entitlementSessionId: string) {
      const trimmed = entitlementSessionId.trim();
      if (!trimmed) return null;
      const ns = resolveNamespace();
      if (ns) {
        try {
          const stub = ns.get(ns.idFromName(trimmed));
          return await stub.getRow(trimmed);
        } catch {
          if (isLocalGiftCertificateGrantFallbackAllowed()) return getMemoryRow(trimmed);
          return null;
        }
      }
      if (isLocalGiftCertificateGrantFallbackAllowed()) return getMemoryRow(trimmed);
      return null;
    },
    async initialize(entitlementSessionId, input) {
      const trimmed = entitlementSessionId.trim();
      if (!trimmed) return null;
      const ns = resolveNamespace();
      if (ns) {
        try {
          const stub = ns.get(ns.idFromName(trimmed));
          return await stub.initialize(trimmed, input);
        } catch {
          if (!isLocalGiftCertificateGrantFallbackAllowed()) return null;
        }
      }
      if (isLocalGiftCertificateGrantFallbackAllowed()) {
        return withMemoryLock(trimmed, () => {
          const result = initializeGiftCertificateGrant(getMemoryRow(trimmed), input);
          if (result.changed) memoryRows.set(trimmed, result.row);
          return result;
        });
      }
      return null;
    },
    async confirmPublished(entitlementSessionId, input) {
      const trimmed = entitlementSessionId.trim();
      if (!trimmed) return null;
      const ns = resolveNamespace();
      if (ns) {
        try {
          const stub = ns.get(ns.idFromName(trimmed));
          return await stub.confirmPublished(trimmed, input);
        } catch {
          if (!isLocalGiftCertificateGrantFallbackAllowed()) return null;
        }
      }
      if (isLocalGiftCertificateGrantFallbackAllowed()) {
        return withMemoryLock(trimmed, () => {
          const result = confirmGiftCertificateGrantPublished(getMemoryRow(trimmed), input);
          if (result.changed) memoryRows.set(trimmed, result.row);
          return result;
        });
      }
      return null;
    },
    async publish(entitlementSessionId, input) {
      const trimmed = entitlementSessionId.trim();
      if (!trimmed) return null;
      const ns = resolveNamespace();
      if (ns) {
        try {
          // The authority performs the entitlement write itself,
          // inside its serialized publish operation — the caller's
          // writer is deliberately NOT used on this path, so no
          // write authorization ever sits in the caller's hands
          // across an await.
          const stub = ns.get(ns.idFromName(trimmed));
          return await stub.publish(trimmed, {
            terms: input.terms,
            now: input.now,
            entitlementKey: ENTITLEMENT_KV.stripeSession(trimmed),
          });
        } catch {
          if (!isLocalGiftCertificateGrantFallbackAllowed()) return null;
        }
      }
      if (isLocalGiftCertificateGrantFallbackAllowed()) {
        // The same serialized sequence as the DO's publish, run
        // under the per-session lock — the lock covers the write,
        // so a second pass cannot confirm, deliver, or spend while
        // this pass's write is outstanding.
        return withMemoryLock(trimmed, async () => {
          const initialized = initializeGiftCertificateGrant(getMemoryRow(trimmed), {
            terms: input.terms,
            now: input.now,
          });
          if (initialized.changed) memoryRows.set(trimmed, initialized.row);
          if (!initialized.created && initialized.row.publishedAt !== null) {
            return { published: false, created: false };
          }
          await input.writeEntitlementRecord(
            buildGiftCertificateEntitlementRecord({
              plan: initialized.grant.plan,
              creditsTotal: initialized.grant.creditsTotal,
              initializedAt: initialized.grant.initializedAt,
            }),
          );
          const confirmed = confirmGiftCertificateGrantPublished(initialized.row, {
            now: input.now,
          });
          if (!confirmed.confirmed) {
            throw new Error("gift certificate grant publication could not be confirmed");
          }
          if (confirmed.changed) memoryRows.set(trimmed, confirmed.row);
          return { published: true, created: initialized.created };
        });
      }
      return null;
    },
  };
}

/**
 * The redeem route's grant entry point: ONE serialized publish
 * operation in the grant authority (see the state module for the
 * proof). The authority decides create-if-absent, performs the
 * entitlement write itself, and persists confirmation only after
 * the write resolves — so when this returns, no grant write is
 * outstanding, and delivery (the claim-token mint) and any later
 * spend are causally after the single publication write. A pass
 * that finds the grant confirmed writes NOTHING. Throws on any
 * authority failure; the caller treats a throw as a retryable abort
 * with the code still redeemable.
 */
export async function publishGiftCertificateGrant(input: {
  client: GiftCertificateGrantClient;
  entitlementSessionId: string;
  terms: GiftCertificateGrantTerms;
  now: number;
  writeEntitlementRecord: (record: GiftCertificateEntitlementRecord) => Promise<void>;
}): Promise<{ published: boolean; created: boolean }> {
  const result = await input.client.publish(input.entitlementSessionId, {
    terms: input.terms,
    now: input.now,
    writeEntitlementRecord: input.writeEntitlementRecord,
  });
  if (!result) {
    throw new Error("gift certificate grant authority unavailable");
  }
  return result;
}
