import { NextRequest, NextResponse } from "next/server";
import {
  createGiftCertificateKvStore,
  deriveGiftCertificateCode,
  formatGiftCertificateCode,
  getGiftCertificateSigningSecret,
  GIFT_CERTIFICATE_TIERS,
} from "@/lib/giftCertificates";
import { formatPrice } from "@/lib/pricing";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";

/**
 * The buyer's certificate view data. The Stripe checkout session id is
 * the bearer credential — the same trust the /success page and
 * /api/stripe/verify already place in it — and the code is re-derived
 * server-side from the stored salt (it is never persisted). Once the
 * certificate is redeemed the code is no longer returned.
 */
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`gift-certificates:certificate:${ip}`, 30, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const sessionId = new URL(req.url).searchParams.get("session_id")?.trim();
  if (!sessionId) {
    return NextResponse.json(
      { ok: false, status: "missing_session" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const store = createGiftCertificateKvStore();
  const record = await store.findBySessionId(sessionId);
  if (!record) {
    // The webhook may not have minted yet; the confirmation page polls.
    return NextResponse.json(
      { ok: true, status: "pending" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const tier = GIFT_CERTIFICATE_TIERS[record.tier];
  const redeemed = record.redeemedAt !== null;
  let code: string | null = null;
  if (!redeemed) {
    const secret = getGiftCertificateSigningSecret();
    if (!secret) {
      return NextResponse.json(
        { ok: false, status: "unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    code = formatGiftCertificateCode(
      deriveGiftCertificateCode(secret, record.stripeSessionId, record.salt),
    );
  }

  return NextResponse.json(
    {
      ok: true,
      status: redeemed ? "redeemed" : "issued",
      tier: record.tier,
      tierLabel: tier.label,
      plan: record.plan,
      amountLabel: formatPrice(record.amountCents, record.currency),
      currency: record.currency,
      code,
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
      redeemedAt: record.redeemedAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
