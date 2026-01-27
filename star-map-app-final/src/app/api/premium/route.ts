import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { PREMIUM_COOKIE_NAME } from "@/lib/premium";

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`premium:check:${ip}`, 30, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const sessionId = req.cookies.get(PREMIUM_COOKIE_NAME)?.value;
  if (!sessionId) {
    return NextResponse.json({ paid: false }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const record = await kv.get<{ paid?: boolean }>(`stripe:session:${sessionId}`);
    return NextResponse.json(
      { paid: Boolean(record?.paid) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Premium check failed", error);
    return NextResponse.json({ paid: false }, { headers: { "Cache-Control": "no-store" } });
  }
}
