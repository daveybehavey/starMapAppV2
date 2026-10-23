import { NextRequest, NextResponse } from "next/server";
import { applyHdCreditConsume } from "@/lib/entitlementConsume.mjs";
import { ENTITLEMENT_KV, isPrintOnlyOrder, type StripeSessionEntitlement } from "@/lib/entitlementsStore";
import { kv } from "@/lib/kv";
import { createEntitlementAuthorityClient } from "@/lib/entitlementAuthority";
import { checkLegacyWriterFence } from "@/lib/entitlementMigration";
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

  // DL-1 Slice 3 fence: once the entitlement has a migration baseline,
  // the Durable Object is the only accounting writer — this legacy route
  // must not debit the KV counter behind the authority's back. An
  // unreachable authority fails closed (never treated as "no baseline").
  // Full cutover of the debit path itself is Slice 6; until then a
  // migrated entitlement's legacy consume is refused, not double-applied.
  const fence = await checkLegacyWriterFence(createEntitlementAuthorityClient(), sessionId);
  if (fence.status === "authority_unavailable") {
    return NextResponse.json({ ok: false, error: "authority_unavailable" }, { status: 503 });
  }
  if (fence.status === "fenced") {
    return NextResponse.json({ ok: false, error: "entitlement_migrated" }, { status: 409 });
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

  const result = applyHdCreditConsume(record, consumeToken);
  if (!result.ok) {
    const status = result.error === "no_credits" ? 402 : 403;
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
