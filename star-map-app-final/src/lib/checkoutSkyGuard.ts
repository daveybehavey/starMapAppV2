/**
 * Server-side guard: refuse checkout when a saved map still has the
 * DEFAULT_RECIPE placeholder sky (latitude and longitude both exactly 0).
 */

export const CHECKOUT_SKY_LOCATION_REQUIRED_CODE = "sky_location_required";

export const CHECKOUT_SKY_LOCATION_REQUIRED_MESSAGE =
  "Please choose the location for your star map before checking out";

export type CheckoutSkyLocation = {
  latitude?: unknown;
  longitude?: unknown;
};

/** True when both coordinates are exactly 0 — the unset DEFAULT_RECIPE placeholder. */
export function isPlaceholderSkyLocation(
  location: CheckoutSkyLocation | null | undefined
): boolean {
  return location?.latitude === 0 && location?.longitude === 0;
}

export type CheckoutSkyGuardResult =
  | { ok: true }
  | {
      ok: false;
      code: typeof CHECKOUT_SKY_LOCATION_REQUIRED_CODE;
      message: string;
    };

/**
 * Evaluate whether a stored map recipe is safe for checkout.
 * Missing records are not handled here — callers assert map existence separately.
 */
export function evaluateCheckoutSkyGuard(
  mapRecord: { location?: CheckoutSkyLocation | null } | null | undefined
): CheckoutSkyGuardResult {
  if (!mapRecord) return { ok: true };
  if (isPlaceholderSkyLocation(mapRecord.location)) {
    return {
      ok: false,
      code: CHECKOUT_SKY_LOCATION_REQUIRED_CODE,
      message: CHECKOUT_SKY_LOCATION_REQUIRED_MESSAGE,
    };
  }
  return { ok: true };
}
