/**
 * Pure entitlement helpers for account access / download (unit-tested).
 * @typedef {import("./pricing").CheckoutPlan} CheckoutPlan
 * @typedef {import("./pricing").CheckoutOrderType} CheckoutOrderType
 * @typedef {import("./pricing").PrintVariant} PrintVariant
 */

/**
 * @param {{
 *   paid?: boolean;
 *   revoked?: boolean;
 *   plan?: CheckoutPlan;
 *   creditsRemaining?: number;
 *   subscriptionActive?: boolean;
 *   orderType?: CheckoutOrderType;
 *   includesDigitalAddOn?: boolean;
 * }} record
 */
export function hasRecoverableAccess(record) {
  if (record.revoked) return false;
  const isPrintOnly = record.orderType === "print" && !record.includesDigitalAddOn;
  if (isPrintOnly) return false;
  if (record.plan === "subscription") return Boolean(record.subscriptionActive);
  const creditsRemaining =
    typeof record.creditsRemaining === "number" ? record.creditsRemaining : 0;
  return creditsRemaining > 0 || Boolean(record.paid);
}

/**
 * Matches /api/entitlements/claim paid + cookie eligibility.
 * @param {Parameters<typeof hasRecoverableAccess>[0]} record
 */
export function evaluateClaimPaid(record) {
  if (record.revoked) {
    return { paid: false, revoked: true, isPrintOnly: false };
  }
  const subscriptionActive = Boolean(record.subscriptionActive);
  const creditsRemaining = record.creditsRemaining ?? 0;
  const isPrintOnly = record.orderType === "print" && !record.includesDigitalAddOn;
  const paid =
    !isPrintOnly &&
    (record.plan === "subscription"
      ? subscriptionActive
      : creditsRemaining > 0 || Boolean(record.paid));
  return { paid, revoked: false, isPrintOnly };
}

/** RFC-4122 UUID (versions 1–8) used for map ids in KV. */
export function isValidMapId(id) {
  if (typeof id !== "string") return false;
  const trimmed = id.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    trimmed,
  );
}

/** Prefer metadata.map_id; only accept client_reference_id when it is a real map UUID. */
export function resolveCheckoutMapIdFromStripeSession(session) {
  const fromMetadata =
    typeof session?.metadata?.map_id === "string" ? session.metadata.map_id.trim() : "";
  if (isValidMapId(fromMetadata)) return fromMetadata;

  const fromReference =
    typeof session?.client_reference_id === "string" ? session.client_reference_id.trim() : "";
  if (isValidMapId(fromReference)) return fromReference;

  return undefined;
}
