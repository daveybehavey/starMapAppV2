import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";
import { evaluatePrintMarginForPaidOrder } from "@/lib/printMargin";
import {
  getPrintRecipient,
  isLegacyAmbiguousPrintOrderFailure,
  isValidPrintCheckoutSessionId,
  printOrderKey,
  sanitizePrintOrderForOperatorResponse,
  type PrintOrderRecord,
} from "@/lib/printOrders";
import {
  getPrintOrderAuthorityState,
  inferAuthorityOnlyOrderStatus,
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

  // DO-first: missing KV is a degraded projection, not not-found, when authority exists.
  let authority = await getPrintOrderAuthorityState(sessionId);
  const kvOrder = await kv.get<PrintOrderRecord>(printOrderKey(sessionId));

  if (!authority) {
    return NextResponse.json(
      { ok: false, error: "print_order_authority_unread" },
      { status: 503 },
    );
  }

  // AG-086: legacy failed provenance while DO is uninitialized — expose reconciliation,
  // do not auto-seed terminal or imply retryability.
  if (authority.revision === 0 && isLegacyAmbiguousPrintOrderFailure(kvOrder)) {
    return NextResponse.json({
      ok: true,
      reconciliationNeeded: true,
      reason: "legacy_failure_provenance_unknown",
      order: sanitizePrintOrderForOperatorResponse(kvOrder!),
      marginPreview: null,
      authority: {
        lifecycle: authority.lifecycle,
        revision: authority.revision,
        printfulOrderId: authority.printfulOrderId,
        terminalReason: authority.terminalReason,
        terminalEventType: authority.terminalEventType,
      },
      kvProjection: {
        status: kvOrder!.status,
        printfulOrderId: kvOrder!.printfulOrderId ?? null,
        terminalEventType: undefined,
      },
    });
  }

  if (authority.revision === 0 && kvOrder) {
    await seedPrintOrderAuthorityFromKv(sessionId, kvOrder);
    authority = await getPrintOrderAuthorityState(sessionId);
  }

  if (!authority) {
    return NextResponse.json(
      { ok: false, error: "print_order_authority_unread" },
      { status: 503 },
    );
  }

  const authorityPayload = {
    lifecycle: authority.lifecycle,
    revision: authority.revision,
    printfulOrderId: authority.printfulOrderId,
    terminalReason: authority.terminalReason,
    terminalEventType: authority.terminalEventType,
  };

  if (!kvOrder) {
    if (authority.revision === 0 && authority.lifecycle === "unbound") {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const inferredStatus = inferAuthorityOnlyOrderStatus(authority);
    return NextResponse.json({
      ok: true,
      degraded: true,
      reconciliationNeeded: true,
      projectionMissing: true,
      order: {
        sessionId,
        status: inferredStatus,
        printfulOrderId: authority.printfulOrderId,
        error: authority.terminalReason,
      },
      marginPreview: null,
      authority: authorityPayload,
      kvProjection: null,
    });
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
    authority: authorityPayload,
    kvProjection: {
      status: kvOrder.status,
      printfulOrderId: kvOrder.printfulOrderId ?? null,
    },
  });
}
