import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { PREMIUM_COOKIE_NAME } from "@/lib/premium";
import { referralKey, type ReferralRecord } from "@/lib/referrals";
import { getReferralEvents, type ReferralEvent } from "@/lib/referralLedger";
import type { CheckoutOrderType, CheckoutPlan } from "@/lib/pricing";

export const runtime = "nodejs";

type SessionRecord = {
  paid?: boolean;
  revoked?: boolean;
  plan?: CheckoutPlan;
  creditsRemaining?: number;
  subscriptionActive?: boolean;
  orderType?: CheckoutOrderType;
  includesDigitalAddOn?: boolean;
  referralCode?: string;
};

const sessionKey = (id: string) => `stripe:session:${id}`;

function summarizeReferralVisitSources(events: ReferralEvent[]) {
  const buckets = new Map<string, number>();
  for (const event of events) {
    if (event.type !== "visit_recorded") continue;
    const source =
      typeof event.details?.source === "string" && event.details.source.trim()
        ? event.details.source.trim().toLowerCase()
        : "unknown";
    buckets.set(source, (buckets.get(source) ?? 0) + 1);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([source, visits]) => ({ source, visits }));
}

function summarizeReferralConversionSources(events: ReferralEvent[]) {
  const buckets = new Map<string, number>();
  for (const event of events) {
    if (event.type !== "conversion_recorded") continue;
    const source =
      typeof event.details?.source === "string" && event.details.source.trim()
        ? event.details.source.trim().toLowerCase()
        : "unknown";
    buckets.set(source, (buckets.get(source) ?? 0) + 1);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([source, conversions]) => ({ source, conversions }));
}

function summarizeEventDetailCounts(
  events: ReferralEvent[],
  input: {
    type: ReferralEvent["type"];
    detailKey: string;
    fallback: string;
    limit?: number;
  },
) {
  const buckets = new Map<string, number>();
  for (const event of events) {
    if (event.type !== input.type) continue;
    const raw = event.details?.[input.detailKey];
    const key =
      typeof raw === "string" && raw.trim()
        ? raw.trim().toLowerCase()
        : input.fallback;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, input.limit ?? 5)
    .map(([value, count]) => ({ value, count }));
}

function countEventsByType(events: ReferralEvent[], type: ReferralEvent["type"]) {
  return events.reduce((count, event) => (event.type === type ? count + 1 : count), 0);
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`referrals:status:${ip}`, 30, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const sessionId = req.cookies.get(PREMIUM_COOKIE_NAME)?.value?.trim();
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "Missing entitlement" }, { status: 401 });
  }

  const session = await kv.get<SessionRecord>(sessionKey(sessionId));
  if (!session || session.revoked) {
    return NextResponse.json({ ok: false, error: "No active entitlement" }, { status: 403 });
  }

  const hasDigitalAccess =
    session.orderType !== "print" || Boolean(session.includesDigitalAddOn);
  if (!hasDigitalAccess) {
    return NextResponse.json({ ok: false, error: "Digital access required" }, { status: 402 });
  }

  const code = session.referralCode?.trim().toUpperCase() || "";
  if (!code) {
    return NextResponse.json({
      ok: true,
      code: null,
      url: null,
      visits: 0,
      conversions: 0,
      rewardsGranted: 0,
      lastConvertedAt: null,
      topVisitSources: [],
      topConversionSources: [],
      topRewardSkipReasons: [],
      topOfferVariants: [],
      rewardReversals: 0,
      conversionReversals: 0,
      events: [],
    });
  }

  const record = await kv.get<ReferralRecord>(referralKey(code));
  if (!record || record.sessionId !== sessionId) {
    return NextResponse.json({
      ok: true,
      code: null,
      url: null,
      visits: 0,
      conversions: 0,
      rewardsGranted: 0,
      lastConvertedAt: null,
      topVisitSources: [],
      topConversionSources: [],
      topRewardSkipReasons: [],
      topOfferVariants: [],
      rewardReversals: 0,
      conversionReversals: 0,
      events: [],
    });
  }

  const origin = new URL(req.url).origin;
  const events = await getReferralEvents(code, 50);
  const topVisitSources = summarizeReferralVisitSources(events);
  const topConversionSources = summarizeReferralConversionSources(events);
  const topRewardSkipReasons = summarizeEventDetailCounts(events, {
    type: "reward_skipped",
    detailKey: "reason",
    fallback: "unknown",
  });
  const topOfferVariants = summarizeEventDetailCounts(events, {
    type: "conversion_recorded",
    detailKey: "offerVariant",
    fallback: "unspecified",
  });
  const rewardReversals = countEventsByType(events, "reward_reversed");
  const conversionReversals = countEventsByType(events, "conversion_reversed");
  return NextResponse.json({
    ok: true,
    code,
    url: `${origin}/editor?ref=${encodeURIComponent(code)}`,
    visits: record.visits ?? 0,
    conversions: record.conversions ?? 0,
    rewardsGranted: record.rewardsGranted ?? 0,
    lastConvertedAt: record.lastConvertedAt ?? null,
    topVisitSources,
    topConversionSources,
    topRewardSkipReasons,
    topOfferVariants,
    rewardReversals,
    conversionReversals,
    events,
  });
}
