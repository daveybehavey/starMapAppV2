import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import {
  createReferralSourceCookieValue,
  REFERRAL_COOKIE_MAX_AGE_SECONDS,
  REFERRAL_SOURCE_COOKIE_NAME,
} from "@/lib/referralCookie";
import { normalizeReferralAttribution } from "@/lib/referralAttribution";

export const runtime = "nodejs";

/** Persist utm_* (or ref_src) for checkout / Stripe metadata — no referral code required. */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`marketing:attribution:${ip}`, 120, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  type AttributionBody = {
    source?: unknown;
    medium?: unknown;
    campaign?: unknown;
    content?: unknown;
  };
  let body: AttributionBody | null = null;
  try {
    body = (await req.json()) as AttributionBody;
  } catch {
    body = null;
  }

  const attribution = normalizeReferralAttribution({
    source: body?.source ?? req.nextUrl.searchParams.get("utm_source") ?? req.nextUrl.searchParams.get("ref_src"),
    medium: body?.medium ?? req.nextUrl.searchParams.get("utm_medium"),
    campaign: body?.campaign ?? req.nextUrl.searchParams.get("utm_campaign"),
    content: body?.content ?? req.nextUrl.searchParams.get("utm_content"),
  });

  if (!attribution) {
    return NextResponse.json({ ok: false, error: "No attribution fields" }, { status: 400 });
  }

  const cookieValue = createReferralSourceCookieValue(attribution);
  if (!cookieValue) {
    return NextResponse.json({ ok: false, error: "Attribution unavailable" }, { status: 503 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: REFERRAL_SOURCE_COOKIE_NAME,
    value: cookieValue,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
  });
  return res;
}
