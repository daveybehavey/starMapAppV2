import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PROMOTION_SEND_CAP_H } from "@/lib/promotionSendCap";
import { SEND_CAP_OBJECT_NAME, type SendFamily } from "@/lib/sharedSendCapState";

export type SendCapRefusal = "send_cap_unset" | "send_cap_exhausted" | "send_cap_unavailable";
export type DispatchPrerequisite =
  | { permitted: true }
  | { permitted: false; reason: SendCapRefusal | "promotion_dispatch_disabled" };

/** Null H is always FIRST, including before env/binding access. No runtime H override. */
export function dispatchPrerequisite(family: SendFamily, env?: unknown): DispatchPrerequisite {
  if (PROMOTION_SEND_CAP_H === null) return { permitted: false, reason: "send_cap_unset" };
  if (family === "promotion") {
    const value =
      env === undefined
        ? process.env.PROMOTION_DISPATCH_ENABLED
        : (env as Record<string, unknown> | null)?.PROMOTION_DISPATCH_ENABLED;
    if (typeof value !== "string" || value.trim() !== "true") {
      return { permitted: false, reason: "promotion_dispatch_disabled" };
    }
  }
  return { permitted: true };
}

export type SendReservation = { id: string; reservedAt: number };
export type ReserveResult =
  | { permitted: true; reservation: SendReservation }
  | { permitted: false; reason: SendCapRefusal | "promotion_dispatch_disabled" };
type CapStub = {
  reserveCommercialSend(input: { family: SendFamily }): Promise<ReserveResult>;
  settleCommercialSend(input: { id: string; attemptedAt: number | null }): Promise<{ persisted: true }>;
};
type CapNamespace = { idFromName(name: string): DurableObjectId; get(id: DurableObjectId): CapStub };
export type SendCapClient = {
  reserve(family: SendFamily): Promise<ReserveResult>;
  release(reservation: SendReservation): Promise<boolean>;
  commit(reservation: SendReservation, attemptedAt: number): Promise<boolean>;
};

/** Deliberately separate from the coordinator client's local-memory fallback.
 * An explicit env is authoritative, including when its binding is missing.
 */
export function createSendCapClient(explicitEnv?: unknown): SendCapClient {
  function stub(): CapStub {
    const env = explicitEnv === undefined ? getCloudflareContext().env : explicitEnv;
    const ns = (env as { CONSISTENCY_COORDINATOR?: CapNamespace } | null)?.CONSISTENCY_COORDINATOR;
    if (!ns) throw new Error("send_cap_binding_missing");
    return ns.get(ns.idFromName(SEND_CAP_OBJECT_NAME));
  }
  async function settle(reservation: SendReservation, attemptedAt: number | null): Promise<boolean> {
    try {
      return (await stub().settleCommercialSend({ id: reservation.id, attemptedAt }))?.persisted === true;
    } catch {
      return false;
    }
  }
  return {
    async reserve(family) {
      const gate = dispatchPrerequisite(family, explicitEnv);
      if (!gate.permitted) return gate;
      try {
        const result = await stub().reserveCommercialSend({ family });
        if (
          result?.permitted === true &&
          typeof result.reservation?.id === "string" &&
          result.reservation.id &&
          Number.isSafeInteger(result.reservation.reservedAt) &&
          result.reservation.reservedAt >= 0
        )
          return result;
        if (
          result?.permitted === false &&
          [
            "send_cap_unset",
            "send_cap_exhausted",
            "send_cap_unavailable",
            "promotion_dispatch_disabled",
          ].includes(result.reason)
        )
          return result;
      } catch {
        /* No fallback, including in CI/local development. */
      }
      return { permitted: false, reason: "send_cap_unavailable" };
    },
    release: (reservation) => settle(reservation, null),
    commit: (reservation, attemptedAt) => settle(reservation, attemptedAt),
  };
}
