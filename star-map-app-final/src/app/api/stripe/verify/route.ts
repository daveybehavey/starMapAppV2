import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { kv } from "@/lib/kv";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { PREMIUM_COOKIE_NAME, PREMIUM_COOKIE_TTL_SECONDS } from "@/lib/premium";
import type { CheckoutOrderType, CheckoutPlan, PrintVariant } from "@/lib/pricing";
import { isPrintVariant } from "@/lib/printCatalog";
import { resolveCheckoutMapIdFromStripeSession } from "@/lib/checkoutMapId";
import { printOrderKey, type PrintOrderRecord } from "@/lib/printOrders";
import {
  buildGa4PurchaseFromStripeSession,
  isQaStripeSession,
} from "@/lib/commerceAnalytics";
import { recordPaymentVerifiedOnce } from "@/lib/funnel";
import {
  evaluateCheckoutSessionDiscountFulfillment,
  isDiscountFulfillmentRetryable,
  isFulfillableCheckoutPayment,
  type CouponLookup,
} from "@/lib/checkoutPromotions";
import {
  CARRY_NOT_SUPPORTED_INTERIM,
  readSessionRevocationEvidence,
  recordTransferRefusal,
  sessionHoldsLiveEntitlement,
  settleSessionPurchase,
  type SettlementPurchaseTerms,
  type SettlementReceipt,
} from "@/lib/entitlementsStore";

export const runtime = "nodejs";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe =
  stripeSecret &&
  new Stripe(stripeSecret, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
    timeout: 20_000,
  });

function createStripeCouponLookup(client: Stripe): CouponLookup {
  return {
    retrieveCoupon: (id) => client.coupons.retrieve(id),
    retrievePromotionCode: (id) =>
      client.promotionCodes.retrieve(id, { expand: ["coupon"] }),
  };
}

type SessionRecord = {
  paid?: boolean;
  /** Option B interim settlement receipt (see lib/entitlementsStore.ts). */
  settlementReceipt?: SettlementReceipt;
  mapId?: string;
  revoked?: boolean;
  paymentIntentId?: string | null;
  amountTotal?: number | null;
  currency?: string | null;
  plan?: CheckoutPlan;
  creditsRemaining?: number;
  creditsTotal?: number;
  subscriptionId?: string | null;
  subscriptionActive?: boolean;
  customerId?: string | null;
  orderType?: CheckoutOrderType;
  printVariant?: PrintVariant;
  includesDigitalAddOn?: boolean;
};

const sessionKey = (id: string) => `stripe:session:${id}`;
const paymentIntentKey = (id: string) => `stripe:pi:${id}`;
const revokedPaymentIntentKey = (id: string) => `stripe:pi:revoked:${id}`;
const subscriptionKey = (id: string) => `stripe:sub:${id}`;

type PrintOrderSummary = {
  kvStatus: PrintOrderRecord["status"] | null;
  printfulOrderId: string | number | null;
  confirmationEmailSent: boolean;
  shippingNotificationSent: boolean;
  /** Destination country code only — never full address. */
  shippingCountry: string | null;
};

