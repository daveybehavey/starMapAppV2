import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { PREMIUM_COOKIE_NAME } from "@/lib/premium";
import {
  createReferralCode,
  referralKey,
  referralSessionCodeKey,
  type ReferralRecord,
  type ReferralSessionCodeRecord,
} from "@/lib/referrals";
import { withSettlementMetadata } from "@/lib/entitlementsStore";
import { appendReferralEvent } from "@/lib/referralLedger";
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

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`referrals:link:${ip}`, 20, 60);
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

  const hasDigitalAccess =
    record.orderType !== "print" || Boolean(record.includesDigitalAddOn);
  if (!hasDigitalAccess) {
    return NextResponse.json({ ok: false, error: "Digital access required" }, { status: 402 });
  }

  // S94-1 F2: the session's own generated code lives in its dedicated
  // record (see referralSessionCodeKey) — checked first, with the same
  // ownership validation as the legacy path below.
  const ownCodeRecord = await kv.get<ReferralSessionCodeRecord>(
    referralSessionCodeKey(sessionId),
  );
  const ownCode = ownCodeRecord?.code?.trim().toUpperCase();
  if (ownCode) {
    const existing = await kv.get<ReferralRecord>(referralKey(ownCode));
    if (existing?.sessionId === sessionId) {
      const origin = new URL(req.url).origin;
      return NextResponse.json({
        ok: true,
        code: ownCode,
        url: `${origin}/editor?ref=${encodeURIComponent(ownCode)}`,
      });
    }
  }

  // The attribution code may have been completed into the settlement-
  // metadata sidecar (fix round 4, PR #447): the existing-code decision
  // reads the merged view, exactly as it read the inline field before.
  // This path also resolves codes written inline on the session record
  // before the dedicated record existed.
  const mergedRecord = await withSettlementMetadata(sessionId, record);
  const existingCode = mergedRecord.referralCode?.trim().toUpperCase();
  if (existingCode) {
    const existing = await kv.get<ReferralRecord>(referralKey(existingCode));
    if (existing?.sessionId === sessionId) {
      const origin = new URL(req.url).origin;
      return NextResponse.json({
        ok: true,
        code: existingCode,
        url: `${origin}/editor?ref=${encodeURIComponent(existingCode)}`,
      });
    }
  }

  let generated: string | null = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = createReferralCode();
    const occupied = await kv.get<ReferralRecord>(referralKey(candidate));
    if (!occupied) {
      generated = candidate;
      break;
    }
  }
  if (!generated) {
    return NextResponse.json({ ok: false, error: "Could not generate referral code" }, { status: 503 });
  }

  const payload: ReferralRecord = {
    code: generated,
    sessionId,
    createdAt: Date.now(),
    visits: 0,
    conversions: 0,
    rewardsGranted: 0,
  };
  await kv.set(referralKey(generated), payload);
  // S94-1 F2: persist the code in its dedicated record — NEVER by
  // rewriting the session record from this route's stale snapshot
  // (the pre-fix write could republish pre-revocation/pre-debit
  // entitlement state over a concurrent writer's update).
  await kv.set(referralSessionCodeKey(sessionId), {
    code: generated,
    createdAt: Date.now(),
  } satisfies ReferralSessionCodeRecord);
  await appendReferralEvent({
    code: generated,
    type: "link_created",
    details: { sessionId },
  });

  const origin = new URL(req.url).origin;
  return NextResponse.json({
    ok: true,
    code: generated,
    url: `${origin}/editor?ref=${encodeURIComponent(generated)}`,
  });
}
