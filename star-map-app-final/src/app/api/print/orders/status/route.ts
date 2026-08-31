import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";
import { evaluatePrintMarginForPaidOrder } from "@/lib/printMargin";
import {
  getPrintRecipient,
  isValidPrintCheckoutSessionId,
  printOrderKey,
  sanitizePrintOrderForOperatorResponse,
  type PrintOrderRecord,
} from "@/lib/printOrders";
import {
  getPrintOrderAuthorityState,
  projectPrintOrderWithAuthority,
  seedPrintOrderAuthorityFromKv,
} from "@/lib/printOrderAuthority";

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

  const kvOrder = await kv.get<PrintOrderRecord>(printOrderKey(sessionId));
  if (!kvOrder) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  // DO is the sole authority for lifecycle/provider id. KV is a non-authoritative mirror.
  let authority = await getPrintOrderAuthorityState(sessionId);
  if (!authority || authority.revision === 0) {
    await seedPrintOrderAuthorityFromKv(sessionId, kvOrder);
    authority = await getPrintOrderAuthorityState(sessionId);
  }
  if (!authority) {
    return NextResponse.json(
      { ok: false, error: "print_order_authority_unread" },
      { status: 503 },
    );
  }

  const order = projectPrintOrderWithAuthority(kvOrder, authority);
  const recipient = getPrintRecipient(order);
  const marginPreview = recipient
    ? evaluatePrintMarginForPaidOrder({
        variant: order.printVariant,
        shippingCountry: recipient.country_code,
        amountTotalCents: order.amountTotal ?? null,
      })
    : null;

  return NextResponse.json({
    ok: true,
    order: sanitizePrintOrderForOperatorResponse(order),
    marginPreview,
    authority: {
      lifecycle: authority.lifecycle,
      revision: authority.revision,
      printfulOrderId: authority.printfulOrderId,
    },
    kvProjection: {
      status: kvOrder.status,
      printfulOrderId: kvOrder.printfulOrderId ?? null,
    },
  });
}
