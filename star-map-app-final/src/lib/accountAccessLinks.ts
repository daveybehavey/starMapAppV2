import { kv } from "@/lib/kv";
import {
  ENTITLEMENT_KV,
  evaluateDigitalAccess,
  NEW_CLAIM_TOKEN_TTL_SECONDS,
  type ClaimTokenRecord,
  type StripeSessionEntitlement,
} from "@/lib/entitlementsStore";
import type { CheckoutPlan } from "@/lib/pricing";

export type AccountAccessSessionRecord = StripeSessionEntitlement;

export { evaluateDigitalAccess as hasRecoverableAccess };

const sessionKey = ENTITLEMENT_KV.stripeSession;
const claimKey = ENTITLEMENT_KV.claim;

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
    const existing = await kv.get<ClaimTokenRecord>(claimKey(token));
    if (!existing || existing.sessionId !== sessionId) {
      token = "";
    }
  }

  if (!token) {
    token = crypto.randomUUID();
    const claim: ClaimTokenRecord = {
      sessionId,
      mapId: record.mapId,
      createdAt: Date.now(),
    };
    await kv.set(claimKey(token), claim, { ex: NEW_CLAIM_TOKEN_TTL_SECONDS });
    await kv.set(sessionKey(sessionId), {
      ...record,
      claimToken: token,
    });
  }

  return token;
}
