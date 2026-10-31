/**
 * Canonical KV keys, entitlement types, and shared access evaluation.
 */
import { createHash } from "node:crypto";
import type { CheckoutOrderType, CheckoutPlan, PrintVariant } from "@/lib/pricing";
import { PREMIUM_COOKIE_TTL_SECONDS } from "@/lib/premium";
import {
  evaluateClaimPaid as evaluateClaimPaidImpl,
  hasRecoverableAccess as evaluateDigitalAccessImpl,
} from "./accountAccessEntitlements.mjs";
import { isValidMapId as isValidMapIdFromLib } from "./mapId";
import { kv } from "@/lib/kv";

/** Stripe checkout session entitlement (source of truth for digital access). */
export type StripeSessionEntitlement = {
  paid?: boolean;
  /** Option B interim settlement receipt, embedded only on B-era initialization. */
  settlementReceipt?: SettlementReceipt;
  revoked?: boolean;
  revokedAt?: number;
  reason?: string;
  created?: number;
  mapId?: string;
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
  /**
   * Buyer marked the order as a gift at checkout. Review requests are never
   * sent for gift orders. Written by the Stripe webhook from the checkout
   * session's `is_gift` metadata (see checkoutGiftFlag.ts); absent means
   * non-gift, which is also how pre-flag orders read.
   */
  isGift?: boolean;
  claimToken?: string;
  lastConsumeToken?: string;
  lastConsumeRemaining?: number;
  lastConsumeAt?: number;
  lastCompensatedToken?: string;
  accessEmailSentAt?: number;
  accessEmailHadArchive?: boolean;
  accessEmailProvider?: string;
  accessEmailError?: string;
  hdArchiveEmailSentAt?: number;
};

export type ClaimTokenRecord = {
  sessionId: string;
  mapId?: string;
  createdAt: number;
};

/** Newly issued claim tokens use a shorter TTL; existing KV entries are unchanged. */
export const NEW_CLAIM_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 180;

/** Legacy claim tokens and premium cookies remain long-lived. */
export const LEGACY_CLAIM_TOKEN_TTL_SECONDS = PREMIUM_COOKIE_TTL_SECONDS;

/** Refresh map recipe TTL when a paid checkout references map_id. */
export const MAP_RECIPE_ENTITLED_TTL_SECONDS = 60 * 60 * 24 * 365;

export const ENTITLEMENT_KV = {
  stripeSession: (sessionId: string) => `stripe:session:${sessionId}`,
  claim: (token: string) => `claim:${token}`,
  stripePaymentIntent: (piId: string) => `stripe:pi:${piId}`,
  stripeCharge: (chargeId: string) => `stripe:charge:${chargeId}`,
  stripeSubscription: (subId: string) => `stripe:sub:${subId}`,
  stripeWebhookEvent: (eventId: string) => `stripe:event:${eventId}`,
  accessEmailDedupe: (sessionId: string) => `stripe:access_link:email:${sessionId}`,
  hdArchiveEmailDedupe: (sessionId: string) => `stripe:hd_archive:email:${sessionId}`,
  mapRecipe: (mapId: string) => `map:${mapId}`,
  /** Option B settlement evidence (see the settlement section below). */
  settlementIntent: (sessionId: string) => `stripe:settlement:intent:v1:${sessionId}`,
  settlementAdoption: (sessionId: string) => `stripe:settlement:adoption:v1:${sessionId}`,
  sessionRevoked: (sessionId: string) => `stripe:session:revoked:v1:${sessionId}`,
  revocationUnresolved: (sessionId: string) => `stripe:revocation:unresolved:v1:${sessionId}`,
  transferRefused: (sourceSessionId: string, destinationSessionId: string) =>
    `stripe:transfer:refused:v1:${encodeURIComponent(sourceSessionId)}:${encodeURIComponent(destinationSessionId)}`,
  accessEmailResult: (sessionId: string) => `stripe:access-email:result:v1:${sessionId}`,
  recoveryResult: (sessionId: string) => `stripe:recovery:result:v1:${sessionId}`,
  /**
   * HD download email outcomes (S93-1 item 2): one record per variant, so
   * an initial result can never replace an archive-ready result. Both keys
   * deliberately sit OUTSIDE the `stripe:session:` prefix.
   */
  hdInitialEmailResult: (sessionId: string) => `stripe:hd-email:initial-result:v1:${sessionId}`,
  hdArchiveEmailResult: (sessionId: string) => `stripe:hd-email:archive-result:v1:${sessionId}`,
  /**
   * Fix round 4 (G-dot gate, PR #447): settlement metadata completion lives
   * in its own record, NEVER on the session record. The key is deliberately
   * NOT under the `stripe:session:` prefix (the review engine scans that
   * prefix as its entitlement population).
   */
  settlementMetadata: (sessionId: string) => `stripe:session-metadata:v1:${sessionId}`,
  /**
   * Fix round 4: the governing claim token for a session (the token the
   * claim route honors). The session record's inline `claimToken` field is
   * legacy evidence only — nothing writes it any more.
   */
  claimPointer: (sessionId: string) => `stripe:session:claim-pointer:v1:${sessionId}`,
} as const;

