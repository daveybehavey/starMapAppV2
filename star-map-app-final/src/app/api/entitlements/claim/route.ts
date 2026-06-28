import { NextRequest, NextResponse } from "next/server";
import { evaluateClaimPaid, ENTITLEMENT_KV, type ClaimTokenRecord, type StripeSessionEntitlement } from "@/lib/entitlementsStore";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { PREMIUM_COOKIE_NAME, PREMIUM_COOKIE_TTL_SECONDS } from "@/lib/premium";

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

  const claim = await kv.get<ClaimTokenRecord>(ENTITLEMENT_KV.claim(token));
  if (!claim?.sessionId) {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 404 });
  }

  const record = await kv.get<StripeSessionEntitlement>(ENTITLEMENT_KV.stripeSession(claim.sessionId));
  if (!record || record.revoked) {
    return NextResponse.json({ ok: false, error: "Access revoked" }, { status: 403 });
  }
  if (record.claimToken && record.claimToken !== token) {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 404 });
  }

  const { paid } = evaluateClaimPaid(record);
  const creditsRemaining = record.creditsRemaining ?? 0;
  const subscriptionActive = Boolean(record.subscriptionActive);

  const response = NextResponse.json({
    ok: true,
    paid,
    mapId: claim.mapId ?? record.mapId ?? null,
    plan: record.plan ?? null,
    creditsRemaining: record.plan === "subscription" ? null : creditsRemaining,
    subscriptionActive: record.plan === "subscription" ? subscriptionActive : null,
  });

  if (paid) {
    response.cookies.set(PREMIUM_COOKIE_NAME, claim.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: PREMIUM_COOKIE_TTL_SECONDS,
    });
  }

  return response;
}
