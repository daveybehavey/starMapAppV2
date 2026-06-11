import { NextRequest, NextResponse } from "next/server";
import { applyHdCreditCompensate } from "@/lib/entitlementConsume.mjs";
import { ENTITLEMENT_KV, type StripeSessionEntitlement } from "@/lib/entitlementsStore";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { PREMIUM_COOKIE_NAME } from "@/lib/premium";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`entitlements:compensate:${ip}`, 20, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const sessionId = req.cookies.get(PREMIUM_COOKIE_NAME)?.value;
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "Missing entitlement" }, { status: 401 });
  }

  const record = await kv.get<StripeSessionEntitlement>(ENTITLEMENT_KV.stripeSession(sessionId));
  if (!record || record.revoked) {
    return NextResponse.json({ ok: false, error: "No active entitlement" }, { status: 403 });
  }

  let token: string | null = null;
  try {
    const payload = (await req.json()) as { token?: string };
    if (typeof payload?.token === "string" && payload.token.trim()) {
      token = payload.token.trim();
    }
  } catch {
    // ignore non-JSON bodies
  }

  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
  }

  const result = applyHdCreditCompensate(record, token);
  if (!result.ok) {
    const status =
      result.error === "token_mismatch" || result.error === "window_expired" ? 409 : 402;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  if (!result.idempotent) {
    await kv.set(ENTITLEMENT_KV.stripeSession(sessionId), result.record);
  }

  return NextResponse.json({
    ok: true,
    plan: result.plan,
    creditsRemaining: result.creditsRemaining,
    idempotent: result.idempotent,
  });
}
