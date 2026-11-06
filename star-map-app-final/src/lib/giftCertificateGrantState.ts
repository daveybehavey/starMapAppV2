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
 * authority, and make the KV write conditional on that decision:
 *
 * - `initialize` records the grant's terms in this row the first
 *   time it runs and answers `created: true` to exactly one caller,
 *   ever. Every later caller gets `created: false` and the standing
 *   terms.
 * - Only the `created` caller — or a repair pass that finds the row
 *   still UNCONFIRMED (`publishedAt === null`) — may write the
 *   entitlement record to KV, always with the row's standing terms
 *   and `initializedAt` (so a repair write is byte-identical to the
 *   original). The writer then calls `confirmPublished`.
 * - Once confirmed, NO grant pass ever writes the KV record again,
 *   whatever its local KV read says.
 *
 * Soundness: confirmation happens only after the KV write, and the
 * recipient's delivery credential (the claim token) is minted only
 * after the grant returns — so while `publishedAt === null`, the
 * grant cannot have completed, no credential exists, and no spend is
 * possible; the entitlement record either does not exist yet or
 * still holds exactly the initial terms, which makes the repair
 * write harmless. After confirmation the single grant write is
 * causally before every spend, and later passes write nothing — so
 * no interleaving of grant and spend writes can raise the balance.
 *
 * The DO is the serialization point, not the judge: it orders grant
 * passes against one row. It never touches KV itself.
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
