import { NextRequest, NextResponse } from "next/server";
import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";
import { isValidPrintCheckoutSessionId } from "@/lib/printOrders";
import { sendShippingNotification } from "@/lib/shippingNotifications";

export const runtime = "nodejs";

/**
 * Admin-only manual trigger for the customer shipping email.
 *
 *   POST /api/print/orders/notify-shipping
 *   Authorization: Bearer <PRINT_ADMIN_TOKEN>
 *   {
 *     "sessionId": "smc_126591c805f7247bc21de3cf",
 *     "trackingNumber": "9261290389122587376598",
 *     "carrier": "DHL Globalmail Parcel Expedited",
 *     "trackingUrl": "https://...",                         // optional, auto-inferred otherwise
 *     "estimatedDeliveryFrom": "May 12",                    // optional
 *     "estimatedDeliveryTo": "May 18"                       // optional
 *   }
 *
 * Use cases:
 *   - First-time bootstrap for orders that shipped before the webhook was wired
 *   - Re-sending if the webhook delivery failed or Resend bounced and you fixed it
 *   - Customer support: re-issue a tracking email on request
 *
 * Idempotent: won't re-send for the same tracking number unless you change it.
 */

function requireAdmin(req: NextRequest) {
  const configured = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  const candidate = readAdminTokenFromHeaders(req.headers);
  return hasValidAdminToken(candidate, configured);
}

type RequestPayload = {
  sessionId?: unknown;
  trackingNumber?: unknown;
  carrier?: unknown;
  trackingUrl?: unknown;
  estimatedDeliveryFrom?: unknown;
  estimatedDeliveryTo?: unknown;
  productLabel?: unknown;
};

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: RequestPayload | null = null;
  try {
    payload = (await req.json()) as RequestPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sessionId = asTrimmedString(payload?.sessionId);
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "sessionId required" }, { status: 400 });
  }
  if (!isValidPrintCheckoutSessionId(sessionId)) {
    return NextResponse.json({ ok: false, error: "valid sessionId required" }, { status: 400 });
  }

  const trackingNumber = asTrimmedString(payload?.trackingNumber);
  if (!trackingNumber) {
    return NextResponse.json({ ok: false, error: "trackingNumber required" }, { status: 400 });
  }

  const result = await sendShippingNotification(sessionId, {
    trackingNumber,
    carrier: asTrimmedString(payload?.carrier) || null,
    trackingUrl: asTrimmedString(payload?.trackingUrl) || null,
    estimatedDeliveryFrom: asTrimmedString(payload?.estimatedDeliveryFrom) || null,
    estimatedDeliveryTo: asTrimmedString(payload?.estimatedDeliveryTo) || null,
    productLabel: asTrimmedString(payload?.productLabel) || null,
  });

  if (!result.ok) {
    const httpStatus = result.status === "skipped" ? 409 : 502;
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
