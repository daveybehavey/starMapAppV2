import { NextRequest, NextResponse } from "next/server";
import { applyHdCreditCompensate } from "@/lib/entitlementConsume.mjs";
import { ENTITLEMENT_KV, type StripeSessionEntitlement } from "@/lib/entitlementsStore";
import { kv } from "@/lib/kv";
import { createEntitlementAuthorityClient } from "@/lib/entitlementAuthority";
import {
  acquireAccountingLease,
  legacyAccountingFingerprint,
  reconcileLegacyWrite,
  releaseAccountingLease,
  sealAccountingLease,
} from "@/lib/entitlementMigration";
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

  // The request body is parsed BEFORE the accounting lease is taken:
  // a slow or trickling body must not hold the lease (Codex P2, PR #367).
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

    const result = applyHdCreditCompensate(record, token);
    if (!result.ok) {
      const status =
        result.error === "token_mismatch" || result.error === "window_expired" ? 409 : 402;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }

    if (!result.idempotent) {
      // Seal before writing (see the consume route): a request that
      // stalled past its lease aborts here instead of landing a stale
      // restore behind a captured baseline (Codex P2, PR #367).
      const seal = await sealAccountingLease(authorityClient, sessionId, lease.leaseId);
      if (seal.status === "authority_unavailable") {
        return NextResponse.json({ ok: false, error: "authority_unavailable" }, { status: 503 });
      }
      if (seal.status === "lost") {
        return NextResponse.json({ ok: false, error: "accounting_lease_lost" }, { status: 503 });
      }

      // The .mjs helper's ok variant always carries the mutated record,
      // though its inferred typing does not express that discriminant.
      const updatedRecord = result.record as StripeSessionEntitlement;
      const pre = legacyAccountingFingerprint(record);
      const post = legacyAccountingFingerprint(updatedRecord);
      await kv.set(ENTITLEMENT_KV.stripeSession(sessionId), updatedRecord);

      // Backstop (see the consume route): a baseline captured from the
      // pre-write record means this restore missed capture — put the
      // pre-image back and fail the request rather than diverge.
      if (pre.creditsRemaining !== post.creditsRemaining || pre.lastConsumeToken !== post.lastConsumeToken || pre.lastCompensatedToken !== post.lastCompensatedToken) {
        const reconciled = await reconcileLegacyWrite(authorityClient, sessionId, {
          pre,
          post,
          loadCurrent: async () => {
            const current = await kv.get<StripeSessionEntitlement>(
              ENTITLEMENT_KV.stripeSession(sessionId),
            );
            return current ? legacyAccountingFingerprint(current) : null;
          },
          restorePre: async () => {
            await kv.set(ENTITLEMENT_KV.stripeSession(sessionId), record);
          },
        });
        if (reconciled === "authority_unavailable") {
          return NextResponse.json({ ok: false, error: "authority_unavailable" }, { status: 503 });
        }
        if (reconciled === "restored" || reconciled === "conflict") {
          if (reconciled === "conflict") {
            console.error("Legacy compensate write conflicts with a captured baseline", { sessionId });
          }
          return NextResponse.json({ ok: false, error: "accounting_handoff_failed" }, { status: 503 });
        }
      }
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
