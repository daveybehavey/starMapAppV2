import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";
import { isValidPrintCheckoutSessionId, persistPrintOrderRecord, printOrderKey, sanitizePrintOrderForOperatorResponse, type PrintOrderRecord } from "@/lib/printOrders";
import { setPrintFulfillmentIndex } from "@/lib/printFulfillmentIndex";

export const runtime = "nodejs";

function requireAdmin(req: NextRequest) {
  const configured = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  const candidate = readAdminTokenFromHeaders(req.headers);
  return hasValidAdminToken(candidate, configured);
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  type ResolvePayload = { sessionId?: unknown; printfulOrderId?: unknown; note?: unknown };
  let payload: ResolvePayload | null = null;
  try {
    payload = (await req.json()) as ResolvePayload;
  } catch {
    payload = null;
  }

  const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId.trim() : "";
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "sessionId required" }, { status: 400 });
  }
  if (!isValidPrintCheckoutSessionId(sessionId)) {
    return NextResponse.json({ ok: false, error: "valid sessionId required" }, { status: 400 });
  }

  const existing = await kv.get<PrintOrderRecord>(printOrderKey(sessionId));
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const rawPrintfulOrderId = payload?.printfulOrderId;
  const printfulOrderId =
    typeof rawPrintfulOrderId === "string"
      ? rawPrintfulOrderId.trim()
      : typeof rawPrintfulOrderId === "number"
        ? rawPrintfulOrderId
        : "";

  const note = typeof payload?.note === "string" ? payload.note.trim() : "";
  const now = Date.now();

  const updated: PrintOrderRecord = {
    ...existing,
    status: "sent",
    sentAt: existing.sentAt ?? now,
    printfulOrderId: printfulOrderId || existing.printfulOrderId,
    operatorResolvedAt: now,
    operatorResolvedProvider: "manual_printful",
    operatorResolvedNote:
      note || (printfulOrderId ? `manual_printful_order_id=${String(printfulOrderId)}` : existing.operatorResolvedNote),
    error: undefined,
    webhookStatus: existing.webhookStatus,
  };

  await persistPrintOrderRecord(sessionId, updated);
  if (updated.printfulOrderId) {
    await setPrintFulfillmentIndex(updated.printfulOrderId, sessionId);
  }
  return NextResponse.json({ ok: true, order: sanitizePrintOrderForOperatorResponse(updated) });
}

