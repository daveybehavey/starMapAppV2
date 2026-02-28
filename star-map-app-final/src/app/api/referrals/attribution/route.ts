import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import {
  createReferralCookieValue,
  REFERRAL_COOKIE_MAX_AGE_SECONDS,
  REFERRAL_COOKIE_NAME,
} from "@/lib/referralCookie";
import { normalizeReferralCode, referralKey, type ReferralRecord } from "@/lib/referrals";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`referrals:attribution:${ip}`, 90, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const queryCode = normalizeReferralCode(req.nextUrl.searchParams.get("code"));
  let bodyCode: string | null = null;
  try {
    const body = (await req.json()) as { code?: unknown } | null;
    bodyCode = normalizeReferralCode(body?.code);
  } catch {
    bodyCode = null;
  }

  const code = queryCode ?? bodyCode;
  if (!code) {
    return NextResponse.json({ ok: false, error: "Invalid referral code" }, { status: 400 });
  }

  const record = await kv.get<ReferralRecord>(referralKey(code));
  if (!record?.sessionId) {
    return NextResponse.json({ ok: false, error: "Referral not found" }, { status: 404 });
  }

  const cookieValue = createReferralCookieValue(code);
  if (!cookieValue) {
    return NextResponse.json({ ok: false, error: "Referral attribution unavailable" }, { status: 503 });
  }

  const res = NextResponse.json({ ok: true, code });
  res.cookies.set({
    name: REFERRAL_COOKIE_NAME,
    value: cookieValue,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
  });
  return res;
}
