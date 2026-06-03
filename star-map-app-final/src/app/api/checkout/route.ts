import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  getPricingTiers,
  getPrintDigitalAddOnPrice,
  getPrintPricingTiers,
  type CheckoutOrderType,
  type CheckoutPlan,
  type PrintVariant,
} from "@/lib/pricing";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { normalizeReferralCode, referralKey, type ReferralRecord } from "@/lib/referrals";
import {
  parseReferralCookieValue,
  parseReferralSourceCookieValue,
  REFERRAL_COOKIE_NAME,
  REFERRAL_SOURCE_COOKIE_NAME,
} from "@/lib/referralCookie";
import { PRINT_ASSET_ID_REGEX } from "@/lib/printAssets";
import { selectCheckoutPromotion, type PromotionSource } from "@/lib/checkoutPromotions";
import { PREMIUM_COOKIE_NAME } from "@/lib/premium";
import { recordFunnelStep } from "@/lib/funnel";
import { getGeoDigitalSinglePrice, getRequestCountry } from "@/lib/geoPricing";
import { evaluatePrintMarginForCheckout } from "@/lib/printMargin";
import { parsePrintVariant } from "@/lib/printCatalog";
import { getPrintfulShippingCountries, getPrintfulShippingRate } from "@/lib/printfulShipping";
import { applyMarketingAttributionMetadata } from "@/lib/commerceAnalytics";
import type { ReferralAttribution } from "@/lib/referralAttribution";
import { recordCheckoutFailure } from "@/lib/checkoutDiagnostics";
import {
  isValidStripeCheckoutUrl,
  stripeCheckoutHtmlRedirectBody,
} from "@/lib/stripeCheckoutNavigation";

export const runtime = "nodejs";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com";
const stripePriceIds = {
  single: process.env.STRIPE_PRICE_ID_SINGLE,
  pack3: process.env.STRIPE_PRICE_ID_PACK3,
  subscription: process.env.STRIPE_PRICE_ID_SUBSCRIPTION,
} as const;
/** Stripe Price IDs per print SKU (fallback to price_data when unset). */
const stripePrintVariantPriceIds: Partial<Record<PrintVariant, string | undefined>> = {
  poster_unframed: process.env.STRIPE_PRICE_ID_PRINT_UNFRAMED,
  poster_framed: process.env.STRIPE_PRICE_ID_PRINT_FRAMED,
  canvas_wrap: process.env.STRIPE_PRICE_ID_PRINT_CANVAS_WRAP,
  mug_11oz: process.env.STRIPE_PRICE_ID_PRINT_MUG_11OZ,
  card_4x6: process.env.STRIPE_PRICE_ID_PRINT_CARD_4X6,
};
const stripePrintDigitalAddOnPriceId = process.env.STRIPE_PRICE_ID_PRINT_DIGITAL_ADDON;
const configuredPromoCode = process.env.PROMOTION_COUPON_CODE?.trim().toUpperCase() ?? "";
const configuredStripePromotionCodeId = process.env.STRIPE_PROMO_CODE_ID?.trim() ?? "";
const configuredReferralPromotionCodeId = process.env.STRIPE_REFERRAL_PROMO_CODE_ID?.trim() ?? "";
const configuredReferralPromotionCodeIdAlt = process.env.STRIPE_REFERRAL_PROMO_CODE_ID_ALT?.trim() ?? "";
const referralAutoOfferAltSplitPercent = parsePercentage(process.env.REFERRAL_AUTO_OFFER_ALT_SPLIT_PERCENT);
const stripePaymentMethodConfigurationId =
  process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION_ID?.trim() ?? "";
const MAP_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const printAllowedCountries = parseAllowedShippingCountries(process.env.PRINT_ALLOWED_COUNTRIES);
const printCheckoutEnabled = /^(1|true|yes)$/i.test((process.env.PRINT_CHECKOUT_ENABLED || "").trim());
const printDynamicShippingEnabled = /^(1|true|yes)$/i.test((process.env.PRINT_DYNAMIC_SHIPPING || "").trim());

// Use fetch-based HTTP client to work in Cloudflare Workers.
const stripe =
  stripeSecret &&
  new Stripe(stripeSecret, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
    timeout: 20_000,
  });
const stripePriceProductIdCache = new Map<string, Promise<string | null>>();

function siteOrigin() {
  return siteUrl.replace(/\/+$/, "");
}

function parseAllowedShippingCountries(raw: string | undefined) {
  const shippingMapFallback = getPrintfulShippingCountries().filter((token) => /^[A-Z]{2}$/.test(token));
  const fallback = (shippingMapFallback.length ? shippingMapFallback : ["US"]) as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[];
  if (!raw) return fallback;
  const parsed = raw
    .split(",")
    .map((token) => token.trim().toUpperCase())
    .filter((token) => /^[A-Z]{2}$/.test(token));
  if (!parsed.length) return fallback;
  return parsed as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[];
}

function parsePositiveInt(raw: string | undefined) {
  const parsed = raw ? Number.parseInt(raw.trim(), 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parsePercentage(raw: string | undefined) {
  const parsed = raw ? Number.parseInt(raw.trim(), 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, parsed));
}

function getPrintShippingOptionsForCountry(
  variant: PrintVariant,
  shippingCountry: string | null,
): {
  shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] | undefined;
  shippingChargeCents: number | null;
} {
  const configuredShippingRate = process.env.STRIPE_SHIPPING_RATE_ID_PRINT_STANDARD?.trim();
  const configuredFlatShippingCents = parsePositiveInt(process.env.PRINT_STANDARD_SHIPPING_CENTS);
  if (configuredShippingRate && !printDynamicShippingEnabled) {
    return {
      shippingOptions: [{ shipping_rate: configuredShippingRate }],
      shippingChargeCents: configuredFlatShippingCents,
    };
  }

  if (shippingCountry) {
    const rate = getPrintfulShippingRate(variant, shippingCountry);
    if (rate && Number.isFinite(rate.rate)) {
      const amountCents = Math.round(rate.rate * 100);
      return {
        shippingOptions: [
          {
            shipping_rate_data: {
              type: "fixed_amount",
              fixed_amount: {
                amount: amountCents,
                currency: (rate.currency || "USD").toLowerCase(),
              },
              display_name: "Standard shipping",
              ...(typeof rate.min_delivery_days === "number" && typeof rate.max_delivery_days === "number"
                ? {
                    delivery_estimate: {
                      minimum: { unit: "business_day", value: rate.min_delivery_days },
                      maximum: { unit: "business_day", value: rate.max_delivery_days },
                    },
                  }
                : {}),
            },
          },
        ],
        shippingChargeCents: amountCents,
      };
    }
  }

  const amountCents = configuredFlatShippingCents;
  if (!amountCents) return { shippingOptions: undefined, shippingChargeCents: null };

  const currency = (process.env.CURRENCY ?? process.env.NEXT_PUBLIC_CURRENCY ?? "usd").trim().toLowerCase();
  const displayName = process.env.PRINT_STANDARD_SHIPPING_LABEL?.trim() || "Standard shipping";
  const minBusinessDays = parsePositiveInt(process.env.PRINT_STANDARD_SHIPPING_MIN_BUSINESS_DAYS);
  const maxBusinessDays = parsePositiveInt(process.env.PRINT_STANDARD_SHIPPING_MAX_BUSINESS_DAYS);
  const hasDeliveryEstimate =
    typeof minBusinessDays === "number" &&
    typeof maxBusinessDays === "number" &&
    maxBusinessDays >= minBusinessDays;

  return {
    shippingOptions: [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: {
            amount: amountCents,
            currency,
          },
          display_name: displayName,
          ...(hasDeliveryEstimate
            ? {
                delivery_estimate: {
                  minimum: { unit: "business_day", value: minBusinessDays },
                  maximum: { unit: "business_day", value: maxBusinessDays },
                },
              }
            : {}),
        },
      },
    ],
    shippingChargeCents: amountCents,
  };
}

