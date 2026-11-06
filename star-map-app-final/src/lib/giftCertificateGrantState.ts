/**
 * GiftCertificateGrantDO — pure state machine (Tier C review
 * condition 1, 2026-11-06). One instance per gift-certificate
 * ENTITLEMENT session id (`giftcert:{certificateId}`).
 *
 * WHY THIS EXISTS — the cross-isolate grant race. The entitlement a
 * redemption grants lives in KV as one whole record
 * (`stripe:session:{entitlementSessionId}`), and spending rewrites
 * that whole record with a decremented `creditsRemaining`. KV offers
 * no compare-and-swap: `kv.set`/`kv.setDurable` are unconditional
 * puts, and `withSerializedKvUpdate` serializes only within one
 * isolate. The pre-condition-1 grant was "read → if absent, write the
 * initial record" under that in-isolate lock, so two isolates could
 * both observe absence; the losing pass's delayed write then landed
 * AFTER the recipient's first spend and silently restored the spent
 * credit. A deterministic id prevents distinct records — it does not
 * prevent overwriting the same one.
 *
 * THE CLOSURE — decide create-if-absent ONCE, in a serialized
 * authority, and perform the KV write INSIDE that authority's
 * serialized publish operation:
 *
 * - `initialize` records the grant's terms in this row the first
 *   time it runs and answers `created: true` to exactly one caller,
 *   ever. Every later caller gets `created: false` and the standing
 *   terms.
 * - Publication is a single serialized operation (the DO's
 *   `publish`, mirrored by the local fallback under its per-session
 *   lock): initialize → write the entitlement record built from the
 *   STANDING terms (`created` = the recorded `initializedAt`, so a
 *   repair write is byte-identical to the original) → persist
 *   confirmation. The write is issued and awaited inside the
 *   operation; the row's confirmation is persisted only after the
 *   write resolves. No caller ever holds a write authorization
 *   across an await outside the authority.
 * - Once confirmed, NO publish operation ever writes the KV record
 *   again, whatever its local KV read says.
 *
 * Why the write had to move inside (G-dot's return verdict on the
 * first closure): deciding create-if-absent in the authority while
 * leaving the write in the redeem route was NOT sufficient. The
 * winning pass's write could still be outstanding when a second
 * pass — finding the row initialized-but-unconfirmed — repaired,
 * confirmed, and returned; delivery then minted the claim token and
 * a spend settled, and only then did the winner's delayed write
 * land, setting the initial balance a second time. The per-pass
 * argument ("while unconfirmed, no credential exists") did not
 * survive two passes: confirmation by one pass closed the window
 * while another pass's write was still in flight.
 *
 * Soundness of the serialized publish: grant passes are totally
 * ordered by the authority, and a pass's write resolves before its
 * confirmation persists and before the operation returns. The
 * recipient's delivery credential (the claim token) is minted only
 * after a publish operation returns — so at the moment any spend
 * becomes possible, every write the authority has ever authorized
 * has already resolved, and no write is outstanding. A publish
 * operation interrupted before confirmation (isolate/DO failure)
 * leaves the row unconfirmed and the code undelivered; a later
 * operation re-runs the same sequence and its write — the standing
 * terms, byte-identical — lands over a record nobody can spend
 * from yet. After confirmation, later operations write nothing. No
 * interleaving of grant and spend writes can raise the balance.
 *
 * The DO is the serialization point: it orders grant passes against
 * one row AND performs the publication write itself (via its own
 * STAR_MAP_KV binding), so the write is never in a caller's hands.
 */

export type GiftCertificateGrantTerms = {
  certificateId: string;
  tier: string;
  plan: string;
  creditsTotal: number;
};

export type GiftCertificateGrantRecord = GiftCertificateGrantTerms & {
  /** When the winning initialize ran; also the entitlement's `created`. */
  initializedAt: number;
};

export type GiftCertificateGrantRow = {
  entitlementSessionId: string;
  grant: GiftCertificateGrantRecord | null;
  /** Set once the winning/repair pass has written the KV record. */
  publishedAt: number | null;
};

