import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { PREMIUM_COOKIE_NAME, PREMIUM_TTL_SECONDS } from "@/lib/premium";

export async function GET(req: NextRequest) {
  // Rate limit: 10 requests per minute per IP (prevents brute force session ID guessing)
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`stripe:verify:${ip}`, 10, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id")?.trim();
  if (!sessionId) {
    return NextResponse.json(
      { paid: false, error: "Missing session_id" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const record = await kv.get<{ paid?: boolean }>(`stripe:session:${sessionId}`);
  const paid = Boolean(record?.paid);
  if (!paid) {
    return NextResponse.json({ paid: false }, { headers: { "Cache-Control": "no-store" } });
  }

  const response = NextResponse.json({ paid: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(PREMIUM_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PREMIUM_TTL_SECONDS,
  });
  return response;
}