export const ENTITLEMENT_R2 = {
  hdArchiveKey: (sessionId: string) => `download-archive/hd/${sessionId}.png`,
} as const;

export function evaluateDigitalAccess(record: StripeSessionEntitlement): boolean {
  return evaluateDigitalAccessImpl(record);
}

/** Alias used by account access / hub routes. */
export const hasRecoverableAccess = evaluateDigitalAccess;

export function evaluateClaimPaid(record: StripeSessionEntitlement) {
  return evaluateClaimPaidImpl(record);
}

export function isValidMapId(id: string): boolean {
  return isValidMapIdFromLib(id);
}

export function isPrintOnlyOrder(record: StripeSessionEntitlement): boolean {
  return record.orderType === "print" && !record.includesDigitalAddOn;
}

/** Premium cookie /api/premium eligibility (revoked + print-only gate). */
export function evaluatePremiumAccess(record: StripeSessionEntitlement | null | undefined): boolean {
  if (!record || record.revoked || isPrintOnlyOrder(record)) return false;
  return evaluateDigitalAccess(record);
}

/** Extend map recipe KV TTL after paid checkout when map_id is present. */
export async function refreshEntitledMapRecipeTtl(mapId: string | undefined | null): Promise<void> {
  const id = typeof mapId === "string" ? mapId.trim() : "";
  if (!id || !isValidMapId(id)) return;
  const recipe = await kv.get<unknown>(ENTITLEMENT_KV.mapRecipe(id));
  if (!recipe) return;
  await kv.set(ENTITLEMENT_KV.mapRecipe(id), recipe, { ex: MAP_RECIPE_ENTITLED_TTL_SECONDS });
}

/**
 * ---------------------------------------------------------------------------
 * Option B interim settlement mitigation (M1-01 / M1-02 / M1-06).
 *
 * Implements the defensible KV-only scope of the S61-1 mapping of the S54-3
 * fix designs, under G-dot's Option B ruling (KV interim mitigation; the DL-1
 * EntitlementAuthority remains the final architecture target). This is a
 * mitigation, NOT closure, and this module claims nothing stronger:
 *
 * - Stop OBSERVED settlement replay from reconstructing balances: when a paid
 *   record (or its embedded settlement receipt) is visible, settlement
 *   performs no accounting write at all. (Fix round, Codex P1 on PR #447:
 *   the sole exception is absent-only metadata completion — see
 *   SETTLEMENT_METADATA_COMPLETION_FIELDS — which fills non-accounting
 *   fields one route's builder omits and the other's carries. Fix round 4,
 *   per the G-dot gate rejection: completion writes ONLY the separate
 *   settlement-metadata sidecar, never the session record — the whole-
 *   record completion put republished stale accounting from its read
 *   snapshot. Consumers merge the sidecar via applySettlementMetadata.)
 * - Adopt already-paid legacy records (paid, no receipt) without touching
 *   their balances or terms; adoption writes separate observation evidence
 *   only, and an adoption-evidence failure never triggers reconstruction.
 * - Ancillary results (access email, expired-checkout recovery) live in
 *   separate records, never in whole-record session replacements.
 * - Revocation gets durable side evidence and retryable incomplete work.
 *
 * RETAINED RESIDUALS (documented, not closed): KV offers no conditional
 * write, transaction, or linearizable read (see lib/kv.ts). A stale absence
 * can still admit initialization over a previously settled record, and the
 * settlement/refund check-then-write race is retained: a refund that lands
 * between the final evidence check and the session put can still be
 * overwritten by that put. No aggregate cross-session exposure bound is
 * demonstrated or claimed.
 *
 * Automatic cross-session carry-forward is DISABLED under B: no A->B credit
 * copying, no debit-first/credit-first transfer, no KV-lock substitute.
 * ---------------------------------------------------------------------------
 */

export const SETTLEMENT_SCHEMA_VERSION = 1;

/** Policy version stamped on interim carry refusals. */
export const CARRY_POLICY_VERSION = "B-interim-1";

