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

  // AG-079: keep stale KV provider B as retry-discoverable cleanup intent until
  // A-index + owned-B cleanup are proven. Only then commit order KV B→A.
  try {
    // S96 follow-up writer audit F-7: the persist below used to write
    // a record built from the handler-start read, so anything landing
    // during the DO transaction and the index awaits — a shipment
    // anchor (duplicate shipping email on redelivery, review anchor
    // lost), a hold created AFTER the resolve transaction, a terminal
    // completion — was overwritten by the resolve write. The persist
    // therefore runs in two phases around the index ops: re-read KV
    // and the authority and proceed only when this resolve still owns
    // the authority transition it made (same revision, lifecycle, and
    // provider ID the transaction returned); run the index ops; then
    // re-read and re-check AGAIN and build the persisted record from
    // that final read — state landing during the index awaits is on
    // the final read and is never overwritten (gate fix on PR #505:
    // the first version re-read only before the index ops, leaving
    // the index window itself uncovered). Only the resolution-owned
    // fields are merged onto the final record. The hold is cleared
    // only for the episode this resolve actually resolved — a hold
    // episode that opened after the transaction postdates the
    // operator action and survives.
    const reconciliationNeeded = () =>
      NextResponse.json(
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
    const transitionStillOwned = (
      record: PrintOrderRecord | null,
      authorityNow: Awaited<ReturnType<typeof getPrintOrderAuthorityState>>,
    ) =>
      Boolean(
        record &&
          authorityNow &&
          authorityNow.revision === resolved.state.revision &&
          authorityNow.lifecycle === resolved.state.lifecycle &&
          normalizeAuthorityProviderOrderId(authorityNow.printfulOrderId) ===
            normalizeAuthorityProviderOrderId(resolved.state.printfulOrderId),
      );
    const freshBeforeIndex = await kv.get<PrintOrderRecord>(printOrderKey(sessionId));
    const authorityBeforeIndex = await getPrintOrderAuthorityState(sessionId);
    if (!freshBeforeIndex || !transitionStillOwned(freshBeforeIndex, authorityBeforeIndex)) {
      return reconciliationNeeded();
    }
    const staleKvProviderId = normalizeAuthorityProviderOrderId(freshBeforeIndex.printfulOrderId);
    if (projectedProviderId) {
      await setPrintFulfillmentIndex(projectedProviderId, sessionId);
      if (staleKvProviderId && staleKvProviderId !== projectedProviderId) {
        // missing/not_owned are idempotent/safe; thrown delete failures stop before KV forgets B.
        await deletePrintFulfillmentIndexIfOwned(staleKvProviderId, sessionId);
      }
    }
    const fresh = await kv.get<PrintOrderRecord>(printOrderKey(sessionId));
    const authorityNow = await getPrintOrderAuthorityState(sessionId);
    if (!fresh || !transitionStillOwned(fresh, authorityNow)) {
      return reconciliationNeeded();
    }
    const holdEpisodeMoved =
      (fresh.providerHoldAt ?? null) !== (freshBeforeIndex.providerHoldAt ?? null);
    const updated: PrintOrderRecord = {
      ...fresh,
      status: "sent",
      sentAt: fresh.sentAt ?? now,
      printfulOrderId: projectedProviderId,
      operatorResolvedAt: now,
      operatorResolvedProvider: "manual_printful",
      operatorResolvedNote:
        note ||
        (printfulOrderId
          ? `manual_printful_order_id=${String(printfulOrderId)}`
          : fresh.operatorResolvedNote),
      error: undefined,
      terminalEventType: null,
      webhookStatus: fresh.webhookStatus,
      // S96-1 F1: an operator resolve ends any recorded Printful hold —
      // for the hold episode that existed when the resolve ran (F-7).
      ...(holdEpisodeMoved
        ? {}
        : {
            providerHoldAt: undefined,
            providerHoldReason: undefined,
            providerHoldOrderStatus: undefined,
            operatorHoldAlertedAt: undefined,
            operatorHoldAlertProvider: undefined,
            operatorHoldAlertError: undefined,
            operatorHoldEscalatedAt: undefined,
            operatorHoldEscalationAlertError: undefined,
          }),
    };
    await persistPrintOrderRecord(sessionId, updated, { allowClearTerminalFailure: true });
    return NextResponse.json({ ok: true, order: sanitizePrintOrderForOperatorResponse(updated) });
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
}