function parseOrderType(raw: unknown): CheckoutOrderType {
  return raw === "print" ? "print" : "digital";
}

function parseBoolean(raw: unknown, fallback = false) {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  }
  return fallback;
}

function parseCheckoutMapId(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (!MAP_ID_REGEX.test(trimmed)) return undefined;
  return trimmed;
}

async function mapExists(mapId: string): Promise<boolean> {
  const record = await kv.get<unknown>(`map:${mapId}`);
  return Boolean(record);
}

async function assertDigitalCheckoutMap(mapId: string | undefined, plan: CheckoutPlan) {
  // Subscription checkout doesn't require a map preview to start payment,
  // so don't block on missing map_id for that plan.
  if (plan === "subscription") return;

  if (!mapId) {
    throw new CheckoutError(
      "Create your map preview before starting checkout.",
      "map_required",
      400,
    );
  }
  const exists = await mapExists(mapId);
  if (!exists) {
    throw new CheckoutError(
      "We couldn't find that map. Open the editor, generate your preview, then retry checkout.",
      "map_not_found",
      404,
    );
  }
}

type ReferralAutoOfferVariant = "primary" | "alt";

function hashToBucket(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash % 100;
}

function resolveReferralAutoOffer(referralCode?: string): {
  promotionCodeId?: string;
  variant?: ReferralAutoOfferVariant;
} {
  const primary = configuredReferralPromotionCodeId;
  const alt = configuredReferralPromotionCodeIdAlt;
  if (!primary && !alt) return {};
  if (primary && !alt) return { promotionCodeId: primary, variant: "primary" };
  if (!primary && alt) return { promotionCodeId: alt, variant: "alt" };
  if (!referralCode) return { promotionCodeId: primary, variant: "primary" };
  const useAlt = hashToBucket(referralCode.trim().toUpperCase()) < referralAutoOfferAltSplitPercent;
  return useAlt ? { promotionCodeId: alt, variant: "alt" } : { promotionCodeId: primary, variant: "primary" };
}

function canUseManualPromotionCode(orderType: CheckoutOrderType, plan: CheckoutPlan) {
  return orderType === "print" || (orderType === "digital" && plan === "single");
}

function resolveReferralOfferVariant(input: {
  referralCode?: string;
  promotionSource: PromotionSource;
  referralAutoOfferVariant?: ReferralAutoOfferVariant;
}): string | undefined {
  if (!input.referralCode?.trim()) return undefined;
  if (input.promotionSource === "referral_auto") {
    if (input.referralAutoOfferVariant === "alt") return "referral_auto_alt";
    if (input.referralAutoOfferVariant === "primary") return "referral_auto_primary";
    return "referral_auto_promo";
  }
  if (input.promotionSource === "manual") return "manual_promo_override";
  return "referral_no_discount";
}

function shouldRetryCheckoutWithoutDiscount(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const stripeError = error as { code?: string; message?: string; param?: string };
  if (typeof stripeError.param === "string" && /promotion|discount|coupon/i.test(stripeError.param)) {
    return true;
  }
  if (typeof stripeError.code === "string" && /promotion|discount|coupon|coupon_invalid/i.test(stripeError.code)) {
    return true;
  }
  if (typeof stripeError.message === "string" && /promotion code|discount|coupon/i.test(stripeError.message)) {
    return true;
  }
  return false;
}

type PromotionResolution = {
  promotionCodeId?: string;
  promotionCode?: ResolvedPromotionCode;
  invalid: boolean;
  lookupFailed: boolean;
};

type ResolvedPromotionCode = {
  id: string;
  code: string;
  coupon: Stripe.Coupon;
  minimumAmount: number | null;
  minimumAmountCurrency: string | null;
};

type ReferralResolution = {
  code?: string;
  referrerSessionId?: string;
};

function resolveExpandedPromotionCode(promotionCode: Stripe.PromotionCode | null | undefined): ResolvedPromotionCode | null {
  if (!promotionCode) return null;
  const coupon = typeof promotionCode.coupon === "string" ? null : promotionCode.coupon;
  if (!coupon || coupon.valid === false) return null;
  return {
    id: promotionCode.id,
    code: promotionCode.code,
    coupon,
    minimumAmount:
      typeof promotionCode.restrictions?.minimum_amount === "number"
        ? promotionCode.restrictions.minimum_amount
        : null,
    minimumAmountCurrency:
      typeof promotionCode.restrictions?.minimum_amount_currency === "string"
        ? promotionCode.restrictions.minimum_amount_currency
        : null,
  };
}

async function fetchPromotionCodeById(promotionCodeId: string): Promise<ResolvedPromotionCode | null> {
  if (!stripe) return null;
  try {
    const promotionCode = await stripe.promotionCodes.retrieve(promotionCodeId, {
      expand: ["coupon.applies_to"],
    });
    return resolveExpandedPromotionCode(promotionCode);
  } catch (error) {
    console.error("Promotion code retrieve failed", error);
    return null;
  }
}