/** The single outcome for every automatic cross-session carry request under B. */
export const CARRY_NOT_SUPPORTED_INTERIM = "carry_not_supported_interim" as const;

/** Purchased terms for one checkout session, kept distinct from combined totals. */
export type SettlementPurchaseTerms = {
  plan?: CheckoutPlan | null;
  /** Finite credits purchased by THIS session (0 for subscription / print-only). */
  purchasedCredits: number;
  orderType: CheckoutOrderType;
  printVariant?: PrintVariant | null;
  includesDigitalAddOn: boolean;
  subscription: boolean;
  amountTotal?: number | null;
  currency?: string | null;
  paymentIntentId?: string | null;
  subscriptionId?: string | null;
  customerId?: string | null;
};

export type SettlementReceipt = {
  schemaVersion: number;
  /** Stable purchase identity: one per checkout session, shared by both routes. */
  operationId: string;
  sessionId: string;
  paymentIntentId: string | null;
  purchaseTerms: SettlementPurchaseTerms;
  initializedAt: number;
};

export type SettlementIntentRecord = {
  schemaVersion: number;
  operationId: string;
  sessionId: string;
  paymentIntentId: string | null;
  purchaseTerms: SettlementPurchaseTerms;
  recordedAt: number;
};

export type SettlementAdoptionRecord = {
  schemaVersion: number;
  operationId: string;
  sessionId: string;
  paymentIntentId: string | null;
  observedTerms: {
    plan?: CheckoutPlan | null;
    orderType?: CheckoutOrderType | null;
    includesDigitalAddOn?: boolean;
    subscriptionActive?: boolean;
  };
  observedCreditsTotal?: number;
  observedCreditsRemaining?: number;
  /** sha256 over the observed accounting fields; observation evidence only. */
  accountingFingerprint: string;
  observedRevocation: boolean;
  evidenceKind: "legacy_observation";
  observedAt: number;
};

export type SessionRevocationEvidence = {
  schemaVersion: number;
  sessionId: string;
  revoked: true;
  reason: string;
  paymentIntentId: string | null;
  revokedAt: number;
};

export type RevocationUnresolvedRecord = {
  schemaVersion: number;
  sessionId: string;
  reason: string;
  associationState: "payment_intent_unresolved";
  recordedAt: number;
};

export type TransferRefusalRecord = {
  schemaVersion: number;
  operationId: string;
  sourceSessionId: string;
  destinationSessionId: string;
  outcome: typeof CARRY_NOT_SUPPORTED_INTERIM;
  movedCredits: 0;
  policyVersion: string;
  recordedAt: number;
};

export type AccessEmailResultRecord = {
  schemaVersion: number;
  sessionId: string;
  accessEmailSentAt?: number;
  accessEmailProvider?: string;
  accessEmailError?: string;
  recordedAt: number;
};

/**
 * HD download email outcome (S93-1 item 2). The initial and archive-ready
 * HD emails record their outcomes in these per-variant sidecar records —
 * never by replacing the entitlement session record with a caller-held
 * snapshot (the W2–W4 writer class: a concurrent settlement, consume,
 * debit, or revocation landing after the caller's read was silently
 * overwritten by the bookkeeping put). Allowlisted by construction: the
 * record is built field-by-field from the dispatch result, so no session
 * field and no arbitrary provider field can enter it.
 */
export type HdEmailResultRecord = {
  schemaVersion: number;
  sessionId: string;
  variant: "initial" | "archive_ready";
  provider?: string;
  error?: string;
  /** Provider-confirmed delivery time; absent means not delivered. */
  deliveredAt?: number;
  /** Whether the delivered message carried the archive (direct file) link. */
  includedArchive?: boolean;
  recordedAt: number;
};

/**
 * Settlement metadata completed onto an already-settled record (fix round
 * 4). Holds ONLY the SETTLEMENT_METADATA_COMPLETION_FIELDS values; it is
 * not an accounting record and no balance/terms/revocation state may ever
 * be stored here. Readers merge it over the session record with
 * {@link applySettlementMetadata} (record-present values win).
 */
export type SettlementMetadataRecord = {
  schemaVersion: number;
  sessionId: string;
  customerEmail?: string | null;
  isGift?: boolean;
  printAssetId?: string;
  referralCode?: string;
  referrerSessionId?: string;
  referralOfferVariant?: string;
  recordedAt: number;
  updatedAt: number;
};

/** The governing claim token for a session (fix round 4). */
export type ClaimPointerRecord = {
  schemaVersion: number;
  sessionId: string;
  token: string;
  updatedAt: number;
};

