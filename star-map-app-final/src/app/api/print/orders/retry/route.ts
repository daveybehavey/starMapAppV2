import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { hasValidAdminToken } from "@/lib/adminAuth";
import { isPrintfulConfigured, submitPrintfulOrder } from "@/lib/printful";
import {
  buildPrintAssetUrl,
  getPrintRecipient,
  isValidPrintCheckoutSessionId,
  printOrderKey,
  type PrintOrderRecord,
} from "@/lib/printOrders";

export const runtime = "nodejs";

const printFulfillmentWebhookUrl = process.env.PRINT_FULFILLMENT_WEBHOOK_URL?.trim() || "";
const printOrderSubmissionEnabled = /^(1|true|yes)$/i.test(
  (process.env.PRINT_ORDER_SUBMISSION_ENABLED || "").trim(),
);
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com").replace(/\/+$/, "");

function readAdminToken(req: NextRequest) {
  const headerToken = req.headers.get("x-print-admin-token")?.trim();
  if (headerToken) return headerToken;
  const auth = req.headers.get("authorization")?.trim() || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}

function requireAdmin(req: NextRequest) {
  const configured = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  const candidate = readAdminToken(req);
  return hasValidAdminToken(candidate, configured);
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!printOrderSubmissionEnabled) {
    return NextResponse.json(
      { ok: false, error: "Print order submission is disabled" },
      { status: 503 },
    );
  }

  let sessionId = "";
  try {
    const body = (await req.json()) as { sessionId?: unknown } | null;
    if (typeof body?.sessionId === "string") {
      sessionId = body.sessionId.trim();
    }
  } catch {
    sessionId = "";
  }
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "sessionId required" }, { status: 400 });
  }
  if (!isValidPrintCheckoutSessionId(sessionId)) {
    return NextResponse.json({ ok: false, error: "valid sessionId required" }, { status: 400 });
  }

  const existing = await kv.get<PrintOrderRecord>(printOrderKey(sessionId));
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Print order not found" }, { status: 404 });
  }
  if (existing.status === "sent") {
    return NextResponse.json({ ok: true, status: "already_sent", order: existing });
  }

  const printAssetId = existing.printAssetId?.trim();
  if (!printAssetId) {
    const failed = {
      ...existing,
      status: "failed" as const,
      attempts: (existing.attempts ?? 0) + 1,
      error: "print_asset_missing",
    };
    await kv.set(printOrderKey(sessionId), failed);
    return NextResponse.json({ ok: false, error: failed.error, order: failed }, { status: 400 });
  }

  const printAssetUrl = existing.printAssetUrl?.trim() || buildPrintAssetUrl(siteUrl, printAssetId);
  const recipient = getPrintRecipient(existing);
  if (!recipient) {
    const failed = {
      ...existing,
      status: "failed" as const,
      attempts: (existing.attempts ?? 0) + 1,
      printAssetUrl,
      error: "shipping_details_missing",
    };
    await kv.set(printOrderKey(sessionId), failed);
    return NextResponse.json({ ok: false, error: failed.error, order: failed }, { status: 400 });
  }

  if (!isPrintfulConfigured() && !printFulfillmentWebhookUrl) {
    return NextResponse.json({ ok: false, error: "Fulfillment not configured" }, { status: 503 });
  }

  const attempts = (existing.attempts ?? 0) + 1;
  const now = Date.now();

  if (isPrintfulConfigured()) {
    const printful = await submitPrintfulOrder({
      externalId: sessionId,
      variant: existing.printVariant,
      fileUrl: printAssetUrl,
      recipient,
    });
    if (!printful.ok) {
      const failed = {
        ...existing,
        status: "failed" as const,
        attempts,
        printAssetUrl,
        webhookStatus: printful.status,
        error: printful.error ?? "printful_order_failed",
      };
      await kv.set(printOrderKey(sessionId), failed);
      return NextResponse.json({ ok: false, error: failed.error, order: failed }, { status: 502 });
    }
    const sent = {
      ...existing,
      status: "sent" as const,
      attempts,
      printAssetUrl,
      webhookStatus: printful.status,
      printfulOrderId: printful.orderId,
      sentAt: now,
      error: undefined,
    };
    await kv.set(printOrderKey(sessionId), sent);
    return NextResponse.json({ ok: true, status: "sent", order: sent });
  }

  try {
    const response = await fetch(printFulfillmentWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...existing,
        printAssetUrl,
        recipient,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Webhook ${response.status}: ${body.slice(0, 280)}`);
    }

    const sent = {
      ...existing,
      status: "sent" as const,
      attempts,
      printAssetUrl,
      webhookStatus: response.status,
      sentAt: now,
      error: undefined,
    };
    await kv.set(printOrderKey(sessionId), sent);
    return NextResponse.json({ ok: true, status: "sent", order: sent });
  } catch (error) {
    const failed = {
      ...existing,
      status: "failed" as const,
      attempts,
      printAssetUrl,
      error: error instanceof Error ? error.message.slice(0, 320) : "webhook_failed",
    };
    await kv.set(printOrderKey(sessionId), failed);
    return NextResponse.json({ ok: false, error: failed.error, order: failed }, { status: 502 });
  }
}
