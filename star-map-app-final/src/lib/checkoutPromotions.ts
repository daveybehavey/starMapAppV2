import type { CheckoutOrderType, CheckoutPlan } from "@/lib/pricing";

export type PromotionSource = "none" | "manual" | "referral_auto";

/** Stripe coupon metadata key for 100% digital make-good / reviewer sample codes. */
export const DIGITAL_COMP_COUPON_METADATA_KEY = "digital_comp";

/**
 * Manual promo codes may be accepted server-side for:
 * - print orders (XMAS15, BLACKFRIDAY20, etc.)
 * - digital single only when the coupon is tagged digital_comp (validated separately)
 *
 * Hosted Stripe `allow_promotion_codes` must stay off for digital — use
 * {@link canUseHostedPromotionCodes} for that gate.
 */
export function canUseManualPromotionCode(orderType: CheckoutOrderType, plan?: CheckoutPlan) {
  if (orderType === "print") return true;
  if (orderType === "digital" && plan === "single") return true;
  return false;
}

/**
 * Stripe hosted Checkout / recovery may collect typed codes only for print.
 * Digital SKUs use price_data that cannot be product-restricted in Stripe, so
 * promo_code params and `allow_promotion_codes` must stay off for digital.
 */
export function canUseHostedPromotionCodes(orderType: CheckoutOrderType, plan?: CheckoutPlan) {
  void plan;
  return orderType === "print";
}

type CouponMetadataLike = {
  metadata?: Record<string, string> | null;
} | null
  | undefined;

export function isDigitalCompCoupon(coupon: CouponMetadataLike): boolean {
  const value = coupon?.metadata?.[DIGITAL_COMP_COUPON_METADATA_KEY];
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

/**
 * After Stripe resolves a promotion code, decide whether it may apply to this order.
 * Digital single requires digital_comp metadata; print rejects that tag.
 */
export function isManualPromotionCompatibleWithOrder(input: {
  orderType: CheckoutOrderType;
  plan: CheckoutPlan;
  coupon: CouponMetadataLike;
}): boolean {
  if (!canUseManualPromotionCode(input.orderType, input.plan)) return false;
  const isComp = isDigitalCompCoupon(input.coupon);
  if (input.orderType === "digital") return isComp;
  // print: any coupon except digital-only comps
  return !isComp;
}

export function selectCheckoutPromotion(input: {
  manualPromotionCodeId?: string;
  referralCode?: string;
  referralPromotionCodeId?: string;
  orderType: CheckoutOrderType;
  plan: CheckoutPlan;
}): { promotionCodeId?: string; source: PromotionSource } {
  const manualPromotionCodeId = input.manualPromotionCodeId?.trim();
  if (manualPromotionCodeId && canUseManualPromotionCode(input.orderType, input.plan)) {
    return { promotionCodeId: manualPromotionCodeId, source: "manual" };
  }

  const referralPromotionCodeId = input.referralPromotionCodeId?.trim();
  const hasReferralCode = Boolean(input.referralCode?.trim());
  const canApplyReferralPromotion =
    hasReferralCode &&
    Boolean(referralPromotionCodeId) &&
    input.orderType === "digital" &&
    input.plan !== "subscription";

  if (canApplyReferralPromotion) {
    return { promotionCodeId: referralPromotionCodeId, source: "referral_auto" };
  }

  return { source: "none" };
}

export type FulfillableSessionLike = {
  mode?: string | null;
  payment_status?: string | null;
  amount_total?: number | null;
  total_details?: {
    amount_discount?: number | null;
    breakdown?: { discounts?: Array<unknown> | null } | null;
  } | null;
  discounts?: Array<unknown> | null;
};

function sessionHasAppliedDiscount(session: FulfillableSessionLike): boolean {
  const discountCents =
    typeof session.total_details?.amount_discount === "number"
      ? session.total_details.amount_discount
      : 0;
  if (discountCents > 0) return true;
  if (Array.isArray(session.discounts) && session.discounts.length > 0) return true;
  const breakdownDiscounts = session.total_details?.breakdown?.discounts;
  return Array.isArray(breakdownDiscounts) && breakdownDiscounts.length > 0;
}

/**
 * Whether a Checkout Session may grant digital entitlement / fulfillment.
 * - `paid` sessions: unchanged (any positive or settled charge).
 * - `no_payment_required`: only when total is $0 and a discount was applied
 *   (100% referral / digital_comp), or the session is a subscription
 *   (free trial / $0 first invoice keeps existing behavior).
 */
export function isFulfillableCheckoutPayment(session: FulfillableSessionLike): boolean {
  const status = session.payment_status;
  if (status === "paid") return true;
  if (status !== "no_payment_required") return false;
  if (session.mode === "subscription") return true;
  const amountTotal = typeof session.amount_total === "number" ? session.amount_total : null;
  if (amountTotal !== 0) return false;
  return sessionHasAppliedDiscount(session);
}

export { sessionHasAppliedDiscount };

export type PrintRetryPaymentGateResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: "payment_not_fulfillable" | "payment_verification_unavailable";
    };

