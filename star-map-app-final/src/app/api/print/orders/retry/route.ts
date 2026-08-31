import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { isDurableKvPersistenceError, kv } from "@/lib/kv";
import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";
import { isPrintfulConfigured, submitPrintfulOrder } from "@/lib/printful";
import { evaluatePrintMarginForPaidOrder } from "@/lib/printMargin";
import {
  assertPrintOrderRetained,
  buildAlternateFulfillmentWebhookPayload,
  buildPrintAssetUrl,
  extractCheckoutPhoneFromStripeSession,
  getPrintMinChargeCents,
  getPrintRecipient,
  hasSufficientPrintCharge,
  isPrintOrderUnretainableError,
  isValidPrintCheckoutSessionId,
  persistPrintOrderRecord,
  printOrderKey,
  resolvePrintOrderKvWrite,
  sanitizePrintOrderForOperatorResponse,
  type PrintOrderRecord,
} from "@/lib/printOrders";
import { sendPrintOrderApprovalAlert, sendPrintOrderFailureAlert } from "@/lib/printOrderAlerts";
import { bindAcceptedPrintfulIdentityThenReview } from "@/lib/printFulfillmentPostSubmit";
import { extendPrintAssetTtlForFulfillment } from "@/lib/printAssetFulfillment";
import { sendPrintOrderConfirmation } from "@/lib/printOrderConfirmation";
import {
  getPrintOrderAuthorityState,
  seedPrintOrderAuthorityFromKv,
} from "@/lib/printOrderAuthority";

export const runtime = "nodejs";

const printFulfillmentWebhookUrl = process.env.PRINT_FULFILLMENT_WEBHOOK_URL?.trim() || "";
const printOrderSubmissionEnabled = /^(1|true|yes)$/i.test(
  (process.env.PRINT_ORDER_SUBMISSION_ENABLED || "").trim(),
);
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com").replace(/\/+$/, "");
const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe =
  stripeSecret &&
  new Stripe(stripeSecret, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
    timeout: 20_000,
  });

