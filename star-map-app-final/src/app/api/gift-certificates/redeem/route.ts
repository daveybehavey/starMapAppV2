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
      await kv.setDurable(ENTITLEMENT_KV.stripeSession(entitlementSessionId), entitlement);
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
