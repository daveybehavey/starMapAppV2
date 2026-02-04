import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { PREMIUM_COOKIE_NAME } from "@/lib/premium";
import type { CheckoutPlan } from "@/lib/pricing";

export const runtime = "nodejs";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe =
  stripeSecret &&
  new Stripe(stripeSecret, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
    timeout: 20_000,
  });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com";

type SessionRecord = {
  paid?: boolean;
  revoked?: boolean;
  plan?: CheckoutPlan;
  subscriptionActive?: boolean;
  customerId?: string | null;
};

const sessionKey = (id: string) => `stripe:session:${id}`;

function siteOrigin() {
  return siteUrl.replace(/\/+$/, "");
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`stripe:portal:${ip}`, 20, 60);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetIn);

  if (!stripe) {
    return NextResponse.json({ ok: false, error: "Stripe not configured" }, { status: 500 });
  }

  const sessionId = req.cookies.get(PREMIUM_COOKIE_NAME)?.value?.trim();
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "Missing entitlement" }, { status: 401 });
  }

  const record = await kv.get<SessionRecord>(sessionKey(sessionId));
  if (!record || record.revoked) {
    return NextResponse.json({ ok: false, error: "No active entitlement" }, { status: 403 });
  }

  if (record.plan !== "subscription") {
    return NextResponse.json({ ok: false, error: "Billing portal is for subscriptions only" }, { status: 400 });
  }

  if (!record.subscriptionActive && !record.paid) {
    return NextResponse.json({ ok: false, error: "Subscription inactive" }, { status: 402 });
  }

  let customerId = typeof record.customerId === "string" && record.customerId.trim()
    ? record.customerId.trim()
    : null;

  if (!customerId) {
    try {
      const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
      customerId = typeof checkoutSession.customer === "string" ? checkoutSession.customer : null;
      if (customerId) {
        await kv.set(sessionKey(sessionId), {
          ...record,
          customerId,
        });
      }
    } catch (err) {
      console.error("Stripe portal customer lookup failed", err);
    }
  }

  if (!customerId) {
    return NextResponse.json({ ok: false, error: "Missing customer record" }, { status: 404 });
  }

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteOrigin()}/download`,
    });
    return NextResponse.json({ ok: true, url: portalSession.url });
  } catch (err) {
    console.error("Stripe portal session error", err);
    return NextResponse.json({ ok: false, error: "Unable to create portal session" }, { status: 500 });
  }
}