/**
 * Payment gate for the operator print-order retry path
 * (POST /api/print/orders/retry). Lives beside isFulfillableCheckoutPayment
 * because it is that predicate's enforcement wrapper for the one fulfillment
 * path the webhook gate cannot reach.
 *
 * The webhook's fulfillment pass only queues a print order when the payment
 * is fulfillable, and checkout.session.async_payment_failed finalizes a
 * still-pending record as failed so "no later path can submit it". The
 * retry route was that later path: it decided purely from the persisted
 * record (amount + margin) and never consulted payment state, so a record
 * whose async payment failed — finalized with terminalEventType explicitly
 * null, which yields no authority terminal evidence and does not trip the
 * legacy-absent-field guard — fell through every check and could be
 * submitted to the provider unpaid.
 *
 * Fail-closed: a session that cannot be retrieved proves nothing about
 * payment, so it denies as "payment_verification_unavailable" and the
 * caller mutates no state, leaving the operator free to re-drive the retry
 * once verification works. Paid orders and $0-with-discount comp orders
 * stay retryable exactly as the webhook would fulfill them.
 */
export async function evaluatePrintRetryPaymentGate(input: {
  sessionId: string;
  retrieveSession: (sessionId: string) => Promise<FulfillableSessionLike | null>;
}): Promise<PrintRetryPaymentGateResult> {
  let session: FulfillableSessionLike | null = null;
  try {
    session = await input.retrieveSession(input.sessionId);
  } catch {
    session = null;
  }
  if (!session) {
    return { allowed: false, reason: "payment_verification_unavailable" };
  }
  if (!isFulfillableCheckoutPayment(session)) {
    return { allowed: false, reason: "payment_not_fulfillable" };
  }
  return { allowed: true };
}

/**
 * Discount entries as returned on Checkout Sessions (IDs or expanded objects).
 * Used to re-check coupon compatibility at fulfillment (webhook / verify),
 * closing the hosted-page bypass where print allows typed promotion codes.
 */
export type CheckoutSessionDiscountEntry = {
  coupon?: string | CouponMetadataLike | { id?: string; deleted?: boolean; metadata?: Record<string, string> | null } | null;
  promotion_code?:
    | string
    | {
        id?: string;
        coupon?: string | CouponMetadataLike | { id?: string; metadata?: Record<string, string> | null } | null;
      }
    | null;
} | null;

export type CheckoutSessionDiscountSource = {
  discounts?: CheckoutSessionDiscountEntry[] | null;
  total_details?: {
    amount_discount?: number | null;
    breakdown?: {
      discounts?: Array<{
        amount?: number | null;
        discount?: {
          coupon?:
            | string
            | CouponMetadataLike
            | { id?: string; deleted?: boolean; metadata?: Record<string, string> | null }
            | null;
          promotion_code?:
            | string
            | {
                id?: string;
                coupon?:
                  | string
                  | CouponMetadataLike
                  | { id?: string; metadata?: Record<string, string> | null }
                  | null;
              }
            | null;
        } | null;
      } | null> | null;
    } | null;
  } | null;
};

