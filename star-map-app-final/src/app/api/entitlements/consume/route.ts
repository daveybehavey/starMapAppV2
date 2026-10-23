import { NextRequest, NextResponse } from "next/server";
import { applyHdCreditConsume } from "@/lib/entitlementConsume.mjs";
import { ENTITLEMENT_KV, isPrintOnlyOrder, type StripeSessionEntitlement } from "@/lib/entitlementsStore";
import { kv } from "@/lib/kv";
import { createEntitlementAuthorityClient } from "@/lib/entitlementAuthority";
import { acquireAccountingLease, releaseAccountingLease } from "@/lib/entitlementMigration";
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

  // DL-1 Slice 3 fence + exclusion: the whole load→mutate→write below
  // runs under the authority's accounting lease (Codex P1, PR #367). The
  // lease is what makes the fence real: migration cannot capture a
  // baseline while this route holds a pre-migration record, and this
  // route cannot start on a record migration is capturing. Once a
  // baseline exists the lease is refused for good — the Durable Object
  // is the only accounting writer, and this legacy debit is refused, not
  // double-applied (the authority debit path cuts over in Slice 6). An
  // unreachable authority fails closed (never treated as "no baseline").
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
    if (isPrintOnlyOrder(record)) {
      return NextResponse.json({ ok: false, error: "No digital entitlement" }, { status: 402 });
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
  } finally {
    await releaseAccountingLease(authorityClient, sessionId, lease.leaseId);
  }
}
