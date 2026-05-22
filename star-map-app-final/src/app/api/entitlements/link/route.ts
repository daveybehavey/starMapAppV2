import { NextRequest, NextResponse } from "next/server";
import {
  ENTITLEMENT_KV,
  evaluateDigitalAccess,
  NEW_CLAIM_TOKEN_TTL_SECONDS,
  type ClaimTokenRecord,
  type StripeSessionEntitlement,
} from "@/lib/entitlementsStore";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { PREMIUM_COOKIE_NAME } from "@/lib/premium";

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

  const record = await kv.get<StripeSessionEntitlement>(ENTITLEMENT_KV.stripeSession(sessionId));
  if (!record || record.revoked) {
    return NextResponse.json({ ok: false, error: "No active entitlement" }, { status: 403 });
  }

  if (!evaluateDigitalAccess(record)) {
    return NextResponse.json({ ok: false, error: "No active access" }, { status: 402 });
  }

  let token = forceNew ? "" : record.claimToken?.trim() || "";
  if (token) {
    const existing = await kv.get<ClaimTokenRecord>(ENTITLEMENT_KV.claim(token));
    if (!existing) {
      token = "";
    }
  }

  if (!token) {
    token = crypto.randomUUID();
    const payload: ClaimTokenRecord = {
      sessionId,
      mapId: record.mapId,
      createdAt: Date.now(),
    };
    await kv.set(ENTITLEMENT_KV.claim(token), payload, { ex: NEW_CLAIM_TOKEN_TTL_SECONDS });
    await kv.set(ENTITLEMENT_KV.stripeSession(sessionId), { ...record, claimToken: token });
  }

  const origin = new URL(req.url).origin;
  return NextResponse.json({
    ok: true,
    token,
    url: `${origin}/download?token=${encodeURIComponent(token)}`,
    mapId: record.mapId ?? null,
  });
}
