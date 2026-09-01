import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { normalizePrintfulOrderId } from "@/lib/printFulfillmentIndex";
import { sendShippingNotification } from "@/lib/shippingNotifications";
import {
  applyPrintfulOrderFailureFromWebhook,
  isPrintfulOrderFailureWebhookType,
  resolvePrintfulWebhookOrderSessionId,
  type PrintfulOrderWebhookPayload,
} from "@/lib/printfulWebhookOrderEvents";

export const runtime = "nodejs";

/**
 * Printful webhook receiver.
 *
 * Configure in Printful Dashboard → Stores → Your store → API → Webhooks:
 *   URL:    https://starmapco.com/api/printful/webhook?token=<PRINTFUL_WEBHOOK_SECRET>
 *   Events: package_shipped, order_failed, order_canceled, order_put_hold
 *
 * Verification: a shared secret passed as `?token=` on the configured URL,
 * compared in constant time against process.env.PRINTFUL_WEBHOOK_SECRET.
 */

type PrintfulShipmentEvent = PrintfulOrderWebhookPayload & {
  data?: PrintfulOrderWebhookPayload["data"] & {
    shipment?: {
      tracking_number?: string | null;
      tracking_url?: string | null;
      carrier?: string | null;
      service?: string | null;
    } | null;
  } | null;
};

function constantTimeEquals(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function verifyWebhookToken(req: NextRequest): boolean {
  const configured = process.env.PRINTFUL_WEBHOOK_SECRET?.trim() || "";
  if (!configured) return false;
  const provided =
    req.nextUrl.searchParams.get("token")?.trim() ||
    req.headers.get("x-printful-token")?.trim() ||
    "";
  return constantTimeEquals(provided, configured);
}

function combineCarrier(carrier: string | null | undefined, service: string | null | undefined): string | null {
  const parts = [carrier?.trim(), service?.trim()].filter(Boolean) as string[];
  if (parts.length === 0) return null;
  return parts.join(" ");
}

async function handlePackageShipped(payload: PrintfulShipmentEvent) {
  const printfulOrderId = normalizePrintfulOrderId(payload?.data?.order?.id ?? null);
  const externalId = payload?.data?.order?.external_id?.trim() || "";
  const sessionId = await resolvePrintfulWebhookOrderSessionId({
    printfulOrderId,
    externalId,
  });

  if (!sessionId) {
    console.warn("Printful package_shipped session unresolved", {
      printfulOrderId,
      externalId: externalId.slice(0, 64),
    });
    return NextResponse.json({
      ok: true,
      status: "ignored",
      reason: "session_unresolved",
      printfulOrderId,
    });
  }

  const shipment = payload?.data?.shipment ?? null;
  const trackingNumber = shipment?.tracking_number?.trim() || "";
  if (!trackingNumber) {
    return NextResponse.json({ ok: true, status: "ignored", reason: "tracking_number_missing" });
  }

  const result = await sendShippingNotification(sessionId, {
    trackingNumber,
    trackingUrl: shipment?.tracking_url ?? null,
    carrier: combineCarrier(shipment?.carrier ?? null, shipment?.service ?? null),
  });

  if (!result.ok) {
    console.warn("Shipping notification failed", {
      sessionId,
      printfulOrderId,
      reason: result.reason,
      provider: result.provider,
    });
    const httpStatus = result.status === "skipped" ? 200 : 502;
    return NextResponse.json(
      {
        ok: false,
        status: result.status,
        reason: result.reason,
        provider: result.provider ?? null,
      },
      { status: httpStatus },
    );
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    provider: result.provider,
    messageId: result.messageId,
    sessionId,
  });
}

async function handleOrderFailure(payload: PrintfulOrderWebhookPayload, eventType: string) {
  const printfulOrderId = payload?.data?.order?.id ?? null;
  const externalId = payload?.data?.order?.external_id?.trim() || "";
  const result = await applyPrintfulOrderFailureFromWebhook({
    eventType,
    printfulOrderId,
    externalId,
    reason: payload?.data?.reason ?? null,
    orderStatus: payload?.data?.order?.status ?? null,
  });

  if (result.status === "ignored") {
    console.warn("Printful order failure webhook ignored", {
      eventType,
      printfulOrderId: normalizePrintfulOrderId(printfulOrderId),
      externalId: externalId.slice(0, 64),
      reason: result.reason,
    });
    return NextResponse.json({
      ok: true,
      status: "ignored",
      event: eventType,
      reason: result.reason,
    });
  }

  if (result.status === "alert_failed") {
    console.warn("Printful order failure alert failed", {
      eventType,
      sessionId: result.sessionId,
      error: result.error,
    });
    return NextResponse.json(
      {
        ok: false,
        status: "alert_failed",
        event: eventType,
        sessionId: result.sessionId,
        error: result.error,
      },
      { status: 502 },
    );
  }

  // Authority unread: do not ACK 200 — Printful must retry until DO terminal sticks.
  if (result.status === "authority_unread") {
    console.warn("Printful order failure authority unread", {
      eventType,
      sessionId: result.sessionId,
      reason: result.reason,
    });
    return NextResponse.json(
      {
        ok: false,
        status: "authority_unread",
        event: eventType,
        sessionId: result.sessionId,
        reason: result.reason ?? "authority_unread",
      },
      { status: 503 },
    );
  }

  // Provider-id conflict: fail closed so we never ACK a mismatched terminal identity.
  if (result.status === "provider_id_conflict") {
    console.warn("Printful order failure provider id conflict", {
      eventType,
      sessionId: result.sessionId,
      reason: result.reason,
    });
    return NextResponse.json(
      {
        ok: false,
        status: "provider_id_conflict",
        event: eventType,
        sessionId: result.sessionId,
        reason: result.reason ?? "conflicting_provider_id",
        authority: result.authority ?? null,
      },
      { status: 409 },
    );
  }

  // Authority terminalized but KV projection missing — ACK with explicit reconciliation signal.
  if (result.status === "projection_missing") {
    console.warn("Printful order failure projection missing after authority terminal", {
      eventType,
      sessionId: result.sessionId,
      reason: result.reason,
      terminalRevision: result.terminalRevision,
    });
    return NextResponse.json({
      ok: true,
      status: "projection_missing",
      event: eventType,
      sessionId: result.sessionId,
      reason: result.reason ?? "reconciliation_needed",
      reconciliationNeeded: true,
      terminalRevision: result.terminalRevision,
      authority: result.authority ?? null,
    });
  }

  return NextResponse.json({
    ok: true,
    status: "updated",
    event: eventType,
    sessionId: result.sessionId,
  });
}

export async function POST(req: NextRequest) {
  if (!verifyWebhookToken(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: PrintfulShipmentEvent | null = null;
  try {
    payload = (await req.json()) as PrintfulShipmentEvent;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const eventType = payload?.type?.trim() || "";
  if (eventType === "package_shipped") {
    return handlePackageShipped(payload);
  }

  if (isPrintfulOrderFailureWebhookType(eventType)) {
    return handleOrderFailure(payload, eventType);
  }

  return NextResponse.json({ ok: true, status: "ignored", event: eventType || "unknown" });
}

export async function GET(req: NextRequest) {
  if (!verifyWebhookToken(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, status: "ready" });
}

