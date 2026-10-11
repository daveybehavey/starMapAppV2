/** A checkout-time analytics decision, not Stripe terms-of-service consent.
 * Missing, malformed and historical values never imply permission.
 */
export const PURCHASE_ANALYTICS_GRANTED = "granted-v1";
export const PURCHASE_ANALYTICS_DENIED = "not-granted";

/** @param {unknown} value */
export function hasPurchaseAnalyticsConsent(value) {
  return value === PURCHASE_ANALYTICS_GRANTED;
}

/** @param {unknown} value */
export function normalizePurchaseAnalyticsConsent(value) {
  return hasPurchaseAnalyticsConsent(value) ? PURCHASE_ANALYTICS_GRANTED : PURCHASE_ANALYTICS_DENIED;
}