export type RecoveryResultRecord = {
  schemaVersion: number;
  sessionId: string;
  recoveryEmailSentAt?: number;
  recoveryEmailProvider?: string;
  recoveryEmailError?: string;
  recoveryEmailErrorCode?: string;
  recoveryEmailRetryability?: string;
  expiredAt?: number;
  recoveryUrl?: string | null;
  recordedAt: number;
};

export const settlementOperationId = (sessionId: string) => `purchase:v1:${sessionId}`;
export const transferOperationId = (sourceSessionId: string, destinationSessionId: string) =>
  `transfer:v1:${sourceSessionId}:${destinationSessionId}`;

const revokedPaymentIntentKey = (paymentIntentId: string) => `stripe:pi:revoked:${paymentIntentId}`;

export type RevocationEvidenceResult = {
  revoked: boolean;
  reason?: string;
};

/**
 * Read the durable revocation evidence that lives OUTSIDE the session record:
 * the session side record and the payment-intent tombstone. Advisory only —
 * KV reads can be stale or fall through to local fallback, so a negative
 * result never proves no refund happened.
 */
export async function readSessionRevocationEvidence(
  sessionId: string,
  paymentIntentId?: string | null,
): Promise<RevocationEvidenceResult> {
  const side = await kv.get<SessionRevocationEvidence>(ENTITLEMENT_KV.sessionRevoked(sessionId));
  if (side?.revoked) {
    return { revoked: true, reason: side.reason ?? "refund" };
  }
  if (paymentIntentId) {
    const tombstone = await kv.get<{ revoked?: boolean; reason?: string }>(
      revokedPaymentIntentKey(paymentIntentId),
    );
    if (tombstone?.revoked) {
      return { revoked: true, reason: tombstone.reason ?? "refund" };
    }
  }
  return { revoked: false };
}

/**
 * Error-preserving variant of {@link readSessionRevocationEvidence}
 * (S93-1 item 5): the same two evidence sources, read through
 * `kv.getErrorPreserving`, so a read failure THROWS (KvReadError)
 * instead of degrading to local fallback. Decision paths that can grant
 * credits or activate access (referral grant, subscription activation)
 * use this reader: for them, "evidence unreadable" must stay retryable
 * and must never be indistinguishable from "no revocation". The
 * advisory reader above keeps its existing contract for its existing
 * callers — this reader is added alongside, not substituted.
 */
export async function readSessionRevocationEvidenceStrict(
  sessionId: string,
  paymentIntentId?: string | null,
): Promise<RevocationEvidenceResult> {
  const side = await kv.getErrorPreserving<SessionRevocationEvidence>(
    ENTITLEMENT_KV.sessionRevoked(sessionId),
  );
  if (side?.revoked) {
    return { revoked: true, reason: side.reason ?? "refund" };
  }
  if (paymentIntentId) {
    const tombstone = await kv.getErrorPreserving<{ revoked?: boolean; reason?: string }>(
      revokedPaymentIntentKey(paymentIntentId),
    );
    if (tombstone?.revoked) {
      return { revoked: true, reason: tombstone.reason ?? "refund" };
    }
  }
  return { revoked: false };
}

/**
 * Read-only live-entitlement check for a settled session (fix round 3,
 * Codex P2 on PR #447): paid, not revoked — neither the record flag nor
 * the durable revocation evidence — with credits remaining or an active
 * subscription. Verify uses it to decide whether the incoming session's
 * premium cookie must be preserved when a carry into a new purchase is
 * refused: that cookie is the browser's only handle on the entitlement.
 * Advisory in the same sense as readSessionRevocationEvidence — a stale
 * read can misjudge liveness, never balances; nothing is written here.
 */
export async function sessionHoldsLiveEntitlement(sessionId: string): Promise<boolean> {
  const record = await kv.get<StripeSessionEntitlement & { paymentIntentId?: string | null }>(
    ENTITLEMENT_KV.stripeSession(sessionId),
  );
  if (!record?.paid || record.revoked) return false;
  const evidence = await readSessionRevocationEvidence(sessionId, record.paymentIntentId ?? null);
  if (evidence.revoked) return false;
  return (record.creditsRemaining ?? 0) > 0 || record.subscriptionActive === true;
}

