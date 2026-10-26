import { androidAppCheckoutDecision, isAndroidAppModeRequest } from "@/lib/androidAppMode";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  getDigitalCadPriceCents,
  getPricingTiers,
  getPrintCadPriceCents,
  getPrintDigitalAddOnCadPriceCents,
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
import { PRINT_ASSET_ID_REGEX, normalizeRecipeFingerprint } from "@/lib/printAssets";
import { cardRecipeFingerprintSuffix } from "@/lib/printCardExport";
import { loadReusablePrintAssetId } from "@/lib/printAssetReuse";
import {
  canUseHostedPromotionCodes,
  canUseManualPromotionCode,
  isManualPromotionCompatibleWithOrder,
  selectCheckoutPromotion,
  type PromotionSource,
} from "@/lib/checkoutPromotions";
import { PREMIUM_COOKIE_NAME } from "@/lib/premium";
import { recordFunnelStep } from "@/lib/funnel";
import { getGeoDigitalSinglePrice, getRequestCountry } from "@/lib/geoPricing";
import { evaluatePrintMarginForCheckout } from "@/lib/printMargin";
import { applyPrintFreeShippingToCheckout } from "@/lib/printFreeShipping";
import { parsePrintVariant } from "@/lib/printCatalog";
import {
  getMerchCadCheckoutPriceCents,
  getMerchCheckoutPriceCents,
  getMerchFamily,
  getMerchStripePriceId,
  isMerchFamilyId,
  type MerchFamilyId,
} from "@/lib/merchCatalog";
import {
  buildCheckoutPricingIdentity,
  priceDataComponent,
  priceIdComponent,
  type CheckoutPriceComponent,
} from "@/lib/checkoutPricingIdentity";
import {
  MerchCheckoutError,
  applyMerchCheckoutMetadata,
  buildMerchCheckoutLineItem,
  getMerchShippingOptionsForCountry,
  resolveMerchForCheckout,
} from "@/lib/merchCheckout";
import {
  convertUsdCentsToCadCents,
  convertUsdShippingRateToCadCents,
  resolveCheckoutCurrency,
  type CheckoutCurrency,
} from "@/lib/checkoutCurrency";
import { getPrintfulShippingCountries, getPrintfulShippingRate } from "@/lib/printfulShipping";
import { applyMarketingAttributionMetadata } from "@/lib/commerceAnalytics";
import type { ReferralAttribution } from "@/lib/referralAttribution";
import { recordBuyerCheckoutFailure } from "@/lib/checkoutDiagnostics";
import {
  describeStripeCheckoutUrlShape,
  isValidStripeCheckoutUrl,
  resolveStripeCheckoutHandoffUrl,
  stripeCheckoutHtmlRedirectBody,
} from "@/lib/stripeCheckoutNavigation";
import {
  applyQaCheckoutMetadata,
  appendCheckoutIdempotencyQaSegment,
  resolveQaRequestContext,
  type QaRequestContext,
} from "@/lib/qaSession";
import {
  bestEffortCheckoutSideEffect,
  buildUnknownCheckoutFailureResponse,
  extractStripeErrorDiagnostics,
  logCheckoutFailure,
  resolveCheckoutCorrelationId,
  resolveCheckoutFailureReason,
} from "@/lib/checkoutResilience";
import {
  buildCheckoutCancelUrl,
  buildCheckoutEditorRecoveryUrl,
} from "@/lib/checkoutEditorRecovery";
import { normalizeCheckoutCustomerEmail } from "@/lib/checkoutCustomerEmail";
import { getCheckoutSessionExpiresAt } from "@/lib/checkoutSessionExpiry";
import {
  buildCheckoutConsentCollection,
  isPromotionsConsentUnsupportedError,
  shouldAttemptPromotionsConsent,
} from "@/lib/stripeConsentCollection";
import { evaluateCheckoutSkyGuard } from "@/lib/checkoutSkyGuard";
import { CHECKOUT_GIFT_METADATA_KEY } from "@/lib/checkoutGiftFlag";

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
  poster_unframed_16x16: process.env.STRIPE_PRICE_ID_PRINT_UNFRAMED_16X16,
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
const stripePaymentMethodConfigurationId = process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION_ID?.trim() ?? "";
const MAP_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const printAllowedCountries = parseAllowedShippingCountries(process.env.PRINT_ALLOWED_COUNTRIES);
const printCheckoutEnabled = /^(1|true|yes)$/i.test((process.env.PRINT_CHECKOUT_ENABLED || "").trim());
const printDynamicShippingEnabled = /^(1|true|yes)$/i.test((process.env.PRINT_DYNAMIC_SHIPPING || "").trim());

// Use fetch-based HTTP client to work in Cloudflare Workers.
// maxNetworkRetries: Stripe SDK reuses the same idempotency key across retries (explicit
// key when mapId present; SDK-generated key otherwise) — safe against duplicate sessions.
const stripe =
  stripeSecret &&
  new Stripe(stripeSecret, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
    timeout: 20_000,
    maxNetworkRetries: 2,
  });
const stripePriceProductIdCache = new Map<string, Promise<string | null>>();

/**
 * Session-create params plus the per-session Adaptive Pricing override
 * (T-FLEET-103). The pinned stripe@16.12 type surface predates the
 * parameter (added in Stripe API 2024-11-20; the step-0 audit verified
 * it overrides the dashboard Adaptive Pricing setting per session), so
 * it is declared here and forwarded verbatim by the SDK. Set ONLY on
 * CAD sessions: `adaptive_pricing: { enabled: false }` makes the native
 * CAD book the deterministic presented/charged currency. USD sessions
 * never carry the key, keeping their params byte-identical to before.
 */
type CheckoutSessionCreateParams = Stripe.Checkout.SessionCreateParams & {
  adaptive_pricing?: { enabled: boolean };
};

function siteOrigin() {
  return siteUrl.replace(/\/+$/, "");
}

