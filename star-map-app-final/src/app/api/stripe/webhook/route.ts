import { NextResponse } from "next/server";
import Stripe from "stripe";
import { kv } from "@/lib/kv";
import type { CheckoutPlan } from "@/lib/pricing";

export const runtime = "nodejs";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const stripe =
  stripeSecret &&
  new Stripe(stripeSecret, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
    timeout: 20_000,
  });

type SessionRecord = {
  paid?: boolean;
  created?: number;
  revoked?: boolean;
  revokedAt?: number;
  reason?: string;
  mapId?: string;
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
const chargeKey = (id: string) => `stripe:charge:${id}`;
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

async function markSessionPaid(session: Stripe.Checkout.Session) {
  if (!session.id) return;
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") return;

  const existing = await kv.get<SessionRecord>(sessionKey(session.id));
  if (existing?.revoked) return;

  const plan = getPlan(session);
  const credits = getCredits(session, plan);
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
  const customerId = typeof session.customer === "string" ? session.customer : null;
  if (paymentIntentId) {
    const revokedRecord = await kv.get<{ revoked?: boolean; reason?: string }>(
      revokedPaymentIntentKey(paymentIntentId),
    );
    if (revokedRecord?.revoked) {
      await markSessionRevoked(session.id, revokedRecord.reason ?? "refund");
      return;
    }
  }

  await kv.set(sessionKey(session.id), {
    paid: true,
    created: Date.now(),
    revoked: false,
    mapId: getMapId(session),
    paymentIntentId,
    plan,
    creditsRemaining: credits || undefined,
    creditsTotal: credits || undefined,
    subscriptionId: subscriptionId ?? undefined,
    subscriptionActive: plan === "subscription" ? true : undefined,
    customerId: customerId ?? undefined,
  });

  if (paymentIntentId) {
    await kv.set(paymentIntentKey(paymentIntentId), session.id);
    try {
      if (stripe) {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        const latestCharge =
          paymentIntent && typeof paymentIntent.latest_charge === "string"
            ? paymentIntent.latest_charge
            : null;
        if (latestCharge) {
          await kv.set(chargeKey(latestCharge), session.id);
        }
      }
    } catch (err) {
      console.warn("Stripe payment intent lookup failed", err);
    }
  }
  if (subscriptionId) {
    await kv.set(subscriptionKey(subscriptionId), session.id);
  }
}

async function markSessionRevoked(sessionId: string, reason: string) {
  const existing = await kv.get<SessionRecord>(sessionKey(sessionId));
  await kv.set(sessionKey(sessionId), {
    ...existing,
    paid: false,
    revoked: true,
    revokedAt: Date.now(),
    reason,
    subscriptionActive: false,
  });
}

async function markPaymentIntentRevoked(paymentIntentId: string, reason: string) {
  await kv.set(revokedPaymentIntentKey(paymentIntentId), {
    revoked: true,
    revokedAt: Date.now(),
    reason,
  });
}

async function resolveSessionIdFromPaymentIntent(paymentIntentId?: string | null) {
  if (!paymentIntentId) return null;
  return await kv.get<string>(paymentIntentKey(paymentIntentId));
}

async function resolveSessionIdFromCharge(chargeId?: string | null) {
  if (!chargeId) return null;
  const mapped = await kv.get<string>(chargeKey(chargeId));
  if (mapped) return mapped;
  const paymentIntentId = await resolvePaymentIntentIdFromCharge(chargeId);
  if (!paymentIntentId) return null;
  return await resolveSessionIdFromPaymentIntent(paymentIntentId);
}

async function resolvePaymentIntentIdFromCharge(chargeId?: string | null) {
  if (!chargeId || !stripe) return null;
  try {
    const charge = await stripe.charges.retrieve(chargeId);
    return typeof charge.payment_intent === "string" ? charge.payment_intent : null;
  } catch (err) {
    console.warn("Stripe charge lookup failed", err);
    return null;
  }
}

export async function POST(req: Request) {
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook not configured" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const payload = await req.text();
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      await markSessionPaid(session);
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      if (!subscription.id) break;
      const sessionId = await kv.get<string>(subscriptionKey(subscription.id));
      if (!sessionId) break;
      const existing = await kv.get<SessionRecord>(sessionKey(sessionId));
      const active = subscription.status === "active" || subscription.status === "trialing";
      await kv.set(sessionKey(sessionId), {
        ...existing,
        paid: active,
        revoked: !active,
        subscriptionActive: active,
        revokedAt: active ? undefined : Date.now(),
        reason: active ? undefined : "subscription_inactive",
      });
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      if ((charge.amount_refunded ?? 0) <= 0 && !charge.refunded) break;
      let paymentIntentId =
        typeof charge.payment_intent === "string" ? charge.payment_intent : null;
      const sessionId =
        (await resolveSessionIdFromPaymentIntent(paymentIntentId)) ??
        (await resolveSessionIdFromCharge(charge.id));
      if (sessionId) {
        await markSessionRevoked(sessionId, "refund");
      } else {
        if (!paymentIntentId) {
          paymentIntentId = await resolvePaymentIntentIdFromCharge(charge.id);
        }
        if (paymentIntentId) {
          await markPaymentIntentRevoked(paymentIntentId, "refund");
        }
      }
      break;
    }
    case "charge.dispute.created":
    case "charge.dispute.funds_withdrawn": {
      const dispute = event.data.object as Stripe.Dispute;
      let paymentIntentId =
        typeof dispute.payment_intent === "string" ? dispute.payment_intent : null;
      const chargeId = typeof dispute.charge === "string" ? dispute.charge : null;
      const sessionId =
        (await resolveSessionIdFromPaymentIntent(paymentIntentId)) ??
        (await resolveSessionIdFromCharge(chargeId));
      if (sessionId) {
        await markSessionRevoked(sessionId, "dispute");
      } else {
        if (!paymentIntentId && chargeId) {
          paymentIntentId = await resolvePaymentIntentIdFromCharge(chargeId);
        }
        if (paymentIntentId) {
          await markPaymentIntentRevoked(paymentIntentId, "dispute");
        }
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
