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
import { parseReferralCookieValue, REFERRAL_COOKIE_NAME } from "@/lib/referralCookie";
import { PRINT_ASSET_ID_REGEX } from "@/lib/printAssets";
import { selectCheckoutPromotion, type PromotionSource } from "@/lib/checkoutPromotions";
import { PREMIUM_COOKIE_NAME } from "@/lib/premium";
import { recordFunnelStep } from "@/lib/funnel";

export const runtime = "nodejs";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com";
const stripePriceIds = {
  single: process.env.STRIPE_PRICE_ID_SINGLE,
  pack3: process.env.STRIPE_PRICE_ID_PACK3,
  subscription: process.env.STRIPE_PRICE_ID_SUBSCRIPTION,
} as const;
const stripePrintPriceIds = {
  poster_unframed: process.env.STRIPE_PRICE_ID_PRINT_UNFRAMED,
  poster_framed: process.env.STRIPE_PRICE_ID_PRINT_FRAMED,
  digital_addon: process.env.STRIPE_PRICE_ID_PRINT_DIGITAL_ADDON,
} as const;
const configuredPromoCode = process.env.PROMOTION_COUPON_CODE?.trim().toUpperCase() ?? "";
const configuredStripePromotionCodeId = process.env.STRIPE_PROMO_CODE_ID?.trim() ?? "";
const configuredReferralPromotionCodeId = process.env.STRIPE_REFERRAL_PROMO_CODE_ID?.trim() ?? "";
const printAllowedCountries = parseAllowedShippingCountries(process.env.PRINT_ALLOWED_COUNTRIES);
const printCheckoutEnabled = /^(1|true|yes)$/i.test((process.env.PRINT_CHECKOUT_ENABLED || "").trim());

// Use fetch-based HTTP client to work in Cloudflare Workers.
const stripe =
  stripeSecret &&
  new Stripe(stripeSecret, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
    timeout: 20_000,
  });

function siteOrigin() {
  return siteUrl.replace(/\/+$/, "");
}

function parseAllowedShippingCountries(raw: string | undefined) {
  const fallback: Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] = ["US", "CA"];
  if (!raw) return fallback;
  const parsed = raw
    .split(",")
    .map((token) => token.trim().toUpperCase())
    .filter((token) => /^[A-Z]{2}$/.test(token));
  if (!parsed.length) return fallback;
  return parsed as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[];
}

function parseOrderType(raw: unknown): CheckoutOrderType {
  return raw === "print" ? "print" : "digital";
}

function parsePrintVariant(raw: unknown): PrintVariant {
  return raw === "poster_framed" ? "poster_framed" : "poster_unframed";
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
  invalid: boolean;
  lookupFailed: boolean;
};

type ReferralResolution = {
  code?: string;
  referrerSessionId?: string;
};

