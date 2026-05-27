import { isValidMapId } from "@/lib/accountAccessEntitlements.mjs";
import type { CheckoutOrderType, CheckoutPlan, PrintVariant } from "@/lib/pricing";

export type StripeVerifyResult = {
  paid: boolean;
  mapId?: string | null;
  plan?: CheckoutPlan | null;
  creditsRemaining?: number | null;
  orderType?: CheckoutOrderType;
  printVariant?: PrintVariant | null;
  includesDigitalAddOn?: boolean;
  revoked?: boolean;
};

function parseRetryAfterMs(value: string | null) {
  if (!value) return null;
  const seconds = Number.parseInt(value, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return seconds * 1000;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function delayForAttempt(attempt: number) {
  return Math.min(1500 + attempt * 500, 4500);
}

function resolveDigitalEntitlement(data: {
  paid?: boolean;
  plan?: CheckoutPlan | null;
  creditsRemaining?: number | null;
}) {
  const plan =
    data.plan === "single" || data.plan === "pack3" || data.plan === "subscription" ? data.plan : null;
  const hasDigitalEntitlement =
    plan === "subscription" ||
    (typeof data.creditsRemaining === "number" ? data.creditsRemaining > 0 : Boolean(plan));
  return { plan, hasDigitalEntitlement };
}

/** Poll `/api/stripe/verify` until paid or attempts exhausted (success + download recovery). */
export async function verifyStripeCheckoutSession(
  sessionId: string,
  options?: { maxAttempts?: number },
): Promise<StripeVerifyResult> {
  const maxAttempts = options?.maxAttempts ?? 12;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const res = await fetch(`/api/stripe/verify?session_id=${encodeURIComponent(sessionId)}`, {
        cache: "no-store",
        credentials: "include",
      });
      if (res.status === 429) {
        const retryAfterMs = parseRetryAfterMs(res.headers.get("Retry-After"));
        await delay(Math.min(15_000, Math.max(1_000, retryAfterMs ?? delayForAttempt(attempt))));
        continue;
      }
      const data = (await res.json().catch(() => null)) as StripeVerifyResult | null;
      if (data?.revoked) {
        return { paid: false, revoked: true };
      }
      if (data?.paid) {
        const { plan, hasDigitalEntitlement } = resolveDigitalEntitlement(data);
        if (!hasDigitalEntitlement) {
          return {
            paid: false,
            mapId: typeof data.mapId === "string" ? data.mapId : null,
            orderType: data.orderType === "print" ? "print" : "digital",
          };
        }
        return {
          paid: true,
          mapId: typeof data.mapId === "string" ? data.mapId : null,
          plan,
          creditsRemaining:
            typeof data.creditsRemaining === "number" ? data.creditsRemaining : null,
          orderType: data.orderType === "print" ? "print" : "digital",
          printVariant: data.printVariant ?? null,
          includesDigitalAddOn: Boolean(data.includesDigitalAddOn),
        };
      }
    } catch {
      // retry
    }
    await delay(delayForAttempt(attempt));
  }
  return { paid: false };
}

export function buildDownloadPath(opts: { sessionId?: string | null; mapId?: string | null }) {
  const params = new URLSearchParams();
  const sessionId = opts.sessionId?.trim();
  const mapIdRaw = opts.mapId?.trim();
  const mapId = mapIdRaw && isValidMapId(mapIdRaw) ? mapIdRaw : null;
  if (sessionId) params.set("session_id", sessionId);
  if (mapId) params.set("map_id", mapId);
  const query = params.toString();
  return query ? `/download?${query}` : "/download";
}
