import { NextRequest, NextResponse } from "next/server";
import { getOrCreateClaimToken } from "@/lib/accountAccessLinks";
import {
  ENTITLEMENT_KV,
  readSessionRevocationEvidenceStrict,
  type StripeSessionEntitlement,
} from "@/lib/entitlementsStore";
import {
  createGiftCertificateKvStore,
  getGiftCertificateSigningSecret,
  giftCertificateRedeemErrorMessage,
  GIFT_CERTIFICATE_TIERS,
  redeemGiftCertificate,
} from "@/lib/giftCertificates";
import {
  createGiftCertificateGrantClient,
  publishGiftCertificateGrant,
} from "@/lib/giftCertificateGrant";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";

/**
 * Redeem a gift-certificate code. Code-alone redemption (the
 * OurImprint shape): the code is the credential. On success the route
 * grants exactly the purchased tier as a normal session-shaped
 * entitlement under the certificate's deterministic synthetic session
 * id, then mints the governing claim token through the existing
 * account-access path — the client lands in the ordinary download
 * flow with it. Errors are deliberately non-oracular: an unknown code
 * and a malformed code get the same answer.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`gift-certificates:redeem:${ip}`, 30, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  let code: unknown;
  try {
    const body = (await req.json()) as { code?: unknown } | null;
    code = body?.code;
  } catch {
    code = undefined;
  }
  if (typeof code !== "string" || !code.trim()) {
    return NextResponse.json(
      { ok: false, error: giftCertificateRedeemErrorMessage("invalid_code") },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const store = createGiftCertificateKvStore();
  const result = await redeemGiftCertificate(store, getGiftCertificateSigningSecret(), {
    code,
    now: Date.now(),
    isPaymentRevoked: async (record) => {
      // A refunded/disputed certificate purchase must not redeem.
      // Strict reader: unreadable evidence throws, and the route
      // answers 503 rather than granting on a stale negative.
      const evidence = await readSessionRevocationEvidenceStrict(
        record.stripeSessionId,
        record.paymentIntentId,
      );
      return evidence.revoked;
    },
    grantEntitlement: async ({ entitlementSessionId, record }) => {
      const tier = GIFT_CERTIFICATE_TIERS[record.tier];
      const key = ENTITLEMENT_KV.stripeSession(entitlementSessionId);
      // Publication is owned by the GiftCertificateGrantDO (Tier C
      // review condition 1, 2026-11-06). The first fix — create-if-
      // absent as a KV read-then-write under withSerializedKvUpdate —
      // serializes only within one isolate: two isolates could both
      // observe absence, and the losing pass's delayed write landed
      // after the recipient's first spend and silently replenished
      // the balance. The second fix decided create-if-absent in the
      // authority but left the write here, and the gate's return
      // verdict showed the winner's write could still be outstanding
      // when a repair pass confirmed and delivered — the same
      // replenishment one step later. The authority now performs the
      // publication itself: one serialized initialize → write →
      // confirm operation (the DO writes via its own KV binding), so
      // when the grant returns, no write is outstanding and a
      // confirmed grant is never written again. The writer passed
      // below serves only the client's local fallback, which runs
      // the same sequence under its per-session lock. See
      // giftCertificateGrantState.ts for the soundness argument and
      // giftCertificateGrant.test.mjs for the two-isolate
      // interleavings, including the negative control against this
      // route's previous KV-only strategy. Authority failure throws,
      // the route answers 503, and the code stays redeemable.
      // (`isGift: true` in the published record keeps review asks off
      // for gift-provenance records — checkoutGiftFlag contract.)
      await publishGiftCertificateGrant({
        client: createGiftCertificateGrantClient(),
        entitlementSessionId,
        terms: {
          certificateId: record.id,
          tier: record.tier,
          plan: record.plan,
          creditsTotal: tier.credits,
        },
        now: Date.now(),
        writeEntitlementRecord: async (entitlement) => {
          await kv.setDurable(key, entitlement);
        },
      });
    },
    prepareDelivery: async ({ entitlementSessionId }) => {
      // Mint the governing claim token BEFORE the code is consumed
      // (Tier C gate fix): if token persistence fails, the redemption
      // aborts here and the recipient can simply retry — the code is
      // still redeemable. getOrCreate is idempotent, so the success
      // path below re-reads the very token minted here.
      const entitlement = await kv.get<StripeSessionEntitlement>(
        ENTITLEMENT_KV.stripeSession(entitlementSessionId),
      );
      if (!entitlement) {
        throw new Error("recipient entitlement missing at delivery preparation");
      }
      await getOrCreateClaimToken(entitlementSessionId, entitlement);
    },
  }).catch(() => null);

  if (!result) {
    return NextResponse.json(
      { ok: false, error: "Something went wrong redeeming that code. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (result.kind === "rejected") {
    const status = result.reason === "signing_secret_unavailable" ? 503 : 400;
    return NextResponse.json(
      { ok: false, error: giftCertificateRedeemErrorMessage(result.reason) },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }

  const entitlement = await kv.get<StripeSessionEntitlement>(
    ENTITLEMENT_KV.stripeSession(result.entitlementSessionId),
  );
  if (!entitlement) {
    return NextResponse.json(
      { ok: false, error: "Something went wrong redeeming that code. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const claimToken = await getOrCreateClaimToken(result.entitlementSessionId, entitlement);
  const tier = GIFT_CERTIFICATE_TIERS[result.record.tier];
  return NextResponse.json(
    {
      ok: true,
      claimToken,
      plan: result.record.plan,
      tierLabel: tier.label,
      credits: tier.credits,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
