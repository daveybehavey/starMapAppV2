import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { KV_KEY_PREFIXES } from "@/lib/kvKeyPrefixes";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import {
  isRevenueCatWebhookAuthConfigured,
  verifyRevenueCatWebhookAuthorization,
} from "@/lib/revenueCatWebhookAuth.mjs";

export const runtime = "nodejs";

const DEDUPE_TTL_SECONDS = 60 * 60 * 24 * 14;

/**
 * RevenueCat server notifications. Configure URL + Authorization in RevenueCat → Integrations → Webhooks.
 * @see https://www.revenuecat.com/docs/integrations/webhooks
 */
export async function POST(req: NextRequest) {
  if (!isRevenueCatWebhookAuthConfigured()) {
    return NextResponse.json({ ok: false, error: "webhook_not_configured" }, { status: 503 });
  }
  if (!verifyRevenueCatWebhookAuthorization(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`revenuecat:webhook:${ip}`, 200, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const event = (body as { event?: { id?: string; type?: string; environment?: string } })?.event;
  const eventId = typeof event?.id === "string" ? event.id : "";
  const eventType = typeof event?.type === "string" ? event.type : "unknown";
  const environment = typeof event?.environment === "string" ? event.environment : undefined;

  if (eventId) {
    const dedupeKey = `${KV_KEY_PREFIXES.revenuecatWebhookEvent}${eventId}`;
    const seen = await kv.get<unknown>(dedupeKey);
    if (seen != null) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    await kv.set(dedupeKey, { receivedAt: Date.now() }, { ex: DEDUPE_TTL_SECONDS });
  }

  console.info("revenuecat_webhook", { eventType, eventId: eventId || null, environment });

  return NextResponse.json({ ok: true });
}
