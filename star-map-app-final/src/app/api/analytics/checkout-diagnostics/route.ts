import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { getCheckoutFailureDashboard } from "@/lib/checkoutDiagnostics";
import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";

export const runtime = "nodejs";

function hasAccess(req: NextRequest) {
  const configured = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  const candidate = readAdminTokenFromHeaders(req.headers);
  return hasValidAdminToken(candidate, configured);
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`analytics:checkout-diagnostics:get:${ip}`, 20, 60);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetIn);

  if (!hasAccess(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const daysParam = Number.parseInt(new URL(req.url).searchParams.get("days") || "14", 10);
  const data = await getCheckoutFailureDashboard(daysParam);
  return NextResponse.json({ ok: true, data });
}