async function resolvePromotionCodeId(promoCode?: string): Promise<PromotionResolution> {
  const trimmed = promoCode?.trim();
  if (!trimmed) return { invalid: false, lookupFailed: false };

  if (configuredPromoCode && configuredStripePromotionCodeId && trimmed.toUpperCase() === configuredPromoCode) {
    const configuredPromotion = await fetchPromotionCodeById(configuredStripePromotionCodeId);
    if (configuredPromotion) {
      return {
        promotionCodeId: configuredPromotion.id,
        promotionCode: configuredPromotion,
        invalid: false,
        lookupFailed: false,
      };
    }
    return { invalid: false, lookupFailed: true };
  }

  if (!stripe) {
    return { invalid: false, lookupFailed: true };
  }

  try {
    const list = await stripe.promotionCodes.list({
      code: trimmed,
      active: true,
      limit: 10,
      expand: ["data.coupon.applies_to"],
    });

    const matched = list.data.find((item) =>
      item.active &&
      item.coupon?.valid !== false &&
      typeof item.code === "string" &&
      item.code.trim().toUpperCase() === trimmed.toUpperCase(),
    );

    if (!matched?.id) {
      return { invalid: true, lookupFailed: false };
    }

    const resolvedPromotion = resolveExpandedPromotionCode(matched);
    if (!resolvedPromotion) {
      return { invalid: true, lookupFailed: false };
    }

    return {
      promotionCodeId: resolvedPromotion.id,
      promotionCode: resolvedPromotion,
      invalid: false,
      lookupFailed: false,
    };
  } catch (error) {
    console.error("Promotion code lookup failed", error);
    return { invalid: false, lookupFailed: true };
  }
}

function readReferralCodeFromCookie(req: NextRequest) {
  const parsed = parseReferralCookieValue(req.cookies.get(REFERRAL_COOKIE_NAME)?.value ?? null);
  return parsed?.code;
}

function readReferralAttributionFromCookie(req: NextRequest): ReferralAttribution | null {
  return parseReferralSourceCookieValue(req.cookies.get(REFERRAL_SOURCE_COOKIE_NAME)?.value ?? null);
}

async function resolveReferral(raw?: string, currentSessionId?: string): Promise<ReferralResolution> {
  const code = normalizeReferralCode(raw);
  if (!code) return {};
  const record = await kv.get<ReferralRecord>(referralKey(code));
  if (!record?.sessionId) return {};
  if (currentSessionId && record.sessionId === currentSessionId) return {};
  return { code, referrerSessionId: record.sessionId };
}

async function getStripeProductIdForPrice(priceId?: string | null): Promise<string | null> {
  const normalizedPriceId = priceId?.trim();
  if (!normalizedPriceId || !stripe) return null;
  const cached = stripePriceProductIdCache.get(normalizedPriceId);
  if (cached) return cached;

  const lookup = stripe.prices
    .retrieve(normalizedPriceId, { expand: ["product"] })
    .then((price) => {
      const product = price.product;
      return typeof product === "string" ? product : product?.id ?? null;
    })
    .catch((error) => {
      console.error("Stripe price lookup failed", { priceId: normalizedPriceId, error });
      return null;
    });

  stripePriceProductIdCache.set(normalizedPriceId, lookup);
  return lookup;
}

async function estimatePromotionDiscountCents(input: {
  promotionCode?: ResolvedPromotionCode;
  currency: string;
  lineItems: Array<{ amountCents: number; priceId?: string | null }>;
}): Promise<number | null> {
  const promotionCode = input.promotionCode;
  if (!promotionCode) return 0;

  const coupon = promotionCode.coupon;
  const normalizedCurrency = input.currency.trim().toLowerCase();
  const lineItemSubtotalCents = input.lineItems.reduce((total, item) => total + Math.max(0, item.amountCents), 0);

  if (
    promotionCode.minimumAmount !== null &&
    promotionCode.minimumAmount > 0 &&
    promotionCode.minimumAmountCurrency &&
    promotionCode.minimumAmountCurrency.trim().toLowerCase() !== normalizedCurrency
  ) {
    return null;
  }

  if (promotionCode.minimumAmount !== null && lineItemSubtotalCents < promotionCode.minimumAmount) {
    return 0;
  }

  let eligibleSubtotalCents = lineItemSubtotalCents;
  const scopedProductIds = coupon.applies_to?.products ?? [];
  if (scopedProductIds.length > 0) {
    eligibleSubtotalCents = 0;
    for (const item of input.lineItems) {
      const productId = await getStripeProductIdForPrice(item.priceId);
      if (productId && scopedProductIds.includes(productId)) {
        eligibleSubtotalCents += Math.max(0, item.amountCents);
      }
    }
  }

  if (eligibleSubtotalCents <= 0) return 0;

  if (typeof coupon.percent_off === "number" && Number.isFinite(coupon.percent_off) && coupon.percent_off > 0) {
    return Math.min(eligibleSubtotalCents, Math.ceil((eligibleSubtotalCents * coupon.percent_off) / 100));
  }

  if (typeof coupon.amount_off === "number" && Number.isFinite(coupon.amount_off) && coupon.amount_off > 0) {
    if ((coupon.currency ?? "").trim().toLowerCase() !== normalizedCurrency) {
      return null;
    }
    return Math.min(eligibleSubtotalCents, coupon.amount_off);
  }

  return 0;
}

type CheckoutSessionResult = {
  url: string | null;
  discountRejected: boolean;
};

class CheckoutError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "CheckoutError";
    this.code = code;
    this.status = status;
  }
}

function normalizeNonCheckoutError(err: unknown): {
  reason: string;
  code: string;
  status: number;
} {
  const fallbackStatus = 500;

  const message = err instanceof Error ? err.message : "";
  if (message.toLowerCase().includes("stripe not configured")) {
    return { reason: "stripe_not_configured", code: "stripe_not_configured", status: 503 };
  }

  if (!err || typeof err !== "object") {
    return { reason: "unknown_error", code: "unknown_error", status: fallbackStatus };
  }

  const anyErr = err as Record<string, unknown>;
  const rawErr = anyErr.raw as unknown;
  const codeCandidate =
    (typeof anyErr.code === "string" ? anyErr.code : null) ??
    (typeof (rawErr as { code?: unknown } | null)?.code === "string"
      ? String((rawErr as { code?: unknown }).code)
      : null) ??
    (typeof anyErr.type === "string" ? String(anyErr.type) : null);

  const statusCandidate =
    (typeof anyErr.statusCode === "number" ? anyErr.statusCode : null) ??
    (typeof anyErr.status === "number" ? anyErr.status : null);

  const status = typeof statusCandidate === "number" && Number.isFinite(statusCandidate) ? statusCandidate : fallbackStatus;
  const base = codeCandidate ? `stripe_${codeCandidate}` : "stripe_error";
  return { reason: base, code: base, status };
}