export function createEmptyGiftCertificateGrantRow(
  entitlementSessionId: string,
): GiftCertificateGrantRow {
  return { entitlementSessionId, grant: null, publishedAt: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isValidGiftCertificateGrantRow(
  value: unknown,
): value is GiftCertificateGrantRow {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.entitlementSessionId)) return false;
  if (value.grant === null) {
    // Nothing initialized yet: publication cannot stand.
    return value.publishedAt === null;
  }
  if (!isRecord(value.grant)) return false;
  const grant = value.grant;
  if (!isNonEmptyString(grant.certificateId)) return false;
  if (!isNonEmptyString(grant.tier)) return false;
  if (!isNonEmptyString(grant.plan)) return false;
  if (
    typeof grant.creditsTotal !== "number" ||
    !Number.isInteger(grant.creditsTotal) ||
    grant.creditsTotal <= 0
  ) {
    return false;
  }
  if (!isFiniteTimestamp(grant.initializedAt)) return false;
  if (value.publishedAt !== null && !isFiniteTimestamp(value.publishedAt)) return false;
  return true;
}

export type InitializeGiftCertificateGrantResult = {
  row: GiftCertificateGrantRow;
  changed: boolean;
  /** True only for the single caller that first records the grant. */
  created: boolean;
  /** The standing grant terms (the input's on creation, the recorded ones after). */
  grant: GiftCertificateGrantRecord;
};

/**
 * Create-if-absent for the grant decision. The first caller records
 * its terms and wins; every later caller receives the STANDING terms
 * unchanged — even if it passes different terms, the recorded grant
 * is the only one that may ever be published.
 */
export function initializeGiftCertificateGrant(
  row: GiftCertificateGrantRow,
  input: { terms: GiftCertificateGrantTerms; now: number },
): InitializeGiftCertificateGrantResult {
  if (row.grant) {
    return { row, changed: false, created: false, grant: row.grant };
  }
  const grant: GiftCertificateGrantRecord = { ...input.terms, initializedAt: input.now };
  return {
    row: { ...row, grant },
    changed: true,
    created: true,
    grant,
  };
}

export type ConfirmGiftCertificateGrantResult = {
  row: GiftCertificateGrantRow;
  changed: boolean;
  /** True when the row now stands confirmed (already or by this call). */
  confirmed: boolean;
};

/**
 * Mark the KV publication of the grant. Requires an initialized
 * grant — confirming an empty row is a no-answer (confirmed: false),
 * never a state change, so a confirm can never manufacture the
 * "published" fact ahead of an initialize.
 */
export function confirmGiftCertificateGrantPublished(
  row: GiftCertificateGrantRow,
  input: { now: number },
): ConfirmGiftCertificateGrantResult {
  if (!row.grant) return { row, changed: false, confirmed: false };
  if (row.publishedAt !== null) return { row, changed: false, confirmed: true };
  return {
    row: { ...row, publishedAt: input.now },
    changed: true,
    confirmed: true,
  };
}

/** Whether this row still permits a (repair) publication write. */
export function isGiftCertificateGrantPublicationOpen(row: GiftCertificateGrantRow): boolean {
  return row.grant !== null && row.publishedAt === null;
}

/** The session-shaped entitlement record a certificate grant publishes. */
export type GiftCertificateEntitlementRecord = {
  paid: true;
  created: number;
  revoked: false;
  plan: string;
  creditsRemaining: number;
  creditsTotal: number;
  orderType: "digital";
  isGift: true;
};

/**
 * Build the entitlement record from the grant's STANDING terms —
 * the winner's `initializedAt`, never the publishing pass's clock —
 * so every publication write of a grant is byte-identical.
 */
export function buildGiftCertificateEntitlementRecord(input: {
  plan: string;
  creditsTotal: number;
  initializedAt: number;
}): GiftCertificateEntitlementRecord {
  return {
    paid: true,
    created: input.initializedAt,
    revoked: false,
    plan: input.plan,
    creditsRemaining: input.creditsTotal,
    creditsTotal: input.creditsTotal,
    orderType: "digital",
    isGift: true,
  };
}

/** Outcome of one serialized publish operation. */
export type GiftCertificateGrantPublishResult = {
  /** True when this operation performed the publication write. */
  published: boolean;
  /** True only for the operation that first recorded the grant. */
  created: boolean;
};