export type CouponLookup = {
  retrieveCoupon: (id: string) => Promise<CouponMetadataLike>;
  retrievePromotionCode: (
    id: string,
  ) => Promise<{ coupon?: string | CouponMetadataLike | null } | null>;
};

function asCouponMetadata(value: unknown): CouponMetadataLike | null {
  if (!value || typeof value !== "object") return null;
  if ("deleted" in value && (value as { deleted?: boolean }).deleted) return null;
  return value as CouponMetadataLike;
}

function couponIdFromUnknown(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

function promotionCodeIdFromUnknown(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

function discountEntryDedupeKey(entry: CheckoutSessionDiscountEntry): string {
  if (!entry) return "";
  const couponId = couponIdFromUnknown(entry.coupon);
  const promoId = promotionCodeIdFromUnknown(entry.promotion_code);
  return `${couponId ?? ""}|${promoId ?? ""}`;
}

/**
 * Union top-level `session.discounts` with pinned-API
 * `total_details.breakdown.discounts[].discount` entries.
 */
export function collectCheckoutSessionDiscountEntries(
  session: CheckoutSessionDiscountSource,
): CheckoutSessionDiscountEntry[] {
  const entries: CheckoutSessionDiscountEntry[] = [];
  const seen = new Set<string>();

  const push = (entry: CheckoutSessionDiscountEntry) => {
    if (!entry) return;
    const key = discountEntryDedupeKey(entry);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    entries.push(entry);
  };

  if (Array.isArray(session.discounts)) {
    for (const entry of session.discounts) push(entry);
  }

  const breakdownRows = session.total_details?.breakdown?.discounts;
  if (Array.isArray(breakdownRows)) {
    for (const row of breakdownRows) {
      if (!row || typeof row !== "object") continue;
      const nested = row.discount;
      if (!nested || typeof nested !== "object") continue;
      push({
        coupon: nested.coupon ?? null,
        promotion_code: nested.promotion_code ?? null,
      });
    }
  }

  return entries;
}

/**
 * Resolve applied discount coupons (expand/retrieve IDs as needed).
 * Reads pinned-API `total_details.breakdown.discounts` unioned with any
 * top-level `session.discounts`. Returns [] when there are no entries.
 */
export async function resolveCheckoutSessionDiscountCoupons(
  session: CheckoutSessionDiscountSource,
  lookup: CouponLookup,
): Promise<CouponMetadataLike[]> {
  const discounts = collectCheckoutSessionDiscountEntries(session);
  if (discounts.length === 0) return [];

  const coupons: CouponMetadataLike[] = [];
  const seen = new Set<string>();

  const pushCoupon = (coupon: CouponMetadataLike, idHint?: string | null) => {
    if (!coupon) return;
    const id = idHint ?? couponIdFromUnknown(coupon);
    if (id) {
      if (seen.has(id)) return;
      seen.add(id);
    }
    coupons.push(coupon);
  };

  for (const entry of discounts) {
    if (!entry) continue;

    if (typeof entry.coupon === "string" && entry.coupon.trim()) {
      const id = entry.coupon.trim();
      if (!seen.has(id)) {
        pushCoupon(await lookup.retrieveCoupon(id), id);
      }
    } else if (entry.coupon && typeof entry.coupon !== "string") {
      const expanded = asCouponMetadata(entry.coupon);
      if (expanded) pushCoupon(expanded, couponIdFromUnknown(entry.coupon));
    }

    const promo = entry.promotion_code;
    if (!promo) continue;

    if (typeof promo === "string" && promo.trim()) {
      const promoObj = await lookup.retrievePromotionCode(promo.trim());
      const nested = promoObj?.coupon;
      if (typeof nested === "string" && nested.trim()) {
        const id = nested.trim();
        if (!seen.has(id)) {
          pushCoupon(await lookup.retrieveCoupon(id), id);
        }
      } else {
        const coupon = asCouponMetadata(nested);
        if (coupon) pushCoupon(coupon, couponIdFromUnknown(nested));
      }
      continue;
    }

    if (typeof promo === "object") {
      const nested = promo.coupon;
      if (typeof nested === "string" && nested.trim()) {
        const id = nested.trim();
        if (!seen.has(id)) {
          pushCoupon(await lookup.retrieveCoupon(id), id);
        }
      } else if (nested && typeof nested !== "string") {
        const coupon = asCouponMetadata(nested);
        if (coupon) pushCoupon(coupon, couponIdFromUnknown(nested));
      }
    }
  }

  return coupons;
}

export type DiscountFulfillmentDecision =
  | { ok: true }
  | { ok: false; reason: string; retryable: boolean };

/** True when the denial is transient (lookup / unresolved) and must not finalize webhook dedupe. */
export function isDiscountFulfillmentRetryable(
  decision: DiscountFulfillmentDecision,
): boolean {
  return !decision.ok && decision.retryable;
}

/**
 * Fulfillment-time gate: digital_comp coupons may only entitle digital single.
 * Non-digital_comp coupons (referral, print promos) do not change today's behaviour.
 * When a discount was applied but coupons cannot be resolved, fail closed (retryable).
 */
export function evaluateAppliedCouponsForOrderFulfillment(input: {
  orderType: CheckoutOrderType;
  plan?: CheckoutPlan;
  coupons: CouponMetadataLike[];
  sessionHasDiscount: boolean;
}): DiscountFulfillmentDecision {
  if (input.sessionHasDiscount && input.coupons.length === 0) {
    return {
      ok: false,
      reason: "discount_present_but_coupon_unresolved",
      retryable: true,
    };
  }

  const plan: CheckoutPlan = input.plan ?? "single";
  for (const coupon of input.coupons) {
    if (!isDigitalCompCoupon(coupon)) continue;
    if (
      !isManualPromotionCompatibleWithOrder({
        orderType: input.orderType,
        plan,
        coupon,
      })
    ) {
      return {
        ok: false,
        reason: `digital_comp_incompatible_with_${input.orderType}_${plan}`,
        retryable: false,
      };
    }
  }
  return { ok: true };
}

/**
 * Resolve session discounts and apply the digital_comp fulfillment rule.
 * No-discount sessions return ok without Stripe lookups.
 * Lookup failures / unresolved coupons are retryable denials (not terminal).
 */
export async function evaluateCheckoutSessionDiscountFulfillment(input: {
  session: CheckoutSessionDiscountSource & FulfillableSessionLike;
  orderType: CheckoutOrderType;
  plan?: CheckoutPlan;
  lookup: CouponLookup;
}): Promise<DiscountFulfillmentDecision> {
  const hasDiscount = sessionHasAppliedDiscount(input.session);
  if (!hasDiscount) return { ok: true };

  let coupons: CouponMetadataLike[] = [];
  try {
    coupons = await resolveCheckoutSessionDiscountCoupons(input.session, input.lookup);
  } catch {
    return { ok: false, reason: "discount_coupon_lookup_failed", retryable: true };
  }

  return evaluateAppliedCouponsForOrderFulfillment({
    orderType: input.orderType,
    plan: input.plan,
    coupons,
    sessionHasDiscount: hasDiscount,
  });
}

/**
 * Editor paywall promo field: once the user edits the input, that value
 * (including empty / cleared) is authoritative. Untouched fields still fall
 * back to URL (?code=) then localStorage.
 */
export function normalizeCheckoutPromoCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,40}$/.test(normalized)) return null;
  return normalized;
}

export function resolveEditorCheckoutPromoCode(input: {
  fieldValue: string;
  fieldEdited: boolean;
  queryPromoCode: string | null;
  storedPromoCode: string | null;
}): string | null {
  const typed = normalizeCheckoutPromoCode(input.fieldValue);
  if (input.fieldEdited) return typed;
  return typed ?? input.queryPromoCode ?? input.storedPromoCode;
}
