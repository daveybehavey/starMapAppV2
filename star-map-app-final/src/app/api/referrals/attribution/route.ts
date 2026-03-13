import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import {
  createReferralSourceCookieValue,
  createReferralCookieValue,
  REFERRAL_COOKIE_MAX_AGE_SECONDS,
  REFERRAL_COOKIE_NAME,
  REFERRAL_SOURCE_COOKIE_NAME,
} from "@/lib/referralCookie";
import { normalizeReferralCode, referralKey, type ReferralRecord } from "@/lib/referrals";
import { normalizeReferralAttribution } from "@/lib/referralAttribution";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`referrals:attribution:${ip}`, 90, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const queryCode = normalizeReferralCode(req.nextUrl.searchParams.get("code"));
  const queryAttribution = normalizeReferralAttribution({
    source: req.nextUrl.searchParams.get("source") ?? req.nextUrl.searchParams.get("ref_src") ?? req.nextUrl.searchParams.get("utm_source"),
    medium: req.nextUrl.searchParams.get("medium") ?? req.nextUrl.searchParams.get("utm_medium"),
    campaign: req.nextUrl.searchParams.get("campaign") ?? req.nextUrl.searchParams.get("utm_campaign"),
    content: req.nextUrl.searchParams.get("content") ?? req.nextUrl.searchParams.get("utm_content"),
  });
  let bodyCode: string | null = null;
  let bodyAttribution: ReturnType<typeof normalizeReferralAttribution> = null;
  try {
    const body = (await req.json()) as {
      code?: unknown;
      source?: unknown;
      medium?: unknown;
      campaign?: unknown;
      content?: unknown;
    } | null;
    bodyCode = normalizeReferralCode(body?.code);
    bodyAttribution = normalizeReferralAttribution({
      source: body?.source,
      medium: body?.medium,
      campaign: body?.campaign,
      content: body?.content,
    });
  } catch {
    bodyCode = null;
    bodyAttribution = null;
  }

  const code = queryCode ?? bodyCode;
  const attribution = bodyAttribution ?? queryAttribution;
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
  const attributionCookie = createReferralSourceCookieValue(attribution);
  if (attributionCookie) {
    res.cookies.set({
      name: REFERRAL_SOURCE_COOKIE_NAME,
      value: attributionCookie,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
    });
  }
  return res;
}
