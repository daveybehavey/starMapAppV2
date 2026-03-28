import { NextRequest, NextResponse } from "next/server";
import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";
import { buildLoopScorecard } from "@/lib/loopScorecard";

export const runtime = "nodejs";

function requireAdmin(req: NextRequest) {
  const configured = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  const candidate = readAdminTokenFromHeaders(req.headers);
  return hasValidAdminToken(candidate, configured);
}

function parseDays(raw: string | null) {
  if (!raw) return 14;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 14;
  return Math.min(90, parsed);
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const days = parseDays(req.nextUrl.searchParams.get("days"));
    const scorecard = await buildLoopScorecard({
      days,
      site: process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://starmapco.com",
    });
    return NextResponse.json({
      ok: true,
      ...scorecard,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "loop_scorecard_failed",
      },
      { status: 500 },
    );
  }
}
