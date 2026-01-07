import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getPricingInfo } from "@/lib/pricing";

export const runtime = "nodejs";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com";

// Use fetch-based HTTP client to work in Cloudflare Workers.
const stripe =
  stripeSecret &&
  new Stripe(stripeSecret, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
    timeout: 20_000,
  });

function siteOrigin() {
  return siteUrl.replace(/\/+$/, "") || "https://starmapco.com";
}

export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }
  try {
    const successUrl = `${siteOrigin()}/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${siteOrigin()}`;
    const pricing = getPricingInfo({ includePromoCode: true });

    const useDiscount = pricing.promoActive && !!pricing.promotionCodeId;
    const lineItemAmount = useDiscount ? pricing.baseAmountCents : pricing.activeAmountCents;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [
        {
          price_data: {
            currency: pricing.currency,
            unit_amount: lineItemAmount,
            product_data: {
              name: "HD Star Map Download",
              description: "Print-ready 6000×6000px star map • No watermark • Instant download • Perfect for framing",
              images: ["https://starmapco.com/custom-star-map-anniversary.webp"],
            },
          },
          quantity: 1,
        },
      ],
      discounts: useDiscount && pricing.promotionCodeId ? [{ promotion_code: pricing.promotionCodeId }] : undefined,
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
          message: "Secure payment • Instant access • No subscription",
        },
        terms_of_service_acceptance: {
          message: "I agree to the [Terms of Service](https://starmapco.com/returns) and [Privacy Policy](https://starmapco.com/privacy)",
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
