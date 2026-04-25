import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sendBulkQuoteAlert } from "@/lib/bulkQuoteAlerts";
import {
  BULK_QUOTE_RATE_LIMIT_PER_HOUR,
  BULK_QUOTE_RETENTION_SECONDS,
  bulkQuoteKey,
  hashClientIp,
  isBulkOrdersEnabled,
  parseBulkQuoteInput,
  type BulkQuoteRecord,
} from "@/lib/bulkQuotes";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isBulkOrdersEnabled()) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`bulk-quotes:${ip}`, BULK_QUOTE_RATE_LIMIT_PER_HOUR, 60 * 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ ok: false, error: "invalid_content_type" }, { status: 415 });
  }

  const payload = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!payload) {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const honeypot = typeof payload.website === "string" ? payload.website.trim() : "";
  if (honeypot) {
    return NextResponse.json({ ok: true, ignored: true, requestId: null });
  }

  const parsed = parseBulkQuoteInput(payload);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const now = new Date().toISOString();
  const requestId = randomUUID();
  const ipHash = hashClientIp(ip);
  const baseRecord: BulkQuoteRecord = {
    id: requestId,
    createdAt: now,
    updatedAt: now,
    status: "new",
    ...parsed.value,
    alertDelivered: false,
    alertProvider: "none",
    ipHash,
    userAgent: (req.headers.get("user-agent") || "").trim().slice(0, 280) || null,
  };

  const alertResult = await sendBulkQuoteAlert(baseRecord);
  const record: BulkQuoteRecord = {
    ...baseRecord,
    alertDelivered: alertResult.delivered,
    alertProvider: alertResult.provider,
    ...(alertResult.error ? { alertError: alertResult.error } : {}),
  };

  await kv.set(bulkQuoteKey(requestId), record, { ex: BULK_QUOTE_RETENTION_SECONDS });

  if (!alertResult.delivered && alertResult.provider !== "none") {
    console.error("bulk quote alert failed", {
      provider: alertResult.provider,
      error: alertResult.error ?? "unknown",
      requestId,
      email: record.email,
    });
  }

  return NextResponse.json({
    ok: true,
    requestId,
    alertDelivered: record.alertDelivered,
  });
}