function normalizeShippingCountryCode(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

async function loadPrintSummary(sessionId: string): Promise<PrintOrderSummary | null> {
  const order = await kv.get<PrintOrderRecord>(printOrderKey(sessionId));
  if (!order) {
    return {
      kvStatus: null,
      printfulOrderId: null,
      confirmationEmailSent: false,
      shippingNotificationSent: false,
      shippingCountry: null,
    };
  }
  return {
    kvStatus: order.status ?? null,
    printfulOrderId: order.printfulOrderId ?? null,
    confirmationEmailSent: Boolean(order.printConfirmationSentAt),
    shippingNotificationSent: Boolean(order.shippingNotificationSentAt),
    shippingCountry: normalizeShippingCountryCode(order.shippingDetails?.address?.country),
  };
}

function getOrderType(session: Stripe.Checkout.Session): CheckoutOrderType {
  return session.metadata?.order_type === "print" ? "print" : "digital";
}

function getPrintVariant(session: Stripe.Checkout.Session): PrintVariant | undefined {
  const raw = session.metadata?.print_variant;
  return isPrintVariant(raw) ? raw : undefined;
}

function includesDigitalAddOn(session: Stripe.Checkout.Session): boolean {
  return session.metadata?.print_include_digital === "true";
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

export async function GET(req: NextRequest) {
  // Rate limit: 30 requests per minute per IP.
  // Success-page polling + occasional refreshes can exceed 10/min for legitimate users.
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`stripe:verify:${ip}`, 30, 60);
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
  const alreadyPaid = Boolean(record?.paid);
  if (record?.revoked) {
    return NextResponse.json(
      { paid: false, revoked: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // Option B: durable revocation evidence outside the session record (side
  // record / PI tombstone) also denies the paid fast path — a stale session
  // snapshot must not issue an active entitlement cookie after a refund.
  const revocationEvidence = await readSessionRevocationEvidence(
    sessionId,
    record?.paymentIntentId ?? null,
  );
  if (revocationEvidence.revoked) {
    return NextResponse.json(
      { paid: false, revoked: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // Option B: automatic cross-session carry-forward is disabled. When the
  // request presents a DIFFERENT session's premium cookie, say so explicitly
  // instead of silently implying a combined balance, and nothing is moved.
  // The incoming cookie is preserved — not overwritten with the new
  // session — only while the incoming session still holds live entitlement
  // (paid, unrevoked, credits remaining or an active subscription): it is
  // the browser's only handle on that entitlement, and stranding it would
  // silently cut the buyer off from credits they already paid for. When
  // the incoming session holds no live entitlement, a successful verify
  // sets the new session's cookie exactly as usual.
  const incomingSessionId = req.cookies.get(PREMIUM_COOKIE_NAME)?.value;
  const carryRequested = Boolean(incomingSessionId && incomingSessionId !== sessionId);
  const carryForwardField = carryRequested
    ? {
        carryForward: {
          outcome: CARRY_NOT_SUPPORTED_INTERIM,
          movedCredits: 0,
        },
      }
    : {};
  const preserveIncomingCookie = carryRequested
    ? await sessionHoldsLiveEntitlement(incomingSessionId as string)
    : false;

  if (record?.paid && !record.revoked) {
    const mapId = typeof record.mapId === "string" ? record.mapId : undefined;
    const orderType = record.orderType ?? "digital";
    const printSummary = orderType === "print" ? await loadPrintSummary(sessionId) : undefined;
    const response = NextResponse.json(
      {
        paid: true,
        mapId,
        amountTotal: record.amountTotal ?? null,
        currency: record.currency ?? null,
        plan: record.plan ?? null,
        creditsRemaining: record.creditsRemaining ?? null,
        subscriptionActive: record.subscriptionActive ?? null,
        orderType,
        printVariant: record.printVariant ?? null,
        includesDigitalAddOn: Boolean(record.includesDigitalAddOn),
        printSummary,
        ...carryForwardField,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
    const hasDigitalEntitlement =
      record.orderType === "print"
        ? Boolean(record.includesDigitalAddOn) && ((record.creditsRemaining ?? 0) > 0 || Boolean(record.paid))
        : record.plan === "subscription"
          ? Boolean(record.subscriptionActive)
          : (record.creditsRemaining ?? 0) > 0 || Boolean(record.paid);
    if (hasDigitalEntitlement && !preserveIncomingCookie) {
      response.cookies.set(PREMIUM_COOKIE_NAME, sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: PREMIUM_COOKIE_TTL_SECONDS,
      });
    }
    return response;
  }

  if (!stripe) {
    return NextResponse.json({ paid: false }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["total_details.breakdown"],
    });
    const paidViaStripe =
      (session.mode === "payment" || session.mode === "subscription") &&
      isFulfillableCheckoutPayment(session);
    if (!paidViaStripe) {
      return NextResponse.json({ paid: false }, { headers: { "Cache-Control": "no-store" } });
    }

    const orderType = getOrderType(session);
    const printVariant = getPrintVariant(session);
    const hasDigitalAddOn = includesDigitalAddOn(session);
    const plan = getPlan(session, orderType, hasDigitalAddOn);
    const discountGate = await evaluateCheckoutSessionDiscountFulfillment({
      session,
      orderType,
      plan,
      lookup: createStripeCouponLookup(stripe),
    });
    if (!discountGate.ok) {
      if (isDiscountFulfillmentRetryable(discountGate)) {
        // Transient coupon lookup / unresolved discount — do not strand the buyer
        // on a terminal paid:false. Clients already poll verify; 503 + pending
        // mirrors checkout's promotion_lookup_failed transient pattern.
        console.warn("Stripe verify discount coupon resolution pending", {
          sessionId,
          reason: discountGate.reason,
          orderType,
          plan: plan ?? null,
        });
        return NextResponse.json(
          { paid: false, pending: true, reason: discountGate.reason },
          {
            status: 503,
            headers: { "Cache-Control": "no-store", "Retry-After": "2" },
          },
        );
      }
      console.warn("Stripe verify refused incompatible checkout discount", {
        sessionId,
        reason: discountGate.reason,
        orderType,
        plan: plan ?? null,
      });
      return NextResponse.json({ paid: false }, { headers: { "Cache-Control": "no-store" } });
    }
    const credits = getCredits(session, plan);
    // Option B interim policy (S61-1 mapping of S54-3): automatic
    // cross-session carry-forward is DISABLED. The pre-B code read session
    // A's remaining balance here and added it into B's settlement totals
    // (M1-02) with no source debit — A->B and A->C could both copy it. Under
    // B there is no source-balance read for movement, no debit, no credit,
    // and no retirement: B settles only its own purchase, and the refusal
    // is explicit (audit record + response field). The one read of A's
    // record (preserveIncomingCookie, computed before settlement) decides
    // cookie preservation only — it never moves a balance.
    if (carryRequested) {
      await recordTransferRefusal({
        sourceSessionId: incomingSessionId as string,
        destinationSessionId: sessionId,
      });
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
    const mapId = resolveCheckoutMapIdFromStripeSession(session);
    // Option B shared settlement (S61-1 mapping of S54-3): observed replay
    // performs no session write, legacy paid records are adopted untouched,
    // and ambiguous persistence answers pending — never definitive-unpaid,
    // never another purchase.
    const purchaseTerms: SettlementPurchaseTerms = {
      plan: plan ?? null,
      purchasedCredits: credits,
      orderType,
      printVariant: printVariant ?? null,
      includesDigitalAddOn: hasDigitalAddOn,
      subscription: plan === "subscription",
      amountTotal: session.amount_total ?? null,
      currency: session.currency ?? null,
      paymentIntentId,
      subscriptionId,
      customerId,
    };
    const outcome = await settleSessionPurchase({
      sessionId,
      paymentIntentId,
      purchaseTerms,
      buildInitialRecord: (receipt) => ({
        paid: true,
        settlementReceipt: receipt,
        created: Date.now(),
        mapId,
        revoked: false,
        paymentIntentId,
        amountTotal: session.amount_total ?? null,
        currency: session.currency ?? null,
        plan,
        creditsRemaining: credits || undefined,
        creditsTotal: credits || undefined,
        subscriptionId: subscriptionId ?? undefined,
        subscriptionActive: plan === "subscription" ? true : undefined,
        customerId: customerId ?? undefined,
        orderType,
        printVariant,
        includesDigitalAddOn: hasDigitalAddOn,
      }),
    });
    if (outcome.kind === "revoked") {
      return NextResponse.json(
        { paid: false, revoked: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (outcome.kind === "reconciliation_required" || outcome.kind === "persistence_ambiguous") {
      console.warn("Stripe verify settlement not finalizable yet", {
        sessionId,
        outcome: outcome.kind,
        detail: outcome.detail,
      });
      return NextResponse.json(
        { paid: false, pending: true, reason: outcome.kind },
        {
          status: 503,
          headers: { "Cache-Control": "no-store", "Retry-After": "2" },
        },
      );
    }
    if (outcome.kind === "already_settled") {
      // A concurrent settlement (webhook or a racing verify) already wrote
      // the record; answer from it without any further writes.
      const settled = outcome.record;
      const settledOrderType = settled.orderType ?? "digital";
      const settledResponse = NextResponse.json(
        {
          paid: true,
          mapId: typeof settled.mapId === "string" ? settled.mapId : undefined,
          amountTotal: settled.amountTotal ?? null,
          currency: settled.currency ?? null,
          plan: settled.plan ?? null,
          creditsRemaining: settled.creditsRemaining ?? null,
          subscriptionActive: settled.subscriptionActive ?? null,
          orderType: settledOrderType,
          printVariant: settled.printVariant ?? null,
          includesDigitalAddOn: Boolean(settled.includesDigitalAddOn),
          printSummary: settledOrderType === "print" ? await loadPrintSummary(sessionId) : undefined,
          ...carryForwardField,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
      const settledHasDigitalEntitlement =
        settled.orderType === "print"
          ? Boolean(settled.includesDigitalAddOn) &&
            ((settled.creditsRemaining ?? 0) > 0 || Boolean(settled.paid))
          : settled.plan === "subscription"
            ? Boolean(settled.subscriptionActive)
            : (settled.creditsRemaining ?? 0) > 0 || Boolean(settled.paid);
      if (settledHasDigitalEntitlement && !preserveIncomingCookie) {
        settledResponse.cookies.set(PREMIUM_COOKIE_NAME, sessionId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: PREMIUM_COOKIE_TTL_SECONDS,
        });
      }
      return settledResponse;
    }
    if (!alreadyPaid) {
      // Auxiliary analytics only: settlement above has already authorized
      // the paid response, so a soft-write failure inside the funnel
      // (dedupe / counter kv.incr) degrades analytics — it must never
      // reach the outer catch and convert a settled payment into a
      // definitive { paid: false }.
      try {
        const skipProductionAnalytics = isQaStripeSession(session);
        await recordPaymentVerifiedOnce({
          sessionId,
          amountTotal: typeof session.amount_total === "number" ? session.amount_total : null,
          source: orderType === "print" ? "stripe_verify_print" : "stripe_verify_digital",
          plan: plan ?? undefined,
          skipProductionAnalytics,
          ga4Purchase: buildGa4PurchaseFromStripeSession(session),
        });
      } catch (err) {
        console.warn("Stripe verify payment analytics recording failed", {
          sessionId,
          error: err,
        });
      }
    }
    if (paymentIntentId) {
      // Auxiliary association only (same rule as analytics): a failed
      // mapping write leaves the association incomplete, never unpaid.
      try {
        await kv.set(paymentIntentKey(paymentIntentId), sessionId);
      } catch (err) {
        console.warn("Stripe verify payment-intent mapping write failed", {
          sessionId,
          paymentIntentId,
          error: err,
        });
      }
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
      // Auxiliary association only (same rule as above): a failed mapping
      // write leaves the association incomplete, never unpaid.
      try {
        await kv.set(subscriptionKey(subscriptionId), sessionId);
      } catch (err) {
        console.warn("Stripe verify subscription mapping write failed", {
          sessionId,
          subscriptionId,
          error: err,
        });
      }
    }

    const response = NextResponse.json(
      {
        paid: true,
        mapId,
        amountTotal: session.amount_total ?? null,
        currency: session.currency ?? null,
        plan: plan ?? null,
        creditsRemaining: credits || null,
        subscriptionActive: plan === "subscription",
        orderType,
        printVariant: printVariant ?? null,
        includesDigitalAddOn: hasDigitalAddOn,
        isQa: isQaStripeSession(session),
        printSummary: orderType === "print" ? await loadPrintSummary(sessionId) : undefined,
        ...carryForwardField,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
    const hasDigitalEntitlement =
      orderType === "print" ? hasDigitalAddOn && credits > 0 : plan === "subscription" ? true : credits > 0;
    if (hasDigitalEntitlement && !preserveIncomingCookie) {
      response.cookies.set(PREMIUM_COOKIE_NAME, sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: PREMIUM_COOKIE_TTL_SECONDS,
      });
    }
    return response;
  } catch (err) {
    console.error("Stripe session verification failed", err);
    return NextResponse.json({ paid: false }, { headers: { "Cache-Control": "no-store" } });
  }
}
