import { NextRequest, NextResponse } from "next/server";
import { hasValidAdminToken, readAdminTokenFromHeaders } from "@/lib/adminAuth";
import { ENTITLEMENT_KV, type StripeSessionEntitlement } from "@/lib/entitlementsStore";
import { isResendConfigured } from "@/lib/resend";
import { isValidPrintCheckoutSessionId, printOrderKey, type PrintOrderRecord } from "@/lib/printOrders";
import { normalizePromotionEmail } from "@/lib/promotionSubscriptions";
import { buildReviewOptOutUrl, buildReviewRequestEmail } from "@/lib/reviewRequestEmail";
import { createReviewLedgerClient } from "@/lib/reviewRequestLedger";
import {
  classifyDigitalEntitlement,
  classifyPrintRecord,
  resolveReviewEngineConfig,
  type ReviewClassification,
} from "@/lib/reviewRequests";
import { createWrapperKvScanStore } from "@/lib/reviewRequestRuntime";

export const runtime = "nodejs";

/**
 * Admin-only DRY-RUN proof surface for the review-request engine (T1).
 *
 *   POST /api/reviews/proof
 *   Authorization: Bearer <PRINT_ADMIN_TOKEN>
 *   { "sessionId": "cs_live_...", "render": true }
 *
 * Evaluates one session against the real due-evaluation + gate logic and
 * reports the classification, the activation-gate state, and the ledger
 * state. With "render": true it also returns the email that WOULD be built.
 *
 * It NEVER claims, NEVER sends, and NEVER writes state (Step-0 Codex
 * critique, P1): a proof must not be the send pipeline. The live §9 proof
 * (a real send to the owner's own order) is a separate, owner-gated step.
 * Output is minimized (critique P3.4): no recipient address, no tokens;
 * rendered content only on the explicit "render" flag.
 */

function requireAdmin(req: NextRequest) {
  const configured = process.env.PRINT_ADMIN_TOKEN?.trim() || "";
  const candidate = readAdminTokenFromHeaders(req.headers);
  return hasValidAdminToken(candidate, configured);
}

function classificationForReport(classification: ReviewClassification) {
  if (classification.outcome === "due") {
    return {
      outcome: "due" as const,
      kind: classification.kind,
      anchorAt: classification.anchorAt,
      dueAt: classification.dueAt,
      emailPresent: true,
    };
  }
  return {
    outcome: classification.outcome,
    kind: classification.kind,
    reason: classification.reason,
    emailPresent: false,
  };
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  let payload: { sessionId?: unknown; render?: unknown } | null = null;
  try {
    payload = (await req.json()) as { sessionId?: unknown; render?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId.trim() : "";
  if (!isValidPrintCheckoutSessionId(sessionId)) {
    return NextResponse.json(
      { ok: false, error: "invalid_session_id" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const wantRender = payload?.render === true;

  const store = createWrapperKvScanStore();
  const config = resolveReviewEngineConfig(process.env, {
    resendConfigured: isResendConfigured(),
  });
  const now = Date.now();

  const entitlement = await store.getJson<StripeSessionEntitlement>(
    ENTITLEMENT_KV.stripeSession(sessionId),
  );
  const printRecord = await store.getJson<PrintOrderRecord>(printOrderKey(sessionId));

  const digital = classifyDigitalEntitlement(entitlement, now);
  const physical = classifyPrintRecord(printRecord, now, config.physicalEnabled);

  const ledgerState = await createReviewLedgerClient()
    .getState(sessionId)
    .catch(() => null);

  let rendered: { subject: string; text: string; html: string } | { unavailable: string } | undefined;
  if (wantRender) {
    const due = digital.outcome === "due" ? digital : physical.outcome === "due" ? physical : null;
    if (!due) {
      rendered = { unavailable: "session_not_due" };
    } else if (!config.mailingAddress) {
      rendered = { unavailable: "mailing_address_missing" };
    } else if (!config.signingSecret) {
      rendered = { unavailable: "signing_secret_missing" };
    } else {
      const built = buildReviewRequestEmail({
        kind: due.kind,
        siteUrl: config.siteUrl,
        supportEmail: config.supportEmail,
        mailingAddress: config.mailingAddress,
        optOutUrl: buildReviewOptOutUrl(
          config.siteUrl,
          normalizePromotionEmail(due.email),
          config.signingSecret,
        ),
      });
      rendered = { subject: built.subject, text: built.text, html: built.html };
    }
  }

  return NextResponse.json(
    {
      ok: true,
      dryRun: true,
      note: "Evaluation only — no claim was made, nothing was sent, no state was written.",
      sessionId,
      gates: {
        engineEnabled: config.enabled,
        physicalEnabled: config.physicalEnabled,
        mailingAddressPresent: Boolean(config.mailingAddress),
        signingSecretPresent: Boolean(config.signingSecret),
        resendConfigured: config.resendConfigured,
      },
      digital: classificationForReport(digital),
      physical: classificationForReport(physical),
      ledger: ledgerState
        ? {
            status: ledgerState.status,
            attempts: ledgerState.attempts,
            kind: ledgerState.kind,
            sentAt: ledgerState.sentAt,
          }
        : "unavailable",
      ...(rendered ? { rendered } : {}),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
