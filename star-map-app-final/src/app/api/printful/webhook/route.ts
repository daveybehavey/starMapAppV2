import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { normalizePrintfulOrderId } from "@/lib/printFulfillmentIndex";
import { sendShippingNotification } from "@/lib/shippingNotifications";
import {
  applyPrintfulOrderFailureFromWebhook,
  applyPrintfulOrderHoldFromWebhook,
  isPrintfulOrderFailureWebhookType,
  isPrintfulOrderHoldWebhookType,
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
    // S96-1 F7 (extends AG-081): an unresolved session must not be ACKed
    // here either. The failure and hold handlers return 503 for exactly
    // this condition so Printful retries until the provider-ID index
    // exists or external_id becomes resolvable; a 200 dropped the
    // shipment notification permanently when the event raced the
    // submit-time index write. The missing-tracking case below stays a
    // 200: the session IS resolved there (correlation exists), and a
    // redelivery of the same payload cannot supply the missing number.
    console.warn("Printful package_shipped session unresolved (retryable)", {
      printfulOrderId,
      externalId: externalId.slice(0, 64),
    });
    return NextResponse.json(
      {
        ok: false,
        status: "session_unresolved",
        event: "package_shipped",
        reason: "session_unresolved",
        printfulOrderId,
      },
      { status: 503 },
    );
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

  // AG-081: missing provider-ID index / unresolvable session — do not ACK 200.
  // Printful must retry until the index exists or external_id becomes resolvable.
  if (result.status === "session_unresolved") {
    console.warn("Printful order failure session unresolved (retryable)", {
      eventType,
      printfulOrderId: normalizePrintfulOrderId(printfulOrderId),
      externalId: externalId.slice(0, 64),
      reason: result.reason,
    });
    return NextResponse.json(
      {
        ok: false,
        status: "session_unresolved",
        event: eventType,
        reason: result.reason ?? "session_unresolved",
      },
      { status: 503 },
    );
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

async function handleOrderHold(payload: PrintfulOrderWebhookPayload, eventType: string) {
  const printfulOrderId = payload?.data?.order?.id ?? null;
  const externalId = payload?.data?.order?.external_id?.trim() || "";
  const result = await applyPrintfulOrderHoldFromWebhook({
    eventType,
    printfulOrderId,
    externalId,
    reason: payload?.data?.reason ?? null,
    orderStatus: payload?.data?.order?.status ?? null,
  });

  if (result.status === "ignored") {
    console.warn("Printful order hold webhook ignored", {
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

  // S96-1 F1: an unresolvable session must not ACK the hold away — the
  // same AG-081 retryable posture as terminal failure events.
  if (result.status === "unresolved_session") {
    console.warn("Printful order hold session unresolved (retryable)", {
      eventType,
      printfulOrderId: normalizePrintfulOrderId(printfulOrderId),
      externalId: externalId.slice(0, 64),
      reason: result.reason,
    });
    return NextResponse.json(
      {
        ok: false,
        status: "session_unresolved",
        event: eventType,
        reason: result.reason ?? "session_unresolved",
      },
      { status: 503 },
    );
  }

  if (result.status === "authority_unread") {
    console.warn("Printful order hold authority unread", {
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

  if (result.status === "alert_failed") {
    console.warn("Printful order hold alert failed", {
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

  // Hold recorded nowhere durable (KV projection missing) — ACK with an
  // explicit reconciliation signal, mirroring the failure path.
  if (result.status === "projection_missing") {
    console.warn("Printful order hold projection missing", {
      eventType,
      sessionId: result.sessionId,
      reason: result.reason,
    });
    return NextResponse.json({
      ok: true,
      status: "projection_missing",
      event: eventType,
      sessionId: result.sessionId,
      reason: result.reason ?? "reconciliation_needed",
      reconciliationNeeded: true,
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

  if (isPrintfulOrderHoldWebhookType(eventType)) {
    return handleOrderHold(payload, eventType);
  }

  return NextResponse.json({ ok: true, status: "ignored", event: eventType || "unknown" });
}

export async function GET(req: NextRequest) {
  if (!verifyWebhookToken(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, status: "ready" });
}

