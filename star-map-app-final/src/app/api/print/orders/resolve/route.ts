import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";
import {
  isValidPrintCheckoutSessionId,
  persistPrintOrderRecord,
  printOrderKey,
  sanitizePrintOrderForOperatorResponse,
  type PrintOrderRecord,
} from "@/lib/printOrders";
import { setPrintFulfillmentIndex } from "@/lib/printFulfillmentIndex";
import {
  bindPrintProviderOrderId,
  getPrintOrderAuthorityState,
  operatorRecoverPrintOrder,
  seedPrintOrderAuthorityFromKv,
} from "@/lib/printOrderAuthority";
import { normalizeAuthorityProviderOrderId } from "@/lib/printOrderAuthorityState";

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

  const authority = await getPrintOrderAuthorityState(sessionId);
  if (!authority || authority.revision === 0) {
    await seedPrintOrderAuthorityFromKv(sessionId, existing);
  }
  const current = await getPrintOrderAuthorityState(sessionId);
  if (!current) {
    return NextResponse.json({ ok: false, error: "print_order_authority_unread" }, { status: 503 });
  }
  if (current.lifecycle === "terminal_failed") {
    const recovered = await operatorRecoverPrintOrder(sessionId);
    if (!recovered.ok) {
      return NextResponse.json(
        { ok: false, error: "operator_recover_failed", reason: "reason" in recovered ? recovered.reason : "unknown" },
        { status: 503 },
      );
    }
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
  // Prefer explicit operator id, then DO authority, then KV bootstrap only.
  const resolvedProviderId =
    normalizeAuthorityProviderOrderId(printfulOrderId) ||
    normalizeAuthorityProviderOrderId(current.printfulOrderId) ||
    normalizeAuthorityProviderOrderId(existing.printfulOrderId);

  if (resolvedProviderId) {
    const bind = await bindPrintProviderOrderId(sessionId, resolvedProviderId);
    if (!bind.ok && "reason" in bind && bind.reason === "authority_unread") {
      return NextResponse.json({ ok: false, error: "print_order_authority_unread" }, { status: 503 });
    }
    if (!bind.ok && "reason" in bind && bind.reason === "conflicting_provider_id") {
      return NextResponse.json({ ok: false, error: "conflicting_provider_id" }, { status: 409 });
    }
  }

  // Projection/index must use the same authoritative ID that passed bind —
  // never recompute from raw operator input or stale KV after the fact.
  const projectedProviderId = resolvedProviderId || undefined;

  const updated: PrintOrderRecord = {
    ...existing,
    status: "sent",
    sentAt: existing.sentAt ?? now,
    printfulOrderId: projectedProviderId,
    operatorResolvedAt: now,
    operatorResolvedProvider: "manual_printful",
    operatorResolvedNote:
      note || (printfulOrderId ? `manual_printful_order_id=${String(printfulOrderId)}` : existing.operatorResolvedNote),
    error: undefined,
    webhookStatus: existing.webhookStatus,
  };

  // Explicit operator path may clear a prior terminal KV mirror.
  await persistPrintOrderRecord(sessionId, updated, { allowClearTerminalFailure: true });
  if (projectedProviderId) {
    await setPrintFulfillmentIndex(projectedProviderId, sessionId);
  }
  return NextResponse.json({ ok: true, order: sanitizePrintOrderForOperatorResponse(updated) });
}
