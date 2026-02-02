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

export async function POST(req: NextRequest) {
  // Rate limit: 5 requests per minute per IP (prevents checkout session spam)
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`checkout:${ip}`, 5, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }
  try {
    let mapId: string | undefined;
    let plan: CheckoutPlan = "single";
    try {
      const body = (await req.json()) as { mapId?: string; plan?: CheckoutPlan } | null;
      if (body?.mapId && typeof body.mapId === "string") {
        const trimmed = body.mapId.trim();
        if (trimmed) {
          mapId = trimmed.slice(0, 120);
        }
      }
      if (body?.plan && ["single", "pack3", "subscription"].includes(body.plan)) {
        plan = body.plan;
      }
    } catch {
      // ignore missing/invalid body
    }

    const mapQuery = mapId ? `&map_id=${encodeURIComponent(mapId)}` : "";
    const successUrl = `${siteOrigin()}/success?session_id={CHECKOUT_SESSION_ID}${mapQuery}`;
    const cancelUrl = `${siteOrigin()}`;
    const tiers = getPricingTiers();
    const tier = tiers[plan];

    const metadata: Record<string, string> = { plan };
    if (mapId) metadata.map_id = mapId;
    if (tier.credits) metadata.credits = String(tier.credits);

    const priceId = stripePriceIds[plan]?.trim();
    const usePriceId = Boolean(priceId);

    const session = await stripe.checkout.sessions.create({
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
      allow_promotion_codes: plan !== "subscription",
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
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error", err);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
