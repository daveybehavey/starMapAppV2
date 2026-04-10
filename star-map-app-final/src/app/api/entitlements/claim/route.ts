import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { PREMIUM_COOKIE_NAME, PREMIUM_COOKIE_TTL_SECONDS } from "@/lib/premium";
import { isProductionLikeRuntime } from "@/lib/runtimeEnv";
import type { CheckoutOrderType, CheckoutPlan } from "@/lib/pricing";

type ClaimRecord = {
  sessionId: string;
  mapId?: string;
  createdAt: number;
};

type SessionRecord = {
  paid?: boolean;
  revoked?: boolean;
  mapId?: string;
  plan?: CheckoutPlan;
  creditsRemaining?: number;
  subscriptionActive?: boolean;
  orderType?: CheckoutOrderType;
  includesDigitalAddOn?: boolean;
  claimToken?: string;
};

const claimKey = (token: string) => `claim:${token}`;
const sessionKey = (id: string) => `stripe:session:${id}`;

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`entitlements:claim:${ip}`, 30, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const token = new URL(req.url).searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
  }

  const claim = await kv.get<ClaimRecord>(claimKey(token));
  if (!claim?.sessionId) {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 404 });
  }

  const record = await kv.get<SessionRecord>(sessionKey(claim.sessionId));
  if (!record || record.revoked) {
    return NextResponse.json({ ok: false, error: "Access revoked" }, { status: 403 });
  }
  if (record.claimToken && record.claimToken !== token) {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 404 });
  }

  const subscriptionActive = Boolean(record.subscriptionActive);
  const creditsRemaining = record.creditsRemaining ?? 0;
  const isPrintOnly = record.orderType === "print" && !record.includesDigitalAddOn;
  const paid = !isPrintOnly && (
    record.plan === "subscription" ? subscriptionActive : creditsRemaining > 0 || Boolean(record.paid)
  );

  const response = NextResponse.json(
    {
      ok: true,
      paid,
      mapId: claim.mapId ?? record.mapId ?? null,
      plan: record.plan ?? null,
      creditsRemaining: record.plan === "subscription" ? null : creditsRemaining,
      subscriptionActive: record.plan === "subscription" ? subscriptionActive : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );

  if (paid) {
    response.cookies.set(PREMIUM_COOKIE_NAME, claim.sessionId, {
      httpOnly: true,
      secure: isProductionLikeRuntime(),
      sameSite: "lax",
      path: "/",
      maxAge: PREMIUM_COOKIE_TTL_SECONDS,
    });
  }

  return response;
}
