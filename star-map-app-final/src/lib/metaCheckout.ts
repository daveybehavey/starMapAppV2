import { isSecondCopyEligibleVariant, type PrintVariant } from "@/lib/printCatalog";
import { isMerchFamilyId, isMerchFamilyEnabledForCheckout, type MerchFamilyId } from "@/lib/merchCatalog";
import { canUseManualPromotionCode, isManualPromotionCompatibleWithOrder } from "@/lib/checkoutPromotions";

export const META_CHECKOUT_COOKIE_NAME = "starmap_meta_checkout";
export const META_CHECKOUT_MAX_AGE_SECONDS = 24 * 60 * 60;

type Target =
  | { kind: "print"; variant: PrintVariant }
  | { kind: "digital"; plan: "single" | "pack3" }
  | { kind: "merch"; family: MerchFamilyId };

const PRODUCTS: Readonly<Record<string, Target>> = {
  poster_unframed: { kind: "print", variant: "poster_unframed" },
  poster_unframed_16x16: { kind: "print", variant: "poster_unframed_16x16" },
  poster_framed: { kind: "print", variant: "poster_framed" },
  canvas_wrap: { kind: "print", variant: "canvas_wrap" },
  mug_11oz: { kind: "print", variant: "mug_11oz" },
  card_4x6: { kind: "print", variant: "card_4x6" },
  hd_single: { kind: "digital", plan: "single" },
  hd_pack3: { kind: "digital", plan: "pack3" },
  "merch:sticker_kisscut": { kind: "merch", family: "sticker_kisscut" },
  "merch:magnet_diecut": { kind: "merch", family: "magnet_diecut" },
  "merch:pins_set": { kind: "merch", family: "pins_set" },
  "merch:tee_unisex_bc3001": { kind: "merch", family: "tee_unisex_bc3001" },
  "merch:hoodie_unisex_g18500": { kind: "merch", family: "hoodie_unisex_g18500" },
};

export function getMetaCheckoutTarget(id: string): Target | null {
  if (!Object.hasOwn(PRODUCTS, id)) return null;
  const target = PRODUCTS[id];
  if (
    target.kind === "merch" &&
    (!isMerchFamilyId(target.family) || !isMerchFamilyEnabledForCheckout(target.family))
  )
    return null;
  return target;
}

// Translation boundary: ASSUMED single product_id, quantity, coupon_code query
// fields on a fixed URL, decoded once by URLSearchParams. No aliases/templates.
export function parseMetaCheckoutParameters(params: URLSearchParams) {
  const single = (key: string) => (params.getAll(key).length === 1 ? params.get(key) : null);
  return {
    productId: single("product_id") ?? "",
    quantity: single("quantity") ?? (params.has("quantity") ? "invalid" : "1"),
    coupon: single("coupon_code"),
  };
}

// 2026 public campaign windows, inclusive Pacific calendar dates. Deliberately
// finite: no automatic annual renewal. XMAS15's broader validity ends Dec 26;
// publicity pauses during BF / last-minute digital phases (christmasCampaign.ts).
export const META_SEASONAL_CODES = [
  { code: "BLACKFRIDAY25", starts: "2026-11-27", ends: "2026-12-01" },
  { code: "XMAS15", starts: "2026-11-01", ends: "2026-12-26" },
] as const;

export function filterMetaCoupon(raw: unknown, target: Target, now = Date.now()): string | null {
  if (typeof raw !== "string" || !/^[A-Za-z0-9]{4,24}$/.test(raw.trim())) return null;
  const code = raw.trim().toUpperCase();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
  if (!META_SEASONAL_CODES.some((row) => row.code === code && today >= row.starts && today <= row.ends))
    return null;
  const orderType = target.kind === "digital" ? "digital" : "print";
  const plan = target.kind === "digital" ? target.plan : "single";
  // Known seasonal codes are print coupons, not digital_comp coupons. This is
  // only a garbage/UX filter. The PRIVATE checkout resolver remains authoritative
  // for Stripe existence, activity, currency, minimum amount and final rejection.
  return canUseManualPromotionCode(orderType, plan) &&
    isManualPromotionCompatibleWithOrder({ orderType, plan, coupon: { metadata: {} } })
    ? code
    : null;
}

export function resolveMetaCheckout(params: URLSearchParams, now = Date.now()) {
  const parsed = parseMetaCheckoutParameters(params);
  const target = getMetaCheckoutTarget(parsed.productId);
  if (!target) return { href: "/shop", target: null, promoCode: null, quantityClamped: false };
  const query = new URLSearchParams({ source: "meta_shop" });
  const secondCopy =
    parsed.quantity === "2" && target.kind === "print" && isSecondCopyEligibleVariant(target.variant);
  if (target.kind === "print") query.set("print_variant", target.variant);
  if (target.kind === "merch") {
    query.set("mode", "quick");
    query.set("merch_family", target.family);
  }
  if (secondCopy) query.set("include_second_copy", "1");
  const promoCode = filterMetaCoupon(parsed.coupon, target, now);
  return {
    href: `/editor?${query}`,
    target,
    productId: parsed.productId,
    promoCode,
    couponDropped: Boolean(parsed.coupon) && promoCode === null,
    quantityClamped: parsed.quantity !== "1" && !secondCopy,
  };
}
