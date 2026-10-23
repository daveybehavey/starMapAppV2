/**
 * Checkout gift flag — the single source of truth for how a buyer's
 * "This is a gift" indication travels from checkout to the order records
 * the review engine reads (T1, review-engine design §4):
 *
 *   editor checkbox → POST /api/checkout `isGift`
 *     → Stripe session `metadata.is_gift = "true"`
 *     → webhook writers stamp `isGift` on the entitlement + print records
 *     → reviewRequests.ts excludes `isGift === true` from review asks.
 *
 * Stripe metadata is a flat string map (pinned API 2024-06-20 included),
 * so the wire value is the string "true".
 *
 * REVISED (T-T1): the writers now stamp an EXPLICIT boolean — `false` for
 * non-gift orders, not an absent field. The review engine's gift exclusion
 * fails closed: eligibility requires the literal value `false`, so gift
 * provenance must be recorded, not implied. Records written before this
 * change (flag absent) carry no provenance and the engine excludes them
 * as gift-uncertain; there is no blanket historical backfill.
 */
export const CHECKOUT_GIFT_METADATA_KEY = "is_gift";

/** True only when the session metadata carries the explicit gift marker. */
export function isGiftFromSessionMetadata(metadata: Record<string, string> | null | undefined): boolean {
  return metadata?.[CHECKOUT_GIFT_METADATA_KEY] === "true";
}

/**
 * The value the fulfillment writers stamp onto the entitlement and
 * print-order records: an explicit boolean — `true` for gift orders,
 * `false` otherwise — so every record written from now on carries gift
 * provenance the review engine can fail closed on.
 */
export function giftFlagForRecord(metadata: Record<string, string> | null | undefined): boolean {
  return isGiftFromSessionMetadata(metadata);
}
