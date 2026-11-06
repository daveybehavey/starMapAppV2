/**
 * GiftCertificateGrantDO client + the redeem grant orchestration
 * (Tier C review condition 1, 2026-11-06).
 *
 * The state machine and the soundness argument live in
 * giftCertificateGrantState.ts. This module resolves the DO namespace
 * (request context or explicit env), mirrors the entitlement
 * authority's fail-closed local-fallback posture, and exposes
 * `publishGiftCertificateGrant` — the exact grant sequence the redeem
 * route runs, factored out so the two-isolate interleaving test
 * executes THIS code against scripted stores rather than a copy.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  confirmGiftCertificateGrantPublished,
  createEmptyGiftCertificateGrantRow,
  initializeGiftCertificateGrant,
  type ConfirmGiftCertificateGrantResult,
  type GiftCertificateGrantRow,
  type GiftCertificateGrantTerms,
  type InitializeGiftCertificateGrantResult,
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
  };
}

/** The session-shaped entitlement record a certificate grant publishes. */
export type GiftCertificateEntitlementRecord = {
  paid: true;
  created: number;
  revoked: false;
  plan: string;
  creditsRemaining: number;
  creditsTotal: number;
  orderType: "digital";
  isGift: true;
};

export function buildGiftCertificateEntitlementRecord(input: {
  plan: string;
  creditsTotal: number;
  initializedAt: number;
}): GiftCertificateEntitlementRecord {
  return {
    paid: true,
    created: input.initializedAt,
    revoked: false,
    plan: input.plan,
    creditsRemaining: input.creditsTotal,
    creditsTotal: input.creditsTotal,
    orderType: "digital",
    isGift: true,
  };
}

/**
 * The redeem route's grant sequence (see the state module for the
 * proof): ask the serialized authority who owns publication, write
 * the KV entitlement record ONLY inside the open publication window
 * (the initialize winner, or a repair pass while unconfirmed — both
 * write the standing terms byte-identically), then confirm. A pass
 * that finds the grant confirmed writes NOTHING, so its writes can
 * never land after a spend. Throws on any authority failure; the
 * caller treats a throw as a retryable abort with the code still
 * redeemable.
 */
export async function publishGiftCertificateGrant(input: {
  client: GiftCertificateGrantClient;
  entitlementSessionId: string;
  terms: GiftCertificateGrantTerms;
  now: number;
  writeEntitlementRecord: (record: GiftCertificateEntitlementRecord) => Promise<void>;
}): Promise<{ published: boolean; created: boolean }> {
  const initialized = await input.client.initialize(input.entitlementSessionId, {
    terms: input.terms,
    now: input.now,
  });
  if (!initialized) {
    throw new Error("gift certificate grant authority unavailable");
  }
  if (!initialized.created && initialized.row.publishedAt !== null) {
    // Already published by the winning pass. This pass must not
    // write the entitlement record under any circumstances — its
    // local view of KV may be stale, and a write here is exactly the
    // replenishment write the condition prohibits.
    return { published: false, created: false };
  }
  await input.writeEntitlementRecord(
    buildGiftCertificateEntitlementRecord({
      plan: initialized.grant.plan,
      creditsTotal: initialized.grant.creditsTotal,
      initializedAt: initialized.grant.initializedAt,
    }),
  );
  const confirmed = await input.client.confirmPublished(input.entitlementSessionId, {
    now: input.now,
  });
  if (!confirmed || !confirmed.confirmed) {
    throw new Error("gift certificate grant publication could not be confirmed");
  }
  return { published: true, created: initialized.created };
}
