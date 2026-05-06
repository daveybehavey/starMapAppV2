import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";
import { evaluatePrintMarginForPaidOrder } from "@/lib/printMargin";
import {
  getPrintRecipient,
  isValidPrintCheckoutSessionId,
  printOrderKey,
  type PrintOrderRecord,
} from "@/lib/printOrders";

export const runtime = "nodejs";

function requireAdmin(req: NextRequest) {
  const configured = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  const candidate = readAdminTokenFromHeaders(req.headers);
  return hasValidAdminToken(candidate, configured);
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sessionId = req.nextUrl.searchParams.get("session_id")?.trim();
  if (!sessionId || !isValidPrintCheckoutSessionId(sessionId)) {
    return NextResponse.json({ ok: false, error: "valid session_id required" }, { status: 400 });
  }

  const order = await kv.get<PrintOrderRecord>(printOrderKey(sessionId));
  if (!order) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const recipient = getPrintRecipient(order);
  const marginPreview = recipient
    ? evaluatePrintMarginForPaidOrder({
        variant: order.printVariant,
        shippingCountry: recipient.country_code,
        amountTotalCents: order.amountTotal ?? null,
      })
    : null;

  return NextResponse.json({ ok: true, order, marginPreview });
}