/**
 * The ONLY fields a settlement call may complete for an already-settled
 * record (fix round, Codex P1 on PR #447; storage moved to the
 * settlement-metadata sidecar in fix round 4 — completion never writes
 * these onto the session record itself).
 *
 * The two settlement routes build different initial records from the same
 * Stripe session: the webhook's builder carries the checkout metadata
 * below; verify's builder omits it. When verify settles first, the record
 * is born without these fields, and the webhook's later settlement —
 * already_settled, its builder never invoked — could never backfill them:
 * /api/account/access-email then answers 409 missing_customer_email
 * forever, the review engine reads no gift provenance, and referral
 * status/link readers see no attribution.
 *
 * Completion is deliberately narrow:
 * - ONLY these fields, and only when ABSENT on the existing record
 *   (undefined, null, or an empty string — an explicit `isGift: false`
 *   IS a present value: gift provenance the review engine fails closed
 *   without). A present value is never overwritten.
 * - Accounting/access fields are structurally out of reach: paid,
 *   settlementReceipt, creditsTotal/creditsRemaining, subscription
 *   state, revocation fields, purchase terms, and `created` are not on
 *   this list, and the candidate's values for them are never read.
 * - Every allowlisted field is derived from the caller's own Stripe
 *   session (record-external), never from the settlement receipt the
 *   builder is handed, so the placeholder receipt used for legacy
 *   records on this path cannot inject values.
 */
export const SETTLEMENT_METADATA_COMPLETION_FIELDS = [
  "customerEmail",
  "isGift",
  "printAssetId",
  "referralCode",
  "referrerSessionId",
  "referralOfferVariant",
] as const;

export type SettlementMetadataCompletionField =
  (typeof SETTLEMENT_METADATA_COMPLETION_FIELDS)[number];

/** Absence for completion purposes: no usable value is recorded. */
function isSettlementMetadataValuePresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  return true;
}

/**
 * Merge a settlement-metadata sidecar over a session record (fix round 4).
 * Pure: returns the record itself when there is nothing to merge, else a
 * NEW object. Only allowlisted fields are ever taken from the sidecar —
 * a sidecar value for any other key is ignored by construction — and a
 * value PRESENT on the record always wins over the sidecar. This is the
 * single read path by which completed metadata reaches consumers; the
 * session record itself is never rewritten with completed values.
 */
export function applySettlementMetadata<T extends StripeSessionEntitlement>(
  record: T,
  metadata: SettlementMetadataRecord | null | undefined,
): T {
  if (!metadata) return record;
  const recordFields = record as unknown as Record<string, unknown>;
  const metadataFields = metadata as unknown as Record<string, unknown>;
  let merged: Record<string, unknown> | null = null;
  for (const field of SETTLEMENT_METADATA_COMPLETION_FIELDS) {
    if (isSettlementMetadataValuePresent(recordFields[field])) continue;
    const value = metadataFields[field];
    if (!isSettlementMetadataValuePresent(value)) continue;
    if (!merged) merged = { ...recordFields };
    merged[field] = value;
  }
  return (merged ?? recordFields) as T;
}

/** Read the settlement-metadata sidecar for a session, if one exists. */
export async function readSettlementMetadata(
  sessionId: string,
): Promise<SettlementMetadataRecord | null> {
  return kv.get<SettlementMetadataRecord>(ENTITLEMENT_KV.settlementMetadata(sessionId));
}

/**
 * Load the merged consumer view of a session record: the record with its
 * completed settlement metadata applied. Read-only — performs no write.
 * Consumers that need the six completion fields (customer email, gift
 * provenance, print asset, referral attribution) must read through this
 * (or applySettlementMetadata) rather than the raw record.
 */
export async function withSettlementMetadata<T extends StripeSessionEntitlement>(
  sessionId: string,
  record: T,
): Promise<T> {
  return applySettlementMetadata(record, await readSettlementMetadata(sessionId));
}

export type SettlementOutcome<T extends StripeSessionEntitlement = StripeSessionEntitlement> =
  | { kind: "initialized"; record: T }
  | {
      kind: "already_settled";
      record: T;
      /** Allowlisted metadata fields this call filled in (usually empty). */
      completedMetadataFields: readonly SettlementMetadataCompletionField[];
    }
  | { kind: "revoked"; reason: string; sessionWasWritten: boolean }
  | { kind: "reconciliation_required"; detail: string }
  | { kind: "persistence_ambiguous"; detail: string };

function purchaseTermsConflict(
  receipt: SettlementReceipt,
  terms: SettlementPurchaseTerms,
  paymentIntentId: string | null,
): boolean {
  const prior = receipt.purchaseTerms;
  if (
    receipt.paymentIntentId &&
    paymentIntentId &&
    receipt.paymentIntentId !== paymentIntentId
  ) {
    return true;
  }
  return (
    prior.purchasedCredits !== terms.purchasedCredits ||
    prior.plan !== terms.plan ||
    prior.orderType !== terms.orderType ||
    prior.includesDigitalAddOn !== terms.includesDigitalAddOn ||
    prior.subscription !== terms.subscription
  );
}

