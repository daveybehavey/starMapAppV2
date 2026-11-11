import { createReferralCookieValue, parseReferralCookieValue } from "@/lib/referralCookie";
import { filterMetaCoupon, getMetaCheckoutTarget, META_CHECKOUT_MAX_AGE_SECONDS } from "@/lib/metaCheckout";

export function createMetaCheckoutCarry(productId: string, promoCode: string | null, now = Date.now()) {
  const target = getMetaCheckoutTarget(productId);
  if (!target) return null;
  const code = filterMetaCoupon(promoCode, target, now);
  const promo = code ? createReferralCookieValue(code, now) : null;
  if (!promo && target.kind !== "digital") return null;
  return JSON.stringify({ productId, issuedAt: now, promo });
}

export function readMetaCheckoutCarry(
  raw: string | undefined,
  now = Date.now()
): {
  promoCode?: string;
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
    const promoCode =
      signed &&
      signed.issuedAt === payload.issuedAt &&
      now - signed.issuedAt < META_CHECKOUT_MAX_AGE_SECONDS * 1000
        ? filterMetaCoupon(signed.code, target, now)
        : null;
    return {
      ...(promoCode ? { promoCode } : {}),
      ...(target.kind === "digital" ? { plan: target.plan } : {}),
    };
  } catch {
    return {};
  }
}
