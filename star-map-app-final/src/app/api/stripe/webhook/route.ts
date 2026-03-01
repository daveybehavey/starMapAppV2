import { NextResponse } from "next/server";
import Stripe from "stripe";
import { kv } from "@/lib/kv";
import type { CheckoutOrderType, CheckoutPlan, PrintVariant } from "@/lib/pricing";
import {
  normalizeReferralCode,
  referralKey,
  referralRewardedKey,
  type ReferralRecord,
} from "@/lib/referrals";
import { appendReferralEvent } from "@/lib/referralLedger";
import { isPrintfulConfigured, submitPrintfulOrder } from "@/lib/printful";
import { PRINT_ASSET_ID_REGEX } from "@/lib/printAssets";
import {
  buildPrintAssetUrl,
  getPrintRecipient,
  printOrderKey,
  type PrintOrderRecord,
} from "@/lib/printOrders";

export const runtime = "nodejs";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const printFulfillmentWebhookUrl = process.env.PRINT_FULFILLMENT_WEBHOOK_URL?.trim() || "";
const printOrderSubmissionEnabled = /^(1|true|yes)$/i.test(
  (process.env.PRINT_ORDER_SUBMISSION_ENABLED || "").trim(),
);
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com").replace(/\/+$/, "");
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
  customerEmail?: string | null;
  orderType?: CheckoutOrderType;
  printVariant?: PrintVariant;
  includesDigitalAddOn?: boolean;
  printAssetId?: string;
  referralCode?: string;
};

const sessionKey = (id: string) => `stripe:session:${id}`;
const paymentIntentKey = (id: string) => `stripe:pi:${id}`;
const revokedPaymentIntentKey = (id: string) => `stripe:pi:revoked:${id}`;
const chargeKey = (id: string) => `stripe:charge:${id}`;
const subscriptionKey = (id: string) => `stripe:sub:${id}`;

function normalizeEmail(raw: unknown) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed || null;
}

function getMapId(session: Stripe.Checkout.Session) {
  return (
    (typeof session.metadata?.map_id === "string" && session.metadata.map_id.trim()) ||
    (typeof session.client_reference_id === "string" && session.client_reference_id.trim()) ||
    undefined
  );
}

function getOrderType(session: Stripe.Checkout.Session): CheckoutOrderType {
  return session.metadata?.order_type === "print" ? "print" : "digital";
}

function getPrintVariant(session: Stripe.Checkout.Session): PrintVariant | undefined {
  if (session.metadata?.print_variant === "poster_framed") return "poster_framed";
  if (session.metadata?.print_variant === "poster_unframed") return "poster_unframed";
  return undefined;
}

function includesDigitalAddOn(session: Stripe.Checkout.Session): boolean {
  return session.metadata?.print_include_digital === "true";
}

function getPrintAssetId(session: Stripe.Checkout.Session): string | undefined {
  const raw = typeof session.metadata?.print_asset_id === "string" ? session.metadata.print_asset_id.trim() : "";
  if (!raw || !PRINT_ASSET_ID_REGEX.test(raw)) return undefined;
  return raw;
}

function extractShippingDetails(session: Stripe.Checkout.Session): Stripe.Checkout.Session.ShippingDetails | null {
  if (session.shipping_details) return session.shipping_details;
  const collected = (
    session as Stripe.Checkout.Session & {
      collected_information?: { shipping_details?: Stripe.Checkout.Session.ShippingDetails | null };
    }
  ).collected_information?.shipping_details;
  return collected ?? null;
}

function getPlan(
  session: Stripe.Checkout.Session,
  orderType: CheckoutOrderType,
  hasDigitalAddOn: boolean,
): CheckoutPlan | undefined {
  if (orderType === "print" && !hasDigitalAddOn) {
    return undefined;
  }
  const plan = typeof session.metadata?.plan === "string" ? session.metadata.plan : null;
  if (plan === "pack3" || plan === "subscription" || plan === "single") {
    return plan;
  }
  return session.mode === "subscription" ? "subscription" : "single";
}

