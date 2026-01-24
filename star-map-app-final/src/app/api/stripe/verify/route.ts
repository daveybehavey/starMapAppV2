import { NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";

export async function GET(req: Request) {
  // Rate limit: 10 requests per minute per IP (prevents brute force session ID guessing)
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`stripe:verify:${ip}`, 10, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id")?.trim();
  if (!sessionId) {
    return NextResponse.json({ paid: false, error: "Missing session_id" }, { status: 400 });
  }

  const record = await kv.get<{ paid?: boolean }>(`stripe:session:${sessionId}`);
  return NextResponse.json({ paid: Boolean(record?.paid) });
}