function requireAdmin(req: NextRequest) {
  const configured = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  const candidate = readAdminTokenFromHeaders(req.headers);
  return hasValidAdminToken(candidate, configured);
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

async function hydrateOrderRecipientData(existing: PrintOrderRecord): Promise<PrintOrderRecord> {
  // Refresh when shipping/recipient is incomplete, or when customerPhone was never
  // considered (legacy records predating phone persistence). Do not invent a phone.
  const hasRecipient = Boolean(getPrintRecipient(existing));
  const phoneAlreadyConsidered = existing.customerPhone !== undefined;
  if (hasRecipient && phoneAlreadyConsidered) return existing;
  if (!stripe) return existing;
  try {
    const session = await stripe.checkout.sessions.retrieve(existing.sessionId);
    const updated: PrintOrderRecord = {
      ...existing,
      amountTotal:
        typeof session.amount_total === "number" && Number.isFinite(session.amount_total)
          ? session.amount_total
          : existing.amountTotal ?? null,
      currency: session.currency ?? existing.currency ?? null,
      customerEmail: session.customer_details?.email ?? session.customer_email ?? existing.customerEmail ?? null,
      customerName: session.customer_details?.name ?? existing.customerName ?? null,
      customerPhone: extractCheckoutPhoneFromStripeSession(session) ?? existing.customerPhone ?? null,
      shippingDetails: extractShippingDetails(session) ?? existing.shippingDetails ?? null,
    };
    if (
      updated.customerEmail !== existing.customerEmail ||
      updated.customerName !== existing.customerName ||
      updated.customerPhone !== existing.customerPhone ||
      JSON.stringify(updated.shippingDetails) !== JSON.stringify(existing.shippingDetails)
    ) {
      assertPrintOrderRetained(await persistPrintOrderRecord(existing.sessionId, updated));
    }
    return updated;
  } catch (error) {
    if (isDurableKvPersistenceError(error) || isPrintOrderUnretainableError(error)) throw error;
    console.warn("Failed to refresh print order recipient details from Stripe", error);
    return existing;
  }
}

export async function POST(req: NextRequest) {
  try {
    return await postRetryPrintOrder(req);
  } catch (error) {
    if (isPrintOrderUnretainableError(error)) {
      return NextResponse.json(
        { ok: false, error: error.code, reason: error.reason },
        { status: 409 },
      );
    }
    throw error;
  }
}

async function postRetryPrintOrder(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!printOrderSubmissionEnabled) {
    return NextResponse.json(
      { ok: false, error: "Print order submission is disabled" },
      { status: 503 },
    );
  }

  let sessionId = "";
  try {
    const body = (await req.json()) as { sessionId?: unknown } | null;
    if (typeof body?.sessionId === "string") {
      sessionId = body.sessionId.trim();
    }
  } catch {
    sessionId = "";
  }
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "sessionId required" }, { status: 400 });
  }
  if (!isValidPrintCheckoutSessionId(sessionId)) {
    return NextResponse.json({ ok: false, error: "valid sessionId required" }, { status: 400 });
  }

  const persistFailedPrintOrder = async (record: PrintOrderRecord) => {
    const failedRecord: PrintOrderRecord = {
      ...record,
      status: "failed",
    };
    if (!failedRecord.operatorFailureAlertedAt) {
      const alertResult = await sendPrintOrderFailureAlert(failedRecord);
      if (alertResult.delivered) {
        failedRecord.operatorFailureAlertedAt = Date.now();
        failedRecord.operatorFailureAlertProvider = alertResult.provider;
        failedRecord.operatorFailureAlertError = undefined;
      } else {
        failedRecord.operatorFailureAlertProvider = alertResult.provider;
        failedRecord.operatorFailureAlertError = alertResult.error;
      }
    }
    assertPrintOrderRetained(await persistPrintOrderRecord(sessionId, failedRecord));
    return failedRecord;
  };

  const existing = await kv.get<PrintOrderRecord>(printOrderKey(sessionId));
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Print order not found" }, { status: 404 });
  }

  {
    const authority = await getPrintOrderAuthorityState(sessionId);
    if (!authority || authority.revision === 0) {
      await seedPrintOrderAuthorityFromKv(sessionId, existing);
    }
  }
  const authority = await getPrintOrderAuthorityState(sessionId);
  if (!authority) {
    return NextResponse.json(
      { ok: false, error: "print_order_authority_unread" },
      { status: 503 },
    );
  }
  if (authority.lifecycle === "terminal_failed") {
    return NextResponse.json(
      {
        ok: false,
        error: "terminal_failed_requires_operator_recover",
        order: sanitizePrintOrderForOperatorResponse(existing),
      },
      { status: 409 },
    );
  }
  if (authority.lifecycle === "bound" && authority.printfulOrderId) {
    const boundOrder: PrintOrderRecord = {
      ...existing,
      status: existing.status === "sent" ? "sent" : existing.status,
      printfulOrderId: existing.printfulOrderId ?? authority.printfulOrderId,
    };
    void sendPrintOrderConfirmation(sessionId).catch((error) => {
      console.warn("Print confirmation email failed on already_bound retry", { sessionId, error });
    });
    return NextResponse.json({
      ok: true,
      status: "already_bound",
      order: sanitizePrintOrderForOperatorResponse(boundOrder),
    });
  }

  if (existing.status === "sent") {
    if (!existing.operatorAlertedAt) {
      const alertResult = await sendPrintOrderApprovalAlert(existing);
      const updated: PrintOrderRecord = {
        ...existing,
        operatorAlertedAt: alertResult.delivered ? Date.now() : existing.operatorAlertedAt,
        operatorAlertProvider: alertResult.provider,
        operatorAlertError: alertResult.delivered ? undefined : alertResult.error,
      };
      assertPrintOrderRetained(await persistPrintOrderRecord(sessionId, updated));
      void sendPrintOrderConfirmation(sessionId).catch((error) => {
        console.warn("Print confirmation email failed on already_sent retry", { sessionId, error });
      });
      return NextResponse.json({ ok: true, status: "already_sent", order: sanitizePrintOrderForOperatorResponse(updated) });
    }
    void sendPrintOrderConfirmation(sessionId).catch((error) => {
      console.warn("Print confirmation email failed on already_sent retry", { sessionId, error });
    });
    return NextResponse.json({ ok: true, status: "already_sent", order: sanitizePrintOrderForOperatorResponse(existing) });
  }

  const hydrated = await hydrateOrderRecipientData(existing);

  const printAssetId = hydrated.printAssetId?.trim();
  if (!printAssetId) {
    const failed = await persistFailedPrintOrder({
      ...hydrated,
      attempts: (hydrated.attempts ?? 0) + 1,
      error: "print_asset_missing",
    });
    return NextResponse.json({ ok: false, error: failed.error, order: sanitizePrintOrderForOperatorResponse(failed) }, { status: 400 });
  }

  const printAssetUrl = hydrated.printAssetUrl?.trim() || buildPrintAssetUrl(siteUrl, printAssetId);
  await extendPrintAssetTtlForFulfillment(printAssetId).catch(() => undefined);

  let cardPrintAssetUrl: string | undefined;
  const cardPrintAssetId = hydrated.cardPrintAssetId?.trim();
  if (hydrated.includesCardAddOn) {
    if (!cardPrintAssetId) {
      const failed = await persistFailedPrintOrder({
        ...hydrated,
        attempts: (hydrated.attempts ?? 0) + 1,
        printAssetUrl,
        error: "card_print_asset_missing",
      });
      return NextResponse.json({ ok: false, error: failed.error, order: sanitizePrintOrderForOperatorResponse(failed) }, { status: 400 });
    }
    cardPrintAssetUrl = hydrated.cardPrintAssetUrl?.trim() || buildPrintAssetUrl(siteUrl, cardPrintAssetId);
    await extendPrintAssetTtlForFulfillment(cardPrintAssetId).catch(() => undefined);
  }

  const recipient = getPrintRecipient(hydrated);
  if (!recipient) {
    const failed = await persistFailedPrintOrder({
      ...hydrated,
      attempts: (hydrated.attempts ?? 0) + 1,
      printAssetUrl,
      error: "shipping_details_missing",
    });
    return NextResponse.json({ ok: false, error: failed.error, order: sanitizePrintOrderForOperatorResponse(failed) }, { status: 400 });
  }

  if (!hasSufficientPrintCharge(hydrated.amountTotal)) {
    const failed = await persistFailedPrintOrder({
      ...hydrated,
      attempts: (hydrated.attempts ?? 0) + 1,
      printAssetUrl,
      error: `print_amount_below_minimum:${getPrintMinChargeCents()}`,
    });
    return NextResponse.json({ ok: false, error: failed.error, order: sanitizePrintOrderForOperatorResponse(failed) }, { status: 400 });
  }

  const marginCheck = evaluatePrintMarginForPaidOrder({
    variant: hydrated.printVariant,
    shippingCountry: recipient.country_code,
    amountTotalCents: hydrated.amountTotal ?? null,
  });
  if (!marginCheck.allowed) {
    const failed = await persistFailedPrintOrder({
      ...hydrated,
      attempts: (hydrated.attempts ?? 0) + 1,
      printAssetUrl,
      error:
        marginCheck.code === "margin_below_threshold"
          ? `print_margin_below_minimum:${marginCheck.minMarginCents}`
          : "print_margin_estimate_unavailable",
    });
    return NextResponse.json({ ok: false, error: failed.error, order: sanitizePrintOrderForOperatorResponse(failed) }, { status: 400 });
  }

  if (!isPrintfulConfigured() && !printFulfillmentWebhookUrl) {
    return NextResponse.json({ ok: false, error: "Fulfillment not configured" }, { status: 503 });
  }

  // Fail closed before any provider side effect: unretainable records must not
  // reach Printful and then lose durable recovery state on the post-sent write.
  const retainPlan = resolvePrintOrderKvWrite(hydrated.createdAt);
  if (retainPlan.action === "delete") {
    assertPrintOrderRetained(await persistPrintOrderRecord(sessionId, hydrated));
  }

  const attempts = (hydrated.attempts ?? 0) + 1;
  const now = Date.now();

  if (isPrintfulConfigured()) {
    const printful = await submitPrintfulOrder({
      externalId: sessionId,
      variant: hydrated.printVariant,
      fileUrl: printAssetUrl,
      recipient,
      additionalVariants: hydrated.includesCardAddOn ? ["card_4x6"] : undefined,
      variantFileUrls: cardPrintAssetUrl ? { card_4x6: cardPrintAssetUrl } : undefined,
    });
    if (!printful.ok) {
      const failed = await persistFailedPrintOrder({
        ...hydrated,
        attempts,
        printAssetUrl,
        webhookStatus: printful.status,
        error: printful.error ?? "printful_order_failed",
      });
      return NextResponse.json({ ok: false, error: failed.error, order: sanitizePrintOrderForOperatorResponse(failed) }, { status: 502 });
    }
    let sent: PrintOrderRecord = {
      ...hydrated,
      status: "sent" as const,
      attempts,
      printAssetUrl,
      cardPrintAssetUrl,
      webhookStatus: printful.status,
      printfulOrderId: printful.orderId,
      sentAt: now,
      error: undefined,
    };
    const {
      identityPersist: sentPersist,
      record: reviewed,
      bindOk,
      bindBlockedByTerminal,
      bindFailureReason,
    } = await bindAcceptedPrintfulIdentityThenReview({
      sessionId,
      sentRecord: sent,
      existingKv: hydrated,
    });
    sent = reviewed;
    if (sentPersist?.outcome === "deleted_unretainable") {
      return NextResponse.json(
        {
          ok: false,
          error: "print_order_unretainable",
          reason: sentPersist.reason,
          providerAccepted: true,
          printfulOrderId: sent.printfulOrderId ?? null,
        },
        { status: 409 },
      );
    }
    if (!bindOk || bindBlockedByTerminal || bindFailureReason) {
      return NextResponse.json(
        {
          ok: false,
          error: bindFailureReason ?? "terminal_failed_blocks_sent_mirror",
          providerAccepted: true,
          printfulOrderId: sent.printfulOrderId ?? null,
        },
        { status: bindFailureReason === "authority_unread" ? 503 : 409 },
      );
    }
    if (sentPersist?.outcome === "rejected_terminal_failure") {
      return NextResponse.json(
        {
          ok: false,
          error: "terminal_failed_blocks_sent_mirror",
          providerAccepted: true,
          printfulOrderId: sent.printfulOrderId ?? null,
        },
        { status: 409 },
      );
    }
    void sendPrintOrderConfirmation(sessionId).catch((error) => {
      console.warn("Print confirmation email failed after retry", { sessionId, error });
    });
    return NextResponse.json({ ok: true, status: "sent", order: sanitizePrintOrderForOperatorResponse(sent) });
  }

  let webhookResponse: Response;
  try {
    webhookResponse = await fetch(printFulfillmentWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildAlternateFulfillmentWebhookPayload(hydrated, {
          printAssetUrl,
          cardPrintAssetUrl,
          recipient,
        }),
      ),
    });
    if (!webhookResponse.ok) {
      const body = await webhookResponse.text().catch(() => "");
      throw new Error(`Webhook ${webhookResponse.status}: ${body.slice(0, 280)}`);
    }
  } catch (error) {
    // Restrict this catch to outbound fulfillment failures only.
    if (isDurableKvPersistenceError(error) || isPrintOrderUnretainableError(error)) throw error;
    const failed = await persistFailedPrintOrder({
      ...hydrated,
      attempts,
      printAssetUrl,
      error: error instanceof Error ? error.message.slice(0, 320) : "webhook_failed",
    });
    return NextResponse.json({ ok: false, error: failed.error, order: sanitizePrintOrderForOperatorResponse(failed) }, { status: 502 });
  }

  const sent = {
    ...hydrated,
    status: "sent" as const,
    attempts,
    printAssetUrl,
    webhookStatus: webhookResponse.status,
    sentAt: now,
    error: undefined,
  };
  // Successful external side effect: durable state write stays outside the outbound
  // catch so KV failures cannot be rewritten as webhook failures.
  assertPrintOrderRetained(await persistPrintOrderRecord(sessionId, sent));
  return NextResponse.json({ ok: true, status: "sent", order: sanitizePrintOrderForOperatorResponse(sent) });
}