function getCredits(session: Stripe.Checkout.Session, plan: CheckoutPlan | undefined): number {
  if (!plan) return 0;
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

  const orderType = getOrderType(session);
  const printVariant = getPrintVariant(session);
  const hasDigitalAddOn = includesDigitalAddOn(session);
  const printAssetId = getPrintAssetId(session);
  const plan = getPlan(session, orderType, hasDigitalAddOn);
  const credits = getCredits(session, plan);
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
  const customerId = typeof session.customer === "string" ? session.customer : null;
  const customerEmail = normalizeEmail(session.customer_details?.email ?? session.customer_email);
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
    customerEmail: customerEmail ?? undefined,
    orderType,
    printVariant,
    includesDigitalAddOn: hasDigitalAddOn,
    printAssetId,
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

async function applyReferralReward(session: Stripe.Checkout.Session) {
  if (!session.id) return;
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") return;

  const referralCode = normalizeReferralCode(session.metadata?.referral_code);
  const referrerSessionId =
    typeof session.metadata?.referrer_session_id === "string" ? session.metadata.referrer_session_id.trim() : "";
  if (!referralCode || !referrerSessionId) return;
  if (referrerSessionId === session.id) return;

  const rewarded = await kv.get<{ rewarded?: boolean }>(referralRewardedKey(session.id));
  if (rewarded?.rewarded) return;
  await kv.set(referralRewardedKey(session.id), { rewarded: true, createdAt: Date.now() });

  const referralRecord = await kv.get<ReferralRecord>(referralKey(referralCode));
  if (!referralRecord || referralRecord.sessionId !== referrerSessionId) {
    await appendReferralEvent({
      code: referralCode,
      type: "reward_skipped",
      details: { reason: "code_mismatch_or_missing", checkoutSessionId: session.id },
    });
    return;
  }

  const orderType = getOrderType(session);
  const hasDigitalAddOn = includesDigitalAddOn(session);
  const amountTotal = typeof session.amount_total === "number" ? session.amount_total : 0;
  const rewardEligible = (orderType === "digital" || hasDigitalAddOn) && amountTotal > 0;
  let rewardGranted = 0;
  const checkoutCustomerId = typeof session.customer === "string" ? session.customer.trim() : "";
  const checkoutCustomerEmail = normalizeEmail(session.customer_details?.email ?? session.customer_email);
  const referrer = await kv.get<SessionRecord>(sessionKey(referrerSessionId));
  if (!referrer || referrer.revoked) {
    await appendReferralEvent({
      code: referralCode,
      type: "reward_skipped",
      details: { reason: "referrer_inactive", checkoutSessionId: session.id },
    });
    return;
  }

  const sameCustomerId = Boolean(referrer.customerId && checkoutCustomerId && referrer.customerId === checkoutCustomerId);
  const referrerEmail = normalizeEmail(referrer.customerEmail);
  const sameEmail = Boolean(referrerEmail && checkoutCustomerEmail && referrerEmail === checkoutCustomerEmail);
  if (sameCustomerId || sameEmail) {
    await appendReferralEvent({
      code: referralCode,
      type: "reward_skipped",
      details: { reason: "self_referral", checkoutSessionId: session.id },
    });
    return;
  }

  let rewardSkipReason: string | undefined;
  if (rewardEligible) {
    if (referrer.plan !== "subscription") {
      const nextCredits = Math.max(0, referrer.creditsRemaining ?? 0) + 1;
      await kv.set(sessionKey(referrerSessionId), {
        ...referrer,
        paid: true,
        creditsRemaining: nextCredits,
        creditsTotal: Math.max(nextCredits, referrer.creditsTotal ?? 0),
      });
      rewardGranted = 1;
    } else {
      rewardSkipReason = "subscription_referrer";
    }
  } else {
    rewardSkipReason = "ineligible_order";
  }

  const timestamp = Date.now();
  await kv.set(referralKey(referralCode), {
    ...referralRecord,
    conversions: (referralRecord.conversions ?? 0) + 1,
    rewardsGranted: (referralRecord.rewardsGranted ?? 0) + rewardGranted,
    lastConvertedAt: timestamp,
  });

  await appendReferralEvent({
    code: referralCode,
    type: "conversion_recorded",
    createdAt: timestamp,
    details: {
      checkoutSessionId: session.id,
      orderType,
      amountTotal,
      rewardGranted,
    },
  });

  if (rewardGranted > 0) {
    await appendReferralEvent({
      code: referralCode,
      type: "reward_granted",
      createdAt: timestamp,
      details: {
        checkoutSessionId: session.id,
        rewardGranted,
      },
    });
  } else {
    await appendReferralEvent({
      code: referralCode,
      type: "reward_skipped",
      createdAt: timestamp,
      details: {
        checkoutSessionId: session.id,
        reason: rewardSkipReason ?? "not_eligible",
      },
    });
  }
}

async function queuePrintOrder(session: Stripe.Checkout.Session) {
  if (!session.id) return;
  if (getOrderType(session) !== "print") return;

  const existing = await kv.get<PrintOrderRecord>(printOrderKey(session.id));
  if (existing?.status === "sent") return;

  let payload: PrintOrderRecord = {
    status: "pending",
    sessionId: session.id,
    mapId: getMapId(session),
    printVariant: getPrintVariant(session) ?? "poster_unframed",
    includesDigitalAddOn: includesDigitalAddOn(session),
    printAssetId: getPrintAssetId(session),
    amountTotal: session.amount_total,
    currency: session.currency,
    customerEmail: session.customer_details?.email ?? session.customer_email ?? null,
    customerName: session.customer_details?.name ?? null,
    shippingDetails: extractShippingDetails(session),
    attempts: (existing?.attempts ?? 0) + 1,
    createdAt: existing?.createdAt ?? Date.now(),
  };
  await kv.set(printOrderKey(session.id), payload);

  const printAssetId = payload.printAssetId;
  if (!printAssetId) {
    await kv.set(printOrderKey(session.id), {
      ...payload,
      status: "failed",
      error: "print_asset_missing",
    });
    return;
  }

  const printAssetUrl = buildPrintAssetUrl(siteUrl, printAssetId);
  let recipient = getPrintRecipient(payload);
  if (!recipient && stripe) {
    try {
      const latest = await stripe.checkout.sessions.retrieve(session.id);
      payload = {
        ...payload,
        customerEmail: latest.customer_details?.email ?? latest.customer_email ?? payload.customerEmail ?? null,
        customerName: latest.customer_details?.name ?? payload.customerName ?? null,
        shippingDetails: extractShippingDetails(latest),
      };
      await kv.set(printOrderKey(session.id), payload);
      recipient = getPrintRecipient(payload);
    } catch (error) {
      console.warn("Print order recipient refresh failed", error);
    }
  }
  if (!recipient) {
    await kv.set(printOrderKey(session.id), {
      ...payload,
      printAssetUrl,
      status: "failed",
      error: "shipping_details_missing",
    });
    return;
  }

  if (!printOrderSubmissionEnabled) {
    await kv.set(printOrderKey(session.id), {
      ...payload,
      printAssetUrl,
      status: "pending",
      error: "submission_disabled",
    });
    return;
  }

  if (!isPrintfulConfigured() && !printFulfillmentWebhookUrl) {
    await kv.set(printOrderKey(session.id), {
      ...payload,
      printAssetUrl,
      status: "failed",
      error: "fulfillment_not_configured",
    });
    return;
  }

  if (isPrintfulConfigured()) {
    const printfulResult = await submitPrintfulOrder({
      externalId: session.id,
      variant: payload.printVariant,
      fileUrl: printAssetUrl,
      recipient,
    });
    if (!printfulResult.ok) {
      await kv.set(printOrderKey(session.id), {
        ...payload,
        printAssetUrl,
        status: "failed",
        webhookStatus: printfulResult.status,
        error: printfulResult.error ?? "printful_order_failed",
      });
      return;
    }
    await kv.set(printOrderKey(session.id), {
      ...payload,
      printAssetUrl,
      status: "sent",
      webhookStatus: printfulResult.status,
      printfulOrderId: printfulResult.orderId,
      sentAt: Date.now(),
      error: undefined,
    });
  }

  if (!printFulfillmentWebhookUrl) return;

  try {
    const response = await fetch(printFulfillmentWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        printAssetUrl,
        recipient,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Webhook ${response.status}: ${body.slice(0, 280)}`);
    }
    if (!isPrintfulConfigured()) {
      await kv.set(printOrderKey(session.id), {
        ...payload,
        printAssetUrl,
        status: "sent",
        webhookStatus: response.status,
        sentAt: Date.now(),
        error: undefined,
      });
    }
  } catch (error) {
    if (!isPrintfulConfigured()) {
      await kv.set(printOrderKey(session.id), {
        ...payload,
        printAssetUrl,
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 320) : "webhook_failed",
      });
    }
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
      await queuePrintOrder(session);
      await applyReferralReward(session);
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
