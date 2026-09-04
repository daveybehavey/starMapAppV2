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
import {
  deletePrintFulfillmentIndexIfOwned,
  setPrintFulfillmentIndex,
} from "@/lib/printFulfillmentIndex";
import {
  getPrintOrderAuthorityState,
  operatorResolvePrintOrder,
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

  const rawPrintfulOrderId = payload?.printfulOrderId;
  const printfulOrderId =
    typeof rawPrintfulOrderId === "string"
      ? rawPrintfulOrderId.trim()
      : typeof rawPrintfulOrderId === "number"
        ? rawPrintfulOrderId
        : "";

  const note = typeof payload?.note === "string" ? payload.note.trim() : "";
  const now = Date.now();

  const explicitId = normalizeAuthorityProviderOrderId(printfulOrderId);
  const bootstrapId = normalizeAuthorityProviderOrderId(existing.printfulOrderId);

  // Single serialized authority transaction: conflict-check → recover → bind.
  const resolved = await operatorResolvePrintOrder(sessionId, {
    explicitPrintfulOrderId: explicitId,
    bootstrapPrintfulOrderId: bootstrapId,
  });

  if (!resolved.ok) {
    const reason = "reason" in resolved ? resolved.reason : "unknown";
    if (reason === "authority_unread") {
      return NextResponse.json({ ok: false, error: "print_order_authority_unread" }, { status: 503 });
    }
    if (reason === "conflicting_provider_id") {
      return NextResponse.json({ ok: false, error: "conflicting_provider_id" }, { status: 409 });
    }
    // Any unsuccessful authority result stops before sent projection/index writes.
    return NextResponse.json(
      { ok: false, error: "operator_resolve_failed", reason },
      { status: 503 },
    );
  }

  if (!resolved.state) {
    return NextResponse.json({ ok: false, error: "print_order_authority_unread" }, { status: 503 });
  }

  // Projection/index only from returned authority state — never recompute from stale KV.
  const projectedProviderId =
    normalizeAuthorityProviderOrderId(resolved.state.printfulOrderId) || undefined;
  const staleKvProviderId = normalizeAuthorityProviderOrderId(existing.printfulOrderId);

  const updated: PrintOrderRecord = {
    ...existing,
    status: "sent",
    sentAt: existing.sentAt ?? now,
    printfulOrderId: projectedProviderId,
    operatorResolvedAt: now,
    operatorResolvedProvider: "manual_printful",
    operatorResolvedNote:
      note ||
      (printfulOrderId
        ? `manual_printful_order_id=${String(printfulOrderId)}`
        : existing.operatorResolvedNote),
    error: undefined,
    terminalEventType: null,
    webhookStatus: existing.webhookStatus,
  };

  // AG-079: keep stale KV provider B as retry-discoverable cleanup intent until
  // A-index + owned-B cleanup are proven. Only then commit order KV B→A.
  try {
    if (projectedProviderId) {
      await setPrintFulfillmentIndex(projectedProviderId, sessionId);
      if (staleKvProviderId && staleKvProviderId !== projectedProviderId) {
        // missing/not_owned are idempotent/safe; thrown delete failures stop before KV forgets B.
        await deletePrintFulfillmentIndexIfOwned(staleKvProviderId, sessionId);
      }
    }
    await persistPrintOrderRecord(sessionId, updated, { allowClearTerminalFailure: true });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "projection_repair_failed",
        reason: "reconciliation_needed",
        authority: {
          lifecycle: resolved.state.lifecycle,
          revision: resolved.state.revision,
          printfulOrderId: resolved.state.printfulOrderId,
        },
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, order: sanitizePrintOrderForOperatorResponse(updated) });
}
