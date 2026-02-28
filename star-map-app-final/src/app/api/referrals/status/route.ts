import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { PREMIUM_COOKIE_NAME } from "@/lib/premium";
import { referralKey, type ReferralRecord } from "@/lib/referrals";
import type { CheckoutOrderType, CheckoutPlan } from "@/lib/pricing";

export const runtime = "nodejs";

type SessionRecord = {
  paid?: boolean;
  revoked?: boolean;
  plan?: CheckoutPlan;
  creditsRemaining?: number;
  subscriptionActive?: boolean;
  orderType?: CheckoutOrderType;
  includesDigitalAddOn?: boolean;
  referralCode?: string;
};

const sessionKey = (id: string) => `stripe:session:${id}`;

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`referrals:status:${ip}`, 30, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const sessionId = req.cookies.get(PREMIUM_COOKIE_NAME)?.value?.trim();
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "Missing entitlement" }, { status: 401 });
  }

  const session = await kv.get<SessionRecord>(sessionKey(sessionId));
  if (!session || session.revoked) {
    return NextResponse.json({ ok: false, error: "No active entitlement" }, { status: 403 });
  }

  const hasDigitalAccess =
    session.orderType !== "print" || Boolean(session.includesDigitalAddOn);
  if (!hasDigitalAccess) {
    return NextResponse.json({ ok: false, error: "Digital access required" }, { status: 402 });
  }

  const code = session.referralCode?.trim().toUpperCase() || "";
  if (!code) {
    return NextResponse.json({
      ok: true,
      code: null,
      url: null,
      visits: 0,
      conversions: 0,
      rewardsGranted: 0,
      lastConvertedAt: null,
    });
  }

  const record = await kv.get<ReferralRecord>(referralKey(code));
  if (!record || record.sessionId !== sessionId) {
    return NextResponse.json({
      ok: true,
      code: null,
      url: null,
      visits: 0,
      conversions: 0,
      rewardsGranted: 0,
      lastConvertedAt: null,
    });
  }

  const origin = new URL(req.url).origin;
  return NextResponse.json({
    ok: true,
    code,
    url: `${origin}/editor?ref=${encodeURIComponent(code)}`,
    visits: record.visits ?? 0,
    conversions: record.conversions ?? 0,
    rewardsGranted: record.rewardsGranted ?? 0,
    lastConvertedAt: record.lastConvertedAt ?? null,
  });
}