const CHECKOUT_IDEMPOTENCY_TTL_SECONDS = 2 * 60;
const CHECKOUT_IDEMPOTENCY_PREFIX = "checkout:idempotency:url:";

function normalizeIdempotencyToken(raw: unknown, maxLen = 64) {
  if (typeof raw !== "string") return "";
  const token = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLen);
  return token;
}

function checkoutIdempotencyKey(input: {
  mapId?: string;
  plan: CheckoutPlan;
  orderType: CheckoutOrderType;
  printVariant?: PrintVariant;
  includeDigitalAddOn?: boolean;
  shippingCountry?: string | null;
  promoCode?: string | null;
  referralCode?: string | null;
}) {
  const mapId = typeof input.mapId === "string" ? input.mapId.trim() : "";
  if (!mapId) return null;
  const plan = input.plan;
  const orderType = input.orderType;
  const printVariant = parsePrintVariant(input.printVariant);
  const includeDigitalAddOn = input.includeDigitalAddOn ? "1" : "0";
  const shipping = normalizeIdempotencyToken(input.shippingCountry, 8);
  const promo = normalizeIdempotencyToken(input.promoCode, 48);
  const referral = normalizeIdempotencyToken(input.referralCode, 48);
  return `${CHECKOUT_IDEMPOTENCY_PREFIX}${orderType}:${plan}:${printVariant}:${includeDigitalAddOn}:${shipping}:${promo}:${referral}:${mapId}`;
}

