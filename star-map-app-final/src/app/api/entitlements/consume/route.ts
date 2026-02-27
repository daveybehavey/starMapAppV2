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
  lastConsumeToken?: string;
  lastConsumeRemaining?: number;
};

const sessionKey = (id: string) => `stripe:session:${id}`;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`entitlements:consume:${ip}`, 30, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const sessionId = req.cookies.get(PREMIUM_COOKIE_NAME)?.value;
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "Missing entitlement" }, { status: 401 });
  }

  const record = await kv.get<SessionRecord>(sessionKey(sessionId));
  if (!record || record.revoked) {
    return NextResponse.json({ ok: false, error: "No active entitlement" }, { status: 403 });
  }
  if (record.orderType === "print" && !record.includesDigitalAddOn) {
    return NextResponse.json({ ok: false, error: "No digital entitlement" }, { status: 402 });
  }

  let consumeToken: string | null = null;
  try {
    const payload = (await req.json()) as { token?: string };
    if (typeof payload?.token === "string" && payload.token.trim()) {
      consumeToken = payload.token.trim();
    }
  } catch {
    // ignore non-JSON bodies
  }

  if (consumeToken && record.lastConsumeToken === consumeToken) {
    return NextResponse.json({
      ok: true,
      plan: record.plan ?? "single",
      creditsRemaining: typeof record.lastConsumeRemaining === "number" ? record.lastConsumeRemaining : null,
    });
  }

  if (record.plan === "subscription") {
    if (!record.subscriptionActive && !record.paid) {
      return NextResponse.json({ ok: false, error: "Subscription inactive" }, { status: 402 });
    }
    return NextResponse.json({ ok: true, plan: "subscription", creditsRemaining: null });
  }

  const creditsRemaining = record.creditsRemaining ?? 0;
  if (creditsRemaining <= 0) {
    return NextResponse.json({ ok: false, error: "No credits remaining" }, { status: 402 });
  }

  const nextRemaining = Math.max(0, creditsRemaining - 1);
  await kv.set(sessionKey(sessionId), {
    ...record,
    creditsRemaining: nextRemaining,
    // Keep paid=true - user paid, even if credits are depleted
    paid: true,
    lastConsumeToken: consumeToken ?? record.lastConsumeToken,
    lastConsumeRemaining: nextRemaining,
  });

  return NextResponse.json({ ok: true, plan: record.plan ?? "single", creditsRemaining: nextRemaining });
}
