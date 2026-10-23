import { NextRequest, NextResponse } from "next/server";
import { applyHdCreditCompensate } from "@/lib/entitlementConsume.mjs";
import { ENTITLEMENT_KV, type StripeSessionEntitlement } from "@/lib/entitlementsStore";
import { kv } from "@/lib/kv";
import { createEntitlementAuthorityClient } from "@/lib/entitlementAuthority";
import { acquireAccountingLease, releaseAccountingLease } from "@/lib/entitlementMigration";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { PREMIUM_COOKIE_NAME } from "@/lib/premium";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`entitlements:compensate:${ip}`, 20, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const sessionId = req.cookies.get(PREMIUM_COOKIE_NAME)?.value;
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "Missing entitlement" }, { status: 401 });
  }

  // DL-1 Slice 3 fence + exclusion (see the consume route): the whole
  // load→mutate→write runs under the authority's accounting lease, so a
  // compensation can never land on a record a concurrent migration is
  // capturing — or be lost from the baseline it captures. Post-migration
  // the authority owns compensation (its compensate op, gated on the
  // same mutually exclusive recovery decision), so this legacy restore
  // is refused, and an unreachable authority fails closed.
  const authorityClient = createEntitlementAuthorityClient();
  const lease = await acquireAccountingLease(authorityClient, sessionId, "legacy_write", {
    retryDeadlineMs: 450,
  });
  if (lease.status === "authority_unavailable") {
    return NextResponse.json({ ok: false, error: "authority_unavailable" }, { status: 503 });
  }
  if (lease.status === "busy") {
    return NextResponse.json({ ok: false, error: "accounting_busy" }, { status: 503 });
  }
  if (lease.status === "fenced") {
    return NextResponse.json({ ok: false, error: "entitlement_migrated" }, { status: 409 });
  }

  try {
    const record = await kv.get<StripeSessionEntitlement>(ENTITLEMENT_KV.stripeSession(sessionId));
    if (!record || record.revoked) {
      return NextResponse.json({ ok: false, error: "No active entitlement" }, { status: 403 });
    }

    let token: string | null = null;
    try {
      const payload = (await req.json()) as { token?: string };
      if (typeof payload?.token === "string" && payload.token.trim()) {
        token = payload.token.trim();
      }
    } catch {
      // ignore non-JSON bodies
    }

    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
    }

    const result = applyHdCreditCompensate(record, token);
    if (!result.ok) {
      const status =
        result.error === "token_mismatch" || result.error === "window_expired" ? 409 : 402;
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
  } finally {
    await releaseAccountingLease(authorityClient, sessionId, lease.leaseId);
  }
}
