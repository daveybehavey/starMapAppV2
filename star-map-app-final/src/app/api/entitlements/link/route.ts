import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { PREMIUM_COOKIE_NAME, PREMIUM_COOKIE_TTL_SECONDS } from "@/lib/premium";
import type { CheckoutPlan } from "@/lib/pricing";

const CLAIM_TOKEN_TTL_SECONDS = PREMIUM_COOKIE_TTL_SECONDS;

type SessionRecord = {
  paid?: boolean;
  revoked?: boolean;
  mapId?: string;
  plan?: CheckoutPlan;
  creditsRemaining?: number;
  subscriptionActive?: boolean;
  claimToken?: string;
};

type ClaimRecord = {
  sessionId: string;
  mapId?: string;
  createdAt: number;
};

const sessionKey = (id: string) => `stripe:session:${id}`;
const claimKey = (token: string) => `claim:${token}`;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`entitlements:link:${ip}`, 20, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  let forceNew = false;
  try {
    const body = (await req.json()) as { force?: boolean } | null;
    forceNew = Boolean(body?.force);
  } catch {
    // ignore missing body
  }

  const sessionId = req.cookies.get(PREMIUM_COOKIE_NAME)?.value;
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "Missing entitlement" }, { status: 401 });
  }

  const record = await kv.get<SessionRecord>(sessionKey(sessionId));
  if (!record || record.revoked) {
    return NextResponse.json({ ok: false, error: "No active entitlement" }, { status: 403 });
  }

  const subscriptionActive = Boolean(record.subscriptionActive);
  const creditsRemaining = record.creditsRemaining ?? 0;
  const hasAccess =
    record.plan === "subscription" ? subscriptionActive : creditsRemaining > 0 || Boolean(record.paid);

  if (!hasAccess) {
    return NextResponse.json({ ok: false, error: "No active access" }, { status: 402 });
  }

  let token = forceNew ? "" : record.claimToken?.trim() || "";
  if (token) {
    const existing = await kv.get<ClaimRecord>(claimKey(token));
    if (!existing) {
      token = "";
    }
  }

  if (!token) {
    token = crypto.randomUUID();
    const payload: ClaimRecord = {
      sessionId,
      mapId: record.mapId,
      createdAt: Date.now(),
    };
    await kv.set(claimKey(token), payload, { ex: CLAIM_TOKEN_TTL_SECONDS });
    await kv.set(sessionKey(sessionId), { ...record, claimToken: token });
  }

  const origin = new URL(req.url).origin;
  return NextResponse.json({
    ok: true,
    token,
    url: `${origin}/download?token=${encodeURIComponent(token)}`,
    mapId: record.mapId ?? null,
  });
}
