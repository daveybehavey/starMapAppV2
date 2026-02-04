import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { PREMIUM_COOKIE_NAME, PREMIUM_COOKIE_TTL_SECONDS } from "@/lib/premium";
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

type SessionRecord = {
  paid?: boolean;
  mapId?: string;
  revoked?: boolean;
  paymentIntentId?: string | null;
  plan?: CheckoutPlan;
  creditsRemaining?: number;
  creditsTotal?: number;
  subscriptionId?: string | null;
  subscriptionActive?: boolean;
  customerId?: string | null;
};

const sessionKey = (id: string) => `stripe:session:${id}`;
const paymentIntentKey = (id: string) => `stripe:pi:${id}`;
const revokedPaymentIntentKey = (id: string) => `stripe:pi:revoked:${id}`;
const subscriptionKey = (id: string) => `stripe:sub:${id}`;

function getMapId(session: Stripe.Checkout.Session) {
  return (
    (typeof session.metadata?.map_id === "string" && session.metadata.map_id.trim()) ||
    (typeof session.client_reference_id === "string" && session.client_reference_id.trim()) ||
    undefined
  );
}

function getPlan(session: Stripe.Checkout.Session): CheckoutPlan {
  const plan = typeof session.metadata?.plan === "string" ? session.metadata.plan : null;
  if (plan === "pack3" || plan === "subscription" || plan === "single") {
    return plan;
  }
  return session.mode === "subscription" ? "subscription" : "single";
}

function getCredits(session: Stripe.Checkout.Session, plan: CheckoutPlan): number {
  if (plan === "subscription") return 0;
  const raw = typeof session.metadata?.credits === "string" ? Number.parseInt(session.metadata.credits, 10) : NaN;
  if (Number.isFinite(raw) && raw > 0) return raw;
  return plan === "pack3" ? 3 : 1;
}

export async function GET(req: NextRequest) {
  // Rate limit: 10 requests per minute per IP (prevents brute force session ID guessing)
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`stripe:verify:${ip}`, 10, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id")?.trim();
  if (!sessionId) {
    return NextResponse.json(
      { paid: false, error: "Missing session_id" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const record = await kv.get<SessionRecord>(sessionKey(sessionId));
  if (record?.revoked) {
    return NextResponse.json(
      { paid: false, revoked: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (record?.paid && !record.revoked) {
    const mapId = typeof record.mapId === "string" ? record.mapId : undefined;
    const response = NextResponse.json(
      {
        paid: true,
        mapId,
        plan: record.plan ?? null,
        creditsRemaining: record.creditsRemaining ?? null,
        subscriptionActive: record.subscriptionActive ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(PREMIUM_COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: PREMIUM_COOKIE_TTL_SECONDS,
    });
    return response;
  }

  if (!stripe) {
    return NextResponse.json({ paid: false }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paidViaStripe =
      (session.mode === "payment" || session.mode === "subscription") &&
      (session.payment_status === "paid" || session.payment_status === "no_payment_required");
    if (!paidViaStripe) {
      return NextResponse.json({ paid: false }, { headers: { "Cache-Control": "no-store" } });
    }

    const plan = getPlan(session);
    let credits = getCredits(session, plan);
    const existingSessionId = req.cookies.get(PREMIUM_COOKIE_NAME)?.value;
    if (existingSessionId && existingSessionId !== sessionId && plan !== "subscription") {
      const existing = await kv.get<SessionRecord>(sessionKey(existingSessionId));
      if (existing && !existing.revoked && existing.plan !== "subscription") {
        const existingCredits = existing.creditsRemaining ?? 0;
        if (existingCredits > 0) {
          credits += existingCredits;
        }
      }
    }
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
    const customerId = typeof session.customer === "string" ? session.customer : null;
    if (paymentIntentId) {
      const revokedRecord = await kv.get<{ revoked?: boolean }>(revokedPaymentIntentKey(paymentIntentId));
      if (revokedRecord?.revoked) {
        return NextResponse.json(
          { paid: false, revoked: true },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
    }
    const mapId = getMapId(session);
    await kv.set(sessionKey(sessionId), {
      paid: true,
      mapId,
      revoked: false,
      paymentIntentId,
      plan,
      creditsRemaining: credits || undefined,
      creditsTotal: credits || undefined,
      subscriptionId: subscriptionId ?? undefined,
      subscriptionActive: plan === "subscription" ? true : undefined,
      customerId: customerId ?? undefined,
    });
    if (paymentIntentId) {
      await kv.set(paymentIntentKey(paymentIntentId), sessionId);
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        const latestCharge = paymentIntent && typeof paymentIntent.latest_charge === "string"
          ? paymentIntent.latest_charge
          : null;
        if (latestCharge) {
          await kv.set(`stripe:charge:${latestCharge}`, sessionId);
        }
      } catch (err) {
        console.warn("Stripe payment intent lookup failed", err);
      }
    }
    if (subscriptionId) {
      await kv.set(subscriptionKey(subscriptionId), sessionId);
    }

    const response = NextResponse.json(
      {
        paid: true,
        mapId,
        plan,
        creditsRemaining: credits || null,
        subscriptionActive: plan === "subscription",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(PREMIUM_COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: PREMIUM_COOKIE_TTL_SECONDS,
    });
    return response;
  } catch (err) {
    console.error("Stripe session verification failed", err);
    return NextResponse.json({ paid: false }, { headers: { "Cache-Control": "no-store" } });
  }
}