async function createCheckoutSession(
  input: {
    plan: CheckoutPlan;
    mapId?: string;
    printAssetId?: string;
    promotionCodeId?: string;
    resolvedPromotionCode?: ResolvedPromotionCode;
    fallbackOnDiscountError?: boolean;
    orderType?: CheckoutOrderType;
    printVariant?: PrintVariant;
    includeDigitalAddOn?: boolean;
    shippingCountry?: string;
    clientCountry?: string | null;
    referralCode?: string;
    referrerSessionId?: string;
    referralAttribution?: ReferralAttribution | null;
    promotionSource?: PromotionSource;
    referralAutoOfferVariant?: ReferralAutoOfferVariant;
    idempotencyKey?: string;
  },
): Promise<CheckoutSessionResult> {
  const {
    plan,
    mapId,
    printAssetId,
    promotionCodeId,
    resolvedPromotionCode,
    fallbackOnDiscountError = true,
    orderType = "digital",
    printVariant = "poster_framed",
    includeDigitalAddOn = false,
    shippingCountry,
    clientCountry,
    referralCode,
    referrerSessionId,
    referralAttribution,
    promotionSource = "none",
    referralAutoOfferVariant,
    idempotencyKey,
  } = input;
  if (!stripe) {
    throw new Error("Stripe not configured");
  }

  const normalizedOrderType = parseOrderType(orderType);
  const isPrintOrder = normalizedOrderType === "print";
  const normalizedPrintVariant = parsePrintVariant(printVariant);
  const effectivePlan = isPrintOrder ? "single" : plan;
  const allowPromotionCodes = canUseManualPromotionCode(normalizedOrderType, effectivePlan);
  const mapQuery = mapId ? `&map_id=${encodeURIComponent(mapId)}` : "";
  const orderQuery = `&order_type=${normalizedOrderType}`;
  const printQuery = isPrintOrder ? `&print_variant=${normalizedPrintVariant}` : "";
  const successUrl = `${siteOrigin()}/success?session_id={CHECKOUT_SESSION_ID}${mapQuery}${orderQuery}${printQuery}`;
  const cancelUrl = `${siteOrigin()}`;
  const digitalTiers = getPricingTiers();
  const tier = digitalTiers[effectivePlan];
  const printTiers = getPrintPricingTiers();
  const printTier = printTiers[normalizedPrintVariant];
  const digitalAddOnTier = getPrintDigitalAddOnPrice();
  const requestedShippingCountry =
    typeof shippingCountry === "string" ? shippingCountry.trim().toUpperCase() : null;
  const normalizedRequestedShippingCountry =
    requestedShippingCountry && /^[A-Z]{2}$/.test(requestedShippingCountry)
      ? (requestedShippingCountry as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry)
      : null;
  const allowedCountries = printAllowedCountries;
  if (isPrintOrder && !requestedShippingCountry) {
    throw new CheckoutError(
      "Shipping country is required for print checkout.",
      "missing_shipping_country",
      400,
    );
  }
  const resolvedShippingCountry =
    isPrintOrder && normalizedRequestedShippingCountry && allowedCountries.includes(normalizedRequestedShippingCountry)
      ? normalizedRequestedShippingCountry
      : null;
  if (isPrintOrder && requestedShippingCountry && !resolvedShippingCountry) {
    throw new CheckoutError(
      "Unsupported shipping country.",
      "print_shipping_country_invalid",
      400,
    );
  }
  const printShippingSelection =
    isPrintOrder
      ? getPrintShippingOptionsForCountry(normalizedPrintVariant, resolvedShippingCountry)
      : { shippingOptions: undefined, shippingChargeCents: null };
  const printShippingOptions = printShippingSelection.shippingOptions;
  const printShippingChargeCents = printShippingSelection.shippingChargeCents;
  const geoDigitalSingle =
    !isPrintOrder && effectivePlan === "single" ? getGeoDigitalSinglePrice(clientCountry) : null;
  const useGeoDigitalSinglePricing = Boolean(geoDigitalSingle?.amountCents);

  const metadata: Record<string, string> = { order_type: normalizedOrderType };
  if (mapId) metadata.map_id = mapId;
  if (isPrintOrder) {
    metadata.print_variant = normalizedPrintVariant;
    metadata.print_include_digital = includeDigitalAddOn ? "true" : "false";
    if (printAssetId) metadata.print_asset_id = printAssetId;
    if (includeDigitalAddOn) {
      metadata.plan = "single";
      metadata.credits = "1";
    }
  } else {
    metadata.plan = effectivePlan;
    if (tier.credits) metadata.credits = String(tier.credits);
  }
  if (promotionCodeId) metadata.promotion_code_id = promotionCodeId;
  if (promotionSource === "referral_auto") metadata.referral_offer_applied = "true";
  const referralOfferVariant = resolveReferralOfferVariant({
    referralCode,
    promotionSource,
    referralAutoOfferVariant,
  });
  if (referralOfferVariant) metadata.referral_offer_variant = referralOfferVariant;
  if (referralCode) metadata.referral_code = referralCode;
  if (referrerSessionId) metadata.referrer_session_id = referrerSessionId;
  if (referralCode && referralAttribution?.source) metadata.referral_source = referralAttribution.source;
  if (referralCode && referralAttribution?.medium) metadata.referral_medium = referralAttribution.medium;
  if (referralCode && referralAttribution?.campaign) metadata.referral_campaign = referralAttribution.campaign;
  if (referralCode && referralAttribution?.content) metadata.referral_content = referralAttribution.content;
  applyMarketingAttributionMetadata(metadata, referralAttribution ?? null);
  if (geoDigitalSingle) {
    metadata.geo_pricing_country = geoDigitalSingle.country;
    metadata.geo_pricing_amount_cents = String(geoDigitalSingle.amountCents);
  }
  if (isPrintOrder && resolvedShippingCountry) {
    metadata.print_shipping_country = resolvedShippingCountry;
  }
  if (isPrintOrder && typeof printShippingChargeCents === "number") {
    metadata.print_shipping_charge_cents = String(printShippingChargeCents);
  }

  const digitalPriceId = stripePriceIds[effectivePlan]?.trim();
  const useDigitalPriceId = Boolean(digitalPriceId) && !useGeoDigitalSinglePricing;

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  const promotionEstimateLineItems: Array<{ amountCents: number; priceId?: string | null }> = [];
  if (isPrintOrder) {
    const printPriceId = stripePrintVariantPriceIds[normalizedPrintVariant]?.trim();
    lineItems.push({
      ...(printPriceId
        ? { price: printPriceId }
        : {
            price_data: {
              currency: printTier.currency,
              unit_amount: printTier.amountCents,
              product_data: {
                name: `Custom Star Map — ${printTier.label}`,
                description: printTier.includesFrame
                  ? `${printTier.label} • Shipping address required`
                  : `${printTier.label} • Shipping address required`,
                images: [`${siteUrl}/custom-star-map-anniversary.webp`],
              },
            },
          }),
      quantity: 1,
    });
    promotionEstimateLineItems.push({
      amountCents: printTier.amountCents,
      priceId: printPriceId || null,
    });
    if (includeDigitalAddOn) {
      const digitalAddOnPriceId = stripePrintDigitalAddOnPriceId?.trim();
      lineItems.push({
        ...(digitalAddOnPriceId
          ? { price: digitalAddOnPriceId }
          : {
              price_data: {
                currency: digitalAddOnTier.currency,
                unit_amount: digitalAddOnTier.amountCents,
                product_data: {
                  name: "HD Digital Download Add-on",
                  description: "6000×6000px digital file delivered instantly after payment",
                  images: [`${siteUrl}/custom-star-map-anniversary.webp`],
                },
              },
        }),
        quantity: 1,
      });
      promotionEstimateLineItems.push({
        amountCents: digitalAddOnTier.amountCents,
        priceId: digitalAddOnPriceId || null,
      });
    }
  } else {
    const digitalLineItem:
      | { price: string }
      | { price_data: Stripe.Checkout.SessionCreateParams.LineItem.PriceData } = useDigitalPriceId
      ? { price: digitalPriceId as string }
      : effectivePlan === "single" && geoDigitalSingle
        ? {
            price_data: {
              currency: tier.currency,
              unit_amount: geoDigitalSingle.amountCents,
              product_data: {
                name: "HD Star Map Download",
                description: "Print-ready 6000×6000px star map • No watermark • Instant download • Perfect for framing",
                images: [`${siteUrl}/custom-star-map-anniversary.webp`],
              },
            },
          }
        : {
            price_data:
              effectivePlan === "subscription"
                ? {
                    currency: tier.currency,
                    unit_amount: tier.amountCents,
                    recurring: { interval: "month" },
                    product_data: {
                      name: "Unlimited HD Star Maps (Monthly)",
                      description: "Unlimited HD exports • No watermark • Instant download",
                      images: [`${siteUrl}/custom-star-map-anniversary.webp`],
                    },
                  }
                : {
                    currency: tier.currency,
                    unit_amount: tier.amountCents,
                    product_data: {
                      name: effectivePlan === "pack3" ? "HD Star Map Export Credits (3)" : "HD Star Map Download",
                      description:
                        effectivePlan === "pack3"
                          ? "3 HD export credits for your map versions • No watermark • Instant unlock"
                          : "Print-ready 6000×6000px star map • No watermark • Instant download • Perfect for framing",
                      images: [`${siteUrl}/custom-star-map-anniversary.webp`],
                    },
                  },
          };
    lineItems.push({
      ...digitalLineItem,
      quantity: 1,
    });
  }

  let estimatedPromotionDiscountCents = 0;
  if (isPrintOrder && promotionCodeId) {
    const discountEstimate = await estimatePromotionDiscountCents({
      promotionCode: resolvedPromotionCode,
      currency: printTier.currency,
      lineItems: promotionEstimateLineItems,
    });
    if (discountEstimate === null || discountEstimate <= 0) {
      throw new CheckoutError(
        "That promo code does not apply to this print order.",
        "promotion_not_applicable",
        400,
      );
    }
    estimatedPromotionDiscountCents = discountEstimate;
    metadata.promotion_discount_estimate_cents = String(estimatedPromotionDiscountCents);
  }

  if (isPrintOrder) {
    const marginCheck = evaluatePrintMarginForCheckout({
      variant: normalizedPrintVariant,
      shippingCountry: resolvedShippingCountry,
      shippingChargeCents: printShippingChargeCents,
      includeDigitalAddOn,
      discountAmountCents: estimatedPromotionDiscountCents,
    });
    if (!marginCheck.allowed) {
      const floorDollars = marginCheck.minMarginCents > 0 ? (marginCheck.minMarginCents / 100).toFixed(2) : "";
      const marginHint = floorDollars ? ` (min profit $${floorDollars})` : "";
      const baseMessage =
        marginCheck.code === "margin_estimate_unavailable"
          ? "We can't calculate shipping for this print order yet. Please choose a shipping country (or try again in a moment)."
          : "This print option isn't available at that price for the selected shipping country right now.";
      throw new CheckoutError(
        promotionCodeId
          ? `That promo code makes this print order unprofitable${marginHint}. Please remove the code or choose a different format.`
          : `${baseMessage}${marginHint} Please pick a different country or format.`,
        promotionCodeId ? "print_promotion_margin_blocked" : "print_margin_guard_blocked",
        400,
      );
    }
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: !isPrintOrder && effectivePlan === "subscription" ? "subscription" : "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    after_expiration: {
      recovery: {
        enabled: true,
        ...(allowPromotionCodes ? { allow_promotion_codes: true } : {}),
      },
    },
    client_reference_id: mapId,
    line_items: lineItems,
    metadata,
    subscription_data: !isPrintOrder && effectivePlan === "subscription" ? { metadata } : undefined,
    ...(allowPromotionCodes && !promotionCodeId ? { allow_promotion_codes: true } : {}),
    discounts: promotionCodeId ? [{ promotion_code: promotionCodeId }] : undefined,
    billing_address_collection: isPrintOrder ? "required" : "auto",
    customer_email: undefined,
    phone_number_collection: {
      enabled: isPrintOrder,
    },
    consent_collection: {
      terms_of_service: "required",
    },
    custom_text: {
      submit: {
        message:
          isPrintOrder
            ? "Secure payment • Print order created after checkout"
            : effectivePlan === "subscription"
              ? "Secure payment • Cancel anytime • Instant access"
              : "Secure payment • Instant access • No subscription",
      },
      terms_of_service_acceptance: {
        message: `I agree to the [Terms of Service](${siteUrl}/terms) and [Privacy Policy](${siteUrl}/privacy)`,
      },
    },
    ...(stripePaymentMethodConfigurationId
      ? { payment_method_configuration: stripePaymentMethodConfigurationId }
      : {}),
    shipping_address_collection: isPrintOrder
      ? {
          allowed_countries: resolvedShippingCountry
            ? [resolvedShippingCountry as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry]
            : printAllowedCountries,
        }
      : undefined,
    shipping_options: printShippingOptions,
  };

  let session: Stripe.Checkout.Session;
  let discountRejected = false;
  try {
    session = await stripe.checkout.sessions.create(
      sessionParams,
      idempotencyKey ? { idempotencyKey } : undefined,
    );
  } catch (error) {
    if (!promotionCodeId || !shouldRetryCheckoutWithoutDiscount(error) || !fallbackOnDiscountError) {
      throw error;
    }
    console.warn("Checkout promo code rejected by Stripe; retrying without auto-applied discount.", {
      promotionCodeId,
      plan,
    });
    const fallbackMetadata = { ...metadata };
    delete fallbackMetadata.promotion_code_id;
    delete fallbackMetadata.referral_offer_applied;
    if (referralCode) {
      fallbackMetadata.referral_offer_variant = "referral_no_discount";
    } else {
      delete fallbackMetadata.referral_offer_variant;
    }
    const fallbackParams: Stripe.Checkout.SessionCreateParams = {
      ...sessionParams,
      allow_promotion_codes: allowPromotionCodes,
      discounts: undefined,
      metadata: fallbackMetadata,
      subscription_data:
        !isPrintOrder && effectivePlan === "subscription"
          ? { metadata: fallbackMetadata }
          : undefined,
    };
    discountRejected = true;
    // Stripe idempotency keys must match request params — use a distinct key for the no-discount retry.
    const fallbackIdempotencyKey = idempotencyKey ? `${idempotencyKey}:no-discount` : undefined;
    session = await stripe.checkout.sessions.create(
      fallbackParams,
      fallbackIdempotencyKey ? { idempotencyKey: fallbackIdempotencyKey } : undefined,
    );
  }

  const checkoutUrl = session.url?.trim() ?? "";
  if (checkoutUrl && !isValidStripeCheckoutUrl(checkoutUrl)) {
    console.error("Stripe returned checkout URL without required fragment", {
      sessionId: session.id,
      urlLength: checkoutUrl.length,
    });
    throw new Error("invalid_stripe_checkout_url");
  }
  return { url: checkoutUrl || null, discountRejected };
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`checkout:${ip}`, 5, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const planParam = req.nextUrl.searchParams.get("plan");
  const mapParam = req.nextUrl.searchParams.get("map_id");
  const orderTypeParam = req.nextUrl.searchParams.get("order_type");
  const printVariantParam = req.nextUrl.searchParams.get("print_variant");
  const includeDigitalAddOnParam = req.nextUrl.searchParams.get("include_digital_addon");
  const shippingCountryParam = req.nextUrl.searchParams.get("shipping_country");
  const printAssetIdParam = req.nextUrl.searchParams.get("print_asset_id");
  const referralParam =
    req.nextUrl.searchParams.get("ref") ??
    req.nextUrl.searchParams.get("referral_code") ??
    undefined;
  const plan: CheckoutPlan =
    planParam && ["single", "pack3", "subscription"].includes(planParam)
      ? (planParam as CheckoutPlan)
      : "single";
  const orderType = parseOrderType(orderTypeParam);
  const printVariant = parsePrintVariant(printVariantParam);
  const includeDigitalAddOn = parseBoolean(includeDigitalAddOnParam, false);
  const shippingCountry = shippingCountryParam ? shippingCountryParam.trim().toUpperCase() : undefined;
  const printAssetId =
    printAssetIdParam && PRINT_ASSET_ID_REGEX.test(printAssetIdParam.trim()) ? printAssetIdParam.trim() : undefined;
  const clientCountry = getRequestCountry(req);
  const mapId = parseCheckoutMapId(mapParam);
  const promoCodeParam = req.nextUrl.searchParams.get("promo_code") ?? undefined;
  const currentSessionId = req.cookies.get(PREMIUM_COOKIE_NAME)?.value?.trim();
  const fallbackReferralCode = readReferralCodeFromCookie(req);
  const referralAttribution = readReferralAttributionFromCookie(req);
  const referral = await resolveReferral(referralParam ?? fallbackReferralCode, currentSessionId);
  const referralAutoOffer = resolveReferralAutoOffer(referral.code);
  const promotion = orderType === "digital" && plan === "subscription"
    ? { promotionCodeId: undefined, invalid: false, lookupFailed: false }
    : canUseManualPromotionCode(orderType, plan)
      ? await resolvePromotionCodeId(promoCodeParam)
      : { promotionCodeId: undefined, invalid: false, lookupFailed: false };
  const selectedPromotion = selectCheckoutPromotion({
    manualPromotionCodeId: promotion.invalid ? undefined : promotion.promotionCodeId,
    referralCode: referral.code,
    referralPromotionCodeId: referralAutoOffer.promotionCodeId,
    orderType,
    plan,
  });
  if (orderType === "print" && !printCheckoutEnabled) {
    return NextResponse.json(
      { error: "Print checkout is not enabled yet.", code: "print_checkout_disabled" },
      { status: 503 },
    );
  }
  if (orderType === "print" && !printAssetId) {
    return NextResponse.json(
      { error: "Could not prepare print file. Please reopen checkout and try again.", code: "missing_print_asset" },
      { status: 400 },
    );
  }
  if (orderType !== "print") {
    try {
      await assertDigitalCheckoutMap(mapId, plan);
    } catch (error) {
      if (error instanceof CheckoutError) {
        await recordCheckoutFailure({
          reason: error.code,
          source: "checkout_api_digital_get",
          plan,
        });
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
      }
      throw error;
    }
  }

  try {
    await recordFunnelStep({
      step: "checkout_request_received",
      source: orderType === "print" ? "checkout_api_print_get" : "checkout_api_digital_get",
      plan: orderType === "print" ? printVariant : plan,
    });
    const { url: sessionUrl } = await createCheckoutSession({
      plan,
      mapId,
      printAssetId,
      promotionCodeId: selectedPromotion.promotionCodeId,
      resolvedPromotionCode: selectedPromotion.source === "manual" ? promotion.promotionCode : undefined,
      promotionSource: selectedPromotion.source,
      orderType,
      printVariant,
      includeDigitalAddOn,
      shippingCountry,
      clientCountry,
      referralCode: referral.code,
      referrerSessionId: referral.referrerSessionId,
      referralAttribution,
      referralAutoOfferVariant: selectedPromotion.source === "referral_auto" ? referralAutoOffer.variant : undefined,
    });
    if (!sessionUrl) {
      return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
    }
    await recordFunnelStep({
      step: "checkout_session_created",
      source: orderType === "print" ? "checkout_api_print_get" : "checkout_api_digital_get",
      plan: orderType === "print" ? printVariant : plan,
    });
    await recordFunnelStep({
      step: "checkout_redirected",
      source: orderType === "print" ? "checkout_api_print_get" : "checkout_api_digital_get",
      plan: orderType === "print" ? printVariant : plan,
    });
    if (!isValidStripeCheckoutUrl(sessionUrl)) {
      return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
    }
    return new NextResponse(stripeCheckoutHtmlRedirectBody(sessionUrl), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof CheckoutError) {
      await recordCheckoutFailure({
        reason: err.code,
        source: orderType === "print" ? "checkout_api_print_get" : "checkout_api_digital_get",
        plan: orderType === "print" ? printVariant : plan,
      });
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }

    const normalized = normalizeNonCheckoutError(err);
    await recordCheckoutFailure({
      reason: normalized.reason,
      source: orderType === "print" ? "checkout_api_print_get" : "checkout_api_digital_get",
      plan: orderType === "print" ? printVariant : plan,
    });
    console.error("Stripe checkout error", err);
    return NextResponse.json({ error: "Checkout failed", code: normalized.code }, { status: normalized.status });
  }
}

