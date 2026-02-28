import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { normalizeReferralCode, referralKey, type ReferralRecord } from "@/lib/referrals";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`referrals:visit:${ip}`, 60, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  let code: string | null = null;
  try {
    const body = (await req.json()) as { code?: unknown } | null;
    code = normalizeReferralCode(body?.code);
  } catch {
    code = null;
  }
  if (!code) {
    return NextResponse.json({ ok: false, error: "Invalid referral code" }, { status: 400 });
  }

  const record = await kv.get<ReferralRecord>(referralKey(code));
  if (!record?.sessionId) {
    return NextResponse.json({ ok: false, error: "Referral not found" }, { status: 404 });
  }

  await kv.set(referralKey(code), {
    ...record,
    visits: (record.visits ?? 0) + 1,
  });

  return NextResponse.json({ ok: true });
}
