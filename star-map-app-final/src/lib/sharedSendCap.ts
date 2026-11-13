import { getCloudflareContext } from "@opennextjs/cloudflare";
import { type SendFamily } from "@/lib/sharedSendCapState";

export type SendCapRefusal = "send_cap_unset" | "send_cap_exhausted" | "send_cap_unavailable";
export type DispatchPrerequisite =
  | { permitted: true }
  | { permitted: false; reason: SendCapRefusal | "promotion_dispatch_disabled" };

/** Synchronous activation fence only. Capacity is exclusively owned by send-cap. */
export function dispatchPrerequisite(family: SendFamily, env?: unknown): DispatchPrerequisite {
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
type CounterResponse = { permitted?: unknown; reason?: unknown; reservation?: { id?: unknown; reservedAt?: unknown }; persisted?: unknown };
type CapService = { fetch(request: Request): Promise<Response> };
export type SendCapClient = {
  check(family: SendFamily): Promise<DispatchPrerequisite>;
  reserve(family: SendFamily): Promise<ReserveResult>;
  release(reservation: SendReservation): Promise<boolean>;
  commit(reservation: SendReservation, attemptedAt: number): Promise<boolean>;
};

/** Deliberately separate from the coordinator client's local-memory fallback.
 * An explicit env is authoritative, including when its binding is missing.
 */
export function createSendCapClient(explicitEnv?: unknown): SendCapClient {
  async function call(operation: string, input: object): Promise<CounterResponse> {
    const env = explicitEnv === undefined ? getCloudflareContext().env : explicitEnv;
    const service = (env as { SEND_CAP_SERVICE?: CapService } | null)?.SEND_CAP_SERVICE;
    if (!service) throw new Error("send_cap_binding_missing");
    const response = await service.fetch(new Request("https://send-cap/" + operation, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
    }));
    if (!response.ok) throw new Error("send_cap_unavailable");
    return response.json();
  }
  async function settle(reservation: SendReservation, attemptedAt: number | null): Promise<boolean> {
    try {
      return (await call(attemptedAt === null ? "release" : "commit", { id: reservation.id, attemptedAt }))?.persisted === true;
    } catch {
      return false;
    }
  }
  async function check(family: SendFamily): Promise<DispatchPrerequisite> {
    try {
      const result = await call("peek", {});
      if (result.permitted === false && result.reason === "send_cap_unset") return { permitted: false, reason: "send_cap_unset" };
      if (result.permitted !== true) throw new Error("invalid_counter_response");
      return dispatchPrerequisite(family, explicitEnv);
    } catch { return { permitted: false, reason: "send_cap_unavailable" }; }
  }
  return {
    check,
    async reserve(family) {
      const gate = await check(family);
      if (!gate.permitted) return gate;
      try {
        const result = await call("reserve", { family, idempotencyKey: crypto.randomUUID() });
        if (
          result?.permitted === true &&
          typeof result.reservation?.id === "string" &&
          result.reservation.id &&
          typeof result.reservation.reservedAt === "number" &&
          Number.isSafeInteger(result.reservation.reservedAt) &&
          result.reservation.reservedAt >= 0
        ) {
          const reservation = result.reservation as SendReservation;
          const finalFence = dispatchPrerequisite(family, explicitEnv);
          if (!finalFence.permitted) {
            await settle(reservation, null);
            return finalFence;
          }
          return { permitted: true, reservation };
        }
        if (
          result?.permitted === false &&
          [
            "send_cap_unset",
            "send_cap_exhausted",
            "send_cap_unavailable",
            "promotion_dispatch_disabled",
          ].includes(String(result.reason))
        )
          return result as ReserveResult;
      } catch {
        /* No fallback, including in CI/local development. */
      }
      return { permitted: false, reason: "send_cap_unavailable" };
    },
    release: (reservation) => settle(reservation, null),
    commit: (reservation, attemptedAt) => settle(reservation, attemptedAt),
  };
}
