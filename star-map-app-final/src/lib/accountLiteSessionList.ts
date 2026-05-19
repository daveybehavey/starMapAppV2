import { getAccountLiteEmailSessions, normalizeAccountLiteEmail } from "@/lib/accountLite";
import { kv } from "@/lib/kv";
import type { CheckoutPlan } from "@/lib/pricing";
import {
  getOfferLabel,
  getOrCreateClaimToken,
  hasRecoverableAccess,
  type AccountAccessSessionRecord,
} from "@/lib/accountAccessLinks";

export type AccountLiteSessionListItem = {
  sessionId: string;
  createdAt: number;
  label: string;
  orderType: "digital" | "print";
  printVariant: "poster_framed" | "poster_unframed" | null;
  plan: CheckoutPlan | null;
  hasMapId: boolean;
  downloadUrl: string | null;
  creditsRemaining: number | null;
  subscriptionActive: boolean;
};

export type AccountLitePremiumSummary = {
  paid: boolean;
  plan: CheckoutPlan | null;
  orderType?: "digital" | "print";
  creditsRemaining: number | null;
  subscriptionActive: boolean | null;
};

const stripeSessionKey = (id: string) => `stripe:session:${id}`;

function sessionRecordLooksPaid(record: AccountAccessSessionRecord | null | undefined): boolean {
  if (!record || record.revoked) return false;
  const subscriptionActive = Boolean(record.subscriptionActive);
  const creditsRemaining = record.creditsRemaining ?? 0;
  const hasCredits = creditsRemaining > 0;
  const isPrintOnly = record.orderType === "print" && !record.includesDigitalAddOn;
  if (isPrintOnly) return false;
  return hasCredits || (record.plan === "subscription" ? subscriptionActive : Boolean(record.paid));
}

function rankPlan(plan: CheckoutPlan | null | undefined): number {
  if (plan === "subscription") return 3;
  if (plan === "pack3") return 2;
  if (plan === "single") return 1;
  return 0;
}

function pickBetterPlan(current: CheckoutPlan | null, next: CheckoutPlan | null): CheckoutPlan | null {
  if (!next) return current;
  if (!current) return next;
  return rankPlan(next) > rankPlan(current) ? next : current;
}

/**
 * Lists recoverable checkout sessions for a normalized account email (same shape as `/api/account/my-sessions`).
 */
export async function listAccountLiteSessionsForEmail(
  email: string,
  origin: string,
): Promise<{ sessions: AccountLiteSessionListItem[]; premium: AccountLitePremiumSummary }> {
  const normalized = normalizeAccountLiteEmail(email);
  const premium: AccountLitePremiumSummary = {
    paid: false,
    plan: null,
    orderType: undefined,
    creditsRemaining: null,
    subscriptionActive: null,
  };

  if (!normalized) {
    return { sessions: [], premium };
  }

  const lookup = await getAccountLiteEmailSessions(normalized);
  if (!lookup?.sessions?.length) {
    return { sessions: [], premium };
  }

  const items: AccountLiteSessionListItem[] = [];
  let maxCredits = 0;

  for (const indexed of lookup.sessions.slice(0, 20)) {
    if (!indexed?.sessionId) continue;
    const current = await kv.get<AccountAccessSessionRecord>(stripeSessionKey(indexed.sessionId));
    if (!current) continue;
    const currentEmail = normalizeAccountLiteEmail(current.customerEmail);
    if (currentEmail && currentEmail !== normalized) continue;

    if (sessionRecordLooksPaid(current)) {
      premium.paid = true;
    }

    const plan =
      current.plan === "single" || current.plan === "pack3" || current.plan === "subscription"
        ? current.plan
        : null;
    premium.plan = pickBetterPlan(premium.plan, plan);
    if (plan) {
      premium.orderType = current.orderType === "print" ? "print" : "digital";
    }

    if (typeof current.creditsRemaining === "number" && Number.isFinite(current.creditsRemaining)) {
      maxCredits = Math.max(maxCredits, current.creditsRemaining);
    }

    const label = getOfferLabel(current, indexed.plan);
    let downloadUrl: string | null = null;
    if (hasRecoverableAccess(current)) {
      const token = await getOrCreateClaimToken(indexed.sessionId, current);
      downloadUrl = `${origin}/download?token=${encodeURIComponent(token)}`;
    }
    items.push({
      sessionId: indexed.sessionId,
      createdAt:
        typeof indexed.createdAt === "number" && Number.isFinite(indexed.createdAt)
          ? indexed.createdAt
          : typeof current.created === "number"
            ? current.created
            : Date.now(),
      label,
      orderType: current.orderType === "print" ? "print" : "digital",
      printVariant:
        current.printVariant === "poster_framed" || current.printVariant === "poster_unframed"
          ? current.printVariant
          : null,
      plan,
      hasMapId: Boolean(current.mapId && String(current.mapId).trim()),
      downloadUrl,
      creditsRemaining: typeof current.creditsRemaining === "number" ? current.creditsRemaining : null,
      subscriptionActive: Boolean(current.subscriptionActive),
    });
  }

  premium.subscriptionActive = items.some((s) => s.subscriptionActive) ? true : null;
  if (premium.plan === "subscription") {
    premium.creditsRemaining = null;
  } else if (maxCredits > 0) {
    premium.creditsRemaining = maxCredits;
  }

  return { sessions: items, premium };
}
