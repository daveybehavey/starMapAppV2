/**
 * Feature flag for a customer photo / social-proof strip.
 * When disabled (default), the UI must not render fake reviews or placeholder photos.
 * When enabled, render an empty reserved slot until real customer media exists.
 */
export function isCustomerPhotoStripEnabled(): boolean {
  return /^(1|true|yes)$/i.test((process.env.NEXT_PUBLIC_CUSTOMER_PHOTO_STRIP_ENABLED || "").trim());
}
