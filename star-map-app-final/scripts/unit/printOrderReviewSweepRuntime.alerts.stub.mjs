/**
 * The store under test never sends alerts (the scheduled entry point
 * does, and is not exercised here); this stub only satisfies the
 * runtime module's import.
 */
export async function sendPrintOrderReviewPendingAlert() {
  return { delivered: false, provider: "none", error: "not_configured" };
}