export async function POST(req: NextRequest) {
  // Rate limit: 5 requests per minute per IP (prevents checkout session spam)
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`checkout:${ip}`, 5, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  let plan: CheckoutPlan = "single";
  let orderType: CheckoutOrderType = "digital";
  let printVariant: PrintVariant = "poster_framed";

  try {
    const clientCountry = getRequestCountry(req);
    let mapId: string | undefined;
    let includeDigitalAddOn = false;
    let printAssetId: string | undefined;
    let promoCode: string | undefined;
    let referralCode: string | undefined;
    let shippingCountry: string | undefined;
    try {
      const body = (await req.json()) as {
        mapId?: string;
        plan?: CheckoutPlan;
        promoCode?: string;
        orderType?: CheckoutOrderType;
        printVariant?: PrintVariant;
        includeDigitalAddOn?: boolean;
        printAssetId?: string;
        shippingCountry?: string;
        referralCode?: string;
      } | null;
      mapId = parseCheckoutMapId(body?.mapId);
      if (body?.plan && ["single", "pack3", "subscription"].includes(body.plan)) {
        plan = body.plan;
      }
      orderType = parseOrderType(body?.orderType);
      printVariant = parsePrintVariant(body?.printVariant);
      includeDigitalAddOn = parseBoolean(body?.includeDigitalAddOn, false);
      if (typeof body?.printAssetId === "string") {
        const trimmed = body.printAssetId.trim();
        if (trimmed && PRINT_ASSET_ID_REGEX.test(trimmed)) {
          printAssetId = trimmed;
        }
      }
      if (body?.promoCode && typeof body.promoCode === "string") {
        const trimmed = body.promoCode.trim();
        if (trimmed) {
          promoCode = trimmed.slice(0, 64);
        }
      }
      if (body?.shippingCountry && typeof body.shippingCountry === "string") {
        const trimmed = body.shippingCountry.trim();
        if (trimmed) {
          shippingCountry = trimmed.slice(0, 2).toUpperCase();
        }
      }
      if (body?.referralCode && typeof body.referralCode === "string") {
        const trimmed = body.referralCode.trim();
        if (trimmed) {
          referralCode = trimmed.slice(0, 64);
        }
      }
    } catch {
      // ignore missing/invalid body
    }

    const currentSessionId = req.cookies.get(PREMIUM_COOKIE_NAME)?.value?.trim();
    const fallbackReferralCode = readReferralCodeFromCookie(req);
    const referralAttribution = readReferralAttributionFromCookie(req);
    const referral = await resolveReferral(referralCode ?? fallbackReferralCode, currentSessionId);
    const referralAutoOffer = resolveReferralAutoOffer(referral.code);
    if (orderType === "print" && !printCheckoutEnabled) {
      return NextResponse.json(
        { error: "Print checkout is not enabled yet.", code: "print_checkout_disabled" },
        { status: 503 },
      );
    }
    if (orderType === "print" && !printAssetId) {
      return NextResponse.json(
        { error: "Could not prepare print file. Please reopen checkout and try again.", code: "missing_print_asset" },
        { status: 400 },
      );
    }
    if (orderType !== "print") {
        await assertDigitalCheckoutMap(mapId, plan);
    }
    const promotion = orderType === "digital" && plan === "subscription"
      ? { promotionCodeId: undefined, invalid: false, lookupFailed: false }
      : canUseManualPromotionCode(orderType, plan)
        ? await resolvePromotionCodeId(promoCode)
        : { promotionCodeId: undefined, invalid: false, lookupFailed: false };
    if (promoCode && promotion.invalid) {
      return NextResponse.json(
        { error: "Invalid or expired promotion code.", code: "invalid_promotion_code" },
        { status: 400 },
      );
    }
    if (promoCode && promotion.lookupFailed) {
      return NextResponse.json(
        { error: "Could not verify promotion code. Please try again.", code: "promotion_lookup_failed" },
        { status: 503 },
      );
    }
    const selectedPromotion = selectCheckoutPromotion({
      manualPromotionCodeId: promotion.invalid ? undefined : promotion.promotionCodeId,
      referralCode: referral.code,
      referralPromotionCodeId: referralAutoOffer.promotionCodeId,
      orderType,
      plan,
    });

    const idempotencyKey = checkoutIdempotencyKey({
      mapId,
      plan,
      orderType,
      printVariant,
      includeDigitalAddOn,
      shippingCountry: shippingCountry ?? null,
      promoCode: promoCode ?? null,
      referralCode: referral.code ?? null,
    });
    if (idempotencyKey) {
      const existingUrl = await kv.get<string>(idempotencyKey);
      if (typeof existingUrl === "string" && isValidStripeCheckoutUrl(existingUrl.trim())) {
        return NextResponse.json({
          url: existingUrl.trim(),
          promoApplied: false,
          referralOfferApplied: false,
          referralOfferVariant: null,
          promoLookupFailed: false,
        });
      }
    }

    await recordFunnelStep({
      step: "checkout_request_received",
      source: orderType === "print" ? "checkout_api_print_post" : "checkout_api_digital_post",
      plan: orderType === "print" ? printVariant : plan,
    });

    const session = await createCheckoutSession({
      plan,
      mapId,
      printAssetId,
      promotionCodeId: selectedPromotion.promotionCodeId,
      resolvedPromotionCode: selectedPromotion.source === "manual" ? promotion.promotionCode : undefined,
      promotionSource: selectedPromotion.source,
      // Always allow retry without auto-applied discount so manual promos cannot hard-fail checkout.
      fallbackOnDiscountError: true,
      orderType,
      printVariant,
      includeDigitalAddOn,
      shippingCountry,
      clientCountry,
      referralCode: referral.code,
      referrerSessionId: referral.referrerSessionId,
      referralAttribution,
      referralAutoOfferVariant: selectedPromotion.source === "referral_auto" ? referralAutoOffer.variant : undefined,
      idempotencyKey: idempotencyKey ?? undefined,
    });
    if (promoCode && session.discountRejected) {
      // Stripe rejected auto-apply (common on print + shipping). Still return checkout so the
      // customer can enter the code on the hosted page when allow_promotion_codes is enabled.
      if (idempotencyKey && typeof session.url === "string" && session.url.trim()) {
        await kv.set(idempotencyKey, session.url.trim(), { ex: CHECKOUT_IDEMPOTENCY_TTL_SECONDS });
      }
      await recordFunnelStep({
        step: "checkout_session_created",
        source: orderType === "print" ? "checkout_api_print_post" : "checkout_api_digital_post",
        plan: orderType === "print" ? printVariant : plan,
      });
      const rejectedUrl = session.url?.trim() ?? "";
      if (!rejectedUrl || !isValidStripeCheckoutUrl(rejectedUrl)) {
        return NextResponse.json(
          { error: "Checkout could not start securely. Please try again.", code: "invalid_checkout_url" },
          { status: 500 },
        );
      }
      return NextResponse.json({
        url: rejectedUrl,
        promoApplied: false,
        discountRejected: true,
        referralOfferApplied: false,
        referralOfferVariant: null,
        promoLookupFailed: promotion.lookupFailed,
      });
    }
    if (idempotencyKey && typeof session.url === "string" && session.url.trim()) {
      await kv.set(idempotencyKey, session.url.trim(), { ex: CHECKOUT_IDEMPOTENCY_TTL_SECONDS });
    }
    await recordFunnelStep({
      step: "checkout_session_created",
      source: orderType === "print" ? "checkout_api_print_post" : "checkout_api_digital_post",
      plan: orderType === "print" ? printVariant : plan,
    });

    await recordFunnelStep({
      step: "checkout_redirected",
      source: orderType === "print" ? "checkout_api_print_post" : "checkout_api_digital_post",
      plan: orderType === "print" ? printVariant : plan,
    });

    const checkoutUrl = session.url?.trim() ?? "";
    if (!checkoutUrl || !isValidStripeCheckoutUrl(checkoutUrl)) {
      await recordCheckoutFailure({
        reason: "invalid_checkout_url",
        source: orderType === "print" ? "checkout_api_print_post" : "checkout_api_digital_post",
        plan: orderType === "print" ? printVariant : plan,
      });
      return NextResponse.json(
        { error: "Checkout could not start securely. Please try again.", code: "invalid_checkout_url" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      url: checkoutUrl,
      promoApplied: selectedPromotion.source === "manual" && !session.discountRejected,
      referralOfferApplied: selectedPromotion.source === "referral_auto" && !session.discountRejected,
      referralOfferVariant:
        selectedPromotion.source === "referral_auto" && !session.discountRejected ? referralAutoOffer.variant ?? null : null,
      promoLookupFailed: promoCode ? promotion.lookupFailed : false,
    });
  } catch (err) {
    if (err instanceof CheckoutError) {
      await recordCheckoutFailure({
        reason: err.code,
        source: orderType === "print" ? "checkout_api_print_post" : "checkout_api_digital_post",
        plan: orderType === "print" ? printVariant : plan,
      });
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }

    const normalized = normalizeNonCheckoutError(err);
    await recordCheckoutFailure({
      reason: normalized.reason,
      source: orderType === "print" ? "checkout_api_print_post" : "checkout_api_digital_post",
      plan: orderType === "print" ? printVariant : plan,
    });
    console.error("Stripe checkout error", err);
    return NextResponse.json({ error: "Checkout failed", code: normalized.code }, { status: normalized.status });
  }
}
