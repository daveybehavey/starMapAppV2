import { kv } from "@/lib/kv";
import {
  ENTITLEMENT_KV,
  evaluateDigitalAccess,
  NEW_CLAIM_TOKEN_TTL_SECONDS,
  SETTLEMENT_SCHEMA_VERSION,
  type ClaimPointerRecord,
  type ClaimTokenRecord,
  type StripeSessionEntitlement,
} from "@/lib/entitlementsStore";
import type { CheckoutPlan } from "@/lib/pricing";

export type AccountAccessSessionRecord = StripeSessionEntitlement;

export { evaluateDigitalAccess as hasRecoverableAccess };

const claimKey = ENTITLEMENT_KV.claim;
const claimPointerKey = ENTITLEMENT_KV.claimPointer;

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

/**
 * Resolve the governing claim token for a session, issuing one if needed.
 *
 * Fix round 4 (G-dot gate, PR #447; the S60-1 M2-02 closure pattern): this
 * function performs ZERO writes to the session record. The pre-fix shape
 * persisted a fresh token by replacing the whole caller-held session
 * snapshot (`{ ...record, claimToken }`), which could republish stale
 * accounting over a landed consumption or revocation — sequentially, no
 * concurrency required.
 *
 * Token state now lives in two non-accounting records:
 * - the claim record itself (`claim:${token}` → { sessionId, mapId }), and
 * - the governing-token pointer (`stripe:session:claim-pointer:v1:`),
 *   which is what the claim route honors. The pointer replaces the session
 *   record's inline `claimToken` field as the token's home: that field is
 *   legacy evidence only (existing records keep it; it is still honored
 *   as a reuse hint and as the claim route's fallback when no pointer
 *   exists) and is never written again.
 *
 * Semantics preserved from the pre-fix behavior: at most one governing
 * token per session (issuing a new one supersedes the previous), a valid
 * existing token is reused, and `forceNewToken` always mints. Two racing
 * issuances can each mint; the pointer ends at one of them and the other
 * token simply does not govern — the same last-write-wins outcome the
 * session-record write produced, minus the accounting hazard.
 *
 * A token is returned only after its claim record AND the pointer are
 * persisted; a persistence failure propagates and no token is returned,
 * so callers never send a link the claim route would reject.
 */
export async function getOrCreateClaimToken(
  sessionId: string,
  record: AccountAccessSessionRecord,
  options?: { forceNewToken?: boolean },
): Promise<string> {
  const pointer = await kv.get<ClaimPointerRecord>(claimPointerKey(sessionId));

  const isUsableToken = async (token: string): Promise<boolean> => {
    if (!token) return false;
    const claim = await kv.get<ClaimTokenRecord>(claimKey(token));
    return Boolean(claim && claim.sessionId === sessionId);
  };

  if (!options?.forceNewToken) {
    const hint = record.claimToken?.trim() || "";
    // A caller-held hint is honored only when no governing pointer
    // contradicts it: a stale snapshot must not resurrect a superseded
    // token into a fresh email (the claim route would reject it anyway).
    if (hint && (!pointer?.token || pointer.token === hint) && (await isUsableToken(hint))) {
      if (!pointer?.token) {
        // Adopt the legacy inline token as the governing token. This is a
        // write to the pointer key only — never to the session record.
        // Best-effort: the token itself was persisted when it was issued
        // and still resolves through the claim route's legacy fallback,
        // so an adoption failure must not fail this issuance; the next
        // touch retries the adoption.
        try {
          await kv.setDurable(claimPointerKey(sessionId), {
            schemaVersion: SETTLEMENT_SCHEMA_VERSION,
            sessionId,
            token: hint,
            updatedAt: Date.now(),
          } satisfies ClaimPointerRecord);
        } catch (error) {
          console.warn("Claim pointer adoption write failed (legacy fallback still resolves)", {
            sessionId,
            error,
          });
        }
      }
      return hint;
    }
    if (pointer?.token && (await isUsableToken(pointer.token))) {
      return pointer.token;
    }
  }

  const token = crypto.randomUUID();
  const claim: ClaimTokenRecord = {
    sessionId,
    mapId: record.mapId,
    createdAt: Date.now(),
  };
  await kv.set(claimKey(token), claim, { ex: NEW_CLAIM_TOKEN_TTL_SECONDS });
  await kv.setDurable(claimPointerKey(sessionId), {
    schemaVersion: SETTLEMENT_SCHEMA_VERSION,
    sessionId,
    token,
    updatedAt: Date.now(),
  } satisfies ClaimPointerRecord);
  return token;
}
