import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { PREMIUM_COOKIE_NAME } from "@/lib/premium";
import type { CheckoutOrderType, CheckoutPlan } from "@/lib/pricing";

type SessionRecord = {
  paid?: boolean;
  revoked?: boolean;
  plan?: CheckoutPlan;
  creditsRemaining?: number;
  subscriptionActive?: boolean;
  orderType?: CheckoutOrderType;
  includesDigitalAddOn?: boolean;
};

const sessionKey = (id: string) => `stripe:session:${id}`;

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
    const record = await kv.get<SessionRecord>(sessionKey(sessionId));
    const subscriptionActive = Boolean(record?.subscriptionActive);
    const creditsRemaining = record?.creditsRemaining ?? 0;
    const hasCredits = creditsRemaining > 0;
    const isPrintOnly = record?.orderType === "print" && !record?.includesDigitalAddOn;
    // If user has credits, they're paid regardless of plan type
    // Only check subscription/paid fields if no credits remain
    const paid =
      !record?.revoked &&
      !isPrintOnly &&
      (hasCredits || (record?.plan === "subscription" ? subscriptionActive : Boolean(record?.paid)));
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
