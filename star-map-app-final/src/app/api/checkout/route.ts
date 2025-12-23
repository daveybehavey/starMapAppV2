import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripeSecret = process.env.STRIPE_SECRET_KEY;

function siteOrigin() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

export async function POST(req: NextRequest) {
  console.log("STRIPE KEY EXISTS:", !!process.env.STRIPE_SECRET_KEY, "SITE:", process.env.NEXT_PUBLIC_SITE_URL);
  if (!stripeSecret) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }
  const stripe = new Stripe(stripeSecret, { apiVersion: "2023-10-16" });
  try {
    const successUrl = `${siteOrigin()}/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${siteOrigin()}`;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: 999,
            product_data: {
              name: "HD Star Map Download",
              description: "Print-ready 6000px star map without watermark.",
            },
          },
          quantity: 1,
        },
      ],
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