/** Accounting-bearing state that must never be normalized into a fresh purchase. */
function hasBlockingUnpaidState(record: StripeSessionEntitlement): boolean {
  return (
    record.settlementReceipt !== undefined ||
    record.creditsTotal !== undefined ||
    record.creditsRemaining !== undefined ||
    record.lastConsumeToken !== undefined ||
    record.lastConsumeRemaining !== undefined ||
    record.lastCompensatedToken !== undefined ||
    record.claimToken !== undefined ||
    record.subscriptionActive === true ||
    // Delivered recovery evidence on an unpaid record is anomalous next to
    // a settlement; never erase it by normalization. (Recovery fields are
    // carried by route-local record types, hence the structural read.)
    (record as { recoveryEmailSentAt?: number }).recoveryEmailSentAt !== undefined
  );
}

function adoptionFingerprint(record: StripeSessionEntitlement): string {
  const canonical = JSON.stringify({
    creditsTotal: record.creditsTotal ?? null,
    creditsRemaining: record.creditsRemaining ?? null,
    plan: record.plan ?? null,
    subscriptionId: record.subscriptionId ?? null,
    subscriptionActive: record.subscriptionActive ?? null,
    lastConsumeToken: record.lastConsumeToken ?? null,
    lastCompensatedToken: record.lastCompensatedToken ?? null,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Shared settlement policy for the webhook and verify routes (Option B).
 *
 * The caller supplies the purchase terms and a builder for the proposed
 * initial record; the builder runs only when initialization is actually
 * performed and receives the receipt to embed. Ancillary effects (mappings,
 * analytics, email, TTL refresh) stay with the caller and must never replay
 * the grant; this function is the only settlement balance writer.
 *
 * Outcomes:
 * - "initialized": the session record was written exactly once by this call.
 * - "already_settled": a paid record was visible; NO session-record write
 *   happened. The only write this path may perform is metadata completion
 *   (SETTLEMENT_METADATA_COMPLETION_FIELDS) into the separate
 *   settlement-metadata sidecar: allowlisted fields absent on both the
 *   visible record and the sidecar are filled from the caller's own
 *   proposed record; when nothing is missing, no write happens at all.
 *   A completion write is durable and carries the same advisory
 *   revocation checks as the initialization put (before and after); its
 *   failure is "persistence_ambiguous", never a silent success. The
 *   returned record is the merged consumer view (record + sidecar).
 * - "revoked": visible revocation evidence forbids settlement.
 *   `sessionWasWritten` is true only for the retained check-then-write race
 *   (evidence appeared after the put); the caller must suppress any success
 *   response/cookie and converge revocation.
 * - "reconciliation_required": a visible record conflicts with the proposed
 *   settlement or carries accounting state; nothing was written.
 * - "persistence_ambiguous": a durable write failed; the grant may or may
 *   not be visible. Never infer "not applied" — the caller must answer
 *   pending/retryable, never definitive-unpaid and never another purchase.
 */
export async function settleSessionPurchase<T extends StripeSessionEntitlement>(
  input: {
    sessionId: string;
    paymentIntentId: string | null;
    purchaseTerms: SettlementPurchaseTerms;
    buildInitialRecord: (receipt: SettlementReceipt) => T;
  },
): Promise<SettlementOutcome<T>> {
  const { sessionId, paymentIntentId, purchaseTerms } = input;
  const key = ENTITLEMENT_KV.stripeSession(sessionId);
  const existing = await kv.get<T>(key);

  if (existing?.revoked) {
    return { kind: "revoked", reason: existing.reason ?? "revoked", sessionWasWritten: false };
  }
  const evidence = await readSessionRevocationEvidence(sessionId, paymentIntentId);
  if (evidence.revoked) {
    return { kind: "revoked", reason: evidence.reason ?? "refund", sessionWasWritten: false };
  }

  if (existing?.paid) {
    const receipt = existing.settlementReceipt;
    if (receipt && purchaseTermsConflict(receipt, purchaseTerms, paymentIntentId)) {
      return {
        kind: "reconciliation_required",
        detail: "visible settlement receipt conflicts with proposed purchase terms",
      };
    }
    if (!receipt) {
      // Legacy adoption: observe only. A failed evidence write must never
      // trigger session reconstruction, so failures are logged, not thrown.
      const adoption: SettlementAdoptionRecord = {
        schemaVersion: SETTLEMENT_SCHEMA_VERSION,
        operationId: settlementOperationId(sessionId),
        sessionId,
        paymentIntentId: paymentIntentId ?? null,
        observedTerms: {
          plan: existing.plan ?? null,
          orderType: existing.orderType ?? null,
          includesDigitalAddOn: existing.includesDigitalAddOn,
          subscriptionActive: existing.subscriptionActive,
        },
        observedCreditsTotal: existing.creditsTotal,
        observedCreditsRemaining: existing.creditsRemaining,
        accountingFingerprint: adoptionFingerprint(existing),
        observedRevocation: false,
        evidenceKind: "legacy_observation",
        observedAt: Date.now(),
      };
      try {
        await kv.setDurable(ENTITLEMENT_KV.settlementAdoption(sessionId), adoption);
      } catch (error) {
        console.warn("Settlement adoption evidence write failed (observation only)", {
          sessionId,
          error,
        });
      }
    }

    // Metadata completion (fix round, Codex P1 on PR #447; restructured in
    // fix round 4 per the G-dot gate rejection): the visible record may
    // have been initialized by the OTHER route, whose builder omits the
    // allowlisted checkout-metadata fields this caller's builder carries.
    //
    // Round 4 structure: completion NEVER writes the session record. The
    // completed values are stored in the settlement-metadata sidecar
    // (stripe:session-metadata:v1:) and reach consumers through
    // applySettlementMetadata/withSettlementMetadata. The round-1..3 shape
    // — build a merged record from the visible snapshot and put the WHOLE
    // record back — republished whatever accounting state that snapshot
    // happened to hold: a consumption landing after the read was silently
    // restored by the completion put, sequentially, no concurrency needed.
    // A sidecar write cannot touch accounting by construction (different
    // key, allowlist-only payload), however stale the read that produced
    // it. Completion is also self-healing: any field a racing completion
    // lost is simply absent on the next read and is re-completed by the
    // next settlement touch.
    //
    // The builder is invoked with the visible receipt when there is one;
    // for legacy records it receives a placeholder identity — inert,
    // because completion reads only the allowlisted fields, all of which
    // the builders derive from their own Stripe session, and the
    // candidate's settlementReceipt is never copied.
    const candidate = input.buildInitialRecord(
      receipt ?? {
        schemaVersion: SETTLEMENT_SCHEMA_VERSION,
        operationId: settlementOperationId(sessionId),
        sessionId,
        paymentIntentId,
        purchaseTerms,
        initializedAt: 0,
      },
    );
    const existingSidecar = await readSettlementMetadata(sessionId);
    const existingFields = existing as unknown as Record<string, unknown>;
    const sidecarFields = (existingSidecar ?? {}) as Record<string, unknown>;
    const candidateFields = candidate as unknown as Record<string, unknown>;
    const completedMetadataFields: SettlementMetadataCompletionField[] = [];
    const filledValues: Partial<Record<SettlementMetadataCompletionField, unknown>> = {};
    for (const field of SETTLEMENT_METADATA_COMPLETION_FIELDS) {
      if (isSettlementMetadataValuePresent(existingFields[field])) continue;
      if (isSettlementMetadataValuePresent(sidecarFields[field])) continue;
      const value = candidateFields[field];
      if (!isSettlementMetadataValuePresent(value)) continue;
      filledValues[field] = value;
      completedMetadataFields.push(field);
    }
    if (completedMetadataFields.length === 0) {
      // Observed replay with nothing to complete performs no write. The
      // returned record is the merged consumer view (record + sidecar).
      return {
        kind: "already_settled",
        record: applySettlementMetadata(existing, existingSidecar),
        completedMetadataFields,
      };
    }

    // The completion write is ancillary, but it still carries the
    // advisory revocation discipline: completing metadata onto a session
    // whose revocation evidence is already visible is refused, and
    // evidence landing during the write is reported as "revoked". No
    // session write exists on this path any more, so sessionWasWritten
    // is false in both cases.
    const preCompletionEvidence = await readSessionRevocationEvidence(sessionId, paymentIntentId);
    if (preCompletionEvidence.revoked) {
      return {
        kind: "revoked",
        reason: preCompletionEvidence.reason ?? "refund",
        sessionWasWritten: false,
      };
    }
    const now = Date.now();
    const sidecarRecord: SettlementMetadataRecord = {
      schemaVersion: SETTLEMENT_SCHEMA_VERSION,
      sessionId,
      recordedAt: existingSidecar?.recordedAt ?? now,
      updatedAt: now,
    };
    const nextSidecarFields = sidecarRecord as unknown as Record<string, unknown>;
    for (const field of SETTLEMENT_METADATA_COMPLETION_FIELDS) {
      if (isSettlementMetadataValuePresent(sidecarFields[field])) {
        nextSidecarFields[field] = sidecarFields[field];
      }
    }
    for (const field of completedMetadataFields) {
      nextSidecarFields[field] = filledValues[field];
    }
    try {
      await kv.setDurable(ENTITLEMENT_KV.settlementMetadata(sessionId), sidecarRecord);
    } catch (error) {
      console.warn("Settlement metadata completion write failed", { sessionId, error });
      return {
        kind: "persistence_ambiguous",
        detail: "settlement metadata completion write failed; completion visibility unknown",
      };
    }
    const postCompletionEvidence = await readSessionRevocationEvidence(sessionId, paymentIntentId);
    if (postCompletionEvidence.revoked) {
      return {
        kind: "revoked",
        reason: postCompletionEvidence.reason ?? "refund",
        sessionWasWritten: false,
      };
    }
    return {
      kind: "already_settled",
      record: applySettlementMetadata(existing, sidecarRecord),
      completedMetadataFields,
    };
  }

  if (existing && hasBlockingUnpaidState(existing)) {
    return {
      kind: "reconciliation_required",
      detail: "unpaid record carries accounting state; refusing to normalize into a fresh purchase",
    };
  }

  const receipt: SettlementReceipt = {
    schemaVersion: SETTLEMENT_SCHEMA_VERSION,
    operationId: settlementOperationId(sessionId),
    sessionId,
    paymentIntentId,
    purchaseTerms,
    initializedAt: Date.now(),
  };

  const intent: SettlementIntentRecord = {
    schemaVersion: SETTLEMENT_SCHEMA_VERSION,
    operationId: receipt.operationId,
    sessionId,
    paymentIntentId,
    purchaseTerms,
    recordedAt: Date.now(),
  };
  try {
    await kv.setDurable(ENTITLEMENT_KV.settlementIntent(sessionId), intent);
  } catch (error) {
    console.warn("Settlement intent durable write failed", { sessionId, error });
    return {
      kind: "persistence_ambiguous",
      detail: "settlement intent could not be durably recorded",
    };
  }

  // Advisory re-check immediately before the put. This narrows the
  // settlement/refund window; it does NOT close it (retained residual).
  const prePutEvidence = await readSessionRevocationEvidence(sessionId, paymentIntentId);
  if (prePutEvidence.revoked) {
    return { kind: "revoked", reason: prePutEvidence.reason ?? "refund", sessionWasWritten: false };
  }

  const record = input.buildInitialRecord(receipt);
  try {
    await kv.set(key, record);
  } catch (error) {
    console.warn("Settlement session write failed after intent commit", { sessionId, error });
    return {
      kind: "persistence_ambiguous",
      detail: "session initialization write failed after intent commit; grant visibility unknown",
    };
  }

  // Post-write check: may suppress the caller's success response, but cannot
  // undo any exposure already published by the put (retained residual).
  const postWriteEvidence = await readSessionRevocationEvidence(sessionId, paymentIntentId);
  if (postWriteEvidence.revoked) {
    return {
      kind: "revoked",
      reason: postWriteEvidence.reason ?? "refund",
      sessionWasWritten: true,
    };
  }

  return { kind: "initialized", record };
}

/**
 * Record an interim carry refusal. Audit evidence only — the refusal
 * itself performs no balance read and no balance write (zero transfers
 * in, zero transfers out) — but the evidence write is NOT swallowed
 * (S93-1 item 8): a returned record means the durable put resolved, and
 * a persistence failure throws (KvDurableWriteError) so the caller owns
 * the response policy for an unrecorded refusal. The verify route's
 * companion change (catch the failure locally, outside its Stripe
 * catch, and answer 503 pending) is sequenced with the lane that owns
 * that route — until it lands, this propagation is the contract the
 * gate must sequence against.
 */
export async function recordTransferRefusal(input: {
  sourceSessionId: string;
  destinationSessionId: string;
}): Promise<TransferRefusalRecord> {
  const refusal: TransferRefusalRecord = {
    schemaVersion: SETTLEMENT_SCHEMA_VERSION,
    operationId: transferOperationId(input.sourceSessionId, input.destinationSessionId),
    sourceSessionId: input.sourceSessionId,
    destinationSessionId: input.destinationSessionId,
    outcome: CARRY_NOT_SUPPORTED_INTERIM,
    movedCredits: 0,
    policyVersion: CARRY_POLICY_VERSION,
    recordedAt: Date.now(),
  };
  await kv.setDurable(
    ENTITLEMENT_KV.transferRefused(input.sourceSessionId, input.destinationSessionId),
    refusal,
  );
  return refusal;
}
