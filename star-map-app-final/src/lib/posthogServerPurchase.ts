import { hasPurchaseAnalyticsConsent } from "./purchaseAnalyticsConsent.mjs";
/**
 * Server-side PostHog `purchase` capture from Stripe webhooks / verify.
 * Idempotent per Stripe Checkout Session so ad-blockers cannot hide paid orders.
 */

import type { Ga4PurchaseInput } from "./ga4MeasurementProtocol";

const POSTHOG_PURCHASE_DEDUPE_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

function posthogPurchaseDedupeKey(sessionId: string) {
  return `posthog:purchase:${sessionId}`;
}

async function getKv() {
  // Lazy import so pure property helpers stay unit-testable without resolving kv ESM paths.
  const mod = await import("./kv");
  return mod.kv;
}

function resolvePosthogHost(): string {
  const raw = (process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com").trim();
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "https://us.i.posthog.com";
  }
}

export function buildPosthogPurchaseProperties(input: Ga4PurchaseInput): Record<string, unknown> {
  const value =
    typeof input.value === "number" && Number.isFinite(input.value) ? input.value : undefined;
  return {
    token: undefined, // filled by caller with project key — never log
    transaction_id: input.transactionId,
    revenue: value,
    value,
    currency: typeof input.currency === "string" ? input.currency.toUpperCase() : undefined,
    order_type: input.orderType ?? "digital",
    plan: input.plan ?? undefined,
    print_variant: input.printVariant ?? undefined,
    include_digital_add_on: input.includeDigitalAddOn ?? undefined,
    source: "stripe_webhook",
    server_side: true,
    $lib: "starmapco-server",
  };
}

/**
 * Capture a PostHog `purchase` once per Stripe session using the project API key.
 * No-ops when `NEXT_PUBLIC_POSTHOG_KEY` is unset. Never throws.
 */
export async function recordPosthogPurchaseOnce(
  input: Ga4PurchaseInput,
  options?: { skipQa?: boolean; signal?: AbortSignal },
): Promise<{ recorded: boolean; reason?: string }> {
  const transactionId = input.transactionId?.trim() ?? "";
  if (!transactionId) return { recorded: false, reason: "missing_transaction_id" };
  if (options?.skipQa) return { recorded: false, reason: "qa_skipped" };
  if (!hasPurchaseAnalyticsConsent(input.analyticsConsent)) return { recorded: false, reason: "consent_not_granted" };
  if (options?.signal?.aborted) return { recorded: false, reason: "aborted" };

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() || "";
  if (!apiKey) {
    console.warn("PostHog server purchase skipped: missing NEXT_PUBLIC_POSTHOG_KEY");
    return { recorded: false, reason: "missing_api_key" };
  }

  const amountTotal =
    typeof input.value === "number" && Number.isFinite(input.value) ? input.value : null;
  // Align with funnel payment_verified: skip $0 / free checkouts for revenue events.
  if (amountTotal !== null && amountTotal <= 0) {
    return { recorded: false, reason: "zero_value" };
  }

  const dedupeKey = posthogPurchaseDedupeKey(transactionId);
  const kv = await getKv();
  try {
    const prior = await kv.get<number>(dedupeKey);
    if (typeof prior === "number" && prior > 0) {
      return { recorded: false, reason: "duplicate" };
    }
  } catch {
    // Continue — capture may still succeed; Stripe retries + KV incr below provide soft dedupe.
  }

  if (options?.signal?.aborted) return { recorded: false, reason: "aborted" };
  const host = resolvePosthogHost();
  const properties = buildPosthogPurchaseProperties(input);
  delete properties.token;

  const body = {
    api_key: apiKey,
    event: "purchase",
    distinct_id: `stripe:${transactionId}`,
    properties: {
      ...properties,
      $insert_id: `purchase:${transactionId}`,
    },
    timestamp: new Date().toISOString(),
  };

  try {
    const res = await fetch(`${host}/capture/`, {
      method: "POST",
      signal: options?.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn("PostHog server purchase failed", res.status);
      return { recorded: false, reason: `http_${res.status}` };
    }
    try {
      await kv.incr(dedupeKey, 1, { ex: POSTHOG_PURCHASE_DEDUPE_TTL_SECONDS });
    } catch (err) {
      console.warn("PostHog purchase dedupe write failed", err);
    }
    return { recorded: true };
  } catch (err) {
    console.warn("PostHog server purchase error", err);
    return { recorded: false, reason: "network_error" };
  }
}
