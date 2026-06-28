import { NextRequest, NextResponse } from "next/server";
import { ENTITLEMENT_KV, evaluatePremiumAccess, type StripeSessionEntitlement } from "@/lib/entitlementsStore";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, isInternalMonitoringRequest, rateLimitResponse } from "@/lib/rateLimit";
import { PREMIUM_COOKIE_NAME } from "@/lib/premium";

export async function GET(req: NextRequest) {
  if (!isInternalMonitoringRequest(req)) {
    const ip = getClientIp(req);
    const rateLimit = await checkRateLimit(`premium:check:${ip}`, 30, 60);
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit.resetIn);
    }
  }

  const sessionId = req.cookies.get(PREMIUM_COOKIE_NAME)?.value;
  if (!sessionId) {
    return NextResponse.json({ paid: false }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const record = await kv.get<StripeSessionEntitlement>(ENTITLEMENT_KV.stripeSession(sessionId));
    const paid = evaluatePremiumAccess(record);
    const creditsRemaining = record?.creditsRemaining ?? 0;
    const subscriptionActive = Boolean(record?.subscriptionActive);
    return NextResponse.json(
      {
        paid,
        plan: record?.plan ?? null,
        orderType: record?.orderType ?? "digital",
        creditsRemaining: record?.plan === "subscription" ? null : creditsRemaining,
        subscriptionActive: record?.plan === "subscription" ? subscriptionActive : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Premium check failed", error);
    return NextResponse.json({ paid: false }, { headers: { "Cache-Control": "no-store" } });
  }
}
