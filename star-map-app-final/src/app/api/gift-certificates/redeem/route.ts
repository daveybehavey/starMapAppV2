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
import { kv, withSerializedKvUpdate } from "@/lib/kv";
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
      const entitlement: StripeSessionEntitlement = {
        paid: true,
        created: Date.now(),
        revoked: false,
        plan: record.plan,
        creditsRemaining: tier.credits,
        creditsTotal: tier.credits,
        orderType: "digital",
        // The recipient's access came from a gift: review asks stay
        // off for gift-provenance records (checkoutGiftFlag contract).
        isGift: true,
      };
      // Initialize ONCE (Tier C gate fix): the write is create-if-
      // absent under the entitlement key's serialization. An
      // unconditional overwrite is NOT idempotent for mutable
      // accounting — a racing second redemption whose grant landed
      // after the recipient spent a credit would silently replenish
      // the balance. With create-if-absent, re-running the grant (a
      // retry, or the losing side of the race) is a no-op and the
      // standing record — including its spent credits — is preserved.
      const key = ENTITLEMENT_KV.stripeSession(entitlementSessionId);
      await withSerializedKvUpdate(key, async () => {
        const existing = await kv.get<StripeSessionEntitlement>(key);
        if (existing) return;
        await kv.setDurable(key, entitlement);
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
