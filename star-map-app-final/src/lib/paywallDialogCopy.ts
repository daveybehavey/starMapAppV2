/**
 * Paywall dialog title / footer helpers so print vs digital copy stays intentional.
 */

export function getPaywallDialogTitle(input: {
  activeIntent: "digital" | "print";
  hasPrintOptions: boolean;
  isWeddingGift?: boolean;
  appMode?: boolean;
  digitalTitle: string;
}): string {
  if (input.isWeddingGift && input.activeIntent === "print" && input.hasPrintOptions) {
    return "Complete your wedding gift";
  }
  if (input.appMode) {
    return "Order this map as a print";
  }
  if (input.activeIntent === "print" && input.hasPrintOptions) {
    return "Order your printed star map";
  }
  return input.digitalTitle;
}

/** Subscription cancel note belongs with the subscription option, not one-off print/digital footers. */
export function shouldShowPaywallSubscriptionCancelFooter(input: {
  activeIntent: "digital" | "print";
  appMode?: boolean;
  /** True when the subscription plan card is the focused/selected purchase path. */
  subscriptionSelected?: boolean;
}): boolean {
  if (input.appMode) return false;
  if (input.activeIntent !== "digital") return false;
  return Boolean(input.subscriptionSelected);
}
