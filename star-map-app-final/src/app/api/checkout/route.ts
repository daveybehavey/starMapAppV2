import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getPricingTiers, type CheckoutPlan } from "@/lib/pricing";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";

export const runtime = "nodejs";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com";
const stripePriceIds = {
  single: process.env.STRIPE_PRICE_ID_SINGLE,
  pack3: process.env.STRIPE_PRICE_ID_PACK3,
  subscription: process.env.STRIPE_PRICE_ID_SUBSCRIPTION,
} as const;
const configuredPromoCode = process.env.PROMOTION_COUPON_CODE?.trim().toUpperCase() ?? "";
const configuredStripePromotionCodeId = process.env.STRIPE_PROMO_CODE_ID?.trim() ?? "";

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

type CheckoutSessionResult = {
  url: string | null;
  discountRejected: boolean;
};

async function createCheckoutSession(
  plan: CheckoutPlan,
  mapId?: string,
  promotionCodeId?: string,
): Promise<CheckoutSessionResult> {
  if (!stripe) {
    throw new Error("Stripe not configured");
  }

  const mapQuery = mapId ? `&map_id=${encodeURIComponent(mapId)}` : "";
  const successUrl = `${siteOrigin()}/success?session_id={CHECKOUT_SESSION_ID}${mapQuery}`;
  const cancelUrl = `${siteOrigin()}`;
  const tiers = getPricingTiers();
  const tier = tiers[plan];

  const metadata: Record<string, string> = { plan };
  if (mapId) metadata.map_id = mapId;
  if (tier.credits) metadata.credits = String(tier.credits);
  if (promotionCodeId) metadata.promotion_code_id = promotionCodeId;

  const priceId = stripePriceIds[plan]?.trim();
  const usePriceId = Boolean(priceId);

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: plan === "subscription" ? "subscription" : "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: mapId,
    line_items: [
      {
        ...(usePriceId
          ? { price: priceId }
          : {
              price_data:
                plan === "subscription"
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
                        name: plan === "pack3" ? "HD Star Map Download Pack (3)" : "HD Star Map Download",
                        description:
                          plan === "pack3"
                            ? "3 print-ready HD star maps • No watermark • Instant download"
                            : "Print-ready 6000×6000px star map • No watermark • Instant download • Perfect for framing",
                        images: [`${siteUrl}/custom-star-map-anniversary.webp`],
                      },
                    },
            }),
        quantity: 1,
      },
    ],
    metadata,
    subscription_data: plan === "subscription" ? { metadata } : undefined,
    ...(plan !== "subscription" && !promotionCodeId ? { allow_promotion_codes: true } : {}),
    discounts: promotionCodeId ? [{ promotion_code: promotionCodeId }] : undefined,
    billing_address_collection: "auto",
    customer_email: undefined,
    phone_number_collection: {
      enabled: false,
    },
    consent_collection: {
      terms_of_service: "required",
    },
    custom_text: {
      submit: {
        message:
          plan === "subscription"
            ? "Secure payment • Cancel anytime • Instant access"
            : "Secure payment • Instant access • No subscription",
      },
      terms_of_service_acceptance: {
        message: `I agree to the [Terms of Service](${siteUrl}/returns) and [Privacy Policy](${siteUrl}/privacy)`,
      },
    },
    payment_method_types: ["card"],
    shipping_address_collection: undefined,
  };

  let session: Stripe.Checkout.Session;
  let discountRejected = false;
  try {
    session = await stripe.checkout.sessions.create(sessionParams);
  } catch (error) {
    if (!promotionCodeId || !shouldRetryCheckoutWithoutDiscount(error)) {
      throw error;
    }
    console.warn("Checkout promo code rejected by Stripe; retrying without auto-applied discount.", {
      promotionCodeId,
      plan,
    });
    const fallbackParams: Stripe.Checkout.SessionCreateParams = {
      ...sessionParams,
      allow_promotion_codes: plan !== "subscription",
      discounts: undefined,
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
  const plan: CheckoutPlan =
    planParam && ["single", "pack3", "subscription"].includes(planParam)
      ? (planParam as CheckoutPlan)
      : "single";
  const mapId = mapParam ? mapParam.slice(0, 120) : undefined;
  const promoCodeParam = req.nextUrl.searchParams.get("promo_code") ?? undefined;
  const promotion = plan === "subscription"
    ? { promotionCodeId: undefined, invalid: false, lookupFailed: false }
    : await resolvePromotionCodeId(promoCodeParam);
  const promotionCodeId = promotion.invalid ? undefined : promotion.promotionCodeId;

  try {
    const { url: sessionUrl } = await createCheckoutSession(plan, mapId, promotionCodeId);
    if (!sessionUrl) {
      return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
    }
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
    let promoCode: string | undefined;
    try {
      const body = (await req.json()) as { mapId?: string; plan?: CheckoutPlan; promoCode?: string } | null;
      if (body?.mapId && typeof body.mapId === "string") {
        const trimmed = body.mapId.trim();
        if (trimmed) {
          mapId = trimmed.slice(0, 120);
        }
      }
      if (body?.plan && ["single", "pack3", "subscription"].includes(body.plan)) {
        plan = body.plan;
      }
      if (body?.promoCode && typeof body.promoCode === "string") {
        const trimmed = body.promoCode.trim();
        if (trimmed) {
          promoCode = trimmed.slice(0, 64);
        }
      }
    } catch {
      // ignore missing/invalid body
    }

    const promotion = plan === "subscription"
      ? { promotionCodeId: undefined, invalid: false, lookupFailed: false }
      : await resolvePromotionCodeId(promoCode);
    if (promoCode && promotion.invalid) {
      return NextResponse.json(
        { error: "Invalid or expired promotion code.", code: "invalid_promotion_code" },
        { status: 400 },
      );
    }

    const session = await createCheckoutSession(plan, mapId, promotion.promotionCodeId);
    if (promoCode && session.discountRejected) {
      return NextResponse.json(
        { error: "Invalid or expired promotion code.", code: "invalid_promotion_code" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      url: session.url,
      promoApplied: Boolean(promotion.promotionCodeId) && !session.discountRejected,
      promoLookupFailed: promoCode ? promotion.lookupFailed : false,
    });
  } catch (err) {
    console.error("Stripe checkout error", err);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
