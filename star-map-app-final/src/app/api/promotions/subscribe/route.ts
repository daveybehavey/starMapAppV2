import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { PROMOTION_COUPON_CODE, runPromotionAutomation, runPromotionFollowup } from "@/lib/promotions";
import {
  emailStateKey,
  isValidPromotionEmail,
  LEGACY_FOLLOWUP_KEY,
  LEGACY_SENT_KEY,
  LEGACY_SUBSCRIPTION_KEY,
  normalizePromotionEmail,
  type PromotionEmailState,
} from "@/lib/promotionSubscriptions";

async function inLegacyList(listKey: string, email: string) {
  const list = await kv.get<string[]>(listKey);
  return Boolean(list?.includes(email));
}

async function readEmail(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const payload = (await req.json()) as { email?: string; website?: string; source?: string };
      const email = normalizePromotionEmail(payload?.email);
      const honeypot = typeof payload?.website === "string" ? payload.website.trim() : "";
      const source = typeof payload?.source === "string" ? payload.source.trim().slice(0, 48) : "";
      return { email, honeypot, source, error: email ? null : "invalid_email" };
    } catch {
      return { email: "", honeypot: "", source: "", error: "invalid_json" };
    }
  }

  try {
    const formData = await req.formData();
    const raw = formData.get("email");
    const email = normalizePromotionEmail(raw);
    const honeypotRaw = formData.get("website");
    const sourceRaw = formData.get("source");
    const honeypot = typeof honeypotRaw === "string" ? honeypotRaw.trim() : "";
    const source = typeof sourceRaw === "string" ? sourceRaw.trim().slice(0, 48) : "";
    return { email, honeypot, source, error: email ? null : "invalid_email" };
  } catch {
    return { email: "", honeypot: "", source: "", error: "invalid_email" };
  }
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`promotions:subscribe:${ip}`, 30, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const redirectTarget = req.nextUrl.searchParams.get("redirect");
  const shouldRedirectHome = redirectTarget === "1";
  const shouldRedirectEditor = redirectTarget === "editor";

  const { email, honeypot, source, error } = await readEmail(req);
  if (error) {
    if (shouldRedirectEditor) {
      const redirectUrl = new URL("/editor", req.url);
      redirectUrl.searchParams.set("mode", "quick");
      redirectUrl.searchParams.set("promo", "error");
      return NextResponse.redirect(redirectUrl, { status: 303 });
    }
    if (shouldRedirectHome) {
      return NextResponse.redirect(new URL("/?promo=error", req.url), { status: 303 });
    }
    return NextResponse.json({ ok: false, error }, { status: 400 });
  }

  if (!email || !isValidPromotionEmail(email)) {
    if (shouldRedirectEditor) {
      const redirectUrl = new URL("/editor", req.url);
      redirectUrl.searchParams.set("mode", "quick");
      redirectUrl.searchParams.set("promo", "error");
      return NextResponse.redirect(redirectUrl, { status: 303 });
    }
    if (shouldRedirectHome) {
      return NextResponse.redirect(new URL("/?promo=error", req.url), { status: 303 });
    }
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  if (honeypot) {
    if (shouldRedirectEditor) {
      const redirectUrl = new URL("/editor", req.url);
      redirectUrl.searchParams.set("mode", "quick");
      redirectUrl.searchParams.set("promo", "success");
      return NextResponse.redirect(redirectUrl, { status: 303 });
    }
    if (shouldRedirectHome) {
      return NextResponse.redirect(new URL("/?promo=success", req.url), { status: 303 });
    }
    return NextResponse.json({
      ok: true,
      couponCode: undefined,
      isNewSubscriber: false,
      emailDelivered: false,
      deliveryProvider: "none",
    });
  }

  const now = Date.now();
  const key = emailStateKey(email);
  const existingState = await kv.get<PromotionEmailState>(key);
  const [legacySubscribed, legacyCouponSent, legacyFollowupSent] = await Promise.all([
    existingState?.subscribedAt ? Promise.resolve(false) : inLegacyList(LEGACY_SUBSCRIPTION_KEY, email),
    existingState?.couponSentAt ? Promise.resolve(false) : inLegacyList(LEGACY_SENT_KEY, email),
    existingState?.followupSentAt ? Promise.resolve(false) : inLegacyList(LEGACY_FOLLOWUP_KEY, email),
  ]);

  const hadSubscription = Boolean(existingState?.subscribedAt) || legacySubscribed;
  const isNewSubscriber = !hadSubscription;

  const nextState: PromotionEmailState = {
    subscribedAt: existingState?.unsubscribedAt ? now : existingState?.subscribedAt ?? now,
    couponSentAt: existingState?.couponSentAt,
    followupSentAt: existingState?.followupSentAt,
    unsubscribedAt: undefined,
    unsubscribeReason: undefined,
    updatedAt: now,
    lastSource: source || existingState?.lastSource,
  };

  const alreadySent = Boolean(nextState.couponSentAt) || legacyCouponSent;
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
    nextState.couponSentAt = now;
  }

  const followupAlreadySent = Boolean(nextState.followupSentAt) || legacyFollowupSent;
  const shouldAttemptFollowup = !followupAlreadySent && (automationResult.delivered || alreadySent);
  if (shouldAttemptFollowup) {
    try {
      const followupResult = await runPromotionFollowup(email, PROMOTION_COUPON_CODE);
      if (!followupResult.delivered && followupResult.provider !== "none") {
        console.error("promotion followup failed", {
          provider: followupResult.provider,
          error: followupResult.error ?? "unknown",
          email,
        });
      }
      if (followupResult.delivered) {
        nextState.followupSentAt = Date.now();
      }
    } catch (error) {
      console.error("promotion followup scheduling failed", error);
    }
  }

  await kv.set(key, nextState);

  if (shouldRedirectEditor) {
    const redirectUrl = new URL("/editor", req.url);
    redirectUrl.searchParams.set("mode", "quick");
    redirectUrl.searchParams.set("promo", "success");
    redirectUrl.searchParams.set("code", PROMOTION_COUPON_CODE);
    return NextResponse.redirect(redirectUrl, { status: 303 });
  }

  if (shouldRedirectHome) {
    const redirectUrl = new URL("/", req.url);
    redirectUrl.searchParams.set("promo", "success");
    redirectUrl.searchParams.set("code", PROMOTION_COUPON_CODE);
    return NextResponse.redirect(redirectUrl, { status: 303 });
  }

  return NextResponse.json({
    ok: true,
    couponCode: PROMOTION_COUPON_CODE,
    isNewSubscriber,
    emailDelivered: automationResult.delivered,
    deliveryProvider: automationResult.provider,
  });
}
