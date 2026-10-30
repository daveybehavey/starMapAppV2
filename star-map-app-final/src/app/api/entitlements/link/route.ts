import { NextRequest, NextResponse } from "next/server";
import {
  ENTITLEMENT_KV,
  evaluateDigitalAccess,
  type StripeSessionEntitlement,
} from "@/lib/entitlementsStore";
import { getOrCreateClaimToken } from "@/lib/accountAccessLinks";
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

  // Fix round 4 (PR #447): issuance goes through the shared helper, which
  // persists the token in its claim record + the governing pointer and
  // performs ZERO writes to the session record. This route previously
  // inlined the same logic and finished with a whole-record replacement
  // (`{ ...record, claimToken }`) from its caller-held snapshot — the
  // stale-republish class the gate rejected. The helper's reuse
  // validation is also stricter: it checks the claim record's session
  // association, which this route's inline copy omitted.
  const token = await getOrCreateClaimToken(sessionId, record, { forceNewToken: forceNew });

  const origin = new URL(req.url).origin;
  return NextResponse.json({
    ok: true,
    token,
    url: `${origin}/download?token=${encodeURIComponent(token)}`,
    mapId: record.mapId ?? null,
  });
}
