import { NextRequest, NextResponse } from "next/server";
import {
  META_CHECKOUT_COOKIE_NAME,
  META_CHECKOUT_MAX_AGE_SECONDS,
  resolveMetaCheckout,
} from "@/lib/metaCheckout";
import { createMetaCheckoutCarry } from "@/lib/metaCheckoutCookie";
import { createReferralSourceCookieValue, REFERRAL_SOURCE_COOKIE_NAME } from "@/lib/referralCookie";

export const runtime = "nodejs";

/** Arrival only: never creates a session, asset, hold, or order. */
export function GET(req: NextRequest) {
  const now = Date.now();
  const result = resolveMetaCheckout(req.nextUrl.searchParams, now);
  const response = NextResponse.redirect(new URL(result.href, req.url), 302);
  response.headers.set("Cache-Control", "private, no-store");
  if (!result.target) return response;
  if (result.quantityClamped) console.info("meta_checkout_quantity_clamped");
  const carry = createMetaCheckoutCarry(result.productId!, result.promoCode, now);
  const options = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };
  response.cookies.set({
    name: META_CHECKOUT_COOKIE_NAME,
    value: carry ?? "",
    ...options,
    maxAge: carry ? META_CHECKOUT_MAX_AGE_SECONDS : 0,
  });
  const attribution = createReferralSourceCookieValue({ source: "meta_shop" });
  if (attribution)
    response.cookies.set({
      name: REFERRAL_SOURCE_COOKIE_NAME,
      value: attribution,
      ...options,
      maxAge: META_CHECKOUT_MAX_AGE_SECONDS,
    });
  return response;
}
