import { createHash } from "node:crypto";
import { createReferralCookieValue, parseReferralCookieValue } from "@/lib/referralCookie";
import { filterMetaCoupon, getMetaCheckoutTarget, META_CHECKOUT_MAX_AGE_SECONDS } from "@/lib/metaCheckout";

// Domain-separated, product-bound marker using the existing signing/expiry mechanism.
// Never retain the shopper's rejected code or treat this marker as a promotion.
function droppedCouponMarker(productId: string) {
  return `METADROP${createHash("sha256").update(productId).digest("hex").slice(0, 16)}`.toUpperCase();
}

export function createMetaCheckoutCarry(
  productId: string,
  promoCode: string | null,
  now = Date.now(),
  couponDropped = false
) {
  const target = getMetaCheckoutTarget(productId);
  if (!target) return null;
  const code = filterMetaCoupon(promoCode, target, now);
  const promo = code ? createReferralCookieValue(code, now) : null;
  const droppedPromo = !code && couponDropped
    ? createReferralCookieValue(droppedCouponMarker(productId), now)
    : null;
  if (!promo && !droppedPromo && target.kind !== "digital") return null;
  return JSON.stringify({ productId, issuedAt: now, promo, ...(droppedPromo ? { droppedPromo } : {}) });
}

export function readMetaCheckoutCarry(
  raw: string | undefined,
  now = Date.now()
): {
  promoCode?: string;
  couponDropped?: boolean;
  plan?: "single" | "pack3";
} {
  if (!raw || raw.length > 1024) return {};
  try {
    const payload = JSON.parse(raw);
    if (
      typeof payload.issuedAt !== "number" ||
      !Number.isFinite(payload.issuedAt) ||
      payload.issuedAt > now ||
      now - payload.issuedAt >= META_CHECKOUT_MAX_AGE_SECONDS * 1000 ||
      typeof payload.productId !== "string"
    )
      return {};
    const target = getMetaCheckoutTarget(payload.productId);
    if (!target) return {};
    const signed = parseReferralCookieValue(payload.promo, now);
    const dropped = parseReferralCookieValue(payload.droppedPromo, now);
    const couponDropped =
      !payload.promo &&
      dropped?.code === droppedCouponMarker(payload.productId) &&
      dropped.issuedAt === payload.issuedAt;
    const promoCode =
      signed &&
      signed.issuedAt === payload.issuedAt &&
      now - signed.issuedAt < META_CHECKOUT_MAX_AGE_SECONDS * 1000
        ? filterMetaCoupon(signed.code, target, now)
        : null;
    return {
      ...(promoCode ? { promoCode } : {}),
      ...(couponDropped ? { couponDropped: true } : {}),
      ...(target.kind === "digital" ? { plan: target.plan } : {}),
    };
  } catch {
    return {};
  }
}
