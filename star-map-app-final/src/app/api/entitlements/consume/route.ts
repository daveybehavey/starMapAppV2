import { NextRequest, NextResponse } from "next/server";
import { ENTITLEMENT_KV, isPrintOnlyOrder, type StripeSessionEntitlement } from "@/lib/entitlementsStore";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { PREMIUM_COOKIE_NAME } from "@/lib/premium";

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

  const record = await kv.get<StripeSessionEntitlement>(ENTITLEMENT_KV.stripeSession(sessionId));
  if (!record || record.revoked) {
    return NextResponse.json({ ok: false, error: "No active entitlement" }, { status: 403 });
  }
  if (isPrintOnlyOrder(record)) {
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

  const lastConsumeToken = (record as StripeSessionEntitlement & { lastConsumeToken?: string }).lastConsumeToken;
  const lastConsumeRemaining = (record as StripeSessionEntitlement & { lastConsumeRemaining?: number }).lastConsumeRemaining;

  if (consumeToken && lastConsumeToken === consumeToken) {
    return NextResponse.json({
      ok: true,
      plan: record.plan ?? "single",
      creditsRemaining: typeof lastConsumeRemaining === "number" ? lastConsumeRemaining : null,
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
  await kv.set(ENTITLEMENT_KV.stripeSession(sessionId), {
    ...record,
    creditsRemaining: nextRemaining,
    paid: true,
    lastConsumeToken: consumeToken ?? lastConsumeToken,
    lastConsumeRemaining: nextRemaining,
  });

  return NextResponse.json({ ok: true, plan: record.plan ?? "single", creditsRemaining: nextRemaining });
}
