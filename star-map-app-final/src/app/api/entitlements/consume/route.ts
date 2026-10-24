import { NextRequest, NextResponse } from "next/server";
import { applyHdCreditConsume } from "@/lib/entitlementConsume.mjs";
import { ENTITLEMENT_KV, isPrintOnlyOrder, type StripeSessionEntitlement } from "@/lib/entitlementsStore";
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
  const rateLimit = await checkRateLimit(`entitlements:consume:${ip}`, 30, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const sessionId = req.cookies.get(PREMIUM_COOKIE_NAME)?.value;
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "Missing entitlement" }, { status: 401 });
  }

  // The request body is parsed BEFORE the accounting lease is taken:
  // a slow or trickling body must not hold the lease (Codex P2, PR #367).
  let consumeToken: string | null = null;
  try {
    const payload = (await req.json()) as { token?: string };
    if (typeof payload?.token === "string" && payload.token.trim()) {
      consumeToken = payload.token.trim();
    }
  } catch {
    // ignore non-JSON bodies
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

    const result = applyHdCreditConsume(record, consumeToken);
    if (!result.ok) {
      const status = result.error === "no_credits" ? 402 : 403;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }

    if (!result.idempotent) {
      // Seal before writing: if this request stalled past its lease and
      // migration took ownership, the seal refuses and nothing is
      // written — a stale debit can never land behind a captured
      // baseline (Codex P2, PR #367).
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

      // Backstop: if a baseline was captured from the pre-write record
      // anyway (e.g. this isolate froze mid-write), restore the
      // pre-image and fail the request rather than leave the authority
      // one credit richer than the settled record.
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
            console.error("Legacy consume write conflicts with a captured baseline", { sessionId });
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
