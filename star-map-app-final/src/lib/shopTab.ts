/**
 * Feature-flag the Shop tab + footer link. Set NEXT_PUBLIC_SHOP_TAB_ENABLED=1 (or true/yes) to enable.
 */
export function isShopTabEnabled() {
  return /^(1|true|yes)$/i.test((process.env.NEXT_PUBLIC_SHOP_TAB_ENABLED || "").trim());
}
