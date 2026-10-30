import { isMapCommercePrintEnabled } from "./mapCommerceLinks";
import { isPrintSecondCopyEnabled, isPrintSecondCopyPublicEnabled } from "./pricing";

/**
 * Server-resolved presentation permission for Lever A offer notes
 * (S55-7 merchandising spec). Presentation only — it must never alter
 * checkout authorization or normalization, which stay with the checkout
 * route's own flag + eligibility checks.
 *
 * All three conditions mirror the mechanics the copy describes:
 * - physical checkout is enabled (the public kill switch the
 *   storefront already reads);
 * - the server second-copy flag is on (the checkout route normalizes
 *   the add-on off without it, so advertising the offer then would
 *   promise a choice checkout silently drops);
 * - the public second-copy flag is on (the visibility toggle the
 *   editor / paywall / mobile purchase panels already read).
 *
 * Server-only by construction: `isPrintSecondCopyEnabled` deliberately
 * returns false in the browser, so a client component cannot resolve
 * this for itself — server components resolve it and pass the boolean
 * down as a prop.
 */
export function resolveSecondCopyOfferVisibility(): boolean {
  return (
    isMapCommercePrintEnabled() && isPrintSecondCopyEnabled() && isPrintSecondCopyPublicEnabled()
  );
}
