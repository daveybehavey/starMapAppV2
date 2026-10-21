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
 * so the wire value is the string "true". The flag is written only when
 * set: absent metadata / an absent record field reads as non-gift, which
 * is also how every pre-flag order is treated (no backfill).
 */
export const CHECKOUT_GIFT_METADATA_KEY = "is_gift";

/** True only when the session metadata carries the explicit gift marker. */
export function isGiftFromSessionMetadata(
  metadata: Record<string, string> | null | undefined,
): boolean {
  return metadata?.[CHECKOUT_GIFT_METADATA_KEY] === "true";
}

/**
 * The value the fulfillment writers stamp onto the entitlement and
 * print-order records: `true` for gift orders, `undefined` otherwise, so
 * the field stays absent for non-gift orders — matching how those
 * records' other optional flags are written.
 */
export function giftFlagForRecord(
  metadata: Record<string, string> | null | undefined,
): true | undefined {
  return isGiftFromSessionMetadata(metadata) ? true : undefined;
}
