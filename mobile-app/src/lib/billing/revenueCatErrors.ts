import Purchases, { type PurchasesError } from "react-native-purchases";

export function isPurchasesError(err: unknown): err is PurchasesError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as PurchasesError).message === "string"
  );
}

export function isRevenueCatPurchaseUserCancelled(err: unknown): boolean {
  if (!isPurchasesError(err)) return false;
  if (err.userCancelled === true) return true;
  return err.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
}

/** User-facing message; avoids leaking internal error strings for unknown failures in production. */
export function formatRevenueCatError(err: unknown, fallback = "Something went wrong. Try again."): string {
  if (isPurchasesError(err)) {
    if (isRevenueCatPurchaseUserCancelled(err)) return "Purchase canceled.";
    return err.message || fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
