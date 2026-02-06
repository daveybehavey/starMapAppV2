import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { PROMOTION_COUPON_CODE, runPromotionAutomation } from "@/lib/promotions";

const SUBSCRIPTION_KEY = "promotions:emails";
const SENT_KEY = "promotions:coupon-sent";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`promotions:subscribe:${ip}`, 30, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  let payload: { email?: string } | null = null;
  try {
    payload = (await req.json()) as { email?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  const current = (await kv.get<string[]>(SUBSCRIPTION_KEY)) ?? [];
  const isNewSubscriber = !current.includes(email);
  if (isNewSubscriber) {
    const next = [...current, email];
    await kv.set(SUBSCRIPTION_KEY, next);
  }

  const alreadySent = ((await kv.get<string[]>(SENT_KEY)) ?? []).includes(email);
  const automationResult = alreadySent
    ? { delivered: true, provider: "none" as const }
    : await runPromotionAutomation(email, PROMOTION_COUPON_CODE);

  if (!automationResult.delivered && automationResult.provider !== "none") {
    console.error("promotion delivery failed", {
      provider: automationResult.provider,
      error: automationResult.error ?? "unknown",
      email,
    });
  }

  if (!alreadySent && automationResult.delivered) {
    const sentEmails = (await kv.get<string[]>(SENT_KEY)) ?? [];
    if (!sentEmails.includes(email)) {
      await kv.set(SENT_KEY, [...sentEmails, email]);
    }
  }

  return NextResponse.json({
    ok: true,
    couponCode: PROMOTION_COUPON_CODE,
    isNewSubscriber,
    emailDelivered: automationResult.delivered,
    deliveryProvider: automationResult.provider,
  });
}
