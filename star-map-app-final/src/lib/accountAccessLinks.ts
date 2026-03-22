import { kv } from "@/lib/kv";
import { PREMIUM_COOKIE_TTL_SECONDS } from "@/lib/premium";
import type { CheckoutOrderType, CheckoutPlan, PrintVariant } from "@/lib/pricing";

const CLAIM_TOKEN_TTL_SECONDS = PREMIUM_COOKIE_TTL_SECONDS;

type ClaimRecord = {
  sessionId: string;
  mapId?: string;
  createdAt: number;
};

export type AccountAccessSessionRecord = {
  paid?: boolean;
  revoked?: boolean;
  created?: number;
  mapId?: string;
  plan?: CheckoutPlan;
  creditsRemaining?: number;
  subscriptionActive?: boolean;
  orderType?: CheckoutOrderType;
  printVariant?: PrintVariant;
  includesDigitalAddOn?: boolean;
  customerEmail?: string | null;
  claimToken?: string;
};

const sessionKey = (id: string) => `stripe:session:${id}`;
const claimKey = (token: string) => `claim:${token}`;

export function hasRecoverableAccess(record: AccountAccessSessionRecord) {
  if (record.revoked) return false;
  const isPrintOnly = record.orderType === "print" && !record.includesDigitalAddOn;
  if (isPrintOnly) return false;
  if (record.plan === "subscription") return Boolean(record.subscriptionActive);
  const creditsRemaining = typeof record.creditsRemaining === "number" ? record.creditsRemaining : 0;
  return creditsRemaining > 0 || Boolean(record.paid);
}

export function getOfferLabel(record: AccountAccessSessionRecord, fallbackPlan: CheckoutPlan | undefined) {
  if (record.orderType === "print") {
    const printLabel = record.printVariant === "poster_framed" ? "Framed print order" : "Unframed print order";
    return record.includesDigitalAddOn ? `${printLabel} + HD add-on` : printLabel;
  }
  const plan = record.plan ?? fallbackPlan;
  if (plan === "pack3") return "3 HD export credits";
  if (plan === "subscription") return "Unlimited HD plan";
  return "Single HD download";
}

export async function getOrCreateClaimToken(sessionId: string, record: AccountAccessSessionRecord) {
  let token = record.claimToken?.trim() || "";
  if (token) {
    const existing = await kv.get<ClaimRecord>(claimKey(token));
    if (!existing || existing.sessionId !== sessionId) {
      token = "";
    }
  }

  if (!token) {
    token = crypto.randomUUID();
    const claim: ClaimRecord = {
      sessionId,
      mapId: record.mapId,
      createdAt: Date.now(),
    };
    await kv.set(claimKey(token), claim, { ex: CLAIM_TOKEN_TTL_SECONDS });
    await kv.set(sessionKey(sessionId), {
      ...record,
      claimToken: token,
    });
  }

  return token;
}
