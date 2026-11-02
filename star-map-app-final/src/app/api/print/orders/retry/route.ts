import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { isDurableKvPersistenceError, kv } from "@/lib/kv";
import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";
import { isPrintfulConfigured, submitPrintfulOrder } from "@/lib/printful";
import { evaluatePrintMarginForPaidOrder } from "@/lib/printMargin";
import {
  alternateDispatchBlocksRedispatch,
  alternateFulfillmentDispatchId,
  assertPrintOrderRetained,
  buildAlternateFulfillmentWebhookPayload,
  buildPrintAssetUrl,
  extractCheckoutPhoneFromStripeSession,
  getPrintMinChargeCents,
  getPrintRecipient,
  hasSufficientPrintCharge,
  isPrintOrderUnretainableError,
  isValidPrintCheckoutSessionId,
  isLegacyAmbiguousPrintOrderFailure,
  persistPrintOrderRecord,
  printOrderKey,
  resolvePrintOrderKvWrite,
  sanitizePrintOrderForOperatorResponse,
  type PrintOrderRecord,
} from "@/lib/printOrders";
import { sendPrintOrderApprovalAlert, sendPrintOrderFailureAlert } from "@/lib/printOrderAlerts";
import { bindAcceptedPrintfulIdentityThenReview } from "@/lib/printFulfillmentPostSubmit";
import { evaluatePrintRetryPaymentGate } from "@/lib/checkoutPromotions";
import { extendPrintAssetTtlForFulfillment } from "@/lib/printAssetFulfillment";
import { sendPrintOrderConfirmation } from "@/lib/printOrderConfirmation";
import {
  claimAlternateFulfillmentDispatch,
  getPrintOrderAuthorityState,
  projectPrintOrderWithAuthority,
  seedPrintOrderAuthorityFromKv,
} from "@/lib/printOrderAuthority";
import { setPrintFulfillmentIndex } from "@/lib/printFulfillmentIndex";

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
    // S96 follow-up F-1: the Stripe retrieve above is a long await — an
    // operator resolve (or another completion) can land while it is in
    // flight. Persisting the handler-start snapshot here would revert
    // that resolve in KV (status, provider ID, and resolve stamps
    // erased) inside the very pass that is about to re-check authority.
    // Apply the #497 pattern instead: re-read the latest record, merge
    // ONLY the recipient fields this function owns onto it (the latest
    // record owns every other field, hold annotations included — the
    // bidirectional-sync lesson of PR #497 R5b), and refuse the persist
    // entirely when the record has advanced past the snapshot (resolve,
    // sent, or a newly bound provider ID). On refusal the latest record
    // is returned untouched and the caller's pre-dispatch authority
    // re-read stands the pass down before any provider submission.
    const latest = await kv.get<PrintOrderRecord>(printOrderKey(existing.sessionId));
    if (!latest) return existing;
    const advancedPastSnapshot =
      Boolean(latest.operatorResolvedAt) ||
      latest.status === "sent" ||
      latest.status !== existing.status ||
      Boolean(
        latest.printfulOrderId &&
          String(latest.printfulOrderId) !== String(existing.printfulOrderId ?? ""),
      );
    if (advancedPastSnapshot) return latest;
    const updated: PrintOrderRecord = {
      ...latest,
      amountTotal:
        typeof session.amount_total === "number" && Number.isFinite(session.amount_total)
          ? session.amount_total
          : latest.amountTotal ?? null,
      currency: session.currency ?? latest.currency ?? null,
      customerEmail: session.customer_details?.email ?? session.customer_email ?? latest.customerEmail ?? null,
      customerName: session.customer_details?.name ?? latest.customerName ?? null,
      customerPhone: extractCheckoutPhoneFromStripeSession(session) ?? latest.customerPhone ?? null,
      shippingDetails: extractShippingDetails(session) ?? latest.shippingDetails ?? null,
    };
    if (
      updated.customerEmail !== latest.customerEmail ||
      updated.customerName !== latest.customerName ||
      updated.customerPhone !== latest.customerPhone ||
      JSON.stringify(updated.shippingDetails) !== JSON.stringify(latest.shippingDetails)
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
      // Ordinary/nonterminal failure — never inherit a stale terminal marker.
      terminalEventType: null,
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

  // DO-first: authority presence with missing KV must never resubmit to Printful.
  let authority = await getPrintOrderAuthorityState(sessionId);
  const existing = await kv.get<PrintOrderRecord>(printOrderKey(sessionId));

  if (!authority) {
    return NextResponse.json(
      { ok: false, error: "print_order_authority_unread" },
      { status: 503 },
    );
  }

  // AG-086: legacy failed mirrors (absent terminalEventType) fail closed while DO
  // is revision-zero/uninitialized — do not seed terminal and do not resubmit.
  if (authority.revision === 0 && isLegacyAmbiguousPrintOrderFailure(existing)) {
    const legacyOrder = existing
      ? sanitizePrintOrderForOperatorResponse(existing)
      : null;
    return NextResponse.json(
      {
        ok: false,
        error: "reconciliation_required",
        reason: "legacy_failure_provenance_unknown",
        order: legacyOrder,
      },
      { status: 409 },
    );
  }

  if (authority.revision === 0 && existing) {
    await seedPrintOrderAuthorityFromKv(sessionId, existing);
    authority = await getPrintOrderAuthorityState(sessionId);
  }

  if (!authority) {
    return NextResponse.json(
      { ok: false, error: "print_order_authority_unread" },
      { status: 503 },
    );
  }

  // S96 follow-up F-1: the lifecycle snapshot this pass was admitted on.
  // The payment gate and recipient hydration below suspend on long
  // awaits, so admission-time checks cannot speak for dispatch time —
  // standDownIfFulfillmentMoved re-reads against this baseline.
  const passStartedClaim = authority.alternateDispatchClaim ?? null;

  if (!existing) {
    if (authority.revision > 0 || authority.lifecycle !== "unbound") {
      return NextResponse.json(
        {
          ok: false,
          error: "reconciliation_required",
          reason: "projection_missing",
          authority: {
            lifecycle: authority.lifecycle,
            revision: authority.revision,
            printfulOrderId: authority.printfulOrderId,
          },
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, error: "Print order not found" }, { status: 404 });
  }

  if (authority.lifecycle === "terminal_failed") {
    return NextResponse.json(
      {
        ok: false,
        error: "terminal_failed_requires_operator_recover",
        order: sanitizePrintOrderForOperatorResponse(projectPrintOrderWithAuthority(existing, authority)),
      },
      { status: 409 },
    );
  }
  if (
    (authority.lifecycle === "bound" || authority.lifecycle === "operator_recovered") &&
    authority.printfulOrderId
  ) {
    // DO provider id is authoritative; repair stale KV/index before acknowledging.
    // Includes operator_recovered so a stale KV failed/pending cannot trigger resubmit.
    const boundOrder = projectPrintOrderWithAuthority(existing, authority);
    assertPrintOrderRetained(
      await persistPrintOrderRecord(sessionId, boundOrder, { allowClearTerminalFailure: true }),
    );
    await setPrintFulfillmentIndex(authority.printfulOrderId, sessionId);
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

  // S96 follow-up F-1: re-read the authority AND the KV record before
  // any dispatch decision is acted on. The checks at the top of this
  // handler all ran before the long awaits below (Stripe payment gate,
  // recipient hydration); an operator resolve landing during those
  // awaits moves the authority to bound/operator_recovered (or writes
  // the resolved KV mirror — a resolve with no provider ID can leave
  // the authority lifecycle unbound, so the KV mirror must be checked
  // too) and the resolve route never calls Printful, so Printful-side
  // idempotency (external_id = sessionId) cannot reconcile the manual
  // order: submitting anyway would create a SECOND confirmed physical
  // order. Stand down with this route's existing postures: bound
  // repair for a bound/recovered authority carrying a provider ID,
  // the terminal 409, otherwise a reconciliation 409. A null return
  // means nothing fulfilment-relevant moved and the pass may proceed.
  // This narrows the window to the accepted final-read doctrine; it
  // does not claim an atomic guarantee against a resolve landing
  // between this re-read and the provider call itself.
  const standDownIfFulfillmentMoved = async (): Promise<NextResponse | null> => {
    const freshAuthority = await getPrintOrderAuthorityState(sessionId);
    if (!freshAuthority) {
      return NextResponse.json(
        { ok: false, error: "print_order_authority_unread" },
        { status: 503 },
      );
    }
    const freshExisting = await kv.get<PrintOrderRecord>(printOrderKey(sessionId));
    const freshClaim = freshAuthority.alternateDispatchClaim ?? null;
    const claimMoved = Boolean(
      freshClaim &&
        (!passStartedClaim ||
          freshClaim.dispatchId !== passStartedClaim.dispatchId ||
          freshClaim.claimedAt !== passStartedClaim.claimedAt),
    );
    // Cycle-2 evidence: passStartedClaim is not a reliable admission
    // baseline in every interleave. When this pass's FIRST KV read (of
    // `existing`, above) is parked mid-read, the authority seeding
    // re-read that follows its resume already carries a concurrent
    // winner's claim, so the fresh claim ends up compared against
    // itself and claimMoved stays false even though the winner claimed
    // during this pass. The admission KV snapshot does predate the
    // winner — its value was computed before the parked read resumed:
    // a fresh alternateDispatch marker in the "accepted" state that
    // the admission snapshot does not carry (or carries with a
    // different identity/state) can only have been written by the
    // alternate dispatch that won during this pass.
    const freshAlternateDispatch = freshExisting?.alternateDispatch ?? null;
    const admissionAlternateDispatch = existing.alternateDispatch ?? null;
    const alternateDispatchMoved = Boolean(
      freshAlternateDispatch &&
        freshAlternateDispatch.state === "accepted" &&
        (!admissionAlternateDispatch ||
          admissionAlternateDispatch.dispatchId !== freshAlternateDispatch.dispatchId ||
          admissionAlternateDispatch.state !== freshAlternateDispatch.state),
    );
    const lifecycleMoved =
      freshAuthority.lifecycle === "terminal_failed" ||
      freshAuthority.lifecycle === "bound" ||
      freshAuthority.lifecycle === "operator_recovered" ||
      Boolean(freshAuthority.printfulOrderId);
    const kvMoved = Boolean(
      freshExisting &&
        (freshExisting.operatorResolvedAt ||
          freshExisting.status === "sent" ||
          (freshExisting.printfulOrderId &&
            String(freshExisting.printfulOrderId) !== String(existing.printfulOrderId ?? ""))),
    );
    if (!lifecycleMoved && !kvMoved && !claimMoved && !alternateDispatchMoved) return null;

    const latestRecord = freshExisting ?? existing;
    if (freshAuthority.lifecycle === "terminal_failed") {
      return NextResponse.json(
        {
          ok: false,
          error: "terminal_failed_requires_operator_recover",
          order: sanitizePrintOrderForOperatorResponse(
            projectPrintOrderWithAuthority(latestRecord, freshAuthority),
          ),
        },
        { status: 409 },
      );
    }
    if (
      (freshAuthority.lifecycle === "bound" ||
        freshAuthority.lifecycle === "operator_recovered") &&
      freshAuthority.printfulOrderId &&
      freshExisting
    ) {
      // Same bound-repair posture as the admission-time check, but
      // projected onto the FRESH record so the repair cannot revert
      // the resolve (or anything else) that landed mid-pass.
      const boundOrder = projectPrintOrderWithAuthority(freshExisting, freshAuthority);
      assertPrintOrderRetained(
        await persistPrintOrderRecord(sessionId, boundOrder, { allowClearTerminalFailure: true }),
      );
      await setPrintFulfillmentIndex(freshAuthority.printfulOrderId, sessionId);
      void sendPrintOrderConfirmation(sessionId).catch((error) => {
        console.warn("Print confirmation email failed on moved-authority retry stand-down", { sessionId, error });
      });
      return NextResponse.json({
        ok: true,
        status: "already_bound",
        order: sanitizePrintOrderForOperatorResponse(boundOrder),
      });
    }
    if (claimMoved || alternateDispatchMoved) {
      return NextResponse.json(
        {
          ok: false,
          error: "alternate_dispatch_reconciliation_required",
          reason: "alternate_dispatch_claimed_during_retry",
          dispatchId: alternateFulfillmentDispatchId(sessionId),
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: "reconciliation_required",
        reason: claimMoved
          ? "alternate_dispatch_claimed_during_retry"
          : "operator_resolved_during_retry",
        order: sanitizePrintOrderForOperatorResponse(latestRecord),
      },
      { status: 409 },
    );
  };

  // Payment gate (parity with the webhook fulfillment pass): this path must
  // never submit an order whose checkout payment failed or never settled.
  // The persisted record carries no payment state, and a record finalized by
  // async_payment_failed (terminalEventType explicitly null) yields no
  // authority terminal evidence, so neither the lifecycle checks above nor
  // the amount/margin checks below can catch it. Verify against the live
  // session with the webhook's own predicate; fail closed, mutate nothing.
  const paymentGate = await evaluatePrintRetryPaymentGate({
    sessionId,
    retrieveSession: async (id) => {
      if (!stripe) return null;
      try {
        return await stripe.checkout.sessions.retrieve(id, {
          expand: ["total_details.breakdown"],
        });
      } catch {
        return null;
      }
    },
  });
  if (!paymentGate.allowed) {
    if (paymentGate.reason === "payment_not_fulfillable") {
      console.warn("print_retry_blocked_payment_not_fulfillable", { sessionId });
      return NextResponse.json(
        {
          ok: false,
          error: paymentGate.reason,
          order: sanitizePrintOrderForOperatorResponse(existing),
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { ok: false, error: paymentGate.reason },
      { status: 503 },
    );
  }

  const hydrated = await hydrateOrderRecipientData(existing);

  // F-1: a resolve that landed during the payment gate or hydration
  // stands the pass down here, before any failure persist or dispatch
  // below can act on (or overwrite) the stale snapshot.
  const movedAfterHydration = await standDownIfFulfillmentMoved();
  if (movedAfterHydration) return movedAfterHydration;

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
    currency: hydrated.currency ?? null,
    includesSecondCopy: hydrated.includesSecondCopy,
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

  // F-1: final authority/KV re-read immediately before the provider
  // submission — this is the read that decides dispatch. A resolve
  // landing at any earlier point of this pass (payment gate, hydration,
  // TTL extends) aborts the dispatch instead of duplicating the order.
  const movedBeforeDispatch = await standDownIfFulfillmentMoved();
  if (movedBeforeDispatch) return movedBeforeDispatch;

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
      // Lever A: replay the recorded quantity — a retried copy order
      // must not silently ship one copy.
      mainItemQuantity: hydrated.includesSecondCopy ? 2 : 1,
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
      terminalEventType: null,
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

  // S94-1 F9: replay-safe dispatch to the alternate destination (see
  // AlternateFulfillmentDispatch in printOrders). A prior attempt whose
  // outcome was never durably resolved refuses redispatch outright —
  // the receiver may already hold this order. Gate fix round 2
  // (PR #477): a legacy "rejected" marker refuses identically — it
  // encodes an ambiguous response, not a proven refusal. Gate fix
  // round 3: ANY present marker refuses, including one whose
  // persisted state is missing or unrecognized (fail closed) —
  // dispatch happens only when no marker exists.
  const dispatchId = alternateFulfillmentDispatchId(sessionId);
  if (alternateDispatchBlocksRedispatch(hydrated.alternateDispatch)) {
    return NextResponse.json(
      { ok: false, error: "alternate_dispatch_reconciliation_required", dispatchId },
      { status: 409 },
    );
  }
  // S96-1 F2: the marker check above is check-then-write — a concurrent
  // webhook delivery that read the same markerless record would also
  // pass it. Win the atomic claim in the print-order authority first
  // (authority was seeded from the stored record above, so a pre-claim
  // KV marker already stands as a claim): exactly one concurrent
  // caller dispatches; the loser reconciles. Authority unread fails
  // closed — no claim, no dispatch.
  const claim = await claimAlternateFulfillmentDispatch(sessionId, dispatchId);
  if (!claim.ok) {
    if (claim.reason === "terminal_blocks_claim") {
      return NextResponse.json(
        { ok: false, error: "terminal_failed_requires_operator_recover", dispatchId },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "print_order_authority_unread", dispatchId },
      { status: 503 },
    );
  }
  if (!claim.claimAcquired) {
    return NextResponse.json(
      { ok: false, error: "alternate_dispatch_reconciliation_required", dispatchId },
      { status: 409 },
    );
  }
  const dispatchAttempted: PrintOrderRecord = {
    ...hydrated,
    attempts,
    printAssetUrl,
    alternateDispatch: { dispatchId, state: "attempted", attemptedAt: now },
  };
  // The attempt marker must be durable BEFORE the outbound side effect;
  // if it cannot be retained, fail closed and never dispatch.
  assertPrintOrderRetained(await persistPrintOrderRecord(sessionId, dispatchAttempted));

  let webhookResponse: Response;
  try {
    webhookResponse = await fetch(printFulfillmentWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": dispatchId },
      body: JSON.stringify(
        buildAlternateFulfillmentWebhookPayload(dispatchAttempted, {
          printAssetUrl,
          cardPrintAssetUrl,
          recipient,
        }),
      ),
    });
  } catch (error) {
    // Restrict this catch to outbound fulfillment failures only.
    if (isDurableKvPersistenceError(error) || isPrintOrderUnretainableError(error)) throw error;
    // The dispatch outcome is unknown (no response): the marker stays
    // "attempted", so the next retry refuses instead of redispatching.
    const failed = await persistFailedPrintOrder({
      ...dispatchAttempted,
      attempts,
      printAssetUrl,
      error: error instanceof Error ? error.message.slice(0, 320) : "webhook_failed",
    });
    return NextResponse.json({ ok: false, error: failed.error, order: sanitizePrintOrderForOperatorResponse(failed) }, { status: 502 });
  }

  if (!webhookResponse.ok) {
    // Gate fix round 1 (Codex P1-C on PR #477): a non-2xx answer
    // does NOT prove the receiver rejected the dispatch — the
    // receiver may have created the order before failing, or an
    // intermediary may have answered after the receiver accepted.
    // No status is provably a rejection (the receiver's contract
    // defines none, and receiver-side idempotency is optional), so
    // the attempt stays "attempted": the response facts are recorded
    // for the operator, and a later retry refuses with
    // alternate_dispatch_reconciliation_required instead of risking
    // a duplicate physical order.
    const body = await webhookResponse.text().catch(() => "");
    const failed = await persistFailedPrintOrder({
      ...dispatchAttempted,
      attempts,
      printAssetUrl,
      webhookStatus: webhookResponse.status,
      alternateDispatch: {
        dispatchId,
        state: "attempted",
        attemptedAt: now,
        respondedAt: Date.now(),
        httpStatus: webhookResponse.status,
      },
      error: `Webhook ${webhookResponse.status}: ${body.slice(0, 280)}`.slice(0, 320),
    });
    return NextResponse.json({ ok: false, error: failed.error, order: sanitizePrintOrderForOperatorResponse(failed) }, { status: 502 });
  }

  const sent = {
    ...dispatchAttempted,
    status: "sent" as const,
    attempts,
    printAssetUrl,
    webhookStatus: webhookResponse.status,
    sentAt: now,
    error: undefined,
    terminalEventType: null,
    alternateDispatch: {
      dispatchId,
      state: "accepted" as const,
      attemptedAt: now,
      respondedAt: Date.now(),
      httpStatus: webhookResponse.status,
    },
  };
  // Successful external side effect: durable state write stays outside the outbound
  // catch so KV failures cannot be rewritten as webhook failures.
  assertPrintOrderRetained(await persistPrintOrderRecord(sessionId, sent));
  return NextResponse.json({ ok: true, status: "sent", order: sanitizePrintOrderForOperatorResponse(sent) });
}
