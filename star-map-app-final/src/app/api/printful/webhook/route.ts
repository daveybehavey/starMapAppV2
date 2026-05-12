import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { isValidPrintCheckoutSessionId } from "@/lib/printOrders";
import { sendShippingNotification } from "@/lib/shippingNotifications";

export const runtime = "nodejs";

/**
 * Printful webhook receiver.
 *
 * Configure in Printful Dashboard → Stores → Your store → API → Webhooks:
 *   URL:    https://starmapco.com/api/printful/webhook?token=<PRINTFUL_WEBHOOK_SECRET>
 *   Events: at minimum "package_shipped" (optionally "package_returned")
 *
 * Verification: a shared secret passed as `?token=` on the configured URL,
 * compared in constant time against process.env.PRINTFUL_WEBHOOK_SECRET.
 * This matches Printful's V1 webhook recommendation (no built-in HMAC); if you
 * later move to a signed mechanism we can add header verification here.
 */

type PrintfulShipmentEvent = {
  type?: string;
  data?: {
    order?: {
      external_id?: string | null;
      id?: number | string | null;
    } | null;
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
  if (eventType !== "package_shipped") {
    return NextResponse.json({ ok: true, status: "ignored", event: eventType || "unknown" });
  }

  const externalId = payload?.data?.order?.external_id?.trim() || "";
  if (!externalId || !isValidPrintCheckoutSessionId(externalId)) {
    return NextResponse.json(
      { ok: false, error: "external_id_invalid", value: externalId.slice(0, 64) },
      { status: 400 },
    );
  }

  const shipment = payload?.data?.shipment ?? null;
  const trackingNumber = shipment?.tracking_number?.trim() || "";
  if (!trackingNumber) {
    return NextResponse.json({ ok: false, error: "tracking_number_missing" }, { status: 400 });
  }

  const result = await sendShippingNotification(externalId, {
    trackingNumber,
    trackingUrl: shipment?.tracking_url ?? null,
    carrier: combineCarrier(shipment?.carrier ?? null, shipment?.service ?? null),
  });

  if (!result.ok) {
    console.warn("Shipping notification failed", {
      externalId,
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
  });
}

export async function GET(req: NextRequest) {
  if (!verifyWebhookToken(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, status: "ready" });
}
