import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";
import { sendPrintOrderApprovalAlert } from "@/lib/printOrderAlerts";
import { isValidPrintCheckoutSessionId, printOrderKey, type PrintOrderRecord } from "@/lib/printOrders";

export const runtime = "nodejs";

function requireAdmin(req: NextRequest) {
  const configured = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  const candidate = readAdminTokenFromHeaders(req.headers);
  return hasValidAdminToken(candidate, configured);
}

function parsePrintfulOrderId(raw: unknown): string | number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return undefined;
    if (/^\d+$/.test(t)) return Number.parseInt(t, 10);
    return t;
  }
  return undefined;
}

function parseProvider(raw: unknown): "manual_printful" | "manual_other" | null {
  if (raw === undefined || raw === null) return null;
  if (raw === "manual_printful" || raw === "manual_other") return raw;
  return null;
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: {
    sessionId?: unknown;
    printfulOrderId?: unknown;
    provider?: unknown;
    note?: unknown;
  } | null = null;
  try {
    payload = (await req.json()) as typeof payload;
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

  const parsedPfId = parsePrintfulOrderId(payload?.printfulOrderId);
  const explicitProvider = parseProvider(payload?.provider);
  const provider: "manual_printful" | "manual_other" =
    explicitProvider ?? (parsedPfId !== undefined ? "manual_printful" : "manual_other");

  const noteRaw = typeof payload?.note === "string" ? payload.note.trim().slice(0, 500) : "";

  const existing = await kv.get<PrintOrderRecord>(printOrderKey(sessionId));
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const now = Date.now();
  const mergedPrintfulId = parsedPfId ?? existing.printfulOrderId;
  const operatorResolvedNote =
    noteRaw || (parsedPfId !== undefined ? `manual_printful_order_id=${String(parsedPfId)}` : undefined);

  let resolved: PrintOrderRecord = {
    ...existing,
    status: "sent",
    sentAt: existing.sentAt ?? now,
    printfulOrderId: mergedPrintfulId,
    operatorResolvedAt: now,
    operatorResolvedProvider: provider,
    operatorResolvedNote,
    error: undefined,
    webhookStatus: existing.webhookStatus,
  };

  if (!resolved.operatorAlertedAt) {
    const alertResult = await sendPrintOrderApprovalAlert(resolved);
    if (alertResult.delivered) {
      resolved = {
        ...resolved,
        operatorAlertedAt: Date.now(),
        operatorAlertProvider: alertResult.provider,
        operatorAlertError: undefined,
      };
    } else {
      resolved = {
        ...resolved,
        operatorAlertProvider: alertResult.provider,
        operatorAlertError: alertResult.error,
      };
    }
  }

  await kv.set(printOrderKey(sessionId), resolved);
  return NextResponse.json({ ok: true, status: "resolved", order: resolved });
}
