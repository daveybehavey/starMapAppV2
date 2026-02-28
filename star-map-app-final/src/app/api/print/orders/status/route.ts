import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { hasValidAdminToken } from "@/lib/adminAuth";
import {
  isValidPrintCheckoutSessionId,
  printOrderKey,
  type PrintOrderRecord,
} from "@/lib/printOrders";

export const runtime = "nodejs";

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

  return NextResponse.json({ ok: true, order });
}