async function resolvePromotionCodeId(promoCode?: string): Promise<PromotionResolution> {
  const trimmed = promoCode?.trim();
  if (!trimmed) return { invalid: false, lookupFailed: false };

  if (configuredPromoCode && configuredStripePromotionCodeId && trimmed.toUpperCase() === configuredPromoCode) {
    return { promotionCodeId: configuredStripePromotionCodeId, invalid: false, lookupFailed: false };
  }

  if (!stripe) {
    return { invalid: false, lookupFailed: true };
  }

  try {
    const list = await stripe.promotionCodes.list({
      code: trimmed,
      active: true,
      limit: 10,
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

    return { promotionCodeId: matched.id, invalid: false, lookupFailed: false };
  } catch (error) {
    console.error("Promotion code lookup failed", error);
    return { invalid: false, lookupFailed: true };
  }
}

function readReferralCodeFromCookie(req: NextRequest) {
  const parsed = parseReferralCookieValue(req.cookies.get(REFERRAL_COOKIE_NAME)?.value ?? null);
  return parsed?.code;
}

async function resolveReferral(raw?: string, currentSessionId?: string): Promise<ReferralResolution> {
  const code = normalizeReferralCode(raw);
  if (!code) return {};
  const record = await kv.get<ReferralRecord>(referralKey(code));
  if (!record?.sessionId) return {};
  if (currentSessionId && record.sessionId === currentSessionId) return {};
  return { code, referrerSessionId: record.sessionId };
}

type CheckoutSessionResult = {
  url: string | null;
  discountRejected: boolean;
};

async function createCheckoutSession(
  input: {
    plan: CheckoutPlan;
    mapId?: string;
    printAssetId?: string;
    promotionCodeId?: string;
    fallbackOnDiscountError?: boolean;
    orderType?: CheckoutOrderType;
    printVariant?: PrintVariant;
    includeDigitalAddOn?: boolean;
    referralCode?: string;
    referrerSessionId?: string;
    promotionSource?: PromotionSource;
  },
): Promise<CheckoutSessionResult> {
  const {
    plan,
    mapId,
    printAssetId,
    promotionCodeId,
    fallbackOnDiscountError = true,
    orderType = "digital",
    printVariant = "poster_unframed",
    includeDigitalAddOn = false,
    referralCode,
    referrerSessionId,
    promotionSource = "none",
  } = input;
  if (!stripe) {
    throw new Error("Stripe not configured");
  }

  const normalizedOrderType = parseOrderType(orderType);
  const isPrintOrder = normalizedOrderType === "print";
  const normalizedPrintVariant = parsePrintVariant(printVariant);
  const effectivePlan = isPrintOrder ? "single" : plan;
  const allowPromotionCodes = isPrintOrder || effectivePlan !== "subscription";
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
  if (referralCode) metadata.referral_code = referralCode;
  if (referrerSessionId) metadata.referrer_session_id = referrerSessionId;

  const digitalPriceId = stripePriceIds[effectivePlan]?.trim();
  const useDigitalPriceId = Boolean(digitalPriceId);

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  if (isPrintOrder) {
    const printPriceId = stripePrintPriceIds[normalizedPrintVariant]?.trim();
    lineItems.push({
      ...(printPriceId
        ? { price: printPriceId }
        : {
            price_data: {
              currency: printTier.currency,
              unit_amount: printTier.amountCents,
              product_data: {
                name: printTier.includesFrame ? "Custom Framed Star Map Print" : "Custom Star Map Poster Print",
                description: printTier.includesFrame
                  ? "Printed and framed star map • Shipping address required"
                  : "Museum-grade poster print • Shipping address required",
                images: [`${siteUrl}/custom-star-map-anniversary.webp`],
              },
            },
          }),
      quantity: 1,
    });
    if (includeDigitalAddOn) {
      const digitalAddOnPriceId = stripePrintPriceIds.digital_addon?.trim();
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
    }
  } else {
    lineItems.push({
      ...(useDigitalPriceId
        ? { price: digitalPriceId }
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
                      name: effectivePlan === "pack3" ? "HD Star Map Download Pack (3)" : "HD Star Map Download",
                      description:
                        effectivePlan === "pack3"
                          ? "3 print-ready HD star maps • No watermark • Instant download"
                          : "Print-ready 6000×6000px star map • No watermark • Instant download • Perfect for framing",
                      images: [`${siteUrl}/custom-star-map-anniversary.webp`],
                    },
                  },
          }),
      quantity: 1,
    });
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: !isPrintOrder && effectivePlan === "subscription" ? "subscription" : "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
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
            ? "Secure payment • Printed and shipped after checkout"
            : effectivePlan === "subscription"
              ? "Secure payment • Cancel anytime • Instant access"
              : "Secure payment • Instant access • No subscription",
      },
      terms_of_service_acceptance: {
        message: `I agree to the [Terms of Service](${siteUrl}/returns) and [Privacy Policy](${siteUrl}/privacy)`,
      },
    },
    payment_method_types: ["card"],
    shipping_address_collection: isPrintOrder ? { allowed_countries: printAllowedCountries } : undefined,
  };

  let session: Stripe.Checkout.Session;
  let discountRejected = false;
  try {
    session = await stripe.checkout.sessions.create(sessionParams);
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
    session = await stripe.checkout.sessions.create(fallbackParams);
  }

  return { url: session.url ?? null, discountRejected };
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
  const printAssetId =
    printAssetIdParam && PRINT_ASSET_ID_REGEX.test(printAssetIdParam.trim()) ? printAssetIdParam.trim() : undefined;
  const mapId = mapParam ? mapParam.slice(0, 120) : undefined;
  const promoCodeParam = req.nextUrl.searchParams.get("promo_code") ?? undefined;
  const currentSessionId = req.cookies.get(PREMIUM_COOKIE_NAME)?.value?.trim();
  const fallbackReferralCode = readReferralCodeFromCookie(req);
  const referral = await resolveReferral(referralParam ?? fallbackReferralCode, currentSessionId);
  const promotion = orderType === "digital" && plan === "subscription"
    ? { promotionCodeId: undefined, invalid: false, lookupFailed: false }
    : await resolvePromotionCodeId(promoCodeParam);
  const selectedPromotion = selectCheckoutPromotion({
    manualPromotionCodeId: promotion.invalid ? undefined : promotion.promotionCodeId,
    referralCode: referral.code,
    referralPromotionCodeId: configuredReferralPromotionCodeId,
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

  try {
    await recordFunnelStep({
      step: "checkout_started",
      source: orderType === "print" ? "checkout_api_print_get" : "checkout_api_digital_get",
      plan: orderType === "print" ? printVariant : plan,
    });
    const { url: sessionUrl } = await createCheckoutSession({
      plan,
      mapId,
      printAssetId,
      promotionCodeId: selectedPromotion.promotionCodeId,
      promotionSource: selectedPromotion.source,
      orderType,
      printVariant,
      includeDigitalAddOn,
      referralCode: referral.code,
      referrerSessionId: referral.referrerSessionId,
    });
    if (!sessionUrl) {
      return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
    }
    await recordFunnelStep({
      step: "checkout_redirected",
      source: orderType === "print" ? "checkout_api_print_get" : "checkout_api_digital_get",
      plan: orderType === "print" ? printVariant : plan,
    });
    return NextResponse.redirect(sessionUrl, { status: 303 });
  } catch (err) {
    console.error("Stripe checkout error", err);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // Rate limit: 5 requests per minute per IP (prevents checkout session spam)
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`checkout:${ip}`, 5, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  try {
    let mapId: string | undefined;
    let plan: CheckoutPlan = "single";
    let orderType: CheckoutOrderType = "digital";
    let printVariant: PrintVariant = "poster_unframed";
    let includeDigitalAddOn = false;
    let printAssetId: string | undefined;
    let promoCode: string | undefined;
    let referralCode: string | undefined;
    try {
      const body = (await req.json()) as {
        mapId?: string;
        plan?: CheckoutPlan;
        promoCode?: string;
        orderType?: CheckoutOrderType;
        printVariant?: PrintVariant;
        includeDigitalAddOn?: boolean;
        printAssetId?: string;
        referralCode?: string;
      } | null;
      if (body?.mapId && typeof body.mapId === "string") {
        const trimmed = body.mapId.trim();
        if (trimmed) {
          mapId = trimmed.slice(0, 120);
        }
      }
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
    const referral = await resolveReferral(referralCode ?? fallbackReferralCode, currentSessionId);
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
    const promotion = orderType === "digital" && plan === "subscription"
      ? { promotionCodeId: undefined, invalid: false, lookupFailed: false }
      : await resolvePromotionCodeId(promoCode);
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
      referralPromotionCodeId: configuredReferralPromotionCodeId,
      orderType,
      plan,
    });

    await recordFunnelStep({
      step: "checkout_started",
      source: orderType === "print" ? "checkout_api_print_post" : "checkout_api_digital_post",
      plan: orderType === "print" ? printVariant : plan,
    });

    const session = await createCheckoutSession({
      plan,
      mapId,
      printAssetId,
      promotionCodeId: selectedPromotion.promotionCodeId,
      promotionSource: selectedPromotion.source,
      fallbackOnDiscountError: !promoCode,
      orderType,
      printVariant,
      includeDigitalAddOn,
      referralCode: referral.code,
      referrerSessionId: referral.referrerSessionId,
    });
    if (promoCode && session.discountRejected) {
      return NextResponse.json(
        { error: "Invalid or expired promotion code.", code: "invalid_promotion_code" },
        { status: 400 },
      );
    }

    await recordFunnelStep({
      step: "checkout_redirected",
      source: orderType === "print" ? "checkout_api_print_post" : "checkout_api_digital_post",
      plan: orderType === "print" ? printVariant : plan,
    });

    return NextResponse.json({
      url: session.url,
      promoApplied: selectedPromotion.source === "manual" && !session.discountRejected,
      referralOfferApplied: selectedPromotion.source === "referral_auto" && !session.discountRejected,
      promoLookupFailed: promoCode ? promotion.lookupFailed : false,
    });
  } catch (err) {
    console.error("Stripe checkout error", err);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