function parseAllowedShippingCountries(raw: string | undefined) {
  const shippingMapFallback = getPrintfulShippingCountries().filter((token) => /^[A-Z]{2}$/.test(token));
  const fallback = (
    shippingMapFallback.length ? shippingMapFallback : ["US"]
  ) as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[];
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
  currency: CheckoutCurrency = "usd"
): {
  shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] | undefined;
  shippingChargeCents: number | null;
} {
  const configuredShippingRate = process.env.STRIPE_SHIPPING_RATE_ID_PRINT_STANDARD?.trim();
  const configuredFlatShippingCents = parsePositiveInt(process.env.PRINT_STANDARD_SHIPPING_CENTS);
  if (configuredShippingRate && !printDynamicShippingEnabled) {
    if (currency !== "cad") {
      return {
        shippingOptions: [{ shipping_rate: configuredShippingRate }],
        shippingChargeCents: configuredFlatShippingCents,
      };
    }
    // CAD session on the configured-rate path (T-FLEET-103 fix): the
    // configured rate ID references a USD Stripe shipping rate, and a
    // CAD session referencing it mixes currencies — Stripe refuses
    // session creation. Present the configured flat amount as a
    // converted fixed-amount CAD option instead, mirroring the dynamic
    // and flat-fallback branches below (conversion at the 1.40
    // reference rate; shippingChargeCents stays the canonical USD
    // figure). With no configured flat amount there is nothing local
    // to convert, so fall through to the rate-table / flat branches
    // below rather than emit the USD rate ID.
    if (configuredFlatShippingCents) {
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
                amount: convertUsdCentsToCadCents(configuredFlatShippingCents),
                currency: "cad",
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
        shippingChargeCents: configuredFlatShippingCents,
      };
    }
  }

  if (shippingCountry) {
    const rate = getPrintfulShippingRate(variant, shippingCountry);
    if (rate && Number.isFinite(rate.rate)) {
      const amountCents = Math.round(rate.rate * 100);
      // T-FLEET-103 (§3.4): the rate table is USD-denominated. A CAD
      // session must be single-currency, so the PRESENTED amount is
      // converted at the 1.40 reference rate and stamped "cad". The
      // returned shippingChargeCents stays the canonical USD charge —
      // the margin guard, free-shipping subsidy and metadata all keep
      // reading USD exactly as before (design §3.5/§3.6).
      const rateCurrency = (rate.currency || "USD").toLowerCase();
      const presentInCad = currency === "cad" && rateCurrency === "usd";
      return {
        shippingOptions: [
          {
            shipping_rate_data: {
              type: "fixed_amount",
              fixed_amount: {
                amount: presentInCad ? convertUsdShippingRateToCadCents(rate.rate) : amountCents,
                currency: presentInCad ? "cad" : rateCurrency,
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

  // Flat-rate fallback (T-FLEET-103 §3.4): the configured amount is
  // USD-denominated; a CAD session presents it converted at the 1.40
  // reference rate, stamped "cad". shippingChargeCents (returned
  // below) stays the USD amount, as in the dynamic path.
  const configuredCurrency = (process.env.CURRENCY ?? process.env.NEXT_PUBLIC_CURRENCY ?? "usd").trim().toLowerCase();
  const presentInCad = currency === "cad";
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
            amount: presentInCad ? convertUsdCentsToCadCents(amountCents) : amountCents,
            currency: presentInCad ? "cad" : configuredCurrency,
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

async function resolveCheckoutPrintAssetId(input: {
  mapId?: string;
  printAssetId?: string;
  recipeFingerprint?: string;
}): Promise<string | undefined> {
  if (input.printAssetId) return input.printAssetId;
  if (!input.mapId) return undefined;
  return loadReusablePrintAssetId(input.mapId, input.recipeFingerprint);
}

type StoredCheckoutMapRecord = {
  location?: { latitude?: number; longitude?: number };
};

async function loadCheckoutMapRecord(mapId: string): Promise<StoredCheckoutMapRecord | null> {
  const record = await kv.get<StoredCheckoutMapRecord>(`map:${mapId}`);
  return record ?? null;
}

/**
 * Refuse checkout when the saved design still uses the DEFAULT_RECIPE
 * placeholder sky (latitude and longitude both exactly 0).
 */
async function assertConfiguredSkyForCheckout(mapId: string | undefined) {
  if (!mapId) return;
  const record = await loadCheckoutMapRecord(mapId);
  if (!record) return;
  const guard = evaluateCheckoutSkyGuard(record);
  if (!guard.ok) {
    throw new CheckoutError(guard.message, guard.code, 400);
  }
}

async function assertDigitalCheckoutMap(mapId: string | undefined, plan: CheckoutPlan) {
  // Subscription checkout doesn't require a map preview to start payment,
  // so don't block on missing map_id for that plan.
  if (plan === "subscription") return;

  if (!mapId) {
    throw new CheckoutError("Create your map preview before starting checkout.", "map_required", 400);
  }
  const record = await loadCheckoutMapRecord(mapId);
  if (!record) {
    throw new CheckoutError(
      "We couldn't find that map. Open the editor, generate your preview, then retry checkout.",
      "map_not_found",
      404
    );
  }
  const guard = evaluateCheckoutSkyGuard(record);
  if (!guard.ok) {
    throw new CheckoutError(guard.message, guard.code, 400);
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
  if (
    typeof stripeError.code === "string" &&
    /promotion|discount|coupon|coupon_invalid/i.test(stripeError.code)
  ) {
    return true;
  }
  if (
    typeof stripeError.message === "string" &&
    /promotion code|discount|coupon/i.test(stripeError.message)
  ) {
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

function resolveExpandedPromotionCode(
  promotionCode: Stripe.PromotionCode | null | undefined
): ResolvedPromotionCode | null {
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

  // Callers may pre-apply active Stripe promotion codes. Print accepts general
  // codes; digital single accepts only coupons tagged digital_comp (validated
  // after resolve). Hosted allow_promotion_codes stays print-only.
  if (
    configuredPromoCode &&
    configuredStripePromotionCodeId &&
    trimmed.toUpperCase() === configuredPromoCode
  ) {
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

    const matched = list.data.find(
      (item) =>
        item.active &&
        item.coupon?.valid !== false &&
        typeof item.code === "string" &&
        item.code.trim().toUpperCase() === trimmed.toUpperCase()
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
      return typeof product === "string" ? product : (product?.id ?? null);
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
  const lineItemSubtotalCents = input.lineItems.reduce(
    (total, item) => total + Math.max(0, item.amountCents),
    0
  );

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

  if (
    typeof coupon.percent_off === "number" &&
    Number.isFinite(coupon.percent_off) &&
    coupon.percent_off > 0
  ) {
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


const ANDROID_APP_DIGITAL_BLOCKED = {
  error: "Digital downloads aren't available in the StarMapCo Android app. Printed maps are available.",
  code: "android_app_digital_unavailable",
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
  reason: string; // for checkout diagnostics + dashboards
  status: number;
  errorMessage: string | null;
} {
  return resolveCheckoutFailureReason(err, 500);
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

/** STAR-006: presence-only browser handoff signal. Never stores the raw token. */
const CHECKOUT_HANDOFF_TOKEN_RE = /^b[a-f0-9]{16}$/i;

function resolveCheckoutHandoff(raw: unknown): "browser" | "missing" {
  if (typeof raw !== "string") return "missing";
  const token = raw.trim();
  if (!token || token.length > 32) return "missing";
  return CHECKOUT_HANDOFF_TOKEN_RE.test(token) ? "browser" : "missing";
}

/** Short non-reversible tag so a changed recovery email yields a new checkout cache identity (no PII in keys). */
function checkoutEmailIdempotencyTag(email: string): string {
  let hash = 2166136261;
  const value = email.trim().toLowerCase();
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Stripe caps idempotency keys at 255 chars; fallback suffixes (:no-discount, :no-promo-consent)
 * add up to ~30 more. Collapse long keys to a stable hash-tagged form.
 */
function boundStripeIdempotencyKey(key: string, maxLength = 200): string {
  if (key.length <= maxLength) return key;
  return `${key.slice(0, maxLength - 24)}:h${checkoutEmailIdempotencyTag(key)}${key.length.toString(36)}`;
}

/**
 * The pricing identity of what createCheckoutSession will charge for
 * this order, resolved from the same sources with the same preference
 * order it uses to build its line items: the configured Stripe Price
 * ID when one is set, otherwise the price_data tier (currency +
 * amount); a geo-priced digital single resolves to its geo price_data.
 * Appended to the idempotency key (see checkoutPricingIdentity.ts) so
 * a pricing change can never reuse a cached checkout URL or a Stripe
 * idempotency key minted at the old price, while same-price retries
 * still dedupe to the same key. MUST track the line-item construction
 * in createCheckoutSession.
 *
 * T-FLEET-103: the session currency comes from the same single
 * resolver the session builder uses (resolveCheckoutCurrency). A CAD
 * session always charges price_data from the native CAD book, so its
 * components are pd:cad:<cents> per charged line — a CA cart can never
 * share a cache key or Stripe idempotency key with the same cart
 * priced in USD, in either direction, across the flip.
 */
function resolveCheckoutPricingIdentity(input: {
  plan: CheckoutPlan;
  orderType: CheckoutOrderType;
  printVariant?: PrintVariant;
  includeDigitalAddOn?: boolean;
  includeCardAddOn?: boolean;
  merchFamily?: MerchFamilyId;
  shippingCountry?: string | null;
  clientCountry?: string | null;
}): string {
  const isPrintOrder = parseOrderType(input.orderType) === "print";
  const currency = resolveCheckoutCurrency({
    orderType: input.orderType,
    shippingCountry: input.shippingCountry,
    clientCountry: input.clientCountry,
  });
  const components: CheckoutPriceComponent[] = [];
  if (!isPrintOrder) {
    if (currency === "cad") {
      components.push(priceDataComponent("cad", getDigitalCadPriceCents(input.plan)));
      return buildCheckoutPricingIdentity(components);
    }
    const tier = getPricingTiers()[input.plan];
    const geoDigitalSingle =
      input.plan === "single" ? getGeoDigitalSinglePrice(input.clientCountry) : null;
    if (geoDigitalSingle?.amountCents) {
      components.push(priceDataComponent(tier.currency, geoDigitalSingle.amountCents));
    } else {
      const priceId = stripePriceIds[input.plan]?.trim();
      components.push(
        priceId ? priceIdComponent(priceId) : priceDataComponent(tier.currency, tier.amountCents),
      );
    }
    return buildCheckoutPricingIdentity(components);
  }
  const normalizedPrintVariant = parsePrintVariant(input.printVariant);
  if (input.merchFamily) {
    const family = getMerchFamily(input.merchFamily);
    if (currency === "cad") {
      components.push(priceDataComponent("cad", getMerchCadCheckoutPriceCents(family)));
      return buildCheckoutPricingIdentity(components);
    }
    const priceId = getMerchStripePriceId(family);
    components.push(
      priceId
        ? priceIdComponent(priceId)
        : priceDataComponent("usd", getMerchCheckoutPriceCents(family)),
    );
    return buildCheckoutPricingIdentity(components);
  }
  if (currency === "cad") {
    components.push(priceDataComponent("cad", getPrintCadPriceCents(normalizedPrintVariant)));
    if (input.includeDigitalAddOn) {
      components.push(priceDataComponent("cad", getPrintDigitalAddOnCadPriceCents()));
    }
    // Mirror createCheckoutSession: the card add-on is charged only for
    // framed posters without the digital add-on (merch handled above).
    if (
      input.includeCardAddOn &&
      normalizedPrintVariant === "poster_framed" &&
      !input.includeDigitalAddOn
    ) {
      components.push(priceDataComponent("cad", getPrintCadPriceCents("card_4x6")));
    }
    return buildCheckoutPricingIdentity(components);
  }
  const printTiers = getPrintPricingTiers();
  const printTier = printTiers[normalizedPrintVariant];
  const printPriceId = stripePrintVariantPriceIds[normalizedPrintVariant]?.trim();
  components.push(
    printPriceId
      ? priceIdComponent(printPriceId)
      : priceDataComponent(printTier.currency, printTier.amountCents),
  );
  if (input.includeDigitalAddOn) {
    const addOnTier = getPrintDigitalAddOnPrice();
    const addOnPriceId = stripePrintDigitalAddOnPriceId?.trim();
    components.push(
      addOnPriceId
        ? priceIdComponent(addOnPriceId)
        : priceDataComponent(addOnTier.currency, addOnTier.amountCents),
    );
  }
  // Mirror createCheckoutSession: the card add-on is charged only for
  // framed posters without the digital add-on (merch handled above).
  if (
    input.includeCardAddOn &&
    normalizedPrintVariant === "poster_framed" &&
    !input.includeDigitalAddOn
  ) {
    const cardTier = printTiers.card_4x6;
    const cardPriceId = stripePrintVariantPriceIds.card_4x6?.trim();
    components.push(
      cardPriceId
        ? priceIdComponent(cardPriceId)
        : priceDataComponent(cardTier.currency, cardTier.amountCents),
    );
  }
  return buildCheckoutPricingIdentity(components);
}

function checkoutIdempotencyKey(input: {
  mapId?: string;
  plan: CheckoutPlan;
  orderType: CheckoutOrderType;
  printVariant?: PrintVariant;
  includeDigitalAddOn?: boolean;
  includeCardAddOn?: boolean;
  merchFamily?: MerchFamilyId;
  merchSize?: string;
  merchColor?: string;
  shippingCountry?: string | null;
  promoCode?: string | null;
  referralCode?: string | null;
  qaContext?: QaRequestContext | null;
  androidAppMode?: boolean;
  customerEmail?: string | null;
  /** Effective pricing identity (resolveCheckoutPricingIdentity); scopes the key to the charged price. */
  pricingIdentity?: string;
  /** Gift flag; scopes the key so a toggled gift checkbox can never reuse the other flavour's session. */
  isGift?: boolean;
}) {
  const mapId = typeof input.mapId === "string" ? input.mapId.trim() : "";
  if (!mapId) return null;
  const plan = input.plan;
  const orderType = input.orderType;
  const printVariant = parsePrintVariant(input.printVariant);
  const includeDigitalAddOn = input.includeDigitalAddOn ? "1" : "0";
  const includeCardAddOn = input.includeCardAddOn ? "1" : "0";
  const merchFamily = normalizeIdempotencyToken(input.merchFamily, 32);
  const merchSize = normalizeIdempotencyToken(input.merchSize, 16);
  const merchColor = normalizeIdempotencyToken(input.merchColor, 16);
  const shipping = normalizeIdempotencyToken(input.shippingCountry, 8);
  const promo = normalizeIdempotencyToken(input.promoCode, 48);
  const referral = normalizeIdempotencyToken(input.referralCode, 48);
  const emailSegment = input.customerEmail ? `:em${checkoutEmailIdempotencyTag(input.customerEmail)}` : "";
  const pricingSegment = input.pricingIdentity ? `:${input.pricingIdentity}` : "";
  // Gift segment (G-dot recheck on PR #349): the flag changes what the
  // session MEANS — its metadata suppresses every review ask — so like
  // the price it is part of the reuse identity, appended after the
  // pricing segment. Absent for non-gift, so non-gift keys stay
  // byte-identical to before; gift and non-gift can never share a
  // cached URL or a Stripe idempotency key in either direction.
  const giftSegment = input.isGift ? ":gift" : "";
  const baseWithoutMapId = `${CHECKOUT_IDEMPOTENCY_PREFIX}${orderType}:${plan}:${printVariant}:${includeDigitalAddOn}:${includeCardAddOn}:${merchFamily}:${merchSize}:${merchColor}:${shipping}:${promo}:${referral}${emailSegment}${input.androidAppMode ? ":app-android" : ""}${pricingSegment}${giftSegment}`;
  return appendCheckoutIdempotencyQaSegment(baseWithoutMapId, input.qaContext, mapId);
}

async function createCheckoutSession(input: {
  plan: CheckoutPlan;
  mapId?: string;
  printAssetId?: string;
  cardPrintAssetId?: string;
  promotionCodeId?: string;
  resolvedPromotionCode?: ResolvedPromotionCode;
  fallbackOnDiscountError?: boolean;
  orderType?: CheckoutOrderType;
  printVariant?: PrintVariant;
  includeDigitalAddOn?: boolean;
  includeCardAddOn?: boolean;
  /** Buyer marked the order as a gift (editor checkbox). Never priced; carried in the checkout reuse identity (gift segment) so a toggled checkbox cannot reuse the wrong session. */
  isGift?: boolean;
  shippingCountry?: string;
  clientCountry?: string | null;
  /** Optional pre-checkout email for Stripe recovery emails (`customer_email`). */
  customerEmail?: string;
  referralCode?: string;
  referrerSessionId?: string;
  referralAttribution?: ReferralAttribution | null;
  promotionSource?: PromotionSource;
  referralAutoOfferVariant?: ReferralAutoOfferVariant;
  checkoutSource?: string;
  /** Presence-only: `browser` or `missing`. Never a raw client token. */
  checkoutHandoff?: "browser" | "missing";
  idempotencyKey?: string;
  merchFamily?: MerchFamilyId;
  merchOptions?: { size?: string; color?: string };
  qaContext?: QaRequestContext;
}): Promise<CheckoutSessionResult> {
  const {
    plan,
    mapId,
    printAssetId,
    cardPrintAssetId,
    promotionCodeId,
    resolvedPromotionCode,
    fallbackOnDiscountError = true,
    orderType = "digital",
    printVariant = "poster_framed",
    includeDigitalAddOn = false,
    includeCardAddOn = false,
    shippingCountry,
    clientCountry,
    customerEmail: customerEmailInput,
    referralCode,
    referrerSessionId,
    referralAttribution,
    promotionSource = "none",
    referralAutoOfferVariant,
    checkoutSource,
    checkoutHandoff = "missing",
    idempotencyKey,
    isGift = false,
    merchFamily,
    merchOptions,
    qaContext = { enabled: false, source: null, status: "absent" },
  } = input;
  const customerEmail = normalizeCheckoutCustomerEmail(customerEmailInput);
  if (!stripe) {
    throw new Error("Stripe not configured");
  }

  const normalizedOrderType = parseOrderType(orderType);
  const isPrintOrder = normalizedOrderType === "print";
  const normalizedPrintVariant = parsePrintVariant(printVariant);
  const resolvedMerch = merchFamily
    ? await resolveMerchForCheckout({
        familyId: merchFamily,
        options: merchOptions ?? {},
      })
    : null;
  const isMerchOrder = Boolean(resolvedMerch);
  const normalizedIncludeCardAddOn =
    !isMerchOrder && includeCardAddOn && normalizedPrintVariant === "poster_framed" && !includeDigitalAddOn;
  const effectivePlan = isPrintOrder ? "single" : plan;
  // Hosted Stripe promo entry is print-only; digital comps are applied via `discounts`.
  const allowPromotionCodes = canUseHostedPromotionCodes(normalizedOrderType, effectivePlan);
  const mapQuery = mapId ? `&map_id=${encodeURIComponent(mapId)}` : "";
  const orderQuery = `&order_type=${normalizedOrderType}`;
  const printQuery = isPrintOrder ? `&print_variant=${normalizedPrintVariant}` : "";
  const successUrl = `${siteOrigin()}/success?session_id={CHECKOUT_SESSION_ID}${mapQuery}${orderQuery}${printQuery}`;
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
      400
    );
  }
  const resolvedShippingCountry =
    isPrintOrder &&
    normalizedRequestedShippingCountry &&
    allowedCountries.includes(normalizedRequestedShippingCountry)
      ? normalizedRequestedShippingCountry
      : null;
  if (isPrintOrder && requestedShippingCountry && !resolvedShippingCountry) {
    throw new CheckoutError("Unsupported shipping country.", "print_shipping_country_invalid", 400);
  }
  // Cancel returns buyers to the editor with checkout (and country control) reopened.
  // Keep Stripe shipping_address_collection locked to the priced country so dynamic
  // Printful rates stay correct; gift shippers change country in the editor before pay.
  const cancelUrl = buildCheckoutCancelUrl({
    siteOrigin: siteOrigin(),
    mapId,
    orderType: normalizedOrderType,
    plan: effectivePlan,
    printVariant: isPrintOrder ? normalizedPrintVariant : null,
    shippingCountry: resolvedShippingCountry,
    includeDigitalAddOn: !isMerchOrder && includeDigitalAddOn,
    includeCardAddOn: normalizedIncludeCardAddOn,
  });
  // T-FLEET-103: one currency decision for the whole session, from the
  // single resolver the pricing identity also uses (print/merch follow
  // the validated shipping country; digital follows the client IP
  // country). CA sessions charge the native CAD book with Adaptive
  // Pricing switched off per session; everyone else is unchanged.
  const checkoutCurrency = resolveCheckoutCurrency({
    orderType: normalizedOrderType,
    shippingCountry: resolvedShippingCountry,
    clientCountry,
  });
  const isCadCheckout = checkoutCurrency === "cad";
  const printShippingSelection =
    isPrintOrder && isMerchOrder && resolvedMerch
      ? await getMerchShippingOptionsForCountry(
          resolvedMerch.catalogVariantId,
          resolvedShippingCountry,
          checkoutCurrency
        )
      : isPrintOrder
        ? getPrintShippingOptionsForCountry(normalizedPrintVariant, resolvedShippingCountry, checkoutCurrency)
        : { shippingOptions: undefined, shippingChargeCents: null };
  let printShippingOptions = printShippingSelection.shippingOptions;
  let printShippingChargeCents = printShippingSelection.shippingChargeCents;
  // The geo-pricing experiment never prices CA (design §1.2); for a CA
  // buyer the native CAD book takes precedence so the session stays
  // single-currency. Non-CA behaviour is untouched.
  const geoDigitalSingle =
    !isPrintOrder && effectivePlan === "single" && !isCadCheckout
      ? getGeoDigitalSinglePrice(clientCountry)
      : null;
  const useGeoDigitalSinglePricing = Boolean(geoDigitalSingle?.amountCents);

  const metadata: Record<string, string> = { order_type: normalizedOrderType };
  // Reconciliation marker (T-FLEET-103 §3.8): the currency this session
  // charges in. No fulfillment or DL-1 metadata key changes meaning.
  metadata.checkout_currency = checkoutCurrency;
  const normalizedCheckoutSource = normalizeIdempotencyToken(checkoutSource, 48);
  if (normalizedCheckoutSource) metadata.checkout_source = normalizedCheckoutSource;
  metadata.checkout_handoff = checkoutHandoff === "browser" ? "browser" : "missing";
  // Gift orders are excluded from review asks (T1). Metadata-only: the flag
  // never touches amounts, line items, or the idempotency/cache key.
  if (isGift) metadata[CHECKOUT_GIFT_METADATA_KEY] = "true";
  if (mapId) metadata.map_id = mapId;
  if (isPrintOrder) {
    metadata.print_variant = normalizedPrintVariant;
    metadata.print_include_digital = !isMerchOrder && includeDigitalAddOn ? "true" : "false";
    metadata.print_include_card = normalizedIncludeCardAddOn ? "true" : "false";
    if (printAssetId) metadata.print_asset_id = printAssetId;
    if (normalizedIncludeCardAddOn && cardPrintAssetId) metadata.print_card_asset_id = cardPrintAssetId;
    if (!isMerchOrder && includeDigitalAddOn) {
      metadata.plan = "single";
      metadata.credits = "1";
    }
    if (resolvedMerch) {
      applyMerchCheckoutMetadata(metadata, resolvedMerch);
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
  if (referralCode && referralAttribution?.campaign)
    metadata.referral_campaign = referralAttribution.campaign;
  if (referralCode && referralAttribution?.content) metadata.referral_content = referralAttribution.content;
  applyMarketingAttributionMetadata(metadata, referralAttribution ?? null);
  if (geoDigitalSingle) {
    metadata.geo_pricing_country = geoDigitalSingle.country;
    metadata.geo_pricing_amount_cents = String(geoDigitalSingle.amountCents);
  }
  if (isPrintOrder && resolvedShippingCountry) {
    metadata.print_shipping_country = resolvedShippingCountry;
  }
  applyQaCheckoutMetadata(metadata, qaContext);

  const digitalPriceId = stripePriceIds[effectivePlan]?.trim();
  const useDigitalPriceId = Boolean(digitalPriceId) && !useGeoDigitalSinglePricing;
  const digitalCadPriceCents = getDigitalCadPriceCents(effectivePlan);

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  // Estimate lines in the SESSION's currency: the promotion estimator
  // must see the amounts and currency the buyer will actually be
  // charged (a USD amount-off coupon correctly fails its currency
  // check against a CAD session — design §3.7).
  const promotionEstimateLineItems: Array<{ amountCents: number; priceId?: string | null }> = [];
  // Canonical USD mirror of the same lines. Free-shipping eligibility
  // is decided on the USD merchandise subtotal and the margin guard is
  // evaluated on USD amounts, both exactly as before (design
  // §3.5/§3.6) — buyer currency never enters either.
  const promotionEstimateLineItemsUsd: Array<{ amountCents: number; priceId?: string | null }> = [];
  if (isPrintOrder && isMerchOrder && resolvedMerch) {
    const merchLine = buildMerchCheckoutLineItem(resolvedMerch, checkoutCurrency);
    lineItems.push(merchLine.lineItem);
    promotionEstimateLineItems.push(merchLine.promotionEstimate);
  } else if (isPrintOrder) {
    const printPriceId = stripePrintVariantPriceIds[normalizedPrintVariant]?.trim();
    const printCadPriceCents = isCadCheckout ? getPrintCadPriceCents(normalizedPrintVariant) : null;
    const printProductData = {
      name: `Custom Star Map — ${printTier.label}`,
      description: printTier.includesFrame
        ? `${printTier.label} • Shipping address required`
        : `${printTier.label} • Shipping address required`,
      images: [`${siteUrl}/custom-star-map-anniversary.webp`],
    };
    lineItems.push({
      ...(printCadPriceCents !== null
        ? {
            price_data: {
              currency: "cad",
              unit_amount: printCadPriceCents,
              product_data: printProductData,
            },
          }
        : printPriceId
          ? { price: printPriceId }
          : {
              price_data: {
                currency: printTier.currency,
                unit_amount: printTier.amountCents,
                product_data: printProductData,
              },
            }),
      quantity: 1,
    });
    promotionEstimateLineItems.push({
      amountCents: printCadPriceCents ?? printTier.amountCents,
      priceId: printCadPriceCents !== null ? null : printPriceId || null,
    });
    promotionEstimateLineItemsUsd.push({
      amountCents: printTier.amountCents,
      priceId: printPriceId || null,
    });
    if (includeDigitalAddOn) {
      const digitalAddOnPriceId = stripePrintDigitalAddOnPriceId?.trim();
      const addOnCadPriceCents = isCadCheckout ? getPrintDigitalAddOnCadPriceCents() : null;
      const addOnProductData = {
        name: "HD Digital Download Add-on",
        description: "6000px-wide digital file (up to 6000×9000 by format) delivered instantly after payment",
        images: [`${siteUrl}/custom-star-map-anniversary.webp`],
      };
      lineItems.push({
        ...(addOnCadPriceCents !== null
          ? {
              price_data: {
                currency: "cad",
                unit_amount: addOnCadPriceCents,
                product_data: addOnProductData,
              },
            }
          : digitalAddOnPriceId
            ? { price: digitalAddOnPriceId }
            : {
                price_data: {
                  currency: digitalAddOnTier.currency,
                  unit_amount: digitalAddOnTier.amountCents,
                  product_data: addOnProductData,
                },
              }),
        quantity: 1,
      });
      promotionEstimateLineItems.push({
        amountCents: addOnCadPriceCents ?? digitalAddOnTier.amountCents,
        priceId: addOnCadPriceCents !== null ? null : digitalAddOnPriceId || null,
      });
      promotionEstimateLineItemsUsd.push({
        amountCents: digitalAddOnTier.amountCents,
        priceId: digitalAddOnPriceId || null,
      });
    }
    if (normalizedIncludeCardAddOn) {
      const cardTier = printTiers.card_4x6;
      const cardPriceId = stripePrintVariantPriceIds.card_4x6?.trim();
      const cardCadPriceCents = isCadCheckout ? getPrintCadPriceCents("card_4x6") : null;
      const cardProductData = {
        name: `Custom Star Map — ${cardTier.label}`,
        description: `${cardTier.label} • Bundled with framed print`,
        images: [`${siteUrl}/custom-star-map-anniversary.webp`],
      };
      lineItems.push({
        ...(cardCadPriceCents !== null
          ? {
              price_data: {
                currency: "cad",
                unit_amount: cardCadPriceCents,
                product_data: cardProductData,
              },
            }
          : cardPriceId
            ? { price: cardPriceId }
            : {
                price_data: {
                  currency: cardTier.currency,
                  unit_amount: cardTier.amountCents,
                  product_data: cardProductData,
                },
              }),
        quantity: 1,
      });
      promotionEstimateLineItems.push({
        amountCents: cardCadPriceCents ?? cardTier.amountCents,
        priceId: cardCadPriceCents !== null ? null : cardPriceId || null,
      });
      promotionEstimateLineItemsUsd.push({
        amountCents: cardTier.amountCents,
        priceId: cardPriceId || null,
      });
    }
  } else {
    const digitalLineItem:
      | { price: string }
      | { price_data: Stripe.Checkout.SessionCreateParams.LineItem.PriceData } = isCadCheckout
      ? {
          // CAD digital always mints via price_data from the native CAD
          // book — never a USD Price ID (design §2.2). Product strings
          // mirror the USD price_data branches below exactly.
          price_data:
            effectivePlan === "subscription"
              ? {
                  currency: "cad",
                  unit_amount: digitalCadPriceCents,
                  recurring: { interval: "month" },
                  product_data: {
                    name: "Unlimited HD Star Maps (Monthly)",
                    description: "Unlimited HD exports • No watermark • Instant download",
                    images: [`${siteUrl}/custom-star-map-anniversary.webp`],
                  },
                }
              : {
                  currency: "cad",
                  unit_amount: digitalCadPriceCents,
                  product_data: {
                    name:
                      effectivePlan === "pack3" ? "HD Star Map Export Credits (3)" : "HD Star Map Download",
                    description:
                      effectivePlan === "pack3"
                        ? "3 HD export credits for your map versions • No watermark • Instant unlock"
                        : "Print-ready 6000px-wide star map (up to 6000×9000 by format) • No watermark • Instant download • Perfect for framing",
                    images: [`${siteUrl}/custom-star-map-anniversary.webp`],
                  },
                },
        }
      : useDigitalPriceId
        ? { price: digitalPriceId as string }
      : effectivePlan === "single" && geoDigitalSingle
        ? {
            price_data: {
              currency: tier.currency,
              unit_amount: geoDigitalSingle.amountCents,
              product_data: {
                name: "HD Star Map Download",
                description:
                  "Print-ready 6000px-wide star map (up to 6000×9000 by format) • No watermark • Instant download • Perfect for framing",
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
                      name:
                        effectivePlan === "pack3" ? "HD Star Map Export Credits (3)" : "HD Star Map Download",
                      description:
                        effectivePlan === "pack3"
                          ? "3 HD export credits for your map versions • No watermark • Instant unlock"
                          : "Print-ready 6000px-wide star map (up to 6000×9000 by format) • No watermark • Instant download • Perfect for framing",
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
    // The estimator validates against the SESSION's currency and
    // amounts (design §3.7): a USD amount-off coupon fails its currency
    // check on a CAD session and the buyer hears the promo does not
    // apply — rather than being charged in CAD against a USD discount.
    const discountEstimate = await estimatePromotionDiscountCents({
      promotionCode: resolvedPromotionCode,
      currency: isCadCheckout ? "cad" : printTier.currency,
      lineItems: promotionEstimateLineItems,
    });
    if (discountEstimate === null || discountEstimate <= 0) {
      throw new CheckoutError(
        "That promo code does not apply to this print order.",
        "promotion_not_applicable",
        400
      );
    }
    estimatedPromotionDiscountCents = discountEstimate;
    metadata.promotion_discount_estimate_cents = String(estimatedPromotionDiscountCents);
  }

  if (isPrintOrder && !isMerchOrder) {
    // USD mirror lines: the free-shipping threshold is a USD figure
    // (design §3.5), so eligibility reads the USD subtotal even for a
    // CAD session. For USD sessions this is the same sum as before.
    const merchandiseSubtotalCents = promotionEstimateLineItemsUsd.reduce(
      (sum, item) => sum + item.amountCents,
      0
    );
    // Free shipping is decided on the PRE-discount merchandise subtotal —
    // the same basis the storefront promise uses (printFreeShipping
    // display helpers qualify via getPrintMerchandiseSubtotalCents, and
    // the offer copy states the threshold on merchandise). Deciding on
    // the after-discount estimate broke that promise: the $106 framed +
    // HD bundle dropped to ~$90 under a 15% promo and was charged
    // shipping the site said was free (audit F4).
    const freeShippingSelection = applyPrintFreeShippingToCheckout(
      { shippingOptions: printShippingOptions, shippingChargeCents: printShippingChargeCents },
      merchandiseSubtotalCents,
      checkoutCurrency
    );
    printShippingOptions = freeShippingSelection.shippingOptions;
    printShippingChargeCents = freeShippingSelection.shippingChargeCents;
    if (freeShippingSelection.freeShippingApplied) {
      metadata.print_free_shipping_applied = "true";
      metadata.print_shipping_charge_cents = "0";
      if (typeof freeShippingSelection.shippingSubsidyCents === "number") {
        metadata.print_shipping_subsidy_cents = String(freeShippingSelection.shippingSubsidyCents);
      }
    } else if (typeof printShippingChargeCents === "number") {
      metadata.print_shipping_charge_cents = String(printShippingChargeCents);
    }

    // The margin guard evaluates USD revenue against USD costs
    // (design §3.6): for a CAD session, re-estimate the promotion
    // against the USD lines so the guard sees the same discount it
    // would have seen pre-change. Only percent coupons can pass the
    // CAD estimator gate above (amount-off fails its currency check),
    // and the step-0 audit verified no amount-off coupon carries a
    // minimum-amount restriction, so this estimate exists whenever
    // the session estimate did.
    let guardDiscountCents = estimatedPromotionDiscountCents;
    if (isCadCheckout && promotionCodeId) {
      const usdDiscountEstimate = await estimatePromotionDiscountCents({
        promotionCode: resolvedPromotionCode,
        currency: "usd",
        lineItems: promotionEstimateLineItemsUsd,
      });
      guardDiscountCents = usdDiscountEstimate ?? 0;
    }
    const marginCheck = evaluatePrintMarginForCheckout({
      variant: normalizedPrintVariant,
      shippingCountry: resolvedShippingCountry,
      shippingChargeCents: printShippingChargeCents,
      includeDigitalAddOn,
      includeCardAddOn: normalizedIncludeCardAddOn,
      discountAmountCents: guardDiscountCents,
    });
    if (!marginCheck.allowed) {
      const baseMessage =
        marginCheck.code === "margin_estimate_unavailable"
          ? "We can't calculate shipping for this print order yet. Please choose a shipping country (or try again in a moment)."
          : "This print option isn't available at that price for the selected shipping country right now.";
      throw new CheckoutError(
        promotionCodeId
          ? "That promo code can't be applied to this print order. Please remove the code or choose a different format."
          : `${baseMessage} Please pick a different country or format.`,
        promotionCodeId ? "print_promotion_margin_blocked" : "print_margin_guard_blocked",
        400
      );
    }
  }

  const attemptPromotionsConsent = shouldAttemptPromotionsConsent();
  const sessionParams: CheckoutSessionCreateParams = {
    mode: !isPrintOrder && effectivePlan === "subscription" ? "subscription" : "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    // 2h TTL so abandoned sessions expire promptly and recovery emails can fire.
    expires_at: getCheckoutSessionExpiresAt(),
    after_expiration: {
      recovery: {
        enabled: true,
        ...(allowPromotionCodes ? { allow_promotion_codes: true } : {}),
      },
    },
    client_reference_id: mapId,
    line_items: lineItems,
    // T-FLEET-103 §3.3: CAD sessions ONLY — the native CAD book is the
    // presented and charged currency, with no Adaptive Pricing
    // conversion or uplift layered on top. Non-CAD sessions never
    // carry this key and keep today's presentment behaviour exactly.
    ...(isCadCheckout ? { adaptive_pricing: { enabled: false } } : {}),
    metadata,
    subscription_data: !isPrintOrder && effectivePlan === "subscription" ? { metadata } : undefined,
    ...(allowPromotionCodes && !promotionCodeId ? { allow_promotion_codes: true } : {}),
    discounts: promotionCodeId ? [{ promotion_code: promotionCodeId }] : undefined,
    // Print and digital both use Stripe `auto` billing collection. Printful
    // fulfills from the shipping recipient address, not the billing address
    // (#224 / audit #222). Do not reintroduce print `required` billing.
    billing_address_collection: "auto",
    // Optional recovery email collected before Stripe Checkout when provided.
    ...(customerEmail ? { customer_email: customerEmail } : {}),
    phone_number_collection: {
      enabled: isPrintOrder,
    },
    // ToS checkbox removed — agreement is disclosed in submit message + editor pay CTA.
    // Promotions consent still attempted when the Stripe account supports it (#282 fallback).
    consent_collection: buildCheckoutConsentCollection(attemptPromotionsConsent),
    custom_text: {
      submit: {
        message: isPrintOrder
          ? `By completing your purchase you agree to our [Terms of Service](${siteUrl}/terms) and [Privacy Policy](${siteUrl}/privacy). Secure payment • Print order created after checkout`
          : effectivePlan === "subscription"
            ? `By completing your purchase you agree to our [Terms of Service](${siteUrl}/terms) and [Privacy Policy](${siteUrl}/privacy). Secure payment • Cancel anytime • Instant access`
            : `By completing your purchase you agree to our [Terms of Service](${siteUrl}/terms) and [Privacy Policy](${siteUrl}/privacy). Secure payment • Instant access • No subscription`,
      },
    },
    ...(stripePaymentMethodConfigurationId
      ? { payment_method_configuration: stripePaymentMethodConfigurationId }
      : {}),
    // Lock Stripe shipping countries to the priced route so Printful dynamic rates stay correct.
    // Buyers change country via the editor control (cancel_url reopens checkout).
    shipping_address_collection: isPrintOrder
      ? {
          allowed_countries: resolvedShippingCountry
            ? [
                resolvedShippingCountry as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry,
              ]
            : printAllowedCountries,
        }
      : undefined,
    shipping_options: printShippingOptions,
  };

  async function createStripeSession(
    params: CheckoutSessionCreateParams,
    key?: string
  ): Promise<Stripe.Checkout.Session> {
    if (!stripe) {
      throw new Error("Stripe not configured");
    }
    return stripe.checkout.sessions.create(params, key ? { idempotencyKey: key } : undefined);
  }

  async function createSessionWithConsentFallback(
    params: CheckoutSessionCreateParams,
    key: string | undefined
  ): Promise<Stripe.Checkout.Session> {
    try {
      return await createStripeSession(params, key);
    } catch (error) {
      // Canadian / non-US Stripe accounts may reject consent_collection.promotions.
      if (!attemptPromotionsConsent || !isPromotionsConsentUnsupportedError(error)) {
        throw error;
      }
      console.warn("stripe_consent_promotions_unsupported; retrying without promotions consent", {
        plan,
        orderType: normalizedOrderType,
      });
      const withoutPromotions: CheckoutSessionCreateParams = {
        ...params,
        consent_collection: buildCheckoutConsentCollection(false),
      };
      // Keep sessionParams in sync so discount fallback inherits consent without promotions.
      sessionParams.consent_collection = withoutPromotions.consent_collection;
      const promotionsFallbackKey = key ? `${key}:no-promo-consent` : undefined;
      return createStripeSession(withoutPromotions, promotionsFallbackKey);
    }
  }

  // expires_at is time-based, so the Stripe idempotency key must include it: reusing a key with a
  // different expires_at (after the KV URL cache lapses) makes Stripe reject the request.
  const stripeIdempotencyKey = idempotencyKey
    ? boundStripeIdempotencyKey(`${idempotencyKey}:exp${sessionParams.expires_at ?? ""}`)
    : undefined;
  let session: Stripe.Checkout.Session;
  let discountRejected = false;
  try {
    session = await createSessionWithConsentFallback(sessionParams, stripeIdempotencyKey);
  } catch (error) {
    const isDiscountError =
      Boolean(promotionCodeId) && shouldRetryCheckoutWithoutDiscount(error);
    if (!isDiscountError) {
      throw error;
    }
    // Manual promo codes must surface the inapplicable-code error and STOP —
    // never mint a silent full-price fallback session behind the rejection.
    if (!fallbackOnDiscountError) {
      throw new CheckoutError(
        "This code isn't valid for this item.",
        "promotion_not_applicable",
        400,
      );
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
    const fallbackParams: CheckoutSessionCreateParams = {
      ...sessionParams,
      allow_promotion_codes: allowPromotionCodes,
      discounts: undefined,
      metadata: fallbackMetadata,
      subscription_data:
        !isPrintOrder && effectivePlan === "subscription" ? { metadata: fallbackMetadata } : undefined,
    };
    discountRejected = true;
    // Stripe idempotency keys must match request params — use a distinct key for the no-discount retry.
    const fallbackIdempotencyKey = stripeIdempotencyKey ? `${stripeIdempotencyKey}:no-discount` : undefined;
    session = await createSessionWithConsentFallback(fallbackParams, fallbackIdempotencyKey);
  }

  // Once Stripe has created a session, never strand the buyer on unknown_error.
  // Prefer the strict allowlist; if the path shape drifts, recover any Stripe-owned HTTPS URL.
  let resolved = resolveStripeCheckoutHandoffUrl(session.url);
  if (!resolved.url && stripe && session.id) {
    try {
      const retrieved = await stripe.checkout.sessions.retrieve(session.id);
      resolved = resolveStripeCheckoutHandoffUrl(retrieved.url);
      if (resolved.url) {
        console.warn("checkout_url_recovered_via_retrieve", {
          sessionId: session.id,
          strictValid: resolved.strictValid,
          recovered: resolved.recovered,
          ...describeStripeCheckoutUrlShape(resolved.url),
        });
      }
    } catch (retrieveError) {
      console.warn("checkout_url_retrieve_failed", {
        sessionId: session.id,
        message: retrieveError instanceof Error ? retrieveError.message.slice(0, 160) : "unknown",
      });
    }
  }
  if (!resolved.url) {
    const rawUrl = session.url?.trim() ?? "";
    const shape = describeStripeCheckoutUrlShape(rawUrl);
    console.error("Stripe session missing recoverable checkout URL", {
      sessionId: session.id,
      urlLength: shape.urlLength,
      hashPresent: shape.hashPresent,
      hasSessionPath: shape.hasSessionPath,
      hostname: shape.hostname,
    });
    throw new Error("missing_stripe_checkout_url");
  }
  if (resolved.recovered) {
    const shape = describeStripeCheckoutUrlShape(resolved.url);
    console.warn("checkout_url_recovered_after_strict_validation", {
      sessionId: session.id,
      urlLength: shape.urlLength,
      hashPresent: shape.hashPresent,
      hasSessionPath: shape.hasSessionPath,
      hostname: shape.hostname,
    });
  }
  return { url: resolved.url, discountRejected };
}

export async function GET(req: NextRequest) {
  const correlationId = resolveCheckoutCorrelationId(req.headers.get("x-correlation-id"));
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`checkout:${ip}`, 20, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }
  const qaContext = resolveQaRequestContext(req.headers, process.env.PRINT_ADMIN_TOKEN);
  if (qaContext.status === "unauthorized") {
    return NextResponse.json(
      { error: "QA checkout requires a valid admin token.", code: "qa_auth_required" },
      { status: 401 }
    );
  }

  const planParam = req.nextUrl.searchParams.get("plan");
  const mapParam = req.nextUrl.searchParams.get("map_id");
  const orderTypeParam = req.nextUrl.searchParams.get("order_type");
  const printVariantParam = req.nextUrl.searchParams.get("print_variant");
  const includeDigitalAddOnParam = req.nextUrl.searchParams.get("include_digital_addon");
  const includeCardAddOnParam = req.nextUrl.searchParams.get("include_card_addon");
  const merchFamilyParam = req.nextUrl.searchParams.get("merch_family");
  const merchSizeParam = req.nextUrl.searchParams.get("merch_size");
  const merchColorParam = req.nextUrl.searchParams.get("merch_color");
  const shippingCountryParam = req.nextUrl.searchParams.get("shipping_country");
  const printAssetIdParam = req.nextUrl.searchParams.get("print_asset_id");
  const referralParam =
    req.nextUrl.searchParams.get("ref") ?? req.nextUrl.searchParams.get("referral_code") ?? undefined;
  const plan: CheckoutPlan =
    planParam && ["single", "pack3", "subscription"].includes(planParam)
      ? (planParam as CheckoutPlan)
      : "single";
  const orderType = parseOrderType(orderTypeParam);
  const printVariant = parsePrintVariant(printVariantParam);
  let includeDigitalAddOn = parseBoolean(includeDigitalAddOnParam, false);
  const includeCardAddOn = parseBoolean(includeCardAddOnParam, false);
  const merchFamily =
    merchFamilyParam && isMerchFamilyId(merchFamilyParam.trim())
      ? (merchFamilyParam.trim() as MerchFamilyId)
      : undefined;
  if (isAndroidAppModeRequest(req)) {
    const decision = androidAppCheckoutDecision({ orderType, hasMerch: Boolean(merchFamily), includeDigitalAddOn });
    if (!decision.allowed) {
      return NextResponse.json(ANDROID_APP_DIGITAL_BLOCKED, { status: 403 });
    }
    includeDigitalAddOn = decision.includeDigitalAddOn;
  }
  const merchSize = merchSizeParam?.trim() || undefined;
  const merchColor = merchColorParam?.trim() || undefined;
  const shippingCountry = shippingCountryParam ? shippingCountryParam.trim().toUpperCase() : undefined;
  const printAssetId =
    printAssetIdParam && PRINT_ASSET_ID_REGEX.test(printAssetIdParam.trim())
      ? printAssetIdParam.trim()
      : undefined;
  const cardPrintAssetIdParam = req.nextUrl.searchParams.get("card_print_asset_id");
  const cardPrintAssetId =
    cardPrintAssetIdParam && PRINT_ASSET_ID_REGEX.test(cardPrintAssetIdParam.trim())
      ? cardPrintAssetIdParam.trim()
      : undefined;
  const clientCountry = getRequestCountry(req);
  const mapId = parseCheckoutMapId(mapParam);
  // Manual codes: print + digital single (digital_comp only). Hosted entry stays print-only.
  const promoCodeParam = canUseManualPromotionCode(orderType, plan)
    ? (req.nextUrl.searchParams.get("promo_code") ?? undefined)
    : undefined;
  const customerEmail = normalizeCheckoutCustomerEmail(
    req.nextUrl.searchParams.get("customer_email") ?? req.nextUrl.searchParams.get("email")
  );
  const currentSessionId = req.cookies.get(PREMIUM_COOKIE_NAME)?.value?.trim();
  const fallbackReferralCode = readReferralCodeFromCookie(req);
  const referralAttribution = readReferralAttributionFromCookie(req);
  const referral = await resolveReferral(referralParam ?? fallbackReferralCode, currentSessionId);
  const referralAutoOffer = resolveReferralAutoOffer(referral.code);
  let promotion = canUseManualPromotionCode(orderType, plan)
    ? await resolvePromotionCodeId(promoCodeParam)
    : { promotionCodeId: undefined, invalid: false, lookupFailed: false };
  if (
    !promotion.invalid &&
    !promotion.lookupFailed &&
    promotion.promotionCode &&
    !isManualPromotionCompatibleWithOrder({
      orderType,
      plan,
      coupon: promotion.promotionCode.coupon,
    })
  ) {
    promotion = { invalid: true, lookupFailed: false };
  }
  if (orderType === "digital" && promoCodeParam && promotion.invalid) {
    return NextResponse.json(
      {
        error: "This code isn't valid for this item.",
        code: "promotion_not_applicable",
      },
      { status: 400 }
    );
  }
  if (orderType === "digital" && promoCodeParam && promotion.lookupFailed) {
    return NextResponse.json(
      { error: "Could not verify promotion code. Please try again.", code: "promotion_lookup_failed" },
      { status: 503 }
    );
  }
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
      { status: 503 }
    );
  }
  // Digital GET is not used by the editor (POST + handoff token). Require a browser
  // handoff query token so headless/direct hits stop minting unpaid $9 sessions.
  const getCheckoutHandoff = resolveCheckoutHandoff(req.nextUrl.searchParams.get("checkout_handoff"));
  if (orderType === "digital" && getCheckoutHandoff === "missing" && !qaContext.enabled) {
    const editorRecoveryUrl = buildCheckoutEditorRecoveryUrl({
      siteOrigin: siteOrigin(),
      mapId,
      orderType,
      plan,
      printVariant,
      shippingCountry,
      includeDigitalAddOn,
      includeCardAddOn,
      source: "checkout-handoff-recovery",
    });
    // Browser navigations (bookmarks / stripped query) return to the editor with checkout
    // reopened so a fresh handoff token can be issued. API clients still get 403 JSON.
    const accept = req.headers.get("accept") ?? "";
    if (accept.includes("text/html")) {
      return NextResponse.redirect(editorRecoveryUrl, 302);
    }
    return NextResponse.json(
      {
        error: "Checkout requires a browser session. Open checkout from the editor.",
        code: "checkout_handoff_required",
        diagnosticId: correlationId,
        editorRecoveryUrl,
      },
      { status: 403 },
    );
  }
  const recipeFingerprint = normalizeRecipeFingerprint(req.nextUrl.searchParams.get("recipe_fingerprint"));
  const resolvedPrintAssetId = await resolveCheckoutPrintAssetId({
    mapId,
    printAssetId,
    recipeFingerprint,
  });
  const normalizedCardAddOnGet =
    orderType === "print" &&
    !merchFamily &&
    includeCardAddOn &&
    parsePrintVariant(printVariant) === "poster_framed" &&
    !includeDigitalAddOn;
  const cardFingerprintGet = recipeFingerprint ? cardRecipeFingerprintSuffix(recipeFingerprint) : undefined;
  const resolvedCardPrintAssetId = normalizedCardAddOnGet
    ? await resolveCheckoutPrintAssetId({
        mapId,
        printAssetId: cardPrintAssetId,
        recipeFingerprint: cardFingerprintGet,
      })
    : undefined;
  if (orderType === "print" && !resolvedPrintAssetId) {
    return NextResponse.json(
      {
        error: "Could not prepare print file. Please reopen checkout and try again.",
        code: "missing_print_asset",
      },
      { status: 400 }
    );
  }
  if (normalizedCardAddOnGet && !resolvedCardPrintAssetId) {
    return NextResponse.json(
      {
        error: "Could not prepare greeting card artwork. Please retry checkout.",
        code: "missing_card_print_asset",
      },
      { status: 400 }
    );
  }
  if (orderType !== "print") {
    try {
      await assertDigitalCheckoutMap(mapId, plan);
    } catch (error) {
      if (error instanceof CheckoutError) {
        await bestEffortCheckoutSideEffect({
          correlationId,
          stage: "buyer_failure_diag_digital_get",
          run: () =>
            recordBuyerCheckoutFailure(qaContext, {
              reason: error.code,
              source: "checkout_api_digital_get",
              plan,
            }),
        });
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
      }
      throw error;
    }
  } else {
    try {
      await assertConfiguredSkyForCheckout(mapId);
    } catch (error) {
      if (error instanceof CheckoutError) {
        await bestEffortCheckoutSideEffect({
          correlationId,
          stage: "buyer_failure_diag_print_get_sky",
          run: () =>
            recordBuyerCheckoutFailure(qaContext, {
              reason: error.code,
              source: "checkout_api_print_get",
              plan: printVariant,
            }),
        });
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
      }
      throw error;
    }
  }

  try {
    const sessionResult = await createCheckoutSession({
      plan,
      mapId,
      printAssetId: resolvedPrintAssetId,
      cardPrintAssetId: resolvedCardPrintAssetId,
      promotionCodeId: selectedPromotion.promotionCodeId,
      resolvedPromotionCode: selectedPromotion.source === "manual" ? promotion.promotionCode : undefined,
      promotionSource: selectedPromotion.source,
      // Manual DIGITAL codes: no full-price fallback session. Print manual codes keep the historic drop-and-continue (retry without discount; the hosted page allows re-entry). Referral-auto / no-code keep retry-without-discount.
      fallbackOnDiscountError: orderType === "print" || selectedPromotion.source !== "manual",
      orderType,
      printVariant,
      includeDigitalAddOn,
      includeCardAddOn,
      shippingCountry,
      clientCountry,
      customerEmail,
      referralCode: referral.code,
      referrerSessionId: referral.referrerSessionId,
      referralAttribution,
      referralAutoOfferVariant:
        selectedPromotion.source === "referral_auto" ? referralAutoOffer.variant : undefined,
      checkoutSource: orderType === "print" ? "checkout_api_print_get" : "checkout_api_digital_get",
      checkoutHandoff: getCheckoutHandoff,
      merchFamily,
      merchOptions: merchFamily ? { size: merchSize, color: merchColor } : undefined,
      qaContext,
    });
    const resolvedGetUrl = resolveStripeCheckoutHandoffUrl(sessionResult.url);
    if (!resolvedGetUrl.url) {
      return NextResponse.json(
        buildUnknownCheckoutFailureResponse(correlationId, "missing_stripe_checkout_url"),
        { status: 500 },
      );
    }
    if (!qaContext.enabled) {
      await bestEffortCheckoutSideEffect({
        correlationId,
        stage: "funnel_checkout_session_created_get",
        run: () =>
          recordFunnelStep({
            step: "checkout_session_created",
            source: orderType === "print" ? "checkout_api_print_get" : "checkout_api_digital_get",
            plan: orderType === "print" ? printVariant : plan,
            handoff: getCheckoutHandoff,
            trustedCheckoutClassification: true,
          }),
      });
      await bestEffortCheckoutSideEffect({
        correlationId,
        stage: "funnel_checkout_redirected_get",
        run: () =>
          recordFunnelStep({
            step: "checkout_redirected",
            source: orderType === "print" ? "checkout_api_print_get" : "checkout_api_digital_get",
            plan: orderType === "print" ? printVariant : plan,
            handoff: getCheckoutHandoff,
            trustedCheckoutClassification: true,
          }),
      });
    }
    // HTML handoff still requires the strict allowlist (prevents open redirects in HTML bodies).
    if (!isValidStripeCheckoutUrl(resolvedGetUrl.url)) {
      // Recovered Stripe URL that fails the HTML allowlist: return JSON so the client can navigate.
      return NextResponse.json({
        url: resolvedGetUrl.url,
        recoveredCheckoutUrl: true,
        diagnosticId: correlationId,
      });
    }
    return new NextResponse(stripeCheckoutHtmlRedirectBody(resolvedGetUrl.url), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof CheckoutError || err instanceof MerchCheckoutError) {
      await bestEffortCheckoutSideEffect({
        correlationId,
        stage: "buyer_failure_diag_get",
        run: () =>
          recordBuyerCheckoutFailure(qaContext, {
            reason: err.code,
            source: orderType === "print" ? "checkout_api_print_get" : "checkout_api_digital_get",
            plan: orderType === "print" ? printVariant : plan,
          }),
      });
      return NextResponse.json(
        { error: err.message, code: err.code, diagnosticId: correlationId },
        { status: err.status },
      );
    }

    const normalized = normalizeNonCheckoutError(err);
    const stripeDiag = extractStripeErrorDiagnostics(err);
    await bestEffortCheckoutSideEffect({
      correlationId,
      stage: "buyer_failure_diag_get_unknown",
      run: () =>
        recordBuyerCheckoutFailure(qaContext, {
          reason: normalized.reason,
          source: orderType === "print" ? "checkout_api_print_get" : "checkout_api_digital_get",
          plan: orderType === "print" ? printVariant : plan,
        }),
    });
    logCheckoutFailure({
      correlationId,
      stage: "stripe_checkout_get",
      normalizedReason: normalized.reason,
      stripeErrorType: stripeDiag.stripeErrorType,
      stripeErrorCode: stripeDiag.stripeErrorCode,
      httpStatus: normalized.status,
      mapIdPresent: Boolean(mapId),
      checkoutKind: orderType === "print" ? `print_${printVariant}` : `digital_${plan}`,
      errorMessage: normalized.errorMessage,
    });
    // Keep response `code` stable for the UI, while analytics use deterministic `reason`.
    // Public allowlisted codes (map_required, etc.) remain CheckoutError paths above.
    return NextResponse.json(buildUnknownCheckoutFailureResponse(correlationId, normalized.reason), {
      status: normalized.status,
    });
  }
}

export async function POST(req: NextRequest) {
  // Rate limit: 20 requests per minute per IP (shared NAT / promo retries)
  const correlationId = resolveCheckoutCorrelationId(req.headers.get("x-correlation-id"));
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`checkout:${ip}`, 20, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  let plan: CheckoutPlan = "single";
  let orderType: CheckoutOrderType = "digital";
  let printVariant: PrintVariant = "poster_framed";
  let mapIdForDiag: string | undefined;
  const qaContext = resolveQaRequestContext(req.headers, process.env.PRINT_ADMIN_TOKEN);
  if (qaContext.status === "unauthorized") {
    return NextResponse.json(
      { error: "QA checkout requires a valid admin token.", code: "qa_auth_required" },
      { status: 401 }
    );
  }

  try {
    const clientCountry = getRequestCountry(req);
    let mapId: string | undefined;
    let includeDigitalAddOn = false;
    let includeCardAddOn = false;
    let isGift = false;
    let merchFamily: MerchFamilyId | undefined;
    let merchSize: string | undefined;
    let merchColor: string | undefined;
    let printAssetId: string | undefined;
    let cardPrintAssetId: string | undefined;
    let recipeFingerprint: string | undefined;
    let promoCode: string | undefined;
    let referralCode: string | undefined;
    let shippingCountry: string | undefined;
    let customerEmail: string | undefined;
    let checkoutHandoff: "browser" | "missing" = "missing";
    try {
      const body = (await req.json()) as {
        mapId?: string;
        plan?: CheckoutPlan;
        promoCode?: string;
        orderType?: CheckoutOrderType;
        printVariant?: PrintVariant;
        includeDigitalAddOn?: boolean;
        includeCardAddOn?: boolean;
        isGift?: boolean;
        merchFamily?: string;
        merchOptions?: { size?: string; color?: string };
        printAssetId?: string;
        cardPrintAssetId?: string;
        recipeFingerprint?: string;
        shippingCountry?: string;
        referralCode?: string;
        customerEmail?: string;
        email?: string;
        checkoutHandoff?: string;
      } | null;
      mapId = parseCheckoutMapId(body?.mapId);
      mapIdForDiag = mapId;
      checkoutHandoff = resolveCheckoutHandoff(body?.checkoutHandoff);
      if (body?.plan && ["single", "pack3", "subscription"].includes(body.plan)) {
        plan = body.plan;
      }
      orderType = parseOrderType(body?.orderType);
      printVariant = parsePrintVariant(body?.printVariant);
      includeDigitalAddOn = parseBoolean(body?.includeDigitalAddOn, false);
      includeCardAddOn = parseBoolean(body?.includeCardAddOn, false);
      isGift = parseBoolean(body?.isGift, false);
      if (body?.merchFamily && isMerchFamilyId(body.merchFamily.trim())) {
        merchFamily = body.merchFamily.trim() as MerchFamilyId;
      }
      if (body?.merchOptions && typeof body.merchOptions === "object") {
        if (typeof body.merchOptions.size === "string" && body.merchOptions.size.trim()) {
          merchSize = body.merchOptions.size.trim();
        }
        if (typeof body.merchOptions.color === "string" && body.merchOptions.color.trim()) {
          merchColor = body.merchOptions.color.trim();
        }
      }
      if (typeof body?.printAssetId === "string") {
        const trimmed = body.printAssetId.trim();
        if (trimmed && PRINT_ASSET_ID_REGEX.test(trimmed)) {
          printAssetId = trimmed;
        }
      }
      if (typeof body?.cardPrintAssetId === "string") {
        const trimmed = body.cardPrintAssetId.trim();
        if (trimmed && PRINT_ASSET_ID_REGEX.test(trimmed)) {
          cardPrintAssetId = trimmed;
        }
      }
      recipeFingerprint = normalizeRecipeFingerprint(body?.recipeFingerprint);
      // Print + digital single: accept editor promoCode (digital_comp validated after resolve).
      if (
        canUseManualPromotionCode(orderType, plan) &&
        body?.promoCode &&
        typeof body.promoCode === "string"
      ) {
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
      customerEmail = normalizeCheckoutCustomerEmail(body?.customerEmail ?? body?.email);
    } catch {
      // ignore missing/invalid body
    }

    // Google Play app mode: enforce the prints-only policy BEFORE any checkout-cache lookup,
    // so a cached web (digital / add-on) session can never be returned to the app.
    const androidAppMode = isAndroidAppModeRequest(req);
    if (androidAppMode) {
      const decision = androidAppCheckoutDecision({ orderType, hasMerch: Boolean(merchFamily), includeDigitalAddOn });
      if (!decision.allowed) {
        return NextResponse.json(ANDROID_APP_DIGITAL_BLOCKED, { status: 403 });
      }
      includeDigitalAddOn = decision.includeDigitalAddOn;
    }

    // Presence-only browser handoff required for digital session creation (stops direct/bot POSTs).
    // Authenticated QA (`qaContext.enabled`) remains exempt for live probes.
    if (orderType === "digital" && checkoutHandoff === "missing" && !qaContext.enabled) {
      const editorRecoveryUrl = buildCheckoutEditorRecoveryUrl({
        siteOrigin: siteOrigin(),
        mapId,
        orderType,
        plan,
        printVariant,
        shippingCountry,
        includeDigitalAddOn,
        includeCardAddOn,
        source: "checkout-handoff-recovery",
      });
      return NextResponse.json(
        {
          error: "Checkout requires a browser session. Open checkout from the editor.",
          code: "checkout_handoff_required",
          diagnosticId: correlationId,
          editorRecoveryUrl,
        },
        { status: 403 },
      );
    }

    const currentSessionId = req.cookies.get(PREMIUM_COOKIE_NAME)?.value?.trim();
    const fallbackReferralCode = readReferralCodeFromCookie(req);
    const referralAttribution = readReferralAttributionFromCookie(req);
    const referral = await resolveReferral(referralCode ?? fallbackReferralCode, currentSessionId);
    const referralAutoOffer = resolveReferralAutoOffer(referral.code);
    if (orderType === "print" && !printCheckoutEnabled) {
      return NextResponse.json(
        { error: "Print checkout is not enabled yet.", code: "print_checkout_disabled" },
        { status: 503 }
      );
    }
    const resolvedPrintAssetId = await resolveCheckoutPrintAssetId({
      mapId,
      printAssetId,
      recipeFingerprint,
    });
    const normalizedCardAddOn =
      orderType === "print" &&
      !merchFamily &&
      includeCardAddOn &&
      parsePrintVariant(printVariant) === "poster_framed" &&
      !includeDigitalAddOn;
    const cardFingerprint = recipeFingerprint ? cardRecipeFingerprintSuffix(recipeFingerprint) : undefined;
    const resolvedCardPrintAssetId = normalizedCardAddOn
      ? await resolveCheckoutPrintAssetId({
          mapId,
          printAssetId: cardPrintAssetId,
          recipeFingerprint: cardFingerprint,
        })
      : undefined;
    if (orderType === "print" && !resolvedPrintAssetId) {
      return NextResponse.json(
        {
          error: "Could not prepare print file. Please reopen checkout and try again.",
          code: "missing_print_asset",
        },
        { status: 400 }
      );
    }
    if (normalizedCardAddOn && !resolvedCardPrintAssetId) {
      return NextResponse.json(
        {
          error: "Could not prepare greeting card artwork. Please retry checkout.",
          code: "missing_card_print_asset",
        },
        { status: 400 }
      );
    }
    if (orderType !== "print") {
      await assertDigitalCheckoutMap(mapId, plan);
    } else {
      await assertConfiguredSkyForCheckout(mapId);
    }
    let promotion = canUseManualPromotionCode(orderType, plan)
      ? await resolvePromotionCodeId(promoCode)
      : { promotionCodeId: undefined, invalid: false, lookupFailed: false };
    if (
      !promotion.invalid &&
      !promotion.lookupFailed &&
      promotion.promotionCode &&
      !isManualPromotionCompatibleWithOrder({
        orderType,
        plan,
        coupon: promotion.promotionCode.coupon,
      })
    ) {
      promotion = { invalid: true, lookupFailed: false };
    }
    if (canUseManualPromotionCode(orderType, plan) && promoCode && promotion.lookupFailed) {
      return NextResponse.json(
        { error: "Could not verify promotion code. Please try again.", code: "promotion_lookup_failed" },
        { status: 503 }
      );
    }
    // Digital comps have no hosted Stripe entry — invalid codes must hard-fail with a clear error.
    if (orderType === "digital" && promoCode && promotion.invalid) {
      return NextResponse.json(
        {
          error: "This code isn't valid for this item.",
          code: "promotion_not_applicable",
        },
        { status: 400 }
      );
    }
    // Invalid/expired print codes must not block checkout — drop and let Stripe
    // hosted Checkout collect a replacement via allow_promotion_codes (print only).
    const promoInvalidDropped = Boolean(
      orderType === "print" && canUseManualPromotionCode(orderType, plan) && promoCode && promotion.invalid
    );
    const selectedPromotion = selectCheckoutPromotion({
      manualPromotionCodeId: promotion.invalid ? undefined : promotion.promotionCodeId,
      referralCode: referral.code,
      referralPromotionCodeId: referralAutoOffer.promotionCodeId,
      orderType,
      plan,
    });

    const pricingIdentity = resolveCheckoutPricingIdentity({
      plan,
      orderType,
      printVariant,
      includeDigitalAddOn,
      includeCardAddOn,
      merchFamily,
      shippingCountry: shippingCountry ?? null,
      clientCountry,
    });
    const idempotencyKey = checkoutIdempotencyKey({
      mapId,
      plan,
      orderType,
      printVariant,
      includeDigitalAddOn,
      includeCardAddOn,
      merchFamily,
      merchSize,
      merchColor,
      shippingCountry: shippingCountry ?? null,
      promoCode: promoCode ?? null,
      referralCode: referral.code ?? null,
      qaContext,
      androidAppMode,
      customerEmail: customerEmail ?? null,
      isGift,
      pricingIdentity,
    });
    if (idempotencyKey) {
      const existingUrl = await kv.get<string>(idempotencyKey);
      const cached = resolveStripeCheckoutHandoffUrl(
        typeof existingUrl === "string" ? existingUrl : null,
      );
      if (cached.url) {
        return NextResponse.json({
          url: cached.url,
          promoApplied: false,
          referralOfferApplied: false,
          referralOfferVariant: null,
          promoLookupFailed: false,
          recoveredCheckoutUrl: cached.recovered || undefined,
        });
      }
    }

    if (!qaContext.enabled) {
      await bestEffortCheckoutSideEffect({
        correlationId,
        stage: "funnel_checkout_request_received",
        run: () =>
          recordFunnelStep({
            step: "checkout_request_received",
            source: orderType === "print" ? "checkout_api_print_post" : "checkout_api_digital_post",
            plan: orderType === "print" ? printVariant : plan,
            handoff: checkoutHandoff,
            trustedCheckoutClassification: true,
          }),
      });
    }

    const session = await createCheckoutSession({
      plan,
      mapId,
      printAssetId: resolvedPrintAssetId,
      cardPrintAssetId: resolvedCardPrintAssetId,
      promotionCodeId: selectedPromotion.promotionCodeId,
      resolvedPromotionCode: selectedPromotion.source === "manual" ? promotion.promotionCode : undefined,
      promotionSource: selectedPromotion.source,
      // Manual DIGITAL codes: no full-price fallback session. Print manual codes keep the historic drop-and-continue (retry without discount; the hosted page allows re-entry). Referral-auto / no-code keep retry-without-discount.
      fallbackOnDiscountError: orderType === "print" || selectedPromotion.source !== "manual",
      orderType,
      printVariant,
      includeDigitalAddOn,
      includeCardAddOn,
      shippingCountry,
      clientCountry,
      customerEmail,
      referralCode: referral.code,
      referrerSessionId: referral.referrerSessionId,
      referralAttribution,
      referralAutoOfferVariant:
        selectedPromotion.source === "referral_auto" ? referralAutoOffer.variant : undefined,
      checkoutSource: orderType === "print" ? "checkout_api_print_post" : "checkout_api_digital_post",
      checkoutHandoff,
      idempotencyKey: idempotencyKey ?? undefined,
      isGift,
      merchFamily,
      merchOptions: merchFamily ? { size: merchSize, color: merchColor } : undefined,
      qaContext,
    });
    // Referral-auto discount rejection may still produce a no-discount session (discountRejected).
    // Manual codes never reach here — createCheckoutSession throws promotion_not_applicable instead.
    if (orderType === "digital" && promoCode && session.discountRejected && selectedPromotion.source === "manual") {
      return NextResponse.json(
        {
          error: "This code isn't valid for this item.",
          code: "promotion_not_applicable",
        },
        { status: 400 }
      );
    }
    if (session.discountRejected) {
      // Stripe rejected auto-applied referral discount. Still return checkout without the discount.
      if (idempotencyKey && typeof session.url === "string" && session.url.trim()) {
        await bestEffortCheckoutSideEffect({
          correlationId,
          stage: "idempotency_cache_set_discount_rejected",
          run: async () => {
            await kv.set(idempotencyKey, session.url!.trim(), { ex: CHECKOUT_IDEMPOTENCY_TTL_SECONDS });
          },
        });
      }
      if (!qaContext.enabled) {
        await bestEffortCheckoutSideEffect({
          correlationId,
          stage: "funnel_checkout_session_created_discount_rejected",
          run: () =>
            recordFunnelStep({
              step: "checkout_session_created",
              source: orderType === "print" ? "checkout_api_print_post" : "checkout_api_digital_post",
              plan: orderType === "print" ? printVariant : plan,
              handoff: checkoutHandoff,
              trustedCheckoutClassification: true,
            }),
        });
      }
      const rejectedResolved = resolveStripeCheckoutHandoffUrl(session.url);
      if (!rejectedResolved.url) {
        return NextResponse.json(
          {
            error: "Checkout could not start securely. Please try again.",
            code: "invalid_checkout_url",
            diagnosticId: correlationId,
          },
          { status: 500 },
        );
      }
      return NextResponse.json({
        url: rejectedResolved.url,
        promoApplied: false,
        discountRejected: true,
        promoInvalidDropped: promoInvalidDropped || undefined,
        referralOfferApplied: false,
        referralOfferVariant: null,
        promoLookupFailed: promotion.lookupFailed,
        recoveredCheckoutUrl: rejectedResolved.recovered || undefined,
      });
    }
    if (idempotencyKey && typeof session.url === "string" && session.url.trim()) {
      await bestEffortCheckoutSideEffect({
        correlationId,
        stage: "idempotency_cache_set",
        run: async () => {
          await kv.set(idempotencyKey, session.url!.trim(), { ex: CHECKOUT_IDEMPOTENCY_TTL_SECONDS });
        },
      });
    }
    if (!qaContext.enabled) {
      await bestEffortCheckoutSideEffect({
        correlationId,
        stage: "funnel_checkout_session_created",
        run: () =>
          recordFunnelStep({
            step: "checkout_session_created",
            source: orderType === "print" ? "checkout_api_print_post" : "checkout_api_digital_post",
            plan: orderType === "print" ? printVariant : plan,
            handoff: checkoutHandoff,
            trustedCheckoutClassification: true,
          }),
      });

      await bestEffortCheckoutSideEffect({
        correlationId,
        stage: "funnel_checkout_redirected",
        run: () =>
          recordFunnelStep({
            step: "checkout_redirected",
            source: orderType === "print" ? "checkout_api_print_post" : "checkout_api_digital_post",
            plan: orderType === "print" ? printVariant : plan,
            handoff: checkoutHandoff,
            trustedCheckoutClassification: true,
          }),
      });
    }

    const checkoutResolved = resolveStripeCheckoutHandoffUrl(session.url);
    if (!checkoutResolved.url) {
      await bestEffortCheckoutSideEffect({
        correlationId,
        stage: "buyer_failure_diag_invalid_url",
        run: () =>
          recordBuyerCheckoutFailure(qaContext, {
            reason: "invalid_checkout_url",
            source: orderType === "print" ? "checkout_api_print_post" : "checkout_api_digital_post",
            plan: orderType === "print" ? printVariant : plan,
          }),
      });
      return NextResponse.json(
        {
          error: "Checkout could not start securely. Please try again.",
          code: "invalid_checkout_url",
          diagnosticId: correlationId,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      url: checkoutResolved.url,
      promoApplied: selectedPromotion.source === "manual" && !session.discountRejected,
      referralOfferApplied: selectedPromotion.source === "referral_auto" && !session.discountRejected,
      referralOfferVariant:
        selectedPromotion.source === "referral_auto" && !session.discountRejected
          ? (referralAutoOffer.variant ?? null)
          : null,
      promoInvalidDropped: promoInvalidDropped || undefined,
      promoLookupFailed: promoCode ? promotion.lookupFailed : false,
      recoveredCheckoutUrl: checkoutResolved.recovered || undefined,
    });
  } catch (err) {
    if (err instanceof CheckoutError || err instanceof MerchCheckoutError) {
      await bestEffortCheckoutSideEffect({
        correlationId,
        stage: "buyer_failure_diag_post",
        run: () =>
          recordBuyerCheckoutFailure(qaContext, {
            reason: err.code,
            source: orderType === "print" ? "checkout_api_print_post" : "checkout_api_digital_post",
            plan: orderType === "print" ? printVariant : plan,
          }),
      });
      return NextResponse.json(
        { error: err.message, code: err.code, diagnosticId: correlationId },
        { status: err.status },
      );
    }

    const normalized = normalizeNonCheckoutError(err);
    const stripeDiag = extractStripeErrorDiagnostics(err);
    await bestEffortCheckoutSideEffect({
      correlationId,
      stage: "buyer_failure_diag_post_unknown",
      run: () =>
        recordBuyerCheckoutFailure(qaContext, {
          reason: normalized.reason,
          source: orderType === "print" ? "checkout_api_print_post" : "checkout_api_digital_post",
          plan: orderType === "print" ? printVariant : plan,
        }),
    });
    logCheckoutFailure({
      correlationId,
      stage: "stripe_checkout_post",
      normalizedReason: normalized.reason,
      stripeErrorType: stripeDiag.stripeErrorType,
      stripeErrorCode: stripeDiag.stripeErrorCode,
      httpStatus: normalized.status,
      mapIdPresent: Boolean(mapIdForDiag),
      checkoutKind: orderType === "print" ? `print_${printVariant}` : `digital_${plan}`,
      errorMessage: normalized.errorMessage,
    });
    return NextResponse.json(buildUnknownCheckoutFailureResponse(correlationId, normalized.reason), {
      status: normalized.status,
    });
  }
}
